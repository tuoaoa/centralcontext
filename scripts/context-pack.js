const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const filesToPack = [
  { name: 'SOURCE_PRIORITY.md', path: 'context/SOURCE_PRIORITY.md', limitLines: 0 },
  { name: 'CURRENT_STATE.md', path: 'context/CURRENT_STATE.md', limitLines: 0 },
  { name: 'DECISIONS.md', path: 'context/DECISIONS.md', limitLines: 0 },
  { name: 'CENTRAL_CONTEXT.md', path: 'context/CENTRAL_CONTEXT.md', limitLines: 0 },
  { name: 'ACTIVE_PROJECTS.md', path: 'context/ACTIVE_PROJECTS.md', limitLines: 0 },
  { name: 'FOUNDER_INTENT.md', path: 'context/FOUNDER_INTENT.md', limitLines: 0 },
  { name: 'AGENT_RULES.md', path: 'context/AGENT_RULES.md', limitLines: 0 },
  { name: 'WORK_LOG.md', path: 'context/WORK_LOG.md', limitLines: 30 }, // keep concise
  { name: 'OLD_STATE.md', path: 'context/OLD_STATE.md', limitLines: 0 },
  { name: 'ARCHIVE_STATE.md', path: 'context/ARCHIVE_STATE.md', limitLines: 0 }
];



console.log('================================================================================');
console.log('CENTRALCONTEXT AGENT CONTEXT PACK');
console.log(`Generated: ${new Date().toISOString()}`);
console.log('================================================================================\n');

filesToPack.forEach(fileSpec => {
  const filePath = path.join(rootDir, fileSpec.path);
  if (!fs.existsSync(filePath)) {
    console.log(`[File Not Found: ${fileSpec.name}]\n`);
    return;
  }

  console.log('================================================================================');
  console.log(`FILE: ${fileSpec.name}`);
  console.log('================================================================================');

  let content = fs.readFileSync(filePath, 'utf8');
  
  if (fileSpec.limitLines > 0) {
    const lines = content.split('\n');
    if (lines.length > fileSpec.limitLines) {
      content = lines.slice(0, fileSpec.limitLines).join('\n') + `\n\n... [TRUNCATED ${lines.length - fileSpec.limitLines} MORE LINES FOR BREVITY] ...`;
    }
  }

  console.log(content.trim());
  console.log('\n');
});

console.log('================================================================================');
console.log('END OF CONTEXT PACK');
console.log('================================================================================');
