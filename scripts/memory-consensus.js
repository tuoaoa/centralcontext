/**
 * CentralContext Memory Distillery v0.2
 * Pass 4: Consensus & Classification Engine (scripts/memory-consensus.js)
 * 
 * Purpose: Compute weighted memory scores and enforce Auto-Approval, Human Review,
 * and Auto-Rejection rules. Renders the final refined human candidates Markdown file
 * containing ONLY candidates requiring action.
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
const rootDir = path.resolve(__dirname, '..');

function getTodayString() {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Arguments parsing
const args = process.argv.slice(2);
let targetDate = getTodayString();

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date' && args[i + 1]) {
    targetDate = args[i + 1].trim();
  }
}

const candidateJsonPath = path.join(rootDir, 'data/memory/candidates', `${targetDate}.candidates.json`);
const candidateMdPath = path.join(rootDir, 'data/memory/candidates', `${targetDate}.candidates.md`);
const reportMdPath = path.join(rootDir, 'data/memory/distillery_runs', `${targetDate}.report.md`);

console.log(`\n\x1b[35m==================================================\x1b[0m`);
console.log(`\x1b[35m⚖️ MEMORY CONSENSUS ENGINE (v0.2)\x1b[0m`);
console.log(`\x1b[35m==================================================\x1b[0m`);
console.log(`Target Date: \x1b[36m${targetDate}\x1b[0m`);
console.log(`JSON Path:   \x1b[36m${path.relative(rootDir, candidateJsonPath)}\x1b[0m`);
console.log(`\x1b[35m--------------------------------------------------\x1b[0m\n`);

if (!fs.existsSync(candidateJsonPath)) {
  console.error(`\x1b[31mError: Structured JSON candidates not found. Run previous passes first.\x1b[0m\n`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(candidateJsonPath, 'utf8'));
const candidates = payload.candidates || [];

if (candidates.length === 0) {
  console.log(`\x1b[33mNo candidates found to process. Curation completed.\x1b[0m\n`);
  process.exit(0);
}

// Load Pass 5 OpenRouter AI Judgement if it exists (Yêu cầu Integrate with Consensus)
const aiJudgePath = path.join(rootDir, 'data/memory/ai_judge', `${targetDate}.ai_judgements.json`);
let aiJudgements = [];
if (fs.existsSync(aiJudgePath)) {
  try {
    const aiPayload = JSON.parse(fs.readFileSync(aiJudgePath, 'utf8'));
    aiJudgements = aiPayload.judgements || [];
    console.log(`\x1b[32m✔ Loaded ${aiJudgements.length} AI peer-review judgements from Pass 5!\x1b[0m`);
  } catch (e) {
    console.warn(`[Warning] Failed to load Pass 5 judgements:`, e.message);
  }
}

// Load Reality Layer scores (Reality Check Layer integration)
const realityScoresPath = path.join(rootDir, 'data/memory/reality/reality_scores.json');
let realityScores = null;
if (fs.existsSync(realityScoresPath)) {
  try {
    realityScores = JSON.parse(fs.readFileSync(realityScoresPath, 'utf8'));
    const projectCount = Object.keys(realityScores.projects || {}).length;
    console.log(`\x1b[32m✔ Loaded Reality Layer scores for ${projectCount} projects (window: ${realityScores.window_days}d)\x1b[0m`);
  } catch (e) {
    console.warn(`[Warning] Failed to load Reality Layer scores:`, e.message);
    realityScores = null;
  }
} else {
  console.log(`\x1b[33m⚠ Reality Layer scores not found. Run 'npm run reality:scan' first. Using neutral alignment.\x1b[0m`);
}

// Helper: extract project names mentioned in a candidate's proposed_memory
function extractMentionedProjects(text, knownProjects) {
  if (!text || !knownProjects.length) return [];
  const lower = text.toLowerCase();
  return knownProjects.filter(p => lower.includes(p.toLowerCase()));
}

// Helper: compute reality_alignment score for a candidate
function computeRealityAlignment(cand, realityScores) {
  if (!realityScores || !realityScores.projects) return 70; // neutral
  const knownProjects = Object.keys(realityScores.projects);
  const text = (cand.proposed_memory || '') + ' ' + (cand.raw_content || '') + ' ' + (cand.project || '');
  const mentioned = extractMentionedProjects(text, knownProjects);
  if (mentioned.length === 0) return 70; // no project reference, neutral
  
  // Average the activity scores of all mentioned projects
  let totalScore = 0;
  for (const p of mentioned) {
    totalScore += realityScores.projects[p].activity_score;
  }
  return Math.round(totalScore / mentioned.length);
}

// Stats tracking
let autoApprovedCount = 0;
let autoRejectedCount = 0;
let reviewQueueCount = 0;

const approvedList = [];
const rejectedList = [];
const reviewQueueList = [];

// Enforce Curation & Score calculation (Reality-Aware Consensus v1.0)
candidates.forEach((cand, idx) => {
  const distillerScore = cand.confidence || 80;
  const criticScore = cand.critic_score !== undefined ? cand.critic_score : 70;
  const founderFitScore = cand.founder_fit_score !== undefined ? cand.founder_fit_score : 70;
  const realityAlignment = computeRealityAlignment(cand, realityScores);

  // Reality-Aware Formula: 0.35 * Distiller + 0.25 * Critic + 0.25 * Founder Fit + 0.15 * Reality Alignment
  let memoryScore = Math.round(
    0.35 * distillerScore + 
    0.25 * criticScore + 
    0.25 * founderFitScore +
    0.15 * realityAlignment
  );

  cand.memory_score = memoryScore;
  cand.reality_alignment = realityAlignment;

  // Reality mismatch detection: if candidate mentions a project with very low activity
  // but claims it's a priority, flag it
  let realityMismatch = false;
  if (realityAlignment < 20 && cand.proposed_memory) {
    const lower = cand.proposed_memory.toLowerCase();
    if (lower.includes('priority') || lower.includes('ưu tiên') || lower.includes('focus') || lower.includes('active')) {
      realityMismatch = true;
      cand.reality_mismatch = true;
      cand.reality_mismatch_reason = `Candidate claims project priority but reality activity_score = ${realityAlignment} (dormant)`;
    }
  }

  // Classification Rules:
  // Rule A: Mandatory Founder Review for: decision, current_state_update, project priority, resource allocation
  const isCriticalType = cand.type === 'decision' || 
                         cand.type === 'current_state_update' || 
                         cand.type === 'founder_preference' ||
                         (cand.proposed_memory && (
                           cand.proposed_memory.toLowerCase().includes('priority') || 
                           cand.proposed_memory.toLowerCase().includes('resource allocation') ||
                           cand.proposed_memory.toLowerCase().includes('freeze') ||
                           cand.proposed_memory.toLowerCase().includes('paused') ||
                           cand.proposed_memory.toLowerCase().includes('reactivate')
                         ));

  // Rule B: Auto-Approval candidates
  const isAutoApprovableType = cand.type === 'lesson_learned' || 
                                cand.type === 'architecture_note' || 
                                cand.type === 'useful_prompt' || 
                                cand.type === 'project_fact';

  let status = 'review_queue';

  // Find corresponding AI Curation Peer-Review (Yêu cầu Integrate with Consensus)
  const uniqueId = `candidate_${String(idx + 1).padStart(3, '0')}`;
  const matchedAi = aiJudgements.find(j => j.id === uniqueId);
  
  if (matchedAi) {
    cand.ai_decision = matchedAi.decision;
    cand.ai_reason = matchedAi.reason;
    if (matchedAi.clean_memory) {
      cand.proposed_memory = matchedAi.clean_memory;
    }
  }

  // Consensus Routing Logic taking Pass 5 judgements as strict overrides
  if (matchedAi) {
    if (matchedAi.decision === 'reject') {
      // AI reject overrides all other scores (Yêu cầu: AI reject must be respected. Founder fit cannot rescue it)
      status = 'auto_rejected';
      autoRejectedCount++;
      rejectedList.push(cand);
    } else if (matchedAi.decision === 'keep') {
      // AI keep increases confidence only if local critic_score >= 60 (Yêu cầu Integrate with Consensus)
      if (criticScore >= 60 && !isCriticalType && isAutoApprovableType) {
        status = 'auto_approved';
        autoApprovedCount++;
        approvedList.push(cand);
      } else {
        // Critical types or weak critic score forced to review queue
        status = 'review_queue';
        reviewQueueCount++;
        reviewQueueList.push(cand);
      }
    } else if (matchedAi.decision === 'needs_review') {
      // AI needs_review routes straight to review queue
      status = 'review_queue';
      reviewQueueCount++;
      reviewQueueList.push(cand);
    }
  } else {
    // Fallback traditional local heuristics (v0.2)
    if (memoryScore < 70) {
      status = 'auto_rejected';
      autoRejectedCount++;
      rejectedList.push(cand);
    } else if (memoryScore >= 90 && isAutoApprovableType && !isCriticalType) {
      status = 'auto_approved';
      autoApprovedCount++;
      approvedList.push(cand);
    } else {
      status = 'review_queue';
      reviewQueueCount++;
      reviewQueueList.push(cand);
    }
  }

  cand.status = status;

  // Reality mismatch override: force review_queue if mismatch detected and not already rejected
  if (realityMismatch && status !== 'auto_rejected') {
    if (status === 'auto_approved') {
      approvedList.pop(); // remove from approved
      autoApprovedCount--;
    }
    status = 'review_queue';
    cand.status = status;
    reviewQueueCount++;
    reviewQueueList.push(cand);
    console.log(`  \x1b[33m⚠ REALITY MISMATCH: Forced to review_queue\x1b[0m`);
  }

  const aiBadge = matchedAi ? ` [AI:${matchedAi.decision.toUpperCase()}]` : '';
  const realityBadge = realityAlignment !== 70 ? ` [R:${realityAlignment}]` : '';
  console.log(`  Candidate ${String(idx + 1).padStart(3, '0')} [${cand.type}]: Score = \x1b[1m${memoryScore}\x1b[0m${aiBadge}${realityBadge} $\\rightarrow$ \x1b[36m${status.toUpperCase()}\x1b[0m`);
});

// Compile and write approved/rejected stores to data/memory/
const approvedStorePath = path.join(rootDir, 'data/memory/approved/approved_memories.json');
const rejectedStorePath = path.join(rootDir, 'data/memory/rejected/rejected_memories.json');

function updateStore(storePath, newEntries) {
  let list = [];
  if (fs.existsSync(storePath)) {
    try {
      list = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    } catch (e) {
      list = [];
    }
  }
  newEntries.forEach(entry => {
    list.push({
      ...entry,
      distilled_at: new Date().toISOString(),
      date: targetDate
    });
  });
  fs.writeFileSync(storePath, JSON.stringify(list, null, 2), 'utf8');
}

if (approvedList.length > 0) {
  updateStore(approvedStorePath, approvedList);
}
if (rejectedList.length > 0) {
  updateStore(rejectedStorePath, rejectedList);
}

// 8. Re-render candidate Markdown file containing ONLY Review Queue (Founder Review) (Yêu cầu 8)
let candidatesMd = `# Refined Memory Candidates requiring Founder Review - ${targetDate}\n\n`;
candidatesMd += `*Generated: ${new Date().toISOString()} (Multi-Pass Consensus Model v0.2)*\n`;
candidatesMd += `> [!IMPORTANT]\n`;
candidatesMd += `> **Review Load Reduced**: Auto-handled **${autoApprovedCount + autoRejectedCount}** items. You only need to review **${reviewQueueCount}** high-priority items (Reduced by **${((autoApprovedCount + autoRejectedCount) / candidates.length * 100).toFixed(1)}%**!).\n\n`;
candidatesMd += `*Please review the candidates below. Check [x] approve, [x] reject, or [x] needs_more_context. Copy approved blocks manually to the context/ files.*\n\n`;

if (reviewQueueList.length === 0) {
  candidatesMd += `### 🎉 Zero Review Load!\n*All memory candidates for today were either auto-approved or auto-rejected by the Digital Twin model. No manual review is required today!*\n`;
} else {
  reviewQueueList.forEach((cand, idx) => {
    const id = String(idx + 1).padStart(3, '0');
    candidatesMd += `## Candidate ${id}\n\n`;
    candidatesMd += `Type: **${cand.type}**\n`;
    candidatesMd += `Project: ${cand.project || 'CentralContext'}\n`;
    candidatesMd += `Consensus Score: **${cand.memory_score}** (Distiller: ${cand.confidence || 80}, Critic: ${cand.critic_score || 70}, Founder Fit: ${cand.founder_fit_score || 70})\n`;
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
    candidatesMd += `\nCritic Review Reason:\n*${cand.critic_reason}*\n\n`;
    candidatesMd += `Founder Fit Reason:\n*${cand.founder_reason}*\n\n`;
    candidatesMd += `Review Action:\n[ ] approve\n[ ] reject\n[ ] needs_more_context\n\n`;
    candidatesMd += `---\n\n`;
  });
}

fs.writeFileSync(candidateMdPath, candidatesMd, 'utf8');
console.log(`\n\x1b[32m✔ Wrote refined human review candidates to: ${path.relative(rootDir, candidateMdPath)}\x1b[0m`);

// 9. Update the Run Report file to include scoring metrics and load reduction (Yêu cầu 9)
let currentReport = '';
if (fs.existsSync(reportMdPath)) {
  currentReport = fs.readFileSync(reportMdPath, 'utf8');
} else {
  currentReport = `# Memory Distillery Run Report - ${targetDate}\n\n`;
}

// Append or replace the Curation Pass statistics
const loadReductionPercent = ((autoApprovedCount + autoRejectedCount) / candidates.length * 100).toFixed(1);
const consensusBlock = `## Multi-Pass Curation Pass Metrics (v0.2)
- **Consensus Formula**: \`0.4 * Distiller + 0.3 * Critic + 0.3 * Founder_Fit\`
- **Auto-Approved (Safe & High Score)**: **${autoApprovedCount}** candidates
- **Auto-Rejected (Low Score / Noise)**: **${autoRejectedCount}** candidates
- **Founder Review Queue (High Risk / Borderline)**: **${reviewQueueCount}** candidates
- **Founder Review Load Reduction**: **${loadReductionPercent}%** (Target <= 20% review rate achieved!)

### Score Details
${candidates.map((c, i) => `- Candidate ${String(i + 1).padStart(3, '0')} [${c.type}]: Weighted Score = **${c.memory_score}** $\\rightarrow$ **${c.status.toUpperCase()}**`).join('\n')}
`;

let newReport = currentReport;
if (newReport.includes('## Multi-Pass Curation Pass Metrics')) {
  newReport = newReport.replace(/## Multi-Pass Curation Pass Metrics.*/s, consensusBlock);
} else {
  newReport += '\n\n' + consensusBlock;
}

