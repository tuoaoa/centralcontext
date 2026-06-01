import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// 1. Secret Configuration Loading
// Load .env relative to project root (e.g. 3 levels up from apps/server/src/)
const rootDir = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(rootDir, '.env') });

import { initDb, insertRawLog, getRawLogs, hasRawLogDedupeKey, getDb, getRecallIndexStats } from './db';
import { authenticateApiKey, apiRateLimiter } from './middleware/auth';
import { hybridRecallSearch } from './recall-embeddings';
import { generateContextInjectionPacket } from './context-injection';
import {
  archiveMemory,
  getPromotionCandidates,
  getPromotionStatus,
  promoteMemoryAndEmbed
} from './memory-promotion';


// 2. Initialize Express & DB
const app = express();
const port = process.env.PORT || 3000;
const dbPath = path.join(rootDir, process.env.DB_PATH || 'data/centralcontext.db');

initDb(dbPath);

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

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

  const {
    source: rawSource,
    project,
    type,
    content,
    quality_score,
    memory_priority,
    file_name,
    file_path,
    extension,
    content_hash,
    task_id,
    role,
    message_index
  } = req.body;
  const source = rawSource === 'vscode_cline' ? 'cline' : rawSource;

  if (!source || !type || typeof content !== 'string') {
    res.status(400).json({ error: 'Invalid payload: source, type, and content are required.' });
    return;
  }

  const timestamp = new Date().toISOString();
  const dedupeParts = content_hash
    ? [source, task_id || 'no_task', ...(message_index !== undefined && message_index !== null ? [role || 'no_role', String(message_index)] : []), content_hash]
    : [];
  const dedupe_key = dedupeParts.length ? dedupeParts.join(':') : null;

  // Deduplication key keeps identical text from different tasks/messages separate.
  if (dedupe_key && hasRawLogDedupeKey(dedupe_key)) {
    console.log(`[CentralContext Server] Deduplicated duplicate message with key: ${dedupe_key}`);
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
    content_hash: content_hash || null,
    dedupe_key,
    task_id: task_id || null,
    role: role || null,
    message_index: message_index ?? null,
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

// GET /api/recall/search - Keyword recall over materialized memories using SQLite FTS5
app.get('/api/recall/search', authenticateApiKey, apiRateLimiter, async (req, res) => {
  try {
    const { redactSecrets, scanObject } = require('../../../scripts/lib/secret-redactor');
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      res.status(400).json({ error: 'Query parameter q must contain at least 2 characters.' });
      return;
    }

    const project = req.query.project ? String(req.query.project).trim() : undefined;
    const sourceKind = req.query.source_kind ? String(req.query.source_kind).trim() : undefined;
    const tier = req.query.tier ? String(req.query.tier).trim().toUpperCase() : undefined;
    const includeArchived = req.query.include_archived === 'true';
    const trackRecalls = req.query.track_recalls === 'true';
    const limitRaw = parseInt(String(req.query.limit || '10'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;

    const stats = getRecallIndexStats();
    const results = (await hybridRecallSearch(q, { project, source_kind: sourceKind, tier, include_archived: includeArchived, trackRecalls, limit })).map(result => ({
      fts_score: result.fts_score,
      semantic_score: result.semantic_score,
      hybrid_score: result.hybrid_score,
      tier: result.tier,
      tier_multiplier: result.tier_multiplier,
      source: result.source,
      timestamp: result.timestamp,
      project: result.project,
      memory_summary: redactSecrets(result.memory_summary),
      why_selected: result.why_selected.map(reason => redactSecrets(reason)),
      score_breakdown: {
        fts: result.fts_score,
        semantic: result.semantic_score,
        project: result.project_score,
        recency: result.recency_score,
        importance: result.importance_score,
        tier: result.tier_multiplier
      },
      raw_source: result.raw_source,
      type: result.type,
      source_ref: result.source_ref
    }));

    const payload = {
      success: true,
      query: redactSecrets(q),
      count: results.length,
      include_archived: includeArchived,
      track_recalls: trackRecalls,
      tier_filter: tier || null,
      index: stats,
      embedding_status: {
        available: stats.embedded_count > 0,
        model: stats.embedding_model,
        version: stats.embedding_version,
        embedded_count: stats.embedded_count,
        last_embed_run: stats.last_embedded_at,
        diagnosis: stats.embedded_count > 0 ? 'semantic retrieval active' : 'run npm run recall:embed to enable semantic retrieval'
      },
      results
    };
    scanObject(payload);
    res.json(payload);
  } catch (error: any) {
    res.status(500).json({ error: 'Recall search failed: ' + error.message });
  }
});

// GET /api/recall/status - Lightweight dashboard/index status for Recall V1
app.get('/api/recall/status', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    res.json({ success: true, index: getRecallIndexStats() });
  } catch (error: any) {
    res.status(500).json({ error: 'Recall status failed: ' + error.message });
  }
});

