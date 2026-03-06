/**
 * Clarity Video Generator
 * Generates smooth 60fps animated videos from captured guide steps.
 * Renders cursor movement, zoom effects, and step annotations onto a canvas,
 * then encodes to WebM via MediaRecorder.
 */

// ── 30 Cursor Styles ────────────────────────────────────────────────────

const CURSOR_STYLES = [
  // Classic — big, bold, visible cursors
  { id: 'default',       name: 'Default Arrow',     category: 'Classic',   color: '#000000', size: 36 },
  { id: 'white-arrow',   name: 'White Arrow',       category: 'Classic',   color: '#ffffff', size: 36, stroke: '#000' },
  { id: 'crosshair',     name: 'Crosshair',         category: 'Classic',   color: '#000000', size: 32, shape: 'crosshair' },
  { id: 'hand',          name: 'Hand Pointer',       category: 'Classic',   color: '#000000', size: 38, shape: 'hand' },
  { id: 'dot',           name: 'Simple Dot',         category: 'Classic',   color: '#000000', size: 22, shape: 'dot' },

  // Colored — large colored arrows
  { id: 'red-arrow',     name: 'Red Arrow',          category: 'Colored',   color: '#FF3B30', size: 36 },
  { id: 'blue-arrow',    name: 'Blue Arrow',         category: 'Colored',   color: '#007AFF', size: 36 },
  { id: 'green-arrow',   name: 'Green Arrow',        category: 'Colored',   color: '#34C759', size: 36 },
  { id: 'purple-arrow',  name: 'Purple Arrow',       category: 'Colored',   color: '#AF52DE', size: 36 },
  { id: 'orange-arrow',  name: 'Orange Arrow',       category: 'Colored',   color: '#FF9500', size: 36 },

  // Circles — prominent filled circles
  { id: 'circle-black',  name: 'Black Circle',       category: 'Circles',   color: '#000000', size: 28, shape: 'circle' },
  { id: 'circle-red',    name: 'Red Circle',         category: 'Circles',   color: '#FF3B30', size: 28, shape: 'circle' },
  { id: 'circle-blue',   name: 'Blue Circle',        category: 'Circles',   color: '#007AFF', size: 28, shape: 'circle' },
  { id: 'circle-white',  name: 'White Circle',       category: 'Circles',   color: '#ffffff', size: 28, shape: 'circle', stroke: '#000' },
  { id: 'circle-glow',   name: 'Glow Circle',        category: 'Circles',   color: '#007AFF', size: 32, shape: 'circle', glow: true },

  // Rings — large outline rings
  { id: 'ring-black',    name: 'Black Ring',         category: 'Rings',     color: '#000000', size: 34, shape: 'ring' },
  { id: 'ring-red',      name: 'Red Ring',           category: 'Rings',     color: '#FF3B30', size: 34, shape: 'ring' },
  { id: 'ring-blue',     name: 'Blue Ring',          category: 'Rings',     color: '#007AFF', size: 34, shape: 'ring' },
  { id: 'ring-white',    name: 'White Ring',         category: 'Rings',     color: '#ffffff', size: 34, shape: 'ring', stroke: '#000' },
  { id: 'ring-pulse',    name: 'Pulse Ring',         category: 'Rings',     color: '#FF3B30', size: 38, shape: 'ring', pulse: true },

  // Figma-style — BIG like real Figma collaborative cursors
  { id: 'figma-black',   name: 'Figma Black',        category: 'Figma',     color: '#000000', size: 48, shape: 'figma' },
  { id: 'figma-blue',    name: 'Figma Blue',         category: 'Figma',     color: '#007AFF', size: 48, shape: 'figma' },
  { id: 'figma-red',     name: 'Figma Red',          category: 'Figma',     color: '#FF3B30', size: 48, shape: 'figma' },
  { id: 'figma-green',   name: 'Figma Green',        category: 'Figma',     color: '#34C759', size: 48, shape: 'figma' },
  { id: 'figma-white',   name: 'Figma White',        category: 'Figma',     color: '#ffffff', size: 48, shape: 'figma', stroke: '#000' },

  // Special — dramatic, attention-grabbing
  { id: 'spotlight',     name: 'Spotlight',           category: 'Special',   color: '#000000', size: 72, shape: 'spotlight' },
  { id: 'target',        name: 'Target',              category: 'Special',   color: '#FF3B30', size: 42, shape: 'target' },
  { id: 'diamond',       name: 'Diamond',             category: 'Special',   color: '#FF9500', size: 28, shape: 'diamond' },
  { id: 'trail-dots',    name: 'Trail Dots',          category: 'Special',   color: '#007AFF', size: 16, shape: 'dot', trail: true },
  { id: 'neon-glow',     name: 'Neon Glow',           category: 'Special',   color: '#00FF88', size: 26, shape: 'circle', glow: true, neon: true },
];

