import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

export interface RawLog {
  id?: number;
  timestamp: string;
  source: string;
  project: string | null;
  type: string;
  content: string;
  content_hash?: string | null;
  dedupe_key?: string | null;
  task_id?: string | null;
  role?: string | null;
  message_index?: number | null;
  quality_score?: number;
  memory_priority?: string;
  file_name?: string;
  file_path?: string;
  extension?: string;
}

export interface RecallMemory {
  id?: number;
  memory_id: string;
  source_kind: string;
  source_ref?: string | null;
  timestamp?: string | null;
  project?: string | null;
  source?: string | null;
  type?: string | null;
  summary: string;
  content?: string | null;
  confidence?: number;
  importance?: number;
  memory_score?: number;
  recency_score?: number;
  priority?: string | null;
  status?: string | null;
  evidence_json?: string | null;
  metadata_json?: string | null;
  embedding_json?: string | null;
  embedding_provider?: string | null;
  embedding_model?: string | null;
  embedding_dimension?: number | null;
  embedding_version?: string | null;
  embedding_generated_at?: string | null;
  embedding_text_hash?: string | null;
  tier?: string | null;
  promoted_at?: string | null;
  last_recalled_at?: string | null;
  recall_count?: number | null;
  promotion_reason?: string | null;
  promotion_score?: number | null;
  decay_candidate?: number | null;
  decay_reason?: string | null;
}

export interface RecallSearchResult extends RecallMemory {
  relevance_score: number;
  fts_score: number;
  semantic_score: number;
  hybrid_score: number;
  why_selected: string[];
  score_breakdown: {
    fts: number;
    semantic: number;
    project: number;
    recency: number;
    importance: number;
    tier: number;
  };
}

