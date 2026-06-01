import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb, RecallMemory, upsertRecallMemory } from './db';

const { redactSecrets } = require('../../../scripts/lib/secret-redactor');

export interface RecallIndexResult {
  indexed_count: number;
  source_counts: Record<string, number>;
  status: 'completed' | 'failed';
  error?: string;
}

interface SourceCandidate {
  type?: string;
  project?: string;
  source?: string;
  confidence?: number;
  priority?: string;
  evidence?: any[];
  proposed_memory?: string;
  summary?: string;
  content?: string;
  recommended_target?: string[];
  timestamp?: string;
  last_seen?: string;
  memory_score?: number;
  status?: string;
  ai_decision?: string;
  reality_alignment?: number;
  distilled_at?: string;
  date?: string;
}

export function buildRecallIndex(rootDir: string): RecallIndexResult {
  const database = getDb();
  const startedAt = new Date().toISOString();
  const run = database.prepare(`
    INSERT INTO recall_index_runs(started_at, status)
    VALUES (?, 'running')
  `).run(startedAt);
  const runId = Number(run.lastInsertRowid);

  const sourceCounts: Record<string, number> = {
    approved_memory: 0,
    candidate: 0,
    consensus: 0,
    raw_log: 0
  };

  try {
    const rejectedFingerprints = loadRejectedFingerprints(rootDir);
    const existingEmbeddings = loadExistingEmbeddings();
    const indexedFingerprints = new Set<string>();
    let indexed = 0;

    database.prepare("DELETE FROM recall_memories_fts").run();
    database.prepare("DELETE FROM recall_memories WHERE source_kind IN ('approved_memory', 'candidate', 'consensus', 'raw_log')").run();

    for (const filePath of listJsonFiles(path.join(rootDir, 'data/memory/approved'))) {
      const items = readJsonArray(filePath);
      items.forEach((item, index) => {
        const memory = candidateToRecallMemory(item, {
          sourceKind: 'approved_memory',
          sourceRef: relativePath(rootDir, filePath),
          index,
          defaultStatus: 'approved'
        });
        restoreExistingEmbedding(memory, existingEmbeddings);
        if (memory && markUnique(memory, indexedFingerprints) && upsertRecallMemory(memory)) {
          indexed++;
          sourceCounts.approved_memory++;
        }
      });
    }

    for (const filePath of listJsonFiles(path.join(rootDir, 'data/memory/candidates'), '.candidates.json')) {
      const json = readJson(filePath);
      const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
      candidates.forEach((item: SourceCandidate, index: number) => {
        if (isRejected(item, rejectedFingerprints)) return;
        const sourceKind = isHighQualityConsensus(item) ? 'consensus' : 'candidate';
        const memory = candidateToRecallMemory(item, {
          sourceKind,
          sourceRef: relativePath(rootDir, filePath),
          index,
          defaultStatus: item.status || 'candidate',
          fallbackDate: extractDateFromFilename(filePath)
        });
        restoreExistingEmbedding(memory, existingEmbeddings);
        if (memory && markUnique(memory, indexedFingerprints) && upsertRecallMemory(memory)) {
          indexed++;
          sourceCounts[sourceKind]++;
        }
      });
    }

    if (indexed === 0) {
      selectRawFallbackRows().forEach((row, index) => {
        const memory = rawLogToRecallMemory(row, index);
        restoreExistingEmbedding(memory, existingEmbeddings);
        if (memory && markUnique(memory, indexedFingerprints) && upsertRecallMemory(memory)) {
          indexed++;
          sourceCounts.raw_log++;
        }
      });
    }

    database.prepare(`
      UPDATE recall_index_runs
      SET finished_at = ?, indexed_count = ?, source_counts_json = ?, status = 'completed'
      WHERE id = ?
    `).run(new Date().toISOString(), indexed, JSON.stringify(sourceCounts), runId);

    return { indexed_count: indexed, source_counts: sourceCounts, status: 'completed' };
  } catch (error: any) {
    database.prepare(`
      UPDATE recall_index_runs
      SET finished_at = ?, source_counts_json = ?, status = 'failed', error = ?
      WHERE id = ?
    `).run(new Date().toISOString(), JSON.stringify(sourceCounts), error.message, runId);

    return { indexed_count: 0, source_counts: sourceCounts, status: 'failed', error: error.message };
  }
}

