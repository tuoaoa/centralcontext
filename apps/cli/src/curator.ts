import fs from 'fs';
import path from 'path';

// 1. Configuration relative to CLI root
const rootDir = path.resolve(__dirname, '../../..');

function getTodayString(): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

interface RawLogEntry {
  timestamp: string;
  source: string;
  project: string | null;
  type: string;
  content: string;
  quality_score?: number;
  memory_priority?: string;
  file_name?: string;
  file_path?: string;
}

function curateDailyMemory() {
  const todayStr = getTodayString();
  const rawLogPath = path.join(rootDir, 'data/raw', `${todayStr}.jsonl`);
  const dailyReportPath = path.join(rootDir, 'data/daily', `${todayStr}.md`);
  const pendingUpdatesPath = path.join(rootDir, 'data/memory/PENDING_UPDATES.md');

  console.log(`--- Selective Daily Memory Curator (${todayStr}) ---`);

  if (!fs.existsSync(rawLogPath)) {
    console.log(`\x1b[33mNo raw logs found for today (${todayStr}). Curation skipped.\x1b[0m`);
    process.exit(0);
  }

  // 2. Parse JSONL lines
  const fileContent = fs.readFileSync(rawLogPath, 'utf8');
  const lines = fileContent.trim().split('\n');
  const parsedLogs: RawLogEntry[] = [];
  
  // Stats counters
  let totalRawCount = 0;
  let collapsedDuplicateCount = 0;
  const sourceStats: Record<string, number> = {};
  const qualityStats: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  lines.forEach((line, index) => {
    if (!line.trim()) return;
    totalRawCount++;
    try {
      const entry = JSON.parse(line) as RawLogEntry;
      entry.content = entry.content.trim();

      // Check quality properties (inject default values if missing for backward compatibility)
      if (entry.quality_score === undefined) {
        entry.quality_score = 3;
        entry.memory_priority = 'useful';
      }

      if (!entry.content) {
        qualityStats[1]++;
        return; // Filter out empty lines
      }

      sourceStats[entry.source] = (sourceStats[entry.source] || 0) + 1;
      qualityStats[entry.quality_score]++;
      parsedLogs.push(entry);
    } catch (err) {
      console.warn(`[Warning] Skipping malformed line ${index + 1}:`, err);
    }
  });

  if (parsedLogs.length === 0) {
    console.log('\x1b[33mNo logs available after filtering. Curator finished.\x1b[0m');
    process.exit(0);
  }

  // 3. Deduplication rule: collapse sequential identical entries from same source
  const curatedLogs: RawLogEntry[] = [];
  for (let i = 0; i < parsedLogs.length; i++) {
    const current = parsedLogs[i];
    if (curatedLogs.length > 0) {
      const last = curatedLogs[curatedLogs.length - 1];
      if (last.source === current.source && last.type === current.type && last.content === current.content) {
        collapsedDuplicateCount++;
        continue;
      }
    }
    curatedLogs.push(current);
  }

  // 4. Filter and sort by Quality Scores (prioritizing quality_score >= 4)
  const criticalLogs = curatedLogs.filter(log => log.quality_score === 5);
  const highLogs = curatedLogs.filter(log => log.quality_score === 4);
  const usefulLogs = curatedLogs.filter(log => log.quality_score === 3);
  const lowLogs = curatedLogs.filter(log => log.quality_score === 2);

  // 5. Synthesize Curated Memory Report
  let reportMd = `# Daily Curated Memory - ${todayStr}\n\n`;
  
  // Section 1: Critical Sources (Score 5)
  reportMd += `## Critical Memory Sources Reviewed (Score 5)\n`;
  if (criticalLogs.length === 0) {
    reportMd += `*No critical memory files modified or agent prompts detected today.*\n\n`;
  } else {
    // List modified files or prompts
    const prompts = criticalLogs.filter(l => l.type === 'agent_prompt');
    const files = criticalLogs.filter(l => l.type !== 'agent_prompt');

    if (files.length > 0) {
      reportMd += `### Modified Plans, Tasks & Decisions:\n`;
      const uniqueFiles = Array.from(new Set(files.map(f => f.file_name || 'unknown_file')));
      uniqueFiles.forEach(fName => {
        reportMd += `- **[File]** \`${fName}\` modified.\n`;
      });
    }

    if (prompts.length > 0) {
      reportMd += `### Detected Agent Instructions / Prompts:\n`;
      prompts.forEach(p => {
        const time = new Date(p.timestamp).toTimeString().split(' ')[0].substring(0, 5);
        // Take a small snippet
        const snippet = p.content.length > 150 ? p.content.substring(0, 150) + '...' : p.content;
        reportMd += `- **${time} (clipboard)**: ${snippet.replace(/\r?\n/g, ' ')}\n`;
      });
    }
    reportMd += `\n`;
  }

  // Section 2: Decisions Extracted (Score 4 & 5 files)
  reportMd += `## Decisions & Milestones Extracted\n`;
  const adrEdits = criticalLogs.filter(l => (l.file_name || '').toLowerCase().includes('decision'));
  if (adrEdits.length > 0) {
    reportMd += `- Architecture Decisions file \`DECISIONS.md\` was updated. Review [DECISIONS.md](file:///context/DECISIONS.md) to inspect ADR records.\n`;
  } else {
    // Look in high priority logs or manual work logs for mentions of decisions
    const manualEntries = curatedLogs.filter(l => l.source === 'manual' || l.type === 'assistant');
    let decisionMentions = 0;
    manualEntries.forEach(l => {
      if (l.content.toLowerCase().includes('decide') || l.content.toLowerCase().includes('decision') || l.content.toLowerCase().includes('adr')) {
        const snippet = l.content.split('\n')[0];
        reportMd += `- Mentor/Agent noted: "${snippet}"\n`;
        decisionMentions++;
      }
    });
    if (decisionMentions === 0) {
      reportMd += `*No structural decisions explicitly recorded today.*\n`;
    }
  }
  reportMd += `\n`;

  // Section 3: Current State Changes
  reportMd += `## Current State & Tasks Progress\n`;
  const taskEdits = criticalLogs.filter(l => (l.file_name || '').toLowerCase().includes('task') || (l.file_name || '').toLowerCase().includes('state'));
  if (taskEdits.length > 0) {
    reportMd += `- Activity captured in task checklist/current state files.\n`;
  }
  // Count checkboxes toggled
  let completedTasks = 0;
  highLogs.forEach(l => {
    const completions = (l.content.match(/- \[x\]/g) || []).length;
    completedTasks += completions;
  });
  if (completedTasks > 0) {
    reportMd += `- Captured **${completedTasks}** task checkboxes completed today!\n`;
  } else {
    reportMd += `- No checklist item completions detected inside logged file changes.\n`;
  }
  reportMd += `\n`;

  // Section 4: Important Files Changed (Score 4 Configs & Score 3 Code updates)
  reportMd += `## Project Progress & File Updates\n`;
  const fileWatcherLogs = curatedLogs.filter(l => l.source === 'file_watcher');
  if (fileWatcherLogs.length === 0) {
    reportMd += `*No project file changes watched today.*\n\n`;
  } else {
    const uniqCodes = Array.from(new Set(fileWatcherLogs.map(l => l.file_name || 'unknown_file')));
    reportMd += `### Modified Files:\n`;
    uniqCodes.forEach(fName => {
      const count = fileWatcherLogs.filter(l => l.file_name === fName).length;
      reportMd += `- \`${fName}\` (saved ${count} file snapshots)\n`;
    });
    reportMd += `\n`;
  }

  // Section 5: Low Value / Noise Statistics (Score <= 2)
  reportMd += `## Curation Statistics & Ignored Noise\n`;
  reportMd += `* **Total logs processed**: ${totalRawCount}\n`;
  reportMd += `* **Collapsed duplicate rows**: ${collapsedDuplicateCount}\n`;
  reportMd += `* **Ignored local noise (Score <= 2)**: ${qualityStats[1] + qualityStats[2] + collapsedDuplicateCount} entries\n`;
  reportMd += `* **High value inputs saved (Score >= 4)**: ${criticalLogs.length + highLogs.length} entries\n`;
  reportMd += `\n`;

  const dailyDir = path.dirname(dailyReportPath);
  if (!fs.existsSync(dailyDir)) {
    fs.mkdirSync(dailyDir, { recursive: true });
  }
  fs.writeFileSync(dailyReportPath, reportMd, 'utf8');
  console.log(`\x1b[32m✔ Curated daily report written to: data/daily/${todayStr}.md\x1b[0m`);

  // 6. Propose updates in data/memory/PENDING_UPDATES.md
  // Gather achievements from Priority 4 & 5 logs
  let achievements = '';
  highLogs.forEach(log => {
    // If it's a terminal log of a build command or manual entry
    if (log.source === 'terminal' && log.type === 'terminal_run') {
      achievements += `  - Executed command successfully: \`${log.content.split('\n')[0].replace('Command: ', '')}\`\n`;
    }
  });
  
  criticalLogs.filter(l => l.type === 'agent_prompt').forEach(promptLog => {
    const firstLine = promptLog.content.split('\n')[0].substring(0, 100);
    achievements += `  - Copied Instruction Prompt: "${firstLine}..."\n`;
  });

  if (!achievements) {
    achievements = '  - Routine project coordination, workspace changes monitored.\n';
  }

  const suggestionMd = `## Suggested Update - ${todayStr}

Target file: \`context/CURRENT_STATE.md\`
Reason: Data Quality curator analysis (Prioritizing high-value activities)
Importance: 4
Lifespan: week
Content:
### Achievements from ${todayStr}
${achievements}
`;

  const memoryDir = path.dirname(pendingUpdatesPath);
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  let currentPending = '';
  if (fs.existsSync(pendingUpdatesPath)) {
    currentPending = fs.readFileSync(pendingUpdatesPath, 'utf8');
  }

  const newPendingContent = `# Pending Updates\n\n*This file contains proposed context updates recommended by the daily curator CLI. Please review and apply manually to context/ files.*\n\n` + 
    suggestionMd + '\n\n---\n\n' + 
    currentPending.replace(/# Pending Updates\n\n\*This file contains proposed context.*?\n\n/s, '');

  fs.writeFileSync(pendingUpdatesPath, newPendingContent, 'utf8');
  console.log(`\x1b[32m✔ High value suggested updates drafted in: data/memory/PENDING_UPDATES.md\x1b[0m`);
}

curateDailyMemory();