export function initDb(dbPath: string): Database.Database {
  // Ensure target folder exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  console.log(`Connecting to SQLite database at: ${dbPath}`);
  db = new Database(dbPath, { timeout: 5000 });

  // Enable WAL mode to prevent locks
  db.pragma('journal_mode = WAL');
  console.log('SQLite WAL mode enabled.');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      source TEXT NOT NULL,
      project TEXT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      quality_score INTEGER,
      memory_priority TEXT,
      file_name TEXT,
      file_path TEXT,
      extension TEXT
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      context TEXT NOT NULL,
      decision TEXT NOT NULL,
      consequences TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recall_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id TEXT UNIQUE NOT NULL,
      source_kind TEXT NOT NULL,
      source_ref TEXT,
      timestamp TEXT,
      project TEXT,
      source TEXT,
      type TEXT,
      summary TEXT NOT NULL,
      content TEXT,
      confidence REAL DEFAULT 0,
      importance REAL DEFAULT 0,
      memory_score REAL DEFAULT 0,
      recency_score REAL DEFAULT 0,
      priority TEXT,
      status TEXT,
      evidence_json TEXT,
      metadata_json TEXT,
      embedding_json TEXT,
      embedding_provider TEXT,
      embedding_model TEXT,
      embedding_dimension INTEGER,
      embedding_version TEXT,
      embedding_generated_at TEXT,
      embedding_text_hash TEXT,
      tier TEXT DEFAULT 'MID_TERM',
      promoted_at TEXT,
      last_recalled_at TEXT,
      recall_count INTEGER DEFAULT 0,
      promotion_reason TEXT,
      promotion_score REAL DEFAULT 0,
      decay_candidate INTEGER DEFAULT 0,
      decay_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS recall_memories_fts
    USING fts5(
      memory_id UNINDEXED,
      summary,
      content,
      project,
      source,
      type,
      tokenize='porter unicode61'
    );

    CREATE TABLE IF NOT EXISTS recall_index_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT,
      finished_at TEXT,
      indexed_count INTEGER DEFAULT 0,
      source_counts_json TEXT,
      status TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS recall_embedding_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT,
      finished_at TEXT,
      provider TEXT,
      model TEXT,
      dimension INTEGER,
      version TEXT,
      embedded_count INTEGER DEFAULT 0,
      skipped_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      status TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS memory_promotion_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      action TEXT NOT NULL,
      memory_id TEXT,
      previous_tier TEXT,
      next_tier TEXT,
      promotion_score REAL,
      reason TEXT
    );
  `);

  const rawColumns = databaseColumns(db, 'raw_logs');
  const migrations: string[] = [];
  if (!rawColumns.has('content_hash')) migrations.push('ALTER TABLE raw_logs ADD COLUMN content_hash TEXT');
  if (!rawColumns.has('dedupe_key')) migrations.push('ALTER TABLE raw_logs ADD COLUMN dedupe_key TEXT');
  if (!rawColumns.has('task_id')) migrations.push('ALTER TABLE raw_logs ADD COLUMN task_id TEXT');
  if (!rawColumns.has('role')) migrations.push('ALTER TABLE raw_logs ADD COLUMN role TEXT');
  if (!rawColumns.has('message_index')) migrations.push('ALTER TABLE raw_logs ADD COLUMN message_index INTEGER');
  migrations.forEach(sql => db!.exec(sql));
  const recallColumns = databaseColumns(db, 'recall_memories');
  const recallMigrations: string[] = [];
  if (!recallColumns.has('embedding_json')) recallMigrations.push('ALTER TABLE recall_memories ADD COLUMN embedding_json TEXT');
  if (!recallColumns.has('embedding_provider')) recallMigrations.push('ALTER TABLE recall_memories ADD COLUMN embedding_provider TEXT');
  if (!recallColumns.has('embedding_model')) recallMigrations.push('ALTER TABLE recall_memories ADD COLUMN embedding_model TEXT');
  if (!recallColumns.has('embedding_dimension')) recallMigrations.push('ALTER TABLE recall_memories ADD COLUMN embedding_dimension INTEGER');
  if (!recallColumns.has('embedding_version')) recallMigrations.push('ALTER TABLE recall_memories ADD COLUMN embedding_version TEXT');
  if (!recallColumns.has('embedding_generated_at')) recallMigrations.push('ALTER TABLE recall_memories ADD COLUMN embedding_generated_at TEXT');
  if (!recallColumns.has('embedding_text_hash')) recallMigrations.push('ALTER TABLE recall_memories ADD COLUMN embedding_text_hash TEXT');
  if (!recallColumns.has('tier')) recallMigrations.push("ALTER TABLE recall_memories ADD COLUMN tier TEXT DEFAULT 'MID_TERM'");
  if (!recallColumns.has('promoted_at')) recallMigrations.push('ALTER TABLE recall_memories ADD COLUMN promoted_at TEXT');
  if (!recallColumns.has('last_recalled_at')) recallMigrations.push('ALTER TABLE recall_memories ADD COLUMN last_recalled_at TEXT');
  if (!recallColumns.has('recall_count')) recallMigrations.push('ALTER TABLE recall_memories ADD COLUMN recall_count INTEGER DEFAULT 0');
  if (!recallColumns.has('promotion_reason')) recallMigrations.push('ALTER TABLE recall_memories ADD COLUMN promotion_reason TEXT');
  if (!recallColumns.has('promotion_score')) recallMigrations.push('ALTER TABLE recall_memories ADD COLUMN promotion_score REAL DEFAULT 0');
  if (!recallColumns.has('decay_candidate')) recallMigrations.push('ALTER TABLE recall_memories ADD COLUMN decay_candidate INTEGER DEFAULT 0');
  if (!recallColumns.has('decay_reason')) recallMigrations.push('ALTER TABLE recall_memories ADD COLUMN decay_reason TEXT');
  recallMigrations.forEach(sql => db!.exec(sql));
  const ftsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'recall_memories_fts'").get() as { sql: string } | undefined;
  if (ftsSchema && !ftsSchema.sql.includes('memory_id UNINDEXED')) {
    db.exec('DROP TABLE IF EXISTS recall_memories_fts');
    db.exec(`
      CREATE VIRTUAL TABLE recall_memories_fts
      USING fts5(
        memory_id UNINDEXED,
        summary,
        content,
        project,
        source,
        type,
        tokenize='porter unicode61'
      )
    `);
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_raw_logs_dedupe_key ON raw_logs(dedupe_key)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_raw_logs_source_timestamp ON raw_logs(source, timestamp)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_recall_project ON recall_memories(project)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_recall_timestamp ON recall_memories(timestamp)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_recall_source_kind ON recall_memories(source_kind)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_recall_memory_score ON recall_memories(memory_score)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_recall_embedding_version ON recall_memories(embedding_version)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_recall_embedding_model ON recall_memories(embedding_model)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_recall_tier ON recall_memories(tier)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_recall_recall_count ON recall_memories(recall_count)');
  console.log('SQLite schema verified.');

  return db;
}

function databaseColumns(database: Database.Database, tableName: string): Set<string> {
  const rows = database.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  return new Set(rows.map(row => row.name));
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function insertRawLog(log: RawLog): boolean {
  try {
    const database = getDb();
    const stmt = database.prepare(`
      INSERT INTO raw_logs (
        timestamp, source, project, type, content, content_hash, dedupe_key, task_id, role, message_index,
        quality_score, memory_priority, file_name, file_path, extension
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      log.timestamp,
      log.source,
      log.project || null,
      log.type,
      log.content,
      log.content_hash || null,
      log.dedupe_key || null,
      log.task_id || null,
      log.role || null,
      log.message_index ?? null,
      log.quality_score || 3,
      log.memory_priority || 'useful',
      log.file_name || null,
      log.file_path || null,
      log.extension || null
    );
    return true;
  } catch (error) {
    // If SQLite fails, print internal warning but do not crash the endpoint
    console.error('SQLite cache insertion warning:', error);
    return false;
  }
}

