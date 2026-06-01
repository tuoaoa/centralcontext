import crypto from 'crypto';
import {
  RecallMemory,
  createRecallEmbeddingRun,
  finishRecallEmbeddingRun,
  getEmbeddedRecallMemories,
  getRecallMemoriesForEmbedding,
  markRecallMemoriesRecalled,
  searchRecallMemories,
  tierMultiplierFor,
  updateRecallMemoryEmbedding
} from './db';

const { redactSecrets } = require('../../../scripts/lib/secret-redactor');

export const RECALL_EMBEDDING_PROVIDER = 'local_transformers';
export const RECALL_EMBEDDING_MODEL = process.env.RECALL_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
export const RECALL_EMBEDDING_VERSION = process.env.RECALL_EMBEDDING_VERSION || `${RECALL_EMBEDDING_MODEL}:mean-normalize:v1`;

type EmbedTextFn = (text: string) => Promise<number[]>;

let cachedEmbedder: EmbedTextFn | null = null;
let cachedDimension: number | null = null;

export interface RecallEmbeddingResult {
  embedded_count: number;
  skipped_count: number;
  failed_count: number;
  provider: string;
  model: string;
  version: string;
  dimension: number;
  status: 'completed' | 'failed';
  error?: string;
}

export interface HybridRecallResult {
  memory_id: string;
  fts_score: number;
  semantic_score: number;
  hybrid_score: number;
  project_score: number;
  recency_score: number;
  importance_score: number;
  tier?: string | null;
  tier_multiplier: number;
  source: string;
  raw_source?: string | null;
  timestamp?: string | null;
  project?: string | null;
  memory_summary: string;
  why_selected: string[];
  type?: string | null;
  source_ref?: string | null;
}

export async function buildRecallEmbeddings(options: {
  limit?: number;
  embedText?: EmbedTextFn;
} = {}): Promise<RecallEmbeddingResult> {
  const embedText = options.embedText || await getLocalEmbedder();
  const dimension = cachedDimension || await inferDimension(embedText);
  const runId = createRecallEmbeddingRun(RECALL_EMBEDDING_PROVIDER, RECALL_EMBEDDING_MODEL, dimension, RECALL_EMBEDDING_VERSION);
  const memories = getRecallMemoriesForEmbedding(RECALL_EMBEDDING_VERSION, options.limit || 1000);

  let embedded = 0;
  let skipped = 0;
  let failed = 0;

  try {
    for (const memory of memories) {
      const embeddingText = buildEmbeddingText(memory);
      if (!embeddingText) {
        skipped++;
        continue;
      }

      try {
        const vector = normalizeVector(await embedText(embeddingText));
        if (!vector.length) {
          failed++;
          continue;
        }

        updateRecallMemoryEmbedding(memory.memory_id, vector, {
          provider: RECALL_EMBEDDING_PROVIDER,
          model: RECALL_EMBEDDING_MODEL,
          dimension: vector.length,
          version: RECALL_EMBEDDING_VERSION,
          text_hash: hashText(embeddingText)
        });
        embedded++;
      } catch (error) {
        failed++;
      }
    }

    finishRecallEmbeddingRun(runId, {
      embedded_count: embedded,
      skipped_count: skipped,
      failed_count: failed,
      status: failed > 0 && embedded === 0 ? 'failed' : 'completed',
      error: failed > 0 && embedded === 0 ? 'All embedding attempts failed' : null
    });

    return {
      embedded_count: embedded,
      skipped_count: skipped,
      failed_count: failed,
      provider: RECALL_EMBEDDING_PROVIDER,
      model: RECALL_EMBEDDING_MODEL,
      version: RECALL_EMBEDDING_VERSION,
      dimension,
      status: failed > 0 && embedded === 0 ? 'failed' : 'completed'
    };
  } catch (error: any) {
    finishRecallEmbeddingRun(runId, {
      embedded_count: embedded,
      skipped_count: skipped,
      failed_count: failed,
      status: 'failed',
      error: error.message
    });

    return {
      embedded_count: embedded,
      skipped_count: skipped,
      failed_count: failed,
      provider: RECALL_EMBEDDING_PROVIDER,
      model: RECALL_EMBEDDING_MODEL,
      version: RECALL_EMBEDDING_VERSION,
      dimension,
      status: 'failed',
      error: error.message
    };
  }
}

