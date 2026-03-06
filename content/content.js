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
  let cursorStyle = 'ripple';
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
        <button class="clarity-tb-btn" id="clarity-btn-cursor" title="Cursor Style">${ICONS.cursor}</button>
      ` : ''}
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

    if (mode === 'recording') {
      document.getElementById('clarity-btn-zoom').addEventListener('click', handleZoomTrigger);
      document.getElementById('clarity-btn-cursor').addEventListener('click', handleCursorMenu);
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
    annotationLayer?.remove();
    hoverHighlight?.remove();
    clearAllBadges();
    toolbar = null;
    cursorOverlay = null;
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

  function removeLastBadge() {
    const last = stepBadges.pop();
    if (last) {
      last.badge._connector?.remove();
      last.badge.remove();
      last.highlight.remove();
    }
  }

  function clearAllBadges() {
    for (const b of stepBadges) {
      b.badge._connector?.remove();
      b.badge.remove();
      b.highlight.remove();
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

  // ── Cursor Effects ────────────────────────────────────────────────────

  function updateCursorEffect(x, y) {
    if (!cursorOverlay) return;

    if (cursorStyle === 'glow') {
      let glow = cursorOverlay.querySelector('.clarity-cursor-glow');
      if (!glow) { glow = document.createElement('div'); glow.className = 'clarity-cursor-glow'; cursorOverlay.appendChild(glow); }
      glow.style.left = x + 'px';
      glow.style.top = y + 'px';
    } else if (cursorStyle === 'spotlight') {
      let spot = cursorOverlay.querySelector('.clarity-cursor-spotlight');
      if (!spot) { spot = document.createElement('div'); spot.className = 'clarity-cursor-spotlight'; cursorOverlay.appendChild(spot); }
      spot.style.left = x + 'px';
      spot.style.top = y + 'px';
    } else if (cursorStyle === 'trail') {
      const dot = document.createElement('div');
      dot.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:6px;height:6px;border-radius:50%;background:rgba(0,0,0,0.3);pointer-events:none;transform:translate(-50%,-50%);transition:opacity 0.5s;`;
      cursorOverlay.appendChild(dot);
      setTimeout(() => { dot.style.opacity = '0'; setTimeout(() => dot.remove(), 500); }, 200);
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
      pulse.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,0.4);pointer-events:none;transform:translate(-50%,-50%) scale(1);animation:clarity-pulse-click 0.4s ease-out forwards;`;
      cursorOverlay.appendChild(pulse);
      setTimeout(() => pulse.remove(), 400);
    } else if (cursorStyle === 'particle') {
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        const dx = Math.cos(angle) * 30;
        const dy = Math.sin(angle) * 30;
        const p = document.createElement('div');
        p.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:4px;height:4px;border-radius:50%;background:#000;pointer-events:none;transform:translate(-50%,-50%);transition:all 0.4s ease-out;opacity:1;`;
        cursorOverlay.appendChild(p);
        requestAnimationFrame(() => { p.style.left = (x + dx) + 'px'; p.style.top = (y + dy) + 'px'; p.style.opacity = '0'; });
        setTimeout(() => p.remove(), 400);
      }
    }
  }

  // ── Cursor Style Menu ─────────────────────────────────────────────────

  function handleCursorMenu() {
    let dropdown = toolbar.querySelector('.clarity-dropdown');
    if (dropdown) { dropdown.classList.toggle('open'); return; }

    const styles = ['ripple', 'glow', 'trail', 'spotlight', 'pulse', 'particle'];
    dropdown = document.createElement('div');
    dropdown.className = 'clarity-dropdown open';

    for (const style of styles) {
      const btn = document.createElement('button');
      btn.className = 'clarity-dropdown-item' + (style === cursorStyle ? ' selected' : '');
      btn.textContent = style.charAt(0).toUpperCase() + style.slice(1);
      btn.addEventListener('click', () => {
        cursorStyle = style;
        if (cursorOverlay) cursorOverlay.innerHTML = '';
        dropdown.classList.remove('open');
      });
      dropdown.appendChild(btn);
    }

    toolbar.appendChild(dropdown);
    setTimeout(() => {
      const close = (e) => { if (!dropdown.contains(e.target)) { dropdown.classList.remove('open'); document.removeEventListener('click', close); } };
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
      if (e.target.closest('.clarity-tb-btn') || e.target.closest('.clarity-dropdown')) return;
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