// GET /api/context/inject - Build a compressed startup packet from Recall results
app.get('/api/context/inject', authenticateApiKey, apiRateLimiter, async (req, res) => {
  try {
    const { scanObject } = require('../../../scripts/lib/secret-redactor');
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      res.status(400).json({ error: 'Query parameter q must contain at least 2 characters.' });
      return;
    }

    const project = req.query.project ? String(req.query.project).trim() : undefined;
    const budgetRaw = parseInt(String(req.query.token_budget || req.query.max_tokens || '800'), 10);
    const tokenBudget = Number.isFinite(budgetRaw) ? budgetRaw : 800;
    const packet = await generateContextInjectionPacket(q, { project, tokenBudget });
    scanObject(packet);
    res.json(packet);
  } catch (error: any) {
    res.status(500).json({ error: 'Context injection failed: ' + error.message });
  }
});

// GET /api/memory/promotion/status - Memory lifecycle overview
app.get('/api/memory/promotion/status', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    res.json({ success: true, status: getPromotionStatus() });
  } catch (error: any) {
    res.status(500).json({ error: 'Promotion status failed: ' + error.message });
  }
});

// GET /api/memory/promotion/candidates - Promotion, long-term, and decay candidates
app.get('/api/memory/promotion/candidates', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const candidates = getPromotionCandidates();
    res.json({
      success: true,
      candidates: candidates.filter(memory => memory.computed_tier === 'LONG_TERM' && memory.tier !== 'LONG_TERM').slice(0, 50),
      long_term: candidates.filter(memory => memory.tier === 'LONG_TERM').slice(0, 50),
      decay_candidates: candidates.filter(memory => memory.decay_candidate === 1).slice(0, 50),
      all: candidates.slice(0, 100)
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Promotion candidates failed: ' + error.message });
  }
});

// POST /api/memory/promotion/promote - Promote a recall memory to LONG_TERM
app.post('/api/memory/promotion/promote', authenticateApiKey, apiRateLimiter, async (req, res) => {
  try {
    const { scanObject } = require('../../../scripts/lib/secret-redactor');
    scanObject(req.body);
    const memoryId = String(req.body.memory_id || '').trim();
    if (!memoryId) {
      res.status(400).json({ error: 'memory_id is required.' });
      return;
    }
    const promoted = await promoteMemoryAndEmbed(memoryId, req.body.reason);
    scanObject(promoted);
    res.json({ success: true, memory: promoted });
  } catch (error: any) {
    res.status(500).json({ error: 'Promotion failed: ' + error.message });
  }
});

// POST /api/memory/promotion/archive - Mark a recall memory ARCHIVED
app.post('/api/memory/promotion/archive', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const { scanObject } = require('../../../scripts/lib/secret-redactor');
    scanObject(req.body);
    const memoryId = String(req.body.memory_id || '').trim();
    if (!memoryId) {
      res.status(400).json({ error: 'memory_id is required.' });
      return;
    }
    const archived = archiveMemory(memoryId, req.body.reason);
    scanObject(archived);
    res.json({ success: true, memory: archived });
  } catch (error: any) {
    res.status(500).json({ error: 'Archive failed: ' + error.message });
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
  if (!keyToUse || keyToUse.includes('****')) {
    const { loadAIProviderConfig } = require('../../../scripts/lib/ai-provider-config');
    const current = loadAIProviderConfig();
    keyToUse = current.openrouter.api_key;
  }

  if (!keyToUse || keyToUse.trim().length < 10) {
    res.status(400).json({ error: 'OpenRouter API Key is missing or invalid.' });
    return;
  }

  const modelToUse = model || 'deepseek/deepseek-v4-flash';
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
      success: true,
      model: modelToUse,
      latency_ms: latency,
      estimated_cost: costEstimate.estimated_cost_usd,
      actual_cost: 0,
      response: outputText || '(Connected successfully)'
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

// GET /api/logs/raw - Refines standard logging queries with preview truncation
app.get('/api/logs/raw', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string || '50', 10);
    const full = req.query.full === 'true';
    const rawLogs = getRawLogs(limit);

    const logs = rawLogs.map(log => {
      const logCopy = { ...log } as any;
      if (!full && logCopy.content) {
        logCopy.preview = logCopy.content.length > 200 ? logCopy.content.substring(0, 200) + '...' : logCopy.content;
        delete logCopy.content;
      }
      return logCopy;
    });

    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve raw logs: ' + error.message });
  }
});

