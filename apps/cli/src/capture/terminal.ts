import { spawn } from 'child_process';
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

const commandArgs = process.argv.slice(2);

if (commandArgs.length === 0) {
  console.log('Usage: npm run cc:terminal -- <command_to_run>');
  console.log('Example: npm run cc:terminal -- npm run build');
  process.exit(0);
}

const commandLine = commandArgs.join(' ');

console.log(`\x1b[36m[CentralContext Terminal Logger] Running: "${commandLine}"\x1b[0m\n`);

const startTime = Date.now();
let stdoutBuffer = '';
let stderrBuffer = '';

// Spawn the subprocess inside shell mode to support pipelines & custom script executors
const child = spawn(commandLine, {
  shell: true,
  stdio: ['inherit', 'pipe', 'pipe'] // Inherit stdin, pipe stdout/stderr
});

// Stream stdout to terminal in real-time and capture buffer
child.stdout.on('data', (data) => {
  const chunk = data.toString();
  process.stdout.write(chunk);
  
  // Cap stdout buffering at 500KB to prevent memory exhaustion
  if (stdoutBuffer.length < 500 * 1024) {
    stdoutBuffer += chunk;
  }
});

// Stream stderr to terminal in real-time and capture buffer
child.stderr.on('data', (data) => {
  const chunk = data.toString();
  process.stderr.write(chunk);
  
  // Cap stderr buffering at 500KB
  if (stderrBuffer.length < 500 * 1024) {
    stderrBuffer += chunk;
  }
});

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
      console.error(`[Terminal Logger] API log failed with status ${response.status}`);
    }
  } catch (err: any) {
    console.error(`[Terminal Logger] Connection failed:`, err.message || err);
  }
}

// Process finished handler
child.on('close', async (code) => {
  const durationMs = Date.now() - startTime;
  const durationSec = (durationMs / 1000).toFixed(2);
  const exitCode = code === null ? -1 : code;

  console.log(`\n\x1b[36m[CentralContext Terminal Logger] Finished: "${commandLine}" with exit code: ${exitCode} (Duration: ${durationSec}s)\x1b[0m`);

  // Classify Quality Score
  // Priority 4 (High): Build/test compiler failures or active exceptions
  // Priority 3 (Useful): Successful operations
  const hasErrors = exitCode !== 0 || stderrBuffer.toLowerCase().includes('error') || stderrBuffer.toLowerCase().includes('failed');
  
  const qualityScore = hasErrors ? 4 : 3;
  const memoryPriority = hasErrors ? 'high' : 'useful';
  const type = hasErrors ? 'terminal_error' : 'terminal_run';

  const fullContent = `Command: ${commandLine}
Exit Code: ${exitCode}
Duration: ${durationSec}s

Stdout:
${stdoutBuffer}

Stderr:
${stderrBuffer}`;

  // Apply secret redactions
  const redactedContent = redactText(fullContent);

  const payload = {
    source: 'terminal',
    type,
    project: 'CentralContext',
    quality_score: qualityScore,
    memory_priority: memoryPriority,
    content: redactedContent
  };

  await postRawLog(payload);

  // Propagate command exit code to propagate shell failures correctly
  process.exit(exitCode);
});
