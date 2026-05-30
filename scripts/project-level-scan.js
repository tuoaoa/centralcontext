const fs = require('fs');
const path = require('path');

const parentDir = '/Users/tuoaoa/Tuoaoa/devflow';
const rootDir = path.resolve(__dirname, '..');
const apiKey = process.env.CENTRAL_CONTEXT_API_KEY || '2578420fb040d51884e5c656b4bae6b2a2f594867749f24cefcaf01a95b683b3';
const localApiUrl = 'http://localhost:3000/api/log/raw';

// Excluded directory names
const ignoredDirs = [
  'node_modules', '.git', 'dist', 'build', 'data/raw', 'data/backups', 
  '.next', 'coverage', '.DS_Store', 'venv', '.venv'
];

// Target filenames
const targetFiles = [
  'README.md', 'implementation_plan.md', 'task.md', 'walkthrough.md', 
  'DECISIONS.md', 'AGENT_README.md', 'MEMORY_RULES.md', 'CURRENT_STATE.md', 
  'CENTRAL_CONTEXT.md', 'package.json'
];

// In-memory cache trackers
const projectsFound = [];
const artifactsMap = {}; // project -> files list
const ignoredMap = []; // { file, reason }
let postedCount = 0;

function isTargetFile(filePath) {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  
  // 1. Matches exact filename
  if (targetFiles.includes(fileName)) return true;
  
  // 2. Matches docs/**/*.md
  if (ext === '.md' && filePath.split(path.sep).some(part => part === 'docs')) {
    return true;
  }
  
  return false;
}

function scanDirectory(dirPath, projectKey) {
  try {
    const items = fs.readdirSync(dirPath);
    
    items.forEach(item => {
      const fullPath = path.join(dirPath, item);
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        // Skip ignored directories
        if (ignoredDirs.includes(item)) {
          ignoredMap.push({ path: fullPath, reason: 'Ignored directory pattern' });
          return;
        }
        scanDirectory(fullPath, projectKey);
      } else if (stats.isFile()) {
        if (isTargetFile(fullPath)) {
          if (!artifactsMap[projectKey]) {
            artifactsMap[projectKey] = [];
          }
          artifactsMap[projectKey].push(fullPath);
        } else {
          // Ignored because it's not a target extension/filename
          const ext = path.extname(item).toLowerCase();
          if (ext === '.md' || ext === '.json') {
            ignoredMap.push({ path: fullPath, reason: 'Not an active memory target filename' });
          }
        }
      }
    });
  } catch (e) {
    // Fail quietly for locked dirs
  }
}

async function postLogToServer(filePath, projectKey) {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  
  let qualityScore = 3;
  let priority = 'useful';
  
  const lowerName = fileName.toLowerCase();
  const isCritical = ['plan', 'task', 'walkthrough', 'decisions', 'rules', 'state', 'central'].some(k => lowerName.includes(k));
  
  if (isCritical) {
    qualityScore = 5;
    priority = 'critical';
  } else if (lowerName === 'readme.md' || fileName === 'package.json') {
    qualityScore = 4;
    priority = 'high';
  }

  let fileContent = '';
  try {
    fileContent = fs.readFileSync(filePath, 'utf8');
    // Truncate large files to prevent server payloads block
    if (fileContent.length > 50 * 1024) {
      fileContent = fileContent.substring(0, 20 * 1024) + '\n\n... [TRUNCATED] ...\n\n' + fileContent.substring(fileContent.length - 20 * 1024);
    }
  } catch (e) {
    fileContent = `[Error reading file contents]: ${e.message}`;
  }

  const payload = {
    source: 'file_watcher',
    type: 'critical_doc_snapshot',
    project: projectKey,
    file_path: filePath,
    file_name: fileName,
    extension: ext,
    quality_score: qualityScore,
    memory_priority: priority,
    content: `[Event: SCAN_RESTORE] File: ${relativePath(filePath)}\n\n${fileContent}`
  };

  try {
    const response = await fetch(localApiUrl, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      postedCount++;
    }
  } catch (err) {
    // Fail silently
  }
}

function relativePath(fullPath) {
  return path.relative(parentDir, fullPath);
}

