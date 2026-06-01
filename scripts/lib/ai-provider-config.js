/**
 * CentralContext Shared AI Provider Config Loader
 * scripts/lib/ai-provider-config.js
 *
 * Responsibilities:
 *   - Load provider settings from data/config/ai_provider.json with .env fallback
 *   - Hot-sync settings to process.env
 *   - Mask sensitive API keys for UI endpoints
 *   - Estimate OpenRouter call costs and validate budgets
 */

const fs = require('fs');
const path = require('path');

// Calculate root path relative to scripts/lib/
const rootDir = path.resolve(__dirname, '../..');
const configFilePath = path.join(rootDir, 'data/config/ai_provider.json');
const envFilePath = path.join(rootDir, '.env');
const pricingPath = path.join(rootDir, 'data/memory/config/model_pricing.json');

// Initialize config directories if needed
function ensureDirectories() {
  const dirs = [
    path.join(rootDir, 'data/config'),
    path.join(rootDir, 'data/memory/config'),
    path.join(rootDir, 'data/memory/budget'),
    path.join(rootDir, 'data/memory/cache'),
    path.join(rootDir, 'data/memory/locks')
  ];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

// Simple helper to load environment variables from .env if needed
function loadEnvFile() {
  if (fs.existsSync(envFilePath)) {
    try {
      const content = fs.readFileSync(envFilePath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || '';
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          process.env[key] = value;
        }
      });
    } catch (e) {}
  }
}

// ─── 1. Load configuration ───────────────────────────────────────────────────
function loadAIProviderConfig() {
  ensureDirectories();
  loadEnvFile();

  const defaults = {
    provider: 'heuristics',
    openrouter: {
      api_key: '',
      model: 'deepseek/deepseek-v4-flash',
      fallback_model: 'qwen/qwen3.5-flash-02-23',
      max_daily_cost_usd: 0.10,
      max_run_cost_usd: 0.02,
      max_requests_per_run: 10,
      max_candidates_per_run: 30,
      timeout_ms: 30000,
      enabled: false,
      dry_run_default: true,
      hard_stop: true,
      use_cache: true
    }
  };

  let fileConfig = {};
  if (fs.existsSync(configFilePath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    } catch (e) {
      console.warn(`[Warning] Failed to parse ai_provider.json: ${e.message}`);
    }
  }

  // Merge hierarchy: defaults -> .env fallback -> fileConfig
  const provider = fileConfig.provider || process.env.LLM_PROVIDER || defaults.provider;
  
  const merged = {
    provider,
    openrouter: {
      api_key: fileConfig.openrouter?.api_key !== undefined ? fileConfig.openrouter.api_key : (process.env.OPENROUTER_API_KEY || defaults.openrouter.api_key),
      model: fileConfig.openrouter?.model || process.env.OPENROUTER_MODEL || defaults.openrouter.model,
      fallback_model: fileConfig.openrouter?.fallback_model || process.env.OPENROUTER_FALLBACK_MODEL || defaults.openrouter.fallback_model,
      max_daily_cost_usd: parseFloat(fileConfig.openrouter?.max_daily_cost_usd !== undefined ? fileConfig.openrouter.max_daily_cost_usd : (process.env.OPENROUTER_MAX_DAILY_COST_USD || defaults.openrouter.max_daily_cost_usd)),
      max_run_cost_usd: parseFloat(fileConfig.openrouter?.max_run_cost_usd !== undefined ? fileConfig.openrouter.max_run_cost_usd : (process.env.OPENROUTER_MAX_RUN_COST_USD || defaults.openrouter.max_run_cost_usd)),
      max_requests_per_run: parseInt(fileConfig.openrouter?.max_requests_per_run !== undefined ? fileConfig.openrouter.max_requests_per_run : (process.env.OPENROUTER_MAX_REQUESTS_PER_RUN || defaults.openrouter.max_requests_per_run), 10),
      max_candidates_per_run: parseInt(fileConfig.openrouter?.max_candidates_per_run !== undefined ? fileConfig.openrouter.max_candidates_per_run : (process.env.OPENROUTER_MAX_CANDIDATES_PER_RUN || defaults.openrouter.max_candidates_per_run), 10),
      timeout_ms: parseInt(fileConfig.openrouter?.timeout_ms !== undefined ? fileConfig.openrouter.timeout_ms : (process.env.OPENROUTER_TIMEOUT_MS || defaults.openrouter.timeout_ms), 10),
      enabled: fileConfig.openrouter?.enabled !== undefined ? fileConfig.openrouter.enabled : (process.env.OPENROUTER_ENABLED === 'true' || (process.env.OPENROUTER_ENABLED === undefined && defaults.openrouter.enabled)),
      dry_run_default: fileConfig.openrouter?.dry_run_default !== undefined ? fileConfig.openrouter.dry_run_default : (process.env.OPENROUTER_DRY_RUN_DEFAULT !== 'false'),
      hard_stop: fileConfig.openrouter?.hard_stop !== undefined ? fileConfig.openrouter.hard_stop : (process.env.OPENROUTER_HARD_STOP !== 'false'),
      use_cache: fileConfig.openrouter?.use_cache !== undefined ? fileConfig.openrouter.use_cache : (process.env.OPENROUTER_USE_CACHE !== 'false')
    }
  };

  // If the API key is set, ensure it is treated as enabled unless explicitly turned off
  if (merged.openrouter.api_key && merged.openrouter.api_key.trim().length >= 10 && fileConfig.openrouter?.enabled === undefined && process.env.OPENROUTER_ENABLED === undefined) {
    merged.openrouter.enabled = true;
  }

  // Hot-sync to process.env immediately
  process.env.LLM_PROVIDER = merged.provider;
  process.env.OPENROUTER_API_KEY = merged.openrouter.api_key;
  process.env.OPENROUTER_MODEL = merged.openrouter.model;
  process.env.OPENROUTER_FALLBACK_MODEL = merged.openrouter.fallback_model;
  process.env.OPENROUTER_MAX_DAILY_COST_USD = String(merged.openrouter.max_daily_cost_usd);
  process.env.OPENROUTER_MAX_RUN_COST_USD = String(merged.openrouter.max_run_cost_usd);
  process.env.OPENROUTER_MAX_REQUESTS_PER_RUN = String(merged.openrouter.max_requests_per_run);
  process.env.OPENROUTER_MAX_CANDIDATES_PER_RUN = String(merged.openrouter.max_candidates_per_run);
  process.env.OPENROUTER_TIMEOUT_MS = String(merged.openrouter.timeout_ms);
  process.env.OPENROUTER_ENABLED = String(merged.openrouter.enabled);

  return merged;
}

