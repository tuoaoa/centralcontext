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

if (!apiKey) {
  console.error('\x1b[31mError: API key is not configured in .env.\x1b[0m');
  process.exit(1);
}

// macOS Codex sessions directory
const homeDir = process.env.HOME || '/Users/tuoaoa';
const codexSessionsDir = path.join(homeDir, '.codex/sessions');

// Keep an in-memory map of file sizes to only read appended content
const fileBytesRead: Record<string, number> = {};

// Keep track of processed items to avoid duplicates
const processedKeys = new Set<string>();

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
      console.error(`[Codex Watcher] API failed with status ${response.status}`);
    }
  } catch (err: any) {
    console.error(`[Codex Watcher] Connection failed:`, err.message || err);
  }
}

// Process new lines in a rollout file
function processRolloutFile(filePath: string) {
  try {
    if (!fs.existsSync(filePath)) return;

    const stats = fs.statSync(filePath);
    const startByte = fileBytesRead[filePath] || 0;
    const currentSize = stats.size;

    if (currentSize <= startByte) return;

    // Read only the newly appended content
    const buffer = Buffer.alloc(currentSize - startByte);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, currentSize - startByte, startByte);
    fs.closeSync(fd);

    fileBytesRead[filePath] = currentSize;

    const newContent = buffer.toString('utf8');
    const lines = newContent.split(/\r?\n/);

    const fileName = path.basename(filePath);
    let parsedCount = 0;

    for (const line of lines) {
      if (!line.trim()) continue;

      let data: any;
      try {
        data = JSON.parse(line);
      } catch (e) {
        // Skip partial lines at the very end of stream
        continue;
      }

      const timestamp = data.timestamp || new Date().toISOString();
      const type = data.type || '';
      const payload = data.payload || {};

      // Build a unique key to prevent duplicate delivery
      const hash = crypto.createHash('sha256').update(line).digest('hex');
      const uniqueKey = `${fileName}_${timestamp}_${hash.substring(0, 8)}`;

      if (processedKeys.has(uniqueKey)) continue;
      processedKeys.add(uniqueKey);

      // Keep cache small
      if (processedKeys.size > 2000) {
        const firstKey = processedKeys.values().next().value;
        if (firstKey) processedKeys.delete(firstKey);
      }

      let contentText = '';
      let role = '';
      let msgType = '';

      // Extract details based on payload structure
      if (payload.type === 'user_message' || payload.type === 'agent_message' || payload.type === 'message') {
        role = payload.role || (payload.type === 'user_message' ? 'user' : 'assistant');
        contentText = payload.message || '';

        if (!contentText && Array.isArray(payload.content)) {
          contentText = payload.content.map((c: any) => c.text || c.input_text || '').join('\n');
        }
        msgType = 'chat_message';
      } else if (payload.type === 'function_call') {
        role = 'assistant';
        contentText = `[Function Call: ${payload.name}]\nArguments: ${payload.arguments}`;
        msgType = 'tool_call';
      } else if (payload.type === 'function_output') {
        role = 'system';
        contentText = `[Tool Output: ${payload.name}]\nResult:\n${payload.output}`;
        msgType = 'tool_output';
      }

      if (!contentText || contentText.trim().length < 5) continue;

      parsedCount++;

      // Clean secrets and format beautifully
      const redactedTextContent = redactText(contentText);
      const formattedContent = 
        `[Codex Client Active Telemetry]\n` +
        `Session: ${fileName.replace('rollout-', '').replace('.jsonl', '')}\n` +
        `Timestamp: ${new Date(timestamp).toLocaleString()}\n` +
        `Role: ${role.toUpperCase()} (${msgType})\n` +
        `----------------------------------------\n\n` +
        `${redactedTextContent}`;

      const isCritical = role === 'user' || msgType === 'tool_output' || contentText.length > 800;

      const apiPayload = {
        source: 'codex',
        type: isCritical ? 'codex_critical_event' : 'codex_conversation',
        project: 'Codex Workspace',
        quality_score: isCritical ? 5 : 4,
        memory_priority: isCritical ? 'critical' : 'high',
        content: formattedContent
      };

      postRawLog(apiPayload);
    }

    if (parsedCount > 0) {
      console.log(`\x1b[32m[Codex Watcher] Streamed ${parsedCount} events from ${fileName}\x1b[0m`);
    }

  } catch (err: any) {
    console.error(`[Codex Watcher] Error processing ${filePath}:`, err.message || err);
  }
}

// Initialize Watcher
function initCodexWatcher() {
  console.log('\x1b[36m========== CentralContext Codex Watcher ==========\x1b[0m');

  if (!fs.existsSync(codexSessionsDir)) {
    console.warn(`\x1b[33m[Warning] Codex sessions directory not found at: ${codexSessionsDir}\x1b[0m`);
    console.warn('Ensure Codex desktop application is installed and active.');
  } else {
    console.log(`Watching Codex storage: ${codexSessionsDir}`);
  }

  // Monitor all session .jsonl files recursively
  const watcher = chokidar.watch('**/*.jsonl', {
    cwd: codexSessionsDir,
    persistent: true,
    ignoreInitial: false, // Read existing session files on boot to bootstrap
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 100
    }
  });

  watcher.on('add', (filePath) => {
    const fullPath = path.join(codexSessionsDir, filePath);
    // Initialize file size baseline
    try {
      fileBytesRead[fullPath] = fs.statSync(fullPath).size;
    } catch (e) {}
  });

  watcher.on('change', (filePath) => {
    const fullPath = path.join(codexSessionsDir, filePath);
    processRolloutFile(fullPath);
  });

  console.log('Background monitoring active. Press Ctrl+C to terminate.');
}

initCodexWatcher();
