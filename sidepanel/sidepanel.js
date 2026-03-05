/**
 * Clarity Side Panel
 * Shows real-time step capture like Tango, with live step list,
 * thumbnails, and session management.
 */

(() => {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────

  let currentView = 'home'; // 'home' | 'capture'
  let captureSessionId = null;
  let captureSteps = [];
  let captureStartTime = 0;
  let timerInterval = null;
  let paused = false;
  let highlightColor = '#FF2D55';

  // 100+ color palette — organized by hue families
  const COLOR_PALETTE = [
    // Reds / Pinks
    '#FF2D55', '#FF3B30', '#FF6B6B', '#E91E63', '#F50057',
    '#FF1744', '#D50000', '#C62828', '#AD1457', '#880E4F',
    // Oranges
    '#FF9500', '#FF6D00', '#FF9100', '#FB8C00', '#EF6C00',
    '#E65100', '#FF7043', '#FF5722', '#F4511E', '#BF360C',
    // Yellows
    '#FFCC00', '#FFD600', '#FFAB00', '#FFC400', '#FFB300',
    '#FFA000', '#FF8F00', '#F9A825', '#F57F17', '#FFD740',
    // Greens
    '#34C759', '#00C853', '#00E676', '#69F0AE', '#4CAF50',
    '#43A047', '#2E7D32', '#1B5E20', '#00BFA5', '#00897B',
    // Teals / Cyans
    '#5AC8FA', '#00BCD4', '#00ACC1', '#0097A7', '#00838F',
    '#006064', '#26C6DA', '#4DD0E1', '#80DEEA', '#18FFFF',
    // Blues
    '#007AFF', '#2196F3', '#1976D2', '#1565C0', '#0D47A1',
    '#2962FF', '#448AFF', '#42A5F5', '#64B5F6', '#82B1FF',
    // Indigos
    '#5856D6', '#3F51B5', '#3949AB', '#303F9F', '#283593',
    '#1A237E', '#536DFE', '#3D5AFE', '#304FFE', '#8C9EFF',
    // Purples
    '#AF52DE', '#9C27B0', '#8E24AA', '#7B1FA2', '#6A1B9A',
    '#4A148C', '#AA00FF', '#D500F9', '#E040FB', '#EA80FC',
    // Browns
    '#A2845E', '#795548', '#6D4C41', '#5D4037', '#4E342E',
    '#3E2723', '#8D6E63', '#BCAAA4', '#A1887F', '#D7CCC8',
    // Grays / Neutrals
    '#000000', '#212121', '#424242', '#616161', '#757575',
    '#9E9E9E', '#BDBDBD', '#E0E0E0', '#8E8E93', '#48484A',
  ];


  // ── Init ────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    loadSessions();
    bindEvents();
    listenForMessages();
  });

  // ── Event Binding ───────────────────────────────────────────────────────

  function bindEvents() {
    // Home actions
    document.getElementById('btn-start-capture').addEventListener('click', startCapture);
    document.getElementById('btn-start-recording').addEventListener('click', startRecording);

    // Tab switching
    document.querySelectorAll('.sp-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sp-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
      });
    });

    // Capture controls
    document.getElementById('btn-pause-capture').addEventListener('click', togglePause);
    document.getElementById('btn-stop-capture').addEventListener('click', finishCapture);
    document.getElementById('btn-finish-capture').addEventListener('click', finishCapture);
    document.getElementById('btn-undo-step').addEventListener('click', undoLastStep);

    // Color picker
    initColorPicker();

    // Title editing
    document.getElementById('capture-title').addEventListener('input', (e) => {
      chrome.runtime.sendMessage({
        type: 'update-session-title',
        sessionId: captureSessionId,
        title: e.target.value,
      });
    });
  }

  // ── Message Listener (from content script / background) ─────────────────

  function listenForMessages() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'step-added') {
        addStepToUI(msg.step, msg.stepNumber);
        sendResponse({ ok: true });
      } else if (msg.type === 'capture-started') {
        // Only handle if we aren't already in capture view (avoid duplicate from response)
        if (currentView !== 'capture') {
          captureSessionId = msg.sessionId;
          captureSteps = [];
          switchView('capture');
          startTimer();
        }
        sendResponse({ ok: true });
      } else if (msg.type === 'capture-stopped') {
        switchView('home');
        stopTimer();
        loadSessions();
        sendResponse({ ok: true });
      }
    });
  }

  // ── Start Capture ───────────────────────────────────────────────────────

  async function startCapture() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const title = new URL(tab.url).hostname + ' Guide';
    document.getElementById('capture-title').value = title;

    const res = await chrome.runtime.sendMessage({
      type: 'start-guide',
      tabId: tab.id,
      title,
    });

    if (res?.sessionId) {
      captureSessionId = res.sessionId;
      captureSteps = [];
      switchView('capture');
      startTimer();
      // Send initial highlight color to content script
      sendHighlightColor(highlightColor);
    }
  }

  async function startRecording() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    await chrome.runtime.sendMessage({
      type: 'start-recording',
      tabId: tab.id,
      title: new URL(tab.url).hostname + ' Recording',
    });
  }

  // ── Finish Capture ──────────────────────────────────────────────────────

  async function finishCapture() {
    await chrome.runtime.sendMessage({ type: 'stop-capture' });
    switchView('home');
    stopTimer();
    loadSessions();
  }

  // ── Pause ───────────────────────────────────────────────────────────────

  async function togglePause() {
    if (paused) {
      await chrome.runtime.sendMessage({ type: 'resume-capture' });
      paused = false;
    } else {
      await chrome.runtime.sendMessage({ type: 'pause-capture' });
      paused = true;
    }
    updatePauseButton();
  }

  function updatePauseButton() {
    const btn = document.getElementById('btn-pause-capture');
    if (paused) {
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>';
      btn.title = 'Resume';
    } else {
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
      btn.title = 'Pause';
    }
  }

  // ── Undo Step ───────────────────────────────────────────────────────────

  async function undoLastStep() {
    if (!captureSteps.length) return;
    const lastStep = captureSteps.pop();

    await chrome.runtime.sendMessage({
      type: 'remove-last-step',
      sessionId: captureSessionId,
    });

    renderLiveSteps();
  }

  // ── Timer ───────────────────────────────────────────────────────────────

  function startTimer() {
    captureStartTime = Date.now();
    paused = false;
    updatePauseButton();
    timerInterval = setInterval(() => {
      if (paused) return;
      const elapsed = Math.floor((Date.now() - captureStartTime) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      const el = document.getElementById('capture-timer');
      if (el) el.textContent = `${m}:${s}`;
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // ── Add Step to UI ──────────────────────────────────────────────────────

  function addStepToUI(step, number) {
    captureSteps.push({ ...step, number });
    renderLiveSteps();

    // Scroll to bottom
    const container = document.getElementById('steps-live');
    container.scrollTop = container.scrollHeight;
  }

  // ── Render Live Steps ───────────────────────────────────────────────────

  function renderLiveSteps() {
    const container = document.getElementById('steps-live');

    if (!captureSteps.length) {
      container.innerHTML = '<div class="sp-steps-empty"><p>Click on elements to capture steps...</p></div>';
      return;
    }

    container.innerHTML = '';
    for (let i = 0; i < captureSteps.length; i++) {
      const step = captureSteps[i];
      const el = document.createElement('div');
      el.className = 'sp-live-step';
      el.innerHTML = `
        <span class="sp-live-step-num">${i + 1}</span>
        <div class="sp-live-step-body">
          <div class="sp-live-step-title">${escapeHtml(step.title || `Step ${i + 1}`)}</div>
          ${step.croppedScreenshot ? `<img class="sp-live-step-thumb" src="${step.croppedScreenshot}" alt="Step ${i + 1}" />` : ''}
        </div>
        <button class="sp-live-step-delete" data-index="${i}" title="Delete step">&times;</button>
      `;

      el.querySelector('.sp-live-step-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        removeStep(i);
      });

      container.appendChild(el);
    }
  }

  async function removeStep(index) {
    captureSteps.splice(index, 1);
    await chrome.runtime.sendMessage({
      type: 'remove-step-at',
      sessionId: captureSessionId,
      index,
    });
    renderLiveSteps();
  }

  // ── View Switching ──────────────────────────────────────────────────────

  function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
  }

  // ── Load Sessions ───────────────────────────────────────────────────────

  async function loadSessions() {
    const res = await chrome.runtime.sendMessage({ type: 'get-sessions' });
    const list = document.getElementById('sessions-list');

    if (!res?.sessions?.length) {
      list.innerHTML = `
        <div class="sp-empty-state">
          <div class="sp-empty-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>
          </div>
          <p class="sp-empty-title">No captures yet</p>
          <p class="sp-empty-sub">Click "Start Capture" to create your first guide</p>
        </div>
      `;
      return;
    }

    list.innerHTML = '';
    for (let i = 0; i < res.sessions.length; i++) {
      const s = res.sessions[i];
      const el = document.createElement('div');
      el.className = 'sp-session-item';
      el.innerHTML = `
        <span class="sp-session-num">${i + 1}</span>
        <div class="sp-session-info">
          <div class="sp-session-title">${escapeHtml(s.title)}</div>
          <div class="sp-session-meta">${timeAgo(s.createdAt)} &middot; ${s.stepCount || 0} steps</div>
        </div>
        <button class="sp-session-delete" data-id="${s.id}" title="Delete">&times;</button>
      `;

      el.querySelector('.sp-session-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        await chrome.runtime.sendMessage({ type: 'delete-session', sessionId: s.id });
        loadSessions();
      });

      // Click to open editor
      el.addEventListener('click', () => {
        chrome.tabs.create({
          url: chrome.runtime.getURL(`editor/editor.html?session=${s.id}`),
        });
      });

      list.appendChild(el);
    }
  }

  // ── Color Picker ──────────────────────────────────────────────────────

  function initColorPicker() {
    const grid = document.getElementById('color-grid');
    if (!grid) return;

    grid.innerHTML = '';
    for (const color of COLOR_PALETTE) {
      const swatch = document.createElement('div');
      swatch.className = 'sp-color-swatch' + (color === highlightColor ? ' active' : '');
      swatch.style.background = color;
      swatch.dataset.color = color;
      swatch.title = color;
      swatch.addEventListener('click', () => selectColor(color));
      grid.appendChild(swatch);
    }

    const customInput = document.getElementById('custom-color');
    if (customInput) {
      customInput.value = highlightColor;
      customInput.addEventListener('input', (e) => {
        selectColor(e.target.value);
      });
    }
  }

  function selectColor(color) {
    highlightColor = color;

    // Update active swatch
    document.querySelectorAll('.sp-color-swatch').forEach((s) => {
      s.classList.toggle('active', s.dataset.color === color);
    });

    // Update custom input
    const customInput = document.getElementById('custom-color');
    if (customInput) customInput.value = color;

    // Send to content script
    sendHighlightColor(color);
  }

  async function sendHighlightColor(color) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'set-highlight-color', color });
      }
    } catch (_) {}
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    if (!str) return '';
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
})();
