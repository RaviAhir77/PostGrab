/**
 * PostGrab Background Worker
 * Handles toolbar action clicks to toggle the persistent in-page sidebar on LinkedIn.
 */

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id || !tab.url) return;

  if (!tab.url.includes('linkedin.com')) {
    // If not on LinkedIn, open LinkedIn feed
    chrome.tabs.create({ url: 'https://www.linkedin.com/feed/' });
    return;
  }

  try {
    // Try sending toggle message to existing content script
    await chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' });
  } catch (err) {
    // If content script is not yet injected (e.g. pre-existing tab), inject it on the fly
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['scripts/content.css']
      });

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['scripts/extractor.js', 'scripts/content.js']
      });

      // Send toggle message after injection
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' }).catch(() => {});
      }, 100);
    } catch (injectionErr) {
      console.warn('Could not inject content script:', injectionErr);
    }
  }
});

// Proxy drafting requests through background worker to bypass mixed content (HTTPS webpage calling HTTP server)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'createDraftOnServer') {
    const cleanServerUrl = (msg.serverUrl || 'http://103.138.96.132:7777').replace(/\/+$/, '');
    const endpoint = `${cleanServerUrl}/api/create-draft`;

    console.log('[PostGrab Background] Forwarding draft creation to:', endpoint);

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post: msg.post })
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          sendResponse({ success: true, data });
        } else {
          sendResponse({ success: false, error: data.error || `Server responded with status ${res.status}` });
        }
      })
      .catch((err) => {
        console.error('[PostGrab Background] Fetch error:', err);
        sendResponse({ success: false, error: err.message || 'Cannot reach server' });
      });

    return true; // Keep message channel open for async response
  }
});

