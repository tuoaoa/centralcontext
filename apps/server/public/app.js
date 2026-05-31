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