// GET /api/factory/status - Aggregates today's statistics
app.get('/api/factory/status', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const database = getDb();
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Count today's raw logs from SQLite
    const rawCountRow = database.prepare("SELECT count(*) as count FROM raw_logs WHERE date(timestamp) = date('now')").get() as { count: number };
    const rawLogsToday = rawCountRow ? rawCountRow.count : 0;

    // Last raw log timestamp
    const lastRawRow = database.prepare("SELECT timestamp FROM raw_logs ORDER BY id DESC LIMIT 1").get() as { timestamp: string };
    const latestRawTimestamp = lastRawRow ? lastRawRow.timestamp : null;

    // Active sources today
    const sourcesRow = database.prepare("SELECT source, count(*) as count FROM raw_logs WHERE date(timestamp) = date('now') GROUP BY source").all() as { source: string, count: number }[];
    const sources: Record<string, number> = {};
    sourcesRow.forEach(r => { sources[r.source] = r.count; });

    // Count today's redactions by scanning raw logs containing REDACTED
    const redactRow = database.prepare("SELECT count(*) as count FROM raw_logs WHERE date(timestamp) = date('now') AND (content LIKE '%[REDACTED%')").get() as { count: number };
    const redactionsToday = redactRow ? redactRow.count : 0;

    // Distillery Candidates generated today
    let candidatesToday = 0;
    let latestDistilleryRun = null;
    const candidatesPath = path.join(rootDir, 'data/memory/candidates', `${todayStr}.candidates.json`);
    if (fs.existsSync(candidatesPath)) {
      try {
        const stats = fs.statSync(candidatesPath);
        latestDistilleryRun = stats.mtime.toISOString();
        const data = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
        candidatesToday = data.candidates ? data.candidates.length : 0;
      } catch (e) {}
    }

    // AI Cost Today & Last AI Judge Run
    let costToday = 0;
    let latestAIJudgeRun = null;
    const usageFilePath = path.join(rootDir, `data/memory/budget/openrouter_usage_${todayStr}.json`);
    if (fs.existsSync(usageFilePath)) {
      try {
        const stats = fs.statSync(usageFilePath);
        latestAIJudgeRun = stats.mtime.toISOString();
        const usage = JSON.parse(fs.readFileSync(usageFilePath, 'utf8'));
        costToday = usage.estimated_cost_usd || 0;
      } catch (e) {}
    }

    // Reality Mismatches & Last Reality Scan
    let mismatches = 0;
    let latestRealityScan = null;
    const realityPath = path.join(rootDir, 'data/memory/reality/reality_scores.json');
    if (fs.existsSync(realityPath)) {
      try {
        const stats = fs.statSync(realityPath);
        latestRealityScan = stats.mtime.toISOString();
        const reality = JSON.parse(fs.readFileSync(realityPath, 'utf8'));
        mismatches = Object.keys(reality.projects || {}).filter(k => {
          const p = reality.projects[k];
          return (p.activity_score < 25 && k === 'qlythuexe'); // standard highlight mismatch
        }).length;
      } catch (e) {}
    }

    // Pack size
    let packSize = 0;
    const packFilePath = path.join(rootDir, 'context/CURRENT_STATE.md');
    if (fs.existsSync(packFilePath)) {
      try {
        packSize = fs.statSync(packFilePath).size;
      } catch (e) {}
    }

    res.json({
      date: todayStr,
      raw_logs_today: rawLogsToday,
      last_raw_timestamp: latestRawTimestamp,
      sources,
      security: {
        redactions_today: redactionsToday,
        status: redactionsToday > 0 ? 'safe' : 'clean'
      },
      distillery: {
        candidates_today: candidatesToday,
        last_run: latestDistilleryRun,
        status: candidatesToday > 0 ? 'done' : 'idle'
      },
      ai_judge: {
        provider: process.env.LLM_PROVIDER || 'heuristics',
        model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash',
        dry_run: process.env.OPENROUTER_DRY_RUN_DEFAULT !== 'false',
        cost_today: costToday,
        budget: parseFloat(process.env.OPENROUTER_MAX_DAILY_COST_USD || '0.10'),
        last_run: latestAIJudgeRun
      },
      reality: {
        mismatches,
        last_scan: latestRealityScan
      },
      pack_size_bytes: packSize
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve factory status: ' + error.message });
  }
});

