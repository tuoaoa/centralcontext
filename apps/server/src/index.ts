import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// 1. Secret Configuration Loading
// Load .env relative to project root (e.g. 3 levels up from apps/server/src/)
const rootDir = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(rootDir, '.env') });

import { initDb, insertRawLog, getRawLogs, hasRawLogHash } from './db';
import { authenticateApiKey, apiRateLimiter } from './middleware/auth';


// 2. Initialize Express & DB
const app = express();
const port = process.env.PORT || 3000;
const dbPath = path.join(rootDir, process.env.DB_PATH || 'data/centralcontext.db');

initDb(dbPath);

app.use(cors());
app.use(express.json());

// Enable trust proxy for correct IP rate-limiting behind Nginx
app.set('trust proxy', 1);

// Static Dashboard serving (Task 7)
app.use(express.static(path.join(__dirname, '../public')));

// Helper for backup creation
function createBackup(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const timestamp = `${dateStr}-${timeStr}`;
  
  const backupDir = path.join(rootDir, 'data/backups', timestamp);
  const contextDir = path.join(rootDir, 'context');
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  if (fs.existsSync(contextDir)) {
    const files = fs.readdirSync(contextDir);
    files.forEach(file => {
      if (file.endsWith('.md')) {
        fs.copyFileSync(path.join(contextDir, file), path.join(backupDir, file));
      }
    });
  }
  
  console.log(`Safety context backup archived to: data/backups/${timestamp}`);
  return timestamp;
}

// 3. API Route Mapping

// GET /api/context - Get all context files
app.get('/api/context', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const contextDir = path.join(rootDir, 'context');
    const files = fs.readdirSync(contextDir);
    const filesMap: Record<string, string> = {};

    files.forEach(file => {
      if (file.endsWith('.md')) {
        filesMap[file] = fs.readFileSync(path.join(contextDir, file), 'utf8');
      }
    });

    res.json({ files: filesMap });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve central contexts.' });
  }
});

// GET /api/context/current - Get CURRENT_STATE.md
app.get('/api/context/current', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const filePath = path.join(rootDir, 'context/CURRENT_STATE.md');
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read CURRENT_STATE.md' });
  }
});

// GET /api/context/central - Get CENTRAL_CONTEXT.md
app.get('/api/context/central', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const filePath = path.join(rootDir, 'context/CENTRAL_CONTEXT.md');
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read CENTRAL_CONTEXT.md' });
  }
});

// GET /api/context/decisions - Get DECISIONS.md
app.get('/api/context/decisions', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const filePath = path.join(rootDir, 'context/DECISIONS.md');
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read DECISIONS.md' });
  }
});

// GET /api/context/pack - Get all context files compiled into a single text/plain Context Pack
app.get('/api/context/pack', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const filesToPack = [
      { name: 'SOURCE_PRIORITY.md', path: 'context/SOURCE_PRIORITY.md', limitLines: 0 },
      { name: 'CURRENT_STATE.md', path: 'context/CURRENT_STATE.md', limitLines: 0 },
      { name: 'DECISIONS.md', path: 'context/DECISIONS.md', limitLines: 0 },
      { name: 'CENTRAL_CONTEXT.md', path: 'context/CENTRAL_CONTEXT.md', limitLines: 0 },
      { name: 'ACTIVE_PROJECTS.md', path: 'context/ACTIVE_PROJECTS.md', limitLines: 0 },
      { name: 'FOUNDER_INTENT.md', path: 'context/FOUNDER_INTENT.md', limitLines: 0 },
      { name: 'AGENT_RULES.md', path: 'context/AGENT_RULES.md', limitLines: 0 },
      { name: 'WORK_LOG.md', path: 'context/WORK_LOG.md', limitLines: 30 },
      { name: 'OLD_STATE.md', path: 'context/OLD_STATE.md', limitLines: 0 },
      { name: 'ARCHIVE_STATE.md', path: 'context/ARCHIVE_STATE.md', limitLines: 0 }
    ];



    let output = '';
    output += '================================================================================\n';
    output += 'CENTRALCONTEXT AGENT CONTEXT PACK\n';
    output += `Generated: ${new Date().toISOString()}\n`;
    output += '================================================================================\n\n';

    filesToPack.forEach(fileSpec => {
      const filePath = path.join(rootDir, fileSpec.path);
      if (fs.existsSync(filePath)) {
        output += '================================================================================\n';
        output += `FILE: ${fileSpec.name}\n`;
        output += '================================================================================\n';
        
        let content = fs.readFileSync(filePath, 'utf8');
        if (fileSpec.limitLines > 0) {
          const lines = content.split('\n');
          if (lines.length > fileSpec.limitLines) {
            content = lines.slice(0, fileSpec.limitLines).join('\n') + `\n\n... [TRUNCATED ${lines.length - fileSpec.limitLines} MORE LINES FOR BREVITY] ...`;
          }
        }
        output += content.trim() + '\n\n';
      }
    });

    output += '================================================================================\n';
    output += 'END OF CONTEXT PACK\n';
    output += '================================================================================\n';

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(output);
  } catch (error) {
    res.status(500).json({ error: 'Failed to compile CentralContext Pack.' });
  }
});

