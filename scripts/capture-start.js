const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

console.log('\x1b[36m========== CentralContext Capture Layer supervisor ==========\x1b[0m');
console.log('Spawning daemons...');

// 1. Spawn File Watcher
const fileWatcher = spawn('npm', ['run', 'capture:files'], {
  cwd: path.join(rootDir, 'apps/cli'),
  stdio: 'inherit',
  shell: true
});

// 2. Spawn Clipboard Watcher
const clipboardWatcher = spawn('npm', ['run', 'capture:clipboard'], {
  cwd: path.join(rootDir, 'apps/cli'),
  stdio: 'inherit',
  shell: true
});

// 3. Spawn VSCode Cline Watcher
const clineWatcher = spawn('npm', ['run', 'capture:cline'], {
  cwd: path.join(rootDir, 'apps/cli'),
  stdio: 'inherit',
  shell: true
});

// 4. Spawn Codex Watcher
const codexWatcher = spawn('npm', ['run', 'capture:codex'], {
  cwd: path.join(rootDir, 'apps/cli'),
  stdio: 'inherit',
  shell: true
});

// Handle graceful exit and propagate SIGINT to child processes
process.on('SIGINT', () => {
  console.log('\n\x1b[31m[Supervisor] Shutting down capture daemons...\x1b[0m');
  
  try {
    fileWatcher.kill('SIGINT');
  } catch (e) {}
  
  try {
    clipboardWatcher.kill('SIGINT');
  } catch (e) {}

  try {
    clineWatcher.kill('SIGINT');
  } catch (e) {}

  try {
    codexWatcher.kill('SIGINT');
  } catch (e) {}

  setTimeout(() => {
    process.exit(0);
  }, 500);
});

fileWatcher.on('exit', (code) => {
  console.log(`\x1b[33m[Watcher Process] Exited with code ${code}\x1b[0m`);
});

clipboardWatcher.on('exit', (code) => {
  console.log(`\x1b[33m[Clipboard Process] Exited with code ${code}\x1b[0m`);
});

clineWatcher.on('exit', (code) => {
  console.log(`\x1b[33m[Cline Watcher Process] Exited with code ${code}\x1b[0m`);
});

codexWatcher.on('exit', (code) => {
  console.log(`\x1b[33m[Codex Watcher Process] Exited with code ${code}\x1b[0m`);
});