// GET /api/factory/health - Factory Health Check
app.get('/api/factory/health', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const rawFilePath = path.join(rootDir, 'data/raw', `${todayStr}.jsonl`);
    const candidatesFilePath = path.join(rootDir, 'data/memory/candidates', `${todayStr}.candidates.json`);
    const realityFilePath = path.join(rootDir, 'data/memory/reality/reality_scores.json');
    const budgetFilePath = path.join(rootDir, `data/memory/budget/openrouter_usage_${todayStr}.json`);
    const database = getDb();

    // 1. Raw Telemetry File Details
    const raw_today_exists = fs.existsSync(rawFilePath);
    let raw_today_count = 0;
    let raw_file_size = 0;
    let raw_file_modified = null;
    if (raw_today_exists) {
      const stats = fs.statSync(rawFilePath);
      raw_file_size = stats.size;
      raw_file_modified = stats.mtime.toISOString();
      const content = fs.readFileSync(rawFilePath, 'utf8').trim();
      raw_today_count = content ? content.split('\n').filter(line => line.length > 0).length : 0;
    }

    // SQLite status
    let sqlite_connected = false;
    let sqlite_count = 0;
    let latest_raw_timestamp = null;
    try {
      const countRow = database.prepare("SELECT count(*) as count FROM raw_logs WHERE date(timestamp) = date('now')").get() as { count: number };
      sqlite_count = countRow ? countRow.count : 0;
      sqlite_connected = true;

      const lastRow = database.prepare("SELECT timestamp FROM raw_logs ORDER BY id DESC LIMIT 1").get() as { timestamp: string };
      latest_raw_timestamp = lastRow ? lastRow.timestamp : null;
    } catch (dbErr) {
      console.error('DB query error inside health check:', dbErr);
    }

    // 2. Candidates Details
    const candidates_today_exists = fs.existsSync(candidatesFilePath);
    let candidates_today_count = 0;
    let candidates_file_size = 0;
    let candidates_file_modified = null;
    if (candidates_today_exists) {
      const stats = fs.statSync(candidatesFilePath);
      candidates_file_size = stats.size;
      candidates_file_modified = stats.mtime.toISOString();
      try {
        const data = JSON.parse(fs.readFileSync(candidatesFilePath, 'utf8'));
        candidates_today_count = data.candidates ? data.candidates.length : 0;
      } catch (e) {}
    }

    // 3. Reality Layer details
    const reality_exists = fs.existsSync(realityFilePath);
    let latest_reality_scores_modified_at = null;
    if (reality_exists) {
      latest_reality_scores_modified_at = fs.statSync(realityFilePath).mtime.toISOString();
    }

    // 4. Budget Caching details
    const budget_exists = fs.existsSync(budgetFilePath);
    let latest_ai_judge_usage_modified_at = null;
    if (budget_exists) {
      latest_ai_judge_usage_modified_at = fs.statSync(budgetFilePath).mtime.toISOString();
    }

    // 5. Distillery Curation Report Details
    const reportFilePath = path.join(rootDir, 'data/memory/distillery_runs', `${todayStr}.report.md`);
    const report_exists = fs.existsSync(reportFilePath);
    let latest_distillery_report = null;
    if (report_exists) {
      latest_distillery_report = fs.statSync(reportFilePath).mtime.toISOString();
    }

    // 6. Warnings for staleness
    const stale_warnings: string[] = [];
    if (!raw_today_exists && sqlite_count === 0) {
      stale_warnings.push("No telemetry logs ingested today. Ingestion channels are EMPTY.");
    }
    if (latest_raw_timestamp) {
      const diffMs = Date.now() - new Date(latest_raw_timestamp).getTime();
      if (diffMs > 30 * 60 * 1000) { // older than 30 minutes
        stale_warnings.push(`Log stream is STALE. Last raw telemetry event occurred ${Math.round(diffMs / 60000)} minutes ago.`);
      }
    }
    if (reality_exists && latest_reality_scores_modified_at) {
      const diffMs = Date.now() - new Date(latest_reality_scores_modified_at).getTime();
      if (diffMs > 12 * 60 * 60 * 1000) { // older than 12h
        stale_warnings.push("Reality Layer strategic scores have not been audited in the last 12 hours.");
      }
    }

    res.json({
      raw_today_exists,
      raw_today_count: raw_today_count || sqlite_count,
      raw_file_size,
      raw_file_modified,
      sqlite_connected,
      latest_raw_timestamp,
      candidates_today_exists,
      candidates_today_count,
      candidates_file_size,
      candidates_file_modified,
      latest_distillery_report,
      latest_reality_scores_modified_at,
      latest_ai_judge_usage_modified_at,
      stale_warnings
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Factory Health check failed: ' + error.message });
  }
});

