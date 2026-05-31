/**
 * CentralContext Memory Distillery v0.2
 * Pass 3: Founder Profile Judge (scripts/founder-judge.js)
 * 
 * Purpose: Evaluate how well each candidate matches the Founder Profile and Decision
 * Preferences modeled in data/founder/founder_profile.md. Assigns founder_fit_score & founder_reason.
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

const candidateJsonPath = path.join(rootDir, 'data/memory/candidates', `${targetDate}.candidates.json`);
const founderProfilePath = path.join(rootDir, 'data/founder/founder_profile.md');

console.log(`\n\x1b[35m==================================================\x1b[0m`);
console.log(`\x1b[35m👑 FOUNDER PROFILE JUDGE PASS (v0.2)\x1b[0m`);
console.log(`\x1b[35m==================================================\x1b[0m`);
console.log(`Target Date: \x1b[36m${targetDate}\x1b[0m`);
console.log(`Profile:     \x1b[36m${path.relative(rootDir, founderProfilePath)}\x1b[0m`);
console.log(`Provider:    \x1b[36m${provider.toUpperCase()}\x1b[0m`);
console.log(`\x1b[35m--------------------------------------------------\x1b[0m\n`);

if (!fs.existsSync(candidateJsonPath)) {
  console.error(`\x1b[31mError: Structured JSON candidates not found. Run Pass 1 first.\x1b[0m\n`);
  process.exit(1);
}

if (!fs.existsSync(founderProfilePath)) {
  console.error(`\x1b[31mError: Founder Profile not found at ${path.relative(rootDir, founderProfilePath)}. Run initialization first.\x1b[0m\n`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(candidateJsonPath, 'utf8'));
const candidates = payload.candidates || [];
const founderProfileText = fs.readFileSync(founderProfilePath, 'utf8');

if (candidates.length === 0) {
  console.log(`\x1b[33mNo candidates found to judge. Curation completed.\x1b[0m\n`);
  process.exit(0);
}

async function runJudge() {
  if (provider === 'heuristics') {
    console.log(`Running \x1b[33mHeuristic Digital Twin Judge Engine\x1b[0m...`);
    runHeuristicsJudge(candidates);
  } else {
    try {
      console.log(`Running \x1b[33mLLM-Based Digital Twin Judge (${provider.toUpperCase()})\x1b[0m...`);
      await runLLMJudge(candidates, founderProfileText, provider, customModel);
    } catch (e) {
      console.error(`\x1b[31mLLM Digital Twin Judge failed:\x1b[0m`, e.message);
      console.log(`\x1b[33mFalling back to Heuristic Digital Twin...\x1b[0m`);
      runHeuristicsJudge(candidates);
    }
  }

  // Save changes back to candidates JSON
  fs.writeFileSync(candidateJsonPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\n\x1b[32m✔ Founder fit review updated in JSON candidates file successfully.\x1b[0m\n`);
}

// Helper to dynamically parse the Founder Profile Markdown file (Yêu cầu Digital Twin / Không hardcode)
function parseFounderProfile(profileText) {
  const projects = {};
  const corePrefs = {};
  
  let currentSection = '';
  const lines = profileText.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      currentSection = trimmed.replace('## ', '').toLowerCase().trim();
      continue;
    }
    
    if (currentSection === 'project preferences' && trimmed.startsWith('- **')) {
      // Parse project line: - **qlythuexe** (RentalOS 2.0): **Ecosystem Priority #1**...
      const nameMatch = trimmed.match(/^-\s+\*\*([^*]+)\*\*/);
      if (nameMatch) {
        const projName = nameMatch[1].toLowerCase().trim();
        let priority = 'medium';
        let score = 70;
        
        if (trimmed.toLowerCase().includes('priority #1')) {
          priority = 'high_priority_1';
          score = 96;
        } else if (trimmed.toLowerCase().includes('priority #2')) {
          priority = 'high_priority_2';
          score = 92;
        } else if (trimmed.toLowerCase().includes('priority #3')) {
          priority = 'high_priority_3';
          score = 75;
        } else if (trimmed.toLowerCase().includes('frozen') || trimmed.toLowerCase().includes('paused')) {
          priority = 'frozen';
          score = 25;
        }
        
        projects[projName] = { name: projName, priority, score, lineText: trimmed };
      }
    } else if (currentSection === 'core preferences' && trimmed.startsWith('- **')) {
      // Parse core preferences line: - **local-first**: description
      const prefMatch = trimmed.match(/^-\s+\*\*([^*]+)\*\*:\s*(.*)/);
      if (prefMatch) {
        const prefName = prefMatch[1].toLowerCase().trim();
        const prefDesc = prefMatch[2].toLowerCase().trim();
        corePrefs[prefName] = prefDesc;
      }
    }
  }
  return { projects, corePrefs };
}

