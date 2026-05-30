const API_URL = 'http://localhost:3000/api/log/raw';
const PACK_URL = 'http://localhost:3000/api/context/pack';
const API_KEY = '2578420fb040d51884e5c656b4bae6b2a2f594867749f24cefcaf01a95b683b3';

chrome.runtime.onInstalled.addListener(() => {
  console.log('CentralContext Browser Capture Service Worker Installed.');
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'post_log') {
    const payload = message.payload;
    
    // Perform fetch securely inside Extension Service Worker context to bypass CORS/Mixed Content
    fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(response => {
      if (response.ok) {
        return response.json();
      }
      throw new Error('Server returned status: ' + response.status);
    })
    .then(data => {
      sendResponse({ success: true, data });
    })
    .catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    
    return true; // Keep message channel open for async response
  }
  
  if (message.action === 'get_context_pack') {
    // Fetch CentralContext Pack from secure local endpoint - strictly bypass cache
    const bypassUrl = PACK_URL + '?_t=' + Date.now();
    fetch(bypassUrl, {
      method: 'GET',
      headers: {
        'x-api-key': API_KEY,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      cache: 'no-store'
    })
    .then(response => {
      if (response.ok) {
        return response.text();
      }
      throw new Error('Failed to retrieve pack: ' + response.status);
    })
    .then(pack => {
      sendResponse({ success: true, pack });
    })
    .catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    
    return true;
  }

  
  if (message.action === 'new_session_with_context') {
    // Open a new ChatGPT tab and schedule auto-inject on load
    chrome.storage.local.set({ should_inject_on_load: true }, () => {
      chrome.tabs.create({ url: 'https://chatgpt.com/' }, (tab) => {
        sendResponse({ success: true });
      });
    });
    return true;
  }
});