export function hasRawLogDedupeKey(dedupeKey: string): boolean {
  try {
    const database = getDb();
    const stmt = database.prepare('SELECT id FROM raw_logs WHERE dedupe_key = ? LIMIT 1');
    const result = stmt.get(dedupeKey);
    return !!result;
  } catch (error) {
    console.error('Failed to check raw log dedupe key:', error);
    return false;
  }
}

export function getRawLogs(limit = 100): RawLog[] {
  try {
    const database = getDb();
    const stmt = database.prepare('SELECT * FROM raw_logs ORDER BY id DESC LIMIT ?');
    return stmt.all(limit) as RawLog[];
  } catch (error) {
    console.error('Failed to retrieve raw logs from cache:', error);
    return [];
  }
}

export function sqliteFts5Available(): boolean {
  try {
    const database = getDb();
    const row = database.prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') as enabled").get() as { enabled: number };
    if (row && row.enabled === 1) return true;
    database.exec('CREATE VIRTUAL TABLE IF NOT EXISTS temp.fts5_probe USING fts5(value)');
    return true;
  } catch (error) {
    return false;
  }
}

export function upsertRecallMemory(memory: RecallMemory): boolean {
  try {
    const database = getDb();
    const stmt = database.prepare(`
      INSERT INTO recall_memories (
        memory_id, source_kind, source_ref, timestamp, project, source, type, summary, content,
        confidence, importance, memory_score, recency_score, priority, status, evidence_json, metadata_json,
        embedding_json, embedding_provider, embedding_model, embedding_dimension, embedding_version,
        embedding_generated_at, embedding_text_hash, tier, promoted_at, last_recalled_at, recall_count,
        promotion_reason, promotion_score, decay_candidate, decay_reason
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(memory_id) DO UPDATE SET
        source_kind = excluded.source_kind,
        source_ref = excluded.source_ref,
        timestamp = excluded.timestamp,
        project = excluded.project,
        source = excluded.source,
        type = excluded.type,
        summary = excluded.summary,
        content = excluded.content,
        confidence = excluded.confidence,
        importance = excluded.importance,
        memory_score = excluded.memory_score,
        recency_score = excluded.recency_score,
        priority = excluded.priority,
        status = excluded.status,
        evidence_json = excluded.evidence_json,
        metadata_json = excluded.metadata_json,
        tier = excluded.tier,
        promoted_at = excluded.promoted_at,
        last_recalled_at = excluded.last_recalled_at,
        recall_count = excluded.recall_count,
        promotion_reason = excluded.promotion_reason,
        promotion_score = excluded.promotion_score,
        decay_candidate = excluded.decay_candidate,
        decay_reason = excluded.decay_reason,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(
      memory.memory_id,
      memory.source_kind,
      memory.source_ref || null,
      memory.timestamp || null,
      memory.project || null,
      memory.source || null,
      memory.type || null,
      memory.summary,
      memory.content || null,
      memory.confidence || 0,
      memory.importance || 0,
      memory.memory_score || 0,
      memory.recency_score || 0,
      memory.priority || null,
      memory.status || null,
      memory.evidence_json || null,
      memory.metadata_json || null,
      memory.embedding_json || null,
      memory.embedding_provider || null,
      memory.embedding_model || null,
      memory.embedding_dimension || null,
      memory.embedding_version || null,
      memory.embedding_generated_at || null,
      memory.embedding_text_hash || null,
      memory.tier || defaultTierForSource(memory.source_kind),
      memory.promoted_at || null,
      memory.last_recalled_at || null,
      memory.recall_count || 0,
      memory.promotion_reason || null,
      memory.promotion_score || 0,
      memory.decay_candidate || 0,
      memory.decay_reason || null
    );

    const row = database.prepare('SELECT memory_id FROM recall_memories WHERE memory_id = ?').get(memory.memory_id) as { memory_id: string };
    if (row && row.memory_id) {
      database.prepare('DELETE FROM recall_memories_fts WHERE memory_id = ?').run(row.memory_id);
      database.prepare(`
        INSERT INTO recall_memories_fts(memory_id, summary, content, project, source, type)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        row.memory_id,
        memory.summary,
        memory.content || '',
        memory.project || '',
        memory.source || '',
        memory.type || ''
      );
    }

    return true;
  } catch (error) {
    console.error('Recall memory upsert warning:', error);
    return false;
  }
}

