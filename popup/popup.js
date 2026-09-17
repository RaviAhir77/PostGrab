/**
 * PostGrab - Visible LinkedIn Post Extractor & Database
 */

const STORAGE_KEY = 'postgrab_saved_posts';

// State
let visiblePosts = [];
let savedPosts = [];
let searchQuery = '';
let isAutoSyncEnabled = true;

// DOM Elements
const connectionStatus = document.getElementById('connectionStatus');
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanes = document.querySelectorAll('.tab-pane');
const visibleCountBadge = document.getElementById('visibleCountBadge');
const savedCountBadge = document.getElementById('savedCountBadge');

// Visible Tab Elements
const visibleHeader = document.getElementById('visibleHeader');
const toggleAutoSync = document.getElementById('toggleAutoSync');
const toggleText = document.querySelector('.toggle-text');
const btnRescan = document.getElementById('btnRescan');
const detectLoading = document.getElementById('detectLoading');
const detectNotLinkedIn = document.getElementById('detectNotLinkedIn');
const detectNoPosts = document.getElementById('detectNoPosts');
const btnRetryScan = document.getElementById('btnRetryScan');
const visiblePostsList = document.getElementById('visiblePostsList');

// Saved Tab Elements
const savedSearch = document.getElementById('savedSearch');
const savedPostsList = document.getElementById('savedPostsList');
const savedEmptyState = document.getElementById('savedEmptyState');

// Export Tab Elements
const statSavedTotal = document.getElementById('statSavedTotal');
const btnExportCSV = document.getElementById('btnExportCSV');
const btnExportTXT = document.getElementById('btnExportTXT');
const btnExportJSON = document.getElementById('btnExportJSON');
const btnClearAll = document.getElementById('btnClearAll');
const toastEl = document.getElementById('toast');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupEventListeners();
  await loadSavedPosts();
  await scanVisiblePosts();

  // Keep side panel in sync when user switches tabs or navigates
  if (chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(() => {
      scanVisiblePosts();
    });
  }
  if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'complete') {
        scanVisiblePosts();
      }
    });
  }
});

// --- Tab Navigation ---
function setupNavigation() {
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      navTabs.forEach(t => t.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`tab-${target}`).classList.add('active');

      if (target === 'saved') {
        renderSavedPosts();
      } else if (target === 'export') {
        updateExportStats();
      }
    });
  });
}

// --- Scan Visible Posts in Active Tab ---
async function scanVisiblePosts() {
  setDetectState('loading');
  setConnectionStatus('checking', 'Scanning...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('linkedin.com')) {
      setDetectState('not-linkedin');
      setConnectionStatus('disconnected', 'Not on LinkedIn');
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['scripts/extractor.js']
    });

    if (!results || !results[0] || !results[0].result) {
      setDetectState('no-posts');
      setConnectionStatus('disconnected', 'Scan Failed');
      return;
    }

    const res = results[0].result;

    if (!res.success || !res.posts || res.posts.length === 0) {
      setDetectState('no-posts');
      setConnectionStatus('disconnected', 'No Posts Detected');
      return;
    }

    // Successfully found visible posts!
    visiblePosts = res.posts;
    setConnectionStatus('connected', 'LinkedIn Connected');
    visibleCountBadge.textContent = visiblePosts.length;
    visibleHeader.textContent = `Visible on screen (${visiblePosts.length})`;

    renderVisiblePosts();
    setDetectState('success');

  } catch (err) {
    console.warn('Scan error:', err);
    setDetectState('no-posts');
    setConnectionStatus('disconnected', 'Scan Error');
  }
}

function setDetectState(state) {
  detectLoading.classList.add('hidden');
  detectNotLinkedIn.classList.add('hidden');
  detectNoPosts.classList.add('hidden');
  visiblePostsList.classList.add('hidden');

  if (state === 'loading') detectLoading.classList.remove('hidden');
  else if (state === 'not-linkedin') detectNotLinkedIn.classList.remove('hidden');
  else if (state === 'no-posts') detectNoPosts.classList.remove('hidden');
  else if (state === 'success') visiblePostsList.classList.remove('hidden');
}

function setConnectionStatus(type, text) {
  connectionStatus.className = `status-badge ${type}`;
  connectionStatus.querySelector('.status-text').textContent = text;
}

