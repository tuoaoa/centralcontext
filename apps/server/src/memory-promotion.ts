import { getDb, RecallMemory } from './db';
import { buildRecallEmbeddings } from './recall-embeddings';

const { redactSecrets } = require('../../../scripts/lib/secret-redactor');

export type MemoryTier = 'SHORT_TERM' | 'MID_TERM' | 'LONG_TERM' | 'ARCHIVED';

export interface PromotionCandidate extends RecallMemory {
  promotion_score: number;
  computed_tier: MemoryTier;
  promotion_reason: string;
  decay_candidate: number;
  decay_reason: string | null;
}

export interface PromotionStatus {
  tier_distribution: Record<string, number>;
  promotion_candidates: number;
  long_term_memories: number;
  decay_candidates: number;
  total_memories: number;
}

export function getPromotionStatus(): PromotionStatus {
  refreshDecayCandidates();
  const database = getDb();
  const tiers = database.prepare(`
    SELECT COALESCE(tier, 'MID_TERM') as tier, COUNT(*) as count
    FROM recall_memories
    GROUP BY COALESCE(tier, 'MID_TERM')
  `).all() as { tier: string; count: number }[];
  const tierDistribution: Record<string, number> = {};
  tiers.forEach(row => { tierDistribution[row.tier] = row.count; });

  const total = database.prepare('SELECT COUNT(*) as count FROM recall_memories').get() as { count: number };
  const candidates = getPromotionCandidates().filter(memory => memory.computed_tier === 'LONG_TERM').length;
  const longTerm = database.prepare("SELECT COUNT(*) as count FROM recall_memories WHERE tier = 'LONG_TERM'").get() as { count: number };
  const decay = database.prepare("SELECT COUNT(*) as count FROM recall_memories WHERE decay_candidate = 1").get() as { count: number };

  return {
    tier_distribution: tierDistribution,
    promotion_candidates: candidates,
    long_term_memories: longTerm.count,
    decay_candidates: decay.count,
    total_memories: total.count
  };
}

export function getPromotionCandidates(): PromotionCandidate[] {
  refreshDecayCandidates();
  const database = getDb();
  const rows = database.prepare(`
    SELECT *
    FROM recall_memories
    WHERE COALESCE(tier, 'MID_TERM') != 'ARCHIVED'
    ORDER BY COALESCE(promotion_score, 0) DESC, COALESCE(recall_count, 0) DESC, updated_at DESC
    LIMIT 100
  `).all() as RecallMemory[];

  return rows.map(toPromotionCandidate)
    .sort((a, b) => b.promotion_score - a.promotion_score);
}

export function promoteMemory(memoryId: string, explicitReason?: string): PromotionCandidate {
  const database = getDb();
  const memory = getMemory(memoryId);
  if (!memory) throw new Error(`Memory not found: ${memoryId}`);
  const candidate = toPromotionCandidate(memory);
  const previousTier = memory.tier || 'MID_TERM';
  const reason = redactSecrets(explicitReason || candidate.promotion_reason);
  const now = new Date().toISOString();

  const tx = database.transaction(() => {
    database.prepare(`
      UPDATE recall_memories
      SET tier = 'LONG_TERM',
          promoted_at = ?,
          promotion_score = ?,
          promotion_reason = ?,
          decay_candidate = 0,
          decay_reason = NULL,
          summary = ?,
          content = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE memory_id = ?
    `).run(
      now,
      candidate.promotion_score,
      reason,
      redactSecrets(memory.summary),
      redactSecrets(memory.content || ''),
      memoryId
    );
    refreshFts(memoryId, testFaultsEnabled() && reason === '__TEST_FAIL_FTS__');
    recordPromotionRun('promote', memoryId, previousTier, 'LONG_TERM', candidate.promotion_score, reason);
  });
  tx();

  const promoted = getMemory(memoryId);
  return toPromotionCandidate(promoted || memory);
}