function defaultTierForSource(sourceKind: string): string {
  if (sourceKind === 'approved_memory') return 'LONG_TERM';
  if (sourceKind === 'consensus') return 'MID_TERM';
  if (sourceKind === 'candidate') return 'SHORT_TERM';
  return 'SHORT_TERM';
}

export function getRecallIndexStats(): {
  count: number;
  fts_count: number;
  embedded_count: number;
  embedding_model: string | null;
  embedding_version: string | null;
  last_indexed_at: string | null;
  last_embedded_at: string | null;
  fts5_available: boolean;
} {
  const database = getDb();
  const countRow = database.prepare('SELECT COUNT(*) as count FROM recall_memories').get() as { count: number };
  const ftsRow = database.prepare('SELECT COUNT(*) as count FROM recall_memories_fts').get() as { count: number };
  const embeddedRow = database.prepare('SELECT COUNT(*) as count FROM recall_memories WHERE embedding_json IS NOT NULL').get() as { count: number };
  const runRow = database.prepare("SELECT finished_at FROM recall_index_runs WHERE status = 'completed' ORDER BY id DESC LIMIT 1").get() as { finished_at: string };
  const embedRunRow = database.prepare("SELECT finished_at, model, version FROM recall_embedding_runs WHERE status = 'completed' ORDER BY id DESC LIMIT 1").get() as { finished_at: string; model: string; version: string };
  return {
    count: countRow ? countRow.count : 0,
    fts_count: ftsRow ? ftsRow.count : 0,
    embedded_count: embeddedRow ? embeddedRow.count : 0,
    embedding_model: embedRunRow ? embedRunRow.model : null,
    embedding_version: embedRunRow ? embedRunRow.version : null,
    last_indexed_at: runRow ? runRow.finished_at : null,
    last_embedded_at: embedRunRow ? embedRunRow.finished_at : null,
    fts5_available: sqliteFts5Available()
  };
}

