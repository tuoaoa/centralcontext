const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

const rootDir = path.resolve(__dirname, '..');
const cacheDir = path.join(rootDir, 'data/memory');
const cacheFile = path.join(cacheDir, 'context_cache.json');
const envFile = path.join(rootDir, '.env');

// TTL: 5 minutes in milliseconds
const TTL = 5 * 60 * 1000;

// Get query from command line arguments
const query = (process.argv.slice(2).join(' ') || '').toLowerCase();

// Simple dotenv parser
function getApiKey() {
  if (!fs.existsSync(envFile)) return null;
  const content = fs.readFileSync(envFile, 'utf8');
  const match = content.match(/CENTRAL_CONTEXT_API_KEY\s*=\s*([a-f0-9]+)/);
  return match ? match[1] : null;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Fetch pack from local API
function fetchPack(apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/context/pack?_t=${Date.now()}`,
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Cache-Control': 'no-cache'
      },
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`Server returned status code ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

function printPackContent(content) {
  // Check active keywords
  const temporalKeywords = ['hiện tại', 'ưu tiên số 1', 'active', 'current', 'now'];
  const decisionKeywords = ['quyết định', 'decision', 'adr', 'chính sách', 'policy', 'trạng thái'];
  const founderKeywords = ['mã', 'code', 'founder', 'xác thực', 'internal', 'key', 'token'];

  const hasTemporal = temporalKeywords.some(kw => query.includes(kw));
  const hasDecision = decisionKeywords.some(kw => query.includes(kw));
  const hasFounder = founderKeywords.some(kw => query.includes(kw));

  console.log('================================================================================');
  console.log('CRITICAL CONFLICT RESOLUTION DIRECTIVES (ENFORCED BY COGNITIVE GATEWAY)');
  console.log('================================================================================');
  console.log(`Analyzing active query intent: "${query}"`);
  console.log('You MUST strictly adhere to the following operational truth rules:');
  console.log('1. Primary Source Hierarchy:');
  console.log('   SOURCE_PRIORITY.md > CURRENT_STATE.md > DECISIONS.md > FOUNDER_INTENT.md > ACTIVE_PROJECTS.md > WORK_LOG.md > reports/audits/archive');
  console.log('');

  if (hasTemporal) {
    console.log('▶ [Rule: Current State Priority - ACTIVE]');
    console.log('  - For queries regarding "current state", "now", "active", "ưu tiên số 1", "hiện tại":');
    console.log('    You MUST resolve the operational truth strictly from context/CURRENT_STATE.md.');
    console.log('    Do NOT use OLD_STATE.md, ARCHIVE_STATE.md, or workspace task folders/reports to answer current questions.');
    console.log('    If there is a conflict between folder structure/reports and CURRENT_STATE.md, CURRENT_STATE.md WINS.');
  }

  if (hasDecision) {
    console.log('▶ [Rule: Decision/ADR Priority - ACTIVE]');
    console.log('  - For queries regarding decisions, architectural changes, policies, or project statuses:');
    console.log('    You MUST resolve them strictly from context/CURRENT_STATE.md or context/DECISIONS.md (e.g. ADRs).');
    console.log('    In case of contradictions between decisions and external reports/analyses, DECISIONS.md and CURRENT_STATE.md WIN.');
  }

  if (hasFounder) {
    console.log('▶ [Rule: Founder Intent & Code Priority - ACTIVE]');
    console.log('  - For queries regarding validation codes, verification tokens, or direct founder instructions:');
    console.log('    You MUST resolve them strictly from context/FOUNDER_INTENT.md.');
    console.log('    Do NOT guess, redact, or hallucinate these values.');
  }

  console.log('▶ [Rule: Historical Archives - GENERAL]');
  console.log('  - OLD_STATE.md and ARCHIVE_STATE.md are historical archives and MUST NOT be used to answer current operational status questions.');
  console.log('================================================================================\n');

  console.log('\n--- CONTEXT PACK CONTENT ---');
  console.log(content);
}

async function run() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('Không thể truy cập CentralContext hiện tại.\nVui lòng khởi động CentralContext API hoặc cung cấp Context Pack.');
    process.exit(1);
  }

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  let cache = null;
  if (fs.existsSync(cacheFile)) {
    try {
      cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } catch (e) {
      cache = null;
    }
  }

  const now = Date.now();
  const isCacheValid = cache && 
                       cache.loaded_at && 
                       (now - cache.loaded_at < TTL) && 
                       cache.content && 
                       cache.hash && 
                       cache.size_bytes;

  if (isCacheValid) {
    console.log('[CentralContext] cache hit');
    console.log(`[CentralContext] hash=${cache.hash}`);
    console.log(`[CentralContext] bytes=${cache.size_bytes}`);
    console.log('[CentralContext] context loaded');
    
    printPackContent(cache.content);
    return;
  }

  // Cache miss or expired
  console.log('[CentralContext] cache miss');
  console.log('[CentralContext] loading context');

  try {
    const freshContent = await fetchPack(apiKey);
    const freshHash = sha256(freshContent);
    const freshSize = Buffer.byteLength(freshContent, 'utf8');

    // Update Cache
    const newCache = {
      hash: freshHash,
      loaded_at: now,
      size_bytes: freshSize,
      content: freshContent
    };

    fs.writeFileSync(cacheFile, JSON.stringify(newCache, null, 2), 'utf8');

    console.log(`[CentralContext] hash=${freshHash}`);
    console.log(`[CentralContext] bytes=${freshSize}`);
    console.log('[CentralContext] context loaded');
    
    printPackContent(freshContent);
  } catch (err) {
    // Failsafe
    console.error('Không thể truy cập CentralContext hiện tại.\nVui lòng khởi động CentralContext API hoặc cung cấp Context Pack.');
    process.exit(1);
  }
}

run();
