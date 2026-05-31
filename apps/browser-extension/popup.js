console.log('[CentralContext] Popup script loaded.');

const statusPanel = document.getElementById('status-panel');

const autoInjectToggle = document.getElementById('auto-inject-toggle');
const autoInjectStatus = document.getElementById('auto-inject-status');
const autoInjectWarning = document.getElementById('auto-inject-warning');
const confirmAutoInject = document.getElementById('confirm-auto-inject');
const resetInjectStateBtn = document.getElementById('reset-inject-state');

const forceAutoInjectBtn = document.getElementById('force-auto-inject');
const lastInjectDetails = document.getElementById('last-inject-details');
const lastInjectHash = document.getElementById('last-inject-hash');
const lastInjectLength = document.getElementById('last-inject-length');
const lastInjectUrl = document.getElementById('last-inject-url');

// Render metadata function
function renderLastInjectionDetails() {
  chrome.storage.local.get([
    'centralcontext_last_injected_hash',
    'centralcontext_last_injected_length',
    'centralcontext_last_injected_url'
  ], (result) => {
    const hash = result.centralcontext_last_injected_hash;
    const len = result.centralcontext_last_injected_length;
    const url = result.centralcontext_last_injected_url;

    if (hash && len && url) {
      lastInjectDetails.style.display = 'block';
      lastInjectHash.textContent = hash.substring(0, 16) + '...';
      lastInjectHash.title = hash;
      lastInjectLength.textContent = `${(len / 1024).toFixed(2)} KB (${len} chars)`;
      lastInjectUrl.textContent = url;
      lastInjectUrl.title = url;
    } else {
      lastInjectDetails.style.display = 'none';
    }
  });
}

// 1. Initialize UI states from chrome.storage.local
chrome.storage.local.get(['centralcontext_auto_inject_enabled', 'centralcontext_first_run_warned'], (result) => {
  const isEnabled = result.centralcontext_auto_inject_enabled === true;
  autoInjectToggle.checked = isEnabled;
  autoInjectStatus.textContent = `Status: ${isEnabled ? 'ON' : 'OFF'}`;
  autoInjectStatus.style.color = isEnabled ? '#10b981' : '#94a3b8';
  renderLastInjectionDetails();
});

// Helper to update toggle state in storage and UI
function updateAutoInjectState(enabled) {
  chrome.storage.local.set({ centralcontext_auto_inject_enabled: enabled }, () => {
    autoInjectToggle.checked = enabled;
    autoInjectStatus.textContent = `Status: ${enabled ? 'ON' : 'OFF'}`;
    autoInjectStatus.style.color = enabled ? '#10b981' : '#94a3b8';
  });
}

// 2. Handle toggle changes
autoInjectToggle.addEventListener('change', () => {
  const isChecked = autoInjectToggle.checked;
  
  if (isChecked) {
    // Check first-run warning
    chrome.storage.local.get(['centralcontext_first_run_warned'], (result) => {
      if (result.centralcontext_first_run_warned === true) {
        updateAutoInjectState(true);
      } else {
        // Stay unchecked for now, display warning box
        autoInjectToggle.checked = false;
        autoInjectWarning.style.display = 'block';
      }
    });
  } else {
    updateAutoInjectState(false);
  }
});

// 3. Confirm first-run warning
confirmAutoInject.addEventListener('click', () => {
  chrome.storage.local.set({ centralcontext_first_run_warned: true }, () => {
    autoInjectWarning.style.display = 'none';
    updateAutoInjectState(true);
  });
});

// 4. Reset Inject State
resetInjectStateBtn.addEventListener('click', () => {
  chrome.storage.local.set({ 
    centralcontext_injected_urls: {},
    centralcontext_last_injected_hash: null,
    centralcontext_last_injected_length: null,
    centralcontext_last_injected_url: null
  }, () => {
    renderLastInjectionDetails();
    showStatus('<div style="color: #38bdf8; font-weight: 600; text-align: center;">Injection history cleared!</div>');
  });
});

