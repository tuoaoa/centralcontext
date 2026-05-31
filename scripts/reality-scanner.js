/**
 * CentralContext Reality Check Layer v2.0
 * scripts/reality-scanner.js
 *
 * Principle: ACTION > WORDS
 * What the Founder DOES matters more than what the Founder SAYS.
 *
 * Computes dual-window activity scores (7-day + 30-day) per project
 * from behavioral telemetry. Generates reality_mismatch_alert candidate
 * memories when declared priorities contradict actual activity.
 *
 * Signals (weighted):
 *   - Git commits       (0.30) — strongest proof of work, immutable
 *   - File changes      (0.25) — direct editing evidence
 *   - Terminal commands  (0.20) — active development (builds, tests, deploys)
 *   - Clipboard         (0.15) — code engagement
 *   - Browser mentions  (0.10) — weakest, talking ≠ doing
 *
 * Usage:
 *   npm run reality:scan
 *   npm run reality:scan -- --date 2026-05-31
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Configuration ───────────────────────────────────────────────────────────

const rootDir = path.resolve(__dirname, '..');
const devflowDir = '/Users/tuoaoa/Tuoaoa/devflow';
const rawDir = path.join(rootDir, 'data/raw');
const realityDir = path.join(rootDir, 'data/memory/reality');
const candidatesDir = path.join(rootDir, 'data/memory/candidates');

// Signal weights — production signals weighted higher than passive signals
const SIGNAL_WEIGHTS = {
  git_commits: 0.30,
  file_changes: 0.25,
  terminal: 0.20,
  clipboard: 0.15,
  browser_mentions: 0.10,
};

// Dual windows
const WINDOWS = [30, 7];

// ─── Argument Parsing ────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getTodayString() {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

let scanDate = getTodayString();

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date' && args[i + 1]) {
    scanDate = args[i + 1].trim();
  }
}

// ─── Ensure directories ──────────────────────────────────────────────────────

[realityDir, candidatesDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── Banner ──────────────────────────────────────────────────────────────────

console.log(`\n\x1b[35m==================================================\x1b[0m`);
console.log(`\x1b[35m🔍 REALITY CHECK LAYER v2.0\x1b[0m`);
console.log(`\x1b[35m   ACTION > WORDS\x1b[0m`);
console.log(`\x1b[35m==================================================\x1b[0m`);
console.log(`Scan Date:   \x1b[36m${scanDate}\x1b[0m`);
console.log(`Windows:     \x1b[36m${WINDOWS.join('d + ')}d\x1b[0m`);
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

// Discover all real project directory names from devflow (for browser content extraction)
let knownProjectDirs = [];
try {
  knownProjectDirs = fs.readdirSync(devflowDir)
    .filter(name => {
      if (name.startsWith('.')) return false;
      try {
        return fs.statSync(path.join(devflowDir, name)).isDirectory();
      } catch { return false; }
    });
} catch {}

// Extract mentioned project names from text content (for browser chat)
function extractProjectsFromText(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const found = [];
  for (const projName of knownProjectDirs) {
    if (lower.includes(projName.toLowerCase())) {
      found.push(projName);
    }
  }
  return found;
}

// Non-project directory names to filter out
const nonProjectNames = new Set([
  'src', 'scripts', 'context', 'data', 'memory', 'public', 'config',
  'candidates', 'distillery_runs', 'ai_judge', 'approved', 'rejected',
  'budget', 'founder', 'daily', 'backups', 'browser-extension',
  'telegram-listener', 'locks', 'cache', 'logs', 'shared',
]);

// ─── Step 1: Parse raw logs per window ───────────────────────────────────────

console.log(`\x1b[33m📂 Step 1: Parsing raw telemetry logs...\x1b[0m`);

const scanDateObj = new Date(scanDate + 'T23:59:59Z');

// Pre-load ALL raw files sorted
let allRawFiles = [];
try {
  allRawFiles = fs.readdirSync(rawDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .map(f => ({
      name: f,
      dateStr: f.replace('.jsonl', ''),
      date: new Date(f.replace('.jsonl', '') + 'T00:00:00Z'),
      path: path.join(rawDir, f),
    }));
} catch (e) {
  console.error(`\x1b[31mError reading raw directory: ${e.message}\x1b[0m`);
}

// Parse raw logs and accumulate per-project data for a given window
function parseRawLogsForWindow(windowDays) {
  const windowStart = new Date(scanDateObj);
  windowStart.setDate(windowStart.getDate() - windowDays);

  const relevantFiles = allRawFiles.filter(f => f.date >= windowStart && f.date <= scanDateObj);

  const projData = {}; // project -> { terminal, file_change_events, file_change_unique, clipboard, browser }
  let linesProcessed = 0;

  function ensure(name) {
    if (!name || name === '.DS_Store' || nonProjectNames.has(name) || name.startsWith('.')) return false;
    if (!projData[name]) {
      projData[name] = {
        terminal_events: 0,
        file_change_events: 0,
        file_change_unique: new Set(),
        clipboard_events: 0,
        browser_events: 0,
      };
    }
    return true;
  }

  for (const rawFile of relevantFiles) {
    const lines = fs.readFileSync(rawFile.path, 'utf8').split('\n').filter(Boolean);

    for (const line of lines) {
      linesProcessed++;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }

      const source = entry.source || '';
      let project = null;

      // ── Terminal: derive project from CWD in content ──
      if (source === 'terminal') {
        project = extractProjectFromCWD(entry.content);
        if (!project) {
          const fp = entry.project;
          if (fp && fp !== 'CentralContext') project = fp;
        }
        if (project && ensure(project)) {
          projData[project].terminal_events++;
        }
      }

      // ── File watcher: derive project from file_path ──
      else if (source === 'file_watcher') {
        project = extractProjectFromPath(entry.file_path);
        if (!project) {
          const fp = entry.project;
          if (fp && !nonProjectNames.has(fp)) project = fp;
        }
        if (project && ensure(project)) {
          projData[project].file_change_events++;
          if (entry.file_path) projData[project].file_change_unique.add(entry.file_path);
        }
      }

      // ── Clipboard: use project field ──
      else if (source === 'clipboard') {
        project = entry.project;
        if (project && project !== 'General') {
          if (project === 'CentralContext') project = 'centalcontext';
          if (ensure(project)) projData[project].clipboard_events++;
        }
      }

      // ── Browser chat: use project field + extract mentioned projects from content ──
      else if (source === 'browser_chat') {
        // Primary: project field
        project = entry.project;
        if (project) {
          if (project === 'CentralContext') project = 'centalcontext';
          if (ensure(project)) projData[project].browser_events++;
        }

        // Secondary: extract mentioned project names from content (weak signal)
        const content = entry.content || '';
        const mentioned = extractProjectsFromText(content);
        for (const mp of mentioned) {
          if (mp !== project && ensure(mp)) {
            // Count as fractional mention (1 event per mention, but weight is already low at 0.10)
            projData[mp].browser_events++;
          }
        }
      }

      // ── Telegram: use project field ──
      else if (source === 'telegram_export') {
        project = entry.project;
        if (project && ensure(project)) {
          projData[project].browser_events++; // passive mention
        }
      }
    }
  }

  return { projData, linesProcessed, fileCount: relevantFiles.length };
}

// Parse for both windows
const windowResults = {};
for (const w of WINDOWS) {
  const result = parseRawLogsForWindow(w);
  windowResults[w] = result;
  console.log(`  ${w}d window: ${result.fileCount} files, ${result.linesProcessed.toLocaleString()} entries, ${Object.keys(result.projData).length} projects`);
}

// ─── Step 2: Scan git repositories ───────────────────────────────────────────

console.log(`\n\x1b[33m📦 Step 2: Scanning git repositories...\x1b[0m`);

// Scan git for both windows
const gitDataByWindow = {};

for (const w of WINDOWS) {
  const windowStart = new Date(scanDateObj);
  windowStart.setDate(windowStart.getDate() - w);
  const sinceDate = windowStart.toISOString().split('T')[0];
  const gd = {};

  try {
    const devflowEntries = fs.readdirSync(devflowDir);
    for (const entry of devflowEntries) {
      const fullPath = path.join(devflowDir, entry);
      try {
        if (!fs.statSync(fullPath).isDirectory()) continue;
        if (!fs.existsSync(path.join(fullPath, '.git'))) continue;
      } catch { continue; }

      try {
        const commitCountStr = execSync(
          `git log --oneline --since="${sinceDate}" 2>/dev/null | wc -l`,
          { cwd: fullPath, encoding: 'utf8', timeout: 10000 }
        ).trim();
        const commitCount = parseInt(commitCountStr, 10) || 0;

        let lastCommitDate = null;
        try {
          lastCommitDate = execSync(
            `git log -1 --format="%aI" 2>/dev/null`,
            { cwd: fullPath, encoding: 'utf8', timeout: 5000 }
          ).trim();
        } catch { lastCommitDate = null; }

        gd[entry] = { commits: commitCount, last_commit_date: lastCommitDate || null };
      } catch {}
    }
  } catch {}

  gitDataByWindow[w] = gd;
  const activeRepos = Object.entries(gd).filter(([, d]) => d.commits > 0);
  console.log(`  ${w}d window: ${activeRepos.length} repos with commits`);
  if (w === 30) {
    for (const [name, d] of activeRepos.sort((a, b) => b[1].commits - a[1].commits)) {
      console.log(`    \x1b[32m✔\x1b[0m ${name}: ${d.commits} commits (last: ${d.last_commit_date ? d.last_commit_date.substring(0, 10) : 'N/A'})`);
    }
  }
}

// ─── Step 3: Compute weighted scores for each window ─────────────────────────

console.log(`\n\x1b[33m📊 Step 3: Computing dual-window activity scores...\x1b[0m\n`);

function computeSignalScore(signalType, data, gitInfo, windowDays) {
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
      const uniqueFiles = data.file_change_unique ? data.file_change_unique.size : 0;
      const events = data.file_change_events || 0;
      const uniqueScore = Math.min(uniqueFiles * 5, 70);
      const volumeScore = Math.min(Math.floor(events / 10), 30);
      return Math.min(uniqueScore + volumeScore, 100);
    }
    case 'terminal':
      return Math.min((data.terminal_events || 0) * 8, 100);
    case 'clipboard':
      return Math.min((data.clipboard_events || 0) * 5, 100);
    case 'browser_mentions':
      // Capped early — browser_chat is noisy (streaming duplicates). Talking ≠ doing.
      return Math.min((data.browser_events || 0) * 2, 100);
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

function computeScoresForWindow(windowDays) {
  const { projData } = windowResults[windowDays];
  const gitData = gitDataByWindow[windowDays];
  const scores = {};

  // Merge all known projects from telemetry + git
  const allProjects = new Set([
    ...Object.keys(projData),
    ...Object.keys(gitData),
  ]);

  for (const project of allProjects) {
    if (nonProjectNames.has(project) || project.startsWith('.')) continue;

    const data = projData[project] || {
      terminal_events: 0, file_change_events: 0,
      file_change_unique: new Set(), clipboard_events: 0, browser_events: 0,
    };
    const gitInfo = gitData[project] || null;

    const signals = {};
    let totalScore = 0;

    for (const [signalType, weight] of Object.entries(SIGNAL_WEIGHTS)) {
      const signalScore = computeSignalScore(signalType, data, gitInfo, windowDays);

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
          extra.unique_files = data.file_change_unique ? data.file_change_unique.size : 0;
          break;
        case 'terminal': eventsCount = data.terminal_events; break;
        case 'clipboard': eventsCount = data.clipboard_events; break;
        case 'browser_mentions': eventsCount = data.browser_events; break;
      }

      signals[signalType] = { events: eventsCount, score: signalScore, weight, ...extra };
      totalScore += weight * signalScore;
    }

    const activityScore = Math.round(totalScore);
    const evidenceCount = (data.terminal_events || 0) + (data.file_change_events || 0) +
      (data.clipboard_events || 0) + (data.browser_events || 0) + (gitInfo ? gitInfo.commits : 0);

    let lastActivity = null;
    if (gitInfo && gitInfo.last_commit_date) lastActivity = gitInfo.last_commit_date;

    scores[project] = {
      activity_score: activityScore,
      signals,
      last_activity: lastActivity,
      evidence_count: evidenceCount,
      trend: classifyTrend(activityScore),
    };
  }

  return scores;
}

// Compute scores for both windows
const scoresByWindow = {};
for (const w of WINDOWS) {
  scoresByWindow[w] = computeScoresForWindow(w);
}

// Primary scores are the 30-day window; 7-day is for trend detection
const primaryScores = scoresByWindow[30];
const shortTermScores = scoresByWindow[7];

// Enrich primary scores with 7-day data for trend detection
for (const [project, data] of Object.entries(primaryScores)) {
  const shortTerm = shortTermScores[project];
  data.score_7d = shortTerm ? shortTerm.activity_score : 0;
  data.trend_7d = shortTerm ? shortTerm.trend : 'dormant';

  // Detect momentum: short-term score much higher than long-term = "heating up"
  if (data.score_7d >= data.activity_score + 20) {
    data.momentum = 'heating_up';
  } else if (data.score_7d <= data.activity_score - 20) {
    data.momentum = 'cooling_down';
  } else {
    data.momentum = 'stable';
  }
}

// ─── Step 4: Sort and display results ────────────────────────────────────────

const sortedProjects = Object.entries(primaryScores)
  .sort((a, b) => b[1].activity_score - a[1].activity_score);

console.log(`  ${'Project'.padEnd(30)} ${'30d'.padStart(4)} ${'7d'.padStart(4)}  ${'Momentum'.padEnd(12)} ${'Trend'.padEnd(10)} ${'Git'.padStart(4)} ${'Files'.padStart(6)} ${'Term'.padStart(5)} ${'Clip'.padStart(5)} ${'Brws'.padStart(5)}`);
console.log(`  ${'─'.repeat(30)} ${'─'.repeat(4)} ${'─'.repeat(4)}  ${'─'.repeat(12)} ${'─'.repeat(10)} ${'─'.repeat(4)} ${'─'.repeat(6)} ${'─'.repeat(5)} ${'─'.repeat(5)} ${'─'.repeat(5)}`);

for (const [name, data] of sortedProjects) {
  const s = data.signals;
  const scoreColor = data.activity_score >= 80 ? '\x1b[32m' :
    data.activity_score >= 50 ? '\x1b[33m' :
    data.activity_score >= 20 ? '\x1b[90m' : '\x1b[31m';
  const trendEmoji = data.trend === 'active' ? '🟢' :
    data.trend === 'moderate' ? '🟡' :
    data.trend === 'low' ? '⚪' : '💤';
  const momentumIcon = data.momentum === 'heating_up' ? '🔥' :
    data.momentum === 'cooling_down' ? '📉' : '➡️';

  console.log(`  ${name.padEnd(30)} ${scoreColor}${String(data.activity_score).padStart(4)}\x1b[0m ${String(data.score_7d).padStart(4)}  ${momentumIcon} ${data.momentum.padEnd(10)} ${trendEmoji} ${data.trend.padEnd(8)} ${String(s.git_commits.events).padStart(4)} ${String(s.file_changes.events).padStart(6)} ${String(s.terminal.events).padStart(5)} ${String(s.clipboard.events).padStart(5)} ${String(s.browser_mentions.events).padStart(5)}`);
}

// ─── Step 5: Reality Mismatch Detection + Alert Candidates ───────────────────

console.log(`\n\x1b[33m⚠️  Step 5: Reality mismatch detection...\x1b[0m`);

const currentStatePath = path.join(rootDir, 'context/CURRENT_STATE.md');
let stateContent = '';
try { stateContent = fs.readFileSync(currentStatePath, 'utf8'); } catch {}

// Find projects mentioned in CURRENT_STATE.md
const declaredProjects = [];
for (const [name, data] of sortedProjects) {
  if (stateContent.toLowerCase().includes(name.toLowerCase())) {
    declaredProjects.push({ name, score_30d: data.activity_score, score_7d: data.score_7d, trend: data.trend, momentum: data.momentum });
  }
}

const mismatchAlerts = [];
for (const decl of declaredProjects) {
  // Threshold: score < 25 triggers mismatch. A project with score 20 from only browser
  // mentions (0 git, 0 terminal, 0 file edits) should still be flagged — talking ≠ doing.
  if (decl.score_30d < 25) {
    const alert = {
      type: 'reality_mismatch_alert',
      project: decl.name,
      source: 'reality_scanner',
      proposed_memory: `REALITY MISMATCH: "${decl.name}" is declared in CURRENT_STATE.md but has activity_score = ${decl.score_30d}/100 (30d) and ${decl.score_7d}/100 (7d). Trend: ${decl.trend}. No significant git commits, terminal activity, or file edits detected in the measurement window. This may indicate a stale priority declaration that no longer reflects actual Founder behavior.`,
      confidence: 95,
      severity: 'high',
      action_required: 'Founder should review whether this project is still a real priority or if CURRENT_STATE.md needs updating.',
      evidence: {
        activity_score_30d: decl.score_30d,
        activity_score_7d: decl.score_7d,
        trend: decl.trend,
        momentum: decl.momentum,
      },
      generated_at: new Date().toISOString(),
    };
    mismatchAlerts.push(alert);
    console.log(`  \x1b[33m⚠ MISMATCH:\x1b[0m ${decl.name} — declared in CURRENT_STATE.md but score = ${decl.score_30d} (${decl.trend})`);
  }
}

if (mismatchAlerts.length === 0) {
  console.log(`  No reality mismatches detected.`);
}

// Write mismatch alerts as candidate memories for Founder review
if (mismatchAlerts.length > 0) {
  const alertsPath = path.join(realityDir, `${scanDate}.reality_mismatch_alerts.json`);
  fs.writeFileSync(alertsPath, JSON.stringify({
    scan_date: scanDate,
    generated_at: new Date().toISOString(),
    principle: 'ACTION > WORDS',
    note: 'These alerts are generated because declared priorities in CURRENT_STATE.md do not match actual behavioral telemetry. Founder review required. CURRENT_STATE.md will NOT be auto-updated.',
    alerts: mismatchAlerts,
  }, null, 2), 'utf8');
  console.log(`  \x1b[32m✔\x1b[0m ${path.relative(rootDir, alertsPath)} (${mismatchAlerts.length} alerts)`);
}

// ─── Step 6: Write outputs ───────────────────────────────────────────────────

console.log(`\n\x1b[33m💾 Step 6: Writing output files...\x1b[0m`);

// 6a. reality_scores.json
const scoresOutput = {
  generated_at: new Date().toISOString(),
  principle: 'ACTION > WORDS',
  scan_date: scanDate,
  windows: {},
  mismatch_alerts_count: mismatchAlerts.length,
};

for (const w of WINDOWS) {
  const sorted = Object.entries(scoresByWindow[w])
    .sort((a, b) => b[1].activity_score - a[1].activity_score);

  const windowData = {};
  for (const [name, data] of sorted) {
    const serializedSignals = {};
    for (const [key, val] of Object.entries(data.signals)) {
      serializedSignals[key] = { ...val };
      // Remove Set from serialization
      if (serializedSignals[key].file_change_unique) {
        delete serializedSignals[key].file_change_unique;
      }
    }
    windowData[name] = {
      activity_score: data.activity_score,
      signals: serializedSignals,
      last_activity: data.last_activity,
      evidence_count: data.evidence_count,
      trend: data.trend,
    };
  }
  scoresOutput.windows[`${w}d`] = { window_days: w, projects: windowData };
}

// Also write a flat "projects" key with 30d as primary + 7d enrichment
scoresOutput.projects = {};
for (const [name, data] of sortedProjects) {
  const serializedSignals = {};
  for (const [key, val] of Object.entries(data.signals)) {
    serializedSignals[key] = { ...val };
  }
  scoresOutput.projects[name] = {
    activity_score: data.activity_score,
    score_7d: data.score_7d,
    trend_30d: data.trend,
    trend_7d: data.trend_7d,
    momentum: data.momentum,
    signals: serializedSignals,
    last_activity: data.last_activity,
    evidence_count: data.evidence_count,
  };
}

const scoresPath = path.join(realityDir, 'reality_scores.json');
fs.writeFileSync(scoresPath, JSON.stringify(scoresOutput, null, 2), 'utf8');
console.log(`  \x1b[32m✔\x1b[0m ${path.relative(rootDir, scoresPath)}`);

// 6b. reality_history.jsonl — append daily snapshot
const historyPath = path.join(realityDir, 'reality_history.jsonl');
const historyEntry = {
  date: scanDate,
  generated_at: new Date().toISOString(),
  projects_30d: {},
  projects_7d: {},
};
for (const [name, data] of sortedProjects) {
  historyEntry.projects_30d[name] = data.activity_score;
  historyEntry.projects_7d[name] = data.score_7d;
}
fs.appendFileSync(historyPath, JSON.stringify(historyEntry) + '\n', 'utf8');
console.log(`  \x1b[32m✔\x1b[0m ${path.relative(rootDir, historyPath)} (appended)`);

// 6c. reality_report.md — human-readable report with ACTION > WORDS rule
let report = `# Reality Check Report — ${scanDate}\n\n`;
report += `> **Principle: ACTION > WORDS**\n>\n`;
report += `> What the Founder DOES matters more than what the Founder SAYS.\n>\n`;
report += `> Git commits, file edits, and terminal commands carry higher weight than\n`;
report += `> browser conversations and clipboard activity. A project that is merely\n`;
report += `> discussed but never coded scores low. A project that is actively coded\n`;
report += `> but never mentioned scores high.\n>\n`;
report += `> This report NEVER auto-updates CURRENT_STATE.md.\n`;
report += `> It surfaces contradictions for Founder review only.\n\n`;
report += `---\n\n`;

// 30-day scores table
report += `## Activity Scores (30-day window)\n\n`;
report += `| Rank | Project | 30d | 7d | Momentum | Trend | Git | Files | Terminal | Clipboard | Browser |\n`;
report += `|:---:|:---|:---:|:---:|:---|:---|:---:|:---:|:---:|:---:|:---:|\n`;

sortedProjects.forEach(([name, data], idx) => {
  const s = data.signals;
  const trendEmoji = data.trend === 'active' ? '🟢' :
    data.trend === 'moderate' ? '🟡' :
    data.trend === 'low' ? '⚪' : '💤';
  const momentumIcon = data.momentum === 'heating_up' ? '🔥 heating up' :
    data.momentum === 'cooling_down' ? '📉 cooling' : '➡️ stable';
  report += `| ${idx + 1} | **${name}** | ${data.activity_score} | ${data.score_7d} | ${momentumIcon} | ${trendEmoji} ${data.trend} | ${s.git_commits.events} | ${s.file_changes.events} | ${s.terminal.events} | ${s.clipboard.events} | ${s.browser_mentions.events} |\n`;
});

// Mismatch alerts section
report += `\n## Reality Mismatch Alerts\n\n`;
if (mismatchAlerts.length > 0) {
  for (const alert of mismatchAlerts) {
    report += `> [!WARNING]\n`;
    report += `> **${alert.project}** is declared in CURRENT_STATE.md but has:\n`;
    report += `> - 30-day activity_score = ${alert.evidence.activity_score_30d}\n`;
    report += `> - 7-day activity_score = ${alert.evidence.activity_score_7d}\n`;
    report += `> - Trend: ${alert.evidence.trend} | Momentum: ${alert.evidence.momentum}\n`;
    report += `>\n`;
    report += `> **Action Required**: Founder should review if this is still a real priority.\n`;
    report += `> CURRENT_STATE.md will NOT be auto-updated.\n\n`;
  }
} else {
  report += `No reality mismatches detected. All declared priorities align with behavioral telemetry.\n\n`;
}

// Signal weights documentation
report += `## Signal Weights (ACTION > WORDS)\n\n`;
report += `| Signal | Weight | Category | Rationale |\n`;
report += `|:---|:---:|:---:|:---|\n`;
report += `| Git Commits | 0.30 | **ACTION** | Strongest proof — immutable, requires actual work |\n`;
report += `| File Changes | 0.25 | **ACTION** | Direct editing evidence |\n`;
report += `| Terminal Commands | 0.20 | **ACTION** | Active development (builds, tests, deploys) |\n`;
report += `| Clipboard | 0.15 | mixed | Code engagement (copy/paste) |\n`;
report += `| Browser Mentions | 0.10 | **WORDS** | Weakest — talking ≠ doing |\n\n`;
report += `> [!NOTE]\n`;
report += `> Browser mentions are used only as weak evidence. Even if a project is discussed\n`;
report += `> extensively in browser conversations, it cannot override git/file/terminal signals.\n`;

const reportPath = path.join(realityDir, 'reality_report.md');
fs.writeFileSync(reportPath, report, 'utf8');
console.log(`  \x1b[32m✔\x1b[0m ${path.relative(rootDir, reportPath)}`);

// ─── Summary ─────────────────────────────────────────────────────────────────

const activeCount = sortedProjects.filter(([, d]) => d.trend === 'active').length;
const dormantCount = sortedProjects.filter(([, d]) => d.trend === 'dormant').length;
const heatingUp = sortedProjects.filter(([, d]) => d.momentum === 'heating_up').length;

console.log(`\n\x1b[35m==================================================\x1b[0m`);
console.log(`\x1b[35m📊 REALITY CHECK COMPLETE (ACTION > WORDS)\x1b[0m`);
console.log(`\x1b[35m==================================================\x1b[0m`);
console.log(`  Total projects scored: \x1b[36m${sortedProjects.length}\x1b[0m`);
console.log(`  Active (≥80):         \x1b[32m${activeCount}\x1b[0m`);
console.log(`  Dormant (<20):        \x1b[31m${dormantCount}\x1b[0m`);
console.log(`  Heating up (7d>30d):  \x1b[33m${heatingUp}\x1b[0m`);
console.log(`  Mismatches detected:  \x1b[33m${mismatchAlerts.length}\x1b[0m`);
console.log(`  Raw logs (30d):       \x1b[36m${windowResults[30].linesProcessed.toLocaleString()}\x1b[0m`);
console.log(`\x1b[35m==================================================\x1b[0m\n`);
