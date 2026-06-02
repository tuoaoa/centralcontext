/**
 * CentralContext Browser Capture - Page Context Injector
 * apps/browser-extension/inject.js
 *
 * Runs in the MAIN world to expose helper functions directly to the page's execution context.
 */

(function() {
  try {
    window.debugInject = function(customText) {
      console.log('[CentralContext] [DEBUG] debugInject() triggered from page console.');
      const event = new CustomEvent('CentralContextDebugInject', { detail: { text: customText } });
      window.dispatchEvent(event);
      return "Debug inject event dispatched to content script!";
    };
    console.log('[CentralContext] Exposed debugInject to page context.');
  } catch (e) {
    console.error('[CentralContext] Failed to expose debugInject to page context:', e);
  }
})();
