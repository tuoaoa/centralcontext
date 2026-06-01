import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { redactText } from './redact';

// === Configuration ==========================================================
const rootDir = path.resolve(__dirname, '../../../../');
dotenv.config({ path: path.join(rootDir, '.env') });

const apiKey = process.env.CENTRAL_CONTEXT_API_KEY;
const apiPort = process.env.PORT || 3000;
const localApiUrl = `http://localhost:${apiPort}/api/log/raw`;
const isDryRun = process.argv.includes('--dry-run');

const homeDir = process.env.HOME || '/Users/tuoaoa';
const clineTasksDir = path.join(
  homeDir,
  'Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/tasks'
);

// === High-value message types (whitelist) ===================================
const HIGH_VALUE_SAY_TYPES = new Set([
  'task',           // Initial user prompt
  'text',           // Final assistant text
  'command',        // Execute command
  'completion_result',// Task completion summary
  'mistake_limit_reached',
  'error',
  'error_retry',
]);

const HIGH_VALUE_ASK_TYPES = new Set([
  'followup',       // User follow-up
  'approval',       // Tool approval request
  'command',        // Command approval request in some Cline versions
  'command_output', // Command result
  'api_req_failed',
  'mistake_limit_reached',
]);

// === State: per-task processed message count ================================
interface TaskState {
  lastMsgCount: number;
  processedHashes: Set<string>;
  projectHint: string | null;
}
const taskStates: Map<string, TaskState> = new Map();

// === Helpers ================================================================
function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

// The user's workspace is ~/Tuoaoa/devflow/<project>/...
// We look for the directory immediately after "devflow".
const EXCLUDED_PROJECT_DIRS = [
  'node_modules', 'src', 'app', 'scripts', 'lib', '.git', '.vscode',
  'build', 'dist', 'public', 'data', 'context', 'apps', 'devflow'
];

function detectProjectFromPaths(paths: string[]): string {
  const counts = new Map<string, number>();
  for (const fp of paths) {
    if (!fp) continue;
    const parts = fp.split(path.sep);
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      const next = parts[i + 1];
      if (dir === 'devflow' && next) {
        if (!EXCLUDED_PROJECT_DIRS.includes(next.toLowerCase())) {
          counts.set(next, (counts.get(next) || 0) + 1);
        }
      }
    }
  }
  let best = 'unknown';
  let bestCount = 0;
  for (const [p, c] of counts.entries()) {
    if (c > bestCount) {
      best = p;
      bestCount = c;
    }
  }
  return best;
}

function detectProjectFromTaskDir(taskDir: string): string {
  const metadataPath = path.join(taskDir, 'task_metadata.json');
  if (!fs.existsSync(metadataPath)) return 'unknown';

  try {
    const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const files: any[] = meta.files_in_context || [];
    const paths = files.map((f: any) => f.path).filter(Boolean);
    const project = detectProjectFromPaths(paths);
    if (project !== 'unknown') return project;
  } catch (e) {
    // fallthrough
  }

  // Fallback: peek first few messages for cwd hints
  const uiPath = path.join(taskDir, 'ui_messages.json');
  if (fs.existsSync(uiPath)) {
    try {
      const raw = fs.readFileSync(uiPath, 'utf8').trim();
      if (raw) {
        const msgs = JSON.parse(raw);
        for (const msg of msgs) {
          const text = msg.text || '';
          const cwdMatch = text.match(/Current Working Directory\s*\(([^)]+)\)/);
          if (cwdMatch) {
            const proj = detectProjectFromPaths([cwdMatch[1]]);
            if (proj !== 'unknown') return proj;
          }
        }
      }
    } catch (e) {}
  }

  return 'unknown';
}