export async function hybridRecallSearch(query: string, options: {
  project?: string;
  limit?: number;
  source_kind?: string;
  tier?: string;
  include_archived?: boolean;
  trackRecalls?: boolean;
  embedText?: EmbedTextFn;
} = {}): Promise<HybridRecallResult[]> {
  const limit = Math.min(Math.max(options.limit || 10, 1), 50);
  const ftsResults = searchRecallMemories(query, {
    project: options.project,
    source_kind: options.source_kind,
    tier: options.tier,
    include_archived: options.include_archived,
    limit: Math.max(limit * 3, 25)
  });
  const ftsById = new Map(ftsResults.map(result => [result.memory_id, result]));
  const candidates = new Map<string, RecallMemory>();
  ftsResults.forEach(result => candidates.set(result.memory_id, result));

  let queryVector: number[] | null = null;
  const semanticScores = new Map<string, number>();
  const embeddedMemories = getEmbeddedRecallMemories(RECALL_EMBEDDING_VERSION)
    .filter(memory => !options.source_kind || memory.source_kind === options.source_kind)
    .filter(memory => !options.project || String(memory.project || '').toLowerCase() === options.project.toLowerCase())
    .filter(memory => !options.tier || String(memory.tier || 'MID_TERM').toUpperCase() === options.tier!.toUpperCase())
    .filter(memory => options.include_archived || String(memory.tier || 'MID_TERM').toUpperCase() !== 'ARCHIVED');
  try {
    if (embeddedMemories.length > 0) {
      const embedText = options.embedText || await getLocalEmbedder();
      queryVector = normalizeVector(await embedText(redactSecrets(query)));
    }
  } catch (error) {
    queryVector = null;
  }

  if (queryVector && queryVector.length) {
    for (const memory of embeddedMemories) {
      const vector = parseEmbedding(memory.embedding_json || '');
      if (!vector.length) continue;
      const similarity = cosineSimilarity(queryVector, vector);
      if (similarity < 0.25) continue;
      semanticScores.set(memory.memory_id, similarity);
      candidates.set(memory.memory_id, memory);
    }
  }

  const results = Array.from(candidates.values())
    .map(memory => scoreHybridResult(memory, query, ftsById.get(memory.memory_id)?.fts_score || 0, semanticScores.get(memory.memory_id) || 0, options.project))
    .sort((a, b) => b.hybrid_score - a.hybrid_score)
    .slice(0, limit);
  if (options.trackRecalls) {
    markRecallMemoriesRecalled(results
      .filter(result => String(result.tier || 'MID_TERM').toUpperCase() !== 'ARCHIVED')
      .map(result => result.memory_id));
  }
  return results;
}

export function buildEmbeddingText(memory: RecallMemory): string {
  return redactSecrets([
    memory.summary,
    memory.content,
    memory.project ? `Project: ${memory.project}` : '',
    memory.type ? `Type: ${memory.type}` : ''
  ].filter(Boolean).join('\n')).trim();
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return Math.max(0, Math.min(1, dot / (Math.sqrt(normA) * Math.sqrt(normB))));
}

export function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vector;
  return vector.map(value => value / norm);
}

