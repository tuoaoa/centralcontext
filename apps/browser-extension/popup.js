console.log('[CentralContext] Popup script loaded.');

const statusPanel = document.getElementById('status-panel');

const autoInjectModeSelect = document.getElementById('auto-inject-mode');
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
chrome.storage.local.get(['centralcontext_auto_inject_mode', 'centralcontext_first_run_warned'], (result) => {
  const mode = result.centralcontext_auto_inject_mode || 'off';
  autoInjectModeSelect.value = mode;
  updateStatusLabel(mode);
  renderLastInjectionDetails();
});

// Helper to update status label color and text
function updateStatusLabel(mode) {
  if (mode === 'off') {
    autoInjectStatus.textContent = 'OFF';
    autoInjectStatus.style.color = '#94a3b8';
  } else if (mode === 'new_chat_only') {
    autoInjectStatus.textContent = 'NEW CHAT ONLY';
    autoInjectStatus.style.color = '#10b981';
  } else if (mode === 'manual_only') {
    autoInjectStatus.textContent = 'MANUAL ONLY';
    autoInjectStatus.style.color = '#38bdf8';
  }
}

// Helper to update state in storage and UI
function updateAutoInjectMode(mode) {
  chrome.storage.local.set({ centralcontext_auto_inject_mode: mode }, () => {
    autoInjectModeSelect.value = mode;
    updateStatusLabel(mode);
  });
}

// 2. Handle dropdown changes
autoInjectModeSelect.addEventListener('change', () => {
  const selectedMode = autoInjectModeSelect.value;
  
  if (selectedMode !== 'off') {
    // Check first-run warning
    chrome.storage.local.get(['centralcontext_first_run_warned'], (result) => {
      if (result.centralcontext_first_run_warned === true) {
        updateAutoInjectMode(selectedMode);
      } else {
        // Stay off for now, display warning box
        autoInjectModeSelect.value = 'off';
        updateStatusLabel('off');
        autoInjectWarning.style.display = 'block';
        autoInjectWarning.setAttribute('data-pending-mode', selectedMode);
      }
    });
  } else {
    updateAutoInjectMode('off');
  }
});

// 3. Confirm first-run warning
confirmAutoInject.addEventListener('click', () => {
  const pendingMode = autoInjectWarning.getAttribute('data-pending-mode') || 'new_chat_only';
  chrome.storage.local.set({ centralcontext_first_run_warned: true }, () => {
    autoInjectWarning.style.display = 'none';
    updateAutoInjectMode(pendingMode);
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
