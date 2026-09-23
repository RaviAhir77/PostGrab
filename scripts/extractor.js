/**
 * Safe, ultra-fast read-only LinkedIn Visible Post Extractor.
 * Optimized for low CPU and minimal memory overhead.
 */

window.__postgrab_extractVisiblePosts = () => {
  try {
    if (!window.location.hostname.includes('linkedin.com') || document.hidden) {
      return { success: false, error: 'Not active' };
    }

    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;

    // Fast 32-bit integer string hash (deterministic, low memory)
    const generateStableId = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      return 'post_' + Math.abs(hash).toString(36);
    };

    // 1. Find post text containers using LinkedIn's feed and search attributes
    const targetBoxes = document.querySelectorAll(
      '[data-testid="expandable-text-box"], [data-testid="update-text"], .feed-shared-update-v2__description, .feed-shared-inline-show-more-text, .update-components-text, .feed-shared-text-view, [data-test-id="main-feed-activity-card__commentary"]'
    );

    if (!targetBoxes || targetBoxes.length === 0) {
      return { success: true, posts: [], error: 'No post elements found' };
    }

    const posts = [];

    // 2. Scan elements - break early once past visible viewport
    for (let i = 0; i < targetBoxes.length; i++) {
      const el = targetBoxes[i];
      const rect = el.getBoundingClientRect();

      // Skip elements that are above the visible window
      if (rect.bottom < 40) continue;

      // Break early if we've passed below the visible screen
      if (rect.top > windowHeight - 40) {
        if (posts.length > 0) break;
      }

      // Check horizontal bounds
      if (rect.left > windowWidth || rect.right < 0) continue;

      let text = el.innerText || '';
      text = text.replace(/…\s*more|\.\.\.\s*more/gi, '').trim();
      if (!text || text.length < 10) continue;

      // Find enclosing container (max 10 levels up)
      let container = el.parentElement;
      for (let lvl = 0; lvl < 10 && container && container !== document.body; lvl++) {
        if (
          container.querySelector('a[href*="/in/"]') ||
          (container.querySelector('h2') && container.querySelector('h2').textContent.includes('Feed post'))
        ) {
          break;
        }
        container = container.parentElement;
      }
      if (!container) container = el.parentElement;

      // Extract author
      let author = 'LinkedIn User';
      let authorUrl = '';

      const profileImg = container.querySelector('img[alt*="profile"], img[alt*="Profile"]');
      if (profileImg && profileImg.alt) {
        const match = profileImg.alt.match(/View (.*?)’s profile/i) || profileImg.alt.match(/View (.*?)'s profile/i);
        if (match && match[1]) author = match[1].trim();
      }

      const authorAnchor = container.querySelector('a[href*="/in/"]');
      if (authorAnchor) {
        authorUrl = authorAnchor.href.split('?')[0];
        if (author === 'LinkedIn User') {
          const aria = authorAnchor.getAttribute('aria-label') || '';
          if (aria) {
            author = aria.split('Profile')[0].trim();
          } else if (authorAnchor.innerText && authorAnchor.innerText.trim()) {
            author = authorAnchor.innerText.trim().split('\n')[0];
          }
        }
      }

      // Extract email & job link
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const email = emailMatch ? emailMatch[0] : '';

      let jobLink = '';
      const jobAnchor = container.querySelector('a[href*="/jobs/view/"]');
      if (jobAnchor && jobAnchor.href) jobLink = jobAnchor.href.split('?')[0];

      const stableKey = (authorUrl || author) + '::' + text.slice(0, 60);
      const id = generateStableId(stableKey);

      posts.push({
        id,
        author,
        authorUrl,
        content: text,
        email,
        jobLink,
        extractedAt: new Date().toISOString()
      });

      // We only ever display 2-3 posts on screen at a time
      if (posts.length >= 3) break;
    }

    return {
      success: true,
      totalVisible: posts.length,
      posts
    };
  } catch (err) {
    console.error('[PostGrab Extractor] Exception during post extraction:', err);
    return { success: false, posts: [], error: String(err) };
  }
};
