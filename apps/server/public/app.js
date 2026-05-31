// ==========================================================================
// CentralContext Dashboard Interactivity
// ==========================================================================

let activeTab = 'state';

// 1. Initial Launch Setup
document.addEventListener('DOMContentLoaded', () => {
  // Load token from LocalStorage
  const savedKey = localStorage.getItem('central_context_api_key');
  if (savedKey) {
    document.getElementById('ui-api-key').value = savedKey;
  }

  // Bind Unlock Button
  document.getElementById('btn-save-key').addEventListener('click', () => {
    const key = document.getElementById('ui-api-key').value.trim();
    if (key) {
      localStorage.setItem('central_context_api_key', key);
      showToast('API Key saved & unlocked!');
      loadActiveTab();
    } else {
      localStorage.removeItem('central_context_api_key');
      showToast('API Key cleared.', true);
    }
  });

  // Bind Copy Context Pack
  document.getElementById('btn-copy-pack').addEventListener('click', copyContextPack);

  // Bind Form Submissions
  document.getElementById('form-raw-log').addEventListener('submit', submitRawLog);
  document.getElementById('form-work-log').addEventListener('submit', submitWorkLog);

  // --- OpenRouter Dynamic UI Config Logic (Yêu cầu Cấu hình Giao diện) ---
  const modelSelect = document.getElementById('ui-openrouter-model');
  const customModelDiv = document.getElementById('div-custom-model');
  
  if (modelSelect && customModelDiv) {
    modelSelect.addEventListener('change', () => {
      if (modelSelect.value === 'custom') {
        customModelDiv.classList.remove('hidden');
      } else {
        customModelDiv.classList.add('hidden');
      }
    });
  }

  // Load settings from LocalStorage
  const savedOrKey = localStorage.getItem('openrouter_api_key');
  const savedOrModel = localStorage.getItem('openrouter_model') || 'qwen/qwen3.5-coder:free';
  const savedCustomModel = localStorage.getItem('custom_openrouter_model') || '';

  if (savedOrKey && document.getElementById('ui-openrouter-key')) {
    document.getElementById('ui-openrouter-key').value = savedOrKey;
  }
  if (modelSelect) {
    modelSelect.value = savedOrModel;
    if (savedOrModel === 'custom' && customModelDiv) {
      customModelDiv.classList.remove('hidden');
    }
  }
  if (savedCustomModel && document.getElementById('ui-custom-model')) {
    document.getElementById('ui-custom-model').value = savedCustomModel;
  }

  // Bind Save Button
  const btnSaveOr = document.getElementById('btn-save-openrouter');
  if (btnSaveOr) {
    btnSaveOr.addEventListener('click', async () => {
      const orKey = document.getElementById('ui-openrouter-key').value.trim();
      const orModel = document.getElementById('ui-openrouter-model').value;
      const customModelVal = document.getElementById('ui-custom-model').value.trim();
      
      localStorage.setItem('openrouter_api_key', orKey);
      localStorage.setItem('openrouter_model', orModel);
      localStorage.setItem('custom_openrouter_model', customModelVal);
      
      showToast('OpenRouter Local Settings Saved!');
      
      // Dynamic Hot-Syncing to Server Env
      const activeModel = orModel === 'custom' ? customModelVal : orModel;
      try {
        const response = await fetch('/api/config/openrouter', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': getApiKey()
          },
          body: JSON.stringify({
            apiKey: orKey,
            model: activeModel
          })
        });
        if (response.ok) {
          showToast('⚡ Dynamic Configuration Synced to Central Server!');
        } else {
          showToast('Settings saved locally, but server sync returned failure.', true);
        }
      } catch (err) {
        console.warn('Failed to sync to server config API:', err);
        showToast('Settings saved locally. (Server sync failed: offline or no x-api-key)', true);
      }
    });
  }

  // Load first tab
  loadActiveTab();
});

// Get active API token
function getApiKey() {
  return document.getElementById('ui-api-key').value.trim();
}