// POST /api/context/update - Edit a specific context file
app.post('/api/context/update', authenticateApiKey, apiRateLimiter, (req, res) => {
  const { file, content } = req.body;

  if (!file || typeof content !== 'string') {
    res.status(400).json({ error: 'Invalid update payload. Must provide file and content.' });
    return;
  }

  // Prevent directory traversal attacks
  const safeFilename = path.basename(file);
  const allowedFiles = [
    'CENTRAL_CONTEXT.md',
    'CURRENT_STATE.md',
    'DECISIONS.md',
    'ACTIVE_PROJECTS.md',
    'DAILY_SUMMARY.md',
    'WORK_LOG.md'
  ];

  if (!allowedFiles.includes(safeFilename)) {
    res.status(400).json({ error: `File update not authorized for ${safeFilename}.` });
    return;
  }

  try {
    // Create safety backup before editing
    createBackup();

    const filePath = path.join(rootDir, 'context', safeFilename);
    fs.writeFileSync(filePath, content, 'utf8');

    res.json({ success: true, file: safeFilename });
  } catch (error) {
    res.status(500).json({ error: 'Failed to rewrite context file.' });
  }
});

// POST /api/log/raw - Append log to JSONL (First) and SQLite (Second)
app.post('/api/log/raw', authenticateApiKey, apiRateLimiter, (req, res) => {
  // Secret Redaction Firewall: Scan and redact req.body in-place before any parsing/writing
  const { scanObject } = require('../../../scripts/lib/secret-redactor');
  scanObject(req.body);

  const { source, project, type, content, quality_score, memory_priority, file_name, file_path, extension, content_hash } = req.body;

  if (!source || !type || typeof content !== 'string') {
    res.status(400).json({ error: 'Invalid payload: source, type, and content are required.' });
    return;
  }

  const timestamp = new Date().toISOString();

  // Deduplication Check using content_hash
  if (content_hash && hasRawLogHash(content_hash)) {
    console.log(`[CentralContext Server] Deduplicated duplicate message with hash: ${content_hash}`);
    res.json({ success: true, duplicated: true, timestamp });
    return;
  }

  const logEntry = {
    ...req.body,
    timestamp,
    source,
    project: project || null,
    type,
    content,
    quality_score: quality_score || 3,
    memory_priority: memory_priority || 'useful',
    file_name: file_name || null,
    file_path: file_path || null,
    extension: extension || null
  };

  try {
    // 1. JSONL SoT Append
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    
    const rawDir = path.join(rootDir, 'data/raw');
    if (!fs.existsSync(rawDir)) {
      fs.mkdirSync(rawDir, { recursive: true });
    }
    const jsonlPath = path.join(rawDir, `${dateStr}.jsonl`);
    fs.appendFileSync(jsonlPath, JSON.stringify(logEntry) + '\n', 'utf8');

    // 2. SQLite Cache insertion
    insertRawLog(logEntry);

    res.json({ success: true, timestamp });
  } catch (error) {
    console.error('Fatal raw logging error:', error);
    res.status(500).json({ error: 'Failed to write raw log.' });
  }
});

