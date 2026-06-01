#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const { redactSecrets } = require('./lib/secret-redactor');

function redactAll(text) {
  if (!text) return '';
  let clean = redactSecrets(text);
  // Redact internal test markers and verification codes
  clean = clean.replace(/SECRET_CONTEXT_TEST_\w+/g, '[REDACTED_TEST_MARKER]');
  clean = clean.replace(/AUTO_CONTEXT_PASS/g, '[REDACTED_TEST_MARKER]');
  clean = clean.replace(/CentralContext verification test run \d+/gi, '[REDACTED_TEST_MARKER]');
  return clean;
}

function parsePriorityProject(content) {
  if (!content) return null;
  const m1 = content.match(/Dự án ưu tiên số 1(?: hiện tại)?(?: là)?:?\s*`?([a-zA-Z0-9_-]+)`?/i);
  if (m1) return m1[1];
  const m2 = content.match(/Dành ưu tiên số 1 cho dự án\s*`?([a-zA-Z0-9_-]+)`?/i);
  if (m2) return m2[1];
  const m3 = content.match(/priority project is\s*`?([a-zA-Z0-9_-]+)`?/i);
  if (m3) return m3[1];
  return null;
}

function parseActiveTask(content) {
  const activeTaskMatch = content.match(/## Active Task\s*\n([\s\S]*?)(?=\n##|$)/i);
  return activeTaskMatch ? activeTaskMatch[1].trim() : 'No active task specified.';
}

function parseRecentDecisions(content) {
  const adrs = content.match(/## ADR-\d+:[\s\S]*?(?=\n## ADR-|$)/g);
  if (!adrs) return 'No architectural decisions documented.';
  const acceptedAdrs = adrs
    .map(adr => adr.trim())
    .filter(adr => adr.toLowerCase().includes('* **status**: accepted') || adr.toLowerCase().includes('status: accepted'));
  // Take only the 2 most recent accepted ADRs
  return acceptedAdrs.slice(-2).join('\n\n');
}

function parseRecentWorkLog(content) {
  const dates = content.match(/## \d{4}-\d{2}-\d{2}\s*\n[\s\S]*?(?=\n## \d{4}-\d{2}-\d{2}|$)/g);
  if (!dates) return 'No work log entries found.';
  // Take only the single most recent date entry
  return dates.slice(-1).map(date => date.trim()).join('\n\n');
}

function parseBlockers(content) {
  const match = content.match(/(?:## Current Blockers|Current Blockers)\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (!match) return 'No active blockers reported.';
  const blockersText = match[1].trim();
  if (blockersText.toLowerCase() === 'none' || blockersText.toLowerCase() === '* none' || !blockersText) {
    return 'No active blockers reported.';
  }
  return blockersText;
}

function parseNextSteps(content) {
  const nextStepsSection = content.match(/(?:## Next Steps|Next Steps)\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (!nextStepsSection) return [];
  const lines = nextStepsSection[1].split('\n');
  return lines
    .map(line => line.trim())
    .filter(line => line.startsWith('- [ ]') || line.startsWith('- [/]'))
    .slice(0, 3)
    .map((step, idx) => `${idx + 1}. ${step.replace(/^-\s*\[\s*[ /x]\s*\]\s*/, '')}`);
}

function main() {
  console.log('\n\x1b[36m==================================================\x1b[0m');
  console.log('\x1b[36m🚀 GENERATING FOUNDER DAILY DIGEST (v2.1)\x1b[0m');
  console.log('\x1b[36m==================================================\x1b[0m\n');

  // Input file paths
  const paths = {
    currentState: path.join(repoRoot, 'context/CURRENT_STATE.md'),
    decisions: path.join(repoRoot, 'context/DECISIONS.md'),
    workLog: path.join(repoRoot, 'context/WORK_LOG.md')
  };

  // Verify necessary sources exist
  for (const [key, p] of Object.entries(paths)) {
    if (!fs.existsSync(p)) {
      console.error(`\x1b[31mError: Required source file not found at ${p}\x1b[0m`);
      process.exit(1);
    }
  }

  const currentStateContent = fs.readFileSync(paths.currentState, 'utf8');
  const decisionsContent = fs.readFileSync(paths.decisions, 'utf8');
  const workLogContent = fs.readFileSync(paths.workLog, 'utf8');

  // 1. Current Focus
  const currentPriority = parsePriorityProject(currentStateContent);
  const activeTask = parseActiveTask(currentStateContent);
  const currentFocus = `* **Active Project**: \`${currentPriority || 'Not defined'}\`\n* **Active Task**:\n${activeTask}`;

  // 2. Recent Decisions
  const decisions = parseRecentDecisions(decisionsContent);

  // 3. Recent Work
  const work = parseRecentWorkLog(workLogContent);

  // 4. Memory Activity
  let memoryActivity = '';
  const productionDbPath = path.join(repoRoot, 'data/centralcontext.db');
  if (fs.existsSync(productionDbPath)) {
    try {
      const Database = require(path.join(repoRoot, 'apps/server/node_modules/better-sqlite3'));
      const dbInstance = new Database(productionDbPath, { timeout: 1000 });
      const tableExists = dbInstance.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='recall_memories'").get();
      
      if (tableExists) {
        // Promoted memories
        const promoted = dbInstance.prepare(`
          SELECT memory_id, summary, project, promoted_at, tier
          FROM recall_memories
          WHERE promoted_at IS NOT NULL
          ORDER BY promoted_at DESC
          LIMIT 3
        `).all();
        
        let promotedStr = 'No recently promoted memories.';
        if (promoted && promoted.length > 0) {
          promotedStr = promoted.map(r => `* **[${r.tier}]** [${r.project || 'CentralContext'}] ${r.summary}`).join('\n');
        }

        // Recalled memories
        const recalled = dbInstance.prepare(`
          SELECT memory_id, summary, project, last_recalled_at, recall_count
          FROM recall_memories
          WHERE last_recalled_at IS NOT NULL
          ORDER BY last_recalled_at DESC
          LIMIT 3
        `).all();

        let recalledStr = 'No recently recalled memories.';
        if (recalled && recalled.length > 0) {
          recalledStr = recalled.map(r => `* [${r.project || 'CentralContext'}] ${r.summary} (Recalled ${r.recall_count || 1} times)`).join('\n');
        }

        // High-value memories
        const highValue = dbInstance.prepare(`
          SELECT memory_id, summary, project, importance, tier
          FROM recall_memories
          WHERE tier = 'LONG_TERM' OR importance >= 85
          ORDER BY importance DESC
          LIMIT 3
        `).all();

        let highValueStr = 'No high-value memories indexed.';
        if (highValue && highValue.length > 0) {
          highValueStr = highValue.map(r => `* **[${r.tier}]** (Importance: ${r.importance}) [${r.project || 'CentralContext'}] ${r.summary}`).join('\n');
        }

        memoryActivity = `### Recently Promoted Memories\n${promotedStr}\n\n### Recently Recalled Memories\n${recalledStr}\n\n### High-Value Memories\n${highValueStr}`;
      } else {
        memoryActivity = 'Database schema not initialized yet.';
      }
      dbInstance.close();
    } catch (e) {
      memoryActivity = `Could not load memory activity from database: ${e.message}`;
    }
  } else {
    memoryActivity = 'Memory database is currently offline or unavailable.';
  }

  // 5. Open Blockers
  const blockers = parseBlockers(currentStateContent);

  // 6. Recommended Next Actions
  const recommendations = parseNextSteps(currentStateContent);
  const recommendationsStr = recommendations.length > 0 ? recommendations.join('\n') : '1. Read CURRENT_STATE.md for immediate next tasks.';

  // 7. Format digest markdown content
  let markdown = `# Daily Digest

> **Generated by**: CentralContext Daily Digest Generator

## Current Focus

${currentFocus}

---

## Recent Decisions

${decisions}

---

## Recent Work

${work}

---

## Memory Activity

${memoryActivity}

---

## Open Blockers

${blockers}

---

## Recommended Next Actions

${recommendationsStr}
`;

  // 8. Apply safety and redact all internal tokens and test markers
  const cleanMarkdown = redactAll(markdown);

  const outputPath = path.join(repoRoot, 'context/DAILY_DIGEST.md');
  fs.writeFileSync(outputPath, cleanMarkdown, 'utf8');
  console.log(`🟢 Successfully generated Daily Digest at: \x1b[32mcontext/DAILY_DIGEST.md\x1b[0m\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  redactAll,
  parsePriorityProject,
  parseActiveTask,
  parseRecentDecisions,
  parseRecentWorkLog,
  parseBlockers,
  parseNextSteps
};
