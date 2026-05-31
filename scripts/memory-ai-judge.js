/**
 * CentralContext Memory Distillery v0.3
 * Pass 5: OpenRouter AI Curation Judge (scripts/memory-ai-judge.js)
 * 
 * Purpose: Layer final strategic AI peer-review over candidates before consensus calculation.
 * Security: Enforces credit-safety guards, loop protection, caching, token estimators, and secret redactions.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. Initial Setup & Env Loading
const rootDir = path.resolve(__dirname, '..');
const envFile = path.join(rootDir, '.env');

if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

// 2. Folder Configurations (Ensure all directories exist)
const folders = [
  path.join(rootDir, 'data/memory/budget'),
  path.join(rootDir, 'data/memory/locks'),
  path.join(rootDir, 'data/memory/cache'),
  path.join(rootDir, 'data/memory/config'),
  path.join(rootDir, 'data/memory/ai_judge')
];

folders.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Helper for date formatting
function getTodayString() {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Parse Command Line Arguments
const args = process.argv.slice(2);
let targetDate = getTodayString();
let executeMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date' && args[i + 1]) {
    targetDate = args[i + 1].trim();
  }
  if (args[i] === '--execute') {
    executeMode = true;
  }
}

// 3. Provider Configuration Defaults (Yêu cầu Provider Config)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen3.5-coder:free';
const OPENROUTER_FALLBACK_MODEL = process.env.OPENROUTER_FALLBACK_MODEL || 'deepseek/deepseek-chat';
const OPENROUTER_MAX_DAILY_COST_USD = parseFloat(process.env.OPENROUTER_MAX_DAILY_COST_USD || '0.10');
const OPENROUTER_MAX_RUN_COST_USD = parseFloat(process.env.OPENROUTER_MAX_RUN_COST_USD || '0.02');
const OPENROUTER_MAX_REQUESTS_PER_RUN = parseInt(process.env.OPENROUTER_MAX_REQUESTS_PER_RUN || '10');
const OPENROUTER_MAX_CANDIDATES_PER_RUN = parseInt(process.env.OPENROUTER_MAX_CANDIDATES_PER_RUN || '30');
const OPENROUTER_TIMEOUT_MS = parseInt(process.env.OPENROUTER_TIMEOUT_MS || '30000');
const OPENROUTER_ENABLED = (process.env.OPENROUTER_ENABLED !== 'false');

console.log(`\n\x1b[35m==================================================\x1b[0m`);
console.log(`\x1b[35m🤖 OPENROUTER AI CURATION JUDGE (v0.3)\x1b[0m`);
console.log(`\x1b[35m==================================================\x1b[0m`);
console.log(`Target Date:    \x1b[36m${targetDate}\x1b[0m`);
console.log(`Mode:           \x1b[36m${executeMode ? '💥 EXECUTE (API Call)' : '🛡️ DRY RUN (Safe mode)'}\x1b[0m`);
console.log(`Model:          \x1b[36m${OPENROUTER_MODEL}\x1b[0m`);
console.log(`Daily Budget:   \x1b[33m$${OPENROUTER_MAX_DAILY_COST_USD.toFixed(2)} USD\x1b[0m`);
console.log(`Run Budget:     \x1b[33m$${OPENROUTER_MAX_RUN_COST_USD.toFixed(2)} USD\x1b[0m`);
console.log(`Emergency Switch: \x1b[36m${OPENROUTER_ENABLED ? 'ON' : 'OFF (DRY-RUN FORCED)'}\x1b[0m`);
console.log(`\x1b[35m--------------------------------------------------\x1b[0m\n`);

// 4. Heuristic Token Estimation & Pricing Loading (Yêu cầu Token Estimation)
const pricingPath = path.join(rootDir, 'data/memory/config/model_pricing.json');
if (!fs.existsSync(pricingPath)) {
  const defaultPricing = {
    "deepseek/deepseek-chat": {
      "input_per_million": 0.20,
      "output_per_million": 0.80
    },
    "qwen/qwen3.5-coder:free": {
      "input_per_million": 0.00,
      "output_per_million": 0.00
    }
  };
  fs.writeFileSync(pricingPath, JSON.stringify(defaultPricing, null, 2), 'utf8');
}

let pricingTable = {};
try {
  pricingTable = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
} catch (e) {
  pricingTable = {};
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function getModelPricing(modelName) {
  if (pricingTable[modelName]) {
    return pricingTable[modelName];
  }
  // Fallback conservative price (Yêu cầu Token Estimation)
  return {
    input_per_million: 1.00,
    output_per_million: 3.00
  };
}

// 5. Seven Layers of Loop Protection (Yêu cầu Loop Protection)
const lockFilePath = path.join(rootDir, 'data/memory/locks/openrouter_judge.lock');
const cacheFilePath = path.join(rootDir, 'data/memory/cache/ai_judge_cache.json');
const budgetFilePath = path.join(rootDir, `data/memory/budget/openrouter_usage_${targetDate}.json`);

// Load budget file
function getBudgetRecord() {
  if (fs.existsSync(budgetFilePath)) {
    try {
      return JSON.parse(fs.readFileSync(budgetFilePath, 'utf8'));
    } catch (e) {}
  }
  return {
    date: targetDate,
    total_requests: 0,
    estimated_cost_usd: 0,
    actual_cost_usd: 0,
    models_used: {},
    runs: []
  };
}

function saveBudgetRecord(record) {
  fs.writeFileSync(budgetFilePath, JSON.stringify(record, null, 2), 'utf8');
}

// Load cache file
function getCacheRecord() {
  if (fs.existsSync(cacheFilePath)) {
    try {
      return JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
    } catch (e) {}
  }
  return {};
}

function saveCacheRecord(cache) {
  fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8');
}

// Helper to determine zero-dependency local heuristic AI judgments (Yêu cầu Tự học / Kháng lỗi)
function getLocalHeuristicJudgement(cand) {
  const evidenceStr = JSON.stringify(cand.evidence || '').toLowerCase();
  const proposedLower = (cand.proposed_memory || '').toLowerCase();
  
  let decision = 'needs_review';
  let reason = "Candidate evaluated for human review queue.";
  
  if (cand.type === 'bug' && (evidenceStr.includes('grep') || evidenceStr.includes('exit code: 1') || evidenceStr.includes('exit code: 2'))) {
    decision = 'reject';
    reason = "Grep search exit-code mismatch is standard unix behavior, not a runtime bug. Filtered as telemetry noise.";
  }
  else if (cand.type === 'current_state_update' && (evidenceStr.includes('cd ') && !evidenceStr.includes('npm run') && !evidenceStr.includes('git'))) {
    decision = 'reject';
    reason = "Trivial directory traversing (cd) contains no active build runs or state milestones. Filtered as noise.";
  }
  else if (cand.type === 'decision' && (proposedLower.includes('important decisions') || proposedLower.includes('discussion occurred') || proposedLower.includes('negotiated'))) {
    decision = 'reject';
    reason = "Vague chat discussion lacks concrete architectural decisions or explicit commitments. Filtered as noise.";
  }
  else if (cand.type === 'architecture_note' || cand.type === 'founder_preference' || proposedLower.includes('priority') || proposedLower.includes('freeze') || proposedLower.includes('pause')) {
    decision = 'needs_review';
    reason = "Strategic priority modifications or credentials must undergo manual developer verification.";
  }

  return {
    id: cand.id,
    decision,
    memory_type: cand.type,
    confidence: cand.confidence || 80,
    reason,
    clean_memory: cand.proposed_memory,
    risk: decision === 'reject' ? 'low' : 'medium'
  };
}

// Execute Pass 5
async function main() {
  // Layer 1: Per-run lock file
  if (fs.existsSync(lockFilePath)) {
    const stats = fs.statSync(lockFilePath);
    const ageMinutes = (Date.now() - stats.mtimeMs) / 1000 / 60;
    if (ageMinutes < 15) {
      console.error(`\x1b[31m[Lock Protection] Aborted: Another OpenRouter AI Judge execution is currently locked.\x1b[0m`);
      console.error(`Lock File: \x1b[33m${path.relative(rootDir, lockFilePath)}\x1b[0m (Created ${ageMinutes.toFixed(1)} mins ago)`);
      console.error(`Wait for current run or delete lock manually.\n`);
      process.exit(1);
    }
  }

  // Create Lock
  fs.writeFileSync(lockFilePath, JSON.stringify({ pid: process.pid, time: new Date().toISOString() }), 'utf8');

  // Unified exit handler to ensure lock is cleaned up
  function cleanupLock() {
    if (fs.existsSync(lockFilePath)) {
      fs.unlinkSync(lockFilePath);
    }
  }

  try {
    const candidateJsonPath = path.join(rootDir, 'data/memory/candidates', `${targetDate}.candidates.json`);
    if (!fs.existsSync(candidateJsonPath)) {
      console.log(`[Abort] Candidates JSON not found for date ${targetDate}. Run Pass 1-4 first.\n`);
      cleanupLock();
      process.exit(0);
    }

    const payload = JSON.parse(fs.readFileSync(candidateJsonPath, 'utf8'));
    const allCandidates = payload.candidates || [];

    if (allCandidates.length === 0) {
      console.log(`\x1b[33mNo candidates found to analyze. Curation completed.\x1b[0m\n`);
      cleanupLock();
      process.exit(0);
    }

    console.log(`Loaded \x1b[32m${allCandidates.length}\x1b[0m candidates from telemetry logs.`);

    // Layer 4: Truncate candidates if exceeding MAX_CANDIDATES_PER_RUN
    let candidatesToProcess = [...allCandidates];
    if (candidatesToProcess.length > OPENROUTER_MAX_CANDIDATES_PER_RUN) {
      console.log(`\x1b[33m[Budget Guard] Candidates count (${candidatesToProcess.length}) exceeds max limit (${OPENROUTER_MAX_CANDIDATES_PER_RUN}). Truncating to highest scores.\x1b[0m`);
      // Sort by confidence (distiller score) descending
      candidatesToProcess.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      candidatesToProcess = candidatesToProcess.slice(0, OPENROUTER_MAX_CANDIDATES_PER_RUN);
    }

    // Load dynamic cache
    const cache = getCacheRecord();
    const activeCacheHits = [];
    const candidatesToSend = [];

    // Layer 2: Candidate hash cache check (Prevent redundant API calls)
    candidatesToProcess.forEach((cand, idx) => {
      const uniqueId = `candidate_${String(idx + 1).padStart(3, '0')}`;
      cand.id = uniqueId; // Ensure a stable ID for payload grouping

      // Secure payload redaction (Remove passwords, tokens, founder verification code)
      const cleanMemory = redactSensitiveContent(cand.proposed_memory || '');
      const cleanEvidence = (cand.evidence || []).map(ev => redactSensitiveContent(ev));

      // Calculate hash
      const hashStr = cand.type + (cand.project || 'CentralContext') + cleanMemory;
      const hash = crypto.createHash('sha256').update(hashStr).digest('hex');
      cand.hash = hash;

      const cacheKey = `${hash}_${OPENROUTER_MODEL}`;
      if (cache[cacheKey]) {
        activeCacheHits.push({
          candidate: cand,
          judgement: cache[cacheKey]
        });
      } else {
        candidatesToSend.push(cand);
      }
    });

    console.log(`Cache Hits: \x1b[32m${activeCacheHits.length}\x1b[0m, Required API Evaluations: \x1b[33m${candidatesToSend.length}\x1b[0m`);

    // Dynamic dry run estimates
    let runId = `run_${Date.now()}`;
    let dailyBudget = getBudgetRecord();
    let isAborted = false;
    let abortReason = '';

    // Estimate input costs for candidates to send
    let estimatedTokensInput = 0;
    let estimatedTokensOutput = 0;
    let estimatedCostUsd = 0;

    if (candidatesToSend.length > 0) {
      // Build prompt preview to estimate tokens
      const promptPreview = buildPromptPayload(candidatesToSend);
      estimatedTokensInput = estimateTokens(promptPreview);
      // Assume output is approx 150 tokens per candidate evaluated
      estimatedTokensOutput = candidatesToSend.length * 150;

      const pricing = getModelPricing(OPENROUTER_MODEL);
      estimatedCostUsd = (estimatedTokensInput / 1000000) * pricing.input_per_million +
                         (estimatedTokensOutput / 1000000) * pricing.output_per_million;
    }

    console.log(`Estimates for this run:`);
    console.log(`  - Input Tokens (estimated):  \x1b[36m${estimatedTokensInput}\x1b[0m`);
    console.log(`  - Output Tokens (estimated): \x1b[36m${estimatedTokensOutput}\x1b[0m`);
    console.log(`  - Cost USD (estimated):      \x1b[33m$${estimatedCostUsd.toFixed(5)} USD\x1b[0m`);
    console.log(`  - Daily Cost So Far:         \x1b[33m$${dailyBudget.estimated_cost_usd.toFixed(5)} USD\x1b[0m`);

    // Budget Guard Controls (Layers 2, 3, 5, 6, 7)
    if (!OPENROUTER_ENABLED) {
      isAborted = true;
      abortReason = "Skipped (Emergency Switch OPENROUTER_ENABLED=false is active)";
    } else if (estimatedCostUsd > OPENROUTER_MAX_RUN_COST_USD) {
      isAborted = true;
      abortReason = `Aborted (Estimated run cost $${estimatedCostUsd.toFixed(5)} exceeds max run budget $${OPENROUTER_MAX_RUN_COST_USD})`;
    } else if (dailyBudget.estimated_cost_usd + estimatedCostUsd > OPENROUTER_MAX_DAILY_COST_USD) {
      isAborted = true;
      abortReason = `Aborted (Estimated run would exceed max daily budget limit of $${OPENROUTER_MAX_DAILY_COST_USD})`;
    } else if (!executeMode) {
      isAborted = true;
      abortReason = "Skipped (Dry run mode by default. Run with --execute to call API)";
    } else if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.length < 10) {
      isAborted = true;
      abortReason = "Aborted (OpenRouter API Key is missing or invalid)";
    }

    const runReport = {
      run_id: runId,
      timestamp: new Date().toISOString(),
      model: OPENROUTER_MODEL,
      candidates_total: candidatesToProcess.length,
      candidates_skipped_cache: activeCacheHits.length,
      candidates_evaluated: candidatesToSend.length,
      estimated_input_tokens: estimatedTokensInput,
      estimated_output_tokens: estimatedTokensOutput,
      estimated_cost_usd: estimatedCostUsd,
      actual_cost_usd: 0,
      status: isAborted ? "aborted" : "executing",
      abort_reason: abortReason
    };

    if (isAborted) {
      console.log(`\n\x1b[33m[Budget Guard Shield Active] Run status: ${abortReason}\x1b[0m`);
      
      // Save logs to budget ledger even if dry-run/aborted
      dailyBudget.runs.push(runReport);
      saveBudgetRecord(dailyBudget);

      // Construct dynamic judgements payload from cached values and mock/skipped values
      const compiledJudgements = [];
      activeCacheHits.forEach(h => {
        compiledJudgements.push(h.judgement);
      });
      
      candidatesToSend.forEach(cand => {
        const localJudge = getLocalHeuristicJudgement(cand);
        localJudge.reason = `[Dry-Run Skipped] ${localJudge.reason}`;
        compiledJudgements.push(localJudge);
      });

      writeOutputs(compiledJudgements, runReport, executeMode);
      cleanupLock();
      return;
    }

    // Call API (EXECUTE MODE)
    console.log(`\n\x1b[32m🚀 Budget checks PASSED! Connecting to OpenRouter API...\x1b[0m`);
    let finalJudgements = [];
    
    try {
      const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://github.com/tuoaoa/centralcontext',
          'X-Title': 'CentralContext AI Curation Judge'
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            {
              role: 'system',
              content: `You are a strict, highly analytical memory curation judge. Your job is to decide whether proposed candidates are worth committing as permanent Agent Memory.
Reject aggressively. Do NOT keep noise.
Rules:
- Grep exit code 1 means standard search mismatch, not a bug. REJECT exit code 1 / 2 grep logs unless attached to explicit build crashes.
- Cd, ls, wc, cat, tail commands represent mundane telemetry. REJECT cd-only traversals.
- Vague memories like "important decisions negotiated in chat" are useless. REJECT if memory lacks concrete context details.
- To preserve a memory, choose: "keep".
- To throw away noise, choose: "reject".
- If the fact is complex, represents a critical architectural decision, priority switch, or requires manual developer review, choose: "needs_review".

Output STRICT JSON only matching this schema:
{
  "judgements": [
    {
      "id": "candidate_id",
      "decision": "keep" | "reject" | "needs_review",
      "memory_type": "decision" | "current_state_update" | "project_fact" | "blocker" | "bug" | "lesson_learned" | "founder_preference" | "useful_prompt" | "architecture_note" | "discard_noise",
      "confidence": 0-100 number,
      "reason": "short explanation of judgment",
      "clean_memory": "refined concise memory sentence if kept, otherwise empty string",
      "risk": "low" | "medium" | "high"
    }
  ]
}`
            },
            {
              role: 'user',
              content: buildPromptPayload(candidatesToSend)
            }
          ],
          response_format: { type: 'json_object' }
        })
      }, OPENROUTER_TIMEOUT_MS);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenRouter returned status ${response.status}: ${text}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // Safe JSON parse
      let cleanText = content.trim();
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
      }

      const parsedRes = JSON.parse(cleanText);
      if (!parsedRes.judgements || !Array.isArray(parsedRes.judgements)) {
        throw new Error("Invalid output format: missing judgements array.");
      }

      finalJudgements = parsedRes.judgements;

      // Update cache
      finalJudgements.forEach(judge => {
        const matchingCand = candidatesToSend.find(c => c.id === judge.id);
        if (matchingCand) {
          const cacheKey = `${matchingCand.hash}_${OPENROUTER_MODEL}`;
          cache[cacheKey] = judge;
        }
      });
      saveCacheRecord(cache);

      // Record actual cost if provided
      let actualCost = estimatedCostUsd;
      if (data.usage) {
        const pricing = getModelPricing(OPENROUTER_MODEL);
        actualCost = (data.usage.prompt_tokens / 1000000) * pricing.input_per_million +
                     (data.usage.completion_tokens / 1000000) * pricing.output_per_million;
        console.log(`Usage: prompt_tokens=${data.usage.prompt_tokens}, completion_tokens=${data.usage.completion_tokens}, actual_cost=$${actualCost.toFixed(5)} USD`);
      }

      runReport.status = "success";
      runReport.actual_cost_usd = actualCost;
      dailyBudget.estimated_cost_usd += actualCost;
      dailyBudget.actual_cost_usd += actualCost;
      dailyBudget.total_requests += 1;
      dailyBudget.models_used[OPENROUTER_MODEL] = (dailyBudget.models_used[OPENROUTER_MODEL] || 0) + 1;

    } catch (apiErr) {
      console.error(`\x1b[31m[API Fail] OpenRouter call failed: ${apiErr.message}\x1b[0m`);
      console.log(`\x1b[33mFalling back to local rule heuristics evaluation...\x1b[0m`);

      runReport.status = "failed";
      runReport.abort_reason = apiErr.message;

      // Fallback local heuristic simulation (Yêu cầu loop safety / API fail robust)
      candidatesToSend.forEach(cand => {
        const localJudge = getLocalHeuristicJudgement(cand);
        localJudge.reason = `[API Fallback] ${localJudge.reason}`;
        finalJudgements.push(localJudge);
      });
    }

    // Merge Cache + Fresh Judgements
    const totalJudgements = [];
    activeCacheHits.forEach(h => {
      totalJudgements.push(h.judgement);
    });
    totalJudgements.push(...finalJudgements);

    // Save logs to budget ledger
    dailyBudget.runs.push(runReport);
    saveBudgetRecord(dailyBudget);

    writeOutputs(totalJudgements, runReport, executeMode);
    cleanupLock();

  } catch (err) {
    console.error(`Fatal AI Judge Curation Fail:`, err);
    cleanupLock();
    process.exit(1);
  }
}

// 6. Compact Payload Construction (Yêu cầu Input to AI Judge)
function buildPromptPayload(candidates) {
  const compactPayload = candidates.map(c => {
    // Redact credentials safely
    const cleanMemory = redactSensitiveContent(c.proposed_memory || '');
    const cleanReason = redactSensitiveContent(c.critic_reason || '');
    
    // Truncate evidence quote to 300 chars, memory to 800 chars
    const evidenceSummary = (c.evidence || []).map(ev => {
      let cleanEv = redactSensitiveContent(ev);
      return cleanEv.length > 300 ? cleanEv.substring(0, 300) + '...[TRUNCATED]' : cleanEv;
    });

    return {
      id: c.id,
      type: c.type,
      project: c.project || 'CentralContext',
      distiller_score: c.confidence || 80,
      critic_score: c.critic_score || 70,
      founder_fit_score: c.founder_fit_score || 70,
      critic_reason: cleanReason,
      proposed_memory: cleanMemory.length > 800 ? cleanMemory.substring(0, 800) + '...[TRUNCATED]' : cleanMemory,
      evidence_summary: evidenceSummary
    };
  });

  return JSON.stringify(compactPayload, null, 2);
}

// Helper to remove passwords, tokens, API keys, and Founder secret code safely
function redactSensitiveContent(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/FOUNDER_CODE_8827/gi, '[REDACTED_FOUNDER_CODE]')
    .replace(/FOUNDER_CODE_\d+/gi, '[REDACTED_FOUNDER_CODE]')
    .replace(/sk-[a-zA-Z0-9]{24,}/gi, '[REDACTED_API_KEY]')
    .replace(/bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/password\s*=\s*['"][^'"]+['"]/gi, 'password=[REDACTED]')
    .replace(/bot\d+:[a-zA-Z0-9_\-]+/gi, '[REDACTED_TELEGRAM_BOT_TOKEN]');
}

// Timeout fetch wrapper
async function fetchWithTimeout(resource, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal
  });
  clearTimeout(id);
  return response;
}

// 7. Save outputs
function writeOutputs(judgements, report, execute) {
  const outJsonPath = path.join(rootDir, 'data/memory/ai_judge', `${targetDate}.ai_judgements.json`);
  fs.writeFileSync(outJsonPath, JSON.stringify({ judgements, run_report: report }, null, 2), 'utf8');
  console.log(`\x1b[32m✔ Struct AI Judgements written to: ${path.relative(rootDir, outJsonPath)}\x1b[0m`);

  const outMdPath = path.join(rootDir, 'data/memory/ai_judge', `${targetDate}.ai_judge_report.md`);
  let md = `# OpenRouter AI Judge Curation Report - ${targetDate}\n\n`;
  md += `## Metadata\n`;
  md += `- **Timestamp**: ${report.timestamp}\n`;
  md += `- **Model**: ${report.model}\n`;
  md += `- **Dry Run Mode**: ${!execute ? "🛡️ TRUE (Budget Guard Active)" : "💥 FALSE (Live Executed)"}\n`;
  md += `- **Run Budget limit**: $${OPENROUTER_MAX_RUN_COST_USD.toFixed(3)} USD\n`;
  md += `- **Daily budget limit**: $${OPENROUTER_MAX_DAILY_COST_USD.toFixed(3)} USD\n`;
  if (report.status === "aborted") {
    md += `- **Run Status**: 🛑 ABORTED / SKIPPED\n`;
    md += `- **Reason**: *${report.abort_reason}*\n\n`;
  } else {
    md += `- **Run Status**: ✔ SUCCESS\n\n`;
  }

  md += `## Evaluation Metrics\n`;
  md += `- **Candidates Processed**: ${report.candidates_total}\n`;
  md += `- **Candidates From Cache**: ${report.candidates_skipped_cache}\n`;
  md += `- **Candidates Evaluated by API**: ${report.candidates_evaluated}\n`;
  md += `- **Estimated cost**: $${report.estimated_cost_usd.toFixed(6)} USD\n`;
  md += `- **Actual cost**: $${report.actual_cost_usd.toFixed(6)} USD\n\n`;

  md += `## Judgements Summary\n`;
  const keeps = judgements.filter(j => j.decision === 'keep');
  const rejects = judgements.filter(j => j.decision === 'reject');
  const reviews = judgements.filter(j => j.decision === 'needs_review');

  md += `- **Kept (Safe approve candidates)**: **${keeps.length}**\n`;
  md += `- **Rejected (Trivial noise)**: **${rejects.length}**\n`;
  md += `- **Needs Review (Strategic elements)**: **${reviews.length}**\n\n`;

  md += `### Detailed Decisions\n`;
  judgements.forEach(j => {
    let emoji = '❔';
    if (j.decision === 'keep') emoji = '✅ KEEP';
    else if (j.decision === 'reject') emoji = '❌ REJECT';
    else if (j.decision === 'needs_review') emoji = '⚖️ NEEDS REVIEW';

    md += `#### Candidate ID: ${j.id}\n`;
    md += `- **Decision**: ${emoji}\n`;
    md += `- **Memory Type**: \`${j.memory_type}\`\n`;
    md += `- **Confidence**: ${j.confidence}%\n`;
    md += `- **Risk**: \`${j.risk}\`\n`;
    md += `- **Reason**: *${j.reason}*\n`;
    if (j.clean_memory) {
      md += `- **Cleaned Memory**: *"${j.clean_memory}"*\n`;
    }
    md += `\n`;
  });

  fs.writeFileSync(outMdPath, md, 'utf8');
  console.log(`\x1b[32m✔ Markdown AI Judge Report written to: ${path.relative(rootDir, outMdPath)}\x1b[0m\n`);
}

// Trigger Execution
main();