// GET /api/logs - Used by Web UI to fetch live dashboard raw logs feed
app.get('/api/logs', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const logs = getRawLogs(50);
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to query raw log cache.' });
  }
});

// GET /api/settings/ai-provider - Get sanitized AI provider configuration
app.get('/api/settings/ai-provider', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const { loadAIProviderConfig, getSanitizedAIProviderConfig } = require('../../../scripts/lib/ai-provider-config');
    const config = loadAIProviderConfig();
    const sanitized = getSanitizedAIProviderConfig(config);
    res.json(sanitized);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve AI provider settings: ' + error.message });
  }
});

// POST /api/settings/ai-provider - Save AI provider configuration
app.post('/api/settings/ai-provider', authenticateApiKey, apiRateLimiter, (req, res) => {
  const { provider, openrouter, confirm_over_1_usd, confirm_over_0_10_usd } = req.body;

  if (!provider) {
    res.status(400).json({ error: 'Provider is required.' });
    return;
  }

  const allowedProviders = ['local_heuristics', 'ollama', 'openrouter'];
  if (!allowedProviders.includes(provider)) {
    res.status(400).json({ error: `Unsupported provider: ${provider}` });
    return;
  }

  try {
    const { saveAIProviderConfig, getSanitizedAIProviderConfig } = require('../../../scripts/lib/ai-provider-config');
    
    // Sanity checks on costs
    if (openrouter) {
      const dailyCost = parseFloat(openrouter.max_daily_cost_usd);
      const runCost = parseFloat(openrouter.max_run_cost_usd);
      
      if (isNaN(dailyCost) || dailyCost < 0 || isNaN(runCost) || runCost < 0) {
        res.status(400).json({ error: 'Budget limits must be positive numeric values.' });
        return;
      }

      if (dailyCost > 1.0 && !confirm_over_1_usd) {
        res.status(400).json({ 
          error: 'Daily budget exceeds $1.00 USD. Please confirm this high daily spending limit.',
          requires_confirm_daily: true 
        });
        return;
      }

      if (runCost > 0.10 && !confirm_over_0_10_usd) {
        res.status(400).json({ 
          error: 'Max run budget exceeds $0.10 USD. Please confirm this high execution spending limit.',
          requires_confirm_run: true 
        });
        return;
      }
      
      if (openrouter.api_key && openrouter.api_key.trim().length > 0 && !openrouter.api_key.includes('****')) {
        // Validate OpenRouter key format minimally (should start with sk-or-)
        if (!openrouter.api_key.trim().startsWith('sk-or-')) {
          res.status(400).json({ error: 'Invalid API Key format. OpenRouter keys should start with sk-or-' });
          return;
        }
      }
    }

    const savedConfig = saveAIProviderConfig(req.body);
    const sanitized = getSanitizedAIProviderConfig(savedConfig);
    res.json({ success: true, config: sanitized });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save AI provider configuration: ' + error.message });
  }
});