// 2. Tab Navigation Router
function switchTab(tabId) {
  activeTab = tabId;
  
  // Set tab active state in UI
  document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).classList.add('active');

  // Update forms visibility depending on tab
  const rawForm = document.getElementById('form-raw-log');
  const workForm = document.getElementById('form-work-log');

  if (tabId === 'logs') {
    rawForm.classList.remove('hidden');
    workForm.classList.remove('hidden'); // Show both forms on logs tab
  } else if (tabId === 'decisions') {
    rawForm.classList.add('hidden');
    workForm.classList.remove('hidden'); // Show work log form for decisions/milestones
  } else if (tabId === 'ai-settings') {
    rawForm.classList.add('hidden');
    workForm.classList.add('hidden'); // Hide all raw input forms on settings panel
  } else {
    rawForm.classList.remove('hidden');
    workForm.classList.add('hidden');
  }

  loadActiveTab();
}

// 3. Tab Loading Controller
async function loadActiveTab() {
  const viewerTitle = document.getElementById('viewer-title');
  const viewerContent = document.getElementById('viewer-content');
  const apiKey = getApiKey();

  if (!apiKey) {
    viewerContent.innerHTML = `<div class="error-msg">⚠️ Please input your secure API token at the top header to unlock context.</div>`;
    return;
  }

  viewerContent.innerHTML = `<p class="loading">Fetching secure data from API server...</p>`;

  try {
    if (activeTab === 'logs') {
      viewerTitle.textContent = 'SQLite Raw Logs Cache (Last 50 Logs)';
      await renderRawLogs(viewerContent, apiKey);
      return;
    }

    if (activeTab === 'ai-settings') {
      viewerTitle.textContent = 'AI Provider Settings Manager';
      await renderAISettingsPanel(viewerContent, apiKey);
      return;
    }

    let endpoint = '/api/context/current';
    let fileTitle = 'CURRENT_STATE.md';

    if (activeTab === 'central') {
      endpoint = '/api/context/central';
      fileTitle = 'CENTRAL_CONTEXT.md';
    } else if (activeTab === 'decisions') {
      endpoint = '/api/context/decisions';
      fileTitle = 'DECISIONS.md';
    }

    viewerTitle.textContent = fileTitle;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });

    if (response.status === 401) {
      viewerContent.innerHTML = `<div class="error-msg">⚠️ 401 Unauthorized: Invalid API Key. Please verify your token.</div>`;
      return;
    }

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.content) {
      // Use marked.js dynamic parser loaded via CDN
      viewerContent.innerHTML = marked.parse(data.content);
    } else {
      viewerContent.innerHTML = `<p class="loading">File is empty or could not be found.</p>`;
    }

  } catch (error) {
    viewerContent.innerHTML = `<div class="error-msg">⚠️ Fetching failed: ${error.message}</div>`;
  }
}

// 4. Render Live SQLite logs feed
async function renderRawLogs(container, apiKey) {
  try {
    const response = await fetch('/api/logs', {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });

    if (!response.ok) throw new Error('API query failed');

    const data = await response.json();
    
    if (!data.logs || data.logs.length === 0) {
      container.innerHTML = `<p class="loading">No raw logs currently saved. Use the form below to post the first note.</p>`;
      return;
    }

    let feedHtml = `<div class="logs-feed-container">`;
    data.logs.forEach(log => {
      const timeLocal = new Date(log.timestamp).toLocaleString();
      const projectText = log.project ? ` • Project: ${log.project}` : '';
      
      feedHtml += `
        <div class="log-item">
          <div class="log-meta">
            <span>
              <span class="source-badge ${log.source}">${log.source}</span>
              <span class="badge" style="background-color:rgba(255,255,255,0.05); border:1px solid var(--border-color); color:var(--text-muted); padding:0.05rem 0.35rem; font-size:0.7rem; font-family:var(--font-mono); margin-left:0.25rem;">${log.type}</span>
              ${projectText}
            </span>
            <span style="font-size:0.75rem; font-family:var(--font-mono);">${timeLocal}</span>
          </div>
          <div class="log-content-text">${escapeHtml(log.content)}</div>
        </div>
      `;
    });
    feedHtml += `</div>`;
    container.innerHTML = feedHtml;

  } catch (error) {
    container.innerHTML = `<div class="error-msg">⚠️ Failed to load raw logs: ${error.message}</div>`;
  }
}