export function searchRecallMemories(query: string, options: { project?: string; limit?: number; source_kind?: string; tier?: string; include_archived?: boolean } = {}): RecallSearchResult[] {
  const database = getDb();
  const limit = Math.min(Math.max(options.limit || 10, 1), 50);
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];

  const params: any[] = [ftsQuery];
  let filters = '';
  if (options.project) {
    filters += ' AND lower(COALESCE(rm.project, \'\')) = lower(?)';
    params.push(options.project);
  }
  if (options.source_kind) {
    filters += ' AND rm.source_kind = ?';
    params.push(options.source_kind);
  }
  if (options.tier) {
    filters += ' AND upper(COALESCE(rm.tier, \'MID_TERM\')) = upper(?)';
    params.push(options.tier);
  } else if (!options.include_archived) {
    filters += " AND upper(COALESCE(rm.tier, 'MID_TERM')) != 'ARCHIVED'";
  }
  params.push(Math.max(limit * 5, 25));

  const rows = database.prepare(`
    SELECT rm.*, bm25(recall_memories_fts) as keyword_rank
    FROM recall_memories_fts
    JOIN recall_memories rm ON rm.memory_id = recall_memories_fts.memory_id
    WHERE recall_memories_fts MATCH ? ${filters}
    ORDER BY keyword_rank ASC
    LIMIT ?
  `).all(...params) as (RecallMemory & { keyword_rank: number })[];

  return rows
    .map(row => scoreRecallRow(row, query, options.project))
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, limit);
}

function buildFtsQuery(query: string): string {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .map(token => token.trim())
    .filter(token => token.length >= 2)
    .slice(0, 12);
  return tokens.map(token => `${token.replace(/"/g, '')}*`).join(' OR ');
}

function scoreRecallRow(row: RecallMemory & { keyword_rank: number }, query: string, requestedProject?: string): RecallSearchResult {
  const rank = Math.abs(Number(row.keyword_rank || 0));
  const bm25Score = Math.max(0, Math.min(1, 1 / (1 + rank)));
  const coverageScore = calculateTermCoverage(row, query);
  const keyword = Math.max(0, Math.min(1, (bm25Score * 0.45) + (coverageScore * 0.55)));
  const project = requestedProject
    ? (String(row.project || '').toLowerCase() === requestedProject.toLowerCase() ? 1 : 0)
    : inferProjectScore(row, query);
  const recency = row.recency_score || calculateRecencyScore(row.timestamp || null);
  const importance = normalizeScore(row.importance || row.memory_score || priorityScore(row.priority || null));
  const confidence = normalizeScore(row.confidence || 0);
  const tierMultiplier = tierMultiplierFor(row.tier || null);
  const tieredKeywordForScore = keyword * tierMultiplier;
  const relevance = Math.max(0, Math.min(1, (tieredKeywordForScore * 0.45) + (project * 0.15) + (recency * 0.15) + (importance * 0.15) + (confidence * 0.10)));

  return {
    ...row,
    relevance_score: Number(relevance.toFixed(4)),
    fts_score: Number(keyword.toFixed(4)),
    semantic_score: 0,
    hybrid_score: Number(relevance.toFixed(4)),
    why_selected: buildWhySelected(row, query, { keyword, project, recency, importance, confidence, tier: tierMultiplier }),
    score_breakdown: {
      fts: Number(keyword.toFixed(4)),
      semantic: 0,
      project: Number(project.toFixed(4)),
      recency: Number(recency.toFixed(4)),
      importance: Number(importance.toFixed(4)),
      tier: Number(tierMultiplier.toFixed(2))
    }
  };
}

function calculateTermCoverage(row: RecallMemory, query: string): number {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .map(term => term.trim())
    .filter(term => term.length >= 2);
  if (terms.length === 0) return 0;

  const haystack = [
    row.summary,
    row.content,
    row.project,
    row.source,
    row.type
  ].join(' ').toLowerCase();
  const matched = terms.filter(term => haystack.includes(term)).length;
  return matched / terms.length;
}

