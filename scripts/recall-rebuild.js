#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function run(script) {
  const result = spawnSync(process.execPath, [path.join(rootDir, 'scripts', script)], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run('recall-index.js');
run('recall-embed.js');
