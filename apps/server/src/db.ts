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
  quality_score?: number;
  memory_priority?: string;
  file_name?: string;
  file_path?: string;
  extension?: string;
}

export function initDb(dbPath: string): Database.Database {
  // Ensure target folder exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  console.log(`Connecting to SQLite database at: ${dbPath}`);
  db = new Database(dbPath);

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
  `);
  console.log('SQLite schema verified.');

  return db;
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
      INSERT INTO raw_logs (timestamp, source, project, type, content, quality_score, memory_priority, file_name, file_path, extension)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      log.timestamp,
      log.source,
      log.project || null,
      log.type,
      log.content,
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

export function hasRawLogHash(hash: string): boolean {
  try {
    const database = getDb();
    const stmt = database.prepare('SELECT id FROM raw_logs WHERE content LIKE ? LIMIT 1');
    const result = stmt.get(`%content_hash: ${hash}%`);
    return !!result;
  } catch (error) {
    console.error('Failed to check raw log hash:', error);
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