export function archiveMemory(memoryId: string, explicitReason?: string): PromotionCandidate {
  const database = getDb();
  const memory = getMemory(memoryId);
  if (!memory) throw new Error(`Memory not found: ${memoryId}`);
  const previousTier = memory.tier || 'MID_TERM';
  const reason = redactSecrets(explicitReason || 'Archived by review.');

  const tx = database.transaction(() => {
    database.prepare(`
      UPDATE recall_memories
      SET tier = 'ARCHIVED',
          decay_candidate = 0,
          decay_reason = NULL,
          promotion_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE memory_id = ?
    `).run(reason, memoryId);
    refreshFts(memoryId);
    if (testFaultsEnabled() && reason === '__TEST_FAIL_AUDIT__') {
      throw new Error('Injected archive audit failure');
    }
    recordPromotionRun('archive', memoryId, previousTier, 'ARCHIVED', memory.promotion_score || 0, reason);
  });
  tx();

  const archived = getMemory(memoryId);
  return toPromotionCandidate(archived || memory);
}

export async function promoteMemoryAndEmbed(memoryId: string, reason?: string): Promise<PromotionCandidate> {
  const promoted = promoteMemory(memoryId, reason);
  await buildRecallEmbeddings({ limit: 10 });
  return promoted;
}

export function refreshDecayCandidates(): void {
  const database = getDb();
  const rows = database.prepare(`
    SELECT *
    FROM recall_memories
    WHERE COALESCE(tier, 'MID_TERM') != 'ARCHIVED'
  `).all() as RecallMemory[];

  const stmt = database.prepare(`
    UPDATE recall_memories
    SET decay_candidate = ?,
        decay_reason = ?,
        promotion_score = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE memory_id = ?
  `);

  const tx = database.transaction((items: RecallMemory[]) => {
    items.forEach(memory => {
      const scored = toPromotionCandidate(memory);
      stmt.run(scored.decay_candidate, scored.decay_reason, scored.promotion_score, memory.memory_id);
    });
  });
  tx(rows);
}

export function calculatePromotionScore(memory: RecallMemory): { score: number; reason: string; computed_tier: MemoryTier } {
  const confidence = normalize(memory.confidence || memory.memory_score || 0);
  const importance = normalize(memory.importance || memory.memory_score || priorityScore(memory.priority || null));
  const approval = approvalScore(memory);
  const recall = Math.min(1, (memory.recall_count || 0) / 10);
  const project = memory.project && memory.project !== 'General' ? 0.8 : 0.35;
  const reality = realityScore(memory);
  const score = (confidence * 0.30) + (importance * 0.25) + (approval * 0.15) + (recall * 0.10) + (project * 0.10) + (reality * 0.10);
  const normalizedScore = Math.round(score * 100);
  const computedTier: MemoryTier = normalizedScore >= 65 ? 'LONG_TERM' : normalizedScore >= 45 ? 'MID_TERM' : 'SHORT_TERM';
  const reason = [
    `confidence ${Math.round(confidence * 100)}`,
    `importance ${Math.round(importance * 100)}`,
    approval > 0.8 ? 'approved signal' : 'unapproved signal',
    `recalled ${memory.recall_count || 0} times`,
    `project relevance ${Math.round(project * 100)}`,
    `reality score ${Math.round(reality * 100)}`
  ].join(' + ');
  return { score: normalizedScore, reason, computed_tier: computedTier };
}

function toPromotionCandidate(memory: RecallMemory): PromotionCandidate {
  const scoring = calculatePromotionScore(memory);
  const decay = calculateDecay(memory, scoring.score);
  return {
    ...memory,
    summary: redactSecrets(memory.summary),
    content: memory.content ? redactSecrets(memory.content) : memory.content,
    promotion_score: scoring.score,
    computed_tier: scoring.computed_tier,
    promotion_reason: memory.promotion_reason || scoring.reason,
    decay_candidate: decay.decay_candidate,
    decay_reason: decay.decay_reason
  };
}