// POST /api/settings/ai-provider/test - Dry test OpenRouter connection
app.post('/api/settings/ai-provider/test', authenticateApiKey, apiRateLimiter, async (req, res) => {
  const { provider, model, api_key } = req.body;

  if (provider !== 'openrouter') {
    res.json({ success: true, message: 'Provider is not OpenRouter. Skipping active test.' });
    return;
  }

  // Determine real API key to use
  let keyToUse = api_key || '';
  if (keyToUse.includes('****')) {
    const { loadAIProviderConfig } = require('../../../scripts/lib/ai-provider-config');
    const current = loadAIProviderConfig();
    keyToUse = current.openrouter.api_key;
  }

  if (!keyToUse || keyToUse.trim().length < 10) {
    res.status(400).json({ error: 'OpenRouter API Key is missing or invalid.' });
    return;
  }

  const modelToUse = model || 'qwen/qwen3.5-coder:free';
  const startTs = Date.now();

  try {
    const { estimateOpenRouterCost, assertBudgetAllowed } = require('../../../scripts/lib/ai-provider-config');
    
    const testPrompt = 'Return exactly: OK';
    const costEstimate = estimateOpenRouterCost(testPrompt, 'OK', modelToUse);
    
    // Check budget
    const todayStr = new Date().toISOString().split('T')[0];
    const budgetCheck = assertBudgetAllowed(todayStr, costEstimate.estimated_cost_usd);
    if (!budgetCheck.allowed) {
      res.status(400).json({ error: budgetCheck.error });
      return;
    }

    // Call OpenRouter API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keyToUse}`,
        'HTTP-Referer': 'https://github.com/tuoaoa/centralcontext',
        'X-Title': 'CentralContext AI Manager Test'
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: [{ role: 'user', content: testPrompt }],
        max_tokens: 5
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTs;

    if (!apiResponse.ok) {
      const text = await apiResponse.text();
      res.json({
        success: false,
        model: modelToUse,
        latency_ms: latency,
        error: `OpenRouter returned ${apiResponse.status}: ${text}`
      });
      return;
    }

    const data: any = await apiResponse.json();
    const outputText = data.choices?.[0]?.message?.content?.trim() || '';

    // Record to today usage ledger
    const usageFilePath = path.join(rootDir, `data/memory/budget/openrouter_usage_${todayStr}.json`);
    let budgetRecord = {
      date: todayStr,
      total_requests: 0,
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      models_used: {} as Record<string, number>,
      runs: [] as any[]
    };

    if (fs.existsSync(usageFilePath)) {
      try {
        budgetRecord = JSON.parse(fs.readFileSync(usageFilePath, 'utf8'));
      } catch (e) {}
    }

    budgetRecord.total_requests++;
    budgetRecord.estimated_cost_usd += costEstimate.estimated_cost_usd;
    budgetRecord.models_used[modelToUse] = (budgetRecord.models_used[modelToUse] || 0) + 1;
    
    // Add run report for this test connection run
    budgetRecord.runs.push({
      run_id: 'test_connection_' + startTs,
      timestamp: new Date().toISOString(),
      model: modelToUse,
      candidates_total: 0,
      candidates_evaluated: 1,
      estimated_cost_usd: costEstimate.estimated_cost_usd,
      actual_cost_usd: 0,
      status: 'completed'
    });

    fs.writeFileSync(usageFilePath, JSON.stringify(budgetRecord, null, 2), 'utf8');

    res.json({
      success: (outputText.toLowerCase().includes('ok') || outputText.length > 0),
      model: modelToUse,
      latency_ms: latency,
      estimated_cost: costEstimate.estimated_cost_usd,
      actual_cost: 0,
      response: outputText
    });
  } catch (error: any) {
    const latency = Date.now() - startTs;
    res.json({
      success: false,
      model: modelToUse,
      latency_ms: latency,
      error: `Connection test error: ${error.message}`
    });
  }
});

// GET /api/settings/ai-provider/usage - Fetch daily spend metrics
app.get('/api/settings/ai-provider/usage', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const { loadAIProviderConfig } = require('../../../scripts/lib/ai-provider-config');
    const config = loadAIProviderConfig();
    const maxDaily = config.openrouter.max_daily_cost_usd;

    const todayStr = new Date().toISOString().split('T')[0];
    const usageFilePath = path.join(rootDir, `data/memory/budget/openrouter_usage_${todayStr}.json`);

    let budgetRecord = {
      date: todayStr,
      total_requests: 0,
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      models_used: {} as Record<string, number>,
      runs: [] as any[]
    };

    if (fs.existsSync(usageFilePath)) {
      try {
        budgetRecord = JSON.parse(fs.readFileSync(usageFilePath, 'utf8'));
      } catch (e) {}
    }

    const remaining = Math.max(0, maxDaily - budgetRecord.estimated_cost_usd);

    res.json({
      total_requests: budgetRecord.total_requests,
      estimated_cost_usd: budgetRecord.estimated_cost_usd,
      actual_cost_usd: budgetRecord.actual_cost_usd,
      daily_limit: maxDaily,
      remaining_budget: remaining,
      last_runs: budgetRecord.runs ? budgetRecord.runs.slice(-5) : []
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to load usage ledger: ' + error.message });
  }
});

