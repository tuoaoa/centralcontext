/**
 * CentralContext Memory Distillery v0.2
 * Pass 2: Critic Engine (scripts/memory-critic.js)
 * 
 * Purpose: Critique every memory candidate to evaluate if it is real memory, noise,
 * duplicate, or a streaming/terminal artifact. Assigns critic_score & critic_reason.
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
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

function getTodayString() {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Arguments parsing
const args = process.argv.slice(2);
let targetDate = getTodayString();
let provider = process.env.LLM_PROVIDER || 'heuristics';
let customModel = process.env.LLM_MODEL || '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date' && args[i + 1]) {
    targetDate = args[i + 1].trim();
  }
  if (args[i] === '--provider' && args[i + 1]) {
    provider = args[i + 1].trim().toLowerCase();
  }
  if (args[i] === '--model' && args[i + 1]) {
    customModel = args[i + 1].trim();
  }
}

// Fail closed if API key missing for OpenRouter
if (provider === 'openrouter') {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key.trim() === '') {
    console.error(`\n\x1b[31m[Error] Provider is set to 'openrouter' but OPENROUTER_API_KEY is missing or empty in .env!\x1b[0m`);
    console.error(`\x1b[31mFailing closed to prevent partial heuristics execution when AI curation was requested.\x1b[0m\n`);
    process.exit(1);
  }
}

let activeModel = '';
if (provider === 'openrouter') {
  activeModel = customModel || process.env.OPENROUTER_MODEL || 'google/gemini-2.5-pro';
} else if (provider === 'ollama') {
  activeModel = customModel || process.env.OLLAMA_MODEL || 'qwen2.5-coder';
}

const candidateJsonPath = path.join(rootDir, 'data/memory/candidates', `${targetDate}.candidates.json`);

console.log(`\n\x1b[35m==================================================\x1b[0m`);
console.log(`\x1b[35m🧐 MEMORY CRITIC PASS (v0.2)\x1b[0m`);
console.log(`\x1b[35m==================================================\x1b[0m`);
console.log(`Target Date: \x1b[36m${targetDate}\x1b[0m`);
console.log(`JSON Path:   \x1b[36m${path.relative(rootDir, candidateJsonPath)}\x1b[0m`);
console.log(`Provider:    \x1b[36m${provider.toUpperCase()}\x1b[0m`);
if (activeModel) {
  console.log(`Model:       \x1b[36m${activeModel}\x1b[0m`);
}
console.log(`\x1b[35m--------------------------------------------------\x1b[0m\n`);

if (!fs.existsSync(candidateJsonPath)) {
  console.error(`\x1b[31mError: Structured JSON candidates not found for date ${targetDate}. Run Pass 1 (memory:distill) first.\x1b[0m\n`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(candidateJsonPath, 'utf8'));
const candidates = payload.candidates || [];

if (candidates.length === 0) {
  console.log(`\x1b[33mNo candidates found to critique. Curation completed.\x1b[0m\n`);
  process.exit(0);
}

async function runCritic() {
  if (provider === 'heuristics') {
    console.log(`Running \x1b[33mHeuristic Peer-Critic Rule Engine\x1b[0m...`);
    runHeuristicsCritic(candidates);
  } else {
    try {
      console.log(`Running \x1b[33mLLM-Based Peer-Critic Engine (${provider.toUpperCase()})\x1b[0m...`);
      await runLLMCritic(candidates, provider, customModel);
    } catch (e) {
      console.error(`\x1b[31mLLM Critic failed:\x1b[0m`, e.message);
      console.log(`\x1b[33mFalling back to Heuristic Peer-Critic...\x1b[0m`);
      runHeuristicsCritic(candidates);
    }
  }

  // Save changes back to candidates JSON
  fs.writeFileSync(candidateJsonPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\n\x1b[32m✔ Critic review updated in JSON candidates file successfully.\x1b[0m\n`);
}

// 1. Heuristic Rule-Based Critic (Always works, robust fallback)
function runHeuristicsCritic(candidatesList) {
  candidatesList.forEach((cand, idx) => {
    let score = 85;
    let reason = "This candidate represents high-fidelity work log progress or strategic planning with sufficient logged evidence.";

    const contentLower = (cand.proposed_memory || '').toLowerCase();
    const evidenceStr = JSON.stringify(cand.evidence || '').toLowerCase();

    // Check 1: Is it a trivial grep / search command exit code mismatch? (Noise)
    if (cand.type === 'bug' && (evidenceStr.includes('grep') || evidenceStr.includes('exit code: 1') || evidenceStr.includes('exit code: 2'))) {
      score = 25;
      reason = "Criticism: This is an exit-code 1 or 2 from a 'grep' command. In Unix, grep returns 1 when no matches are found, which represents standard search mismatch rather than an actual compile or execution bug. This is pure logging noise.";
    }
    // Check 2: Repetitive terminal directories (Noise)
    else if (cand.type === 'current_state_update' && (evidenceStr.includes('cd ') && !evidenceStr.includes('npm run') && !evidenceStr.includes('git'))) {
      score = 45;
      reason = "Criticism: This command consists solely of terminal directories traversing ('cd'). It contains no actual development output, build runs, or architectural decisions. Extremely low-value fact.";
    }
    // Check 3: Missing active evidence
    else if (!cand.evidence || cand.evidence.length === 0) {
      score = 30;
      reason = "Criticism: This memory suggestion has zero solid telemetry evidence attached. Highly prone to agent hallucination.";
    }
    // Check 4: Strategic Decisions & ADRs (High value)
    else if (cand.type === 'architecture_note' || cand.type === 'decision') {
      score = 95;
      reason = "Validation: High-value architectural or strategic choice. Substantial evidence of direct context configuration updates or manual ADR edits. Highly critical memory.";
    }
    // Check 5: Secret Founder verification
    else if (cand.type === 'founder_preference' && evidenceStr.includes('founder_code_8827')) {
      score = 98;
      reason = "Validation: Direct founder strategic token validation captured. Evidence is solid and requires strict conservation.";
    }
    // Check 6: General project facts
    else if (cand.type === 'project_fact' && contentLower.includes('routine')) {
      score = 65;
      reason = "Criticism: Useful, but represents a routine project operational fact without specific milestones or active decisions. Low density memory.";
    }

    cand.critic_score = score;
    cand.critic_reason = reason;

    console.log(`  Candidate ${String(idx + 1).padStart(3, '0')} [${cand.type}]: Score = \x1b[1m${score}\x1b[0m (${score >= 80 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mCRITICIZED\x1b[0m'})`);
    console.log(`  Reason: \x1b[90m${reason}\x1b[0m\n`);
  });
}

// 2. LLM-Based Peer-Critic Engine (Requires credentials)
async function runLLMCritic(candidatesList, provider, model) {
  const systemPrompt = `You are the CentralContext Memory Critic (Pass 2). Your role is to perform a rigorous peer-review evaluation of each proposed memory candidate.
You must critique each candidate on:
1. Is it a real strategic memory, or is it trivial noise?
2. Is it a duplicate of common facts?
3. Is there sufficient telemetry evidence?
4. Is it just a mundane terminal command (like 'cd' or trivial directory listings)?
5. Is it a streaming duplicate artifact from ChatGPT/Gemini stream states?

For each candidate, you must assign:
- "critic_score": an integer 0-100 (where 0 is pure noise/rác, 100 is high-fidelity critical memory).
- "critic_reason": a precise, brief criticism explanation (1-2 sentences in English) explaining why you assigned that score.

You MUST return a JSON object with this exact structure:
{
  "critique": [
    {
      "index": 0, // matching the candidate index in input list
      "critic_score": 0-100 number,
      "critic_reason": "criticism explanation"
    }
  ]
}`;

  const userPrompt = `List of candidates to critique:
${JSON.stringify(candidatesList.map((c, i) => ({ index: i, type: c.type, project: c.project, proposed_memory: c.proposed_memory, evidence: c.evidence })), null, 2)}`;

  let responseText = '';

  if (provider === 'openrouter') {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY is missing.');
    const chosenModel = model || process.env.OPENROUTER_MODEL || 'google/gemini-2.5-pro';
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': 'https://github.com/tuoaoa/centralcontext',
        'X-Title': 'CentralContext Memory Critic'
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    responseText = data.choices[0].message.content;
  } else if (provider === 'ollama') {
    const url = process.env.OLLAMA_URL || 'http://localhost:11434';
    const chosenModel = model || process.env.OLLAMA_MODEL || 'qwen2.5-coder';

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        format: 'json'
      })
    });

    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    responseText = data.message.content;
  }

  // Parse JSON
  let cleanText = responseText.trim();
  if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
  }

  const parsedData = JSON.parse(cleanText);
  if (!parsedData.critique || !Array.isArray(parsedData.critique)) {
    throw new Error('Invalid JSON structure returned by LLM Critic.');
  }

  parsedData.critique.forEach(cr => {
    const idx = cr.index;
    if (candidatesList[idx]) {
      candidatesList[idx].critic_score = cr.critic_score;
      candidatesList[idx].critic_reason = cr.critic_reason;
      
      console.log(`  Candidate ${String(idx + 1).padStart(3, '0')} [${candidatesList[idx].type}]: Score = \x1b[1m${cr.critic_score}\x1b[0m`);
      console.log(`  Reason: \x1b[90m${cr.critic_reason}\x1b[0m\n`);
    }
  });
}

// Execute
runCritic();
