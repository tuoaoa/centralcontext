const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const directories = [
  'context',
  'data',
  'data/raw',
  'data/daily',
  'data/memory',
  'data/backups',
  'apps',
  'apps/server',
  'apps/server/src',
  'apps/server/src/middleware',
  'apps/server/public',
  'apps/cli',
  'apps/cli/src',
  'scripts'
];

console.log('Initializing directory structure...');

directories.forEach(dir => {
  const dirPath = path.join(rootDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`\x1b[32mCreated directory:\x1b[0m ${dir}`);
  } else {
    console.log(`\x1b[90mDirectory already exists:\x1b[0m ${dir}`);
  }
});

console.log('Directory initialization complete!');