function calculateDecay(memory: RecallMemory, score: number): { decay_candidate: number; decay_reason: string | null } {
  if (memory.tier === 'ARCHIVED') return { decay_candidate: 0, decay_reason: null };
  const ageDays = ageInDays(memory.timestamp || null);
  const lastRecallAgeDays = memory.last_recalled_at ? ageInDays(memory.last_recalled_at) : 999;
  const recallCount = memory.recall_count || 0;
  const importance = normalize(memory.importance || memory.memory_score || 0);
  const confidence = normalize(memory.confidence || memory.memory_score || 0);
  const tier = String(memory.tier || 'MID_TERM').toUpperCase();

  if ((tier === 'MID_TERM' || tier === 'SHORT_TERM') && lastRecallAgeDays > 30 && score < 60) {
    return { decay_candidate: 1, decay_reason: `not recalled in ${Math.round(lastRecallAgeDays)} days and promotion score ${score} < 60` };
  }
  if (importance < 0.35 && confidence < 0.45 && lastRecallAgeDays > 30) {
    return { decay_candidate: 1, decay_reason: `low importance ${Math.round(importance * 100)}, low confidence ${Math.round(confidence * 100)}, and stale recall` };
  }
  if (tier === 'LONG_TERM' && lastRecallAgeDays > 90 && score < 70) {
    return { decay_candidate: 1, decay_reason: `LONG_TERM memory not recalled in ${Math.round(lastRecallAgeDays)} days and promotion score ${score} < 70` };
  }
  if (ageDays > 90 && recallCount <= 1 && score < 50) {
    return { decay_candidate: 1, decay_reason: `stale ${Math.round(ageDays)} days with low recall count ${recallCount} and score ${score}` };
  }
  return { decay_candidate: 0, decay_reason: null };
}

function getMemory(memoryId: string): RecallMemory | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM recall_memories WHERE memory_id = ?').get(memoryId) as RecallMemory | undefined;
  return row || null;
}

function recordPromotionRun(action: string, memoryId: string, previousTier: string, nextTier: string, score: number, reason: string): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO memory_promotion_runs(action, memory_id, previous_tier, next_tier, promotion_score, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(action, memoryId, previousTier, nextTier, score, reason);
}

function refreshFts(memoryId: string, failAfterDelete = false): void {
  const database = getDb();
  const memory = getMemory(memoryId);
  if (!memory) return;
  database.prepare('DELETE FROM recall_memories_fts WHERE memory_id = ?').run(memoryId);
  if (failAfterDelete) {
    throw new Error('Injected FTS refresh failure');
  }
  database.prepare(`
    INSERT INTO recall_memories_fts(memory_id, summary, content, project, source, type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    memoryId,
    redactSecrets(memory.summary),
    redactSecrets(memory.content || ''),
    memory.project || '',
    memory.source || '',
    memory.type || ''
  );
}

function approvalScore(memory: RecallMemory): number {
  const status = String(memory.status || '').toLowerCase();
  if (memory.source_kind === 'approved_memory') return 1;
  if (status.includes('founder') && status.includes('approved')) return 1;
  if (status.includes('approved') || status === 'approve') return 0.9;
  if (status.includes('review')) return 0.55;
  return 0.25;
}

function realityScore(memory: RecallMemory): number {
  try {
    const metadata = memory.metadata_json ? JSON.parse(memory.metadata_json) : {};
    const value = Number(metadata.reality_alignment || metadata.reality_score || 0);
    if (Number.isFinite(value) && value > 0) return value > 1 ? Math.min(1, value / 100) : Math.min(1, value);
  } catch (error) {}
  return 0.5;
}

function normalize(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value > 1 ? Math.max(0, Math.min(1, value / 100)) : Math.max(0, Math.min(1, value));
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

function ageInDays(timestamp: string | null): number {
  if (!timestamp) return 999;
  const ts = new Date(timestamp).getTime();
  if (!Number.isFinite(ts)) return 999;
  return Math.max(0, (Date.now() - ts) / 86400000);
}

function testFaultsEnabled(): boolean {
  return process.env.CENTRALCONTEXT_TEST_FAULTS === '1';
}
