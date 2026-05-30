const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const apiKey = process.env.CENTRAL_CONTEXT_API_KEY || '2578420fb040d51884e5c656b4bae6b2a2f594867749f24cefcaf01a95b683b3';
const localApiUrl = 'http://localhost:3000/api/log/raw';

const artifactDir = '/Users/tuoaoa/.gemini/antigravity/brain/8e9702d2-f7bf-4048-8d44-455b42457382';

const filesToRestore = [
  // Workspace Context Files
  { path: path.join(rootDir, 'context/CENTRAL_CONTEXT.md'), name: 'CENTRAL_CONTEXT.md' },
  { path: path.join(rootDir, 'context/CURRENT_STATE.md'), name: 'CURRENT_STATE.md' },
  { path: path.join(rootDir, 'context/DECISIONS.md'), name: 'DECISIONS.md' },
  { path: path.join(rootDir, 'context/MEMORY_RULES.md'), name: 'MEMORY_RULES.md' },
  { path: path.join(rootDir, 'README.md'), name: 'README.md' },
  { path: path.join(rootDir, 'AGENT_README.md'), name: 'AGENT_README.md' },
  
  // Antigravity Artifacts (The "Gold" sources of intelligence)
  { path: path.join(artifactDir, 'implementation_plan.md'), name: 'implementation_plan.md' },
  { path: path.join(artifactDir, 'task.md'), name: 'task.md' },
  { path: path.join(artifactDir, 'walkthrough.md'), name: 'walkthrough.md' }
];

async function restoreFiles() {
  console.log('Restoring critical workspace context files and artifacts into raw logs...');
  
  for (const item of filesToRestore) {
    if (!fs.existsSync(item.path)) {
      console.warn(`[Warning] File not found: ${item.path}`);
      continue;
    }

    const content = fs.readFileSync(item.path, 'utf8');
    const ext = path.extname(item.path);
    
    const payload = {
      source: 'file_watcher',
      type: 'critical_doc_snapshot',
      project: 'CentralContext',
      file_path: item.path,
      file_name: item.name,
      extension: ext,
      quality_score: 5,
      memory_priority: 'critical',
      content: `[Event: RESTORE] File: ${item.name}\n\n${content}`
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
        console.log(`\x1b[32m✔ Restored & Scored Score 5:\x1b[0m ${item.name}`);
      } else {
        console.error(`[Error] API failed for ${item.name}: ${response.status}`);
      }
    } catch (err) {
      console.error(`[Error] Failed to post ${item.name}:`, err.message || err);
    }
  }
  
  console.log('Restoration completed!');
}

restoreFiles();
