#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' });
process.env.CENTRALCONTEXT_TEST_FAULTS = '1';
require(path.join(repoRoot, 'apps/server/node_modules/ts-node/register/transpile-only'));

const { initDb, upsertRecallMemory, getDb, searchRecallMemories } = require('../apps/server/src/db');
const { hybridRecallSearch } = require('../apps/server/src/recall-embeddings');
const {
  archiveMemory,
  calculatePromotionScore,
  getPromotionCandidates,
  getPromotionStatus,
  promoteMemory,
  refreshDecayCandidates
} = require('../apps/server/src/memory-promotion');
const { containsSecrets } = require('./lib/secret-redactor');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'centralcontext-promotion-'));
  const dbPath = path.join(tmpRoot, 'data/test-promotion.db');
  initDb(dbPath);

  const now = new Date().toISOString();
  const old = new Date(Date.now() - 90 * 86400000).toISOString();
  const staleRecall = new Date(Date.now() - 45 * 86400000).toISOString();

  upsertRecallMemory(memory(now, {
    memory_id: 'high',
    summary: 'High confidence Cline dedupe candidate should become long term memory.',
    confidence: 94,
    importance: 90,
    status: 'review_approved',
    recall_count: 7,
    timestamp: now
  }));

  upsertRecallMemory(memory(now, {
    memory_id: 'stale',
    summary: 'Low value stale memory should become a decay candidate.',
    confidence: 20,
    importance: 20,
    timestamp: old
  }));

  upsertRecallMemory(memory(now, {
    memory_id: 'stale_recalled',
    summary: 'Previously recalled memory can still become a decay candidate when stale.',
    confidence: 40,
    importance: 30,
    recall_count: 8,
    last_recalled_at: staleRecall,
    tier: 'MID_TERM',
    timestamp: old
  }));

  upsertRecallMemory(memory(now, {
    memory_id: 'mid_same',
    summary: 'Same content tier ranking proof memory.',
    confidence: 80,
    importance: 80,
    tier: 'MID_TERM',
    timestamp: now
  }));

  upsertRecallMemory(memory(now, {
    memory_id: 'long_same',
    summary: 'Same content tier ranking proof memory.',
    confidence: 80,
    importance: 80,
    tier: 'LONG_TERM',
    timestamp: now
  }));

  upsertRecallMemory(memory(now, {
    memory_id: 'archived_same',
    summary: 'Archived quarantine vault memory.',
    confidence: 100,
    importance: 100,
    tier: 'ARCHIVED',
    timestamp: now
  }));

  upsertRecallMemory(memory(now, {
    memory_id: 'short_relevant',
    summary: 'Alpha beta gamma delta exact operational recall target.',
    confidence: 80,
    importance: 80,
    tier: 'SHORT_TERM',
    timestamp: now
  }));

  upsertRecallMemory(memory(now, {
    memory_id: 'long_weak',
    summary: 'Alpha weak unrelated long term note.',
    confidence: 80,
    importance: 80,
    tier: 'LONG_TERM',
    timestamp: now
  }));

  upsertRecallMemory(memory(now, {
    memory_id: 'secret',
    summary: 'Secret-bearing memory sk-or-v1-test AIzaTestKey1234567890 ghp_testtoken Bearer abc.def.ghi password=hunter2 eyJabc.def.ghi',
    content: 'password=hunter2 sk-or-v1-test',
    confidence: 99,
    importance: 95,
    status: 'founder_approved',
    recall_count: 3,
    timestamp: now
  }));

  const high = getMemory('high');
  const scoring = calculatePromotionScore(high);
  assert(scoring.score >= 75, 'high quality memory should score for long-term promotion');
  assert(scoring.reason.includes('confidence'), 'promotion scoring should be explainable');

  const candidates = getPromotionCandidates();
  assert(candidates.some(item => item.memory_id === 'high' && item.computed_tier === 'LONG_TERM'), 'high memory should appear as promotion candidate');

  const promoted = promoteMemory('high');
  assert(promoted.tier === 'LONG_TERM', 'promoted memory should move to LONG_TERM');
  assert(promoted.promoted_at, 'promoted memory should store promoted_at');
  assert(promoted.promotion_reason, 'promoted memory should store promotion_reason');

  refreshDecayCandidates();
  const stale = getMemory('stale');
  assert(stale.decay_candidate === 1, 'stale low-value memory should be marked as decay candidate');
  assert(stale.decay_reason, 'decay candidate should explain why');
  const staleRecalled = getMemory('stale_recalled');
  assert(staleRecalled.decay_candidate === 1, 'stale recalled memory should still decay when last_recalled_at is old');
  assert(staleRecalled.decay_reason.includes('not recalled'), 'stale recalled decay should explain recall age');

  const tierResults = searchRecallMemories('same content tier ranking proof memory', { limit: 5 });
  assert(tierResults[0].memory_id === 'long_same', 'LONG_TERM memory should outrank MID_TERM memory with same content');
  assert(tierResults[0].score_breakdown.tier === 1.2, 'LONG_TERM result should expose tier multiplier');
  assert(tierResults[0].why_selected.some(reason => reason.includes('tier LONG_TERM')), 'why_selected should mention LONG_TERM boost');

  const relevanceResults = searchRecallMemories('alpha beta gamma delta', { limit: 5 });
  assert(relevanceResults[0].memory_id === 'short_relevant', 'clearly stronger SHORT_TERM relevance should outrank weak LONG_TERM relevance');

  const archivedDefault = searchRecallMemories('quarantine vault', { limit: 5 });
  assert(!archivedDefault.some(result => result.memory_id === 'archived_same'), 'ARCHIVED memory should be excluded by default');
  const archivedIncluded = searchRecallMemories('quarantine vault', { limit: 5, include_archived: true });
  const archivedResult = archivedIncluded.find(result => result.memory_id === 'archived_same');
  assert(archivedResult, 'include_archived=true should return archived memory');
  assert(archivedResult.score_breakdown.tier === 0.1, 'ARCHIVED result should expose archived penalty');
  assert(archivedResult.why_selected.some(reason => reason.includes('tier ARCHIVED')), 'why_selected should mention ARCHIVED penalty');

  const hybridResults = await hybridRecallSearch('same content tier ranking proof memory', {
    limit: 5,
    embedText: async () => [1, 0, 0]
  });
  assert(hybridResults[0].memory_id === 'long_same', 'hybrid ranking should preserve tier boost');
  assert(hybridResults[0].tier_multiplier === 1.2, 'hybrid result should expose tier multiplier');

  const recalledBefore = getMemory('high').recall_count || 0;
  searchRecallMemories('Cline dedupe candidate', { limit: 3 });
  const recalledAfter = getMemory('high').recall_count || 0;
  assert(recalledAfter >= recalledBefore, 'recall integration should not break search after promotion');

  const beforeFailedPromote = getMemory('mid_same');
  let promoteFailed = false;
  try {
    promoteMemory('mid_same', '__TEST_FAIL_FTS__');
  } catch (error) {
    promoteFailed = true;
  }
  const afterFailedPromote = getMemory('mid_same');
  assert(promoteFailed, 'promote fault injection should fail');
  assert(afterFailedPromote.tier === beforeFailedPromote.tier, 'failed promote should roll back tier update');
  assert(!getRun('mid_same', '__TEST_FAIL_FTS__'), 'failed promote should not write audit run');

  const beforeFailedArchive = getMemory('mid_same');
  let archiveFailed = false;
  try {
    archiveMemory('mid_same', '__TEST_FAIL_AUDIT__');
  } catch (error) {
    archiveFailed = true;
  }
  const afterFailedArchive = getMemory('mid_same');
  assert(archiveFailed, 'archive fault injection should fail');
  assert(afterFailedArchive.tier === beforeFailedArchive.tier, 'failed archive should roll back tier update');
  assert(!getRun('mid_same', '__TEST_FAIL_AUDIT__'), 'failed archive should not write audit run');

  const secretPromoted = promoteMemory('secret');
  assert(!containsSecrets(secretPromoted.summary), 'promoted memory summary should be redacted');
  assert(!containsSecrets(secretPromoted.content || ''), 'promoted memory content should be redacted');
  const secretRow = getMemory('secret');
  assert(!containsSecrets(`${secretRow.summary}\n${secretRow.content || ''}`), 'stored promoted memory should not contain secrets');

  const archived = archiveMemory('stale');
  assert(archived.tier === 'ARCHIVED', 'archive should move memory to ARCHIVED');

  const status = getPromotionStatus();
  assert(status.long_term_memories >= 2, 'status should count long-term memories');
  assert(status.tier_distribution.ARCHIVED >= 2, 'status should count archived memories');

  console.log(JSON.stringify({
    success: true,
    high_score: scoring.score,
    promoted_tier: promoted.tier,
    tier_top: {
      memory_id: tierResults[0].memory_id,
      tier: tierResults[0].tier,
      multiplier: tierResults[0].score_breakdown.tier,
      why_selected: tierResults[0].why_selected
    },
    archived_included: {
      memory_id: archivedResult.memory_id,
      tier: archivedResult.tier,
      multiplier: archivedResult.score_breakdown.tier,
      why_selected: archivedResult.why_selected
    },
    stale_recalled_decay_reason: staleRecalled.decay_reason,
    status
  }, null, 2));
}

function memory(now, overrides) {
  return {
    source_kind: 'candidate',
    source_ref: 'fixture',
    timestamp: now,
    project: 'CentralContext',
    source: 'test',
    type: 'architecture_note',
    summary: '',
    content: '',
    confidence: 50,
    importance: 50,
    memory_score: 50,
    recency_score: 1,
    priority: 'medium',
    status: 'review_queue',
    evidence_json: '[]',
    metadata_json: JSON.stringify({ reality_alignment: 0.8 }),
    tier: 'SHORT_TERM',
    recall_count: 0,
    ...overrides
  };
}

function getMemory(memoryId) {
  return getDb().prepare('SELECT * FROM recall_memories WHERE memory_id = ?').get(memoryId);
}

function getRun(memoryId, reason) {
  return getDb().prepare(`
    SELECT * FROM memory_promotion_runs
    WHERE memory_id = ? AND reason = ?
  `).get(memoryId, reason);
}