function getCursorCategories() {
  const cats = [];
  for (const c of CURSOR_STYLES) {
    if (!cats.includes(c.category)) cats.push(c.category);
  }
  return cats;
}

function getCursorsByCategory(cat) {
  return CURSOR_STYLES.filter((c) => c.category === cat);
}

function getCursorStyle(id) {
  return CURSOR_STYLES.find((c) => c.id === id) || CURSOR_STYLES[0];
}

// ── Cursor Renderer ─────────────────────────────────────────────────────

function drawCursor(ctx, style, x, y, opts = {}) {
  ctx.save();
  const s = style.size;
  const shape = style.shape || 'arrow';

  // Glow effect
  if (style.glow || style.neon) {
    ctx.shadowColor = style.neon ? style.color : 'rgba(0,122,255,0.5)';
    ctx.shadowBlur = style.neon ? 16 : 10;
  }

  switch (shape) {
    case 'arrow':
      drawArrowCursor(ctx, x, y, s, style.color, style.stroke);
      break;
    case 'figma':
      drawFigmaCursor(ctx, x, y, s, style.color, style.stroke);
      break;
    case 'dot':
      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.arc(x, y, s / 2, 0, Math.PI * 2);
      ctx.fill();
      if (style.stroke) { ctx.strokeStyle = style.stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
      break;
    case 'circle':
      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.arc(x, y, s / 2, 0, Math.PI * 2);
      ctx.fill();
      if (style.stroke) { ctx.strokeStyle = style.stroke; ctx.lineWidth = 2; ctx.stroke(); }
      break;
    case 'ring':
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, s / 2, 0, Math.PI * 2);
      ctx.stroke();
      // Inner dot
      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      if (style.pulse && opts.t !== undefined) {
        const pulseR = s / 2 + (opts.t % 1) * 25;
        ctx.globalAlpha = 1 - (opts.t % 1);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, pulseR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      break;
    case 'crosshair':
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
      ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.45, 0, Math.PI * 2);
      ctx.stroke();
      // Center dot
      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'hand':
      drawArrowCursor(ctx, x, y, s, style.color, style.stroke);
      break;
    case 'spotlight':
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    case 'target':
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, s / 2, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, s / 3, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, s / 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = style.color;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'diamond':
      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.moveTo(x, y - s / 2);
      ctx.lineTo(x + s / 2, y);
      ctx.lineTo(x, y + s / 2);
      ctx.lineTo(x - s / 2, y);
      ctx.closePath();
      ctx.fill();
      break;
  }

  ctx.restore();
}

function drawArrowCursor(ctx, x, y, s, color, stroke) {
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x + s * 0.35, y + s * 0.7);
  ctx.lineTo(x + s * 0.55, y + s);
  ctx.lineTo(x + s * 0.7, y + s * 0.9);
  ctx.lineTo(x + s * 0.5, y + s * 0.6);
  ctx.lineTo(x + s * 0.85, y + s * 0.55);
  ctx.closePath();

  // Draw thick white outline first for contrast, then fill
  ctx.strokeStyle = stroke || (color === '#000000' ? '#fff' : '#000');
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawFigmaCursor(ctx, x, y, s, color, stroke) {
  // Main cursor pointer — Figma-style with thick outline
  ctx.fillStyle = color;
  ctx.strokeStyle = stroke || (color === '#ffffff' ? '#000' : '#fff');
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + s * 1.1);
  ctx.lineTo(x + s * 0.3, y + s * 0.82);
  ctx.lineTo(x + s * 0.55, y + s * 1.2);
  ctx.lineTo(x + s * 0.72, y + s * 1.1);
  ctx.lineTo(x + s * 0.45, y + s * 0.72);
  ctx.lineTo(x + s * 0.82, y + s * 0.72);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();

  // Figma-style name tag below cursor
  const tagX = x + s * 0.15;
  const tagY = y + s * 1.25;
  const tagText = 'You';
  ctx.font = `bold ${Math.round(s * 0.28)}px -apple-system, sans-serif`;
  const textW = ctx.measureText(tagText).width;
  const tagPadX = s * 0.15;
  const tagPadY = s * 0.08;
  const tagH = s * 0.35;
  const tagW = textW + tagPadX * 2;

  // Tag background (same color as cursor)
  ctx.fillStyle = color === '#ffffff' ? '#000' : color;
  const tagR = s * 0.08;
  ctx.beginPath();
  ctx.moveTo(tagX + tagR, tagY);
  ctx.lineTo(tagX + tagW - tagR, tagY);
  ctx.quadraticCurveTo(tagX + tagW, tagY, tagX + tagW, tagY + tagR);
  ctx.lineTo(tagX + tagW, tagY + tagH - tagR);
  ctx.quadraticCurveTo(tagX + tagW, tagY + tagH, tagX + tagW - tagR, tagY + tagH);
  ctx.lineTo(tagX + tagR, tagY + tagH);
  ctx.quadraticCurveTo(tagX, tagY + tagH, tagX, tagY + tagH - tagR);
  ctx.lineTo(tagX, tagY + tagR);
  ctx.quadraticCurveTo(tagX, tagY, tagX + tagR, tagY);
  ctx.closePath();
  ctx.fill();

  // Tag text
  ctx.fillStyle = color === '#ffffff' ? '#fff' : '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(tagText, tagX + tagPadX, tagY + tagH / 2);
}

