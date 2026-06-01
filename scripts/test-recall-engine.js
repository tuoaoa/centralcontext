#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' });
require(path.join(repoRoot, 'apps/server/node_modules/ts-node/register/transpile-only'));

const { initDb, searchRecallMemories, getRecallIndexStats, getDb } = require('../apps/server/src/db');
const { buildRecallIndex } = require('../apps/server/src/recall');
const { buildRecallEmbeddings, hybridRecallSearch, buildEmbeddingText } = require('../apps/server/src/recall-embeddings');
const { containsSecrets } = require('../scripts/lib/secret-redactor');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'centralcontext-recall-'));
const approvedDir = path.join(tmpRoot, 'data/memory/approved');
const candidatesDir = path.join(tmpRoot, 'data/memory/candidates');
const rejectedDir = path.join(tmpRoot, 'data/memory/rejected');
fs.mkdirSync(approvedDir, { recursive: true });
fs.mkdirSync(candidatesDir, { recursive: true });
fs.mkdirSync(rejectedDir, { recursive: true });

fs.writeFileSync(path.join(approvedDir, 'approved_memories.json'), JSON.stringify([
  {
    type: 'project_fact',
    project: 'CentralContext',
    source: 'approved_fixture',
    proposed_memory: 'Recall Engine V1 uses SQLite FTS5 for keyword retrieval over approved memories and candidates.',
    confidence: 95,
    priority: 'critical',
    memory_score: 96,
    timestamp: '2026-05-31T10:00:00.000Z',
    evidence: ['known memory fixture']
  },
  {
    type: 'project_fact',
    project: 'OtherProject',
    source: 'approved_fixture',
    proposed_memory: 'Clipboard capture records short snippets for telemetry review.',
    confidence: 90,
    priority: 'medium',
    memory_score: 70,
    timestamp: '2026-05-01T10:00:00.000Z',
    evidence: []
  },
  {
    type: 'project_fact',
    project: 'CentralContext',
    source: 'approved_fixture',
    proposed_memory: 'Semantic retrieval finds related memories even when wording is different.',
    confidence: 92,
    priority: 'high',
    memory_score: 90,
    timestamp: '2026-05-31T11:00:00.000Z',
    evidence: []
  },
  {
    type: 'security_fact',
    project: 'CentralContext',
    source: 'approved_fixture',
    proposed_memory: 'Secrets must be scrubbed before embedding: sk-or-v1-test AIzaTestKey1234567890 ghp_testtoken Bearer abc.def.ghi password=hunter2 eyJabc.def.ghi',
    confidence: 99,
    priority: 'critical',
    memory_score: 99,
    timestamp: '2026-05-31T12:00:00.000Z',
    evidence: []
  }
], null, 2));

fs.writeFileSync(path.join(candidatesDir, '2026-05-31.candidates.json'), JSON.stringify({
  candidates: [
    {
      type: 'architecture',
      project: 'CentralContext',
      source: 'candidate_fixture',
      proposed_memory: 'Recall dashboard should show why selected score breakdowns for retrieved memories.',
      confidence: 88,
      priority: 'high',
      memory_score: 86,
      status: 'auto_approved',
      evidence: ['candidate fixture']
    }
  ]
}, null, 2));

fs.writeFileSync(path.join(rejectedDir, 'rejected_memories.json'), JSON.stringify([], null, 2));

const dbPath = path.join(tmpRoot, 'data/test-recall.db');
initDb(dbPath);

const index = buildRecallIndex(tmpRoot);
assert(index.status === 'completed', 'indexer should complete');
assert(index.indexed_count >= 3, 'indexer should import approved and candidate memories');

const stats = getRecallIndexStats();
assert(stats.fts5_available, 'SQLite FTS5 should be available');
assert(stats.count >= 3, 'recall_memories table should contain indexed rows');
assert(stats.fts_count >= 3, 'recall_memories_fts should contain indexed rows');

const results = searchRecallMemories('sqlite fts5 retrieval', { project: 'CentralContext', limit: 5 });
assert(results.length > 0, 'known query should return at least one result');
assert(results[0].summary.includes('SQLite FTS5'), 'expected known memory should rank first');
assert(results[0].relevance_score > 0, 'top result should include positive relevance score');
assert(results[0].why_selected.length > 0, 'top result should explain why it was selected');