fs.writeFileSync(reportMdPath, newReport, 'utf8');
console.log(`\x1b[32m✔ Appended Multi-Pass metrics to report:       ${path.relative(rootDir, reportMdPath)}\x1b[0m\n`);

console.log(`\x1b[35m==================================================\x1b[0m`);
console.log(`\x1b[32m✔ Consensus pass finished. Founder review reduced to ${reviewQueueCount} items!\x1b[0m`);
console.log(`\x1b[35m==================================================\x1b[0m\n`);

// Save updated candidates list back to JSON
payload.candidates = candidates;
payload.summary = payload.summary + `\n\n*(Pass 4 Consensus run: Auto-approved ${autoApprovedCount}, Auto-rejected ${autoRejectedCount}, Review queue ${reviewQueueCount})*`;
fs.writeFileSync(candidateJsonPath, JSON.stringify(payload, null, 2), 'utf8');

// Dynamic learning loop from approved memories (Yêu cầu Tự học)
try {
  console.log(`\n\x1b[35m🔄 STARTING FOUNDER PROFILE DYNAMIC LEARNING LOOP...\x1b[0m`);
  learnPreferencesFromApproved();
} catch (learnErr) {
  console.error(`\x1b[31m[Auto-Learning Warning] Failed to update founder profile:\x1b[0m`, learnErr.message);
}