// 5. Check API Availability on startup
chrome.runtime.sendMessage({ action: 'get_context_pack' }, (response) => {
  if (chrome.runtime.lastError || !response || !response.success) {
    showStatus('<div style="color: #ef4444; font-weight: 700; text-align: center;">CentralContext API unavailable.</div>', true);
  }
});

function showStatus(html, isError = false) {
  statusPanel.style.display = 'block';
  statusPanel.style.borderColor = isError ? 'rgba(239, 68, 68, 0.4)' : '#1e293b';
  statusPanel.style.background = isError ? 'rgba(239, 68, 68, 0.05)' : 'rgba(30, 41, 59, 0.5)';
  statusPanel.innerHTML = html;
}

function sendActionToActiveTab(action) {
  showStatus('<div style="color: #94a3b8; font-weight: 500; text-align: center;">Sending request to page...</div>');
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      showStatus('<div style="color: #fca5a5; font-weight: 600;">Error: No active tab found.</div>', true);
      return;
    }
    
    const activeTab = tabs[0];
    const url = activeTab.url || '';
    
    const isSupported = url.includes('chatgpt.com') || 
                        url.includes('claude.ai') || 
                        url.includes('gemini.google.com');
                        
    if (!isSupported) {
      showStatus('<div style="color: #fca5a5; font-weight: 600;">Unsupported Page</div><div style="color: #94a3b8; font-size: 11px; margin-top: 4px;">Please open ChatGPT, Gemini, or Claude to run action.</div>', true);
      return;
    }

    chrome.tabs.sendMessage(activeTab.id, { action }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Message error:', chrome.runtime.lastError);
        showStatus('<div style="color: #fca5a5; font-weight: 600;">Tab Not Ready</div><div style="color: #94a3b8; font-size: 11px; margin-top: 4px;">Please refresh the chat page and try again.</div>', true);
        return;
      }
      
      if (response && response.success) {
        if (action === 'inject_context_pack') {
          showStatus('<div style="color: #34d399; font-weight: 600; text-align: center;">CentralContext Pack Injected!</div>');
          setTimeout(renderLastInjectionDetails, 200);
        } else if (action === 'force_auto_inject') {
          showStatus('<div style="color: #34d399; font-weight: 600; text-align: center;">Fresh Context Forced!</div>');
          setTimeout(renderLastInjectionDetails, 200);
        } else {
          showStatus('<div style="color: #38bdf8; font-weight: 600; text-align: center;">Scanning and capturing conversation...</div>');
        }

      } else {
        showStatus(`<div style="color: #fca5a5; font-weight: 600;">Failed: ${response ? response.error : 'Unknown response'}</div>`, true);
      }
    });
  });
}

// 3. New Session trigger
document.getElementById('new-session').addEventListener('click', () => {
  showStatus('<div style="color: #94a3b8; font-weight: 500; text-align: center;">Opening new ChatGPT session...</div>');
  chrome.runtime.sendMessage({ action: 'new_session_with_context' }, (response) => {
    if (chrome.runtime.lastError) {
      showStatus('<div style="color: #fca5a5; font-weight: 600;">Failed to create session</div>', true);
    } else if (response && response.success) {
      showStatus('<div style="color: #34d399; font-weight: 600; text-align: center;">Opening new tab & scheduling inject...</div>');
    }
  });
});

// 3. Inject Pack trigger
document.getElementById('inject-pack').addEventListener('click', () => {
  sendActionToActiveTab('inject_context_pack');
});

forceAutoInjectBtn.addEventListener('click', () => {
  sendActionToActiveTab('force_auto_inject');
});


document.getElementById('capture-current').addEventListener('click', () => {
  sendActionToActiveTab('capture_current_conversation');
});

document.getElementById('capture-visible').addEventListener('click', () => {
  sendActionToActiveTab('capture_visible_messages');
});

document.getElementById('capture-debug').addEventListener('click', () => {
  sendActionToActiveTab('capture_debug_snapshot');
});

