/**
 * Clarity Popup — Main entry point UI
 */

document.addEventListener('DOMContentLoaded', init);

async function init() {
  loadSessions();

  document.getElementById('btn-guide').addEventListener('click', startGuide);
  document.getElementById('btn-record').addEventListener('click', startRecording);
}

// ── Actions ─────────────────────────────────────────────────────────────

async function startGuide() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  await chrome.runtime.sendMessage({
    type: 'start-guide',
    tabId: tab.id,
    title: new URL(tab.url).hostname + ' Guide',
  });

  window.close();
}

async function startRecording() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  await chrome.runtime.sendMessage({
    type: 'start-recording',
    tabId: tab.id,
    title: new URL(tab.url).hostname + ' Recording',
  });

  window.close();
}

// ── Sessions ────────────────────────────────────────────────────────────

async function loadSessions() {
  const res = await chrome.runtime.sendMessage({ type: 'get-sessions' });
  const list = document.getElementById('sessions-list');

  if (!res?.sessions?.length) {
    list.innerHTML = '<p class="empty-state">No recent sessions</p>';
    return;
  }

  list.innerHTML = '';
  for (const s of res.sessions.slice(0, 8)) {
    const el = document.createElement('div');
    el.className = 'session-item';
    el.innerHTML = `
      <div class="session-info">
        <span class="session-title">${escapeHtml(s.title)}</span>
        <span class="session-meta">${timeAgo(s.createdAt)} &middot; ${s.stepCount || 0} steps</span>
      </div>
      <span class="session-type">${s.type}</span>
      <button class="session-delete" data-id="${s.id}" title="Delete">&times;</button>
    `;

    el.querySelector('.session-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      await chrome.runtime.sendMessage({ type: 'delete-session', sessionId: s.id });
      loadSessions();
    });

    list.appendChild(el);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
