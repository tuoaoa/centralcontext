const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const rawLogPath = path.join(rootDir, 'data/raw/2026-05-30.jsonl');

function analyzeAndReconstruct() {
  console.log('Parsing raw logs for reconstruction diagnostics...');
  
  if (!fs.existsSync(rawLogPath)) {
    console.error('Error: Raw log file not found.');
    process.exit(1);
  }

  const fileContent = fs.readFileSync(rawLogPath, 'utf8');
  const lines = fileContent.trim().split('\n');
  
  const logs = [];
  const score5Files = new Set();
  const allFilesRead = new Set();
  const decisions = [];
  const projects = new Set();

  lines.forEach(line => {
    if (!line.trim()) return;
    try {
      const log = JSON.parse(line);
      logs.push(log);
      
      // Track files read/modified
      if (log.file_name) {
        allFilesRead.add(log.file_name);
        if (log.quality_score === 5) {
          score5Files.add(log.file_name);
        }
      }

      // Track projects
      if (log.project) {
        projects.add(log.project);
      }
      
      // Track decisions mentioned
      if (log.type === 'critical_doc_snapshot' && log.file_name === 'DECISIONS.md') {
        const adrMatches = log.content.match(/## ADR-\d+:.*?\n/g) || [];
        adrMatches.forEach(match => {
          decisions.push(match.trim().replace('## ', ''));
        });
      }
    } catch (e) {
      // Ignored
    }
  });

  // Calculate statistics
  console.log('\n--- Analysis Results ---');
  console.log(`Total raw logs parsed: ${logs.length}`);
  console.log(`Total files read: ${allFilesRead.size} (${Array.from(allFilesRead).join(', ')})`);
  console.log(`Score 5 / Critical files classified: ${score5Files.size} (${Array.from(score5Files).join(', ')})`);
  console.log(`Decisions ADRs extracted: ${decisions.length} (${decisions.join(' | ')})`);
  console.log(`Projects recognized: ${projects.size} (${Array.from(projects).join(', ')})`);

  // 1. Synthesize PROJECT_SUMMARY_RECONSTRUCTED.md
  const projectSummaryContent = `# Project Summary (Reconstructed from Raw Logs)

## Workspace Overview
* **Active Workspace**: CentralContext (Dual-layer storage model)
* **Goal**: Establish a unified context hub and "shared brain" for AI agents.

## Recognized Project Portfolios
${Array.from(projects).map(p => `* **Project**: \`${p}\` (Tracked via file system and CLI scopes)`).join('\n')}

## System Tech Stack & Identity
* **Core Architecture**: Node.js, TypeScript, Express Server, SQLite cache with WAL mode, and Markdown files as the Source of Truth.
* **Mac Local Storage**: Raw log logs (\`data/raw/*.jsonl\`), daily curate reports (\`data/daily/*.md\`), and archives (\`data/backups/\`).
* **VPS remote sync**: Core context files in \`/context\`.
* **Synchronizer CLI**: \`npm run sync:push\` and \`npm run sync:pull\` with pre-push conflict alerts and local backups.
`;

  // 2. Synthesize CURRENT_STATE_RECONSTRUCTED.md
  // Fetch CURRENT_STATE content from logs
  const stateLog = logs.find(l => l.file_name === 'CURRENT_STATE.md');
  let stateContent = '';
  if (stateLog) {
    stateContent = stateLog.content.replace('[Event: RESTORE] File: CURRENT_STATE.md\n\n', '').replace('[Event: CHANGE] File: context/CURRENT_STATE.md\n\n', '');
  } else {
    stateContent = '# Current State (Reconstructed)\n\n*No current state snapshot discovered inside logs.*';
  }

  const currentStateReconstructed = `# CURRENT_STATE_RECONSTRUCTED (Curation Analysis)

${stateContent}

---
*Reconstructed from raw snapshot captured at: ${stateLog ? stateLog.timestamp : 'N/A'}*
`;

  // 3. Synthesize DECISIONS_RECONSTRUCTED.md
  const decisionsLog = logs.find(l => l.file_name === 'DECISIONS.md');
  let decisionsContent = '';
  if (decisionsLog) {
    decisionsContent = decisionsLog.content.replace('[Event: RESTORE] File: DECISIONS.md\n\n', '');
  } else {
    decisionsContent = '# Architecture Decisions (Reconstructed)\n\n*No ADR records discovered inside logs.*';
  }

  const decisionsReconstructed = `# DECISIONS_RECONSTRUCTED (Curation Analysis)

${decisionsContent}

---
*Reconstructed from raw snapshot captured at: ${decisionsLog ? decisionsLog.timestamp : 'N/A'}*
`;

  // Write Reconstructed files to root workspace
  fs.writeFileSync(path.join(rootDir, 'PROJECT_SUMMARY_RECONSTRUCTED.md'), projectSummaryContent, 'utf8');
  fs.writeFileSync(path.join(rootDir, 'CURRENT_STATE_RECONSTRUCTED.md'), currentStateReconstructed, 'utf8');
  fs.writeFileSync(path.join(rootDir, 'DECISIONS_RECONSTRUCTED.md'), decisionsReconstructed, 'utf8');

  console.log('\n✔ Successfully compiled 3 reconstructed files in the workspace root!');
}

analyzeAndReconstruct();