async function main() {
const keywordOnly = await hybridRecallSearch('sqlite fts5 retrieval', { project: 'CentralContext', limit: 5, embedText: fakeEmbed });
assert(keywordOnly.length > 0, 'hybrid search should fall back to keyword results before embeddings exist');
assert(keywordOnly[0].fts_score > 0, 'missing embedding fallback should preserve FTS score');
assert(keywordOnly.every(r => r.semantic_score === 0), 'missing embeddings should produce semantic_score 0');

const capturedEmbeddingTexts = [];
const embedResult = await buildRecallEmbeddings({
  embedText: async (text) => {
    capturedEmbeddingTexts.push(text);
    return fakeEmbed(text);
  }
});
assert(embedResult.status === 'completed', 'embedding build should complete');
assert(embedResult.embedded_count >= 5, 'embedding build should embed indexed memories');
assert(capturedEmbeddingTexts.every(text => !containsSecrets(text)), 'redaction should run before embedding text is sent to model');

const semanticResults = await hybridRecallSearch('meaning based memory lookup', { project: 'CentralContext', limit: 5, embedText: fakeEmbed });
assert(semanticResults.length > 0, 'semantic paraphrase query should return results');
assert(semanticResults[0].memory_summary.includes('Semantic retrieval finds related memories'), 'semantic paraphrase should rank the semantic memory first');
assert(semanticResults[0].semantic_score > 0.75, 'semantic result should include strong semantic score');
assert(semanticResults[0].hybrid_score > semanticResults[0].fts_score, 'hybrid score should benefit from semantic similarity');
assert(semanticResults[0].why_selected.some(reason => reason.includes('semantic similarity')), 'why_selected should explain semantic match');

const hybridRanking = await hybridRecallSearch('sqlite fts5 retrieval', { project: 'CentralContext', limit: 5, embedText: fakeEmbed });
assert(hybridRanking[0].memory_summary.includes('SQLite FTS5'), 'hybrid ranking should preserve strong keyword match at top');
assert(hybridRanking[0].hybrid_score >= hybridRanking[0].semantic_score * 0.25, 'hybrid score should include weighted semantic component');

const sqliteMemory = getMemoryBySummary('SQLite FTS5');
assert(sqliteMemory, 'tracking fixture memory should exist');
getDb().prepare('UPDATE recall_memories SET recall_count = 0, last_recalled_at = NULL WHERE memory_id = ?').run(sqliteMemory.memory_id);
await hybridRecallSearch('sqlite fts5 retrieval', { project: 'CentralContext', limit: 5, embedText: fakeEmbed });
const afterDefaultSearch = getMemory(sqliteMemory.memory_id);
assert(afterDefaultSearch.recall_count === 0 && afterDefaultSearch.last_recalled_at === null, 'default hybrid search should be read-only');

await hybridRecallSearch('sqlite fts5 retrieval', { project: 'CentralContext', limit: 5, trackRecalls: true, embedText: fakeEmbed });
const afterTrackedSearch = getMemory(sqliteMemory.memory_id);
assert(afterTrackedSearch.recall_count > 0 && afterTrackedSearch.last_recalled_at, 'trackRecalls=true should update non-ARCHIVED recall metadata');

const clipboardMemory = getMemoryBySummary('Clipboard capture');
assert(clipboardMemory, 'archived tracking fixture memory should exist');
getDb().prepare(`
  UPDATE recall_memories
  SET tier = 'ARCHIVED', recall_count = 7, last_recalled_at = NULL
  WHERE memory_id = ?
`).run(clipboardMemory.memory_id);
await hybridRecallSearch('clipboard snippets telemetry', { include_archived: true, trackRecalls: true, limit: 5, embedText: fakeEmbed });
const afterArchivedSearch = getMemory(clipboardMemory.memory_id);
assert(afterArchivedSearch.recall_count === 7 && afterArchivedSearch.last_recalled_at === null, 'ARCHIVED recall metadata should not change even when trackRecalls=true');

console.log(JSON.stringify({
  success: true,
  indexed_count: index.indexed_count,
  stats: getRecallIndexStats(),
  top_result: {
    relevance_score: results[0].relevance_score,
    source: results[0].source_kind,
    project: results[0].project,
    summary: results[0].summary,
    why_selected: results[0].why_selected
  },
  semantic_top_result: semanticResults[0],
  embedding_text_sample: buildEmbeddingText({ summary: 'password=hunter2 sk-or-v1-test', memory_id: 'sample', source_kind: 'test' })
}, null, 2));
}

function fakeEmbed(text) {
  const lower = text.toLowerCase();
  const vector = [0, 0, 0, 0, 0, 0];
  addIf(lower, vector, ['sqlite', 'fts5', 'keyword', 'retrieval'], 0, 1);
  addIf(lower, vector, ['semantic', 'meaning', 'related', 'wording', 'paraphrase'], 1, 1);
  addIf(lower, vector, ['dashboard', 'score', 'breakdown', 'selected'], 2, 1);
  addIf(lower, vector, ['clipboard', 'snippets', 'telemetry'], 3, 1);
  addIf(lower, vector, ['secret', 'scrubbed', 'redacted', 'embedding'], 4, 1);
  addIf(lower, vector, ['centralcontext', 'recall', 'memory'], 5, 0.5);
  return vector;
}

function addIf(text, vector, terms, index, amount) {
  terms.forEach(term => {
    if (text.includes(term)) vector[index] += amount;
  });
}

function getMemory(memoryId) {
  return getDb().prepare('SELECT * FROM recall_memories WHERE memory_id = ?').get(memoryId);
}

function getMemoryBySummary(fragment) {
  return getDb().prepare('SELECT * FROM recall_memories WHERE summary LIKE ? LIMIT 1').get(`%${fragment}%`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