function loadExistingEmbeddings(): Map<string, Partial<RecallMemory>> {
  const database = getDb();
  const rows = database.prepare(`
    SELECT summary, embedding_json, embedding_provider, embedding_model, embedding_dimension,
           embedding_version, embedding_generated_at, embedding_text_hash, tier, promoted_at,
           last_recalled_at, recall_count, promotion_reason, promotion_score, decay_candidate, decay_reason
    FROM recall_memories
  `).all() as RecallMemory[];
  const embeddings = new Map<string, Partial<RecallMemory>>();
  rows.forEach(row => {
    embeddings.set(fingerprint(row.summary), {
      embedding_json: row.embedding_json,
      embedding_provider: row.embedding_provider,
      embedding_model: row.embedding_model,
      embedding_dimension: row.embedding_dimension,
      embedding_version: row.embedding_version,
      embedding_generated_at: row.embedding_generated_at,
      embedding_text_hash: row.embedding_text_hash,
      tier: row.tier,
      promoted_at: row.promoted_at,
      last_recalled_at: row.last_recalled_at,
      recall_count: row.recall_count,
      promotion_reason: row.promotion_reason,
      promotion_score: row.promotion_score,
      decay_candidate: row.decay_candidate,
      decay_reason: row.decay_reason
    });
  });
  return embeddings;
}

function restoreExistingEmbedding(memory: RecallMemory | null, embeddings: Map<string, Partial<RecallMemory>>): void {
  if (!memory) return;
  const existing = embeddings.get(fingerprint(memory.summary));
  if (!existing) return;
  Object.assign(memory, existing);
}

function markUnique(memory: RecallMemory, seen: Set<string>): boolean {
  const key = fingerprint(memory.summary);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

function listJsonFiles(dirPath: string, suffix = '.json'): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(file => file.endsWith(suffix))
    .map(file => path.join(dirPath, file))
    .filter(file => fs.statSync(file).isFile())
    .sort();
}

function readJson(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function readJsonArray(filePath: string): SourceCandidate[] {
  const json = readJson(filePath);
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.memories)) return json.memories;
  if (Array.isArray(json?.candidates)) return json.candidates;
  return [];
}

function candidateToRecallMemory(item: SourceCandidate, opts: {
  sourceKind: string;
  sourceRef: string;
  index: number;
  defaultStatus: string;
  fallbackDate?: string | null;
}): RecallMemory | null {
  const summary = redact(cleanText(item.proposed_memory || item.summary || item.content || ''));
  if (!summary || summary.length < 8) return null;

  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  const content = redact(cleanText([
    summary,
    evidence.map(e => typeof e === 'string' ? e : JSON.stringify(e)).join('\n')
  ].filter(Boolean).join('\n\n')));
  const timestamp = item.timestamp || item.last_seen || item.distilled_at || dateToTimestamp(opts.fallbackDate) || new Date().toISOString();
  const memoryScore = numeric(item.memory_score) || priorityToScore(item.priority);
  const confidence = numeric(item.confidence) || 70;
  const importance = Math.max(memoryScore, priorityToScore(item.priority));

  return {
    memory_id: stableId(opts.sourceKind, opts.sourceRef, opts.index, summary),
    source_kind: opts.sourceKind,
    source_ref: opts.sourceRef,
    timestamp,
    project: redact(cleanText(item.project || 'General')),
    source: redact(cleanText(item.source || opts.sourceKind)),
    type: redact(cleanText(item.type || 'memory')),
    summary,
    content,
    confidence,
    importance,
    memory_score: memoryScore,
    recency_score: calculateRecencyScore(timestamp),
    priority: item.priority || null,
    status: item.status || item.ai_decision || opts.defaultStatus,
    evidence_json: redact(JSON.stringify(evidence)),
    metadata_json: redact(JSON.stringify({
      recommended_target: item.recommended_target || [],
      ai_decision: item.ai_decision || null,
      reality_alignment: item.reality_alignment || null,
      date: item.date || opts.fallbackDate || null
    }))
  };
}

