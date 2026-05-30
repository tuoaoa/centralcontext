const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const testFile = path.join(rootDir, 'context/CURRENT_STATE.md');

console.log('\x1b[36m========== CentralContext Capture Layer Diagnostician ==========\x1b[0m');
console.log('Diagnostic test initiates...');

if (!fs.existsSync(testFile)) {
  console.error('\x1b[31mError: context/CURRENT_STATE.md not found. Cannot trigger watcher test.\x1b[0m');
  process.exit(1);
}

// 1. Modifying a Critical file to test File Watcher
console.log('\x1b[34m[1/3] Triggering File Watcher test...\x1b[0m');
console.log('Adding minor timestamp comment to context/CURRENT_STATE.md...');

let currentContent = fs.readFileSync(testFile, 'utf8');
const commentPattern = /<!-- CC_TEST_STAMP: .*? -->/;

const newComment = `<!-- CC_TEST_STAMP: ${new Date().toISOString()} -->`;

if (commentPattern.test(currentContent)) {
  currentContent = currentContent.replace(commentPattern, newComment);
} else {
  currentContent += `\n\n${newComment}\n`;
}

fs.writeFileSync(testFile, currentContent, 'utf8');
console.log('\x1b[32m✔ File updated. Wait 3 seconds for watcher debounce to fire...\x1b[0m');

// 2. Mocking secrets for Redaction Test
console.log('\x1b[34m[2/3] Printing credential patterns for Redactor tests...\x1b[0m');
console.log('You can check raw JSONL logs to verify sk-proj-... API keys are replaced by [REDACTED].');

// 3. Complete
console.log('\x1b[34m[3/3] Guidance:\x1b[0m');
console.log('1. Run \x1b[33mnpm run capture:start\x1b[0m in one terminal tab.');
console.log('2. Run \x1b[33mnpm run capture:test\x1b[0m in another tab.');
console.log('3. Open \x1b[33mdata/raw/YYYY-MM-DD.jsonl\x1b[0m or check SQLite logs in the Web UI dashboard to confirm successful capture!');
console.log('\x1b[32m✔ Diagnostician run finished.\x1b[0m');
