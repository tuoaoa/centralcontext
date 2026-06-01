const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('\x1b[36m===================================================\x1b[0m');
console.log('\x1b[36m         CENTRALCONTEXT CAPTURE DOCTOR (v1.0)       \x1b[0m');
console.log('\x1b[36m===================================================\x1b[0m\n');

// 1. Load Configurations (Zero-dependency inline .env loader)
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      let value = trimmed.substring(idx + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  });
}

const apiKey = process.env.CENTRAL_CONTEXT_API_KEY;
const port = process.env.PORT || 3000;
const localUrl = `http://localhost:${port}/api/log/raw`;

console.log(`[Config] Project Root: ${rootDir}`);
console.log(`[Config] Server URL: ${localUrl}`);
console.log(`[Config] API Key loaded: ${apiKey ? '\x1b[32mYES (Securely hidden)\x1b[0m' : '\x1b[31mNO\x1b[0m'}`);

if (!apiKey) {
  console.error('\x1b[31m[Error] CENTRAL_CONTEXT_API_KEY is not defined in your .env configuration.\x1b[0m');
  process.exit(1);
}

let doctorPassed = true;

// 2. Terminal Zsh Hook Diagnosis
console.log('\n\x1b[34m[1/3] Shell Prompts Zsh Hook Inquest...\x1b[0m');
const homedir = os.homedir();
const zshrcPath = path.join(homedir, '.zshrc');

if (fs.existsSync(zshrcPath)) {
  const zshrcContent = fs.readFileSync(zshrcPath, 'utf8');
  if (zshrcContent.includes('centralcontext') || zshrcContent.includes('cc:terminal') || zshrcContent.includes('precmd')) {
    console.log('\x1b[32m[OK] Terminal hook config lines found in your ~/.zshrc file!\x1b[0m');
  } else {
    console.warn('\x1b[33m[Warning] Terminal hook not explicitly found in your ~/.zshrc file.\x1b[0m');
    console.warn('To enable zsh logging hook, run: \x1b[36mbash scripts/install-zsh-hook.sh\x1b[0m');
    doctorPassed = false;
  }
} else {
  console.log('[Info] ~/.zshrc file does not exist. (Assuming non-zsh configuration)');
}

// 3. E2E Network Post raw logs connectivity checks
console.log('\n\x1b[34m[2/3] API Server Raw Ingest Connectivity Test...\x1b[0m');
async function testIngest() {
  try {
    const payload = {
      source: 'terminal',
      type: 'doctor_diagnosis',
      project: 'CentralContext',
      content: 'CentralContext Terminal Hook Diagnostic Connection OK',
      quality_score: 5,
      memory_priority: 'critical'
    };

    const response = await fetch(localUrl, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const resJson = await response.json();
      console.log(`\x1b[32m[OK] Successfully posted diagnostic raw log telemetry! (Status: ${response.status})\x1b[0m`);
      console.log(`     Server response:`, JSON.stringify(resJson));
    } else {
      console.error(`\x1b[31m[Error] Server rejected diagnostic log posting! Status: ${response.status}\x1b[0m`);
      doctorPassed = false;
    }
  } catch (err) {
    console.error(`\x1b[31m[Error] Failed to connect to server! Is "npm run dev" server running? Error: ${err.message || err}\x1b[0m`);
    doctorPassed = false;
  }

  // 4. Directory context mapping & project attribution checks
  console.log('\n\x1b[34m[3/3] Directory CWD Project Attribution logic audit...\x1b[0m');
  try {
    const currentCwd = process.cwd();
    const parts = currentCwd.split(path.sep);
    const enclosingDir = parts[parts.length - 1] || 'CentralContext';
    console.log(`[Attribution] Current Directory: ${currentCwd}`);
    console.log(`[Attribution] Inferred enclosing project block: \x1b[36m${enclosingDir}\x1b[0m`);
    console.log('\x1b[32m[OK] Directory tracking resolution audit succeeded!\x1b[0m');
  } catch (err) {
    console.error('\x1b[31m[Error] Failed to resolve directory attribution logic:\x1b[0m', err);
    doctorPassed = false;
  }

  console.log('\n\x1b[36m===================================================\x1b[0m');
  if (doctorPassed) {
    console.log('\x1b[32m✔ CAPTURE DOCTOR STATUS: ALL SYSTEMS NORMAL (PASS)\x1b[0m');
  } else {
    console.log('\x1b[33m⚠ CAPTURE DOCTOR STATUS: SOME RECOMMENDATIONS DETECTED\x1b[0m');
  }
  console.log('\x1b[36m===================================================\x1b[0m');
}

testIngest();
