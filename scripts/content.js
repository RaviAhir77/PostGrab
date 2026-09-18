/**
 * PostGrab Content Script (Fast & Bulletproof Auto-Sync)
 */
(() => {
  if (window.__postgrab_injected) return;
  window.__postgrab_injected = true;

  let isOpen = false;
  let isAutoSyncActive = true;
  let scrollThrottleTimer = null;
  let lastScannedPostIds = '';

  // 1. Create Sidebar Container
  const container = document.createElement('div');
  container.id = 'postgrab-sidebar-container';

  const iframe = document.createElement('iframe');
  iframe.id = 'postgrab-sidebar-iframe';
  iframe.src = chrome.runtime.getURL('popup/popup.html');
  iframe.allow = 'clipboard-write';

  container.appendChild(iframe);
  document.documentElement.appendChild(container);

  // 2. Create Floating Toggle Handle
  const floatingToggle = document.createElement('div');
  floatingToggle.id = 'postgrab-floating-toggle';
  floatingToggle.title = 'Click to open PostGrab Sidebar';
  floatingToggle.innerHTML = `
    <span style="display:flex;align-items:center;font-size:14px;">📑</span>
    <span>PostGrab</span>
  `;
  document.documentElement.appendChild(floatingToggle);

  const isValidContext = () => {
    return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
  };

  const cleanupIfInvalid = () => {
    if (!isValidContext()) {
      window.removeEventListener('scroll', handleUserScroll, { capture: true });
      document.removeEventListener('scroll', handleUserScroll, { capture: true });
      window.removeEventListener('wheel', handleUserScroll);
      window.removeEventListener('touchmove', handleUserScroll);
      return true;
    }
    return false;
  };

  // 3. Scan & Broadcast Posts
  const runScan = () => {
    if (!isAutoSyncActive) return;
    if (cleanupIfInvalid()) return;
    if (!window.__postgrab_extractVisiblePosts) return;

    window.requestAnimationFrame(() => {
      if (cleanupIfInvalid()) return;
      const result = window.__postgrab_extractVisiblePosts();
      if (!result || !result.success || !result.posts || result.posts.length === 0) return;

      const currentIds = result.posts.map(p => p.id).join('|');
      if (currentIds === lastScannedPostIds) return; // Skip if no change

      lastScannedPostIds = currentIds;

      // 1. Post to Iframe Sidebar
      if (iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage({
            action: 'livePostsUpdate',
            posts: result.posts
          }, '*');
        } catch (_) {}
      }

      // 2. Broadcast to Extension Popup (if open)
      try {
        if (isValidContext()) {
          chrome.runtime.sendMessage({
            action: 'livePostsUpdate',
            posts: result.posts
          }).catch(() => {}); // Catch if popup is closed
        }
      } catch (_) {}
    });
  };

  // Toggle Function
  const toggleSidebar = (state) => {
    isOpen = typeof state === 'boolean' ? state : !isOpen;
    if (isOpen) {
      container.classList.add('open');
      floatingToggle.classList.add('hidden');
      lastScannedPostIds = '';
      setTimeout(runScan, 100);
    } else {
      container.classList.remove('open');
      floatingToggle.classList.remove('hidden');
    }
  };

  floatingToggle.addEventListener('click', () => {
    toggleSidebar(true);
  });

  // 4. Capture ALL scroll and wheel events anywhere on the page (capture: true)
  const handleUserScroll = () => {
    if (!isAutoSyncActive) return;
    if (cleanupIfInvalid()) return;

    if (!scrollThrottleTimer) {
      scrollThrottleTimer = setTimeout(() => {
        scrollThrottleTimer = null;
        runScan();
      }, 300);
    }
  };

  window.addEventListener('scroll', handleUserScroll, { passive: true, capture: true });
  document.addEventListener('scroll', handleUserScroll, { passive: true, capture: true });
  window.addEventListener('wheel', handleUserScroll, { passive: true });
  window.addEventListener('touchmove', handleUserScroll, { passive: true });

  // 5. Listen for Messages from Extension Background Worker
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'toggleSidebar') {
      toggleSidebar();
      sendResponse({ success: true, isOpen });
    }
  });

  // 6. Listen for Messages from the Iframe
  window.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.action === 'closePostGrabSidebar') {
      toggleSidebar(false);
    } else if (event.data.action === 'requestManualScan') {
      lastScannedPostIds = '';
      runScan();
    } else if (event.data.action === 'setAutoSync') {
      isAutoSyncActive = !!event.data.enabled;
      if (isAutoSyncActive) {
        lastScannedPostIds = '';
        runScan();
      }
    }
  });
})();