// --- Render Visible Posts ---
function renderVisiblePosts() {
  visiblePostsList.innerHTML = '';

  visiblePosts.forEach((post, index) => {
    const isAlreadySaved = savedPosts.some(s => s.id === post.id);

    const card = document.createElement('div');
    card.className = 'post-card';

    card.innerHTML = `
      <div class="post-card-header">
        <div class="author-info">
          ${post.authorUrl 
            ? `<a class="author-name" href="${escapeHtml(post.authorUrl)}" target="_blank">👤 ${escapeHtml(post.author)}</a>` 
            : `<span class="author-name">👤 ${escapeHtml(post.author)}</span>`}
        </div>
        <div>
          ${post.email ? `<span class="badge-email" title="${escapeHtml(post.email)}">✉️ ${escapeHtml(post.email)}</span>` : ''}
          ${post.jobLink ? `<span class="badge-job">💼 Job Link</span>` : ''}
        </div>
      </div>

      <!-- Pure Text Content Box (No Images) -->
      <div class="post-text-content">${escapeHtml(post.content)}</div>

      <div class="post-card-footer">
        <span class="post-meta">Post #${index + 1} • ${post.content.length} chars</span>
        <button class="btn-save-post ${isAlreadySaved ? 'saved' : ''}" data-id="${post.id}">
          ${isAlreadySaved ? '✓ Saved' : '+ Save Post'}
        </button>
      </div>
    `;

    // Button Save Listener
    const saveBtn = card.querySelector('.btn-save-post');
    saveBtn.addEventListener('click', async () => {
      if (!savedPosts.some(s => s.id === post.id)) {
        await saveSinglePost(post);
        saveBtn.classList.add('saved');
        saveBtn.textContent = '✓ Saved';
        showToast(`Saved post by ${post.author}!`);
      }
    });

    visiblePostsList.appendChild(card);
  });
}

// --- Storage Operations (chrome.storage.local) ---
async function loadSavedPosts() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      savedPosts = Array.isArray(res[STORAGE_KEY]) ? res[STORAGE_KEY] : [];
      updateBadges();
      updateExportStats();
      resolve(savedPosts);
    });
  });
}

async function savePostsToStorage(posts) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: posts }, () => {
      savedPosts = posts;
      updateBadges();
      updateExportStats();
      resolve();
    });
  });
}

async function saveSinglePost(post) {
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
}

function updateBadges() {
  savedCountBadge.textContent = savedPosts.length;
}

// --- Render Saved Posts ---
function renderSavedPosts() {
  savedPostsList.innerHTML = '';

  const filtered = savedPosts.filter(post => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (post.author || '').toLowerCase().includes(q) ||
      (post.content || '').toLowerCase().includes(q) ||
      (post.email || '').toLowerCase().includes(q)
    );
  });

  if (filtered.length === 0) {
    savedEmptyState.classList.remove('hidden');
    savedPostsList.classList.add('hidden');
    return;
  }

  savedEmptyState.classList.add('hidden');
  savedPostsList.classList.remove('hidden');

  filtered.forEach(post => {
    const card = document.createElement('div');
    card.className = 'post-card';

    const formattedDate = post.savedAt 
      ? new Date(post.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Saved';

    card.innerHTML = `
      <div class="post-card-header">
        <div class="author-info">
          ${post.authorUrl 
            ? `<a class="author-name" href="${escapeHtml(post.authorUrl)}" target="_blank">👤 ${escapeHtml(post.author)}</a>` 
            : `<span class="author-name">👤 ${escapeHtml(post.author)}</span>`}
        </div>
        <div>
          ${post.email ? `<span class="badge-email" title="${escapeHtml(post.email)}">✉️ ${escapeHtml(post.email)}</span>` : ''}
          ${post.jobLink ? `<a href="${escapeHtml(post.jobLink)}" target="_blank" class="badge-job" style="text-decoration:none;">💼 View Job</a>` : ''}
        </div>
      </div>

      <!-- Pure Text Content Box -->
      <div class="post-text-content">${escapeHtml(post.content)}</div>

      <div class="post-card-footer">
        <span class="post-meta">⏱️ ${formattedDate}</span>
        <div class="card-actions-right">
          <button class="icon-btn btn-copy" title="Copy text content">
            📋 Copy Text
          </button>
          <button class="icon-btn danger btn-delete" title="Delete post">
            🗑️ Delete
          </button>
        </div>
      </div>
    `;

    // Copy Content Button
    const copyBtn = card.querySelector('.btn-copy');
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(post.content);
      showToast('Text copied to clipboard!');
    });

    // Delete Button
    const delBtn = card.querySelector('.btn-delete');
    delBtn.addEventListener('click', async () => {
      if (confirm(`Remove post by ${post.author}?`)) {
        const updated = savedPosts.filter(s => s.id !== post.id);
        await savePostsToStorage(updated);
        renderSavedPosts();
        showToast('Post deleted.');
      }
    });

    savedPostsList.appendChild(card);
  });
}

// --- Export Features ---
function updateExportStats() {
  statSavedTotal.textContent = savedPosts.length;
}