// Listen for message events from content script reporting backfill or debug results
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'backfill_result') {
    const { successCount, skippedCount, errorCount, totalCount } = message;
    let html = `
      <div style="color: #34d399; font-weight: 700; font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
        <span style="display:inline-block; width:6px; height:6px; background:#34d399; border-radius:50%;"></span>
        Capture Finished
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px; color: #cbd5e1;">
        <div>Total Found:</div><div style="font-weight: 600; text-align: right;">${totalCount}</div>
        <div>New Synced:</div><div style="font-weight: 600; text-align: right; color: #38bdf8;">${successCount}</div>
        <div>Deduplicated:</div><div style="font-weight: 600; text-align: right; color: #94a3b8;">${skippedCount}</div>
        <div>Failed:</div><div style="font-weight: 600; text-align: right; color: ${errorCount > 0 ? '#ef4444' : '#cbd5e1'};">${errorCount}</div>
      </div>
    `;
    showStatus(html);
  } else if (message.action === 'debug_result') {
    const { statusText, isError } = message;
    showStatus(`<div style="color: ${isError ? '#fca5a5' : '#38bdf8'}; font-weight: 600; font-size: 12px;">${statusText}</div>`, isError);
  }
});

// Load and display AI Judge status
function loadAIJudgeStatus() {
  const providerVal = document.getElementById('ai-provider-val');
  const modelVal = document.getElementById('ai-model-val');
  const costVal = document.getElementById('ai-cost-val');
  const statusVal = document.getElementById('ai-status-val');

  if (!providerVal) return;

  chrome.runtime.sendMessage({ action: 'get_ai_status' }, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) {
      providerVal.textContent = 'OFFLINE';
      providerVal.style.color = '#ef4444';
      modelVal.textContent = 'API Unavailable';
      costVal.textContent = '-';
      statusVal.textContent = 'OFFLINE';
      statusVal.style.background = 'rgba(239, 68, 68, 0.15)';
      statusVal.style.color = '#fca5a5';
      return;
    }

    const settings = response.settings;
    const usage = response.usage;

    // 1. Provider
    const providerName = settings.provider || 'local_heuristics';
    providerVal.textContent = providerName.replace('_', ' ');
    if (providerName === 'openrouter') {
      providerVal.style.color = '#38bdf8';
    } else if (providerName === 'ollama') {
      providerVal.style.color = '#818cf8';
    } else {
      providerVal.style.color = '#94a3b8';
    }

    // 2. Model
    modelVal.textContent = (providerName === 'openrouter' ? settings.openrouter.model : 'Local Heuristics/Ollama');

    // 3. Today Cost
    const spent = usage.estimated_cost_usd || 0;
    const limit = usage.daily_limit || 0;
    costVal.textContent = `$${spent.toFixed(4)} / $${limit.toFixed(2)}`;

    // 4. Status Badge
    let modeText = 'LOCAL RULE';
    let bg = 'rgba(148, 163, 184, 0.15)';
    let fg = '#94a3b8';

    if (providerName === 'openrouter') {
      if (!settings.openrouter.enabled) {
        modeText = 'DISABLED';
        bg = 'rgba(239, 68, 68, 0.15)';
        fg = '#fca5a5';
      } else if (settings.openrouter.dry_run_default) {
        modeText = 'DRY-RUN';
        bg = 'rgba(245, 158, 11, 0.15)';
        fg = '#fbbf24';
      } else {
        modeText = 'ACTIVE';
        bg = 'rgba(16, 185, 129, 0.15)';
        fg = '#34d399';
      }
    } else if (providerName === 'ollama') {
      modeText = 'LOCAL OLLAMA';
      bg = 'rgba(99, 102, 241, 0.15)';
      fg = '#a5b4fc';
    }

    statusVal.textContent = modeText;
    statusVal.style.background = bg;
    statusVal.style.color = fg;
  });
}

// Open dashboard settings panel tab
document.getElementById('open-settings-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:3000/#ai-settings' });
});

// Load AI status on load
document.addEventListener('DOMContentLoaded', loadAIJudgeStatus);
loadAIJudgeStatus();

