/**
 * Clarity Content Script
 * Injects the floating toolbar, handles interaction tracking,
 * screen capture coordination, and annotation tools.
 */

(() => {
  'use strict';

  // Prevent double-injection
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
  let cursorStyle = 'ripple';
  let isAnnotating = false;
  let annotationStartPoint = null;
  let currentAnnotations = [];

  // Recording state
  let mediaRecorder = null;
  let recordedChunks = [];
  let mediaStream = null;
  let eventTimeline = [];
  let cursorTrail = [];

  // ── Icons (SVG strings) ─────────────────────────────────────────────────

  const ICONS = {
    stop: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>',
    zoom: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/><path d="M8 11h6M11 8v6"/></svg>',
    annotate: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    cursor: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4 2l14 10-6 1.5L9 20z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
  };

  // ── Message Listener ────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case 'show-toolbar':
        mode = msg.mode;
        sessionId = msg.sessionId;
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
    }
  });

  // ── Toolbar Creation ────────────────────────────────────────────────────

  function showToolbar() {
    if (toolbar) toolbar.remove();

    toolbar = document.createElement('div');
    toolbar.id = 'clarity-toolbar';

    const recDot = mode === 'recording'
      ? '<div class="clarity-rec-dot"></div>'
      : '';

    const modeLabel = mode === 'guide' ? 'GUIDE' : 'REC';

    toolbar.innerHTML = `
      ${recDot}
      <span class="clarity-tb-label">${modeLabel}</span>
      <span class="clarity-timer" id="clarity-timer">00:00</span>
      <div class="clarity-tb-sep"></div>
      <button class="clarity-tb-btn" id="clarity-btn-pause" title="Pause">${ICONS.pause}</button>
      ${mode === 'recording' ? `
        <button class="clarity-tb-btn" id="clarity-btn-zoom" title="Zoom">${ICONS.zoom}</button>
        <button class="clarity-tb-btn" id="clarity-btn-cursor" title="Cursor Style">${ICONS.cursor}</button>
      ` : ''}
      <button class="clarity-tb-btn" id="clarity-btn-annotate" title="Annotate">${ICONS.annotate}</button>
      <div class="clarity-tb-sep"></div>
      <button class="clarity-tb-btn stop" id="clarity-btn-stop" title="Stop">${ICONS.stop}</button>
    `;

    document.body.appendChild(toolbar);

    // Cursor overlay
    cursorOverlay = document.createElement('div');
    cursorOverlay.id = 'clarity-cursor-overlay';
    document.body.appendChild(cursorOverlay);

    // Annotation layer
    annotationLayer = document.createElement('canvas');
    annotationLayer.id = 'clarity-annotation-layer';
    annotationLayer.width = window.innerWidth;
    annotationLayer.height = window.innerHeight;
    document.body.appendChild(annotationLayer);

    // Bind events
    document.getElementById('clarity-btn-stop').addEventListener('click', handleStop);
    document.getElementById('clarity-btn-pause').addEventListener('click', handlePause);
    document.getElementById('clarity-btn-annotate').addEventListener('click', handleAnnotateToggle);

    if (mode === 'recording') {
      document.getElementById('clarity-btn-zoom').addEventListener('click', handleZoomTrigger);
      document.getElementById('clarity-btn-cursor').addEventListener('click', handleCursorMenu);
    }

    // Drag support
    makeDraggable(toolbar);

    // Start timer
    startTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);

    // Idle fade
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
    annotationLayer?.remove();
    toolbar = null;
    cursorOverlay = null;
    annotationLayer = null;
    removeGuideListeners();
    removeRecordingListeners();
    mode = null;
    sessionId = null;
  }

  // ── Toolbar Actions ─────────────────────────────────────────────────────

  async function handleStop() {
    if (mode === 'recording') {
      stopRecording();
    }
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

  // ── Timer ───────────────────────────────────────────────────────────────

  function updateTimer() {
    if (paused) return;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    const el = document.getElementById('clarity-timer');
    if (el) el.textContent = `${m}:${s}`;
  }

  // ── Guide Capture ──────────────────────────────────────────────────────

  let guideClickHandler = null;

  function initGuideCapture() {
    guideClickHandler = async (e) => {
      if (paused) return;
      if (toolbar?.contains(e.target)) return;
      if (annotationLayer?.contains(e.target)) return;

      const target = e.target;
      const selector = getCssSelector(target);

      // Flash effect
      const flash = document.createElement('div');
      flash.className = 'clarity-flash-overlay';
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 300);

      // Capture screenshot
      const res = await chrome.runtime.sendMessage({ type: 'capture-screenshot' });

      const step = {
        id: crypto.randomUUID(),
        number: 0, // set by background
        url: window.location.href,
        selector,
        cursorX: e.clientX,
        cursorY: e.clientY,
        elementText: target.textContent?.slice(0, 100) || '',
        tagName: target.tagName.toLowerCase(),
        screenshot: res?.dataUrl || null,
        timestamp: Date.now(),
        title: `Click on ${target.tagName.toLowerCase()}`,
        description: '',
        annotations: [],
      };

      await chrome.runtime.sendMessage({
        type: 'add-step',
        sessionId,
        step,
      });
    };

    document.addEventListener('click', guideClickHandler, true);
  }

  function removeGuideListeners() {
    if (guideClickHandler) {
      document.removeEventListener('click', guideClickHandler, true);
      guideClickHandler = null;
    }
  }

  // ── Screen Recording ──────────────────────────────────────────────────

  let mouseMoveHandler = null;
  let mouseClickHandler = null;

  async function initRecording() {
    try {
      // Use tab capture for lightweight recording
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          frameRate: { ideal: 30, max: 60 },
        },
        audio: false,
      });

      recordedChunks = [];
      eventTimeline = [];

      mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType: getSupportedMimeType(),
        videoBitsPerSecond: 2500000,
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        exportRecording();
      };

      mediaRecorder.start(100); // Collect in 100ms chunks

      // Track cursor for post-processing metadata
      mouseMoveHandler = (e) => {
        if (paused) return;
        eventTimeline.push({
          type: 'move',
          x: e.clientX,
          y: e.clientY,
          t: Date.now() - startTime,
        });

        // Update cursor effect
        updateCursorEffect(e.clientX, e.clientY);
      };

      mouseClickHandler = (e) => {
        if (paused) return;
        if (toolbar?.contains(e.target)) return;

        eventTimeline.push({
          type: 'click',
          x: e.clientX,
          y: e.clientY,
          t: Date.now() - startTime,
          target: getCssSelector(e.target),
        });

        // Trigger cursor click animation
        triggerClickAnimation(e.clientX, e.clientY);
      };

      document.addEventListener('mousemove', mouseMoveHandler, { passive: true });
      document.addEventListener('click', mouseClickHandler, true);

    } catch (err) {
      console.error('[Clarity] Recording failed:', err);
      await chrome.runtime.sendMessage({ type: 'stop-capture' });
      hideToolbar();
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
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
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return 'video/webm';
  }

  // ── Export Recording ──────────────────────────────────────────────────

  function exportRecording() {
    const blob = new Blob(recordedChunks, { type: getSupportedMimeType() });
    const url = URL.createObjectURL(blob);

    // Store timeline metadata alongside video
    const metadata = {
      events: eventTimeline,
      cursorStyle,
      annotations: currentAnnotations,
      duration: Date.now() - startTime,
    };

    // Save metadata for potential post-processing
    const metaBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });

    // Trigger download
    downloadFile(url, `clarity-recording-${Date.now()}.webm`);

    // Also save metadata
    const metaUrl = URL.createObjectURL(metaBlob);
    downloadFile(metaUrl, `clarity-metadata-${Date.now()}.json`);

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
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 100);
  }

  // ── Cursor Effects ────────────────────────────────────────────────────

  function updateCursorEffect(x, y) {
    if (!cursorOverlay) return;

    if (cursorStyle === 'glow') {
      let glow = cursorOverlay.querySelector('.clarity-cursor-glow');
      if (!glow) {
        glow = document.createElement('div');
        glow.className = 'clarity-cursor-glow';
        cursorOverlay.appendChild(glow);
      }
      glow.style.left = x + 'px';
      glow.style.top = y + 'px';
    } else if (cursorStyle === 'spotlight') {
      let spot = cursorOverlay.querySelector('.clarity-cursor-spotlight');
      if (!spot) {
        spot = document.createElement('div');
        spot.className = 'clarity-cursor-spotlight';
        cursorOverlay.appendChild(spot);
      }
      spot.style.left = x + 'px';
      spot.style.top = y + 'px';
    } else if (cursorStyle === 'trail') {
      const dot = document.createElement('div');
      dot.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: rgba(0,0,0,0.3);
        pointer-events: none;
        transform: translate(-50%, -50%);
        transition: opacity 0.5s;
      `;
      cursorOverlay.appendChild(dot);
      setTimeout(() => {
        dot.style.opacity = '0';
        setTimeout(() => dot.remove(), 500);
      }, 200);
    }
  }

  function triggerClickAnimation(x, y) {
    if (!cursorOverlay) return;

    if (cursorStyle === 'ripple' || cursorStyle === 'glow' || cursorStyle === 'spotlight') {
      const ripple = document.createElement('div');
      ripple.className = 'clarity-cursor-ripple';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      cursorOverlay.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    } else if (cursorStyle === 'pulse') {
      const pulse = document.createElement('div');
      pulse.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(0,0,0,0.4);
        pointer-events: none;
        transform: translate(-50%, -50%) scale(1);
        animation: clarity-pulse-click 0.4s ease-out forwards;
      `;
      cursorOverlay.appendChild(pulse);
      setTimeout(() => pulse.remove(), 400);
    } else if (cursorStyle === 'particle') {
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        const particle = document.createElement('div');
        const dx = Math.cos(angle) * 30;
        const dy = Math.sin(angle) * 30;
        particle.style.cssText = `
          position: absolute;
          left: ${x}px;
          top: ${y}px;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #000;
          pointer-events: none;
          transform: translate(-50%, -50%);
          transition: all 0.4s ease-out;
          opacity: 1;
        `;
        cursorOverlay.appendChild(particle);
        requestAnimationFrame(() => {
          particle.style.left = (x + dx) + 'px';
          particle.style.top = (y + dy) + 'px';
          particle.style.opacity = '0';
        });
        setTimeout(() => particle.remove(), 400);
      }
    }
  }

  // ── Cursor Style Menu ─────────────────────────────────────────────────

  function handleCursorMenu() {
    let dropdown = toolbar.querySelector('.clarity-dropdown');
    if (dropdown) {
      dropdown.classList.toggle('open');
      return;
    }

    const styles = ['ripple', 'glow', 'trail', 'spotlight', 'pulse', 'particle'];
    dropdown = document.createElement('div');
    dropdown.className = 'clarity-dropdown open';

    for (const style of styles) {
      const btn = document.createElement('button');
      btn.className = 'clarity-dropdown-item' + (style === cursorStyle ? ' selected' : '');
      btn.textContent = style.charAt(0).toUpperCase() + style.slice(1);
      btn.addEventListener('click', () => {
        cursorStyle = style;
        // Clear existing cursor effects
        if (cursorOverlay) cursorOverlay.innerHTML = '';
        dropdown.classList.remove('open');
      });
      dropdown.appendChild(btn);
    }

    toolbar.appendChild(dropdown);

    // Close on outside click
    setTimeout(() => {
      const close = (e) => {
        if (!dropdown.contains(e.target)) {
          dropdown.classList.remove('open');
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  }

  // ── Zoom Trigger ──────────────────────────────────────────────────────

  function handleZoomTrigger() {
    const zoomEvent = {
      type: 'zoom',
      t: Date.now() - startTime,
      centerX: window.innerWidth / 2,
      centerY: window.innerHeight / 2,
      level: 2,
      duration: 400,
    };
    eventTimeline.push(zoomEvent);

    // Visual feedback: brief zoom overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      border: 3px solid rgba(0,0,0,0.15);
      border-radius: 12px;
      pointer-events: none;
      z-index: 2147483644;
      animation: clarity-flash 0.3s ease-out forwards;
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 300);
  }

  // ── Annotation Toggle ─────────────────────────────────────────────────

  function handleAnnotateToggle() {
    isAnnotating = !isAnnotating;
    const btn = document.getElementById('clarity-btn-annotate');
    if (btn) btn.classList.toggle('active', isAnnotating);

    if (annotationLayer) {
      annotationLayer.classList.toggle('drawing', isAnnotating);
    }

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

  function annotationStart(e) {
    annotationStartPoint = { x: e.clientX, y: e.clientY };
  }

  function annotationMove(e) {
    if (!annotationStartPoint) return;
    const ctx = annotationLayer.getContext('2d');
    ctx.clearRect(0, 0, annotationLayer.width, annotationLayer.height);

    // Redraw existing annotations
    redrawAnnotations(ctx);

    // Draw current arrow
    drawArrow(ctx, annotationStartPoint.x, annotationStartPoint.y, e.clientX, e.clientY);
  }

  function annotationEnd(e) {
    if (!annotationStartPoint) return;
    const annotation = {
      type: 'arrow',
      startX: annotationStartPoint.x,
      startY: annotationStartPoint.y,
      endX: e.clientX,
      endY: e.clientY,
      timestamp: Date.now() - startTime,
    };
    currentAnnotations.push(annotation);

    if (mode === 'recording') {
      eventTimeline.push({ ...annotation, type: 'annotation', t: annotation.timestamp });
    }

    annotationStartPoint = null;
  }

  function redrawAnnotations(ctx) {
    for (const a of currentAnnotations) {
      if (a.type === 'arrow') {
        drawArrow(ctx, a.startX, a.startY, a.endX, a.endY);
      }
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
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  }

  // ── Drag Support ──────────────────────────────────────────────────────

  function makeDraggable(el) {
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('.clarity-tb-btn') || e.target.closest('.clarity-dropdown')) return;
      isDragging = true;
      offsetX = e.clientX - el.getBoundingClientRect().left;
      offsetY = e.clientY - el.getBoundingClientRect().top;
      el.style.cursor = 'grabbing';
      el.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.bottom = 'auto';
      el.style.transform = 'none';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      if (el) el.style.cursor = 'grab';
    });
  }

  // ── CSS Selector Generator ────────────────────────────────────────────

  function getCssSelector(el) {
    if (el.id) return `#${el.id}`;

    const parts = [];
    while (el && el !== document.body) {
      let selector = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        const cls = el.className.trim().split(/\s+/).slice(0, 2).join('.');
        if (cls) selector += '.' + cls;
      }
      parts.unshift(selector);
      el = el.parentElement;
    }
    return parts.join(' > ');
  }

})();