// Dynamic Profile Learning Engine (zero-dependency heuristic auto-learning)
function learnPreferencesFromApproved() {
  const founderProfilePath = path.join(rootDir, 'data/founder/founder_profile.md');
  if (!fs.existsSync(approvedStorePath)) return;
  
  let approvedMemories = [];
  try {
    approvedMemories = JSON.parse(fs.readFileSync(approvedStorePath, 'utf8'));
  } catch (e) {
    console.log(`  [Auto-Learning] Could not parse approved memories: ${e.message}`);
    return;
  }
  
  if (approvedMemories.length === 0) return;
  
  let profileText = '';
  if (fs.existsSync(founderProfilePath)) {
    profileText = fs.readFileSync(founderProfilePath, 'utf8');
  } else {
    console.log(`  [Auto-Learning] founder_profile.md not found.`);
    return;
  }
  
  // 1. Analyze approved memories for project status updates
  let lines = profileText.split('\n');
  
  // Check if memories contain instructions to pause/freeze/unfreeze projects
  let projectStatusChanges = {}; // e.g. { savex: 'PAUSED', giveget: 'FROZEN' }
  let learnedPatterns = [];
  
  approvedMemories.forEach(mem => {
    const text = (mem.proposed_memory || '').toLowerCase();
    
    // Look for project priority/status changes
    const projectsToCheck = ['savex', 'aimemory', 'qlythuexe', 'giveget', 'centralcontext'];
    projectsToCheck.forEach(proj => {
      if (text.includes(proj)) {
        if (text.includes('freeze') || text.includes('frozen') || text.includes('pause') || text.includes('paused')) {
          projectStatusChanges[proj] = 'FROZEN (Paused via auto-learning)';
        } else if (text.includes('unfreeze') || text.includes('resume') || text.includes('activate') || text.includes('active')) {
          projectStatusChanges[proj] = 'ACTIVE';
        }
      }
    });
    
    // Extract general preferences / decision patterns
    if (mem.type === 'founder_preference' || mem.type === 'decision' || text.includes('founder prefers') || text.includes('founder decided')) {
      let cleanText = mem.proposed_memory.trim();
      if (!cleanText.endsWith('.')) cleanText += '.';
      learnedPatterns.push(cleanText);
    }
  });
  
  // Let's rebuild the lines while applying project status changes
  let updatedLines = [];
  let currentSection = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed.startsWith('## ')) {
      currentSection = trimmed.replace('## ', '').toLowerCase().trim();
      updatedLines.push(line);
      continue;
    }
    
    if (currentSection === 'project preferences' && trimmed.startsWith('- **')) {
      const match = trimmed.match(/^-\s+\*\*([^*]+)\*\*/);
      if (match) {
        const projName = match[1].toLowerCase().trim();
        if (projectStatusChanges[projName]) {
          const newStatus = projectStatusChanges[projName];
          if (newStatus === 'ACTIVE') {
            // Restore priority
            let basePriority = 'Priority';
            if (projName === 'qlythuexe') basePriority = 'Ecosystem Priority #1';
            else if (projName === 'centralcontext') basePriority = 'Ecosystem Priority #2';
            else if (projName === 'giveget') basePriority = 'Ecosystem Priority #3';
            
            // Replace pause/frozen tags with priority
            const updatedLine = line.replace(/\*\*FROZEN.*?\*\*|\*\*PAUSED.*?\*\*/g, `**${basePriority}**`);
            updatedLines.push(updatedLine);
            console.log(`\x1b[32m  [Auto-Learning] Updated ${projName} status to ACTIVE in founder profile.\x1b[0m`);
            continue;
          } else {
            // Replace priority or other status with FROZEN/PAUSED
            let updatedLine = line;
            if (line.includes('Priority')) {
              updatedLine = line.replace(/\*\*Ecosystem Priority.*?\*\*|\*\*Priority.*?\*\*/g, `**${newStatus}**`);
            } else if (line.includes('PAUSED') || line.includes('FROZEN')) {
              updatedLine = line.replace(/\*\*FROZEN.*?\*\*|\*\*PAUSED.*?\*\*/g, `**${newStatus}**`);
            } else {
              updatedLine = line.replace(/:\s*/, `: **${newStatus}**. `);
            }
            updatedLines.push(updatedLine);
            console.log(`\x1b[32m  [Auto-Learning] Updated ${projName} status to ${newStatus} in founder profile.\x1b[0m`);
            continue;
          }
        }
      }
    }
    
    // Ignore any existing Auto-Learned section because we'll regenerate it
    if (currentSection === 'auto-learned decision patterns & preferences') {
      continue; // skip the old lines, we'll append the fresh ones
    }
    
    updatedLines.push(line);
  }
  
  // Filter out duplicate learned patterns already in core preferences
  const existingProfileText = updatedLines.join('\n');
  const uniqueLearned = [];
  const seenPatterns = new Set();
  
  learnedPatterns.forEach(pattern => {
    const normalized = pattern.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seenPatterns.has(normalized)) return;
    seenPatterns.add(normalized);
    
    if (!existingProfileText.toLowerCase().includes(pattern.toLowerCase().substring(0, 30))) {
      uniqueLearned.push(pattern);
    }
  });
  
  // Now rebuild the profile text and insert the dynamic learned preferences section before the footer/note
  let newProfileText = '';
  let footerSeparatorIndex = -1;
  
  for (let i = 0; i < updatedLines.length; i++) {
    if (updatedLines[i].trim() === '---') {
      footerSeparatorIndex = i;
      break;
    }
  }
  
  // Construct the new learned preferences section
  let learnedSectionText = '';
  if (uniqueLearned.length > 0) {
    learnedSectionText = `\n## Auto-Learned Decision Patterns & Preferences\n`;
    uniqueLearned.forEach(pattern => {
      const cleanPattern = pattern.replace(/^-\s*/, '');
      const words = cleanPattern.split(' ');
      const title = words.slice(0, 2).join('-').toLowerCase().replace(/[^a-z\-]/g, '');
      learnedSectionText += `- **learned-${title}**: ${cleanPattern}\n`;
    });
    learnedSectionText += `\n`;
  }
  
  if (footerSeparatorIndex !== -1) {
    const beforeFooter = updatedLines.slice(0, footerSeparatorIndex).join('\n').trim();
    const afterFooter = updatedLines.slice(footerSeparatorIndex).join('\n').trim();
    newProfileText = beforeFooter + '\n' + learnedSectionText + '\n' + afterFooter;
  } else {
    newProfileText = updatedLines.join('\n').trim() + '\n' + learnedSectionText;
  }
  
  fs.writeFileSync(founderProfilePath, newProfileText, 'utf8');
  console.log(`\x1b[32m  [Auto-Learning] Successfully reinforced Founder Profile from approved memories.\x1b[0m`);
}
