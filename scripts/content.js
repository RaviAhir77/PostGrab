/**
 * PostGrab Content Script (Option B: Zero-Iframe Shadow DOM Companion Drawer)
 * 100% immune to "chrome-extension://invalid/" loops and mixed content restrictions.
 * Preserves the exact overlay UX and floating toggle on both desktop and mobile (Kiwi Browser).
 */
(() => {
  const isValidContext = () => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return false;
      return true;
    } catch (e) {
      return false;
    }
  };

  if (!isValidContext()) return;

  // Clean up any zombie containers from previous extension reloads
  const staleContainer = document.getElementById('postgrab-sidebar-container');
  if (staleContainer) staleContainer.remove();
  const staleToggle = document.getElementById('postgrab-floating-toggle');
  if (staleToggle) staleToggle.remove();

  // Storage Keys
  const STORAGE_KEY = 'postgrab_saved_posts';
  const DRAFTED_KEY = 'postgrab_drafted_posts';
  const SERVER_URL_KEY = 'postgrab_server_url';

  // State
  let isOpen = false;
  let isAutoSyncEnabled = true;
  let visiblePosts = [];
  let savedPosts = [];
  let draftedPostIds = new Set();
  let serverUrl = 'http://103.138.96.132:7777';
  let searchQuery = '';
  let lastScannedPostIds = '';
  let scrollThrottleTimer = null;

  // 1. Create Host Container
  const container = document.createElement('div');
  container.id = 'postgrab-sidebar-container';

  // 2. Attach Shadow DOM (Complete CSS isolation from LinkedIn)
  const shadow = container.attachShadow({ mode: 'open' });

  // 3. Floating Toggle Handle on LinkedIn Page
  const floatingToggle = document.createElement('div');
  floatingToggle.id = 'postgrab-floating-toggle';
  floatingToggle.title = 'Click to open PostGrab Sidebar';
  floatingToggle.innerHTML = `
    <span style="display:flex;align-items:center;font-size:14px;">📑</span>
    <span>PostGrab</span>
  `;

  // 4. Inject Shadow DOM Styles & HTML Structure
  const styles = `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    .app-container {
      --bg-main: #0a0e17;
      --bg-surface: #111827;
      --bg-card: #151f32;
      --bg-card-hover: #1c2a44;
      --bg-input: #0c121e;
      
      --border-subtle: #1e2a40;
      --border-focus: #38bdf8;
      
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --text-faint: #64748b;
      
      --accent-blue: #38bdf8;
      --accent-cyan: #06b6d4;
      --accent-emerald: #10b981;
      --accent-amber: #f59e0b;
      --accent-rose: #f43f5e;
      
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 14px;

      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      background-color: var(--bg-main);
      color: var(--text-main);
      font-size: 13px;
      overflow: hidden;
      box-shadow: -8px 0 32px rgba(0, 0, 0, 0.6);
      border-left: 1px solid var(--border-subtle);
    }

    /* Header */
    .app-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background-color: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-icon {
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      background: linear-gradient(135deg, #0284c7, #06b6d4);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      box-shadow: 0 2px 8px rgba(6, 182, 212, 0.3);
    }

    .brand-title {
      font-size: 14px;
      font-weight: 700;
      color: #fff;
    }

    .brand-tag {
      font-size: 10px;
      font-weight: 600;
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent-blue);
      padding: 2px 6px;
      border-radius: 99px;
      margin-left: 4px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 99px;
      font-weight: 500;
    }

    .status-badge .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }

    .status-badge.connected {
      background: rgba(16, 185, 129, 0.12);
      color: #34d399;
    }
    .status-badge.connected .dot {
      background: #10b981;
    }

    .status-badge.checking {
      background: rgba(245, 158, 11, 0.12);
      color: #fbbf24;
    }
    .status-badge.checking .dot {
      background: #f59e0b;
    }

    .status-badge.disconnected {
      background: rgba(148, 163, 184, 0.12);
      color: #94a3b8;
    }
    .status-badge.disconnected .dot {
      background: #64748b;
    }

    .btn-dock {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      padding: 5px 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .btn-dock:hover {
      color: #fff;
      background: rgba(56, 189, 248, 0.15);
      border-color: var(--accent-blue);
    }

    /* Nav Tabs */
    .nav-tabs {
      display: flex;
      background-color: var(--bg-surface);
      padding: 0 16px 10px 16px;
      gap: 6px;
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }

    .nav-tab {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 10px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .nav-tab:hover {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.04);
    }

    .nav-tab.active {
      color: #fff;
      background: rgba(56, 189, 248, 0.12);
      border-color: rgba(56, 189, 248, 0.25);
      font-weight: 600;
    }

    .count-pill {
      font-size: 10px;
      background: var(--bg-card);
      color: var(--accent-blue);
      padding: 1px 6px;
      border-radius: 99px;
      font-weight: 700;
    }

    /* Panes */
    .tab-pane {
      display: none;
      flex: 1;
      overflow-y: auto;
      padding: 14px 16px;
    }

    .tab-pane.active {
      display: flex;
      flex-direction: column;
    }

    .pane-action-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-shrink: 0;
      gap: 8px;
    }

    .sync-status-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .pane-subtitle {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
    }

    /* Auto-Sync Toggle Switch */
    .toggle-switch-label {
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      user-select: none;
    }

    .toggle-switch-label input {
      display: none;
    }

    .toggle-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border-radius: 99px;
      font-size: 10px;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.12);
      color: var(--accent-emerald);
      border: 1px solid rgba(16, 185, 129, 0.25);
      transition: all 0.2s;
    }

    .live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-emerald);
      box-shadow: 0 0 6px var(--accent-emerald);
      animation: pulse 1.8s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    .toggle-switch-label input:not(:checked) + .toggle-pill {
      background: rgba(148, 163, 184, 0.1);
      color: var(--text-muted);
      border-color: rgba(148, 163, 184, 0.2);
    }

    .toggle-switch-label input:not(:checked) + .toggle-pill .live-dot {
      background: var(--text-faint);
      box-shadow: none;
      animation: none;
    }

    .btn-rescan {
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: var(--radius-sm);
      color: var(--accent-blue);
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .btn-rescan:hover {
      background: rgba(56, 189, 248, 0.16);
      border-color: var(--accent-blue);
    }

    /* Posts List */
    .posts-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
    }

    /* Post Card */
    .post-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 9px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: border-color 0.2s, box-shadow 0.2s;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    .post-card:hover {
      border-color: #334155;
    }

    .post-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }

    .author-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .author-name {
      font-size: 12.5px;
      font-weight: 600;
      color: #fff;
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 180px;
    }

    .author-name:hover {
      color: var(--accent-blue);
      text-decoration: underline;
    }

    .author-subrow {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 2px;
    }

    .badge-email {
      font-size: 9.5px;
      background: rgba(16, 185, 129, 0.14);
      color: var(--accent-emerald);
      padding: 1px 6px;
      border-radius: 99px;
      border: 1px solid rgba(16, 185, 129, 0.22);
      white-space: nowrap;
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .badge-job {
      font-size: 9.5px;
      background: rgba(56, 189, 248, 0.14);
      color: var(--accent-blue);
      padding: 1px 6px;
      border-radius: 99px;
      border: 1px solid rgba(56, 189, 248, 0.22);
      white-space: nowrap;
      text-decoration: none;
    }

    .badge-job:hover {
      background: rgba(56, 189, 248, 0.22);
      border-color: var(--accent-blue);
    }

    .post-card-bottom {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      padding-top: 2px;
    }

    .post-char-count {
      font-size: 9.5px;
      color: var(--text-faint);
    }

    .card-actions-right {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
    }

    .btn-location-pill {
      background: rgba(6, 182, 212, 0.12);
      color: #22d3ee;
      border: 1px solid rgba(6, 182, 212, 0.3);
      border-radius: var(--radius-sm);
      padding: 3px 6px;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      transition: all 0.15s ease;
      flex-shrink: 0;
      white-space: nowrap;
      user-select: none;
      line-height: 1.2;
    }

    .btn-location-pill:hover {
      transform: translateY(-1px);
      filter: brightness(1.2);
    }

    .btn-location-pill:active {
      transform: scale(0.95);
    }

    .btn-location-pill.city-rjk {
      background: rgba(245, 158, 11, 0.12);
      color: #fbbf24;
      border-color: rgba(245, 158, 11, 0.3);
    }

    .btn-location-pill.city-ahm {
      background: rgba(6, 182, 212, 0.15);
      color: #22d3ee;
      border-color: rgba(6, 182, 212, 0.35);
    }

    .btn-save-post {
      background: linear-gradient(135deg, #0284c7, #06b6d4);
      color: #fff;
      border: none;
      border-radius: var(--radius-sm);
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s;
      box-shadow: 0 2px 6px rgba(6, 182, 212, 0.2);
      flex-shrink: 0;
      white-space: nowrap;
    }

    .btn-save-post:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .btn-save-post.saved {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
      cursor: default;
      transform: none;
      box-shadow: none;
      padding: 3px 8px;
    }

    .btn-draft-email {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff;
      border: none;
      border-radius: var(--radius-sm);
      padding: 4px 9px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 2px 6px rgba(139, 92, 246, 0.25);
      flex-shrink: 0;
      white-space: nowrap;
    }

    .btn-draft-email:hover {
      opacity: 0.92;
      transform: translateY(-1px);
      box-shadow: 0 4px 10px rgba(139, 92, 246, 0.35);
    }

    .btn-draft-email.drafted {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
      cursor: default;
      transform: none;
      box-shadow: none;
    }

    .btn-draft-email.loading {
      background: rgba(99, 102, 241, 0.2);
      color: #a5b4fc;
      border: 1px solid rgba(99, 102, 241, 0.4);
      cursor: wait;
      transform: none;
      box-shadow: none;
    }

    .btn-draft-email.error {
      background: rgba(244, 63, 94, 0.15);
      color: #fb7185;
      border: 1px solid rgba(244, 63, 94, 0.3);
      cursor: pointer;
      box-shadow: none;
    }

    .post-text-content {
      background: rgba(12, 18, 30, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: var(--radius-sm);
      padding: 8px 10px;
      font-size: 11.5px;
      line-height: 1.5;
      color: #cbd5e1;
      max-height: 125px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .icon-btn {
      background: transparent;
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      cursor: pointer;
      padding: 5px 9px;
      border-radius: var(--radius-sm);
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      transition: all 0.15s;
    }

    .icon-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
      border-color: #334155;
    }

    .icon-btn.danger:hover {
      color: var(--accent-rose);
      background: rgba(244, 63, 94, 0.15);
      border-color: rgba(244, 63, 94, 0.3);
    }

    /* Search Box */
    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-input);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      margin-bottom: 14px;
      flex-shrink: 0;
    }

    .search-box svg {
      color: var(--text-muted);
    }

    .search-box input {
      background: transparent;
      border: none;
      outline: none;
      color: var(--text-main);
      font-size: 12px;
      width: 100%;
    }

    /* Loading & Empty States */
    .loading-state, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 50px 20px;
      color: var(--text-muted);
      flex: 1;
    }

    .spinner {
      width: 30px;
      height: 30px;
      border: 3px solid rgba(56, 189, 248, 0.2);
      border-top-color: var(--accent-blue);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 14px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty-icon {
      font-size: 34px;
      margin-bottom: 12px;
    }

    .empty-state h3 {
      color: var(--text-main);
      font-size: 15px;
      margin-bottom: 6px;
    }

    .empty-state p {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.5;
      margin-bottom: 16px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      text-decoration: none;
    }

    .btn-outline {
      background: transparent;
      border: 1px solid var(--border-subtle);
      color: var(--text-main);
    }

    .btn-outline:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: #334155;
    }

    .btn-danger-outline {
      background: transparent;
      border: 1px solid rgba(244, 63, 94, 0.3);
      color: var(--accent-rose);
    }

    .btn-danger-outline:hover {
      background: rgba(244, 63, 94, 0.1);
    }

    /* Export Tab */
    .stat-card.full-width {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 16px;
      text-align: center;
      margin-bottom: 16px;
      flex-shrink: 0;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: var(--accent-blue);
      display: block;
    }

    .stat-label {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 3px;
    }

    .export-actions-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .export-item {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .export-item-info h4 {
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 2px;
    }

    .export-item-info p {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.4;
    }

    .danger-item {
      border-color: rgba(244, 63, 94, 0.2);
    }

    .text-danger {
      color: #fb7185 !important;
    }

    /* Toast */
    .toast {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(60px);
      background: #1e293b;
      color: #fff;
      padding: 8px 18px;
      border-radius: 99px;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 4px 18px rgba(0,0,0,0.6);
      border: 1px solid #334155;
      opacity: 0;
      pointer-events: none;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 1000;
      white-space: nowrap;
    }

    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    /* Scrollbars */
    ::-webkit-scrollbar {
      width: 6px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: #1e293b;
      border-radius: 99px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #334155;
    }

    .hidden {
      display: none !important;
    }
  `;

  const template = `
    <style>${styles}</style>
    <div class="app-container">
      <!-- Header -->
      <header class="app-header">
        <div class="brand">
          <div class="brand-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div class="brand-text">
            <span class="brand-title">PostGrab</span>
            <span class="brand-tag">Visible Posts</span>
          </div>
        </div>
        <div class="header-actions">
          <div id="connectionStatus" class="status-badge checking">
            <span class="dot"></span>
            <span class="status-text">Scanning...</span>
          </div>
          <button id="btnCloseSidebar" class="btn-dock" title="Close Sidebar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </header>

      <!-- Navigation Tabs -->
      <nav class="nav-tabs">
        <button class="nav-tab active" data-tab="visible">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span>Visible</span>
          <span id="visibleCountBadge" class="count-pill">0</span>
        </button>
        <button class="nav-tab" data-tab="saved">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          <span>Saved</span>
          <span id="savedCountBadge" class="count-pill">0</span>
        </button>
        <button class="nav-tab" data-tab="export">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Export</span>
        </button>
      </nav>

      <!-- TAB 1: VISIBLE POSTS ON SCREEN -->
      <section id="tab-visible" class="tab-pane active">
        <div class="pane-action-bar">
          <div class="sync-status-group">
            <span class="pane-subtitle" id="visibleHeader">Visible on screen (0)</span>
            <label class="toggle-switch-label" title="Automatically update as you scroll">
              <input type="checkbox" id="toggleAutoSync" checked>
              <span class="toggle-pill">
                <span class="live-dot"></span>
                <span class="toggle-text">Auto-Sync ON</span>
              </span>
            </label>
          </div>
          <button id="btnRescan" class="btn-rescan" title="Rescan current viewport">
            🔄 Refresh
          </button>
        </div>

        <!-- Loading State -->
        <div id="detectLoading" class="loading-state">
          <div class="spinner"></div>
          <p>Scanning visible posts on your screen...</p>
        </div>

        <!-- No Posts Detected Warning -->
        <div id="detectNoPosts" class="empty-state hidden">
          <div class="empty-icon">🔍</div>
          <h3>No Visible Posts Found</h3>
          <p>Scroll down slightly on your LinkedIn feed, then click "Refresh".</p>
          <button id="btnRetryScan" class="btn btn-outline">
            🔄 Refresh Scan
          </button>
        </div>

        <!-- Visible Posts List Container -->
        <div id="visiblePostsList" class="posts-list hidden">
          <!-- Rendered dynamically -->
        </div>
      </section>

      <!-- TAB 2: SAVED POSTS DATABASE -->
      <section id="tab-saved" class="tab-pane">
        <div class="search-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" id="savedSearch" placeholder="Search saved posts or authors..." />
        </div>

        <!-- Saved Posts List -->
        <div id="savedPostsList" class="posts-list">
          <!-- Injected via JS -->
        </div>

        <!-- Empty State -->
        <div id="savedEmptyState" class="empty-state hidden">
          <div class="empty-icon">📂</div>
          <h3>No Saved Posts Yet</h3>
          <p>Switch to the "Visible Posts" tab to save text from any post on your screen.</p>
        </div>
      </section>

      <!-- TAB 3: EXPORT & TOOLS -->
      <section id="tab-export" class="tab-pane">
        <div class="stat-card full-width">
          <span class="stat-value" id="statSavedTotal">0</span>
          <span class="stat-label">Total Saved Posts</span>
        </div>

        <div class="export-actions-list">
          <div class="export-item">
            <div class="export-item-info">
              <h4>Export to CSV</h4>
              <p>Save all extracted post contents into a spreadsheet file (Excel/Sheets).</p>
            </div>
            <button id="btnExportCSV" class="btn btn-outline">Export CSV</button>
          </div>

          <div class="export-item">
            <div class="export-item-info">
              <h4>Export to Plain Text (.txt)</h4>
              <p>Export all post contents into a single readable text document.</p>
            </div>
            <button id="btnExportTXT" class="btn btn-outline">Export TXT</button>
          </div>

          <div class="export-item">
            <div class="export-item-info">
              <h4>Export JSON Backup</h4>
              <p>Export full JSON data containing authors, emails, and post contents.</p>
            </div>
            <button id="btnExportJSON" class="btn btn-outline">Export JSON</button>
          </div>

          <div class="export-item">
            <div class="export-item-info" style="width: 100%;">
              <h4>🤖 AI Draft Server URL</h4>
              <p>Connects to your live Node.js auto-drafting server.</p>
              <div style="display: flex; gap: 8px; margin-top: 8px;">
                <input type="text" id="serverUrlInput" value="http://103.138.96.132:7777" placeholder="http://103.138.96.132:7777" style="flex: 1; padding: 5px 8px; font-size: 11px; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: #fff;" />
                <button id="btnSaveServerUrl" class="btn btn-outline" style="padding: 4px 10px; font-size: 11px;">Save</button>
              </div>
            </div>
          </div>

          <div class="export-item danger-item">
            <div class="export-item-info">
              <h4 class="text-danger">Clear All Saved Posts</h4>
              <p>Delete all saved posts from your local browser storage.</p>
            </div>
            <button id="btnClearAll" class="btn btn-danger-outline">Clear All</button>
          </div>
        </div>
      </section>

      <!-- Toast Notification -->
      <div id="toast" class="toast"></div>
    </div>
  `;

  shadow.innerHTML = template;
  document.documentElement.appendChild(container);
  document.documentElement.appendChild(floatingToggle);

  // 5. Query Selectors in Shadow DOM
  const $ = (sel) => shadow.querySelector(sel);
  const $$ = (sel) => shadow.querySelectorAll(sel);

  const connectionStatus = $('#connectionStatus');
  const navTabs = $$('.nav-tab');
  const tabPanes = $$('.tab-pane');
  const visibleCountBadge = $('#visibleCountBadge');
  const savedCountBadge = $('#savedCountBadge');
  const visibleHeader = $('#visibleHeader');
  const toggleAutoSync = $('#toggleAutoSync');
  const toggleText = $('.toggle-text');
  const btnRescan = $('#btnRescan');
  const btnRetryScan = $('#btnRetryScan');
  const detectLoading = $('#detectLoading');
  const detectNoPosts = $('#detectNoPosts');
  const visiblePostsList = $('#visiblePostsList');
  const savedSearch = $('#savedSearch');
  const savedPostsList = $('#savedPostsList');
  const savedEmptyState = $('#savedEmptyState');
  const statSavedTotal = $('#statSavedTotal');
  const btnExportCSV = $('#btnExportCSV');
  const btnExportTXT = $('#btnExportTXT');
  const btnExportJSON = $('#btnExportJSON');
  const btnClearAll = $('#btnClearAll');
  const serverUrlInput = $('#serverUrlInput');
  const btnSaveServerUrl = $('#btnSaveServerUrl');
  const btnCloseSidebar = $('#btnCloseSidebar');
  const toastEl = $('#toast');

  // Liveness / Invalidation Guard
  const cleanupIfInvalid = () => {
    if (!isValidContext()) {
      window.removeEventListener('scroll', handleUserScroll, { capture: true });
      document.removeEventListener('scroll', handleUserScroll, { capture: true });
      window.removeEventListener('wheel', handleUserScroll);
      window.removeEventListener('touchmove', handleUserScroll);

      const curContainer = document.getElementById('postgrab-sidebar-container');
      if (curContainer) curContainer.remove();
      const curToggle = document.getElementById('postgrab-floating-toggle');
      if (curToggle) curToggle.remove();

      return true;
    }
    return false;
  };

  const livenessTimer = setInterval(() => {
    if (cleanupIfInvalid()) {
      clearInterval(livenessTimer);
    }
  }, 1200);

  // Helper: Toast
  const showToast = (msg) => {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2200);
  };

  // Helper: HTML Escaping
  const escapeHtml = (text) => {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Connection & Detection States
  const setConnectionStatus = (type, text) => {
    if (!connectionStatus) return;
    connectionStatus.className = `status-badge ${type}`;
    const txt = connectionStatus.querySelector('.status-text');
    if (txt) txt.textContent = text;
  };

  const setDetectState = (state) => {
    if (detectLoading) detectLoading.classList.add('hidden');
    if (detectNoPosts) detectNoPosts.classList.add('hidden');
    if (visiblePostsList) visiblePostsList.classList.add('hidden');

    if (state === 'loading') {
      if (detectLoading) detectLoading.classList.remove('hidden');
    } else if (state === 'no-posts') {
      if (detectNoPosts) detectNoPosts.classList.remove('hidden');
    } else if (state === 'success') {
      if (visiblePostsList) visiblePostsList.classList.remove('hidden');
    }
  };

  // 6. Navigation Tabs
  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      navTabs.forEach((t) => t.classList.remove('active'));
      tabPanes.forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      const pane = $(`#tab-${target}`);
      if (pane) pane.classList.add('active');

      if (target === 'saved') {
        renderSavedPosts();
      } else if (target === 'export') {
        updateExportStats();
      }
    });
  });

  // 7. Drawer Toggle
  const toggleSidebar = (state) => {
    isOpen = typeof state === 'boolean' ? state : !isOpen;
    if (isOpen) {
      container.classList.add('open');
      floatingToggle.classList.add('hidden');
      lastScannedPostIds = '';
      setTimeout(runScan, 60);
    } else {
      container.classList.remove('open');
      floatingToggle.classList.remove('hidden');
    }
  };

  floatingToggle.addEventListener('click', () => toggleSidebar(true));
  if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', () => toggleSidebar(false));

  // 8. Scanning Posts (Zero-Iframe Direct Invocation)
  const runScan = () => {
    if (cleanupIfInvalid()) return;
    if (!window.__postgrab_extractVisiblePosts) return;

    window.requestAnimationFrame(() => {
      if (cleanupIfInvalid()) return;
      const result = window.__postgrab_extractVisiblePosts();
      const posts = (result && result.success && Array.isArray(result.posts)) ? result.posts : [];
      const currentIds = posts.map(p => p.id).join('|');

      if (currentIds === lastScannedPostIds && posts.length > 0) {
        return; // No change in visible posts
      }

      lastScannedPostIds = currentIds;
      visiblePosts = posts;

      if (visibleCountBadge) visibleCountBadge.textContent = posts.length;
      if (visibleHeader) visibleHeader.textContent = `Visible on screen (${posts.length})`;
      setConnectionStatus('connected', 'LinkedIn Connected');

      if (posts.length > 0) {
        setDetectState('success');
        renderVisiblePosts();
      } else {
        setDetectState('no-posts');
      }
    });
  };

  // Helper: Detect city from post content
  const detectPostCity = (content) => {
    const text = (content || '').toLowerCase();
    const hasAhm = /\b(ahmedabad|amdavad|ahd|sg highway|s\.g\. highway|prahladnagar|prahlad nagar|bodakdev|satellite|navrangpura|vastrapur|gandhinagar|gift city|makarba|sanand|iskcon|bopal|chandkheda|thaltej|sola|shela|science city)\b/i.test(text);
    return hasAhm ? 'AHM' : 'RJK';
  };

  // 9. Render Visible Posts
  const renderVisiblePosts = () => {
    if (!visiblePostsList) return;
    visiblePostsList.innerHTML = '';

    visiblePosts.forEach((post) => {
      const isAlreadySaved = savedPosts.some((s) => s.id === post.id);
      const isDrafted = draftedPostIds.has(post.id);
      let selectedCity = detectPostCity(post.content);

      const card = document.createElement('div');
      card.className = 'post-card';

      card.innerHTML = `
        <div class="post-card-header">
          <div class="header-left">
            <div class="author-row">
              ${post.authorUrl 
                ? `<a class="author-name" href="${escapeHtml(post.authorUrl)}" target="_blank">👤 ${escapeHtml(post.author)}</a>` 
                : `<span class="author-name">👤 ${escapeHtml(post.author)}</span>`}
              ${post.jobLink ? `<a href="${escapeHtml(post.jobLink)}" target="_blank" class="badge-job">💼 Job Link</a>` : ''}
            </div>
            ${post.email ? `<div class="author-subrow"><span class="badge-email" title="${escapeHtml(post.email)}">✉️ ${escapeHtml(post.email)}</span></div>` : ''}
          </div>
          <div class="card-actions-right">
            <button class="btn-location-pill ${selectedCity === 'AHM' ? 'city-ahm' : 'city-rjk'}" title="Resume: ${selectedCity === 'AHM' ? 'Ahmedabad (2026A)' : 'Rajkot'}. Click to toggle.">
              ${selectedCity === 'AHM' ? '📍 AHM' : '📍 RJK'}
            </button>
            <button class="btn-draft-email ${isDrafted ? 'drafted' : ''}" data-id="${post.id}" title="${isDrafted ? 'Email already saved to Gmail Drafts' : 'Generate AI cold email and save to Gmail Drafts'}">
              ${isDrafted ? '✓ In Drafts' : '✨ Draft'}
            </button>
            <button class="btn-save-post ${isAlreadySaved ? 'saved' : ''}" data-id="${post.id}">
              ${isAlreadySaved ? '✓ Saved' : '+ Save'}
            </button>
          </div>
        </div>

        <div class="post-text-content">${escapeHtml(post.content)}</div>

        <div class="post-card-bottom">
          <span class="post-char-count">${post.content.length} chars</span>
        </div>
      `;

      // Location Pill Toggle
      const locBtn = card.querySelector('.btn-location-pill');
      locBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedCity = selectedCity === 'AHM' ? 'RJK' : 'AHM';
        locBtn.className = `btn-location-pill ${selectedCity === 'AHM' ? 'city-ahm' : 'city-rjk'}`;
        locBtn.textContent = selectedCity === 'AHM' ? '📍 AHM' : '📍 RJK';
        locBtn.title = `Resume: ${selectedCity === 'AHM' ? 'Ahmedabad (2026A)' : 'Rajkot'}. Click to toggle.`;
        showToast(`Resume switched to ${selectedCity === 'AHM' ? 'Ahmedabad (2026A)' : 'Rajkot'}`);
      });

      // Save Button
      const saveBtn = card.querySelector('.btn-save-post');
      saveBtn.addEventListener('click', async () => {
        if (!savedPosts.some((s) => s.id === post.id)) {
          await saveSinglePost(post);
          saveBtn.classList.add('saved');
          saveBtn.textContent = '✓ Saved';
          showToast(`Saved post by ${post.author}!`);
        }
      });

      // Draft Button
      const draftBtn = card.querySelector('.btn-draft-email');
      draftBtn.addEventListener('click', () => {
        handleDraftEmail(post, draftBtn, selectedCity);
      });

      visiblePostsList.appendChild(card);
    });
  };

  // 10. AI Cold Email Drafting (Proxied via Background Worker to Bypass Mixed Content)
  const handleDraftEmail = async (post, btn, city = 'auto') => {
    if (btn.classList.contains('loading')) return;

    if (draftedPostIds.has(post.id)) {
      const confirmRedraft = confirm('An email draft was already generated for this post. Do you want to generate another draft in your Gmail account?');
      if (!confirmRedraft) return;
    }

    btn.classList.remove('error', 'drafted');
    btn.classList.add('loading');
    btn.textContent = '⏳ Drafting...';

    const targetServerUrl = serverUrl || 'http://103.138.96.132:7777';

    try {
      if (!isValidContext()) throw new Error('Extension context invalidated. Please refresh the page (F5).');

      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: 'createDraftOnServer',
            serverUrl: targetServerUrl,
            post: post,
            city: city
          },
          (res) => {
            if (chrome.runtime?.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(res || { success: false, error: 'No response from background worker' });
            }
          }
        );
      });

      if (result && result.success) {
        const data = result.data;
        draftedPostIds.add(post.id);
        if (isValidContext()) {
          try {
            await chrome.storage.local.set({ [DRAFTED_KEY]: Array.from(draftedPostIds) });
          } catch (_) {}
        }
        btn.classList.remove('loading', 'error');
        btn.classList.add('drafted');
        btn.textContent = '✓ In Drafts';
        const isAi = data.generator && (data.generator.includes('ai') || data.generator.includes('opencode'));
        const generatorLabel = isAi ? '🤖 AI Draft (OpenCode)' : '📋 Template Draft';
        const cityLabel = data.selectedCity === 'AHM' ? 'Ahmedabad' : 'Rajkot';
        showToast(`${generatorLabel} [${cityLabel} Resume] saved to Gmail!`);
      } else {
        throw new Error((result && result.error) || 'Server returned an error');
      }
    } catch (err) {
      console.error('[PostGrab Content] Draft error:', err);
      btn.classList.remove('loading');
      btn.classList.add('error');
      btn.textContent = '⚠️ Retry';
      showToast(`Draft failed: ${err.message || 'Check server connection'}`);
    }
  };

  // 11. Storage Operations
  const loadSettings = async () => {
    return new Promise((resolve) => {
      if (!isValidContext()) return resolve();
      try {
        chrome.storage.local.get([SERVER_URL_KEY, DRAFTED_KEY], (res) => {
          if (chrome.runtime?.lastError) return resolve();
          if (res && res[SERVER_URL_KEY]) {
            serverUrl = res[SERVER_URL_KEY];
            if (serverUrlInput) serverUrlInput.value = serverUrl;
          }
          if (res && Array.isArray(res[DRAFTED_KEY])) {
            draftedPostIds = new Set(res[DRAFTED_KEY]);
          }
          resolve();
        });
      } catch (_) {
        resolve();
      }
    });
  };

  const loadSavedPosts = async () => {
    return new Promise((resolve) => {
      if (!isValidContext()) return resolve(savedPosts);
      try {
        chrome.storage.local.get([STORAGE_KEY], (res) => {
          if (chrome.runtime?.lastError) return resolve(savedPosts);
          savedPosts = res && Array.isArray(res[STORAGE_KEY]) ? res[STORAGE_KEY] : [];
          updateBadges();
          updateExportStats();
          resolve(savedPosts);
        });
      } catch (_) {
        resolve(savedPosts);
      }
    });
  };

  const savePostsToStorage = async (posts) => {
    return new Promise((resolve) => {
      savedPosts = posts;
      updateBadges();
      updateExportStats();

      if (!isValidContext()) {
        showToast('Extension reloaded. Please refresh the page (F5).');
        return resolve();
      }

      try {
        chrome.storage.local.set({ [STORAGE_KEY]: posts }, () => resolve());
      } catch (_) {
        resolve();
      }
    });
  };

  const saveSinglePost = async (post) => {
    const updated = [
      {
        id: post.id,
        author: post.author,
        authorUrl: post.authorUrl,
        content: post.content,
        email: post.email || '',
        jobLink: post.jobLink || '',
        savedAt: new Date().toISOString()
      },
      ...savedPosts
    ];
    await savePostsToStorage(updated);
  };

  const updateBadges = () => {
    if (savedCountBadge) savedCountBadge.textContent = savedPosts.length;
  };

  const updateExportStats = () => {
    if (statSavedTotal) statSavedTotal.textContent = savedPosts.length;
  };

  // 12. Render Saved Posts
  const renderSavedPosts = () => {
    if (!savedPostsList) return;
    savedPostsList.innerHTML = '';

    const filtered = savedPosts.filter((post) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        (post.author || '').toLowerCase().includes(q) ||
        (post.content || '').toLowerCase().includes(q) ||
        (post.email || '').toLowerCase().includes(q)
      );
    });

    if (filtered.length === 0) {
      if (savedEmptyState) savedEmptyState.classList.remove('hidden');
      savedPostsList.classList.add('hidden');
      return;
    }

    if (savedEmptyState) savedEmptyState.classList.add('hidden');
    savedPostsList.classList.remove('hidden');

    filtered.forEach((post) => {
      const isDrafted = draftedPostIds.has(post.id);
      let selectedCity = detectPostCity(post.content);
      const card = document.createElement('div');
      card.className = 'post-card';

      const formattedDate = post.savedAt
        ? new Date(post.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Saved';

      card.innerHTML = `
        <div class="post-card-header">
          <div class="header-left">
            <div class="author-row">
              ${post.authorUrl 
                ? `<a class="author-name" href="${escapeHtml(post.authorUrl)}" target="_blank">👤 ${escapeHtml(post.author)}</a>` 
                : `<span class="author-name">👤 ${escapeHtml(post.author)}</span>`}
              ${post.jobLink ? `<a href="${escapeHtml(post.jobLink)}" target="_blank" class="badge-job">💼 Job Link</a>` : ''}
            </div>
            ${post.email ? `<div class="author-subrow"><span class="badge-email" title="${escapeHtml(post.email)}">✉️ ${escapeHtml(post.email)}</span></div>` : ''}
          </div>
          <div class="card-actions-right">
            <button class="btn-location-pill ${selectedCity === 'AHM' ? 'city-ahm' : 'city-rjk'}" title="Resume: ${selectedCity === 'AHM' ? 'Ahmedabad (2026A)' : 'Rajkot'}. Click to toggle.">
              ${selectedCity === 'AHM' ? '📍 AHM' : '📍 RJK'}
            </button>
            <button class="btn-draft-email ${isDrafted ? 'drafted' : ''}" data-id="${post.id}" title="${isDrafted ? 'Email already saved to Gmail Drafts' : 'Generate AI cold email and save to Gmail Drafts'}">
              ${isDrafted ? '✓ In Drafts' : '✨ Draft'}
            </button>
            <button class="icon-btn btn-copy" title="Copy text content">📋</button>
            <button class="icon-btn danger btn-delete" title="Delete post">🗑️</button>
          </div>
        </div>

        <div class="post-text-content">${escapeHtml(post.content)}</div>

        <div class="post-card-bottom">
          <span class="post-char-count">⏱️ ${formattedDate} • ${post.content.length} chars</span>
        </div>
      `;

      // Location Pill Toggle
      const locBtn = card.querySelector('.btn-location-pill');
      locBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedCity = selectedCity === 'AHM' ? 'RJK' : 'AHM';
        locBtn.className = `btn-location-pill ${selectedCity === 'AHM' ? 'city-ahm' : 'city-rjk'}`;
        locBtn.textContent = selectedCity === 'AHM' ? '📍 AHM' : '📍 RJK';
        locBtn.title = `Resume: ${selectedCity === 'AHM' ? 'Ahmedabad (2026A)' : 'Rajkot'}. Click to toggle.`;
        showToast(`Resume switched to ${selectedCity === 'AHM' ? 'Ahmedabad (2026A)' : 'Rajkot'}`);
      });

      // Draft
      const draftBtn = card.querySelector('.btn-draft-email');
      draftBtn.addEventListener('click', () => handleDraftEmail(post, draftBtn, selectedCity));

      // Copy
      const copyBtn = card.querySelector('.btn-copy');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(post.content);
          showToast('Text copied to clipboard!');
        } catch (_) {
          showToast('Copy failed.');
        }
      });

      // Delete
      const delBtn = card.querySelector('.btn-delete');
      delBtn.addEventListener('click', async () => {
        if (confirm(`Remove post by ${post.author}?`)) {
          const updated = savedPosts.filter((s) => s.id !== post.id);
          await savePostsToStorage(updated);
          renderSavedPosts();
          showToast('Post deleted.');
        }
      });

      savedPostsList.appendChild(card);
    });
  };

  // 13. Export Handlers
  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    shadow.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const getDateString = () => new Date().toISOString().split('T')[0];

  const handleExportCSV = () => {
    if (savedPosts.length === 0) return showToast('No saved posts to export!');
    const headers = ['Post ID', 'Author', 'Profile URL', 'Extracted Email', 'Job Link', 'Date Saved', 'Content'];
    const escapeCSV = (str) => {
      if (!str) return '""';
      const clean = String(str).replace(/"/g, '""').replace(/\r?\n/g, ' ');
      return `"${clean}"`;
    };
    const rows = savedPosts.map((p) => [
      escapeCSV(p.id),
      escapeCSV(p.author),
      escapeCSV(p.authorUrl),
      escapeCSV(p.email),
      escapeCSV(p.jobLink),
      escapeCSV(p.savedAt),
      escapeCSV(p.content)
    ].join(','));

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `linkedin_posts_${getDateString()}.csv`);
    showToast('Exported to CSV!');
  };

  const handleExportTXT = () => {
    if (savedPosts.length === 0) return showToast('No saved posts to export!');
    const separator = '\n' + '='.repeat(60) + '\n\n';
    const textContent = savedPosts.map((p, i) => [
      `POST #${i + 1} | AUTHOR: ${p.author}`,
      p.authorUrl ? `PROFILE: ${p.authorUrl}` : '',
      p.email ? `EMAIL: ${p.email}` : '',
      p.jobLink ? `JOB LINK: ${p.jobLink}` : '',
      `SAVED AT: ${p.savedAt}`,
      '\nCONTENT:',
      p.content
    ].filter(Boolean).join('\n')).join(separator);

    downloadBlob(new Blob([textContent], { type: 'text/plain;charset=utf-8;' }), `linkedin_posts_${getDateString()}.txt`);
    showToast('Exported to TXT!');
  };

  const handleExportJSON = () => {
    if (savedPosts.length === 0) return showToast('No saved posts to export!');
    const json = JSON.stringify(savedPosts, null, 2);
    downloadBlob(new Blob([json], { type: 'application/json' }), `linkedin_posts_backup_${getDateString()}.json`);
    showToast('Exported JSON backup!');
  };

  const handleClearAll = async () => {
    if (savedPosts.length === 0) return showToast('Database is already empty.');
    if (confirm('Permanently delete all saved posts? This cannot be undone.')) {
      await savePostsToStorage([]);
      renderSavedPosts();
      showToast('All posts cleared.');
    }
  };

  // 14. Event Listeners Setup
  if (btnRescan) btnRescan.addEventListener('click', runScan);
  if (btnRetryScan) btnRetryScan.addEventListener('click', runScan);

  if (toggleAutoSync) {
    toggleAutoSync.addEventListener('change', (e) => {
      isAutoSyncEnabled = e.target.checked;
      if (toggleText) {
        toggleText.textContent = isAutoSyncEnabled ? 'Auto-Sync ON' : 'Auto-Sync Paused';
      }
      showToast(isAutoSyncEnabled ? 'Auto-Sync enabled!' : 'Auto-Sync paused.');
      if (isAutoSyncEnabled) runScan();
    });
  }

  if (savedSearch) {
    savedSearch.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderSavedPosts();
    });
  }

  if (btnExportCSV) btnExportCSV.addEventListener('click', handleExportCSV);
  if (btnExportTXT) btnExportTXT.addEventListener('click', handleExportTXT);
  if (btnExportJSON) btnExportJSON.addEventListener('click', handleExportJSON);
  if (btnClearAll) btnClearAll.addEventListener('click', handleClearAll);

  if (btnSaveServerUrl) {
    btnSaveServerUrl.addEventListener('click', async () => {
      const val = (serverUrlInput ? serverUrlInput.value.trim() : '').replace(/\/+$/, '');
      if (!val) return showToast('Please enter a valid server URL');
      serverUrl = val;
      if (isValidContext()) {
        try {
          await chrome.storage.local.set({ [SERVER_URL_KEY]: serverUrl });
        } catch (_) {}
      }
      showToast(`AI Server URL saved: ${serverUrl}`);
    });
  }

  // 15. Scroll & Wheel Monitoring on LinkedIn
  const handleUserScroll = () => {
    if (!isAutoSyncEnabled || !isOpen) return;
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

  // 16. Chrome Runtime Message Listener (Toolbar icon click)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'toggleSidebar') {
      toggleSidebar();
      sendResponse({ success: true, isOpen });
    }
  });

  // 17. Initialize Data & Start
  (async () => {
    await loadSettings();
    await loadSavedPosts();
    runScan();
  })();
})();
