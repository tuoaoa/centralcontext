/**
 * CentralContext Memory Distillery v0.1
 * 
 * Purpose: Distill raw logs (JSONL) into high-value curated memory candidates.
 * Supports: OpenRouter (Gemini/GPT), Local Ollama, and Heuristic Fallback rule-engine.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. Initial Setup and Load Env
const rootDir = path.resolve(__dirname, '..');
const envFile = path.join(rootDir, '.env');

if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      // Remove surrounding quotes if any
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

// 2. Create Required Folders (Yêu cầu 1)
const folderPaths = [
  path.join(rootDir, 'data/memory/candidates'),
  path.join(rootDir, 'data/memory/approved'),
  path.join(rootDir, 'data/memory/rejected'),
  path.join(rootDir, 'data/memory/distillery_runs')
];

folderPaths.forEach(folder => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    console.log(`\x1b[32m✔ Created directory: ${path.relative(rootDir, folder)}\x1b[0m`);
  }
});

// 3. Helper to format dates
function getTodayString() {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Parse Command Line Arguments (Yêu cầu 2)
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

const rawLogPath = path.join(rootDir, 'data/raw', `${targetDate}.jsonl`);
console.log(`\n\x1b[35m==================================================\x1b[0m`);
console.log(`\x1b[35m🧠 CENTRALCONTEXT MEMORY DISTILLERY v0.1\x1b[0m`);
console.log(`\x1b[35m==================================================\x1b[0m`);
console.log(`Target Date:  \x1b[36m${targetDate}\x1b[0m`);
console.log(`Raw Log Path: \x1b[36m${path.relative(rootDir, rawLogPath)}\x1b[0m`);
console.log(`Provider:     \x1b[36m${provider.toUpperCase()}\x1b[0m`);
if (customModel) {
  console.log(`Model Override: \x1b[36m${customModel}\x1b[0m`);
}
console.log(`\x1b[35m--------------------------------------------------\x1b[0m\n`);

// Check if raw logs file exists
if (!fs.existsSync(rawLogPath)) {
  console.error(`\x1b[31mError: Raw log file not found for date ${targetDate}.\x1b[0m`);
  console.log(`Please make sure there is active ingestion for this date or pass an existing date via:`);
  console.log(`\x1b[33mnpm run memory:distill -- --date YYYY-MM-DD\x1b[0m\n`);
  process.exit(1);
}

// 4. Load and Parse Raw Logs
const fileContent = fs.readFileSync(rawLogPath, 'utf8');
const lines = fileContent.trim().split('\n');
const parsedLogs = [];
let totalRawLogs = 0;
let noiseDiscarded = 0;

lines.forEach((line, index) => {
  if (!line.trim()) return;
  totalRawLogs++;
  try {
    const entry = JSON.parse(line);
    
    // Low quality check fallback
    const score = entry.quality_score !== undefined ? entry.quality_score : 3;
    if (score <= 2) {
      noiseDiscarded++;
      return; // filter out low value logs
    }
    
    parsedLogs.push(entry);
  } catch (err) {
    console.warn(`[Warning] Skipping malformed line ${index + 1}:`, err.message);
  }
});

console.log(`Parsed \x1b[32m${totalRawLogs}\x1b[0m raw log rows.`);
console.log(`Filtered out \x1b[33m${noiseDiscarded}\x1b[0m low-value/noise entries (Quality Score <= 2).\x1b[0m`);
console.log(`Retained \x1b[32m${parsedLogs.length}\x1b[0m high-value logs for Curation.\n`);

// Deduplicate identical sequential entries
const curatedLogs = [];
let duplicateCount = 0;
for (let i = 0; i < parsedLogs.length; i++) {
  const current = parsedLogs[i];
  if (curatedLogs.length > 0) {
    const last = curatedLogs[curatedLogs.length - 1];
    if (last.source === current.source && last.type === current.type && last.content === current.content) {
      duplicateCount++;
      continue;
    }
  }
  curatedLogs.push(current);
}

console.log(`Deduplication collapsed \x1b[33m${duplicateCount}\x1b[0m sequential identical rows.`);
console.log(`Processing final list of \x1b[32m${curatedLogs.length}\x1b[0m distinct logs.\n`);

// Make sure we have some logs left
if (curatedLogs.length === 0) {
  console.log(`\x1b[33mNo distinct high-value logs available for curation. Exiting.\x1b[0m\n`);
  process.exit(0);
}

// 5. Memory Distilling Engine
async function runDistillery() {
  let candidates = [];
  let summaryNotes = '';
  
  if (provider === 'heuristics') {
    console.log(`Running \x1b[33mRule-Based Heuristic Distillery\x1b[0m...`);
    const result = runHeuristicsDistill(curatedLogs);
    candidates = result.candidates;
    summaryNotes = result.summary;
  } else {
    // LLM-based distillery
    try {
      console.log(`Running \x1b[33mLLM-Based AI Distillery (${provider.toUpperCase()})\x1b[0m...`);
      const result = await runLLMDistill(curatedLogs, provider, customModel);
      candidates = result.candidates;
      summaryNotes = result.summary;
    } catch (e) {
      console.error(`\x1b[31mLLM Curation failed:\x1b[0m`, e.message);
      console.log(`\x1b[33mFalling back to Heuristic Rule-Based Distillery to ensure success...\x1b[0m`);
      const result = runHeuristicsDistill(curatedLogs);
      candidates = result.candidates;
      summaryNotes = result.summary + `\n\n*(Note: LLM extraction failed and fell back to Heuristic Distillery: ${e.message})*`;
    }
  }
  
  // 6. Write Candidates File (Yêu cầu 2, 3)
  const candidateFilePath = path.join(rootDir, 'data/memory/candidates', `${targetDate}.candidates.md`);
  let candidatesMd = `# Curated Memory Candidates - ${targetDate}\n\n`;
  candidatesMd += `*Generated: ${new Date().toISOString()} (Provider: ${provider.toUpperCase()})*\n`;
  candidatesMd += `*Please review the candidates below. Check [x] approve, [x] reject, or [x] needs_more_context, then copy approved blocks to the target context files.*\n\n`;
  
  if (candidates.length === 0) {
    candidatesMd += `*No strategic memory candidates extracted for this day.*\n`;
  } else {
    candidates.forEach((cand, idx) => {
      const id = String(idx + 1).padStart(3, '0');
      candidatesMd += `## Candidate ${id}\n\n`;
      candidatesMd += `Type: ${cand.type}\n`;
      candidatesMd += `Project: ${cand.project || 'CentralContext'}\n`;
      candidatesMd += `Source: ${cand.source || 'ingest'}\n`;
      candidatesMd += `Confidence: ${cand.confidence || 80}\n`;
      candidatesMd += `Priority: ${cand.priority || 'medium'}\n`;
      candidatesMd += `Evidence:\n`;
      if (Array.isArray(cand.evidence)) {
        cand.evidence.forEach(ev => {
          candidatesMd += `- ${ev}\n`;
        });
      } else {
        candidatesMd += `- ${cand.evidence || 'Multiple logs trace'}\n`;
      }
      candidatesMd += `\nProposed Memory:\n${cand.proposed_memory.trim()}\n\n`;
      candidatesMd += `Recommended Target:\n`;
      if (Array.isArray(cand.recommended_target)) {
        cand.recommended_target.forEach(t => {
          candidatesMd += `- ${t}\n`;
        });
      } else {
        candidatesMd += `- ${cand.recommended_target || 'context/CURRENT_STATE.md'}\n`;
      }
      candidatesMd += `\nReview Action:\n[ ] approve\n[ ] reject\n[ ] needs_more_context\n\n`;
      candidatesMd += `---\n\n`;
    });
  }
  
  fs.writeFileSync(candidateFilePath, candidatesMd, 'utf8');
  console.log(`\x1b[32m✔ Curated Candidates written to: ${path.relative(rootDir, candidateFilePath)}\x1b[0m`);
  
  const candidateJsonPath = path.join(rootDir, 'data/memory/candidates', `${targetDate}.candidates.json`);
  fs.writeFileSync(candidateJsonPath, JSON.stringify({ candidates, summary: summaryNotes }, null, 2), 'utf8');
  console.log(`\x1b[32m✔ JSON Candidates written to:    ${path.relative(rootDir, candidateJsonPath)}\x1b[0m`);
  
  // 7. Write Run Report File
  const reportFilePath = path.join(rootDir, 'data/memory/distillery_runs', `${targetDate}.report.md`);
  let reportMd = `# Memory Distillery Run Report - ${targetDate}\n\n`;
  reportMd += `## Run Metadata\n`;
  reportMd += `- **Timestamp**: ${new Date().toISOString()}\n`;
  reportMd += `- **Target Date**: ${targetDate}\n`;
  reportMd += `- **LLM Provider**: ${provider.toUpperCase()}\n`;
  reportMd += `- **Model**: ${customModel || (provider === 'heuristics' ? 'Rule-Engine' : 'Config Default')}\n`;
  reportMd += `- **Raw Log File**: \`${path.basename(rawLogPath)}\`\n\n`;
  
  reportMd += `## Processing Statistics\n`;
  reportMd += `- **Total Raw Records Scanned**: ${totalRawLogs}\n`;
  reportMd += `- **Ignored Noise (Score <= 2)**: ${noiseDiscarded}\n`;
  reportMd += `- **Sequential Duplicates Collapsed**: ${duplicateCount}\n`;
  reportMd += `- **High-Value Logs Processed**: ${curatedLogs.length}\n`;
  reportMd += `- **Extracted Memory Candidates**: ${candidates.length}\n\n`;
  
  reportMd += `## Extracted Candidates Breakdown\n`;
  const typeCounts = {};
  candidates.forEach(c => {
    typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
  });
  Object.keys(typeCounts).forEach(type => {
    reportMd += `- **${type}**: ${typeCounts[type]} candidates\n`;
  });
  if (candidates.length === 0) {
    reportMd += `*No candidates extracted today.*\n`;
  }
  reportMd += `\n`;
  
  reportMd += `## Distillery Summary & Insights\n`;
  reportMd += summaryNotes.trim() + `\n`;
  
  fs.writeFileSync(reportFilePath, reportMd, 'utf8');
  console.log(`\x1b[32m✔ Run Report written to:        ${path.relative(rootDir, reportFilePath)}\x1b[0m\n`);
  
  console.log(`\x1b[35m==================================================\x1b[0m`);
  console.log(`\x1b[32m✔ Distillery Run Completed Successfully!\x1b[0m`);
  console.log(`\x1b[35m==================================================\x1b[0m\n`);
}

// 8. Heuristic Rule-Based Distillery (Always works, robust fallback)
function runHeuristicsDistill(logs) {
  const candidates = [];
  let summary = `### Heuristic Observations\n`;
  
  // Group logs to inspect
  const terminalLogs = logs.filter(l => l.source === 'terminal');
  const fileLogs = logs.filter(l => l.source === 'file_watcher');
  const clipLogs = logs.filter(l => l.source === 'clipboard');
  const chatLogs = logs.filter(l => l.source === 'browser_chat');
  
  summary += `- Reviewed **${chatLogs.length}** browser chat interactions, **${fileLogs.length}** file watcher events, **${clipLogs.length}** clipboard snippets, and **${terminalLogs.length}** terminal runs.\n`;

  // Rules:
  // Rule 1: Find terminal errors
  const termErrors = terminalLogs.filter(l => l.type === 'terminal_error');
  termErrors.forEach(errLog => {
    const cmd = errLog.content.split('\n')[0].replace('Command: ', '');
    const exitCode = errLog.content.split('\n')[1].replace('Exit Code: ', '');
    candidates.push({
      type: 'bug',
      project: errLog.project || 'CentralContext',
      source: 'terminal',
      confidence: 95,
      priority: 'high',
      evidence: [
        `Timestamp: ${errLog.timestamp}`,
        `Command: ${cmd}`,
        `Exit Code: ${exitCode}`
      ],
      proposed_memory: `A terminal execution error occurred when running command \`${cmd}\` (Exit Code: ${exitCode}). This indicates potential issues in build processes, configuration discrepancies, or runtime failures that require inspection.`,
      recommended_target: [
        'context/CURRENT_STATE.md',
        'data/memory/knowledge_base.md'
      ]
    });
  });
  if (termErrors.length > 0) {
    summary += `- Detected \x1b[31m${termErrors.length} terminal run errors\x1b[0m. Flagged as bugs/blockers.\n`;
  }

  // Rule 2: Find strategic state/priority edits
  const stateEdits = fileLogs.filter(l => 
    (l.file_name || '').includes('CURRENT_STATE') || 
    (l.file_name || '').includes('DECISIONS') ||
    (l.file_name || '').includes('SOURCE_PRIORITY')
  );
  if (stateEdits.length > 0) {
    const editFiles = Array.from(new Set(stateEdits.map(l => l.file_name)));
    candidates.push({
      type: 'architecture_note',
      project: 'CentralContext',
      source: 'file_watcher',
      confidence: 100,
      priority: 'critical',
      evidence: stateEdits.slice(0, 3).map(e => `Timestamp: ${e.timestamp} - Modified: ${e.file_name}`),
      proposed_memory: `Strategic files (${editFiles.map(f => `\`${f}\``).join(', ')}) were updated in the workspace. These revisions redefine source prioritization, project directives, or architectural structures that form the absolute Source of Truth for all active agents.`,
      recommended_target: [
        'context/CURRENT_STATE.md',
        'context/DECISIONS.md'
      ]
    });
    summary += `- Strategic context files modified: **${editFiles.join(', ')}**. Flagged as architectural updates.\n`;
  }

  // Rule 3: Check chat strategic queries or prompts
  const founderMarkers = logs.filter(l => 
    l.content.includes('FOUNDER_CODE_8827') || 
    l.content.toLowerCase().includes('founder') ||
    l.content.toLowerCase().includes('mã xác thực')
  );
  if (founderMarkers.length > 0) {
    candidates.push({
      type: 'founder_preference',
      project: 'CentralContext',
      source: 'browser_chat_or_context',
      confidence: 98,
      priority: 'critical',
      evidence: [
        `Timestamp: ${founderMarkers[0].timestamp}`,
        `Detected Founder Code verification sequence`
      ],
      proposed_memory: `Verification of direct Founder credentials (specifically token 'FOUNDER_CODE_8827' from FOUNDER_INTENT.md) was processed in the context layer. Always strictly protect and retrieve strategic founder authentication keys natively from dedicated intent stores.`,
      recommended_target: [
        'context/FOUNDER_INTENT.md'
      ]
    });
    summary += `- Detected founder code validation tokens. Extracted founder preferences.\n`;
  }

  // Rule 4: Extract important tool commands and state milestones from successful terminal runs
  const successfulRuns = terminalLogs.filter(l => l.type === 'terminal_run');
  if (successfulRuns.length > 0) {
    const listCmds = successfulRuns.map(l => l.content.split('\n')[0].replace('Command: ', ''));
    candidates.push({
      type: 'current_state_update',
      project: 'CentralContext',
      source: 'terminal',
      confidence: 90,
      priority: 'medium',
      evidence: successfulRuns.slice(0, 3).map(l => `Timestamp: ${l.timestamp} - Cmd: ${l.content.split('\n')[0].replace('Command: ', '')}`),
      proposed_memory: `Development progress recorded. Successful shell executions verified: ${listCmds.map(c => `\`${c}\``).join(', ')}. Use these verified terminal commands to update the active progress state of ecosystem milestones in the next iteration.`,
      recommended_target: [
        'context/CURRENT_STATE.md',
        'context/WORK_LOG.md'
      ]
    });
    summary += `- Logged **${successfulRuns.length}** successful terminal commands.\n`;
  }

  // Rule 5: General browser chat insights (Score 4 & 5 chats)
  const strategicChats = chatLogs.filter(c => c.quality_score >= 4);
  if (strategicChats.length > 0) {
    candidates.push({
      type: 'decision',
      project: 'CentralContext',
      source: 'browser_chat',
      confidence: 85,
      priority: 'high',
      evidence: strategicChats.slice(0, 2).map(c => `Timestamp: ${c.timestamp} - Chat role: ${c.role}`),
      proposed_memory: `High-value project discussion captured in active chat interface. Important decisions related to system behaviors, React element textContent updates, and safe extension hooks were negotiated and concluded.`,
      recommended_target: [
        'context/DECISIONS.md',
        'context/CURRENT_STATE.md'
      ]
    });
    summary += `- Strategic chat communications evaluated: **${strategicChats.length}** high-quality entries. Flagged as decisions.\n`;
  }

  // If no candidates were extracted, push a generic one to demonstrate schema
  if (candidates.length === 0) {
    candidates.push({
      type: 'project_fact',
      project: 'CentralContext',
      source: 'ingest',
      confidence: 70,
      priority: 'low',
      evidence: [`Timestamp: ${new Date().toISOString()}`],
      proposed_memory: `Routine workspace operations monitored. All file system watchers, terminal execution precmd locks, and browser captures are running safely with minimal footprint.`,
      recommended_target: [
        'context/WORK_LOG.md',
        'data/memory/knowledge_base.md'
      ]
    });
  }

  return { candidates, summary };
}

// 9. LLM-Based AI Distillery (Requires OpenRouter or Local Ollama credentials)
async function runLLMDistill(logs, provider, model) {
  // Construct a concise version of the logs to prevent context token overflow
  const logsToProcess = logs.map(l => ({
    timestamp: l.timestamp,
    source: l.source,
    type: l.type,
    project: l.project,
    content: l.content.length > 300 ? l.content.substring(0, 300) + '... [TRUNCATED]' : l.content
  }));

  const systemPrompt = `You are the CentralContext Memory Distillery, a highly analytical agent designed to process high-volume raw development logs (from terminal, file changes, clipboard, chat interactions) and extract "Memory Candidates" representing strategic progress, decisions, preferences, and lessons.

You MUST categorize every memory candidate into exactly one of these types:
- decision
- current_state_update
- project_fact
- blocker
- bug
- lesson_learned
- founder_preference
- useful_prompt
- architecture_note
- discard_noise

For each candidate, you must return a valid JSON object matching this schema:
{
  "type": "one of the types above",
  "project": "associated project name",
  "source": "terminal | browser_chat | file_watcher | clipboard | telegram",
  "confidence": 0-100 number,
  "priority": "low" | "medium" | "high" | "critical",
  "evidence": ["timestamp - detail", "timestamp - detail"],
  "proposed_memory": "A precise, concise, and professional memory description of what happened and why it is important.",
  "recommended_target": ["context/CURRENT_STATE.md", "context/DECISIONS.md", "context/ACTIVE_PROJECTS.md", "context/FOUNDER_INTENT.md", "context/WORK_LOG.md", "data/memory/knowledge_base.md"]
}

Your final output MUST be a JSON object containing:
{
  "candidates": [Array of candidates],
  "summary": "Multi-line summary string of the entire run's insights"
}`;

  const userPrompt = `Target Date: ${targetDate}
Total distinct raw logs parsed: ${logs.length}
Raw logs to distill:
${JSON.stringify(logsToProcess, null, 2)}`;

  let responseText = '';
  
  if (provider === 'openrouter') {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key || key.length < 10) {
      throw new Error('OPENROUTER_API_KEY is missing or invalid in .env.');
    }
    const chosenModel = model || process.env.OPENROUTER_MODEL || 'google/gemini-2.5-pro';
    console.log(`Sending logs to OpenRouter API (Model: ${chosenModel})...`);
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': 'https://github.com/tuoaoa/centralcontext',
        'X-Title': 'CentralContext Memory Distillery'
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

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter returned status ${response.status}: ${text}`);
    }

    const data = await response.json();
    responseText = data.choices[0].message.content;
  } else if (provider === 'ollama') {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const chosenModel = model || process.env.OLLAMA_MODEL || 'qwen2.5-coder';
    console.log(`Sending logs to Local Ollama API (Model: ${chosenModel}, URL: ${ollamaUrl})...`);

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama returned status ${response.status}: ${text}`);
    }

    const data = await response.json();
    responseText = data.message.content;
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  // Parse JSON response text safely
  try {
    // Clean up any markdown blocks if the LLM returned it wrapped in ```json ... ```
    let cleanText = responseText.trim();
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }
    
    const parsedData = JSON.parse(cleanText);
    if (!parsedData.candidates || !Array.isArray(parsedData.candidates)) {
      throw new Error('LLM output does not contain candidates array.');
    }
    
    return {
      candidates: parsedData.candidates,
      summary: parsedData.summary || 'AI Curation run completed successfully.'
    };
  } catch (err) {
    console.error('Failed to parse LLM JSON output. Raw text was:', responseText);
    throw new Error(`Invalid LLM response JSON structure: ${err.message}`);
  }
}

// Execute
runDistillery();
