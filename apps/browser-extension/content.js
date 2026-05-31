console.log(`[CentralContext] content script loaded on ${window.location.href}`);

const sentHashes = new Set();
let observer;

// In-memory states for streaming message debouncing
const assistantDebounceTimers = {};
const pendingAssistantMessages = {};
const lastPostedMessageHashes = {};
let isExtensionMutating = false;

// Bulletproof check to see if extension context has been invalidated (e.g. extension was reloaded)
function isContextValid() {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
      if (observer) {
        try {
          observer.disconnect();
          console.log('[CentralContext] Extension context invalidated. Observer disconnected.');
        } catch (e) {}
      }
      return false;
    }
    return true;
  } catch (err) {
    if (observer) {
      try {
        observer.disconnect();
      } catch (e) {}
    }
    return false;
  }
}

// Helper to compute SHA-256 hash of a string using Web Crypto API
async function sha256(message) {
  try {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return 'hash_failed_' + Date.now();
  }
}

function getPlatform() {
  try {
    const host = window.location.hostname;
    if (host.includes('chatgpt')) return 'chatgpt';
    if (host.includes('claude')) return 'claude';
    if (host.includes('gemini')) return 'gemini';
  } catch (e) {}
  return 'unknown';
}

function isElementPartiallyInViewport(el) {
  try {
    const rect = el.getBoundingClientRect();
    const windowHeight = (window.innerHeight || document.documentElement.clientHeight);
    const windowWidth = (window.innerWidth || document.documentElement.clientWidth);
    return (rect.top <= windowHeight && rect.bottom >= 0 && rect.left <= windowWidth && rect.right >= 0);
  } catch (e) {
    return false;
  }
}

