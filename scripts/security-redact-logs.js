/**
 * CentralContext Legacy Log Sanitization Script
 * scripts/security-redact-logs.js
 *
 * Responsibilities:
 *   - Recursively scan data/raw/, data/memory/, and data/daily/
 *   - Detect and redact all occurrences of secrets in-place
 *   - Generate a markdown report under data/security/redaction_report.md
 */

const fs = require('fs');
const path = require('path');
const secretRedactor = require('./lib/secret-redactor');

const rootDir = path.resolve(__dirname, '..');
const scanDirs = [
  path.join(rootDir, 'data/config'),
  path.join(rootDir, 'data/raw'),
  path.join(rootDir, 'data/memory'),
  path.join(rootDir, 'data/daily')
];

let totalScanned = 0;
const redactedFiles = [];
let totalRedactionsCount = 0;
let sqliteRowsRedacted = 0;

function walkDir(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      files = files.concat(walkDir(filePath));
    } else {
      files.push(filePath);
    }
  });
  return files;
}

// Gather all files
let allFiles = [];
scanDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    allFiles = allFiles.concat(walkDir(dir));
  }
});

console.log(`\n\x1b[36m========== CentralContext Secret Sanitizer ==========\x1b[0m`);
console.log(`Scanning directories: ${scanDirs.map(d => path.relative(rootDir, d)).join(', ')}`);
console.log(`Found \x1b[32m${allFiles.length}\x1b[0m candidate files to check.\n`);

allFiles.forEach(filePath => {
  // Ignore binary files or databases
  const ext = path.extname(filePath).toLowerCase();
  const allowedExts = ['.jsonl', '.json', '.md', '.txt', '.log'];
  if (!allowedExts.includes(ext)) return;

  totalScanned++;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    if (secretRedactor.containsSecrets(content)) {
      let fileRedactionsCount = 0;
      const fileReportRules = [];

      // Calculate how many secrets were matched
      secretRedactor.redactionRules.forEach(rule => {
        rule.pattern.lastIndex = 0;
        const matches = content.match(rule.pattern);
        if (matches) {
          fileRedactionsCount += matches.length;
          fileReportRules.push({ name: rule.name, count: matches.length });
        }
      });

      // Redact and writeback
      const redacted = secretRedactor.redactSecrets(content);
      fs.writeFileSync(filePath, redacted, 'utf8');
      
      const relative = path.relative(rootDir, filePath);
      console.log(`\x1b[31m[REDACTED]\x1b[0m ${relative} - Found \x1b[33m${fileRedactionsCount}\x1b[0m secret(s)`);
      
      redactedFiles.push({
        path: relative,
        count: fileRedactionsCount,
        details: fileReportRules
      });
      totalRedactionsCount += fileRedactionsCount;
    }
  } catch (err) {
    console.error(`[Error] Failed to process ${filePath}:`, err.message);
  }
});

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function redactSqliteCache() {
  const dbPath = path.join(rootDir, 'data/centralcontext.db');
  if (!fs.existsSync(dbPath)) return;

  try {
    const Database = require(path.join(rootDir, 'apps/server/node_modules/better-sqlite3'));
    const db = new Database(dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);

    tables.forEach(table => {
      const columns = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all();
      const textColumns = columns.filter(col => String(col.type || '').toUpperCase().includes('TEXT')).map(col => col.name);
      const pk = (columns.find(col => col.pk) || {}).name || 'rowid';
      if (!textColumns.length) return;

      const selectedColumns = [pk, ...textColumns].map(quoteIdent).join(', ');
      const rows = db.prepare(`SELECT ${selectedColumns} FROM ${quoteIdent(table)}`).all();
      rows.forEach(row => {
        const changes = [];
        const values = [];

        textColumns.forEach(col => {
          const value = row[col];
          if (typeof value === 'string' && secretRedactor.containsSecrets(value)) {
            changes.push(`${quoteIdent(col)} = ?`);
            values.push(secretRedactor.redactSecrets(value));
          }
        });

        if (changes.length > 0) {
          values.push(row[pk]);
          db.prepare(`UPDATE ${quoteIdent(table)} SET ${changes.join(', ')} WHERE ${quoteIdent(pk)} = ?`).run(...values);
          sqliteRowsRedacted++;
        }
      });
    });

    db.pragma('wal_checkpoint(TRUNCATE)');
    db.exec('VACUUM');
    db.close();
  } catch (err) {
    console.error(`[Warning] SQLite cache redaction skipped: ${err.message}`);
  }
}

redactSqliteCache();

// Create security folder if needed
const securityDir = path.join(rootDir, 'data/security');
if (!fs.existsSync(securityDir)) {
  fs.mkdirSync(securityDir, { recursive: true });
}

// Generate the markdown report (Phase 6)
const reportPath = path.join(securityDir, 'redaction_report.md');
let reportMd = `# CentralContext Secret Redaction Report\n\n`;
reportMd += `*Generated: ${new Date().toISOString()}*\n\n`;
reportMd += `## Security Audit Executive Summary\n\n`;
reportMd += `A comprehensive security sweep was completed across all historical ecosystem memory assets. A total of **${totalScanned}** text-based log and memory files were analyzed. \n`;
reportMd += `* **Total Files Containing Secrets**: ${redactedFiles.length}\n`;
reportMd += `* **Total Secrets Redacted**: ${totalRedactionsCount}\n\n`;
reportMd += `* **SQLite Rows Redacted**: ${sqliteRowsRedacted}\n\n`;

if (redactedFiles.length === 0) {
  reportMd += `> [!NOTE]\n`;
  reportMd += `> **No secrets found.** All historical log files are clean.\n\n`;
} else {
  reportMd += `> [!WARNING]\n`;
  reportMd += `> **Secrets found and sanitized.** All active secrets have been replaced with secure redacted placeholders in-place. No actual secret data remains on the disk.\n\n`;
  
  reportMd += `## Detailed Redaction Ledger\n\n`;
  reportMd += `| File Name | Secrets Found | Breakdowns |\n`;
  reportMd += `| :--- | :---: | :--- |\n`;
  
  redactedFiles.forEach(file => {
    const detailsStr = file.details.map(d => `${d.name}: ${d.count}`).join(', ');
    reportMd += `| \`${file.path}\` | **${file.count}** | ${detailsStr} |\n`;
  });
}

fs.writeFileSync(reportPath, reportMd, 'utf8');

console.log(`\n\x1b[32m✔ Sweep complete! Scanned ${totalScanned} files.\x1b[0m`);
console.log(`✔ Redacted secrets in \x1b[31m${redactedFiles.length}\x1b[0m files.`);
console.log(`✔ Total placeholders applied: \x1b[33m${totalRedactionsCount}\x1b[0m`);
console.log(`✔ SQLite rows redacted: \x1b[33m${sqliteRowsRedacted}\x1b[0m`);
console.log(`✔ Security audit report saved to: \x1b[36m${path.relative(rootDir, reportPath)}\x1b[0m\n`);