function handleExportCSV() {
  if (savedPosts.length === 0) {
    showToast('No saved posts to export!');
    return;
  }

  const headers = ['Post ID', 'Author', 'Profile URL', 'Extracted Email', 'Job Link', 'Date Saved', 'Content'];
  const escapeCSV = (str) => {
    if (!str) return '""';
    const clean = String(str).replace(/"/g, '""').replace(/\r?\n/g, ' ');
    return `"${clean}"`;
  };

  const rows = savedPosts.map(p => [
    escapeCSV(p.id),
    escapeCSV(p.author),
    escapeCSV(p.authorUrl),
    escapeCSV(p.email),
    escapeCSV(p.jobLink),
    escapeCSV(p.savedAt),
    escapeCSV(p.content)
  ].join(','));

  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `linkedin_posts_${getDateString()}.csv`);
  showToast('Exported to CSV!');
}

function handleExportTXT() {
  if (savedPosts.length === 0) {
    showToast('No saved posts to export!');
    return;
  }

  const separator = '\n' + '='.repeat(60) + '\n\n';
  const textContent = savedPosts.map((p, i) => {
    return [
      `POST #${i + 1} | AUTHOR: ${p.author}`,
      p.authorUrl ? `PROFILE: ${p.authorUrl}` : '',
      p.email ? `EMAIL: ${p.email}` : '',
      p.jobLink ? `JOB LINK: ${p.jobLink}` : '',
      `SAVED AT: ${p.savedAt}`,
      '\nCONTENT:',
      p.content
    ].filter(Boolean).join('\n');
  }).join(separator);

  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8;' });
  downloadBlob(blob, `linkedin_posts_${getDateString()}.txt`);
  showToast('Exported to TXT!');
}

function handleExportJSON() {
  if (savedPosts.length === 0) {
    showToast('No saved posts to export!');
    return;
  }

  const json = JSON.stringify(savedPosts, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, `linkedin_posts_backup_${getDateString()}.json`);
  showToast('Exported JSON backup!');
}

async function handleClearAll() {
  if (savedPosts.length === 0) {
    showToast('Database is already empty.');
    return;
  }

  if (confirm('Permanently delete all saved posts? This cannot be undone.')) {
    await savePostsToStorage([]);
    renderSavedPosts();
    showToast('All posts cleared.');
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getDateString() {
  return new Date().toISOString().split('T')[0];
}

// --- Setup Event Listeners ---
function setupEventListeners() {
  btnRescan.addEventListener('click', () => {
    window.parent.postMessage({ action: 'requestManualScan' }, '*');
    scanVisiblePosts();
  });

  btnRetryScan.addEventListener('click', () => {
    window.parent.postMessage({ action: 'requestManualScan' }, '*');
    scanVisiblePosts();
  });

  // Auto-Sync Toggle
  if (toggleAutoSync) {
    toggleAutoSync.addEventListener('change', (e) => {
      isAutoSyncEnabled = e.target.checked;
      if (toggleText) {
        toggleText.textContent = isAutoSyncEnabled ? 'Auto-Sync ON' : 'Auto-Sync Paused';
      }
      window.parent.postMessage({ action: 'setAutoSync', enabled: isAutoSyncEnabled }, '*');
      showToast(isAutoSyncEnabled ? 'Auto-Sync enabled!' : 'Auto-Sync paused.');
    });
  }

  const handleLivePostsUpdate = (posts) => {
    if (isAutoSyncEnabled && posts && posts.length > 0) {
      const newIds = posts.map(p => p.id).join('|');
      const oldIds = visiblePosts.map(p => p.id).join('|');
      if (newIds === oldIds) return; // Zero work if posts haven't changed!

      visiblePosts = posts;
      setConnectionStatus('connected', 'LinkedIn Connected');
      visibleCountBadge.textContent = visiblePosts.length;
      visibleHeader.textContent = `Visible on screen (${visiblePosts.length})`;
      renderVisiblePosts();
      setDetectState('success');
    }
  };

  // 1. Listen from Iframe Parent
  window.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'livePostsUpdate') {
      handleLivePostsUpdate(event.data.posts);
    }
  });

  // 2. Listen from Chrome Runtime (if running as popup)
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.action === 'livePostsUpdate') {
        handleLivePostsUpdate(msg.posts);
      }
    });
  }

  savedSearch.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderSavedPosts();
  });

  btnExportCSV.addEventListener('click', handleExportCSV);
  btnExportTXT.addEventListener('click', handleExportTXT);
  btnExportJSON.addEventListener('click', handleExportJSON);
  btnClearAll.addEventListener('click', handleClearAll);

  // Close sidebar button
  const btnCloseSidebar = document.getElementById('btnCloseSidebar');
  if (btnCloseSidebar) {
    btnCloseSidebar.addEventListener('click', () => {
      window.parent.postMessage({ action: 'closePostGrabSidebar' }, '*');
    });
  }
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2000);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