// ── Draw cursor preview thumbnail ───────────────────────────────────────

function drawCursorPreview(canvas, style) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Scale down for preview — draw at canvas center, reduced size for thumbnail
  const previewStyle = { ...style, size: Math.min(style.size, 28) };
  drawCursor(ctx, previewStyle, canvas.width * 0.3, canvas.height * 0.2, { t: 0 });
}

// ── Easing Functions ────────────────────────────────────────────────────

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

// ══════════════════════════════════════════════════════════════════════════
// VIDEO GENERATOR
// ══════════════════════════════════════════════════════════════════════════

/**
 * Generate a video from captured guide steps.
 * @param {object} session - the guide session with steps
 * @param {object} options
 * @param {string} options.cursorStyleId - id from CURSOR_STYLES
 * @param {number} options.width - video width (default 1280)
 * @param {number} options.height - video height (default 720)
 * @param {number} options.fps - frames per second (default 60)
 * @param {number} options.stepDuration - ms to hold on each step (default 2000)
 * @param {number} options.transitionDuration - ms for cursor travel (default 800)
 * @param {number} options.zoomDuration - ms for zoom in+out (default 1200)
 * @param {number} options.zoomLevel - how much to zoom (default 1.8)
 * @param {function} options.onProgress - progress callback (0-1)
 * @returns {Promise<Blob>} - WebM video blob
 */
async function generateVideoFromSteps(session, options = {}) {
  const {
    cursorStyleId = 'default',
    width = 1280,
    height = 720,
    fps = 60,
    stepDuration = 2000,
    transitionDuration = 800,
    zoomDuration = 1200,
    zoomLevel = 1.8,
    onProgress = () => {},
  } = options;

  const steps = session.steps || [];
  if (steps.length === 0) throw new Error('No steps to animate');

  const cursorStyle = getCursorStyle(cursorStyleId);

  // Create off-screen canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Load all step screenshots as images — prefer FULL page screenshot for video
  const images = await Promise.all(
    steps.map((step) => {
      return new Promise((resolve) => {
        const src = step.screenshot || step.croppedScreenshot;
        if (!src) { resolve(null); return; }
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    })
  );

  // Set up MediaRecorder on canvas stream
  const stream = canvas.captureStream(fps);
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((t) => MediaRecorder.isTypeSupported(t)) || 'video/webm';

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 5000000,
  });

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const videoReady = new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start();

  // ── Timeline ────────────────────────────────────────────────────────
  // For each step: [travel to position] -> [zoom in] -> [hold] -> [zoom out]
  // Total frames calculation

  const framesPerMs = fps / 1000;
  const totalSteps = steps.length;
  const cursorTrail = []; // for trail cursor style

  // Start position (center of screen)
  let cursorX = width / 2;
  let cursorY = height / 2;

  for (let si = 0; si < totalSteps; si++) {
    const step = steps[si];
    const img = images[si];

    // Target position (center of element, mapped to canvas)
    const targetX = step.elementRect
      ? (step.elementRect.x + step.elementRect.width / 2) / (window.innerWidth || 1920) * width
      : width / 2;
    const targetY = step.elementRect
      ? (step.elementRect.y + step.elementRect.height / 2) / (window.innerHeight || 1080) * height
      : height / 2;

    const startX = cursorX;
    const startY = cursorY;

    // Phase 1: Cursor travels to target
    const travelFrames = Math.round(transitionDuration * framesPerMs);
    for (let f = 0; f < travelFrames; f++) {
      const t = f / travelFrames;
      const e = easeInOutCubic(t);
      cursorX = startX + (targetX - startX) * e;
      cursorY = startY + (targetY - startY) * e;

      renderFrame(ctx, img, width, height, cursorX, cursorY, cursorStyle, 1, 0, 0, step, cursorTrail, f / fps);
      await waitFrame();

      onProgress((si + t * 0.2) / totalSteps);
    }

    cursorX = targetX;
    cursorY = targetY;

    // Phase 2: Click ripple + zoom in
    const zoomInFrames = Math.round((zoomDuration / 2) * framesPerMs);
    for (let f = 0; f < zoomInFrames; f++) {
      const t = f / zoomInFrames;
      const e = easeOutQuart(t);
      const currentZoom = 1 + (zoomLevel - 1) * e;
      const rippleRadius = t * 40;
      const rippleAlpha = 1 - t;

      renderFrame(ctx, img, width, height, cursorX, cursorY, cursorStyle, currentZoom, rippleRadius, rippleAlpha, step, cursorTrail, f / fps);
      await waitFrame();

      onProgress((si + 0.2 + t * 0.2) / totalSteps);
    }

    // Phase 3: Hold at zoom
    const holdFrames = Math.round(stepDuration * framesPerMs);
    for (let f = 0; f < holdFrames; f++) {
      renderFrame(ctx, img, width, height, cursorX, cursorY, cursorStyle, zoomLevel, 0, 0, step, cursorTrail, f / fps);
      await waitFrame();

      onProgress((si + 0.4 + (f / holdFrames) * 0.4) / totalSteps);
    }

    // Phase 4: Zoom out
    const zoomOutFrames = Math.round((zoomDuration / 2) * framesPerMs);
    for (let f = 0; f < zoomOutFrames; f++) {
      const t = f / zoomOutFrames;
      const e = easeOutQuart(t);
      const currentZoom = zoomLevel - (zoomLevel - 1) * e;

      renderFrame(ctx, img, width, height, cursorX, cursorY, cursorStyle, currentZoom, 0, 0, step, cursorTrail, f / fps);
      await waitFrame();

      onProgress((si + 0.8 + t * 0.2) / totalSteps);
    }
  }

  // Final hold on last frame
  const lastImg = images[images.length - 1];
  const endHoldFrames = Math.round(1000 * framesPerMs);
  for (let f = 0; f < endHoldFrames; f++) {
    renderFrame(ctx, lastImg, width, height, cursorX, cursorY, cursorStyle, 1, 0, 0, steps[steps.length - 1], cursorTrail, f / fps);
    await waitFrame();
  }

  recorder.stop();
  onProgress(1);

  return videoReady;
}