// Helper to escape HTML tags
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// 5. Submit Manual Raw Log entry
async function submitRawLog(e) {
  e.preventDefault();
  const apiKey = getApiKey();
  if (!apiKey) {
    showToast('Please enter an API Key first!', true);
    return;
  }

  const payload = {
    source: document.getElementById('log-source').value,
    project: document.getElementById('log-project').value || null,
    type: document.getElementById('log-type').value,
    content: document.getElementById('log-content').value
  };

  try {
    const response = await fetch('/api/log/raw', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('Post failed');

    showToast('✔ Raw log successfully recorded!');
    document.getElementById('log-content').value = '';
    loadActiveTab(); // Refresh active tab content
  } catch (err) {
    showToast('Failed to append log: ' + err.message, true);
  }
}

// 6. Submit Manual Work Log entry (appends directly to context/WORK_LOG.md)
async function submitWorkLog(e) {
  e.preventDefault();
  const apiKey = getApiKey();
  if (!apiKey) {
    showToast('Please enter an API key first!', true);
    return;
  }

  const payload = {
    source: document.getElementById('work-source').value,
    entry: document.getElementById('work-entry').value
  };

  try {
    const response = await fetch('/api/worklog', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('Post failed');

    showToast('✔ Work Log entry posted to WORK_LOG.md!');
    document.getElementById('work-entry').value = '';
    loadActiveTab();
  } catch (err) {
    showToast('Failed to append work entry: ' + err.message, true);
  }
}

// 7. Context Pack Aggregator Exporter
async function copyContextPack() {
  const apiKey = getApiKey();
  if (!apiKey) {
    showToast('Please enter an API key first!', true);
    return;
  }

  try {
    showToast('Compiling Agent Context Pack...');
    const response = await fetch('/api/context', {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });

    if (!response.ok) throw new Error('API fetch failed');

    const data = await response.json();
    const files = data.files || {};

    const packHeader = `======================================================================
CENTRAL CONTEXT AGENT PACK (Aggregated Brain State)
======================================================================\n\n`;

    let packContent = packHeader;

    const exportFiles = ['CURRENT_STATE.md', 'CENTRAL_CONTEXT.md', 'DECISIONS.md', 'MEMORY_RULES.md', 'ACTIVE_PROJECTS.md'];
    
    exportFiles.forEach(file => {
      if (files[file]) {
        packContent += `======================================================================
SYSTEM FILE: ${file}
======================================================================\n\n`;
        packContent += files[file] + '\n\n';
      }
    });

    await navigator.clipboard.writeText(packContent);
    showToast('⚡ Agent Context Pack copied to clipboard!');
  } catch (err) {
    showToast('Failed to compile context pack: ' + err.message, true);
  }
}

// 8. Notification Toast display utility
function showToast(message, isError = false) {
  const toast = document.getElementById('toast-notification');
  toast.textContent = message;
  toast.className = 'toast';
  if (isError) toast.classList.add('error');
  
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

// 9. AI settings rendering and controller logic
let currentAISettings = null;

async function renderAISettingsPanel(container, apiKey) {
  container.innerHTML = `<p class="loading">Loading AI settings from server...</p>`;
  try {
    const response = await fetch('/api/settings/ai-provider', {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });

    if (response.status === 401) {
      container.innerHTML = `<div class="error-msg">⚠️ 401 Unauthorized: Invalid API Key. Please verify your token.</div>`;
      return;
    }

    if (!response.ok) throw new Error('Failed to load settings');
    
    currentAISettings = await response.json();
    
    // Render the beautiful form
    let html = `
      <div class="ai-settings-container">
        <p class="description" style="color:var(--text-muted); font-size:0.9rem; margin-bottom: 0.5rem;">
          Configure LLM curation models, safety budget limits, and caching features. 
          All API keys are stored safely on the server side and never logged.
        </p>
        
        <div class="warning-banner" style="margin-bottom:1rem;">
          🛡️ <strong>Credit Safety Guarantee</strong>: OpenRouter API calls only happen when you click "Test Connection" or run the AI Judge CLI command explicitly. No background tasks or loops will ever call paid models automatically.
        </div>

        <div class="settings-form">
          <!-- Provider Selection -->
          <div class="form-group">
            <label for="set-provider" style="font-weight:600;">Curation Provider:</label>
            <select id="set-provider" onchange="toggleProviderFields()">
              <option value="local_heuristics" ${currentAISettings.provider === 'local_heuristics' ? 'selected' : ''}>local_heuristics (Rule-based, free, fast)</option>
              <option value="ollama" ${currentAISettings.provider === 'ollama' ? 'selected' : ''}>Ollama (Local AI, offline, requires Ollama server)</option>
              <option value="openrouter" ${currentAISettings.provider === 'openrouter' ? 'selected' : ''}>OpenRouter (Cloud AI, high-quality, requires API key)</option>
            </select>
          </div>

          <!-- OpenRouter API Key -->
          <div id="group-openrouter-key" class="form-group">
            <label for="set-openrouter-key" style="font-weight:600;">OpenRouter API Key:</label>
            <div class="input-with-button">
              <input type="password" id="set-openrouter-key" placeholder="${currentAISettings.openrouter.api_key_set ? 'sk-or-v1-******** (Saved)' : 'Enter sk-or-v1-... key'}" value="">
              <button type="button" id="btn-toggle-key-visibility" onclick="toggleKeyVisibility()">Show</button>
              <button type="button" id="btn-clear-key" onclick="clearKeyField()">Clear</button>
            </div>
            <small id="key-status-text" class="text-muted" style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">
              ${currentAISettings.openrouter.api_key_set ? `Saved Key Preview: <code>${currentAISettings.openrouter.api_key_preview}</code>` : 'No API key configured.'}
            </small>
          </div>

          <!-- Model Selector -->
          <div id="group-model-selector" class="form-group">
            <label for="set-model" style="font-weight:600;">AI Model Presets:</label>
            <select id="set-model" onchange="toggleCustomModelField()">
              <option value="qwen/qwen3.5-coder:free" ${currentAISettings.openrouter.model === 'qwen/qwen3.5-coder:free' ? 'selected' : ''}>qwen/qwen3.5-coder:free (Recommended, Free, Highly capable)</option>
              <option value="deepseek/deepseek-chat" ${currentAISettings.openrouter.model === 'deepseek/deepseek-chat' ? 'selected' : ''}>deepseek/deepseek-chat (Cost-effective, powerful)</option>
              <option value="google/gemini-2.5-flash" ${currentAISettings.openrouter.model === 'google/gemini-2.5-flash' ? 'selected' : ''}>google/gemini-2.5-flash (Fast, smart)</option>
              <option value="anthropic/claude-3.5-sonnet" ${currentAISettings.openrouter.model === 'anthropic/claude-3.5-sonnet' ? 'selected' : ''}>anthropic/claude-3.5-sonnet (Strategic, premium)</option>
              <option value="custom" ${!['qwen/qwen3.5-coder:free', 'deepseek/deepseek-chat', 'google/gemini-2.5-flash', 'anthropic/claude-3.5-sonnet'].includes(currentAISettings.openrouter.model) ? 'selected' : ''}>-- Use Custom Model ID --</option>
            </select>
          </div>

          <!-- Custom Model ID -->
          <div id="group-custom-model" class="form-group hidden">
            <label for="set-custom-model" style="font-weight:600;">Custom Model ID:</label>
            <input type="text" id="set-custom-model" placeholder="e.g. meta-llama/llama-3.1-70b" value="${currentAISettings.openrouter.model}">
          </div>

          <!-- Budget Settings -->
          <div id="group-budget-settings" class="budget-grid">
            <div class="form-group">
              <label for="set-daily-cost" style="font-weight:600;">Max Daily Cost (USD):</label>
              <input type="number" id="set-daily-cost" step="0.01" value="${currentAISettings.openrouter.max_daily_cost_usd}">
            </div>
            <div class="form-group">
              <label for="set-run-cost" style="font-weight:600;">Max Run Cost (USD):</label>
              <input type="number" id="set-run-cost" step="0.005" value="${currentAISettings.openrouter.max_run_cost_usd}">
            </div>
            <div class="form-group">
              <label for="set-max-requests" style="font-weight:600;">Max Requests / Run:</label>
              <input type="number" id="set-max-requests" value="${currentAISettings.openrouter.max_requests_per_run}">
            </div>
            <div class="form-group">
              <label for="set-max-candidates" style="font-weight:600;">Max Candidates / Run:</label>
              <input type="number" id="set-max-candidates" value="${currentAISettings.openrouter.max_candidates_per_run}">
            </div>
          </div>

          <!-- Safety Controls -->
          <div id="group-safety-switches" class="switches-grid" style="margin-top: 0.5rem;">
            <label class="switch-container">
              <input type="checkbox" id="set-enabled-openrouter" ${currentAISettings.openrouter.enabled ? 'checked' : ''}>
              <span>Enable OpenRouter AI Judge Curation</span>
            </label>
            <label class="switch-container">
              <input type="checkbox" id="set-dry-run" ${currentAISettings.openrouter.dry_run_default ? 'checked' : ''}>
              <span>Dry Run By Default (Safe Curation mode)</span>
            </label>
            <label class="switch-container">
              <input type="checkbox" id="set-hard-stop" ${currentAISettings.openrouter.hard_stop ? 'checked' : ''}>
              <span>Hard Stop on Budget Exceeded</span>
            </label>
            <label class="switch-container">
              <input type="checkbox" id="set-use-cache" ${currentAISettings.openrouter.use_cache ? 'checked' : ''}>
              <span>Use Cache for duplicate candidates</span>
            </label>
          </div>

          <!-- Action Buttons -->
          <div class="actions-row">
            <button type="button" id="btn-save-ai-settings" onclick="saveAISettings()" class="btn-glow">Save Settings</button>
            <button type="button" id="btn-test-connection" onclick="testAIConnection()" class="btn-primary">Test Connection</button>
            <button type="button" id="btn-refresh-usage" onclick="loadUsageLedger()" class="btn-primary" style="background-color: var(--border-color); color:var(--text-main);">Refresh Spend Info</button>
          </div>
        </div>

        <!-- Connection Test Output -->
        <div id="test-output-card" class="test-result-card hidden">
          <h3>Connection Test Result</h3>
          <div id="test-output-details" style="font-family:var(--font-sans); font-size:0.9rem;"></div>
        </div>

        <!-- Usage Ledger Section -->
        <div class="usage-ledger-card">
          <h3>Today's Spend Ledger</h3>
          <div class="usage-grid">
            <div class="usage-stat">
              <span class="stat-label">Total Requests</span>
              <span id="usage-requests" class="stat-value">0</span>
            </div>
            <div class="usage-stat">
              <span class="stat-label">Daily Spend</span>
              <span id="usage-spend" class="stat-value">$0.00000</span>
            </div>
            <div class="usage-stat">
              <span class="stat-label">Spend Limit</span>
              <span id="usage-limit" class="stat-value">$0.10000</span>
            </div>
            <div class="usage-stat">
              <span class="stat-label">Remaining Budget</span>
              <span id="usage-remaining" class="stat-value">$0.10000</span>
            </div>
          </div>
          
          <div id="usage-limit-warning" class="warning-banner hidden">
            ⚠️ <strong>Daily Limit Exceeded</strong>: Your remaining daily budget is $0.00. Test Connection and AI execution buttons have been disabled to protect your OpenRouter balance.
          </div>

          <h4 style="margin-top:0.75rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">Recent Curation Runs</h4>
          <div class="table-wrapper">
            <table class="runs-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Model</th>
                  <th>Ev. Candidates</th>
                  <th>Est. Cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="runs-table-body">
                <tr>
                  <td colspan="5" class="text-center text-muted">No runs recorded today.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Trigger UI toggles based on loaded data
    toggleProviderFields();
    toggleCustomModelField();
    
    // Load spend data
    await loadUsageLedger();
  } catch (err) {
    container.innerHTML = `<div class="error-msg">⚠️ Failed to load AI settings: ${err.message}</div>`;
  }
}

// Toggle fields based on provider
window.toggleProviderFields = function() {
  const provider = document.getElementById('set-provider').value;
  const keyGroup = document.getElementById('group-openrouter-key');
  const modelGroup = document.getElementById('group-model-selector');
  const customModelGroup = document.getElementById('group-custom-model');
  const budgetGroup = document.getElementById('group-budget-settings');
  const switchesGroup = document.getElementById('group-safety-switches');
  const testBtn = document.getElementById('btn-test-connection');

  if (!keyGroup) return; // Guard for non-rendered template

  if (provider === 'openrouter') {
    keyGroup.classList.remove('hidden');
    modelGroup.classList.remove('hidden');
    budgetGroup.classList.remove('hidden');
    switchesGroup.classList.remove('hidden');
    testBtn.classList.remove('hidden');
    toggleCustomModelField();
  } else {
    keyGroup.classList.add('hidden');
    modelGroup.classList.add('hidden');
    customModelGroup.classList.add('hidden');
    budgetGroup.classList.add('hidden');
    switchesGroup.classList.add('hidden');
    testBtn.classList.add('hidden');
  }
};

window.toggleCustomModelField = function() {
  const modelSelect = document.getElementById('set-model').value;
  const customModelGroup = document.getElementById('group-custom-model');
  
  if (!customModelGroup) return;

  if (modelSelect === 'custom') {
    customModelGroup.classList.remove('hidden');
  } else {
    customModelGroup.classList.add('hidden');
  }
};

window.toggleKeyVisibility = function() {
  const keyInput = document.getElementById('set-openrouter-key');
  const toggleBtn = document.getElementById('btn-toggle-key-visibility');
  if (keyInput.type === 'password') {
    keyInput.type = 'text';
    toggleBtn.textContent = 'Hide';
  } else {
    keyInput.type = 'password';
    toggleBtn.textContent = 'Show';
  }
};

window.clearKeyField = function() {
  const keyInput = document.getElementById('set-openrouter-key');
  keyInput.value = '';
  keyInput.placeholder = 'Enter sk-or-v1-... key';
  document.getElementById('key-status-text').innerHTML = 'Key cleared. Enter a new key to save.';
};

// Save settings to backend
window.saveAISettings = async function() {
  const apiKey = getApiKey();
  const provider = document.getElementById('set-provider').value;
  
  const payload = {
    provider,
    openrouter: {
      api_key: document.getElementById('set-openrouter-key').value.trim(),
      model: document.getElementById('set-model').value === 'custom' ? 
             document.getElementById('set-custom-model').value.trim() : 
             document.getElementById('set-model').value,
      max_daily_cost_usd: parseFloat(document.getElementById('set-daily-cost').value),
      max_run_cost_usd: parseFloat(document.getElementById('set-run-cost').value),
      max_requests_per_run: parseInt(document.getElementById('set-max-requests').value, 10),
      max_candidates_per_run: parseInt(document.getElementById('set-max-candidates').value, 10),
      enabled: document.getElementById('set-enabled-openrouter').checked,
      dry_run_default: document.getElementById('set-dry-run').checked,
      hard_stop: document.getElementById('set-hard-stop').checked,
      use_cache: document.getElementById('set-use-cache').checked
    }
  };

  // cost warnings (Phase 6)
  if (payload.openrouter.max_daily_cost_usd > 1.0) {
    const confirmDaily = confirm('⚠️ WARNING: Max Daily Budget exceeds $1.00 USD. Are you sure you want to save this high daily spending limit?');
    if (!confirmDaily) return;
    payload.confirm_over_1_usd = true;
  }

  if (payload.openrouter.max_run_cost_usd > 0.10) {
    const confirmRun = confirm('⚠️ WARNING: Max Run Budget exceeds $0.10 USD. Are you sure you want to save this high execution spending limit?');
    if (!confirmRun) return;
    payload.confirm_over_0_10_usd = true;
  }

  const saveBtn = document.getElementById('btn-save-ai-settings');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const response = await fetch('/api/settings/ai-provider', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to save settings');
    }

    showToast('✔ AI Curation configuration successfully saved!');
    
    // Reload values to show preview
    await renderAISettingsPanel(document.getElementById('viewer-content'), apiKey);
  } catch (err) {
    showToast('Error saving settings: ' + err.message, true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Settings';
  }
};

// Test connection
window.testAIConnection = async function() {
  const apiKey = getApiKey();
  const outputCard = document.getElementById('test-output-card');
  const detailsDiv = document.getElementById('test-output-details');
  const testBtn = document.getElementById('btn-test-connection');

  outputCard.classList.remove('hidden');
  detailsDiv.innerHTML = '<p class="loading">Initiating connection test. Budget checked. Requesting tiny completions from OpenRouter...</p>';
  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';

  const payload = {
    provider: 'openrouter',
    model: document.getElementById('set-model').value === 'custom' ? 
           document.getElementById('set-custom-model').value.trim() : 
           document.getElementById('set-model').value,
    api_key: document.getElementById('set-openrouter-key').value.trim()
  };

  try {
    const response = await fetch('/api/settings/ai-provider/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    if (!response.ok) {
      detailsDiv.innerHTML = `
        <div style="color:var(--error-color); font-weight:600; margin-bottom:0.25rem;">❌ Connection Test Failed</div>
        <div>Error: ${result.error || 'Unknown HTTP failure'}</div>
      `;
      showToast('❌ Connection test failed.', true);
      return;
    }

    if (result.success) {
      detailsDiv.innerHTML = `
        <div style="color:var(--primary-color); font-weight:600; margin-bottom:0.25rem;">🟢 Connection Successful!</div>
        <div style="display:grid; grid-template-columns: 120px 1fr; gap:0.25rem; font-family:var(--font-mono); font-size:0.8rem; margin-top:0.5rem;">
          <span>Model:</span> <span style="color:var(--secondary-color);">${result.model}</span>
          <span>Latency:</span> <span>${result.latency_ms} ms</span>
          <span>Est. Cost:</span> <span>$${result.estimated_cost.toFixed(5)} USD</span>
          <span>Response:</span> <span style="color:#fff; background-color:var(--bg-dark); padding:0.1rem 0.35rem; border-radius:4px; width:fit-content;">"${result.response}"</span>
        </div>
      `;
      showToast('🟢 Connection test successful!');
    } else {
      detailsDiv.innerHTML = `
        <div style="color:var(--error-color); font-weight:600; margin-bottom:0.25rem;">❌ Connection Failed (Model Output Error)</div>
        <div style="font-family:var(--font-mono); font-size:0.8rem; margin-top:0.25rem;">
          <span>Latency:</span> <span>${result.latency_ms} ms</span><br/>
          <span>Error Details:</span> <span style="color:var(--text-muted);">${result.error || 'Empty response content received.'}</span>
        </div>
      `;
      showToast('❌ Connection test failed.', true);
    }
    
    // Refresh ledger stats
    await loadUsageLedger();
  } catch (err) {
    detailsDiv.innerHTML = `
      <div style="color:var(--error-color); font-weight:600; margin-bottom:0.25rem;">❌ Test Execution Crashed</div>
      <div>Error: ${err.message}</div>
    `;
    showToast('❌ Connection test crashed.', true);
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  }
};

// Load spend details
window.loadUsageLedger = async function() {
  const apiKey = getApiKey();
  
  const reqSpan = document.getElementById('usage-requests');
  const spendSpan = document.getElementById('usage-spend');
  const limitSpan = document.getElementById('usage-limit');
  const remSpan = document.getElementById('usage-remaining');
  const warningBanner = document.getElementById('usage-limit-warning');
  const tableBody = document.getElementById('runs-table-body');

  if (!reqSpan) return; // Guard for non-rendered template

  try {
    const response = await fetch('/api/settings/ai-provider/usage', {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });

    if (!response.ok) throw new Error('Ledger fetch failed');

    const usage = await response.json();

    reqSpan.textContent = usage.total_requests;
    spendSpan.textContent = `$${usage.estimated_cost_usd.toFixed(5)}`;
    limitSpan.textContent = `$${usage.daily_limit.toFixed(5)}`;
    remSpan.textContent = `$${usage.remaining_budget.toFixed(5)}`;

    const budgetExceeded = (usage.remaining_budget <= 0.00001);
    
    // Disable elements if budget is used up
    if (budgetExceeded && usage.daily_limit > 0) {
      warningBanner.classList.remove('hidden');
      const testBtn = document.getElementById('btn-test-connection');
      if (testBtn) testBtn.disabled = true;
    } else {
      warningBanner.classList.add('hidden');
      const testBtn = document.getElementById('btn-test-connection');
      if (testBtn) testBtn.disabled = false;
    }

    // Render recent runs table
    if (usage.last_runs && usage.last_runs.length > 0) {
      let tbodyHtml = '';
      usage.last_runs.slice().reverse().forEach(run => {
        const time = new Date(run.timestamp).toLocaleTimeString();
        const costStr = `$${run.estimated_cost_usd.toFixed(5)}`;
        const statusColor = run.status === 'completed' ? 'var(--primary-color)' : 'var(--error-color)';
        
        tbodyHtml += `
          <tr>
            <td>${time}</td>
            <td><code>${run.model}</code></td>
            <td class="text-center">${run.candidates_evaluated}</td>
            <td style="color:var(--secondary-color); font-family:var(--font-mono);">${costStr}</td>
            <td style="color:${statusColor}; font-weight:600; text-transform:uppercase;">${run.status}</td>
          </tr>
        `;
      });
      tableBody.innerHTML = tbodyHtml;
    } else {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted">No runs recorded today.</td>
        </tr>
      `;
    }
  } catch (err) {
    console.warn('Failed to load usage data:', err.message);
  }
};