function extractRole(msg: any): { role: string; displayRole: string } {
  const msgType = msg.type || '';
  const msgSay = msg.say || '';
  const msgAsk = msg.ask || '';

  if (msgType === 'say') {
    if (msgSay === 'task' || msgSay === 'user_feedback') return { role: 'user', displayRole: 'user' };
    if (msgSay === 'error' || msgSay === 'mistake_limit_reached') return { role: 'system', displayRole: 'system' };
    return { role: 'assistant', displayRole: `assistant:${msgSay}` };
  }

  if (msgType === 'ask') {
    if (msgAsk === 'followup' || msgAsk === 'command_output') return { role: 'user', displayRole: `user:${msgAsk}` };
    return { role: 'tool', displayRole: `tool:${msgAsk}` };
  }

  return { role: 'unknown', displayRole: `${msgType}:${msgSay || msgAsk}` };
}

function isHighValueMessage(msg: any): boolean {
  const text = (msg.text || '').trim();
  if (!text || text.length < 5) return false;

  const msgType = msg.type || '';
  const msgSay = msg.say || '';
  const msgAsk = msg.ask || '';

  // Skip streaming partials
  if (msg.partial === true) return false;

  // Skip empty or whitespace-only
  if (!text.replace(/\s/g, '').length) return false;

  // Skip task_progress telemetry events
  if (msgType === 'say' && msgSay === 'task_progress') return false;
  if (msgType === 'say' && msgSay === 'api_req_started') return false;
  if (msgType === 'say' && msgSay === 'reasoning') return false;
  if (text.includes('<final_file_content') || text.includes('"tool":"editedExistingFile"') || text.includes('"tool":"newFileCreated"')) return false;
  if (text.length > 12000 && (msgSay === 'tool' || msgSay === 'api_req_started' || msgAsk === 'command_output')) return false;

  // Whitelist high-value types
  if (msgType === 'say' && HIGH_VALUE_SAY_TYPES.has(msgSay)) return true;
  if (msgType === 'ask' && HIGH_VALUE_ASK_TYPES.has(msgAsk)) return true;

  // Default: capture text if it's substantial
  if (msgType === 'say' && msgSay === 'text' && text.length > 50) return true;

  return false;
}

function buildDedupeKey(source: string, taskId: string, role: string, messageIndex: number, contentHash: string): string {
  return [source, taskId || 'no_task', role || 'no_role', String(messageIndex), contentHash].join(':');
}