// ─── 2. Save configuration ───────────────────────────────────────────────────
function saveAIProviderConfig(config) {
  ensureDirectories();
  const current = loadAIProviderConfig();

  // Re-read current config directly from file to preserve real key in case UI sent a masked one
  let realApiKey = config.openrouter?.api_key || '';
  const UI_MASK = '****';
  
  if (realApiKey.includes(UI_MASK)) {
    // Frontend sent a masked API key, keep the existing API key we had
    realApiKey = current.openrouter.api_key;
  }

  const newConfig = {
    provider: config.provider || current.provider,
    openrouter: {
      api_key: realApiKey,
      model: config.openrouter?.model || current.openrouter.model,
      fallback_model: config.openrouter?.fallback_model || current.openrouter.fallback_model,
      max_daily_cost_usd: parseFloat(config.openrouter?.max_daily_cost_usd !== undefined ? config.openrouter.max_daily_cost_usd : current.openrouter.max_daily_cost_usd),
      max_run_cost_usd: parseFloat(config.openrouter?.max_run_cost_usd !== undefined ? config.openrouter.max_run_cost_usd : current.openrouter.max_run_cost_usd),
      max_requests_per_run: parseInt(config.openrouter?.max_requests_per_run !== undefined ? config.openrouter.max_requests_per_run : current.openrouter.max_requests_per_run, 10),
      max_candidates_per_run: parseInt(config.openrouter?.max_candidates_per_run !== undefined ? config.openrouter.max_candidates_per_run : current.openrouter.max_candidates_per_run, 10),
      timeout_ms: parseInt(config.openrouter?.timeout_ms !== undefined ? config.openrouter.timeout_ms : current.openrouter.timeout_ms, 10),
      enabled: config.openrouter?.enabled !== undefined ? config.openrouter.enabled : current.openrouter.enabled,
      dry_run_default: config.openrouter?.dry_run_default !== undefined ? config.openrouter.dry_run_default : current.openrouter.dry_run_default,
      hard_stop: config.openrouter?.hard_stop !== undefined ? config.openrouter.hard_stop : current.openrouter.hard_stop,
      use_cache: config.openrouter?.use_cache !== undefined ? config.openrouter.use_cache : current.openrouter.use_cache
    }
  };

  // Write to JSON configuration file (SoT for settings UI)
  fs.writeFileSync(configFilePath, JSON.stringify(newConfig, null, 2), 'utf8');

  // Hot-sync to current process memory
  process.env.LLM_PROVIDER = newConfig.provider;
  process.env.OPENROUTER_API_KEY = newConfig.openrouter.api_key;
  process.env.OPENROUTER_MODEL = newConfig.openrouter.model;
  process.env.OPENROUTER_FALLBACK_MODEL = newConfig.openrouter.fallback_model;
  process.env.OPENROUTER_MAX_DAILY_COST_USD = String(newConfig.openrouter.max_daily_cost_usd);
  process.env.OPENROUTER_MAX_RUN_COST_USD = String(newConfig.openrouter.max_run_cost_usd);
  process.env.OPENROUTER_MAX_REQUESTS_PER_RUN = String(newConfig.openrouter.max_requests_per_run);
  process.env.OPENROUTER_MAX_CANDIDATES_PER_RUN = String(newConfig.openrouter.max_candidates_per_run);
  process.env.OPENROUTER_TIMEOUT_MS = String(newConfig.openrouter.timeout_ms);
  process.env.OPENROUTER_ENABLED = String(newConfig.openrouter.enabled);

  // Sync to `.env` for backwards-compatibility with legacy commands
  if (fs.existsSync(envFilePath)) {
    try {
      let envContent = fs.readFileSync(envFilePath, 'utf8');
      
      const syncKeys = {
        'LLM_PROVIDER': newConfig.provider,
        'OPENROUTER_API_KEY': newConfig.openrouter.api_key,
        'OPENROUTER_MODEL': newConfig.openrouter.model,
        'OPENROUTER_FALLBACK_MODEL': newConfig.openrouter.fallback_model,
        'OPENROUTER_MAX_DAILY_COST_USD': String(newConfig.openrouter.max_daily_cost_usd),
        'OPENROUTER_MAX_RUN_COST_USD': String(newConfig.openrouter.max_run_cost_usd),
        'OPENROUTER_MAX_REQUESTS_PER_RUN': String(newConfig.openrouter.max_requests_per_run),
        'OPENROUTER_MAX_CANDIDATES_PER_RUN': String(newConfig.openrouter.max_candidates_per_run),
        'OPENROUTER_TIMEOUT_MS': String(newConfig.openrouter.timeout_ms),
        'OPENROUTER_ENABLED': String(newConfig.openrouter.enabled)
      };

      for (const [key, val] of Object.entries(syncKeys)) {
        const regex = new RegExp(`^${key}=.*`, 'm');
        if (envContent.match(regex)) {
          envContent = envContent.replace(regex, `${key}=${val}`);
        } else {
          envContent += `\n${key}=${val}`;
        }
      }
      fs.writeFileSync(envFilePath, envContent.trim() + '\n', 'utf8');
    } catch (e) {
      console.warn(`[Warning] Failed to update `.env` file: ${e.message}`);
    }
  }

  return newConfig;
}