function inferProjectScore(row: RecallMemory, query: string): number {
  const project = String(row.project || '').toLowerCase();
  if (!project) return 0.5;
  const q = query.toLowerCase();
  return q.includes(project) ? 1 : 0.5;
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

function buildWhySelected(row: RecallMemory, query: string, scores: Record<string, number>): string[] {
  const reasons = [`keyword match for "${query}"`];
  if (row.project) reasons.push(`project: ${row.project}`);
  if (row.priority) reasons.push(`priority: ${row.priority}`);
  if (row.memory_score) reasons.push(`memory score: ${row.memory_score}`);
  if (row.confidence) reasons.push(`confidence: ${row.confidence}`);
  if (row.tier) reasons.push(`tier ${row.tier}: x${(scores.tier || 1).toFixed(2)}`);
  if (scores.recency >= 0.8) reasons.push('recent memory');
  return reasons.slice(0, 6);
}

export function tierMultiplierFor(tier: string | null): number {
  switch (String(tier || 'MID_TERM').toUpperCase()) {
    case 'LONG_TERM': return 1.20;
    case 'SHORT_TERM': return 0.85;
    case 'ARCHIVED': return 0.10;
    case 'MID_TERM':
    default: return 1.00;
  }
}

export function getRecallMemoriesForEmbedding(version: string, limit = 500): RecallMemory[] {
  const database = getDb();
  return database.prepare(`
    SELECT *
    FROM recall_memories
    WHERE embedding_json IS NULL
      OR embedding_version IS NULL
      OR embedding_version != ?
    ORDER BY source_kind = 'approved_memory' DESC, source_kind = 'candidate' DESC, id ASC
    LIMIT ?
  `).all(version, limit) as RecallMemory[];
}

export function getEmbeddedRecallMemories(version?: string): RecallMemory[] {
  const database = getDb();
  if (version) {
    return database.prepare(`
      SELECT *
      FROM recall_memories
      WHERE embedding_json IS NOT NULL
        AND embedding_version = ?
    `).all(version) as RecallMemory[];
  }
  return database.prepare(`
    SELECT *
    FROM recall_memories
    WHERE embedding_json IS NOT NULL
  `).all() as RecallMemory[];
}

export function updateRecallMemoryEmbedding(memoryId: string, embedding: number[], metadata: {
  provider: string;
  model: string;
  dimension: number;
  version: string;
  text_hash: string;
}): boolean {
  try {
    const database = getDb();
    database.prepare(`
      UPDATE recall_memories
      SET embedding_json = ?,
          embedding_provider = ?,
          embedding_model = ?,
          embedding_dimension = ?,
          embedding_version = ?,
          embedding_generated_at = ?,
          embedding_text_hash = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE memory_id = ?
    `).run(
      JSON.stringify(embedding),
      metadata.provider,
      metadata.model,
      metadata.dimension,
      metadata.version,
      new Date().toISOString(),
      metadata.text_hash,
      memoryId
    );
    return true;
  } catch (error) {
    console.error('Recall embedding update warning:', error);
    return false;
  }
}

export function createRecallEmbeddingRun(provider: string, model: string, dimension: number, version: string): number {
  const database = getDb();
  const result = database.prepare(`
    INSERT INTO recall_embedding_runs(started_at, provider, model, dimension, version, status)
    VALUES (?, ?, ?, ?, ?, 'running')
  `).run(new Date().toISOString(), provider, model, dimension, version);
  return Number(result.lastInsertRowid);
}

export function finishRecallEmbeddingRun(runId: number, payload: {
  embedded_count: number;
  skipped_count: number;
  failed_count: number;
  status: 'completed' | 'failed';
  error?: string | null;
}): void {
  const database = getDb();
  database.prepare(`
    UPDATE recall_embedding_runs
    SET finished_at = ?,
        embedded_count = ?,
        skipped_count = ?,
        failed_count = ?,
        status = ?,
        error = ?
    WHERE id = ?
  `).run(
    new Date().toISOString(),
    payload.embedded_count,
    payload.skipped_count,
    payload.failed_count,
    payload.status,
    payload.error || null,
    runId
  );
}

export function markRecallMemoriesRecalled(memoryIds: string[]): void {
  if (memoryIds.length === 0) return;
  try {
    const database = getDb();
    const stmt = database.prepare(`
      UPDATE recall_memories
      SET recall_count = COALESCE(recall_count, 0) + 1,
          last_recalled_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE memory_id = ?
    `);
    const now = new Date().toISOString();
    const tx = database.transaction((ids: string[]) => {
      ids.forEach(id => stmt.run(now, id));
    });
    tx(Array.from(new Set(memoryIds)));
  } catch (error) {
    console.error('Recall count update warning:', error);
  }
}
