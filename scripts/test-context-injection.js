#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' });
require(path.join(repoRoot, 'apps/server/node_modules/ts-node/register/transpile-only'));

const {
  estimateTokens,
  generateContextInjectionPacket,
  selectMemoriesForInjection
} = require('../apps/server/src/context-injection');
const { getDb, initDb, upsertRecallMemory } = require('../apps/server/src/db');
const { containsSecrets } = require('./lib/secret-redactor');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const memories = [
  memory('m1', 'approved_memory', 'CentralContext', 0.92, 'Cline dedupe was solved by using source + task_id + role + message_index + content_hash as the dedupe key.', ['exact keyword match: cline dedupe']),
  memory('m2', 'candidate', 'CentralContext', 0.84, 'Cline duplicate message fragments were suppressed by preserving task boundaries and message indexes.', ['semantic similarity: 0.88']),
  memory('m3', 'approved_memory', 'CentralContext', 0.80, 'Cline dedupe was solved by using source + task_id + role + message_index + content_hash as the dedupe key.', ['duplicate']),
  memory('m4', 'candidate', 'OtherProject', 0.30, 'Unrelated clipboard telemetry should not dominate context injection.', ['low relevance']),
  memory('m5', 'approved_memory', 'CentralContext', 0.78, 'Secrets must be redacted before context generation: sk-or-v1-test AIzaTestKey1234567890 ghp_testtoken Bearer abc.def.ghi password=hunter2 eyJabc.def.ghi', ['security warning'])
];

async function main() {
  const packet = await generateContextInjectionPacket('How did we solve Cline dedupe?', {
    tokenBudget: 320,
    recallResults: memories
  });

  assert(packet.context_packet.includes('CENTRALCONTEXT STARTUP PACK'), 'startup pack should have title');
  assert(packet.context_packet.includes('CURRENT FOCUS'), 'startup pack should include current focus');
  assert(packet.context_packet.includes('RELEVANT MEMORIES'), 'startup pack should include relevant memories');
  assert(packet.context_packet.includes('IMPORTANT LESSONS'), 'startup pack should include important lessons');
  assert(packet.context_packet.includes('ACTIVE DECISIONS'), 'startup pack should include active decisions');
  assert(packet.context_packet.includes('REALITY WARNINGS'), 'startup pack should include reality warnings');
  assert(packet.context_packet.includes('PROJECT CONTEXT'), 'startup pack should include project context');
  assert(packet.sources.length >= 1, 'startup pack should include selected sources');
  assert(packet.token_estimate <= packet.token_budget, 'startup pack should respect token budget');
  assert(!containsSecrets(packet.context_packet), 'startup pack should not contain unredacted secrets');

  const selected = selectMemoriesForInjection(memories, 'How did we solve Cline dedupe?', 320);
  const dedupeCount = selected.filter(item => item.memory_summary.includes('source + task_id')).length;
  assert(dedupeCount === 1, 'duplicate memory suppression should remove repeated summaries');
  assert(selected[0].source === 'approved_memory', 'approved memory should be prioritized');

  const tightPacket = await generateContextInjectionPacket('How did we solve Cline dedupe?', {
    tokenBudget: 300,
    recallResults: memories.concat(Array.from({ length: 20 }, (_, i) => memory(`extra-${i}`, 'candidate', 'CentralContext', 0.5, `Extra repeated implementation detail ${i} that should be compressed under budget.`, ['extra'])))
  });
  assert(tightPacket.token_estimate <= 300, 'tight token budget should be enforced');
  assert(!tightPacket.context_packet.includes('raw log dump'), 'compression should not emit raw dump language');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'centralcontext-context-injection-'));
  initDb(path.join(tmpRoot, 'data/test-context-injection.db'));
  upsertRecallMemory({
    memory_id: 'context_no_track',
    source_kind: 'approved_memory',
    source_ref: 'fixture',
    timestamp: '2026-06-01T00:00:00.000Z',
    project: 'CentralContext',
    source: 'test',
    type: 'architecture_note',
    summary: 'Context injection recall metadata should remain read only for startup packet generation.',
    content: '',
    confidence: 95,
    importance: 95,
    memory_score: 95,
    recency_score: 1,
    priority: 'high',
    status: 'approved',
    evidence_json: '[]',
    metadata_json: '{}',
    tier: 'LONG_TERM',
    recall_count: 0
  });
  await generateContextInjectionPacket('context injection recall metadata', {
    tokenBudget: 320,
    embedText: async () => [0]
  });
  const contextRow = getDb().prepare('SELECT recall_count, last_recalled_at FROM recall_memories WHERE memory_id = ?').get('context_no_track');
  assert(contextRow.recall_count === 0 && contextRow.last_recalled_at === null, 'context injection should not mutate recall metadata');

  console.log(JSON.stringify({
    success: true,
    packet_tokens: packet.token_estimate,
    selected_memories: packet.selected_memories,
    source_breakdown: packet.source_breakdown,
    tight_packet_tokens: tightPacket.token_estimate,
    sample: packet.context_packet.slice(0, 500)
  }, null, 2));
}

function memory(id, source, project, hybrid, summary, why) {
  return {
    memory_id: id,
    fts_score: hybrid > 0.8 ? 0.8 : 0.2,
    semantic_score: hybrid > 0.8 ? 0.7 : 0.1,
    hybrid_score: hybrid,
    project_score: project === 'CentralContext' ? 1 : 0,
    recency_score: 0.9,
    importance_score: source === 'approved_memory' ? 0.95 : 0.6,
    source,
    raw_source: source,
    timestamp: '2026-06-01T00:00:00.000Z',
    project,
    memory_summary: summary,
    why_selected: why,
    type: 'architecture_note',
    source_ref: 'fixture'
  };
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