// Robust parsing logic of conversation elements in DOM order
function parseMessages(onlyVisible = false) {
  const platform = getPlatform();
  const messages = [];

  try {
    if (platform === 'chatgpt') {
      let nodes = Array.from(document.querySelectorAll('main [data-message-author-role]'));
      if (nodes.length === 0) {
        nodes = Array.from(document.querySelectorAll('main article'));
      }
      
      const distinctNodes = nodes.filter(node => !nodes.some(other => other !== node && other.contains(node)));

      distinctNodes.forEach((node) => {
        if (onlyVisible && !isElementPartiallyInViewport(node)) {
          return;
        }

        let role = node.getAttribute('data-message-author-role');
        if (!role) {
          if (node.querySelector('[data-message-author-role="user"]') || node.classList.contains('user-message')) {
            role = 'user';
          } else if (node.querySelector('[data-message-author-role="assistant"]') || node.classList.contains('assistant-message')) {
            role = 'assistant';
          } else {
            role = 'unknown';
          }
        }
        if (role !== 'user' && role !== 'assistant') {
          role = 'unknown';
        }

        const textDiv = node.querySelector('.markdown') || node.querySelector('.whitespace-pre-wrap') || node;
        let text = textDiv.innerText ? textDiv.innerText.trim() : '';

        if (text.includes('ChatGPT có thể mắc lỗi') || text.includes('ChatGPT can make mistakes') || text.includes('ChatGPT may make mistakes')) {
          return;
        }
        
        if (node.closest('nav') || node.closest('.sidebar')) {
          return;
        }

        if (text.length > 2) {
          messages.push({ role, content: text });
        }
      });
    } else if (platform === 'gemini') {
      const allNodes = Array.from(document.querySelectorAll('main .query-text, main h2.query-text-inner, main .query-content, main message-content, main .message-content'));
      const distinctNodes = allNodes.filter(node => !allNodes.some(other => other !== node && other.contains(node)));

      distinctNodes.forEach((node) => {
        if (onlyVisible && !isElementPartiallyInViewport(node)) {
          return;
        }

        let role = 'unknown';
        if (node.classList.contains('query-text') || 
            node.classList.contains('query-content') || 
            node.tagName.toLowerCase() === 'h2' ||
            node.querySelector('.query-text') ||
            node.querySelector('.query-content')) {
          role = 'user';
        } else if (node.tagName.toLowerCase() === 'message-content' || 
                   node.classList.contains('message-content') ||
                   node.querySelector('message-content')) {
          role = 'assistant';
        }

        let text = node.innerText ? node.innerText.trim() : '';

        if (text.includes('Gemini có thể đưa ra thông tin không chính xác') || 
            text.includes('Gemini may display inaccurate info') ||
            text.includes('Nhập câu hỏi tại đây') ||
            text.includes('Ask Gemini')) {
          return;
        }

        if (node.closest('g-sidebar') || node.closest('aside') || node.closest('.sidebar')) {
          return;
        }

        if (text.length > 2) {
          messages.push({ role, content: text });
        }
      });
    } else if (platform === 'claude') {
      const allNodes = Array.from(document.querySelectorAll('main .font-user-message, main .font-claude-message'));
      const distinctNodes = allNodes.filter(node => !allNodes.some(other => other !== node && other.contains(node)));

      distinctNodes.forEach((node) => {
        if (onlyVisible && !isElementPartiallyInViewport(node)) {
          return;
        }

        const role = node.classList.contains('font-user-message') ? 'user' : 'assistant';
        const text = node.innerText ? node.innerText.trim() : '';

        if (node.closest('.sidebar') || node.closest('nav')) {
          return;
        }

        if (text.length > 2) {
          messages.push({ role, content: text });
        }
      });
  } catch (e) {
    console.log('[CentralContext] Error parsing messages:', e.message);
  }

  return messages.filter(msg => {
    return !msg.content.includes('CENTRALCONTEXT AGENT CONTEXT PACK') && 
           !msg.content.includes('--- CONTEXT PACK CONTENT ---');
  });
}

// Post single message with full metadata and persistent deduplication
async function postSingleMessage(msg, index, source = 'browser_chat') {
  if (!isContextValid()) return { skipped: true };

  try {
    const platform = getPlatform();
    const convId = window.location.pathname.split('/').pop() || 'main';
    const url = window.location.href;
    const pageTitle = document.title;
    const capturedAt = new Date().toISOString();
    
    const contentHash = await sha256(msg.content);
    
    let content = msg.content;
    if (content.length > 20 * 1024) {
      content = content.substring(0, 20 * 1024) + '\n\n... [TRUNCATED 20KB LIMIT] ...';
    }

    const uniqueKey = `${platform}_${convId}_${msg.role}_${contentHash}`;
    
    const isDup = await new Promise((resolve) => {
      if (!isContextValid()) {
        resolve(true);
        return;
      }
      try {
        chrome.storage.local.get(['captured_message_hashes'], (result) => {
          try {
            if (!isContextValid() || !result) {
              resolve(true);
              return;
            }
            const hashes = result.captured_message_hashes || {};
            if (hashes[uniqueKey]) {
              resolve(true);
            } else {
              hashes[uniqueKey] = capturedAt;
              chrome.storage.local.set({ captured_message_hashes: hashes }, () => {
                resolve(false);
              });
            }
          } catch (innerErr) {
            resolve(true);
          }
        });
      } catch (e) {
        resolve(true);
      }
    });

    if (isDup) {
      console.log(`[CentralContext] [DEDUP] Skip duplicate: ${uniqueKey.substring(0, 32)}...`);
      return { skipped: true };
    }

    const formattedContent = `[Metadata]
platform: ${platform}
conversation_id: ${convId}
url: ${url}
page_title: ${pageTitle}
captured_at: ${capturedAt}
message_index: ${index}
role: ${msg.role}
content_hash: ${contentHash}
[End Metadata]

${content}`;

    const payload = {
      source: source,
      platform: platform,
      conversation_id: convId,
      url: url,
      page_title: pageTitle,
      captured_at: capturedAt,
      message_index: index,
      role: msg.role,
      content_hash: contentHash,
      project: 'centalcontext',
      type: 'ai_conversation_snapshot',
      content: formattedContent,
      file_name: `${platform}_${convId}.md`,
      extension: '.md',
      quality_score: 5,
      memory_priority: 'high',
      file_path: url
    };

    return new Promise((resolve) => {
      if (!isContextValid()) {
        resolve({ success: false, error: 'Context invalidated' });
        return;
      }
      try {
        chrome.runtime.sendMessage({ action: 'post_log', payload }, (response) => {
          try {
            if (!isContextValid()) {
              resolve({ success: false, error: 'Context invalidated' });
              return;
            }
            if (chrome.runtime.lastError) {
              console.log(`[CentralContext] post failed: ${chrome.runtime.lastError.message}`);
              resolve({ success: false, error: chrome.runtime.lastError.message });
              return;
            }
            if (response && response.success) {
              console.log(`[CentralContext] post success (Index: ${index})`);
              resolve({ success: true });
            } else {
              const errMsg = response ? response.error : 'Unknown error';
              console.log(`[CentralContext] post failed: ${errMsg}`);
              resolve({ success: false, error: errMsg });
            }
          } catch (cbErr) {
            resolve({ success: false, error: cbErr.message });
          }
        });
      } catch (e) {
        resolve({ success: false, error: e.message });
      }
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function runBodyFallbackScan() {
  try {
    const isDebug = localStorage.getItem('DEBUG_BROWSER_CAPTURE') === 'true';
    if (!isDebug) return;

    const bodyText = document.body.innerText || '';
    if (bodyText.includes('REAL_CHATGPT_DOM_CAPTURE_003') || bodyText.includes('REAL_GEMINI_DOM_CAPTURE_001')) {
      console.log(`[CentralContext] [DEBUG] fallback token detected, sending snapshot`);
      postSingleMessage({ role: 'unknown', content: bodyText }, -1, 'browser_page_snapshot_test');
    }
  } catch (e) {}
}

async function scrapeAll() {
  if (!isContextValid()) return;

  try {
    const platform = getPlatform();
    if (platform === 'unknown') return;

    console.log(`[CentralContext] scanning stream messages on ${platform}`);
    const messages = parseMessages(false);
    const convId = window.location.pathname.split('/').pop() || 'main';

    // Find the maximum user index in parsed messages
    const maxUserIndex = messages.reduce((max, msg, idx) => {
      return msg.role === 'user' ? Math.max(max, idx) : max;
    }, -1);

    for (let i = 0; i < messages.length; i++) {
      if (!isContextValid()) return;
      const msg = messages[i];
      const key = `${platform}_${convId}_${i}_${msg.role}`;
      const contentHash = await sha256(msg.content);

      if (lastPostedMessageHashes[key] === contentHash) {
        // Already successfully posted this exact message state
        continue;
      }

      if (msg.role === 'user') {
        // User message: POST immediately
        const result = await postSingleMessage(msg, i, 'browser_chat');
        if (result.success || result.skipped) {
          lastPostedMessageHashes[key] = contentHash;
        }
      } else if (msg.role === 'assistant') {
        // Assistant message: Debounce during streaming
        const hasUserMessageAfter = maxUserIndex > i;

        if (hasUserMessageAfter) {
          // If a new user message exists after this assistant response, flush immediately
          if (assistantDebounceTimers[key]) {
            clearTimeout(assistantDebounceTimers[key]);
            delete assistantDebounceTimers[key];
          }
          delete pendingAssistantMessages[key];

          const result = await postSingleMessage(msg, i, 'browser_chat');
          if (result.success || result.skipped) {
            lastPostedMessageHashes[key] = contentHash;
          }
        } else {
          // Debounce logic for assistant message
          const currentPending = pendingAssistantMessages[key];
          
          if (!currentPending || currentPending.content !== msg.content) {
            pendingAssistantMessages[key] = {
              content: msg.content,
              hash: contentHash,
              index: i,
              lastUpdated: Date.now()
            };

            if (assistantDebounceTimers[key]) {
              clearTimeout(assistantDebounceTimers[key]);
            }

            assistantDebounceTimers[key] = setTimeout(async () => {
              if (!isContextValid()) return;
              const latestPending = pendingAssistantMessages[key];
              if (latestPending) {
                const result = await postSingleMessage({ role: 'assistant', content: latestPending.content }, latestPending.index, 'browser_chat');
                if (result.success || result.skipped) {
                  lastPostedMessageHashes[key] = latestPending.hash;
                }
                delete pendingAssistantMessages[key];
                delete assistantDebounceTimers[key];
              }
            }, 3000); // 3 seconds debounce
          }
        }
      } else {
        // General fallback roles
        const result = await postSingleMessage(msg, i, 'browser_chat');
        if (result.success || result.skipped) {
          lastPostedMessageHashes[key] = contentHash;
        }
      }
    }
    
    runBodyFallbackScan();
  } catch (e) {
    console.log('[CentralContext] ScrapeAll failed gracefully:', e.message);
  }
}

async function triggerBackfill(source, onlyVisible = false) {
  if (!isContextValid()) return;

  try {
    console.log(`[CentralContext] starting backfill operation: source=${source}, onlyVisible=${onlyVisible}`);
    const messages = parseMessages(onlyVisible);
    console.log(`[CentralContext] parsed ${messages.length} messages for backfill`);

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < messages.length; i++) {
      if (!isContextValid()) return;
      const result = await postSingleMessage(messages[i], i, source);
      if (result.skipped) {
        skippedCount++;
      } else if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    console.log(`[CentralContext] backfill done. Success: ${successCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
    
    if (isContextValid()) {
      try {
        chrome.runtime.sendMessage({
          action: 'backfill_result',
          successCount,
          skippedCount,
          errorCount,
          totalCount: messages.length
        });
      } catch (e) {}
    }
  } catch (e) {
    console.log('[CentralContext] Backfill failed gracefully:', e.message);
  }
}

async function triggerDebugSnapshot() {
  if (!isContextValid()) return;

  try {
    console.log('[CentralContext] triggering manual debug snapshot');
    const bodyText = document.body.innerText || '';
    const result = await postSingleMessage({ role: 'debug', content: bodyText }, -1, 'browser_chat_debug');
    
    if (isContextValid()) {
      try {
        chrome.runtime.sendMessage({
          action: 'debug_result',
          statusText: result.success ? 'Debug snapshot captured and uploaded successfully!' : `Debug capture failed: ${result.error || 'Unknown error'}`,
          isError: !result.success
        });
      } catch (e) {}
    }
  } catch (e) {}
}

// 3. Inject CentralContext Pack directly to active page textbox
function injectPackText(packText) {
  try {
    const platform = getPlatform();
    let inputEl = null;

    if (platform === 'chatgpt') {
      inputEl = document.getElementById('prompt-textarea') || 
                document.querySelector('textarea[placeholder*="ChatGPT"]') || 
                document.querySelector('div[contenteditable="true"]');
    } else if (platform === 'gemini') {
      inputEl = document.querySelector('rich-textarea div[contenteditable="true"]') || 
                document.querySelector('div[role="textbox"]') || 
                document.querySelector('textarea');
    } else if (platform === 'claude') {
      inputEl = document.querySelector('div[role="textbox"]') || 
                document.querySelector('div[contenteditable="true"]') || 
                document.querySelector('textarea');
    } else {
      inputEl = document.querySelector('textarea') || document.querySelector('[contenteditable="true"]');
    }

    if (!inputEl) {
      return false;
    }

    // Get current textbox value/content
    let currentVal = '';
    const isInputOrTextarea = inputEl.tagName.toLowerCase() === 'textarea' || inputEl.tagName.toLowerCase() === 'input';
    if (isInputOrTextarea) {
      currentVal = inputEl.value || '';
    } else {
      currentVal = inputEl.innerText || '';
    }
    currentVal = currentVal.trim();

    // Safety Guards (Yêu cầu 8)
    if (currentVal.length > 0 && !currentVal.includes('CENTRALCONTEXT AGENT CONTEXT PACK')) {
      console.log('[CentralContext] Safety check: Textbox already contains text. Injection skipped.');
      return true; // Return true to stop the retry loop since it is an intentional skip
    }

    if (currentVal.includes('CENTRALCONTEXT AGENT CONTEXT PACK') || currentVal.includes('--- CONTEXT PACK CONTENT ---')) {
      console.log('[CentralContext] Safety check: Context Pack already exists in textbox. Injection skipped.');
      return true; // Return true to stop the retry loop
    }

    // Set reentrancy lock (Yêu cầu 3)
    isExtensionMutating = true;

    // Populate textbox once and dispatch input event once (Yêu cầu 5)
    if (isInputOrTextarea) {
      inputEl.value = packText;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      inputEl.innerText = packText;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.focus();
    }

    // Release lock after 500ms cooldown (Yêu cầu 3)
    setTimeout(() => {
      isExtensionMutating = false;
    }, 500);

    console.log('[CentralContext] Successfully injected pack into active prompt input.');
    return true;
  } catch (err) {
    isExtensionMutating = false;
    console.error('[CentralContext] Ingestion populate failed:', err.message);
    return false;
  }
}

// Retry loop to search for textbox as page renders
function retryInjectPackText(packText, retriesLeft = 20) {
  if (retriesLeft <= 0) {
    console.error('[CentralContext] Failed to locate textbox after 10s.');
    return;
  }
  const success = injectPackText(packText);
  if (!success) {
    setTimeout(() => {
      retryInjectPackText(packText, retriesLeft - 1);
    }, 500);
  }
}

// Check and auto-inject pack on page startup if scheduled
function checkAndAutoInjectOnLoad() {
  if (!isContextValid()) return;
  try {
    chrome.storage.local.get(['should_inject_on_load'], (result) => {
      if (!isContextValid() || !result) return;
      if (result.should_inject_on_load === true) {
        chrome.storage.local.set({ should_inject_on_load: false }, () => {
          console.log('[CentralContext] should_inject_on_load detected. Pulling pack...');
          chrome.runtime.sendMessage({ action: 'get_context_pack' }, (response) => {
            if (!isContextValid() || !response || !response.success) {
              console.error('[CentralContext] Failed to fetch pack on load');
              return;
            }
            retryInjectPackText(response.pack);
          });
        });
      }
    });
  } catch (e) {
    console.error('[CentralContext] Auto-inject trigger failed:', e.message);
  }
}

// Listen for action messages from Extension Popup UI
if (isContextValid()) {
  try {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (!isContextValid()) return false;
      try {
        if (request.action === 'capture_current_conversation') {
          triggerBackfill('browser_chat_backfill', false);
          sendResponse({ success: true });
        } else if (request.action === 'capture_visible_messages') {
          triggerBackfill('browser_chat_backfill', true);
          sendResponse({ success: true });
        } else if (request.action === 'capture_debug_snapshot') {
          triggerDebugSnapshot();
          sendResponse({ success: true });
        } else if (request.action === 'inject_context_pack') {
          chrome.runtime.sendMessage({ action: 'get_context_pack' }, async (response) => {
            if (!isContextValid()) {
              sendResponse({ success: false, error: 'Context invalidated' });
              return;
            }
            if (response && response.success) {
              const packText = response.pack;
              const packHash = await sha256(packText);
              const currentUrl = window.location.href;
              const success = injectPackText(packText);
              if (success) {
                chrome.storage.local.set({
                  centralcontext_last_injected_hash: packHash,
                  centralcontext_last_injected_length: packText.length,
                  centralcontext_last_injected_url: currentUrl
                }, () => {
                  sendResponse({ success: true });
                });
              } else {
                sendResponse({ success: false, error: 'Inject execution failed' });
              }
            } else {
              sendResponse({ success: false, error: response ? response.error : 'Failed to fetch pack' });
            }
          });
          return true; // async
        } else if (request.action === 'force_auto_inject') {
          chrome.runtime.sendMessage({ action: 'get_context_pack' }, async (response) => {
            if (!isContextValid()) {
              sendResponse({ success: false, error: 'Context invalidated' });
              return;
            }
            if (response && response.success) {
              const packText = response.pack;
              const packHash = await sha256(packText);
              const currentUrl = window.location.href;
              const platform = getPlatform();

              let inputEl = null;
              if (platform === 'chatgpt') {
                inputEl = document.getElementById('prompt-textarea') || 
                          document.querySelector('textarea[placeholder*="ChatGPT"]') || 
                          document.querySelector('div[contenteditable="true"]');
              } else if (platform === 'gemini') {
                inputEl = document.querySelector('rich-textarea div[contenteditable="true"]') || 
                          document.querySelector('div[role="textbox"]') || 
                          document.querySelector('textarea');
              } else if (platform === 'claude') {
                inputEl = document.querySelector('div[role="textbox"]') || 
                          document.querySelector('div[contenteditable="true"]') || 
                          document.querySelector('textarea');
              }

              if (!inputEl) {
                sendResponse({ success: false, error: 'Textbox not found' });
                return;
              }

              let currentVal = '';
              if (inputEl.tagName && (inputEl.tagName.toLowerCase() === 'textarea' || inputEl.tagName.toLowerCase() === 'input')) {
                currentVal = inputEl.value || '';
              } else {
                currentVal = inputEl.innerText || '';
              }
              currentVal = currentVal.trim();

              const isDirty = currentVal.length > 0 && currentVal !== packText.trim();
              if (isDirty) {
                sendResponse({ success: false, error: 'Textbox contains user typing' });
                return;
              }

              const success = injectPackText(packText);
              if (success) {
                console.log(`[CentralContext] auto injected pack length=${packText.length} hash=${packHash}`);
                
                chrome.storage.local.get(['centralcontext_injected_urls'], (res) => {
                  const injectedUrls = res.centralcontext_injected_urls || {};
                  injectedUrls[currentUrl] = packHash;
                  chrome.storage.local.set({
                    centralcontext_injected_urls: injectedUrls,
                    centralcontext_last_injected_hash: packHash,
                    centralcontext_last_injected_length: packText.length,
                    centralcontext_last_injected_url: currentUrl
                  }, () => {
                    sendResponse({ success: true });
                  });
                });
              } else {
                sendResponse({ success: false, error: 'Inject execution failed' });
              }
            } else {
              sendResponse({ success: false, error: response ? response.error : 'Failed to fetch pack' });
            }
          });
          return true; // async
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    });
  } catch (e) {}
}

function isNewChatUrl() {
  try {
    const pathname = window.location.pathname;
    const platform = getPlatform();
    if (platform === 'chatgpt') {
      return pathname === '/' || pathname.startsWith('/?');
    } else if (platform === 'gemini') {
      return pathname === '/app' || pathname === '/app/';
    } else if (platform === 'claude') {
      return pathname === '/new' || pathname === '/new/' || pathname === '/chat' || pathname === '/chats';
    }
  } catch (e) {}
  return false;
}

// MutationObserver configuration for automatic logging and auto-injection checks
let lastCheckedUrl = '';
let hasAttemptedAutoInject = false;

function checkAutoInjectTrigger() {
  if (!isContextValid()) return;

  const currentUrl = window.location.href;
  const platform = getPlatform();
  
  if (platform === 'unknown') return;

  if (currentUrl !== lastCheckedUrl) {
    lastCheckedUrl = currentUrl;
    hasAttemptedAutoInject = false;
  }

  if (hasAttemptedAutoInject) return;

  try {
    chrome.storage.local.get(['centralcontext_auto_inject_enabled', 'centralcontext_injected_urls'], async (result) => {
      if (!isContextValid()) return;
      if (hasAttemptedAutoInject) return; // double check inside callback

      const autoInjectEnabled = result.centralcontext_auto_inject_enabled === true;
      
      // Auto-inject is only supported when enabled (Yêu cầu 1, 7)
      if (!autoInjectEnabled) return;

      // Do not auto-inject on old conversations (Yêu cầu 2)
      if (!isNewChatUrl()) {
        return;
      }

      hasAttemptedAutoInject = true; // prevent duplicate parallel calls

      chrome.runtime.sendMessage({ action: 'get_context_pack' }, async (response) => {
        if (!isContextValid()) return;
        if (!response || !response.success) {
          console.warn('[CentralContext] Auto-inject aborted: Local API is unavailable.');
          hasAttemptedAutoInject = false; // retry next time
          return;
        }

        const packText = response.pack;
        const packHash = await sha256(packText);
        const injectedUrls = result.centralcontext_injected_urls || {};

        // Check if already injected with the current pack version
        if (injectedUrls[currentUrl] === packHash) {
          console.log('[CentralContext] Auto-inject skipped: already injected for this URL.');
          return;
        }

        // Locate prompt textarea element
        let inputEl = null;
        if (platform === 'chatgpt') {
          inputEl = document.getElementById('prompt-textarea') || 
                    document.querySelector('textarea[placeholder*="ChatGPT"]') || 
                    document.querySelector('div[contenteditable="true"]');
        } else if (platform === 'gemini') {
          inputEl = document.querySelector('rich-textarea div[contenteditable="true"]') || 
                    document.querySelector('div[role="textbox"]') || 
                    document.querySelector('textarea');
        } else if (platform === 'claude') {
          inputEl = document.querySelector('div[role="textbox"]') || 
                    document.querySelector('div[contenteditable="true"]') || 
                    document.querySelector('textarea');
        }

        if (!inputEl) {
          // Element not rendered yet, reset flag so MutationObserver retries when DOM renders it
          hasAttemptedAutoInject = false;
          return;
        }

        // Get textbox text content safely
        let currentVal = '';
        if (inputEl.tagName && (inputEl.tagName.toLowerCase() === 'textarea' || inputEl.tagName.toLowerCase() === 'input')) {
          currentVal = inputEl.value || '';
        } else {
          currentVal = inputEl.innerText || '';
        }
        currentVal = currentVal.trim();

        // Safe to inject if textbox is empty OR already populated with identical pack text
        const isDirty = currentVal.length > 0 && currentVal !== packText.trim();
        if (isDirty) {
          console.log('[CentralContext] Auto-inject skipped: Textbox contains user typing.');
          return;
        }

        // Inject pack text natively
        const success = injectPackText(packText);
        if (success) {
          console.log(`[CentralContext] auto injected pack length=${packText.length} hash=${packHash}`);
          injectedUrls[currentUrl] = packHash;
          chrome.storage.local.set({
            centralcontext_injected_urls: injectedUrls,
            centralcontext_last_injected_hash: packHash,
            centralcontext_last_injected_length: packText.length,
            centralcontext_last_injected_url: currentUrl
          }, () => {
            console.log('[CentralContext] Auto-inject succeeded for:', currentUrl);
          });
        } else {
          hasAttemptedAutoInject = false; // retry if inject script failed
        }
      });
    });
  } catch (err) {
    hasAttemptedAutoInject = false;
  }
}

// Throttled scrapeAll function to rate limit log capturing to once every 2 seconds (Yêu cầu 6)
let lastScrapeTime = 0;
let scrapeTimeout = null;

function throttledScrapeAll() {
  const now = Date.now();
  if (now - lastScrapeTime < 2000) {
    if (scrapeTimeout) clearTimeout(scrapeTimeout);
    scrapeTimeout = setTimeout(() => {
      lastScrapeTime = Date.now();
      scrapeAll();
    }, 2000 - (now - lastScrapeTime));
    return;
  }
  lastScrapeTime = now;
  scrapeAll();
}

let isObservingMain = false;

function setupObserver() {
  if (!isContextValid()) return;
  try {
    const mainNode = document.querySelector('main');
    const targetNode = mainNode || document.body;
    
    if (observer) {
      observer.disconnect();
    }
    
    observer.observe(targetNode, { childList: true, subtree: true });
    isObservingMain = !!mainNode;
    console.log(`[CentralContext] Observing chat flow on: ${targetNode.tagName.toLowerCase()}`);
  } catch (e) {
    console.error('[CentralContext] Observer setup failed:', e.message);
  }
}

observer = new MutationObserver((mutations) => {
  if (!isContextValid()) return;
  
  // Reentrancy lock check: ignore DOM changes caused by extension itself (Yêu cầu 3)
  if (isExtensionMutating) {
    return;
  }

  try {
    let hasNewNode = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        hasNewNode = true;
        break;
      }
    }
    if (hasNewNode) {
      throttledScrapeAll();
      checkAutoInjectTrigger(); // continuously check for textbox rendering
      
      // Transition from body to main container if it becomes available (Yêu cầu 6)
      if (!isObservingMain && document.querySelector('main')) {
        setupObserver();
      }
    }
  } catch (e) {}
});

// Load sequence
throttledScrapeAll();
setupObserver();
if (isContextValid()) {
  try {
    // Check and run manual load triggers
    checkAndAutoInjectOnLoad();
    // Run automated trigger sequence
    checkAutoInjectTrigger();
  } catch (e) {}
}