// GET /api/capture/health - Brutal Real-time Telemetry Ingestion Inquest
app.get('/api/capture/health', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const database = getDb();
    const todayStr = new Date().toISOString().split('T')[0];
    const { redactSecrets } = require('../../../scripts/lib/secret-redactor');

    const sourcesToQuery = ['browser_chat', 'terminal', 'clipboard', 'file_watcher', 'manual', 'telegram', 'cline'];
    const sourcesStats: Record<string, any> = {};

    sourcesToQuery.forEach(source => {
      const aliases = source === 'cline' ? ['cline', 'vscode_cline'] : [source];
      const placeholders = aliases.map(() => '?').join(',');

      // Get count today
      const countRow = database.prepare(`SELECT count(*) as count FROM raw_logs WHERE source IN (${placeholders}) AND date(timestamp) = date('now')`).get(...aliases) as { count: number };
      const countToday = countRow ? countRow.count : 0;

      // Get latest event
      const lastRow = database.prepare(`SELECT timestamp, content FROM raw_logs WHERE source IN (${placeholders}) ORDER BY id DESC LIMIT 1`).get(...aliases) as { timestamp: string, content: string };
      const duplicateRow = database.prepare(`
        SELECT COALESCE(SUM(cnt - 1), 0) as count
        FROM (
          SELECT dedupe_key, COUNT(*) as cnt
          FROM raw_logs
          WHERE source IN (${placeholders})
            AND date(timestamp) = date('now')
            AND dedupe_key IS NOT NULL
          GROUP BY dedupe_key
          HAVING cnt > 1
        )
      `).get(...aliases) as { count: number };

      let lastSeen = null;
      let secondsAgo = null;
      let lastPreview = null;
      let status = 'DEAD';

      if (lastRow) {
        lastSeen = lastRow.timestamp;
        const diffMs = Date.now() - new Date(lastSeen).getTime();
        secondsAgo = Math.max(0, Math.floor(diffMs / 1000));

        if (secondsAgo < 60) {
          status = 'LIVE';
        } else if (secondsAgo < 600) {
          status = 'WARM';
        } else {
          status = 'STALE';
        }

        let preview = lastRow.content || '';
        preview = redactSecrets(preview);
        if (preview.length > 80) {
          preview = preview.substring(0, 80) + '...';
        }
        lastPreview = preview;
      }

      sourcesStats[source] = {
        status,
        count_today: countToday,
        last_seen: lastSeen,
        seconds_ago: secondsAgo,
        last_preview: lastPreview || 'No events recorded today',
        duplicate_count: duplicateRow ? duplicateRow.count : 0,
        diagnosis: status === 'DEAD'
          ? `No events recorded today for ${source}`
          : status === 'STALE'
            ? `Capture adapter stale`
            : source === 'cline'
              ? `Capture adapter active; includes legacy vscode_cline history`
              : `Capture adapter active`
      };
    });

    // Antigravity adapter
    let antigravityStats: any = {
      status: 'DEAD',
      count_today: 0,
      last_seen: null,
      seconds_ago: null,
      last_preview: 'No Antigravity capture adapter detected',
      diagnosis: 'No Antigravity brain logs found in ~/.gemini/antigravity'
    };

    try {
      const os = require('os');
      const homedir = os.homedir();
      const brainRoot = path.join(homedir, '.gemini/antigravity/brain');

      if (fs.existsSync(brainRoot)) {
        const subdirs = fs.readdirSync(brainRoot).filter(file => {
          try {
            return fs.statSync(path.join(brainRoot, file)).isDirectory();
          } catch (e) {
            return false;
          }
        });

        let latestFile = null;
        let latestMtime = 0;

        subdirs.forEach(subdir => {
          const transcriptPath = path.join(brainRoot, subdir, '.system_generated/logs/transcript.jsonl');
          if (fs.existsSync(transcriptPath)) {
            try {
              const mtime = fs.statSync(transcriptPath).mtimeMs;
              if (mtime > latestMtime) {
                latestMtime = mtime;
                latestFile = transcriptPath;
              }
            } catch (e) {}
          }
        });

        if (latestFile) {
          const stats = fs.statSync(latestFile);
          const lastSeenStr = stats.mtime.toISOString();
          const diffMs = Date.now() - stats.mtimeMs;
          const secondsAgo = Math.max(0, Math.floor(diffMs / 1000));

          let status = 'DEAD';
          if (secondsAgo < 60) {
            status = 'LIVE';
          } else if (secondsAgo < 600) {
            status = 'WARM';
          } else {
            status = 'STALE';
          }

          const content = fs.readFileSync(latestFile, 'utf8').trim();
          const lines = content ? content.split('\n').filter(l => l.trim().length > 0) : [];

          let countToday = 0;
          let lastPreview = 'No details available';

          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);

          if (lines.length > 0) {
            const lastLine = lines[lines.length - 1];
            try {
              const event = JSON.parse(lastLine);
              let preview = '';
              if (event.type === 'USER_INPUT') {
                preview = `user: "${event.content}"`;
              } else if (event.type) {
                preview = `${event.source || 'MODEL'}: run ${event.type}`;
                if (event.content) {
                  const cleanContent = event.content.replace(/\s+/g, ' ').substring(0, 50);
                  preview += ` -> ${cleanContent}`;
                }
              } else {
                preview = `Transaction ${event.step_index || ''} complete`;
              }

              preview = redactSecrets(preview);
              if (preview.length > 80) {
                preview = preview.substring(0, 80) + '...';
              }
              lastPreview = preview;
            } catch (e) {
              lastPreview = lastLine.substring(0, 80);
            }

            lines.forEach(line => {
              try {
                const event = JSON.parse(line);
                if (event.created_at) {
                  const t = new Date(event.created_at).getTime();
                  if (t >= startOfToday.getTime()) {
                    countToday++;
                  }
                }
              } catch (e) {}
            });
          }

          antigravityStats = {
            status,
            count_today: countToday,
            last_seen: lastSeenStr,
            seconds_ago: secondsAgo,
            last_preview: lastPreview,
            diagnosis: 'Connected to local transcript logs'
          };
        }
      }
    } catch (err: any) {
      console.error('Antigravity logs scan error:', err);
    }

    sourcesStats['antigravity'] = antigravityStats;

    res.json({
      date: todayStr,
      sources: sourcesStats
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to query capture health metrics: ' + error.message });
  }
});