function scoreHybridResult(memory: RecallMemory, query: string, ftsScore: number, semanticScore: number, requestedProject?: string): HybridRecallResult {
  const projectScore = requestedProject
    ? (String(memory.project || '').toLowerCase() === requestedProject.toLowerCase() ? 1 : 0)
    : inferProjectScore(memory, query);
  const recencyScore = normalizeScore(memory.recency_score || calculateRecencyScore(memory.timestamp || null));
  const importanceScore = normalizeScore(memory.importance || memory.memory_score || priorityScore(memory.priority || null));
  const tierMultiplier = tierMultiplierFor(memory.tier || null);
  const tieredFtsForScore = ftsScore * tierMultiplier;
  const tieredSemanticForScore = semanticScore * tierMultiplier;
  const hybridScore = Math.max(0, Math.min(1, (tieredFtsForScore * 0.60) + (tieredSemanticForScore * 0.25) + (projectScore * 0.05) + (recencyScore * 0.05) + (importanceScore * 0.05)));

  return {
    memory_id: memory.memory_id,
    fts_score: Number(ftsScore.toFixed(4)),
    semantic_score: Number(semanticScore.toFixed(4)),
    hybrid_score: Number(hybridScore.toFixed(4)),
    project_score: Number(projectScore.toFixed(4)),
    recency_score: Number(recencyScore.toFixed(4)),
    importance_score: Number(importanceScore.toFixed(4)),
    tier: memory.tier || 'MID_TERM',
    tier_multiplier: Number(tierMultiplier.toFixed(2)),
    source: memory.source_kind,
    raw_source: memory.source,
    timestamp: memory.timestamp,
    project: memory.project,
    memory_summary: redactSecrets(memory.summary),
    why_selected: buildWhySelected(memory, query, ftsScore, semanticScore, projectScore, importanceScore, tierMultiplier),
    type: memory.type,
    source_ref: memory.source_ref
  };
}

function buildWhySelected(memory: RecallMemory, query: string, ftsScore: number, semanticScore: number, projectScore: number, importanceScore: number, tierMultiplier: number): string[] {
  const reasons: string[] = [];
  if (ftsScore >= 0.75) reasons.push(`exact keyword match: ${query}`);
  else if (ftsScore > 0) reasons.push(`keyword match: ${query}`);
  if (semanticScore > 0) reasons.push(`semantic similarity: ${semanticScore.toFixed(2)}`);
  if (projectScore >= 1 && memory.project) reasons.push(`same project: ${memory.project}`);
  else if (memory.project) reasons.push(`project context: ${memory.project}`);
  reasons.push(`importance score: ${importanceScore.toFixed(2)}`);
  reasons.push(`tier ${memory.tier || 'MID_TERM'}: x${tierMultiplier.toFixed(2)}`);
  if (memory.source_kind) reasons.push(`source: ${memory.source_kind}`);
  return reasons.slice(0, 6);
}

async function getLocalEmbedder(): Promise<EmbedTextFn> {
  if (cachedEmbedder) return cachedEmbedder;

  const transformers = await import('@xenova/transformers');
  const extractor = await transformers.pipeline('feature-extraction', RECALL_EMBEDDING_MODEL);

  cachedEmbedder = async (text: string) => {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data as Float32Array | number[]).map(Number);
    cachedDimension = vector.length;
    return vector;
  };

  return cachedEmbedder;
}

async function inferDimension(embedText: EmbedTextFn): Promise<number> {
  if (cachedDimension) return cachedDimension;
  const probe = await embedText('centralcontext recall embedding probe');
  cachedDimension = probe.length;
  return cachedDimension;
}

function parseEmbedding(value: string): number[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch (error) {
    return [];
  }
}

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function inferProjectScore(memory: RecallMemory, query: string): number {
  const project = String(memory.project || '').toLowerCase();
  if (!project) return 0.5;
  return query.toLowerCase().includes(project) ? 1 : 0.5;
}

function calculateRecencyScore(timestamp: string | null): number {
  if (!timestamp) return 0.35;
  const ts = new Date(timestamp).getTime();
  if (!Number.isFinite(ts)) return 0.35;
  const ageDays = Math.max(0, (Date.now() - ts) / 86400000);
  return Math.max(0.05, Math.min(1, Math.exp(-ageDays / 30)));
}

function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return Math.max(0, Math.min(1, value / 100));
  return Math.max(0, Math.min(1, value));
}

function priorityScore(priority: string | null): number {
  switch ((priority || '').toLowerCase()) {
    case 'critical': return 100;
    case 'high': return 85;
    case 'medium': return 65;
    case 'low': return 35;
    default: return 50;
  }
}
