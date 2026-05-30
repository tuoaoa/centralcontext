console.log('[CentralContext] Popup script loaded.');

const statusPanel = document.getElementById('status-panel');

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