// 1. Heuristic Digital Twin Judge (Always works, robust fallback)
function runHeuristicsJudge(candidatesList) {
  const profileData = parseFounderProfile(founderProfileText);
  const projects = profileData.projects;
  const corePrefs = profileData.corePrefs;

  candidatesList.forEach((cand, idx) => {
    let score = 70;
    let reason = "Candidate represents useful progress aligned with active MVP-first development preferences.";

    const project = (cand.project || '').toLowerCase().trim();
    const contentLower = (cand.proposed_memory || '').toLowerCase();
    const evidenceStr = JSON.stringify(cand.evidence || '').toLowerCase();

    // Dynamically match project preference
    let matchedProj = null;
    for (const projKey of Object.keys(projects)) {
      if (project === projKey || project.includes(projKey) || contentLower.includes(projKey)) {
        matchedProj = projects[projKey];
        break;
      }
    }

    if (matchedProj) {
      score = matchedProj.score;
      if (matchedProj.priority === 'high_priority_1') {
        reason = `Validation: Aligns perfectly with Ecosystem Priority #1 (${matchedProj.name}) dynamic profile. Founder is extremely concerned with its milestones and delivery.`;
      } else if (matchedProj.priority === 'high_priority_2') {
        reason = `Validation: Aligns with Ecosystem Priority #2 (${matchedProj.name}) dynamic profile. Core cognitive productivity leverage and context gateway optimization.`;
      } else if (matchedProj.priority === 'high_priority_3') {
        reason = `Validation: Aligns with Ecosystem Priority #3 (${matchedProj.name}) dynamic profile. Moderate operational concern for immediate milestones.`;
      } else if (matchedProj.priority === 'frozen') {
        reason = `Criticism: Low core fit. Project ${matchedProj.name} is currently FROZEN/PAUSED in founder profile to prevent R&D traps.`;
      }
    }
    // Check for Founder Credentials
    else if (cand.type === 'founder_preference' && evidenceStr.includes('founder_code')) {
      score = 98;
      reason = "Validation: Immediate strategic match. Founder verification token sequence detected. Crucial credentials fit.";
    }
    // Check for trivial grep commands or directory traverses
    else if (evidenceStr.includes('grep') || evidenceStr.includes('cd ')) {
      score = 15;
      reason = "Criticism: Fails cost-conscious and MVP-first preferences. Telemetry records of grep searches or file CD traverses are low-value noise and token-waste.";
    }
    // Check for dynamic match of core preferences keywords
    else {
      let matchedPref = null;
      for (const prefName of Object.keys(corePrefs)) {
        if (contentLower.includes(prefName) || contentLower.includes(prefName.replace('-', ' '))) {
          matchedPref = prefName;
          break;
        }
      }
      if (matchedPref) {
        score = 88;
        reason = `Validation: Strongly aligns with Founder's core preference: '${matchedPref}' (${corePrefs[matchedPref].substring(0, 60)}...).`;
      } else if (cand.type === 'bug') {
        score = 65;
        reason = "Validation: Useful bug report, but fits practical execution slightly. Non-strategic compile errors have moderate immediate relevance.";
      }
    }

    cand.founder_fit_score = score;
    cand.founder_reason = reason;

    console.log(`  Candidate ${String(idx + 1).padStart(3, '0')} [${cand.type}]: Fit = \x1b[1m${score}\x1b[0m (${score >= 80 ? '\x1b[32mFIT\x1b[0m' : '\x1b[33mMISFIT\x1b[0m'})`);
    console.log(`  Reason: \x1b[90m${reason}\x1b[0m\n`);
  });
}

// 2. LLM-Based Digital Twin Judge (Requires credentials)
async function runLLMJudge(candidatesList, profileText, provider, model) {
  const systemPrompt = `You are the Founder Digital Twin Judge (Pass 3). Your role is to evaluate how well each memory candidate aligns with the Founder's core values, project preferences, and decision patterns.

Founder Profile (Decision Preferences):
${profileText}

For each candidate, you must:
1. Examine if the associated project is a high strategic priority (like qlythuexe #1 or CentralContext #2) or a frozen/paused thread (like SaveX or aimemory).
2. Check if the memory aligns with core preferences: local-first, cost-conscious (token efficiency), MVP-first, anti-overengineering, and human review.
3. Assign a "founder_fit_score" (an integer 0-100) representing how much the founder cares about this memory.
4. Assign a "founder_reason" (1-2 sentences in English) explaining why you assigned that fit score.

You MUST return a JSON object with this exact structure:
{
  "judgement": [
    {
      "index": 0, // matching the candidate index in input list
      "founder_fit_score": 0-100 number,
      "founder_reason": "fit explanation based on founder profile"
    }
  ]
}`;

  const userPrompt = `List of candidates to evaluate:
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
        'X-Title': 'CentralContext Founder Judge'
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
  if (!parsedData.judgement || !Array.isArray(parsedData.judgement)) {
    throw new Error('Invalid JSON structure returned by LLM Judge.');
  }

  parsedData.judgement.forEach(ju => {
    const idx = ju.index;
    if (candidatesList[idx]) {
      candidatesList[idx].founder_fit_score = ju.founder_fit_score;
      candidatesList[idx].founder_reason = ju.founder_reason;
      
      console.log(`  Candidate ${String(idx + 1).padStart(3, '0')} [${candidatesList[idx].type}]: Fit = \x1b[1m${ju.founder_fit_score}\x1b[0m`);
      console.log(`  Reason: \x1b[90m${ju.founder_reason}\x1b[0m\n`);
    }
  });
}

// Execute
runJudge();
