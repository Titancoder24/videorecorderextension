/**
 * Clarity Content Script v2
 * Smart element detection, auto-highlight with bounding boxes,
 * numbered badges with dashed connector lines, auto-zoom B-roll,
 * cropped element screenshots, and floating toolbar.
 */

(() => {
  'use strict';

  if (window.__clarityInjected) return;
  window.__clarityInjected = true;

  // ── State ───────────────────────────────────────────────────────────────

  let mode = null; // 'guide' | 'recording'
  let sessionId = null;
  let paused = false;
  let startTime = 0;
  let timerInterval = null;
  let toolbar = null;
  let cursorOverlay = null;
  let annotationLayer = null;
  let cursorStyle = 'default';
  let cursorFollower = null;
  let isAnnotating = false;
  let annotationStartPoint = null;
  let currentAnnotations = [];
  let stepCount = 0;
  let stepBadges = []; // DOM elements for on-page badges
  let hoverHighlight = null; // element highlight on hover
  let highlightColor = '#FF2D55'; // user-selected highlight color
  let isCapturingStep = false; // lock to prevent double-capture while comment input is open

  // Recording state
  let mediaRecorder = null;
  let recordedChunks = [];
  let mediaStream = null;
  let eventTimeline = [];

  // ── Icons ───────────────────────────────────────────────────────────────

  const ICONS = {
    stop: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>',
    zoom: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/><path d="M8 11h6M11 8v6"/></svg>',
    annotate: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    cursor: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4 2l14 10-6 1.5L9 20z"/></svg>',
  };

  // ── Cursor Definitions (30 styles) ─────────────────────────────────────
  // Each cursor has: name, svg (40x40 viewBox), hotX, hotY offset from top-left
  // Arrow path: clean triangle, NO tail/notch — just a solid pointer shape
  const ARROW_PATH = 'M8 4L8 34 18 26 24 36 28 34 22 24 32 22Z';
  const CURSOR_DEFS = {
    // === ARROWS (clean triangle, no tail) ===
    'default':      { name: 'Default',       category: 'Arrows', svg: null },
    'bold-arrow':   { name: 'Bold Arrow',    category: 'Arrows', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="${ARROW_PATH}" fill="#333" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>`, hotX: 8, hotY: 4 },
    'dark-arrow':   { name: 'Dark Arrow',    category: 'Arrows', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="${ARROW_PATH}" fill="#111" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>`, hotX: 8, hotY: 4 },
    'white-arrow':  { name: 'White Arrow',   category: 'Arrows', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="${ARROW_PATH}" fill="#fff" stroke="#222" stroke-width="2.5" stroke-linejoin="round"/></svg>`, hotX: 8, hotY: 4 },
    'neon-arrow':   { name: 'Neon Arrow',    category: 'Arrows', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><filter id="clarity-f-neon"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="${ARROW_PATH}" fill="#0ff" stroke="#fff" stroke-width="2" stroke-linejoin="round" filter="url(#clarity-f-neon)"/></svg>`, hotX: 8, hotY: 4 },
    'red-arrow':    { name: 'Red Arrow',     category: 'Arrows', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="${ARROW_PATH}" fill="#FF2D55" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>`, hotX: 8, hotY: 4 },
    'blue-arrow':   { name: 'Blue Arrow',    category: 'Arrows', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="${ARROW_PATH}" fill="#007AFF" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>`, hotX: 8, hotY: 4 },
    'green-arrow':  { name: 'Green Arrow',   category: 'Arrows', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="${ARROW_PATH}" fill="#34C759" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>`, hotX: 8, hotY: 4 },
    'orange-arrow': { name: 'Orange Arrow',  category: 'Arrows', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="${ARROW_PATH}" fill="#FF9500" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>`, hotX: 8, hotY: 4 },
    'purple-arrow': { name: 'Purple Arrow',  category: 'Arrows', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="${ARROW_PATH}" fill="#AF52DE" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>`, hotX: 8, hotY: 4 },
    'outline-arrow':{ name: 'Outline Arrow', category: 'Arrows', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="${ARROW_PATH}" fill="none" stroke="#333" stroke-width="3" stroke-linejoin="round"/></svg>`, hotX: 8, hotY: 4 },

    // === DOTS ===
    'dot-black':    { name: 'Black Dot',     category: 'Dots', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="10" fill="#111" stroke="#fff" stroke-width="3"/></svg>', hotX: 20, hotY: 20 },
    'dot-white':    { name: 'White Dot',     category: 'Dots', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="10" fill="#fff" stroke="#222" stroke-width="3"/></svg>', hotX: 20, hotY: 20 },
    'dot-red':      { name: 'Red Dot',       category: 'Dots', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="10" fill="#FF2D55" stroke="#fff" stroke-width="3"/></svg>', hotX: 20, hotY: 20 },
    'dot-blue':     { name: 'Blue Dot',      category: 'Dots', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="10" fill="#007AFF" stroke="#fff" stroke-width="3"/></svg>', hotX: 20, hotY: 20 },
    'dot-glow':     { name: 'Glow Dot',      category: 'Dots', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><filter id="clarity-f-dotglow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><circle cx="20" cy="20" r="7" fill="#FF2D55" filter="url(#clarity-f-dotglow)"/></svg>', hotX: 20, hotY: 20 },
    'dot-ring':     { name: 'Ring Dot',      category: 'Dots', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="12" fill="none" stroke="#333" stroke-width="3"/><circle cx="20" cy="20" r="4" fill="#333"/></svg>', hotX: 20, hotY: 20 },
    'dot-target':   { name: 'Target',        category: 'Dots', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="none" stroke="#FF2D55" stroke-width="2"/><circle cx="20" cy="20" r="8" fill="none" stroke="#FF2D55" stroke-width="2"/><circle cx="20" cy="20" r="3" fill="#FF2D55"/></svg>', hotX: 20, hotY: 20 },
    'dot-crosshair':{ name: 'Crosshair',     category: 'Dots', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><line x1="20" y1="4" x2="20" y2="16" stroke="#333" stroke-width="2.5" stroke-linecap="round"/><line x1="20" y1="24" x2="20" y2="36" stroke="#333" stroke-width="2.5" stroke-linecap="round"/><line x1="4" y1="20" x2="16" y2="20" stroke="#333" stroke-width="2.5" stroke-linecap="round"/><line x1="24" y1="20" x2="36" y2="20" stroke="#333" stroke-width="2.5" stroke-linecap="round"/><circle cx="20" cy="20" r="3" fill="#FF2D55"/></svg>', hotX: 20, hotY: 20 },

    // === SPARKLE / GLITTER ===
    'sparkle-gold': { name: 'Gold Sparkle',  category: 'Sparkle', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M20 4L22 16 34 14 24 20 34 26 22 24 20 36 18 24 6 26 16 20 6 14 18 16Z" fill="#FFD700" stroke="#B8860B" stroke-width="1"/></svg>', hotX: 20, hotY: 20 },
    'sparkle-white':{ name: 'White Sparkle', category: 'Sparkle', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M20 4L22 16 34 14 24 20 34 26 22 24 20 36 18 24 6 26 16 20 6 14 18 16Z" fill="#fff" stroke="#ccc" stroke-width="1"/></svg>', hotX: 20, hotY: 20 },
    'sparkle-pink': { name: 'Pink Sparkle',  category: 'Sparkle', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M20 4L22 16 34 14 24 20 34 26 22 24 20 36 18 24 6 26 16 20 6 14 18 16Z" fill="#FF69B4" stroke="#FF1493" stroke-width="1"/></svg>', hotX: 20, hotY: 20 },
    'star-gold':    { name: 'Gold Star',     category: 'Sparkle', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M20 4L24.5 15 36 15.5 27 22.5 30 34 20 27 10 34 13 22.5 4 15.5 15.5 15Z" fill="#FFD700" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>', hotX: 20, hotY: 20 },
    'diamond':      { name: 'Diamond',       category: 'Sparkle', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M20 4L34 20 20 36 6 20Z" fill="#87CEEB" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 4L34 20 20 36" fill="rgba(255,255,255,0.3)"/></svg>', hotX: 20, hotY: 20 },
    'glitter':      { name: 'Glitter',       category: 'Sparkle', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="8" fill="#FFD700" stroke="#fff" stroke-width="2"/><circle cx="12" cy="10" r="3" fill="#FFF" opacity="0.8"/><circle cx="30" cy="12" r="2.5" fill="#FFF" opacity="0.7"/><circle cx="28" cy="30" r="3" fill="#FFF" opacity="0.6"/><circle cx="10" cy="28" r="2" fill="#FFF" opacity="0.7"/><circle cx="20" cy="6" r="1.5" fill="#FFF" opacity="0.5"/></svg>', hotX: 20, hotY: 20 },

    // === SPECIAL ===
    'hand-point':   { name: 'Hand Point',    category: 'Special', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M18 8c0-2 3-2 3 0v10l2-1c1.5-1 3.5 0 2.5 2l-1 2 1.5 0c1.5 0 2.5 1.5 1.5 3l-5 7c-1 1.5-3 2.5-5 2.5h-3c-3 0-5-2-5-5v-8c0-2 3-2 3 0v3" fill="#FFDAB9" stroke="#333" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>', hotX: 18, hotY: 8 },
    'heart':        { name: 'Heart',         category: 'Special', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M20 34S4 24 4 14C4 8 9 4 14 4c3 0 5 2 6 4 1-2 3-4 6-4 5 0 10 4 10 10 0 10-16 20-16 20Z" fill="#FF2D55" stroke="#fff" stroke-width="2"/></svg>', hotX: 20, hotY: 34 },
    'lightning':    { name: 'Lightning',     category: 'Special', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M22 4L10 22h8l-4 14L30 16H20L22 4Z" fill="#FFD700" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/></svg>', hotX: 16, hotY: 4 },
    'fire':         { name: 'Fire',          category: 'Special', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M20 4C20 4 28 12 28 22C28 28 24.5 34 20 34C15.5 34 12 28 12 22C12 16 16 12 16 12C16 12 14 18 17 22C18 24 19 22 19 20C19 16 20 4 20 4Z" fill="#FF6600" stroke="#CC3300" stroke-width="1"/><path d="M20 18C20 18 24 22 24 26C24 30 22 32 20 32C18 32 16 30 16 26C16 22 20 18 20 18Z" fill="#FFD700"/></svg>', hotX: 20, hotY: 34 },
    'emoji-point':  { name: 'Pointer Hand',  category: 'Special', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><text x="4" y="32" font-size="32">&#x261D;</text></svg>', hotX: 16, hotY: 4 },
    'circle-pulse': { name: 'Pulse Circle',  category: 'Special', animated: true, svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="6" fill="rgba(255,45,85,0.8)" stroke="#fff" stroke-width="2"><animate attributeName="r" values="6;10;6" dur="1s" repeatCount="indefinite"/></circle><circle cx="20" cy="20" r="14" fill="none" stroke="rgba(255,45,85,0.3)" stroke-width="2"><animate attributeName="r" values="14;18;14" dur="1s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0;0.5" dur="1s" repeatCount="indefinite"/></circle></svg>', hotX: 20, hotY: 20 },
  };

  // ── Message Listener ────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case 'show-toolbar':
        mode = msg.mode;
        sessionId = msg.sessionId;
        stepCount = msg.resumeStepCount || 0;
        stepBadges = [];
        showToolbar();
        if (mode === 'recording') {
          initRecording();
        } else {
          initGuideCapture();
        }
        sendResponse({ ok: true });
        break;
      case 'hide-toolbar':
        hideToolbar();
        sendResponse({ ok: true });
        break;
      case 'set-paused':
        paused = msg.paused;
        updateToolbarState();
        sendResponse({ ok: true });
        break;
      case 'remove-last-badge':
        removeLastBadge();
        stepCount = msg.stepCount;
        sendResponse({ ok: true });
        break;
      case 'rebuild-badges':
        rebuildBadges(msg.steps);
        sendResponse({ ok: true });
        break;
      case 'set-highlight-color':
        highlightColor = msg.color || '#FF2D55';
        document.documentElement.style.setProperty('--clarity-highlight-color', highlightColor);
        sendResponse({ ok: true });
        break;
    }
  });

  // ── Toolbar ─────────────────────────────────────────────────────────────

  function showToolbar() {
    if (toolbar) toolbar.remove();

    toolbar = document.createElement('div');
    toolbar.id = 'clarity-toolbar';

    const recDot = mode === 'recording' ? '<div class="clarity-rec-dot"></div>' : '';
    const modeLabel = mode === 'guide' ? 'GUIDE' : 'REC';

    toolbar.innerHTML = `
      ${recDot}
      <span class="clarity-tb-label">${modeLabel}</span>
      <span class="clarity-timer" id="clarity-timer">00:00</span>
      <div class="clarity-tb-sep"></div>
      <button class="clarity-tb-btn" id="clarity-btn-pause" title="Pause">${ICONS.pause}</button>
      ${mode === 'recording' ? `
        <button class="clarity-tb-btn" id="clarity-btn-zoom" title="Zoom">${ICONS.zoom}</button>
      ` : ''}
      <button class="clarity-tb-btn" id="clarity-btn-cursor" title="Cursor Style">${ICONS.cursor}</button>
      <button class="clarity-tb-btn" id="clarity-btn-annotate" title="Annotate">${ICONS.annotate}</button>
      <div class="clarity-tb-sep"></div>
      <button class="clarity-tb-btn stop" id="clarity-btn-stop" title="Stop">${ICONS.stop}</button>
    `;

    document.body.appendChild(toolbar);

    // Set highlight color CSS variable
    document.documentElement.style.setProperty('--clarity-highlight-color', highlightColor);

    // Overlays
    cursorOverlay = document.createElement('div');
    cursorOverlay.id = 'clarity-cursor-overlay';
    document.body.appendChild(cursorOverlay);

    // Custom cursor follower
    cursorFollower = document.createElement('div');
    cursorFollower.id = 'clarity-cursor-follower';
    cursorFollower.style.display = 'none';
    document.body.appendChild(cursorFollower);

    // Track mouse for custom cursor
    document.addEventListener('mousemove', updateCursorFollower, true);
    applyCursorStyle();

    annotationLayer = document.createElement('canvas');
    annotationLayer.id = 'clarity-annotation-layer';
    annotationLayer.width = window.innerWidth;
    annotationLayer.height = window.innerHeight;
    document.body.appendChild(annotationLayer);

    // Hover highlight element
    hoverHighlight = document.createElement('div');
    hoverHighlight.id = 'clarity-hover-highlight';
    document.body.appendChild(hoverHighlight);

    // Bind events
    document.getElementById('clarity-btn-stop').addEventListener('click', handleStop);
    document.getElementById('clarity-btn-pause').addEventListener('click', handlePause);
    document.getElementById('clarity-btn-annotate').addEventListener('click', handleAnnotateToggle);

    document.getElementById('clarity-btn-cursor').addEventListener('click', handleCursorMenu);
    if (mode === 'recording') {
      document.getElementById('clarity-btn-zoom').addEventListener('click', handleZoomTrigger);
    }

    makeDraggable(toolbar);

    startTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);

    let idleTimer;
    toolbar.addEventListener('mouseenter', () => {
      clearTimeout(idleTimer);
      toolbar.classList.remove('idle');
    });
    toolbar.addEventListener('mouseleave', () => {
      idleTimer = setTimeout(() => toolbar.classList.add('idle'), 3000);
    });
  }

  function hideToolbar() {
    clearInterval(timerInterval);
    toolbar?.remove();
    cursorOverlay?.remove();
    cursorFollower?.remove();
    annotationLayer?.remove();
    hoverHighlight?.remove();
    clearAllBadges();
    document.removeEventListener('mousemove', updateCursorFollower, true);
    document.documentElement.classList.remove('clarity-custom-cursor');
    toolbar = null;
    cursorOverlay = null;
    cursorFollower = null;
    annotationLayer = null;
    hoverHighlight = null;
    removeGuideListeners();
    removeRecordingListeners();
    mode = null;
    sessionId = null;
    stepCount = 0;
  }

  // ── Toolbar Actions ─────────────────────────────────────────────────────

  async function handleStop() {
    if (mode === 'recording') stopRecording();
    await chrome.runtime.sendMessage({ type: 'stop-capture' });
    hideToolbar();
  }

  async function handlePause() {
    if (paused) {
      await chrome.runtime.sendMessage({ type: 'resume-capture' });
      paused = false;
    } else {
      await chrome.runtime.sendMessage({ type: 'pause-capture' });
      paused = true;
    }
    updateToolbarState();
  }

  function updateToolbarState() {
    const btn = document.getElementById('clarity-btn-pause');
    if (!btn) return;
    btn.innerHTML = paused ? ICONS.play : ICONS.pause;
    btn.title = paused ? 'Resume' : 'Pause';
  }

  function updateTimer() {
    if (paused) return;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    const el = document.getElementById('clarity-timer');
    if (el) el.textContent = `${m}:${s}`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GUIDE CAPTURE — Smart element detection, highlighting, badges
  // ══════════════════════════════════════════════════════════════════════════

  let guideClickHandler = null;
  let guideHoverHandler = null;

  function initGuideCapture() {
    // Hover highlight — show bounding box around hovered element
    guideHoverHandler = (e) => {
      if (paused || isAnnotating) return;
      if (isClarityElement(e.target)) {
        hideHoverHighlight();
        return;
      }

      const target = getInteractableElement(e.target);
      const rect = target.getBoundingClientRect();

      hoverHighlight.style.display = 'block';
      hoverHighlight.style.left = (rect.left + window.scrollX - 3) + 'px';
      hoverHighlight.style.top = (rect.top + window.scrollY - 3) + 'px';
      hoverHighlight.style.width = (rect.width + 6) + 'px';
      hoverHighlight.style.height = (rect.height + 6) + 'px';
    };

    // Click handler — capture step
    guideClickHandler = async (e) => {
      if (paused) return;
      if (isClarityElement(e.target)) return;
      if (isCapturingStep) return; // prevent double-capture while comment input is showing

      isCapturingStep = true;
      try {
        const target = getInteractableElement(e.target);
        const rect = target.getBoundingClientRect();
        const selector = getCssSelector(target);

        // Hide hover highlight during capture
        hideHoverHighlight();

        // Show highlight box around clicked element
        const highlight = createElementHighlight(rect, stepCount + 1);

        // Place numbered badge on the element
        const badge = createStepBadge(rect, stepCount + 1);
        stepBadges.push({ badge, highlight });

        // Micro-animation: capture pulse + confetti burst
        showCapturePulse(e.clientX, e.clientY);
        showCaptureConfetti(e.clientX, e.clientY);

        // Capture screenshot BEFORE showing comment input (clean screenshot)
        let croppedScreenshot = null;
        try {
          const res = await chrome.runtime.sendMessage({ type: 'capture-screenshot' });
          if (res?.dataUrl) {
            croppedScreenshot = await cropScreenshot(res.dataUrl, rect, window.innerWidth, window.innerHeight);
            // Keep screenshots under 200KB to prevent storage bloat
            if (croppedScreenshot && croppedScreenshot.length > 200000) {
              croppedScreenshot = await recompressScreenshot(croppedScreenshot, 0.65);
            }
          }
        } catch (err) {
          console.warn('[Clarity] Screenshot capture failed:', err);
        }

        // Smart title generation
        const title = generateSmartTitle(target);

        // Show inline comment input and wait for user to type + confirm
        const comment = await showInlineCommentInput(rect, stepCount + 1);

        stepCount++;

        const step = {
          id: crypto.randomUUID(),
          number: stepCount,
          url: window.location.href,
          selector,
          cursorX: e.clientX,
          cursorY: e.clientY,
          elementRect: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          },
          elementText: target.textContent?.trim().slice(0, 100) || '',
          tagName: target.tagName.toLowerCase(),
          screenshot: null,
          croppedScreenshot,
          highlightColor,
          timestamp: Date.now(),
          title,
          description: comment || '',
          annotations: [],
        };

        console.log(`[Clarity] Saving step #${stepCount}:`, {
          title,
          description: comment || '(empty)',
          hasScreenshot: !!croppedScreenshot,
          screenshotSize: croppedScreenshot ? Math.round(croppedScreenshot.length / 1024) + 'KB' : 'none',
        });

        const addRes = await chrome.runtime.sendMessage({
          type: 'add-step',
          sessionId,
          step,
        });

        if (addRes?.error) {
          console.error('[Clarity] Failed to save step:', addRes.error);
          showStepCountToast(stepCount, true); // show error toast
        } else {
          console.log('[Clarity] Step saved successfully, total:', addRes.stepCount);
          // Show saved comment overlay on the page if comment exists
          if (comment) {
            showCommentOverlay(rect, stepCount, comment);
          }
          // Show toast
          showStepCountToast(stepCount);
        }
      } catch (err) {
        console.error('[Clarity] Step capture error:', err);
      } finally {
        isCapturingStep = false;
      }
    };

    document.addEventListener('mousemove', guideHoverHandler, { passive: true });
    document.addEventListener('click', guideClickHandler, true);
  }

  function removeGuideListeners() {
    if (guideClickHandler) {
      document.removeEventListener('click', guideClickHandler, true);
      guideClickHandler = null;
    }
    if (guideHoverHandler) {
      document.removeEventListener('mousemove', guideHoverHandler);
      guideHoverHandler = null;
    }
  }

  // ── Smart Element Detection ─────────────────────────────────────────────

  function getInteractableElement(target) {
    // Walk up to find the most meaningful interactive element
    let el = target;
    for (let i = 0; i < 5; i++) {
      if (!el || el === document.body) break;

      const tag = el.tagName.toLowerCase();
      // If it's a known interactive element, use it
      if (['button', 'a', 'input', 'select', 'textarea', 'label'].includes(tag)) return el;
      // If it has a click role
      if (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link') return el;
      // If it has an onclick
      if (el.onclick) return el;

      // Check if parent is a better choice
      const parent = el.parentElement;
      if (parent && parent !== document.body) {
        const parentTag = parent.tagName.toLowerCase();
        if (['button', 'a', 'li', 'label'].includes(parentTag)) {
          return parent;
        }
        // If parent has less than ~200px more area, prefer parent for cleaner highlight
        const elRect = el.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        const elArea = elRect.width * elRect.height;
        const parentArea = parentRect.width * parentRect.height;
        if (parentArea > 0 && parentArea < elArea * 2 && parentArea < 50000) {
          el = parent;
          continue;
        }
      }
      break;
    }
    return el;
  }

  // ── Smart Title Generation ──────────────────────────────────────────────

  function generateSmartTitle(el) {
    const tag = el.tagName.toLowerCase();
    const text = el.textContent?.trim().slice(0, 60) || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const placeholder = el.getAttribute('placeholder') || '';
    const title = el.getAttribute('title') || '';
    const alt = el.getAttribute('alt') || '';

    // Prefer human-readable labels
    const label = ariaLabel || title || alt || placeholder || text;

    if (tag === 'a') return `Click on "${label || 'link'}"`;
    if (tag === 'button') return `Click on "${label || 'button'}"`;
    if (tag === 'input') {
      const type = el.getAttribute('type') || 'text';
      if (type === 'submit') return `Click "${label || 'Submit'}"`;
      if (type === 'checkbox') return `Toggle "${label || 'checkbox'}"`;
      return `Type in "${label || 'field'}"`;
    }
    if (tag === 'select') return `Select from "${label || 'dropdown'}"`;
    if (tag === 'textarea') return `Type in "${label || 'text area'}"`;
    if (tag === 'img') return `Click on image${alt ? ` "${alt}"` : ''}`;

    if (label && label.length <= 60) {
      return `Click on "${label}"`;
    }

    return `Click on ${tag}`;
  }

  // ── Element Highlight Box ───────────────────────────────────────────────

  function createElementHighlight(rect, number) {
    const el = document.createElement('div');
    el.className = 'clarity-element-highlight';
    el.style.left = (rect.left + window.scrollX - 4) + 'px';
    el.style.top = (rect.top + window.scrollY - 4) + 'px';
    el.style.width = (rect.width + 8) + 'px';
    el.style.height = (rect.height + 8) + 'px';
    document.body.appendChild(el);
    return el;
  }

  // ── Numbered Step Badge ─────────────────────────────────────────────────

  function createStepBadge(rect, number) {
    const badge = document.createElement('div');
    badge.className = 'clarity-step-badge';
    badge.textContent = number;

    // Position badge at top-left of element, offset outward
    const badgeX = rect.left + window.scrollX - 16;
    const badgeY = rect.top + window.scrollY - 16;
    badge.style.left = badgeX + 'px';
    badge.style.top = badgeY + 'px';

    document.body.appendChild(badge);

    // Create dashed connector line from badge to element center
    const line = document.createElement('div');
    line.className = 'clarity-badge-connector';
    const cx = rect.left + window.scrollX + rect.width / 2;
    const cy = rect.top + window.scrollY + rect.height / 2;
    const bx = badgeX + 14;
    const by = badgeY + 14;
    const length = Math.sqrt((cx - bx) ** 2 + (cy - by) ** 2);
    const angle = Math.atan2(cy - by, cx - bx) * 180 / Math.PI;

    line.style.left = bx + 'px';
    line.style.top = by + 'px';
    line.style.width = length + 'px';
    line.style.transform = `rotate(${angle}deg)`;
    document.body.appendChild(line);

    badge._connector = line;
    return badge;
  }

  function showCommentOverlay(rect, number, text) {
    const overlay = document.createElement('div');
    overlay.className = 'clarity-comment-overlay';
    // Position below the element highlight
    const left = rect.left + window.scrollX;
    const top = rect.top + window.scrollY + rect.height + 8;
    overlay.style.left = left + 'px';
    overlay.style.top = top + 'px';
    overlay.innerHTML = `
      <span class="clarity-comment-overlay-badge">${number}</span>
      <span class="clarity-comment-overlay-text">${text.length > 60 ? text.slice(0, 60) + '...' : text}</span>
    `;
    document.body.appendChild(overlay);
    // Store reference for cleanup
    if (stepBadges.length > 0) {
      stepBadges[stepBadges.length - 1].commentOverlay = overlay;
    }
  }

  function removeLastBadge() {
    const last = stepBadges.pop();
    if (last) {
      last.badge._connector?.remove();
      last.badge.remove();
      last.highlight.remove();
      last.commentOverlay?.remove();
    }
  }

  function clearAllBadges() {
    for (const b of stepBadges) {
      b.badge._connector?.remove();
      b.badge.remove();
      b.highlight.remove();
      b.commentOverlay?.remove();
    }
    stepBadges = [];
  }

  function rebuildBadges(steps) {
    clearAllBadges();
    stepCount = 0;
    for (const step of steps) {
      const el = step.selector ? document.querySelector(step.selector) : null;
      if (el) {
        const rect = el.getBoundingClientRect();
        stepCount++;
        const highlight = createElementHighlight(rect, stepCount);
        const badge = createStepBadge(rect, stepCount);
        stepBadges.push({ badge, highlight });
      } else {
        stepCount++;
      }
    }
  }

  // ── Hover Highlight ─────────────────────────────────────────────────────

  function hideHoverHighlight() {
    if (hoverHighlight) hoverHighlight.style.display = 'none';
  }

  function isClarityElement(el) {
    if (!el) return false;
    return el.closest('#clarity-toolbar') ||
           el.closest('#clarity-cursor-overlay') ||
           el.closest('#clarity-cursor-follower') ||
           el.closest('#clarity-annotation-layer') ||
           el.closest('#clarity-hover-highlight') ||
           el.closest('.clarity-step-badge') ||
           el.closest('.clarity-element-highlight') ||
           el.closest('.clarity-badge-connector') ||
           el.closest('.clarity-comment-input');
  }

  // ── Cropped Screenshot (high quality, for side panel thumbnail) ─────

  async function cropScreenshot(dataUrl, elementRect, viewW, viewH) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scaleX = img.width / viewW;
        const scaleY = img.height / viewH;

        // Add generous padding around the element
        const padX = Math.max(80, elementRect.width * 0.5);
        const padY = Math.max(60, elementRect.height * 0.5);

        let sx = Math.max(0, (elementRect.left - padX) * scaleX);
        let sy = Math.max(0, (elementRect.top - padY) * scaleY);
        let sw = Math.min(img.width - sx, (elementRect.width + padX * 2) * scaleX);
        let sh = Math.min(img.height - sy, (elementRect.height + padY * 2) * scaleY);

        if (sw < 200) { sx = Math.max(0, sx - 100); sw = Math.min(img.width - sx, sw + 200); }
        if (sh < 150) { sy = Math.max(0, sy - 75); sh = Math.min(img.height - sy, sh + 150); }

        const canvas = document.createElement('canvas');
        // Cap at 1200px wide for crisp but storage-efficient screenshots
        const maxW = 1200;
        const ratio = Math.min(1, maxW / sw);
        canvas.width = Math.round(sw * ratio);
        canvas.height = Math.round(sh * ratio);

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

        // Draw highlight box on the element (scaled to canvas)
        const hlX = ((elementRect.left * scaleX) - sx) * ratio;
        const hlY = ((elementRect.top * scaleY) - sy) * ratio;
        const hlW = elementRect.width * scaleX * ratio;
        const hlH = elementRect.height * scaleY * ratio;

        ctx.strokeStyle = highlightColor;
        ctx.lineWidth = 3;
        roundRect(ctx, hlX - 3, hlY - 3, hlW + 6, hlH + 6, 8);
        ctx.stroke();

        // High quality JPEG — crisp and storage-efficient
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function recompressScreenshot(dataUrl, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Also scale down if too large
        const maxDim = 900;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Micro-Animations ───────────────────────────────────────────────────

  function showCapturePulse(x, y) {
    const pulse = document.createElement('div');
    pulse.className = 'clarity-capture-pulse';
    pulse.style.left = x + 'px';
    pulse.style.top = y + 'px';
    document.body.appendChild(pulse);
    setTimeout(() => pulse.remove(), 700);
  }

  function showCaptureConfetti(x, y) {
    const colors = ['#000', '#333', '#666', '#999', highlightColor];
    for (let i = 0; i < 12; i++) {
      const dot = document.createElement('div');
      dot.className = 'clarity-confetti-dot';
      const angle = (Math.PI * 2 * i) / 12 + (Math.random() - 0.5) * 0.5;
      const dist = 40 + Math.random() * 40;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const size = 3 + Math.random() * 4;
      const color = colors[Math.floor(Math.random() * colors.length)];
      dot.style.cssText = `
        position: fixed; left: ${x}px; top: ${y}px;
        width: ${size}px; height: ${size}px; border-radius: 50%;
        background: ${color}; pointer-events: none; z-index: 2147483647;
        transition: all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        opacity: 1;
      `;
      document.body.appendChild(dot);
      requestAnimationFrame(() => {
        dot.style.left = (x + dx) + 'px';
        dot.style.top = (y + dy - 20) + 'px';
        dot.style.opacity = '0';
      });
      setTimeout(() => dot.remove(), 600);
    }
  }

  // Show step count toast in corner
  function showStepCountToast(count, isError) {
    let toast = document.getElementById('clarity-step-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'clarity-step-toast';
      document.body.appendChild(toast);
    }
    if (isError) {
      toast.textContent = `Step ${count} — save failed!`;
      toast.style.background = '#FF3B30';
    } else {
      toast.textContent = `Step ${count} captured`;
      toast.style.background = '';
    }
    toast.className = 'clarity-step-toast show';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.className = 'clarity-step-toast';
    }, isError ? 3000 : 1500);
  }

  // ── Inline Comment Input (appears on page after each click) ────────────

  function showInlineCommentInput(elementRect, stepNumber) {
    return new Promise((resolve) => {
      // Remove any existing comment input
      const existing = document.getElementById('clarity-comment-input-wrap');
      if (existing) existing.remove();

      const wrap = document.createElement('div');
      wrap.id = 'clarity-comment-input-wrap';
      wrap.className = 'clarity-comment-input';

      // Position below the element, or above if no space below
      const spaceBelow = window.innerHeight - (elementRect.top + elementRect.height);
      const posTop = spaceBelow > 120
        ? elementRect.top + elementRect.height + 8
        : elementRect.top - 108;
      const posLeft = Math.max(8, Math.min(elementRect.left, window.innerWidth - 308));

      wrap.style.top = posTop + 'px';
      wrap.style.left = posLeft + 'px';

      wrap.innerHTML = `
        <div class="clarity-comment-header">
          <span class="clarity-comment-badge">${stepNumber}</span>
          <span class="clarity-comment-label">Add a comment</span>
        </div>
        <textarea class="clarity-comment-textarea" id="clarity-comment-textarea"
          placeholder="Describe this step... (Enter to save, Esc to skip)"
          rows="2"></textarea>
        <div class="clarity-comment-actions">
          <button class="clarity-comment-skip" id="clarity-comment-skip">Skip</button>
          <button class="clarity-comment-save" id="clarity-comment-save">Save</button>
        </div>
      `;

      document.body.appendChild(wrap);

      // Stop ALL click events inside the comment input from bubbling/capturing
      wrap.addEventListener('click', (ev) => { ev.stopPropagation(); ev.stopImmediatePropagation(); }, true);
      wrap.addEventListener('mousedown', (ev) => { ev.stopPropagation(); ev.stopImmediatePropagation(); }, true);
      wrap.addEventListener('mouseup', (ev) => { ev.stopPropagation(); ev.stopImmediatePropagation(); }, true);

      const textarea = document.getElementById('clarity-comment-textarea');
      const saveBtn = document.getElementById('clarity-comment-save');
      const skipBtn = document.getElementById('clarity-comment-skip');

      // Focus after a frame so click event doesn't interfere
      requestAnimationFrame(() => textarea.focus());

      let resolved = false;
      function finish(text) {
        if (resolved) return;
        resolved = true;
        wrap.classList.add('clarity-comment-exit');
        setTimeout(() => wrap.remove(), 200);
        resolve(text || '');
      }

      saveBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        finish(textarea.value.trim());
      });

      skipBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        finish('');
      });

      textarea.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          finish(textarea.value.trim());
        }
        if (ev.key === 'Escape') {
          ev.preventDefault();
          finish('');
        }
      });

      // Auto-dismiss after 15s if user ignores it
      setTimeout(() => finish(textarea.value.trim()), 15000);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN RECORDING — Auto-zoom B-roll, cursor effects
  // ══════════════════════════════════════════════════════════════════════════

  let mouseMoveHandler = null;
  let mouseClickHandler = null;

  async function initRecording() {
    try {
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', frameRate: { ideal: 30, max: 60 } },
        audio: false,
      });

      recordedChunks = [];
      eventTimeline = [];

      mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType: getSupportedMimeType(),
        videoBitsPerSecond: 2500000,
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = () => exportRecording();
      mediaRecorder.start(100);

      // Track cursor for post-processing + live effects
      mouseMoveHandler = (e) => {
        if (paused) return;
        eventTimeline.push({
          type: 'move',
          x: e.clientX,
          y: e.clientY,
          t: Date.now() - startTime,
        });
        updateCursorEffect(e.clientX, e.clientY);
      };

      mouseClickHandler = (e) => {
        if (paused) return;
        if (isClarityElement(e.target)) return;

        const target = getInteractableElement(e.target);
        const rect = target.getBoundingClientRect();

        eventTimeline.push({
          type: 'click',
          x: e.clientX,
          y: e.clientY,
          t: Date.now() - startTime,
          target: getCssSelector(target),
          elementRect: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          },
        });

        triggerClickAnimation(e.clientX, e.clientY);

        // Auto-zoom B-roll: zoom to clicked element
        triggerAutoZoom(rect);
      };

      document.addEventListener('mousemove', mouseMoveHandler, { passive: true });
      document.addEventListener('click', mouseClickHandler, true);

    } catch (err) {
      console.error('[Clarity] Recording failed:', err);
      await chrome.runtime.sendMessage({ type: 'stop-capture' });
      hideToolbar();
    }
  }

  // ── Auto-Zoom B-roll ───────────────────────────────────────────────────

  let autoZoomActive = false;

  function triggerAutoZoom(elementRect) {
    if (autoZoomActive) return;
    autoZoomActive = true;

    const cx = elementRect.x + elementRect.width / 2;
    const cy = elementRect.y + elementRect.height / 2;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Calculate zoom level based on element size
    const elementArea = elementRect.width * elementRect.height;
    const viewArea = vw * vh;
    const areaRatio = elementArea / viewArea;

    // Small elements get more zoom, large elements less
    let zoomLevel;
    if (areaRatio < 0.005) zoomLevel = 2.5;
    else if (areaRatio < 0.02) zoomLevel = 2.0;
    else if (areaRatio < 0.08) zoomLevel = 1.6;
    else zoomLevel = 1.3;

    // Record zoom event for post-processing
    eventTimeline.push({
      type: 'zoom',
      t: Date.now() - startTime,
      centerX: cx,
      centerY: cy,
      level: zoomLevel,
      duration: 600,
      elementRect,
    });

    // Live visual zoom effect using CSS transform on the page
    const translateX = -(cx - vw / 2) * (zoomLevel - 1);
    const translateY = -(cy - vh / 2) * (zoomLevel - 1);

    document.documentElement.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    document.documentElement.style.transformOrigin = `${cx}px ${cy}px`;
    document.documentElement.style.transform = `scale(${zoomLevel})`;

    // Show zoom indicator ring around element
    const ring = document.createElement('div');
    ring.className = 'clarity-zoom-ring';
    ring.style.left = (elementRect.x - 8) + 'px';
    ring.style.top = (elementRect.y - 8) + 'px';
    ring.style.width = (elementRect.width + 16) + 'px';
    ring.style.height = (elementRect.height + 16) + 'px';
    document.body.appendChild(ring);

    // Zoom back out after a hold period
    setTimeout(() => {
      document.documentElement.style.transform = 'scale(1)';
      ring.classList.add('fade-out');

      setTimeout(() => {
        document.documentElement.style.transition = '';
        document.documentElement.style.transformOrigin = '';
        document.documentElement.style.transform = '';
        ring.remove();
        autoZoomActive = false;
      }, 500);
    }, 1200);
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    // Clean up any zoom state
    document.documentElement.style.transition = '';
    document.documentElement.style.transformOrigin = '';
    document.documentElement.style.transform = '';
  }

  function removeRecordingListeners() {
    if (mouseMoveHandler) {
      document.removeEventListener('mousemove', mouseMoveHandler);
      mouseMoveHandler = null;
    }
    if (mouseClickHandler) {
      document.removeEventListener('click', mouseClickHandler, true);
      mouseClickHandler = null;
    }
  }

  function getSupportedMimeType() {
    const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return 'video/webm';
  }

  // ── Export Recording ──────────────────────────────────────────────────

  function exportRecording() {
    const blob = new Blob(recordedChunks, { type: getSupportedMimeType() });
    const url = URL.createObjectURL(blob);

    const metadata = {
      events: eventTimeline,
      cursorStyle,
      annotations: currentAnnotations,
      duration: Date.now() - startTime,
    };

    const metaBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });

    downloadFile(url, `clarity-recording-${Date.now()}.webm`);
    downloadFile(URL.createObjectURL(metaBlob), `clarity-metadata-${Date.now()}.json`);

    recordedChunks = [];
    eventTimeline = [];
  }

  function downloadFile(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
  }

  // ── Custom Cursor System ──────────────────────────────────────────────

  function updateCursorFollower(e) {
    if (!cursorFollower || cursorStyle === 'default') return;
    const def = CURSOR_DEFS[cursorStyle];
    if (!def) return;
    const hotX = def.hotX || 0;
    const hotY = def.hotY || 0;
    cursorFollower.style.transform = `translate(${e.clientX - hotX}px, ${e.clientY - hotY}px)`;
  }

  function applyCursorStyle() {
    if (!cursorFollower) return;
    const def = CURSOR_DEFS[cursorStyle];

    if (!def || !def.svg) {
      // Default cursor — hide follower, show normal cursor
      cursorFollower.style.display = 'none';
      document.documentElement.classList.remove('clarity-custom-cursor');
      return;
    }

    // Set the SVG as cursor follower content
    cursorFollower.innerHTML = def.svg;
    cursorFollower.style.display = 'block';
    document.documentElement.classList.add('clarity-custom-cursor');
  }

  function updateCursorEffect(x, y) {
    if (!cursorOverlay) return;

    // Glow — persistent glow under cursor
    if (cursorStyle === 'dot-glow' || cursorStyle === 'neon-arrow') {
      let glow = cursorOverlay.querySelector('.clarity-cursor-glow');
      if (!glow) { glow = document.createElement('div'); glow.className = 'clarity-cursor-glow'; cursorOverlay.appendChild(glow); }
      glow.style.left = x + 'px';
      glow.style.top = y + 'px';
    } else {
      const oldGlow = cursorOverlay.querySelector('.clarity-cursor-glow');
      if (oldGlow) oldGlow.remove();
    }

    // Spotlight — large soft light under cursor
    if (cursorStyle === 'dot-target' || cursorStyle === 'dot-crosshair') {
      let spot = cursorOverlay.querySelector('.clarity-cursor-spotlight');
      if (!spot) { spot = document.createElement('div'); spot.className = 'clarity-cursor-spotlight'; cursorOverlay.appendChild(spot); }
      spot.style.left = x + 'px';
      spot.style.top = y + 'px';
    } else {
      const oldSpot = cursorOverlay.querySelector('.clarity-cursor-spotlight');
      if (oldSpot) oldSpot.remove();
    }

    // Trail — dots that fade behind cursor for sparkle/glitter cursors
    if (cursorStyle.startsWith('sparkle') || cursorStyle === 'glitter' || cursorStyle === 'circle-pulse') {
      const dot = document.createElement('div');
      dot.className = 'clarity-cursor-trail-dot';
      dot.style.left = x + 'px';
      dot.style.top = y + 'px';
      if (cursorStyle === 'glitter') {
        const colors = ['#FFD700', '#FFF', '#FFE082', '#FFAB00'];
        dot.style.background = colors[Math.floor(Math.random() * colors.length)];
      }
      cursorOverlay.appendChild(dot);
      setTimeout(() => { dot.style.opacity = '0'; setTimeout(() => dot.remove(), 400); }, 150);
    }
  }

  function triggerClickAnimation(x, y) {
    if (!cursorOverlay) return;

    // Ripple — expanding ring on every click
    const ripple = document.createElement('div');
    ripple.className = 'clarity-cursor-ripple';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    cursorOverlay.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);

    // Pulse — second expanding circle for dot cursors
    if (cursorStyle.startsWith('dot-') || cursorStyle === 'circle-pulse') {
      const pulse = document.createElement('div');
      pulse.className = 'clarity-cursor-pulse';
      pulse.style.left = x + 'px';
      pulse.style.top = y + 'px';
      cursorOverlay.appendChild(pulse);
      setTimeout(() => pulse.remove(), 400);
    }

    // Particle burst — for sparkle/glitter cursors
    if (cursorStyle.startsWith('sparkle') || cursorStyle === 'glitter' || cursorStyle === 'star-gold' || cursorStyle === 'diamond') {
      const colors = cursorStyle === 'glitter'
        ? ['#FFD700', '#FFF', '#FFE082', '#FFAB00']
        : ['#FF2D55', '#FFD700', '#007AFF', '#fff', '#34C759'];
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI * 2 * i) / 10;
        const dist = 20 + Math.random() * 20;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        const p = document.createElement('div');
        p.className = 'clarity-cursor-particle';
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        cursorOverlay.appendChild(p);
        requestAnimationFrame(() => { p.style.left = (x + dx) + 'px'; p.style.top = (y + dy) + 'px'; p.style.opacity = '0'; });
        setTimeout(() => p.remove(), 500);
      }
    }
  }

  // ── Cursor Style Menu (Grid Picker) ────────────────────────────────────

  function handleCursorMenu() {
    let picker = toolbar.querySelector('.clarity-cursor-picker');
    if (picker) { picker.classList.toggle('open'); return; }

    picker = document.createElement('div');
    picker.className = 'clarity-cursor-picker open';

    // Group by category
    const categories = {};
    for (const [id, def] of Object.entries(CURSOR_DEFS)) {
      const cat = def.category || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push({ id, ...def });
    }

    for (const [catName, items] of Object.entries(categories)) {
      const catLabel = document.createElement('div');
      catLabel.className = 'clarity-cursor-cat';
      catLabel.textContent = catName;
      picker.appendChild(catLabel);

      const grid = document.createElement('div');
      grid.className = 'clarity-cursor-grid';

      for (const item of items) {
        const cell = document.createElement('button');
        cell.className = 'clarity-cursor-cell' + (item.id === cursorStyle ? ' selected' : '');
        cell.title = item.name;

        if (item.svg) {
          cell.innerHTML = item.svg;
        } else {
          // Default cursor icon
          cell.innerHTML = '<svg viewBox="0 0 40 40" width="40" height="40"><path d="M10 6L30 20 20 22 16 32Z" fill="#666" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
        }

        cell.addEventListener('click', (ev) => {
          ev.stopPropagation();
          cursorStyle = item.id;
          if (cursorOverlay) cursorOverlay.innerHTML = '';
          applyCursorStyle();
          // Update selection UI
          picker.querySelectorAll('.clarity-cursor-cell').forEach(c => c.classList.remove('selected'));
          cell.classList.add('selected');
        });
        grid.appendChild(cell);
      }
      picker.appendChild(grid);
    }

    toolbar.appendChild(picker);

    // Stop clicks inside picker from propagating to document
    picker.addEventListener('click', (ev) => ev.stopPropagation(), true);
    picker.addEventListener('mousedown', (ev) => ev.stopPropagation(), true);

    setTimeout(() => {
      const close = (e) => {
        if (!picker.contains(e.target) && !e.target.closest('#clarity-btn-cursor')) {
          picker.classList.remove('open');
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  }

  // ── Zoom Trigger (Manual) ─────────────────────────────────────────────

  function handleZoomTrigger() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    triggerAutoZoom({
      x: vw * 0.25,
      y: vh * 0.25,
      width: vw * 0.5,
      height: vh * 0.5,
    });
  }

  // ── Annotation Toggle ─────────────────────────────────────────────────

  function handleAnnotateToggle() {
    isAnnotating = !isAnnotating;
    const btn = document.getElementById('clarity-btn-annotate');
    if (btn) btn.classList.toggle('active', isAnnotating);
    if (annotationLayer) annotationLayer.classList.toggle('drawing', isAnnotating);

    if (isAnnotating) {
      annotationLayer.addEventListener('mousedown', annotationStart);
      annotationLayer.addEventListener('mousemove', annotationMove);
      annotationLayer.addEventListener('mouseup', annotationEnd);
    } else {
      annotationLayer.removeEventListener('mousedown', annotationStart);
      annotationLayer.removeEventListener('mousemove', annotationMove);
      annotationLayer.removeEventListener('mouseup', annotationEnd);
    }
  }

  function annotationStart(e) { annotationStartPoint = { x: e.clientX, y: e.clientY }; }
  function annotationMove(e) {
    if (!annotationStartPoint) return;
    const ctx = annotationLayer.getContext('2d');
    ctx.clearRect(0, 0, annotationLayer.width, annotationLayer.height);
    redrawAnnotations(ctx);
    drawArrow(ctx, annotationStartPoint.x, annotationStartPoint.y, e.clientX, e.clientY);
  }
  function annotationEnd(e) {
    if (!annotationStartPoint) return;
    const a = { type: 'arrow', startX: annotationStartPoint.x, startY: annotationStartPoint.y, endX: e.clientX, endY: e.clientY, timestamp: Date.now() - startTime };
    currentAnnotations.push(a);
    if (mode === 'recording') eventTimeline.push({ ...a, type: 'annotation', t: a.timestamp });
    annotationStartPoint = null;
  }

  function redrawAnnotations(ctx) {
    for (const a of currentAnnotations) {
      if (a.type === 'arrow') drawArrow(ctx, a.startX, a.startY, a.endX, a.endY);
    }
  }

  function drawArrow(ctx, x1, y1, x2, y2) {
    const headLen = 12;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  // ── Drag Support ──────────────────────────────────────────────────────

  function makeDraggable(el) {
    let isDragging = false, offsetX = 0, offsetY = 0;
    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('.clarity-tb-btn') || e.target.closest('.clarity-dropdown') || e.target.closest('.clarity-cursor-picker')) return;
      isDragging = true;
      offsetX = e.clientX - el.getBoundingClientRect().left;
      offsetY = e.clientY - el.getBoundingClientRect().top;
      el.style.cursor = 'grabbing';
      el.style.transition = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      el.style.left = (e.clientX - offsetX) + 'px';
      el.style.top = (e.clientY - offsetY) + 'px';
      el.style.bottom = 'auto';
      el.style.transform = 'none';
    });
    document.addEventListener('mouseup', () => { isDragging = false; if (el) el.style.cursor = 'grab'; });
  }

  // ── CSS Selector Generator ────────────────────────────────────────────

  function getCssSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;

    const parts = [];
    let current = el;
    while (current && current !== document.body && parts.length < 5) {
      let selector = current.tagName.toLowerCase();
      if (current.className && typeof current.className === 'string') {
        const cls = current.className.trim().split(/\s+/)
          .filter(c => !c.startsWith('clarity-'))
          .slice(0, 2)
          .map(c => CSS.escape(c))
          .join('.');
        if (cls) selector += '.' + cls;
      }
      // Add nth-child for uniqueness
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(s => s.tagName === current.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          selector += `:nth-child(${idx})`;
        }
      }
      parts.unshift(selector);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

})();