function loadRejectedFingerprints(rootDir: string): Set<string> {
  const rejected = new Set<string>();
  const rejectedPath = path.join(rootDir, 'data/memory/rejected/rejected_memories.json');
  for (const item of readJsonArray(rejectedPath)) {
    const summary = cleanText(item.proposed_memory || item.summary || item.content || '');
    if (summary) rejected.add(fingerprint(summary));
  }
  return rejected;
}

function isRejected(item: SourceCandidate, rejectedFingerprints: Set<string>): boolean {
  const status = String(item.status || item.ai_decision || '').toLowerCase();
  if (status.includes('reject')) return true;
  const summary = cleanText(item.proposed_memory || item.summary || item.content || '');
  return summary ? rejectedFingerprints.has(fingerprint(summary)) : false;
}

function isHighQualityConsensus(item: SourceCandidate): boolean {
  const status = String(item.status || item.ai_decision || '').toLowerCase();
  if (status.includes('approved') || status === 'approve') return true;
  return (numeric(item.memory_score) || 0) >= 75;
}

function selectRawFallbackRows(): any[] {
  const database = getDb();
  return database.prepare(`
    SELECT *
    FROM raw_logs
    WHERE (
      COALESCE(quality_score, 0) >= 4
      OR lower(COALESCE(memory_priority, '')) IN ('high', 'critical')
    )
    AND length(content) BETWEEN 20 AND 4000
    ORDER BY timestamp DESC
    LIMIT 500
  `).all();
}

function rawLogToRecallMemory(row: any, index: number): RecallMemory | null {
  const summary = summarizeRawContent(row.content || '');
  if (!summary) return null;
  const sourceRef = `raw_logs:${row.id || index}`;
  const priority = row.memory_priority || null;
  const quality = numeric(row.quality_score) || 4;

  return {
    memory_id: stableId('raw_log', sourceRef, index, summary),
    source_kind: 'raw_log',
    source_ref: sourceRef,
    timestamp: row.timestamp || new Date().toISOString(),
    project: redact(cleanText(row.project || 'General')),
    source: redact(cleanText(row.source || 'raw_log')),
    type: redact(cleanText(row.type || 'raw_log')),
    summary,
    content: redact(cleanText(row.content || '').slice(0, 4000)),
    confidence: Math.min(100, quality * 20),
    importance: Math.max(quality * 20, priorityToScore(priority)),
    memory_score: Math.max(quality * 20, priorityToScore(priority)),
    recency_score: calculateRecencyScore(row.timestamp || null),
    priority,
    status: 'raw_fallback',
    evidence_json: JSON.stringify([`raw_logs.id=${row.id}`]),
    metadata_json: redact(JSON.stringify({
      content_hash: row.content_hash || null,
      dedupe_key: row.dedupe_key || null,
      task_id: row.task_id || null,
      role: row.role || null,
      message_index: row.message_index ?? null
    }))
  };
}

function summarizeRawContent(content: string): string {
  const cleaned = redact(cleanText(content));
  if (!cleaned || cleaned.length < 20) return '';
  return cleaned.length > 320 ? `${cleaned.slice(0, 317)}...` : cleaned;
}

function stableId(...parts: Array<string | number>): string {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

function fingerprint(text: string): string {
  return crypto.createHash('sha256').update(cleanText(text).toLowerCase()).digest('hex');
}

function redact(value: string): string {
  return redactSecrets(value);
}

function cleanText(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function numeric(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function priorityToScore(priority?: string | null): number {
  switch (String(priority || '').toLowerCase()) {
    case 'critical': return 100;
    case 'high': return 85;
    case 'medium': return 65;
    case 'low': return 35;
    default: return 50;
  }
}

function calculateRecencyScore(timestamp: string | null): number {
  if (!timestamp) return 0.35;
  const ts = new Date(timestamp).getTime();
  if (!Number.isFinite(ts)) return 0.35;
  const ageDays = Math.max(0, (Date.now() - ts) / 86400000);
  return Math.max(0.05, Math.min(1, Math.exp(-ageDays / 30)));
}

function relativePath(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath);
}

function extractDateFromFilename(filePath: string): string | null {
  const match = path.basename(filePath).match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function dateToTimestamp(date: string | null | undefined): string | null {
  return date ? `${date}T00:00:00.000Z` : null;
}
