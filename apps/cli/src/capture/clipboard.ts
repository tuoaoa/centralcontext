import { execSync } from 'child_process';
import crypto from 'crypto';
import path from 'path';
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

// Memory of last copied string hash
let lastLoggedHash = '';

// Prompt keywords list
const promptKeywords = [
  'bạn là senior',
  'hãy xây',
  'mục tiêu',
  'yêu cầu',
  'tech stack',
  'không over-engineer',
  'mvp',
  'agent',
  'centralcontext',
  'triển khai',
  'bắt đầu code'
];

function getClipboardText(): string {
  try {
    // Run native macOS clipboard command pbpaste
    return execSync('pbpaste', { encoding: 'utf8' }).trim();
  } catch (e) {
    // Non-Mac or failed command
    return '';
  }
}

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
      console.error(`[Clipboard Watcher] API failed with status ${response.status}`);
    }
  } catch (err: any) {
    console.error(`[Clipboard Watcher] Connection failed:`, err.message || err);
  }
}

function checkClipboard() {
  const currentText = getClipboardText();
  
  if (currentText.length < 10) return;

  // Verify SHA-256 hash to prevent duplicates
  const hash = crypto.createHash('sha256').update(currentText).digest('hex');
  if (hash === lastLoggedHash) return;

  lastLoggedHash = hash;
  
  // Apply data redactions
  const redactedContent = redactText(currentText);

  // Check if content matches ChatGPT/agent prompt patterns
  const lowerText = currentText.toLowerCase();
  const isPrompt = promptKeywords.some(keyword => lowerText.includes(keyword));

  let payload;
  if (isPrompt) {
    console.log(`\x1b[35m[Clipboard] Spied critical Agent Prompt! (Score 5)\x1b[0m`);
    payload = {
      source: 'clipboard',
      type: 'agent_prompt',
      project: 'CentralContext',
      quality_score: 5,
      memory_priority: 'critical',
      content: redactedContent
    };
  } else if (currentText.length > 200) {
    console.log(`\x1b[90m[Clipboard] Spied long copied text block (${currentText.length} chars). (Score 3)\x1b[0m`);
    payload = {
      source: 'clipboard',
      type: 'clipboard',
      project: 'General',
      quality_score: 3,
      memory_priority: 'useful',
      content: redactedContent
    };
  } else {
    // Not a prompt and less than 200 characters, treat as low-value cache (Quality 2)
    payload = {
      source: 'clipboard',
      type: 'clipboard_snippet',
      project: 'General',
      quality_score: 2,
      memory_priority: 'low',
      content: redactedContent
    };
  }

  postRawLog(payload);
}

console.log('\x1b[36m========== CentralContext Clipboard Watcher ==========\x1b[0m');
console.log('Background polling active for macOS clipboard text changes (Interval: 1500ms)...');
console.log('Classifies agent prompts containing instructions automatically.');
console.log('Press Ctrl+C to terminate.');

// Start poll loop
setInterval(checkClipboard, 1500);