// POST /api/worklog - Append worklog to context/WORK_LOG.md
app.post('/api/worklog', authenticateApiKey, apiRateLimiter, (req, res) => {
  const { source, entry } = req.body;

  if (!source || !entry || typeof entry !== 'string') {
    res.status(400).json({ error: 'Invalid payload: source and entry description are required.' });
    return;
  }

  try {
    // Create safety backup
    createBackup();

    const filePath = path.join(rootDir, 'context/WORK_LOG.md');
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    
    let fileContent = '';
    if (fs.existsSync(filePath)) {
      fileContent = fs.readFileSync(filePath, 'utf8');
    } else {
      fileContent = '# Work Log\n\nA chronologically compiled list of work entries from developers and AI agents.\n';
    }

    const bullet = `* **${timeStr} (${source})**: ${entry}`;
    const dateHeader = `## ${dateStr}`;

    if (fileContent.includes(dateHeader)) {
      // Append bullet under today's date header
      const index = fileContent.indexOf(dateHeader);
      const endOfHeaderLine = fileContent.indexOf('\n', index);
      fileContent = fileContent.slice(0, endOfHeaderLine + 1) + bullet + '\n' + fileContent.slice(endOfHeaderLine + 1);
    } else {
      // Create new date header under top section and insert bullet
      const lines = fileContent.split('\n');
      let insertIndex = 3;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('# Work Log')) {
          insertIndex = i + 2;
          break;
        }
      }
      lines.splice(insertIndex, 0, '', dateHeader, bullet);
      fileContent = lines.join('\n');
    }

    fs.writeFileSync(filePath, fileContent, 'utf8');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to append entry to WORK_LOG.md.' });
  }
});

// 4. Sync push/pull endpoints (called on VPS)

// POST /api/sync/push - Update VPS context files with local payload
app.post('/api/sync/push', authenticateApiKey, apiRateLimiter, (req, res) => {
  const { files } = req.body;

  if (!files || typeof files !== 'object') {
    res.status(400).json({ error: 'Invalid synchronization package.' });
    return;
  }

  try {
    // 1. Back up current VPS context files before overwrite
    const backupId = createBackup();

    // 2. Write new context files
    const contextDir = path.join(rootDir, 'context');
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true });
    }

    const allowedFiles = [
      'CENTRAL_CONTEXT.md',
      'CURRENT_STATE.md',
      'DECISIONS.md',
      'ACTIVE_PROJECTS.md',
      'DAILY_SUMMARY.md',
      'WORK_LOG.md'
    ];

    Object.keys(files).forEach(file => {
      const safeFilename = path.basename(file);
      if (allowedFiles.includes(safeFilename)) {
        fs.writeFileSync(path.join(contextDir, safeFilename), files[file], 'utf8');
      }
    });

    res.json({ success: true, backup: backupId });
  } catch (error) {
    res.status(500).json({ error: 'VPS push synchronization failed.' });
  }
});

// GET /api/sync/pull - Pull VPS context files
app.get('/api/sync/pull', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const contextDir = path.join(rootDir, 'context');
    const filesMap: Record<string, string> = {};

    if (fs.existsSync(contextDir)) {
      const files = fs.readdirSync(contextDir);
      files.forEach(file => {
        if (file.endsWith('.md')) {
          filesMap[file] = fs.readFileSync(path.join(contextDir, file), 'utf8');
        }
      });
    }

    // Return the remote context files contents and the current timestamp for conflict checks
    res.json({ files: filesMap, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: 'VPS pull synchronization failed.' });
  }
});

// Start Express Server
app.listen(port, () => {
  console.log(`\x1b[32mCentralContext Server successfully listening on http://localhost:${port}\x1b[0m`);
  console.log(`Server security active. API authorization required.`);
});
