/**
 * PostGrab Privacy Shield (Runs in MAIN world at document_start)
 * 
 * Intercepts third-party extension fingerprinting probes on LinkedIn (e.g. abp-detection).
 * Prevents LinkedIn's internal scripts from spamming the console with:
 * "GET chrome-extension://invalid/ net::ERR_FAILED"
 */
(() => {
  try {
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = function (input, init) {
        try {
          let url = '';
          if (typeof input === 'string') {
            url = input;
          } else if (input && typeof input.url === 'string') {
            url = input.url;
          }

          // If LinkedIn is probing for chrome-extension:// IDs, block at JS level
          // to prevent Chromium from issuing failed network requests and polluting the console.
          if (url && url.startsWith('chrome-extension://')) {
            return Promise.reject(new TypeError('Failed to fetch'));
          }
        } catch (_) {}

        return originalFetch.apply(this, arguments);
      };
    }
  } catch (_) {}
})();