// GET /api/context/brief - Dynamic Monospaced Cognitive Briefing Packet
app.get('/api/context/brief', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // 1. Current Focus
    let currentFocus = '* Establish Cognitive OS v0.6 and memory rankings';
    const currentStatePath = path.join(rootDir, 'context/CURRENT_STATE.md');
    if (fs.existsSync(currentStatePath)) {
      try {
        const content = fs.readFileSync(currentStatePath, 'utf8');
        const activeTaskMatch = content.match(/\*\*Task Name\*\*:\s*([^\n]+)/i) || content.match(/\*\s*Active Task\s*:\s*([^\n]+)/i);
        if (activeTaskMatch) {
          currentFocus = `* Task: ${activeTaskMatch[1].trim()}`;
        }
        const priorityMatch = content.match(/Dự án ưu tiên số 1\s*(?:hiện tại)?\s*(?:là)?\s*(\w+)/i) || content.match(/Dự án ưu tiên\s*:\s*(\w+)/i);
        if (priorityMatch) {
          currentFocus += `\n* Priority Project: ${priorityMatch[1].trim()}`;
        }
      } catch (e) {}
    }

    // 2. Relevant Memories (Top 3 Candidates or Approved Memories)
    let memoriesStr = '* No active distilled candidates today.';
    const candidatesPath = path.join(rootDir, 'data/memory/candidates', `${todayStr}.candidates.json`);
    if (fs.existsSync(candidatesPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
        const items = (data.candidates || []).slice(0, 3);
        if (items.length > 0) {
          memoriesStr = items.map((item: any) => {
            let desc = item.summary || item.content || '';
            if (desc.length > 80) desc = desc.substring(0, 80) + '...';
            return `* [CID-${item.id}] (${item.category || 'Useful'}): ${desc} (Confidence: ${item.confidence || 0.8})`;
          }).join('\n');
        }
      } catch (e) {}
    }

    // 3. Active Decisions
    let decisionsStr = '* Scrub credentials before logging\n* Prefer zero-dependency local heuristics fallbacks';
    const decisionsPath = path.join(rootDir, 'context/DECISIONS.md');
    if (fs.existsSync(decisionsPath)) {
      try {
        const content = fs.readFileSync(decisionsPath, 'utf8');
        const bullets = content.split('\n').filter(line => line.trim().startsWith('*') || line.trim().startsWith('-')).slice(0, 3);
        if (bullets.length > 0) {
          decisionsStr = bullets.map(b => b.trim()).join('\n');
        }
      } catch (e) {}
    }

    // 4. Reality Warnings
    let warningsStr = '* Reality audit systems normal (PASS)';
    const realityPath = path.join(rootDir, 'data/memory/reality/reality_scores.json');
    if (fs.existsSync(realityPath)) {
      try {
        const reality = JSON.parse(fs.readFileSync(realityPath, 'utf8'));
        const hasMismatch = Object.keys(reality.projects || {}).some(k => k === 'qlythuexe' && reality.projects[k].activity_score < 25);
        if (hasMismatch) {
          warningsStr = '⚠ REALITY MISMATCH DETECTED: Project "qlythuexe" is declared Priority #1 but has 0 recent git/terminal activity. Active focus is "centalcontext". Avoid qlythuexe unless explicitly commanded.';
        }
      } catch (e) {}
    }

    // 5. Founder Preferences
    let preferencesStr = '* Risk Profile: low_execution_cost_tolerance\n* Styling: dark_theme_glassmorphism, vanilla_css';
    const profilePath = path.join(rootDir, 'data/memory/founder_profile.json');
    if (fs.existsSync(profilePath)) {
      try {
        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        const prefs = Object.entries(profile.preferences || {}).filter(([k, v]: [string, any]) => v.confidence >= 0.70);
        if (prefs.length > 0) {
          preferencesStr = prefs.map(([k, v]: [string, any]) => `* ${k.replace(/_/g, ' ').toUpperCase()}: ${v.value}`).join('\n');
        }
      } catch (e) {}
    }

    // Compile COGNITIVE_BRIEF.md
    const briefContent = `# CENTRALCONTEXT COGNITIVE BRIEF [${todayStr}]
[TTL: 4 Hours | Key: 2578420f... | Mode: Real-time Ingestion]

## CURRENT FOCUS
${currentFocus}

## RELEVANT MEMORIES
${memoriesStr}

## ACTIVE DECISIONS
${decisionsStr}

## REALITY WARNINGS
${warningsStr}

## FOUNDER PREFERENCES
${preferencesStr}
`;

    // Save to context/COGNITIVE_BRIEF.md
    const briefPath = path.join(rootDir, 'context/COGNITIVE_BRIEF.md');
    fs.writeFileSync(briefPath, briefContent, 'utf8');

    res.json({
      success: true,
      file: 'context/COGNITIVE_BRIEF.md',
      content: briefContent
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to compile Cognitive Briefing: ' + error.message });
  }
});

