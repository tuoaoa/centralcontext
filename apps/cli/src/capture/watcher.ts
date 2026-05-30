import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { redactText } from './redact';

// Load .env from root
const rootDir = path.resolve(__dirname, '../../../../');
dotenv.config({ path: path.join(rootDir, '.env') });

const apiKey = process.env.CENTRAL_CONTEXT_API_KEY;
const apiPort = process.env.PORT || 3000;
const localApiUrl = `http://localhost:${apiPort}/api/log/raw`;
const watchPathsEnv = process.env.WATCH_PATHS || rootDir;

if (!apiKey) {
  console.error('\x1b[31mError: API key is not configured in .env.\x1b[0m');
  process.exit(1);
}

// In-memory cache trackers for debouncing and content hashes
const debounceTimers: Record<string, NodeJS.Timeout> = {};
const fileHashes: Record<string, string> = {};

// Keywords to identify Priority 5 Critical files
const criticalKeywords = ['plan', 'task', 'walkthrough', 'prompt', 'context', 'decision', 'adr', 'summary', 'requirements', 'readme'];

// Configuration extensions to identify Priority 4 High Value configs
const configFiles = ['package.json', 'tsconfig.json', 'package-lock.json', '.env.example', 'webpack.config.js', 'vite.config.ts'];

async function postRawLog(payload: any) {
  try {
    const response = await fetch(localApiUrl, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      console.error(`[File Watcher] API failed with status ${response.status}`);
    }
  } catch (err: any) {
    console.error(`[File Watcher] Connection failed:`, err.message || err);
  }
}

// Main File Event Processor
function handleFileChange(filePath: string, eventType: 'create' | 'change') {
  try {
    if (!fs.existsSync(filePath)) return;
    
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) return;

    // 1. Read file and compute hash for strict change verification
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const hash = crypto.createHash('sha256').update(fileContent).digest('hex');

    // Only proceed if file content has actually changed
    if (fileHashes[filePath] === hash) return;
    fileHashes[filePath] = hash;

    // 2. Classify quality scoring and memory ranking
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const relativePath = path.relative(rootDir, filePath);
    
    // Infer project name from immediate enclosing directory
    const pathParts = filePath.split(path.sep);
    const project = pathParts[pathParts.length - 2] || 'CentralContext';

    let qualityScore = 3; // default: useful code
    let memoryPriority = 'useful';
    let type = 'file_snapshot';
    let contentSnapshot = '';

    const lowerName = fileName.toLowerCase();
    const isCritical = criticalKeywords.some(keyword => lowerName.includes(keyword)) || filePath.includes(`${path.sep}context${path.sep}`);
    const isConfig = configFiles.includes(fileName);

    if (isCritical) {
      // Priority 5 - Critical Documents
      console.log(`\x1b[35m[Watcher] Captured Critical file change: ${fileName} (Score 5)\x1b[0m`);
      qualityScore = 5;
      memoryPriority = 'critical';
      type = 'critical_doc_snapshot';
      
      // Allow generous snapshots for critical docs (up to 200KB)
      if (fileContent.length > 200 * 1024) {
        contentSnapshot = fileContent.substring(0, 20 * 1024) + 
          '\n\n... [TRUNCATED DUE TO SIZE LIMITS] ...\n\n' + 
          fileContent.substring(fileContent.length - 20 * 1024);
      } else {
        contentSnapshot = fileContent;
      }
    } else if (isConfig || lowerName.endsWith('.md')) {
      // Priority 4 - Configs & Markdown files
      console.log(`\x1b[32m[Watcher] Captured High value file change: ${fileName} (Score 4)\x1b[0m`);
      qualityScore = 4;
      memoryPriority = 'high';
      
      // Truncate config files to max 20KB to keep server logs clean
      contentSnapshot = fileContent.length > 20 * 1024 ? fileContent.substring(0, 20 * 1024) + '\n... [TRUNCATED] ...' : fileContent;
    } else {
      // Priority 3 - Useful Source Code
      console.log(`\x1b[90m[Watcher] Captured Code change: ${relativePath} (Score 3)\x1b[0m`);
      qualityScore = 3;
      memoryPriority = 'useful';
      
      // Code files get highly truncated snapshots (Max 5KB) to prevent spamming logs
      if (fileContent.length > 5 * 1024) {
        contentSnapshot = fileContent.substring(0, 5 * 1024) + '\n\n... [CODE TRUNCATED TO PREVENT SPAM] ...';
      } else {
        contentSnapshot = fileContent;
      }
    }

    // 3. Clean secrets and post to local server
    const redactedSnapshot = redactText(contentSnapshot);

    const payload = {
      source: 'file_watcher',
      type,
      project,
      file_path: filePath,
      file_name: fileName,
      extension: ext,
      quality_score: qualityScore,
      memory_priority: memoryPriority,
      content: `[Event: ${eventType.toUpperCase()}] File: ${relativePath}\n\n${redactedSnapshot}`
    };

    postRawLog(payload);
  } catch (err: any) {
    console.error(`[Watcher] Error processing file ${filePath}:`, err.message || err);
  }
}

// 4. Setup chokidar watcher
function initFileWatcher() {
  const watchPaths = watchPathsEnv.split(',').map(p => path.resolve(rootDir, p.trim()));
  
  console.log('\x1b[36m========== CentralContext File Watcher ==========\x1b[0m');
  console.log(`Watching paths: ${watchPaths.join(', ')}`);
  console.log('Supported extensions: .md, .txt, .json, .ts, .tsx, .js, .jsx, .py, .sh, .yml, .yaml');
  console.log('Auto-Save Debounce Active (3 seconds). Strict SHA-256 changes checked.');
  console.log('Press Ctrl+C to terminate.');

  const watcher = chokidar.watch(watchPaths, {
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/data/raw/**',
      '**/data/backups/**',
      '**/*.tar.gz',
      '**/db-wal',
      '**/db-shm',
      '**/*.db'
    ],
    persistent: true,
    ignoreInitial: true, // Only watch real-time modifications
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    }
  });

  const onEvent = (filePath: string, eventType: 'create' | 'change') => {
    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    const allowedExts = ['.md', '.txt', '.json', '.ts', '.tsx', '.js', '.jsx', '.py', '.sh', '.yml', '.yaml'];
    if (!allowedExts.includes(ext)) return;

    // Apply Debouncing: Wait 3 seconds of quiet on the file before capturing state
    if (debounceTimers[filePath]) {
      clearTimeout(debounceTimers[filePath]);
    }

    debounceTimers[filePath] = setTimeout(() => {
      delete debounceTimers[filePath];
      handleFileChange(filePath, eventType);
    }, 3000);
  };

  watcher
    .on('add', (filePath) => onEvent(filePath, 'create'))
    .on('change', (filePath) => onEvent(filePath, 'change'))
    .on('error', (error) => console.error('[Watcher Error]', error));
}

initFileWatcher();
