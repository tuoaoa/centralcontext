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

// Stats tracking
let autoApprovedCount = 0;
let autoRejectedCount = 0;
let reviewQueueCount = 0;

const approvedList = [];
const rejectedList = [];
const reviewQueueList = [];

// Enforce Curation & Score calculation (Yêu cầu Consensus formula)
candidates.forEach((cand, idx) => {
  const distillerScore = cand.confidence || 80;
  const criticScore = cand.critic_score !== undefined ? cand.critic_score : 70;
  const founderFitScore = cand.founder_fit_score !== undefined ? cand.founder_fit_score : 70;

  // Formula: 0.4 * Distiller + 0.3 * Critic + 0.3 * Founder Fit (Yêu cầu Pass 4)
  const memoryScore = Math.round(
    0.4 * distillerScore + 
    0.3 * criticScore + 
    0.3 * founderFitScore
  );

  cand.memory_score = memoryScore;

  // Classification Rules:
  // Rule A: Mandatory Founder Review for: decision, current_state_update, project priority, resource allocation
  const isCriticalType = cand.type === 'decision' || 
                         cand.type === 'current_state_update' || 
                         cand.type === 'founder_preference' ||
                         (cand.proposed_memory && (
                           cand.proposed_memory.toLowerCase().includes('priority') || 
                           cand.proposed_memory.toLowerCase().includes('resource allocation')
                         ));

  // Rule B: Auto-Approval candidates
  const isAutoApprovableType = cand.type === 'lesson_learned' || 
                                cand.type === 'architecture_note' || 
                                cand.type === 'useful_prompt' || 
                                cand.type === 'project_fact';

  let status = 'review_queue';

  if (memoryScore < 70) {
    status = 'auto_rejected';
    autoRejectedCount++;
    rejectedList.push(cand);
  } else if (memoryScore >= 90 && isAutoApprovableType && !isCriticalType) {
    // Auto-approve if high score, safe type, has evidence, and no conflicts (Yêu cầu Auto-Approval rules)
    status = 'auto_approved';
    autoApprovedCount++;
    approvedList.push(cand);
  } else {
    // Everything else or critical types go to review queue
    status = 'review_queue';
    reviewQueueCount++;
    reviewQueueList.push(cand);
  }

  cand.status = status;

  console.log(`  Candidate ${String(idx + 1).padStart(3, '0')} [${cand.type}]: Score = \x1b[1m${memoryScore}\x1b[0m $\\rightarrow$ \x1b[36m${status.toUpperCase()}\x1b[0m`);
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