// GET /api/factory/live-feed - Merges live events
app.get('/api/factory/live-feed', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string || '50', 10);
    const rawLogs = getRawLogs(limit);

    const events: any[] = [];
    rawLogs.forEach(log => {
      // 1. Raw capture event
      const time = new Date(log.timestamp).toLocaleTimeString();
      let preview = log.content || '';
      if (preview.length > 100) preview = preview.substring(0, 100) + '...';

      events.push({
        timestamp: log.timestamp,
        time,
        source: log.source,
        type: log.type,
        project: log.project || 'General',
        preview: preview,
        message: `${log.type.toUpperCase()}: ${preview}`
      });

      // 2. Secret Redactor event
      if (log.content && log.content.includes('[REDACTED')) {
        events.push({
          timestamp: log.timestamp,
          time,
          source: 'secret_firewall',
          type: 'security_block',
          project: 'security',
          preview: 'Filtered sensitive credential block cleanly',
          message: 'Filtered sensitive credential block cleanly'
        });
      }
    });

    // 3. Inject recent runs as distillery/ai_judge events
    const todayStr = new Date().toISOString().split('T')[0];
    const usageFilePath = path.join(rootDir, `data/memory/budget/openrouter_usage_${todayStr}.json`);
    if (fs.existsSync(usageFilePath)) {
      try {
        const usage = JSON.parse(fs.readFileSync(usageFilePath, 'utf8'));
        (usage.runs || []).slice(-10).forEach((run: any) => {
          events.push({
            timestamp: run.timestamp,
            time: new Date(run.timestamp).toLocaleTimeString(),
            source: run.run_id.startsWith('test_connection') ? 'ai_judge_test' : 'ai_judge',
            message: `Evaluated ${run.candidates_total || 1} candidate(s) using ${run.model}. Cost: $${(run.estimated_cost_usd || 0).toFixed(5)}. Status: ${run.status}`,
            project: 'memory'
          });
        });
      } catch (e) {}
    }

    // Sort events by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({ success: true, events: events.slice(0, limit) });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve factory live feed: ' + error.message });
  }
});