function runDryRun() {
  const summary: any = {
    tasks_dir: clineTasksDir,
    tasks_dir_exists: fs.existsSync(clineTasksDir),
    task_folder_count: 0,
    ui_messages_json_count: 0,
    latest_task_id: null,
    latest_message_preview: null,
  };

  if (!summary.tasks_dir_exists) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  let latest: { taskId: string; uiPath: string; mtimeMs: number } | null = null;
  const entries = fs.readdirSync(clineTasksDir);
  for (const entry of entries) {
    const taskDir = path.join(clineTasksDir, entry);
    try {
      if (!fs.statSync(taskDir).isDirectory()) continue;
      summary.task_folder_count++;
      const uiPath = path.join(taskDir, 'ui_messages.json');
      if (!fs.existsSync(uiPath)) continue;
      summary.ui_messages_json_count++;
      const mtimeMs = fs.statSync(uiPath).mtimeMs;
      if (!latest || mtimeMs > latest.mtimeMs) {
        latest = { taskId: entry, uiPath, mtimeMs };
      }
    } catch (e) {}
  }

  if (latest) {
    summary.latest_task_id = latest.taskId;
    try {
      const raw = fs.readFileSync(latest.uiPath, 'utf8').trim();
      const messages = raw ? JSON.parse(raw) : [];
      const last = Array.isArray(messages) ? [...messages].reverse().find((msg: any) => (msg.text || '').trim()) : null;
      if (last) {
        const text = redactText(String(last.text).replace(/\s+/g, ' ').slice(0, 240));
        summary.latest_message_preview = text;
      }
    } catch (e) {
      summary.latest_message_preview = '(unable to parse latest ui_messages.json)';
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

async function postRawLog(payload: any) {
  try {
    const response = await fetch(localApiUrl, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error(`[Cline Capture] API error ${response.status}`);
    }
  } catch (err: any) {
    console.error(`[Cline Capture] Connection error:`, err.message);
  }
}

// === Core message processor =================================================
function processNewMessages(taskId: string, taskDir: string, messages: any[]) {
  let state = taskStates.get(taskId);
  if (!state) {
    state = {
      lastMsgCount: 0,
      processedHashes: new Set(),
      projectHint: detectProjectFromTaskDir(taskDir),
    };
    taskStates.set(taskId, state);
  }

  const startIdx = state.lastMsgCount;
  if (messages.length <= startIdx) return 0;

  let sentCount = 0;

  for (let i = startIdx; i < messages.length; i++) {
    const msg = messages[i];
    if (!isHighValueMessage(msg)) continue;

    const text = msg.text || '';
    const roleInfo = extractRole(msg);

    // Redact secrets before building the persisted content and hash.
    const safeText = redactText(text.substring(0, 20000));
    const hash = sha256(safeText);
    const dedupeKey = buildDedupeKey('cline', taskId, roleInfo.role, i, hash);

    // Deduplicate only the same source/task/role/message index/content combination.
    if (state.processedHashes.has(dedupeKey)) continue;
    state.processedHashes.add(dedupeKey);
    if (state.processedHashes.size > 5000) {
      // Prune oldest 10% when set gets too large
      const toDelete = Math.floor(5000 * 0.1);
      const iter = state.processedHashes.values();
      for (let d = 0; d < toDelete; d++) {
        const val = iter.next().value;
        if (val) state.processedHashes.delete(val);
      }
    }

    const modelInfo = msg.modelInfo;
    const modelName = modelInfo?.modelId || modelInfo?.model || 'unknown';

    // Quality scoring
    const isCritical = roleInfo.role === 'user' || msg.say === 'completion_result' || msg.say === 'error' || msg.ask === 'approval';
    const qualityScore = isCritical ? 5 : 4;
    const memoryPriority = isCritical ? 'critical' : 'high';

    // Build compact content
    const formattedContent = `[Cline Task: ${taskId} | ${roleInfo.displayRole} | Model: ${modelName}]

${safeText}`;

    const payload = {
      source: 'cline',
      type: 'agent_message',
      project: state.projectHint || 'unknown',
      quality_score: qualityScore,
      memory_priority: memoryPriority,
      content: formattedContent,
      content_hash: hash,
      dedupe_key: dedupeKey,
      file_name: 'ui_messages.json',
      file_path: path.join(taskDir, 'ui_messages.json'),
      extension: '.json',
      // Metadata as flat fields for JSONL
      task_id: taskId,
      role: roleInfo.role,
      message_index: i,
      model: modelName,
      model_provider: modelInfo?.providerId || 'unknown',
      cline_mode: modelInfo?.mode || 'unknown',
      timestamp: new Date().toISOString(),
    };

    postRawLog(payload);
    sentCount++;
  }

  state.lastMsgCount = messages.length;
  return sentCount;
}

function processTaskFile(taskDir: string, taskId: string) {
  const uiPath = path.join(taskDir, 'ui_messages.json');
  if (!fs.existsSync(uiPath)) return;

  try {
    const content = fs.readFileSync(uiPath, 'utf8').trim();
    if (!content) return;

    let messages: any[] = [];
    try {
      messages = JSON.parse(content);
    } catch (e) {
      // File might be partially written; skip this turn
      return;
    }

    if (!Array.isArray(messages)) return;

    const sentCount = processNewMessages(taskId, taskDir, messages);
    if (sentCount > 0) {
      console.log(`\x1b[32m[Cline Capture] Task ${taskId}: sent ${sentCount} new messages (detected project: ${taskStates.get(taskId)?.projectHint || 'unknown'})\x1b[0m`);
    }
  } catch (err: any) {
    console.error(`[Cline Capture] Error processing ${taskDir}:`, err.message);
  }
}

// === Two-layer watcher ======================================================
// Layer 1: Watch the tasks/ directory for new task folders
// Layer 2: Watch each task folder's ui_messages.json

const taskWatchers: Map<string, ReturnType<typeof chokidar.watch>> = new Map();

function watchTaskFile(taskId: string, taskDir: string) {
  if (taskWatchers.has(taskId)) return; // Already watching

  const uiPath = path.join(taskDir, 'ui_messages.json');
  const metadataPath = path.join(taskDir, 'task_metadata.json');

  // Do an initial read to bootstrap state.lastMsgCount
  if (fs.existsSync(uiPath)) {
    try {
      const content = fs.readFileSync(uiPath, 'utf8').trim();
      if (content) {
        const messages = JSON.parse(content);
        if (Array.isArray(messages)) {
          const state: TaskState = {
            lastMsgCount: messages.length,
            processedHashes: new Set(),
            projectHint: detectProjectFromTaskDir(taskDir),
          };
          // Warm cache with existing hashes to avoid resending on server restart
          for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (msg.text && isHighValueMessage(msg)) {
              const roleInfo = extractRole(msg);
              const safeText = redactText(String(msg.text).substring(0, 20000));
              state.processedHashes.add(buildDedupeKey('cline', taskId, roleInfo.role, i, sha256(safeText)));
            }
          }
          taskStates.set(taskId, state);
        }
      }
    } catch (e) {}
  }

  // Set up watcher
  const watcher = chokidar.watch(['ui_messages.json', 'task_metadata.json'], {
    cwd: taskDir,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 400,
      pollInterval: 150,
    },
  });

  watcher.on('change', () => {
    processTaskFile(taskDir, taskId);
  });

  watcher.on('add', () => {
    processTaskFile(taskDir, taskId);
  });

  taskWatchers.set(taskId, watcher);
}

function scanExistingTasks() {
  if (!fs.existsSync(clineTasksDir)) {
    console.warn(`[Cline Capture] Tasks directory not found: ${clineTasksDir}`);
    return;
  }

  const entries = fs.readdirSync(clineTasksDir);
  for (const entry of entries) {
    const taskDir = path.join(clineTasksDir, entry);
    try {
      if (fs.statSync(taskDir).isDirectory()) {
        watchTaskFile(entry, taskDir);
      }
    } catch (e) {
      // Directory might have been deleted between readdir and stat
    }
  }
}

// === Bootstrap ==============================================================
if (isDryRun) {
  runDryRun();
  process.exit(0);
}

if (!apiKey) {
  console.error('\x1b[31m[Cline Capture] CENTRAL_CONTEXT_API_KEY missing in .env\x1b[0m');
  process.exit(1);
}

console.log('\x1b[36m========== CentralContext Cline Capture ==========\x1b[0m');
console.log(`Tasks directory: ${clineTasksDir}`);
console.log('Scanning existing tasks...');

scanExistingTasks();

// Watch for NEW task folders being created
const rootWatcher = chokidar.watch('*', {
  cwd: clineTasksDir,
  persistent: true,
  ignoreInitial: true,
  depth: 0,
});

rootWatcher.on('addDir', (dirPath) => {
  const taskId = path.basename(dirPath);
  const fullDir = path.join(clineTasksDir, dirPath);
  console.log(`\x1b[35m[Cline Capture] New task detected: ${taskId}\x1b[0m`);
  watchTaskFile(taskId, fullDir);
});

console.log(`Watching ${taskWatchers.size} existing tasks. Monitoring for new tasks...`);
console.log('Press Ctrl+C to stop.');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\x1b[31m[Cline Capture] Shutting down...\x1b[0m');
  for (const [id, w] of taskWatchers) {
    try { w.close(); } catch (e) {}
  }
  try { rootWatcher.close(); } catch (e) {}
  process.exit(0);
});