// ─── 3. Get Sanitized Configuration (No full API key leak) ───────────────────
function getSanitizedAIProviderConfig(config) {
  const cfg = config || loadAIProviderConfig();
  const rawKey = cfg.openrouter.api_key || '';
  let preview = '';
  
  if (rawKey.trim().length >= 10) {
    const cleanKey = rawKey.trim();
    preview = cleanKey.substring(0, 10) + '****' + cleanKey.substring(cleanKey.length - 4);
  }

  return {
    provider: cfg.provider,
    openrouter: {
      api_key_set: (rawKey.trim().length >= 10),
      api_key_preview: preview,
      model: cfg.openrouter.model,
      fallback_model: cfg.openrouter.fallback_model,
      max_daily_cost_usd: cfg.openrouter.max_daily_cost_usd,
      max_run_cost_usd: cfg.openrouter.max_run_cost_usd,
      max_requests_per_run: cfg.openrouter.max_requests_per_run,
      max_candidates_per_run: cfg.openrouter.max_candidates_per_run,
      enabled: cfg.openrouter.enabled,
      dry_run_default: cfg.openrouter.dry_run_default,
      hard_stop: cfg.openrouter.hard_stop,
      use_cache: cfg.openrouter.use_cache
    }
  };
}

// ─── 4. Pricing & Token Cost Estimation ──────────────────────────────────────
function estimateOpenRouterCost(promptText, completionText, modelName) {
  let pricingTable = {};
  if (fs.existsSync(pricingPath)) {
    try {
      pricingTable = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
    } catch (e) {}
  }

  const modelPricing = pricingTable[modelName] || {
    input_per_million: 1.00, // conservative fallback
    output_per_million: 3.00
  };

  const inputTokens = Math.ceil((promptText || '').length / 4);
  const outputTokens = Math.ceil((completionText || '').length / 4);
  
  const estimatedCost = (inputTokens * (modelPricing.input_per_million / 1000000)) +
                        (outputTokens * (modelPricing.output_per_million / 1000000));

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: estimatedCost
  };
}

// ─── 5. Budget Assert Check ──────────────────────────────────────────────────
function assertBudgetAllowed(targetDate, estimatedCost) {
  const budgetFilePath = path.join(rootDir, `data/memory/budget/openrouter_usage_${targetDate}.json`);
  const config = loadAIProviderConfig();
  const maxDaily = config.openrouter.max_daily_cost_usd;

  let todayCost = 0;
  if (fs.existsSync(budgetFilePath)) {
    try {
      const budgetRecord = JSON.parse(fs.readFileSync(budgetFilePath, 'utf8'));
      todayCost = budgetRecord.estimated_cost_usd || 0;
    } catch (e) {}
  }

  const totalProposed = todayCost + estimatedCost;
  const isAllowed = (totalProposed <= maxDaily);
  const remaining = Math.max(0, maxDaily - todayCost);

  return {
    allowed: isAllowed,
    today_cost: todayCost,
    remaining_budget: remaining,
    error: isAllowed ? undefined : `Budget violation: Proposed operation cost $${estimatedCost.toFixed(5)} would exceed remaining daily budget of $${remaining.toFixed(5)}`
  };
}

module.exports = {
  loadAIProviderConfig,
  saveAIProviderConfig,
  getSanitizedAIProviderConfig,
  estimateOpenRouterCost,
  assertBudgetAllowed
};