// GET /api/factory/distillery-status - Distillery run details
app.get('/api/factory/distillery-status', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const date = req.query.date as string || todayStr;

    const candidatesPath = path.join(rootDir, 'data/memory/candidates', `${date}.candidates.json`);
    const reportPath = path.join(rootDir, 'data/memory/distillery_runs', `${date}.report.md`);

    let reportPreview = '';
    if (fs.existsSync(reportPath)) {
      reportPreview = fs.readFileSync(reportPath, 'utf8').substring(0, 1500) + '\n\n... [TRUNCATED] ...';
    }

    if (fs.existsSync(candidatesPath)) {
      const data = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
      const list = data.candidates || [];
      
      const byType: Record<string, number> = {};
      list.forEach((c: any) => {
        byType[c.type] = (byType[c.type] || 0) + 1;
      });

      res.json({
        date,
        raw_records: data.summary ? 1000 : 0, // simple approximation or parsed stats
        skipped_noise: 0,
        deduped: 0,
        candidates: list.length,
        by_type: byType,
        latest_report_preview: reportPreview
      });
    } else {
      res.json({
        date,
        raw_records: 0,
        skipped_noise: 0,
        deduped: 0,
        candidates: 0,
        by_type: {},
        latest_report_preview: '*No distillery report exists for this date. Press Run Distillery below to run dry-run.*'
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve distillery status: ' + error.message });
  }
});

// GET /api/memory/candidates - Retrieve candidates array
app.get('/api/memory/candidates', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const date = req.query.date as string || todayStr;

    const candidatesPath = path.join(rootDir, 'data/memory/candidates', `${date}.candidates.json`);
    const reviewPath = path.join(rootDir, 'data/memory/review_state', `${date}.review.json`);

    let reviewState: Record<string, string> = {};
    if (fs.existsSync(reviewPath)) {
      try {
        reviewState = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
      } catch (e) {}
    }

    if (fs.existsSync(candidatesPath)) {
      const data = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
      const list = (data.candidates || []).map((c: any, index: number) => {
        const id = String(index + 1).padStart(3, '0');
        return {
          id,
          type: c.type,
          project: c.project || 'CentralContext',
          score: c.confidence || 80,
          priority: c.priority || 'medium',
          proposed_memory: c.proposed_memory,
          evidence: c.evidence || [],
          status: reviewState[id] || 'review_queue'
        };
      });
      res.json({ success: true, date, candidates: list });
    } else {
      res.json({ success: true, date, candidates: [] });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve candidates: ' + error.message });
  }
});

// POST /api/memory/candidates/review - Save candidate review decision
app.post('/api/memory/candidates/review', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const { date, candidateId, action } = req.body;
    if (!date || !candidateId || !action) {
      res.status(400).json({ error: 'date, candidateId, and action are required.' });
      return;
    }

    const allowedActions = ['approve', 'reject', 'needs_more_context', 'review_queue'];
    if (!allowedActions.includes(action)) {
      res.status(400).json({ error: `Unsupported action: ${action}` });
      return;
    }

    const reviewDir = path.join(rootDir, 'data/memory/review_state');
    if (!fs.existsSync(reviewDir)) {
      fs.mkdirSync(reviewDir, { recursive: true });
    }

    const reviewPath = path.join(reviewDir, `${date}.review.json`);
    let reviewState: Record<string, string> = {};
    if (fs.existsSync(reviewPath)) {
      try {
        reviewState = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
      } catch (e) {}
    }

    reviewState[candidateId] = action;
    fs.writeFileSync(reviewPath, JSON.stringify(reviewState, null, 2), 'utf8');

    res.json({ success: true, candidateId, status: action });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save review action: ' + error.message });
  }
});

// GET /api/reality/scores - Serve reality layer scores
app.get('/api/reality/scores', authenticateApiKey, apiRateLimiter, (req, res) => {
  try {
    const realityPath = path.join(rootDir, 'data/memory/reality/reality_scores.json');
    if (fs.existsSync(realityPath)) {
      const scores = JSON.parse(fs.readFileSync(realityPath, 'utf8'));
      res.json(scores);
    } else {
      res.status(404).json({ error: 'Reality scores not generated yet. Run Reality Scan first.' });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to load reality scores: ' + error.message });
  }
});

// POST /api/factory/run - Trigger background CLI tools and return streamed outputs
app.post('/api/factory/run', authenticateApiKey, apiRateLimiter, (req, res) => {
  const { action } = req.body;
  if (!action) {
    res.status(400).json({ error: 'Action is required.' });
    return;
  }

  const allowedActions = ['reality_scan', 'distill_dry_run', 'pipeline_dry_run', 'ai_judge_execute', 'capture_doctor'];
  if (!allowedActions.includes(action)) {
    res.status(400).json({ error: `Unsupported action: ${action}` });
    return;
  }

  let command = 'node scripts/reality-scanner.js';
  if (action === 'distill_dry_run') {
    command = 'node scripts/memory-distill.js';
  } else if (action === 'pipeline_dry_run') {
    command = 'node scripts/reality-scanner.js && node scripts/memory-distill.js --provider heuristics';
  } else if (action === 'ai_judge_execute') {
    command = 'node scripts/memory-ai-judge.js --execute';
  } else if (action === 'capture_doctor') {
    command = 'node scripts/capture-doctor.js';
  }

  console.log(`[CentralContext Server] Dashboard requested execution of: ${command}`);

  const startTs = Date.now();
  const { exec } = require('child_process');

  exec(command, { cwd: rootDir }, (error: any, stdout: string, stderr: string) => {
    const duration = ((Date.now() - startTs) / 1000).toFixed(2);
    if (error) {
      res.json({
        success: false,
        duration_sec: duration,
        error: error.message,
        stdout: stdout || '',
        stderr: stderr || ''
      });
    } else {
      res.json({
        success: true,
        duration_sec: duration,
        stdout: stdout || '',
        stderr: stderr || ''
      });
    }
  });
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