async function runScan() {
  console.log('Starting Project-Level Scanner of devflow...');
  
  const level1Items = fs.readdirSync(parentDir);
  
  level1Items.forEach(item => {
    const fullPath = path.join(parentDir, item);
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory() && !ignoredDirs.includes(item) && !item.startsWith('.')) {
      projectsFound.push(item);
      scanDirectory(fullPath, item);
    }
  });

  console.log(`\nFound ${projectsFound.length} level-1 projects.`);
  
  // Sort projects by artifact counts
  const sortedProjects = [...projectsFound].sort((a, b) => {
    const countA = (artifactsMap[a] || []).length;
    const countB = (artifactsMap[b] || []).length;
    return countB - countA;
  });

  console.log('\nTop 10 Projects with most artifacts:');
  sortedProjects.slice(0, 10).forEach(proj => {
    const count = (artifactsMap[proj] || []).length;
    console.log(`- \x1b[36m${proj}\x1b[0m: ${count} artifacts`);
  });

  // Post all artifacts to Server API
  console.log('\nPosting artifacts to local CentralContext server...');
  for (const proj of projectsFound) {
    const files = artifactsMap[proj] || [];
    for (const file of files) {
      await postLogToServer(file, proj);
    }
  }
  console.log(`Successfully captured and stored ${postedCount} files in raw logs!`);

  // Build the reconstruction metrics table
  let tableMarkdown = '| Project | Artifact Count | Critical Files | Status Inferred | Key Decisions |\n';
  tableMarkdown += '| :--- | :---: | :--- | :--- | :--- |\n';
  
  sortedProjects.forEach(proj => {
    const files = artifactsMap[proj] || [];
    const criticalList = files.filter(f => ['plan', 'task', 'walkthrough', 'decisions', 'rules', 'state', 'central'].some(k => f.toLowerCase().includes(k))).map(f => path.basename(f));
    
    const count = files.length;
    if (count === 0) return; // Only show projects with artifacts

    const criticalText = criticalList.length > 0 ? criticalList.map(c => `\`${c}\``).join(', ') : 'None';
    
    // Infer status from artifacts
    let status = '💤 Dormant';
    if (proj === 'centalcontext') {
      status = '🟢 Active (MVP Setup)';
    } else if (files.some(f => f.toLowerCase().includes('task.md') || f.toLowerCase().includes('plan.md'))) {
      status = '🟡 In Development';
    } else if (files.length > 0) {
      status = '⚪ Idle / Setup';
    }

    // Inferred decisions
    let keyDecisions = 'None parsed';
    if (proj === 'centalcontext') {
      keyDecisions = 'ADR-001 (SQLite WAL Cache), ADR-002 (Auth key)';
    }

    tableMarkdown += `| **${proj}** | ${count} | ${criticalText} | ${status} | ${keyDecisions} |\n`;
  });

  // 1. PROJECT_SUMMARY_RECONSTRUCTED.md
  const projectSummaryContent = `# Project Summary (Project-Level Reconstructed)

## Workspace Overview
* **Active Workspace Parent**: \`/Users/tuoaoa/Tuoaoa/devflow\`
* **Total level-1 Projects Scanned**: ${projectsFound.length} projects
* **Total Context Artifacts Found**: ${postedCount} files

## Master Projects Curation & Diagnostics Matrix

${tableMarkdown}

## Top 10 Project Leaderboard
${sortedProjects.slice(0, 10).map((proj, idx) => `* **${idx + 1}. ${proj}**: ${(artifactsMap[proj] || []).length} artifacts`).join('\n')}

---
*Reconstructed from raw multi-project scan logs compiled at: ${new Date().toISOString()}*
`;

  // 2. CURRENT_STATE_RECONSTRUCTED.md
  // Look for CURRENT_STATE inside centalcontext project
  const centalFiles = artifactsMap['centalcontext'] || [];
  const statePath = centalFiles.find(f => f.includes('CURRENT_STATE.md'));
  let stateContent = '';
  if (statePath && fs.existsSync(statePath)) {
    stateContent = fs.readFileSync(statePath, 'utf8');
  } else {
    stateContent = '# Current State\n*No current state snapshot found.*';
  }

  const currentStateContent = `# CURRENT_STATE_RECONSTRUCTED (Context Curation)

${stateContent}

---
*Reconstructed from physical scanning on: ${new Date().toISOString()}*
`;

  // 3. DECISIONS_RECONSTRUCTED.md
  const decisionsPath = centalFiles.find(f => f.includes('DECISIONS.md'));
  let decisionsContent = '';
  if (decisionsPath && fs.existsSync(decisionsPath)) {
    decisionsContent = fs.readFileSync(decisionsPath, 'utf8');
  } else {
    decisionsContent = '# Decisions\n*No decisions snapshot found.*';
  }

  const decisionsReconstructedContent = `# DECISIONS_RECONSTRUCTED (Context Curation)

${decisionsContent}

---
*Reconstructed from physical scanning on: ${new Date().toISOString()}*
`;

  // Write reconstructed files to workspace root
  fs.writeFileSync(path.join(rootDir, 'PROJECT_SUMMARY_RECONSTRUCTED.md'), projectSummaryContent, 'utf8');
  fs.writeFileSync(path.join(rootDir, 'CURRENT_STATE_RECONSTRUCTED.md'), currentStateContent, 'utf8');
  fs.writeFileSync(path.join(rootDir, 'DECISIONS_RECONSTRUCTED.md'), decisionsReconstructedContent, 'utf8');

  console.log('\n✔ Successfully completed Project-Level Context Reconstruction!');
}

runScan();
