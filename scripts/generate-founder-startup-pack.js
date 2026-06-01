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

function parseMilestones(content) {
  const match = content.match(/(?:## Recent Milestones|Recent Milestones)\s*\n([\s\S]*?)(?=\n##|$)/i);
  return match ? match[1].trim() : 'No recent milestones specified.';
}

function parseBlockers(content) {
  const match = content.match(/(?:## Current Blockers|Current Blockers)\s*\n([\s\S]*?)(?=\n##|$)/i);
  return match ? match[1].trim() : 'None.';
}

function parseNextSteps(content) {
  const nextStepsSection = content.match(/(?:## Next Steps|Next Steps)\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (!nextStepsSection) return [];
  const lines = nextStepsSection[1].split('\n');
  return lines
    .map(line => line.trim())
    .filter(line => line.startsWith('- [ ]') || line.startsWith('- [/]'));
}

function parseRecentDecisions(content) {
  const adrs = content.match(/## ADR-\d+:[\s\S]*?(?=\n## ADR-|$)/g);
  if (!adrs) return 'No architectural decisions documented.';
  return adrs.slice(-3).map(adr => adr.trim()).join('\n\n');
}

function parseRecentWorkLog(content) {
  const dates = content.match(/## \d{4}-\d{2}-\d{2}\s*\n[\s\S]*?(?=\n## \d{4}-\d{2}-\d{2}|$)/g);
  if (!dates) return 'No work log entries found.';
  return dates.slice(-2).map(date => date.trim()).join('\n\n');
}

// Required Fix #1: Dynamically parse avoided/paused projects
function parseAvoidProjects(currentState, decisions) {
  const avoidProjects = new Set();
  const textToScan = [currentState || '', decisions || ''].join('\n');

  // Matches: "không ưu tiên SaveX", "tạm dừng/đóng băng dự án SaveX"
  const viPriorPattern = /(?:không ưu tiên|tạm dừng\/?đóng băng)(?:\s+dự\s+án)?\s+`?([a-zA-Z0-9_-]+)`?/gi;
  let match;
  while ((match = viPriorPattern.exec(textToScan)) !== null) {
    avoidProjects.add(match[1]);
  }

  // Matches: "paused/frozen [project] SaveX" or "SaveX is paused/frozen"
  const enPriorPattern = /(?:paused|frozen|de-prioritized|not prioritized)(?:\s+project)?\s+`?([a-zA-Z0-9_-]+)`?/gi;
  while ((match = enPriorPattern.exec(textToScan)) !== null) {
    avoidProjects.add(match[1]);
  }

  const enPriorPattern2 = /`?([a-zA-Z0-9_-]+)`?\s+is\s+(?:paused|frozen|de-prioritized|not prioritized)/gi;
  while ((match = enPriorPattern2.exec(textToScan)) !== null) {
    avoidProjects.add(match[1]);
  }

  return Array.from(avoidProjects);
}

function formatAvoidToday(currentStateContent, decisionsContent) {
  const avoidList = parseAvoidProjects(currentStateContent, decisionsContent);
  if (avoidList.length === 0) {
    return 'No explicit avoid item found in current context.';
  }
  return avoidList.map(project => `* **${project}**: Paused, frozen, or de-prioritized in the active context/decisions.`).join('\n');
}

// Optional minor improvements: parse non-priority details from intent and project files
function parseFounderIntent(content) {
  if (!content) return 'No founder intent documented.';
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.includes('Mã xác thực') && !trimmed.includes('FOUNDER_CODE') && !trimmed.startsWith('>')) {
      return trimmed;
    }
  }
  return 'No founder intent documented.';
}

function parseActiveProjectsList(content) {
  if (!content) return [];
  const matches = content.match(/###\s+\d+\.\s+([^\n]+)/g);
  if (!matches) return [];
  return matches.map(m => m.replace(/###\s+\d+\.\s+/, '').trim());
}

function main() {
  console.log('\n\x1b[36m==================================================\x1b[0m');
  console.log('\x1b[36m🚀 GENERATING FOUNDER DAILY STARTUP PACK\x1b[0m');
  console.log('\x1b[36m==================================================\x1b[0m\n');

  // Input file paths
  const paths = {
    priority: path.join(repoRoot, 'context/SOURCE_PRIORITY.md'),
    currentState: path.join(repoRoot, 'context/CURRENT_STATE.md'),
    decisions: path.join(repoRoot, 'context/DECISIONS.md'),
    intent: path.join(repoRoot, 'context/FOUNDER_INTENT.md'),
    activeProjects: path.join(repoRoot, 'context/ACTIVE_PROJECTS.md'),
    workLog: path.join(repoRoot, 'context/WORK_LOG.md'),
    oldState: path.join(repoRoot, 'context/OLD_STATE.md'),
    archiveState: path.join(repoRoot, 'context/ARCHIVE_STATE.md')
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
  const oldStateContent = fs.readFileSync(paths.oldState, 'utf8');
  const archiveStateContent = fs.readFileSync(paths.archiveState, 'utf8');
  const workLogContent = fs.readFileSync(paths.workLog, 'utf8');
  const intentContent = fs.readFileSync(paths.intent, 'utf8');
  const activeProjectsContent = fs.readFileSync(paths.activeProjects, 'utf8');

  // 1. Conflict resolution & priority resolution
  const currentPriority = parsePriorityProject(currentStateContent);
  const decisionsPriority = parsePriorityProject(decisionsContent);
  const oldPriority = parsePriorityProject(oldStateContent);
  const archivePriority = parsePriorityProject(archiveStateContent);

  let resolvedPriority = currentPriority;
  let sourceWins = 'CURRENT_STATE.md';

  if (!resolvedPriority && decisionsPriority) {
    resolvedPriority = decisionsPriority;
    sourceWins = 'DECISIONS.md';
  }

  const conflicts = [];
  if (currentPriority && decisionsPriority && currentPriority !== decisionsPriority) {
    conflicts.push(`Conflict: CURRENT_STATE.md active priority project is '${currentPriority}' but DECISIONS.md says '${decisionsPriority}'.`);
  }

  // 2. Parse core sections
  const activeTask = parseActiveTask(currentStateContent);
  const blockers = parseBlockers(currentStateContent);
  const milestones = parseMilestones(currentStateContent);
  const nextSteps = parseNextSteps(currentStateContent);

  // 3. Build Founder Focus Today
  const primaryFocus = `${resolvedPriority} - ${activeTask.match(/\* \*\*Task Name\*\*:\s*([^\n]+)/)?.[1] || 'CentralContext MVP Implementation'}`;
  
  const doNext = nextSteps.slice(0, 3)
    .map((step, idx) => `${idx + 1}. ${step.replace(/^-\s*\[\s*[ /x]\s*\]\s*/, '')}`)
    .join('\n') || '1. Read CURRENT_STATE.md for immediate tasks.';

  // Required Fix #1: Dynamically format the Avoid Today list
  const avoidToday = formatAvoidToday(currentStateContent, decisionsContent);

  // 4. Query High-Value memories from local database if available
  let highValueMemories = '';
  const productionDbPath = path.join(repoRoot, 'data/centralcontext.db');
  if (fs.existsSync(productionDbPath)) {
    try {
      const Database = require(path.join(repoRoot, 'apps/server/node_modules/better-sqlite3'));
      const dbInstance = new Database(productionDbPath, { timeout: 1000 });
      const tableExists = dbInstance.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='recall_memories'").get();
      if (tableExists) {
        const rows = dbInstance.prepare(`
          SELECT memory_id, summary, content, project, importance, tier
          FROM recall_memories
          WHERE tier = 'LONG_TERM' OR importance >= 85
          ORDER BY importance DESC
          LIMIT 5
        `).all();
        if (rows && rows.length > 0) {
          highValueMemories = rows.map(r => `* **[${r.tier || 'MID_TERM'}]** (Score: ${r.importance || 90}) [${r.project || 'CentralContext'}] ${r.summary}: ${r.content || ''}`).join('\n');
        } else {
          highValueMemories = 'No high-value memories indexed in the database yet.';
        }
      } else {
        highValueMemories = 'Database schema not initialized yet.';
      }
      dbInstance.close();
    } catch (e) {
      highValueMemories = `Could not load memories from database: ${e.message}`;
    }
  } else {
    highValueMemories = 'Database file does not exist yet (data/centralcontext.db). Run server or test:recall first.';
  }

  // 5. Parse decisions, intent, active list, and work log
  const decisions = parseRecentDecisions(decisionsContent);
  const workLog = parseRecentWorkLog(workLogContent);
  const founderIntentSummary = parseFounderIntent(intentContent);
  const activeEcosystemProjects = parseActiveProjectsList(activeProjectsContent);

  // 6. Format the pack markdown content (Required Fix #2: Stable deterministic Generated by header)
  let markdown = `# FOUNDER STARTUP PACK (Bản tin Khởi động Hàng ngày)

> **Generated by**: CentralContext Founder Startup Pack Generator

## Founder Focus Today

**Primary Focus**:
${primaryFocus}

**Do Next**:
${doNext}

**Avoid Today**:
${avoidToday}

---

## Current Active State

* **Priority Project**: ${resolvedPriority}
* **Active Task**:
${activeTask}

* **Current Blockers**:
${blockers}

* **Recent Completed Milestones**:
${milestones}

* **Active Ecosystem Projects (from ACTIVE_PROJECTS.md)**: ${activeEcosystemProjects.join(', ') || 'None'}

---

## Strategic Intent (from FOUNDER_INTENT.md)

${founderIntentSummary}

---

## Source Priority Notes

**Verdict**: Resolved priority project is \`${resolvedPriority}\` (Source: \`${sourceWins}\` wins according to \`SOURCE_PRIORITY.md\` rules).

${conflicts.length > 0 ? `> [!WARNING]\n> ${conflicts.join('\n> ')}\n` : ''}
* **CURRENT_STATE.md** specifies priority project: \`${currentPriority || 'Not defined'}\`
* **DECISIONS.md** specifies priority project: \`${decisionsPriority || 'Not defined'}\`
* **OLD_STATE.md** specifies priority project: \`${oldPriority || 'Not defined'}\` *(Correctly ignored as historical)*
* **ARCHIVE_STATE.md** specifies priority project: \`${archivePriority || 'Not defined'}\` *(Correctly ignored as historical)*

---

## High-Value Memory Summary

${highValueMemories}

---

## Recent Decisions

${decisions}

---

## Recent Work Log Entries

${workLog}
`;

  // 7. Apply safety and redact all internal tokens and test markers
  const cleanMarkdown = redactAll(markdown);

  const outputPath = path.join(repoRoot, 'context/FOUNDER_STARTUP_PACK.md');
  fs.writeFileSync(outputPath, cleanMarkdown, 'utf8');
  console.log(`🟢 Successfully generated Startup Pack at: \x1b[32mcontext/FOUNDER_STARTUP_PACK.md\x1b[0m\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  redactAll,
  parsePriorityProject,
  parseActiveTask,
  parseMilestones,
  parseBlockers,
  parseNextSteps,
  parseRecentDecisions,
  parseRecentWorkLog,
  parseAvoidProjects,
  formatAvoidToday,
  parseFounderIntent,
  parseActiveProjectsList
};
