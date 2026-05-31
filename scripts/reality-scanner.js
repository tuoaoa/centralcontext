/**
 * CentralContext Reality Check Layer v1.0
 * scripts/reality-scanner.js
 *
 * Purpose: Compute activity_score for each project based on behavioral telemetry,
 * not declarations. Measures what the Founder ACTUALLY DOES.
 *
 * Signals (weighted):
 *   - Git commits       (0.30) — strongest proof of work
 *   - File changes      (0.25) — direct editing evidence
 *   - Terminal commands  (0.20) — active development
 *   - Clipboard         (0.15) — code engagement
 *   - Browser mentions  (0.10) — weakest, talking ≠ doing
 *
 * Usage:
 *   npm run reality:scan
 *   npm run reality:scan -- --date 2026-05-31
 *   npm run reality:scan -- --window 7
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Configuration ───────────────────────────────────────────────────────────

const rootDir = path.resolve(__dirname, '..');
const devflowDir = '/Users/tuoaoa/Tuoaoa/devflow';
const rawDir = path.join(rootDir, 'data/raw');
const realityDir = path.join(rootDir, 'data/memory/reality');

// Signal weights — production signals weighted higher than passive signals
const SIGNAL_WEIGHTS = {
  git_commits: 0.30,
  file_changes: 0.25,
  terminal: 0.20,
  clipboard: 0.15,
  browser_mentions: 0.10,
};

// ─── Argument Parsing ────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getTodayString() {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

let scanDate = getTodayString();
let windowDays = 30;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date' && args[i + 1]) {
    scanDate = args[i + 1].trim();
  }
  if (args[i] === '--window' && args[i + 1]) {
    windowDays = parseInt(args[i + 1].trim(), 10) || 30;
  }
}

// ─── Ensure directories ──────────────────────────────────────────────────────

if (!fs.existsSync(realityDir)) {
  fs.mkdirSync(realityDir, { recursive: true });
}

// ─── Banner ──────────────────────────────────────────────────────────────────

console.log(`\n\x1b[35m==================================================\x1b[0m`);
console.log(`\x1b[35m🔍 REALITY CHECK LAYER v1.0\x1b[0m`);
console.log(`\x1b[35m==================================================\x1b[0m`);
console.log(`Scan Date:   \x1b[36m${scanDate}\x1b[0m`);
console.log(`Window:      \x1b[36m${windowDays} days\x1b[0m`);
console.log(`DevFlow Dir: \x1b[36m${devflowDir}\x1b[0m`);
console.log(`\x1b[35m--------------------------------------------------\x1b[0m\n`);

// ─── Utility: extract project from path ──────────────────────────────────────

function extractProjectFromPath(filePath) {
  if (!filePath) return null;
  const match = filePath.match(/\/devflow\/([^\/]+)/);
  return match ? match[1] : null;
}

function extractProjectFromCWD(content) {
  if (!content) return null;
  const cwdMatch = content.match(/CWD:\s*(.+)/);
  if (!cwdMatch) return null;
  return extractProjectFromPath(cwdMatch[1].trim());
}

// ─── Step 1: Parse raw logs ──────────────────────────────────────────────────

console.log(`\x1b[33m📂 Step 1: Parsing raw telemetry logs...\x1b[0m`);

// Compute date range for the window
const scanDateObj = new Date(scanDate + 'T23:59:59Z');
const windowStart = new Date(scanDateObj);
windowStart.setDate(windowStart.getDate() - windowDays);

// Find all raw log files within the window
const rawFiles = [];
try {
  const allFiles = fs.readdirSync(rawDir).filter(f => f.endsWith('.jsonl')).sort();
  for (const f of allFiles) {
    const dateStr = f.replace('.jsonl', '');
    const fileDate = new Date(dateStr + 'T00:00:00Z');
    if (fileDate >= windowStart && fileDate <= scanDateObj) {
      rawFiles.push(path.join(rawDir, f));
    }
  }
} catch (e) {
  console.error(`\x1b[31mError reading raw directory: ${e.message}\x1b[0m`);
}

console.log(`  Found ${rawFiles.length} raw log files in ${windowDays}-day window`);

// Per-project accumulators
const projectData = {}; // project -> { terminal: count, file_changes: Set<paths>, clipboard: count, browser: count }

function ensureProject(name) {
  if (!name || name === '.DS_Store') return;
  if (!projectData[name]) {
    projectData[name] = {
      terminal_events: 0,
      file_change_events: 0,
      file_change_unique: new Set(),
      clipboard_events: 0,
      browser_events: 0,
    };
  }
}

let totalLinesProcessed = 0;

for (const rawFile of rawFiles) {
  const lines = fs.readFileSync(rawFile, 'utf8').split('\n').filter(Boolean);
  
  for (const line of lines) {
    totalLinesProcessed++;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const source = entry.source || '';
    let project = null;

    // ── Terminal: derive project from CWD in content ──
    if (source === 'terminal') {
      project = extractProjectFromCWD(entry.content);
      if (!project) {
        // Fallback: use the project field but only if it's not the hardcoded "CentralContext"
        // (legacy bug workaround)
        const fp = entry.project;
        if (fp && fp !== 'CentralContext') {
          project = fp;
        }
      }
      if (project) {
        ensureProject(project);
        projectData[project].terminal_events++;
      }
    }

    // ── File watcher: derive project from file_path ──
    else if (source === 'file_watcher') {
      project = extractProjectFromPath(entry.file_path);
      if (!project) {
        // Fallback: use project field if it looks like a real project name
        const fp = entry.project;
        if (fp && !['src', 'scripts', 'context', 'data', 'memory', 'public', 'config'].includes(fp)) {
          project = fp;
        }
      }
      if (project) {
        ensureProject(project);
        projectData[project].file_change_events++;
        if (entry.file_path) {
          projectData[project].file_change_unique.add(entry.file_path);
        }
      }
    }

    // ── Clipboard: use project field ──
    else if (source === 'clipboard') {
      project = entry.project;
      if (project && project !== 'General') {
        // Normalize: map "CentralContext" → "centalcontext"
        if (project === 'CentralContext') project = 'centalcontext';
        ensureProject(project);
        projectData[project].clipboard_events++;
      }
    }

    // ── Browser chat: use project field ──
    else if (source === 'browser_chat') {
      project = entry.project;
      if (project) {
        if (project === 'CentralContext') project = 'centalcontext';
        ensureProject(project);
        projectData[project].browser_events++;
      }
    }

    // ── Telegram: use project field ──
    else if (source === 'telegram_export') {
      project = entry.project;
      if (project) {
        ensureProject(project);
        projectData[project].browser_events++; // Count as passive mention
      }
    }
  }
}

console.log(`  Processed ${totalLinesProcessed.toLocaleString()} raw log entries`);
console.log(`  Found activity for ${Object.keys(projectData).length} projects from telemetry\n`);

// ─── Step 2: Scan git repositories ───────────────────────────────────────────

console.log(`\x1b[33m📦 Step 2: Scanning git repositories...\x1b[0m`);

const gitData = {}; // project -> { commits: number, last_commit_date: string|null }

try {
  const devflowEntries = fs.readdirSync(devflowDir);
  
  for (const entry of devflowEntries) {
    const fullPath = path.join(devflowDir, entry);
    const gitDir = path.join(fullPath, '.git');
    
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) continue;
      if (!fs.existsSync(gitDir)) continue;
    } catch {
      continue;
    }

    const projectName = entry;
    
    try {
      // Count commits within window
      const sinceDate = windowStart.toISOString().split('T')[0];
      const commitCountStr = execSync(
        `git log --oneline --since="${sinceDate}" 2>/dev/null | wc -l`,
        { cwd: fullPath, encoding: 'utf8', timeout: 10000 }
      ).trim();
      const commitCount = parseInt(commitCountStr, 10) || 0;

      // Get last commit date
      let lastCommitDate = null;
      try {
        lastCommitDate = execSync(
          `git log -1 --format="%aI" 2>/dev/null`,
          { cwd: fullPath, encoding: 'utf8', timeout: 5000 }
        ).trim();
      } catch {
        lastCommitDate = null;
      }

      gitData[projectName] = {
        commits: commitCount,
        last_commit_date: lastCommitDate || null,
      };

      ensureProject(projectName);

      if (commitCount > 0) {
        console.log(`  \x1b[32m✔\x1b[0m ${projectName}: ${commitCount} commits (last: ${lastCommitDate ? lastCommitDate.substring(0, 10) : 'N/A'})`);
      }
    } catch (e) {
      // Skip projects with git errors
    }
  }
} catch (e) {
  console.error(`\x1b[31mError scanning devflow: ${e.message}\x1b[0m`);
}

console.log(`  Scanned ${Object.keys(gitData).length} git repositories\n`);

// ─── Step 3: Compute weighted scores ─────────────────────────────────────────

console.log(`\x1b[33m📊 Step 3: Computing activity scores...\x1b[0m\n`);

function computeSignalScore(signalType, data, gitInfo) {
  switch (signalType) {
    case 'git_commits': {
      if (!gitInfo) return 0;
      const base = Math.min(gitInfo.commits * 10, 80);
      let recencyBonus = 0;
      if (gitInfo.last_commit_date) {
        const lastDate = new Date(gitInfo.last_commit_date);
        const daysSince = Math.max(0, Math.floor((scanDateObj - lastDate) / (1000 * 60 * 60 * 24)));
        if (daysSince <= 3) recencyBonus = 20;
        else if (daysSince <= 7) recencyBonus = 10;
      }
      return Math.min(base + recencyBonus, 100);
    }

    case 'file_changes': {
      const uniqueFiles = data.file_change_unique.size;
      const events = data.file_change_events;
      const uniqueScore = Math.min(uniqueFiles * 5, 70);
      const volumeScore = Math.min(Math.floor(events / 10), 30);
      return Math.min(uniqueScore + volumeScore, 100);
    }

    case 'terminal': {
      return Math.min(data.terminal_events * 8, 100);
    }

    case 'clipboard': {
      return Math.min(data.clipboard_events * 5, 100);
    }

    case 'browser_mentions': {
      // Capped early — browser_chat is noisy (streaming duplicates)
      return Math.min(data.browser_events * 2, 100);
    }

    default:
      return 0;
  }
}

function classifyTrend(score) {
  if (score >= 80) return 'active';
  if (score >= 50) return 'moderate';
  if (score >= 20) return 'low';
  return 'dormant';
}

const projectScores = {};

// Merge all known projects from telemetry + git
const allProjects = new Set([
  ...Object.keys(projectData),
  ...Object.keys(gitData),
]);

// Filter out non-project entries (subdirectories that got tagged as projects)
const nonProjectNames = new Set([
  'src', 'scripts', 'context', 'data', 'memory', 'public', 'config',
  'candidates', 'distillery_runs', 'ai_judge', 'approved', 'rejected',
  'budget', 'founder', 'daily', 'backups', 'browser-extension',
  'telegram-listener', 'locks', 'cache',
]);

for (const project of allProjects) {
  if (nonProjectNames.has(project)) continue;
  if (project.startsWith('.')) continue;

  const data = projectData[project] || {
    terminal_events: 0,
    file_change_events: 0,
    file_change_unique: new Set(),
    clipboard_events: 0,
    browser_events: 0,
  };
  const gitInfo = gitData[project] || null;

  const signals = {};
  let totalScore = 0;

  for (const [signalType, weight] of Object.entries(SIGNAL_WEIGHTS)) {
    const signalScore = computeSignalScore(signalType, data, gitInfo);
    
    let eventsCount = 0;
    let extra = {};
    switch (signalType) {
      case 'git_commits':
        eventsCount = gitInfo ? gitInfo.commits : 0;
        extra.days_since_last = gitInfo && gitInfo.last_commit_date
          ? Math.max(0, Math.floor((scanDateObj - new Date(gitInfo.last_commit_date)) / (1000 * 60 * 60 * 24)))
          : windowDays;
        break;
      case 'file_changes':
        eventsCount = data.file_change_events;
        extra.unique_files = data.file_change_unique.size;
        break;
      case 'terminal':
        eventsCount = data.terminal_events;
        break;
      case 'clipboard':
        eventsCount = data.clipboard_events;
        break;
      case 'browser_mentions':
        eventsCount = data.browser_events;
        break;
    }

    signals[signalType] = {
      events: eventsCount,
      score: signalScore,
      weight: weight,
      ...extra,
    };

    totalScore += weight * signalScore;
  }

  const activityScore = Math.round(totalScore);
  const evidenceCount = data.terminal_events + data.file_change_events +
    data.clipboard_events + data.browser_events + (gitInfo ? gitInfo.commits : 0);

  // Determine last activity date
  let lastActivity = null;
  if (gitInfo && gitInfo.last_commit_date) {
    lastActivity = gitInfo.last_commit_date;
  }

  projectScores[project] = {
    activity_score: activityScore,
    signals,
    last_activity: lastActivity,
    evidence_count: evidenceCount,
    trend: classifyTrend(activityScore),
  };
}

// ─── Step 4: Sort and display results ────────────────────────────────────────

const sortedProjects = Object.entries(projectScores)
  .sort((a, b) => b[1].activity_score - a[1].activity_score);

console.log(`  ${'Project'.padEnd(30)} ${'Score'.padStart(5)}  ${'Trend'.padEnd(10)} ${'Evidence'.padStart(8)}  Git  Files  Term  Clip  Browse`);
console.log(`  ${'─'.repeat(30)} ${'─'.repeat(5)}  ${'─'.repeat(10)} ${'─'.repeat(8)}  ${'─'.repeat(4)} ${'─'.repeat(6)} ${'─'.repeat(5)} ${'─'.repeat(5)} ${'─'.repeat(6)}`);

for (const [name, data] of sortedProjects) {
  const s = data.signals;
  const scoreColor = data.activity_score >= 80 ? '\x1b[32m' :
    data.activity_score >= 50 ? '\x1b[33m' :
    data.activity_score >= 20 ? '\x1b[90m' : '\x1b[31m';
  const trendEmoji = data.trend === 'active' ? '🟢' :
    data.trend === 'moderate' ? '🟡' :
    data.trend === 'low' ? '⚪' : '💤';

  console.log(`  ${name.padEnd(30)} ${scoreColor}${String(data.activity_score).padStart(5)}\x1b[0m  ${trendEmoji} ${data.trend.padEnd(8)} ${String(data.evidence_count).padStart(8)}  ${String(s.git_commits.events).padStart(4)} ${String(s.file_changes.events).padStart(6)} ${String(s.terminal.events).padStart(5)} ${String(s.clipboard.events).padStart(5)} ${String(s.browser_mentions.events).padStart(6)}`);
}

// ─── Step 5: Write outputs ───────────────────────────────────────────────────

console.log(`\n\x1b[33m💾 Step 5: Writing output files...\x1b[0m`);

// 5a. reality_scores.json
const scoresOutput = {
  generated_at: new Date().toISOString(),
  window_days: windowDays,
  scan_date: scanDate,
  projects: {},
};

// Convert Sets to counts for JSON serialization
for (const [name, data] of sortedProjects) {
  const serializedSignals = {};
  for (const [key, val] of Object.entries(data.signals)) {
    serializedSignals[key] = { ...val };
  }
  scoresOutput.projects[name] = {
    activity_score: data.activity_score,
    signals: serializedSignals,
    last_activity: data.last_activity,
    evidence_count: data.evidence_count,
    trend: data.trend,
  };
}

const scoresPath = path.join(realityDir, 'reality_scores.json');
fs.writeFileSync(scoresPath, JSON.stringify(scoresOutput, null, 2), 'utf8');
console.log(`  \x1b[32m✔\x1b[0m ${path.relative(rootDir, scoresPath)}`);

// 5b. reality_history.jsonl — append daily snapshot
const historyPath = path.join(realityDir, 'reality_history.jsonl');
const historyEntry = {
  date: scanDate,
  generated_at: new Date().toISOString(),
  projects: {},
};
for (const [name, data] of sortedProjects) {
  historyEntry.projects[name] = data.activity_score;
}
fs.appendFileSync(historyPath, JSON.stringify(historyEntry) + '\n', 'utf8');
console.log(`  \x1b[32m✔\x1b[0m ${path.relative(rootDir, historyPath)} (appended)`);

// 5c. reality_report.md — human-readable report
let report = `# Reality Check Report — ${scanDate}\n\n`;
report += `> **Window**: ${windowDays} days | **Generated**: ${new Date().toISOString()}\n\n`;
report += `## Activity Scores\n\n`;
report += `| Rank | Project | Score | Trend | Git | Files | Terminal | Clipboard | Browser | Evidence |\n`;
report += `|:---:|:---|:---:|:---|:---:|:---:|:---:|:---:|:---:|:---:|\n`;

sortedProjects.forEach(([name, data], idx) => {
  const s = data.signals;
  const trendEmoji = data.trend === 'active' ? '🟢' :
    data.trend === 'moderate' ? '🟡' :
    data.trend === 'low' ? '⚪' : '💤';
  report += `| ${idx + 1} | **${name}** | ${data.activity_score} | ${trendEmoji} ${data.trend} | ${s.git_commits.events} | ${s.file_changes.events} | ${s.terminal.events} | ${s.clipboard.events} | ${s.browser_mentions.events} | ${data.evidence_count} |\n`;
});

// Add reality mismatch warnings
report += `\n## Reality Mismatch Alerts\n\n`;

// Check if any projects declared in context files have low activity
const activeProjectsPath = path.join(rootDir, 'context/ACTIVE_PROJECTS.md');
const currentStatePath = path.join(rootDir, 'context/CURRENT_STATE.md');

let declaredProjects = [];
try {
  const stateContent = fs.readFileSync(currentStatePath, 'utf8');
  // Look for project names mentioned in CURRENT_STATE
  for (const [name, data] of sortedProjects) {
    if (stateContent.toLowerCase().includes(name.toLowerCase())) {
      declaredProjects.push({ name, mentioned: true, score: data.activity_score, trend: data.trend });
    }
  }
} catch {}

let mismatchCount = 0;
for (const decl of declaredProjects) {
  if (decl.score < 20) {
    report += `> [!WARNING]\n> **${decl.name}** is mentioned in CURRENT_STATE.md but has activity_score = ${decl.score} (${decl.trend}). Possible hallucinated priority.\n\n`;
    mismatchCount++;
  }
}

if (mismatchCount === 0) {
  report += `No reality mismatches detected.\n`;
}

report += `\n## Signal Weights\n\n`;
report += `| Signal | Weight | Rationale |\n`;
report += `|:---|:---:|:---|\n`;
report += `| Git Commits | 0.30 | Strongest proof — immutable, requires actual work |\n`;
report += `| File Changes | 0.25 | Direct editing evidence |\n`;
report += `| Terminal Commands | 0.20 | Active development (builds, tests, deploys) |\n`;
report += `| Clipboard | 0.15 | Code engagement |\n`;
report += `| Browser Mentions | 0.10 | Weakest — talking ≠ doing |\n`;

const reportPath = path.join(realityDir, 'reality_report.md');
fs.writeFileSync(reportPath, report, 'utf8');
console.log(`  \x1b[32m✔\x1b[0m ${path.relative(rootDir, reportPath)}`);

// ─── Summary ─────────────────────────────────────────────────────────────────

const activeCount = sortedProjects.filter(([, d]) => d.trend === 'active').length;
const dormantCount = sortedProjects.filter(([, d]) => d.trend === 'dormant').length;

console.log(`\n\x1b[35m==================================================\x1b[0m`);
console.log(`\x1b[35m📊 REALITY CHECK COMPLETE\x1b[0m`);
console.log(`\x1b[35m==================================================\x1b[0m`);
console.log(`  Total projects scored: \x1b[36m${sortedProjects.length}\x1b[0m`);
console.log(`  Active (≥80):         \x1b[32m${activeCount}\x1b[0m`);
console.log(`  Dormant (<20):        \x1b[31m${dormantCount}\x1b[0m`);
console.log(`  Mismatches detected:  \x1b[33m${mismatchCount}\x1b[0m`);
console.log(`  Raw logs processed:   \x1b[36m${totalLinesProcessed.toLocaleString()}\x1b[0m`);
console.log(`\x1b[35m==================================================\x1b[0m\n`);