// ── Frame Renderer ──────────────────────────────────────────────────────

function renderFrame(ctx, img, w, h, cx, cy, cursorStyle, zoom, rippleR, rippleA, step, trail, time) {
  ctx.save();
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, w, h);

  // Apply zoom transform around cursor position
  if (zoom !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
  }

  // Draw screenshot image (fit to canvas)
  if (img) {
    const imgAspect = img.width / img.height;
    const canvasAspect = w / h;
    let dw, dh, dx, dy;
    if (imgAspect > canvasAspect) {
      dw = w;
      dh = w / imgAspect;
      dx = 0;
      dy = (h - dh) / 2;
    } else {
      dh = h;
      dw = h * imgAspect;
      dx = (w - dw) / 2;
      dy = 0;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  // Draw step info overlay (bottom bar)
  if (step) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    const barH = 52;
    ctx.fillRect(0, h - barH, w, barH);

    // Step number badge
    ctx.fillStyle = step.highlightColor || '#FF2D55';
    ctx.beginPath();
    ctx.arc(28, h - barH / 2, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(step.number || ''), 28, h - barH / 2);

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = '600 14px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(step.title || `Step ${step.number}`, 52, h - barH / 2 - 8);

    // Description
    if (step.description) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.fillText(step.description.slice(0, 80), 52, h - barH / 2 + 10);
    }
  }

  ctx.restore();

  // Draw click ripple (unzoomed, on top)
  if (rippleR > 0 && rippleA > 0) {
    ctx.save();
    ctx.strokeStyle = (step?.highlightColor || '#FF2D55');
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = rippleA;
    ctx.beginPath();
    ctx.arc(cx, cy, rippleR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Draw cursor trail
  if (cursorStyle.trail && trail) {
    trail.push({ x: cx, y: cy, t: time });
    // Keep last 20 trail points
    while (trail.length > 20) trail.shift();
    for (let i = 0; i < trail.length - 1; i++) {
      const p = trail[i];
      const alpha = (i + 1) / trail.length * 0.4;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = cursorStyle.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, cursorStyle.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Draw cursor (unzoomed, on top of everything)
  drawCursor(ctx, cursorStyle, cx, cy, { t: time });
}

// ── Utility ─────────────────────────────────────────────────────────────

function waitFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}
