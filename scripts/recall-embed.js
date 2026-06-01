#!/usr/bin/env node

const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dotenv = require(path.join(rootDir, 'apps/server/node_modules/dotenv'));
dotenv.config({ path: path.join(rootDir, '.env') });

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' });
require(path.join(rootDir, 'apps/server/node_modules/ts-node/register/transpile-only'));

const { initDb, getRecallIndexStats } = require('../apps/server/src/db');
const { buildRecallEmbeddings } = require('../apps/server/src/recall-embeddings');

async function main() {
  const dbPath = path.join(rootDir, process.env.DB_PATH || 'data/centralcontext.db');
  initDb(dbPath);

  const result = await buildRecallEmbeddings();
  const stats = getRecallIndexStats();

  console.log(JSON.stringify({
    success: result.status === 'completed',
    result,
    stats
  }, null, 2));

  if (result.status !== 'completed') {
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
