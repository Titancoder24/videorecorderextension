/**
 * Clarity Comment Box Templates
 * 65 unique comment box styles organized by category.
 * Each template defines how to render a styled annotation callout on the editor canvas.
 */

const COMMENT_BOX_TEMPLATES = [
  // ── Speech Bubbles (1-8) ─────────────────────────────────────────────
  { id: 'speech-round-bl', name: 'Round Bubble', category: 'Speech Bubbles', bg: '#ffffff', border: '#000000', text: '#000000', radius: 16, tail: 'bottom-left', shadow: true },
  { id: 'speech-round-br', name: 'Round Right', category: 'Speech Bubbles', bg: '#ffffff', border: '#000000', text: '#000000', radius: 16, tail: 'bottom-right', shadow: true },
  { id: 'speech-round-tl', name: 'Round Top-Left', category: 'Speech Bubbles', bg: '#ffffff', border: '#000000', text: '#000000', radius: 16, tail: 'top-left', shadow: true },
  { id: 'speech-dark', name: 'Dark Bubble', category: 'Speech Bubbles', bg: '#1a1a1a', border: '#1a1a1a', text: '#ffffff', radius: 16, tail: 'bottom-left', shadow: true },
  { id: 'speech-blue', name: 'Blue Bubble', category: 'Speech Bubbles', bg: '#007AFF', border: '#007AFF', text: '#ffffff', radius: 16, tail: 'bottom-left', shadow: true },
  { id: 'speech-green', name: 'Green Bubble', category: 'Speech Bubbles', bg: '#34C759', border: '#34C759', text: '#ffffff', radius: 16, tail: 'bottom-right', shadow: true },
  { id: 'speech-sharp', name: 'Sharp Bubble', category: 'Speech Bubbles', bg: '#ffffff', border: '#000000', text: '#000000', radius: 2, tail: 'bottom-left', shadow: false },
  { id: 'speech-red', name: 'Red Bubble', category: 'Speech Bubbles', bg: '#FF3B30', border: '#FF3B30', text: '#ffffff', radius: 16, tail: 'bottom-left', shadow: true },

  // ── Callout Arrows (9-16) ────────────────────────────────────────────
  { id: 'callout-left', name: 'Arrow Left', category: 'Callout Arrows', bg: '#fff3cd', border: '#ffc107', text: '#664d03', radius: 8, arrow: 'left', shadow: true },
  { id: 'callout-right', name: 'Arrow Right', category: 'Callout Arrows', bg: '#fff3cd', border: '#ffc107', text: '#664d03', radius: 8, arrow: 'right', shadow: true },
  { id: 'callout-top', name: 'Arrow Top', category: 'Callout Arrows', bg: '#d1ecf1', border: '#0dcaf0', text: '#055160', radius: 8, arrow: 'top', shadow: true },
  { id: 'callout-bottom', name: 'Arrow Bottom', category: 'Callout Arrows', bg: '#d1ecf1', border: '#0dcaf0', text: '#055160', radius: 8, arrow: 'bottom', shadow: true },
  { id: 'callout-dark-left', name: 'Dark Arrow Left', category: 'Callout Arrows', bg: '#212529', border: '#212529', text: '#ffffff', radius: 8, arrow: 'left', shadow: true },
  { id: 'callout-dark-right', name: 'Dark Arrow Right', category: 'Callout Arrows', bg: '#212529', border: '#212529', text: '#ffffff', radius: 8, arrow: 'right', shadow: true },
  { id: 'callout-purple-top', name: 'Purple Arrow Top', category: 'Callout Arrows', bg: '#e8daff', border: '#9C27B0', text: '#4A148C', radius: 8, arrow: 'top', shadow: false },
  { id: 'callout-orange-bottom', name: 'Orange Arrow', category: 'Callout Arrows', bg: '#fff0e0', border: '#FF9500', text: '#7a4500', radius: 8, arrow: 'bottom', shadow: false },

  // ── Tooltips (17-24) ─────────────────────────────────────────────────
  { id: 'tooltip-dark', name: 'Dark Tooltip', category: 'Tooltips', bg: '#1a1a1a', border: '#1a1a1a', text: '#ffffff', radius: 6, arrow: 'bottom', shadow: true, compact: true },
  { id: 'tooltip-light', name: 'Light Tooltip', category: 'Tooltips', bg: '#ffffff', border: '#d4d4d4', text: '#333333', radius: 6, arrow: 'bottom', shadow: true, compact: true },
  { id: 'tooltip-blue', name: 'Blue Tooltip', category: 'Tooltips', bg: '#007AFF', border: '#007AFF', text: '#ffffff', radius: 6, arrow: 'bottom', shadow: false, compact: true },
  { id: 'tooltip-top-dark', name: 'Top Dark Tooltip', category: 'Tooltips', bg: '#1a1a1a', border: '#1a1a1a', text: '#ffffff', radius: 6, arrow: 'top', shadow: true, compact: true },
  { id: 'tooltip-top-light', name: 'Top Light Tooltip', category: 'Tooltips', bg: '#ffffff', border: '#d4d4d4', text: '#333333', radius: 6, arrow: 'top', shadow: true, compact: true },
  { id: 'tooltip-left-dark', name: 'Left Dark Tooltip', category: 'Tooltips', bg: '#333333', border: '#333333', text: '#ffffff', radius: 6, arrow: 'left', shadow: true, compact: true },
  { id: 'tooltip-right-dark', name: 'Right Dark Tooltip', category: 'Tooltips', bg: '#333333', border: '#333333', text: '#ffffff', radius: 6, arrow: 'right', shadow: true, compact: true },
  { id: 'tooltip-green', name: 'Green Tooltip', category: 'Tooltips', bg: '#d4edda', border: '#28a745', text: '#155724', radius: 6, arrow: 'bottom', shadow: false, compact: true },

  // ── Status Boxes (25-34) ─────────────────────────────────────────────
  { id: 'status-info', name: 'Info', category: 'Status Boxes', bg: '#e7f3ff', border: '#2196F3', text: '#0d47a1', radius: 8, icon: 'info', shadow: false },
  { id: 'status-success', name: 'Success', category: 'Status Boxes', bg: '#e8f5e9', border: '#4CAF50', text: '#1b5e20', radius: 8, icon: 'check', shadow: false },
  { id: 'status-warning', name: 'Warning', category: 'Status Boxes', bg: '#fff8e1', border: '#FF9800', text: '#e65100', radius: 8, icon: 'warning', shadow: false },
  { id: 'status-error', name: 'Error', category: 'Status Boxes', bg: '#ffebee', border: '#f44336', text: '#b71c1c', radius: 8, icon: 'error', shadow: false },
  { id: 'status-tip', name: 'Tip', category: 'Status Boxes', bg: '#e8eaf6', border: '#5856D6', text: '#1a237e', radius: 8, icon: 'tip', shadow: false },
  { id: 'status-note', name: 'Note', category: 'Status Boxes', bg: '#f3f3f3', border: '#9e9e9e', text: '#424242', radius: 8, icon: 'note', shadow: false },
  { id: 'status-important', name: 'Important', category: 'Status Boxes', bg: '#fce4ec', border: '#e91e63', text: '#880e4f', radius: 8, icon: 'important', shadow: false },
  { id: 'status-info-filled', name: 'Info Filled', category: 'Status Boxes', bg: '#2196F3', border: '#2196F3', text: '#ffffff', radius: 8, icon: 'info', shadow: true },
  { id: 'status-success-filled', name: 'Success Filled', category: 'Status Boxes', bg: '#4CAF50', border: '#4CAF50', text: '#ffffff', radius: 8, icon: 'check', shadow: true },
  { id: 'status-error-filled', name: 'Error Filled', category: 'Status Boxes', bg: '#f44336', border: '#f44336', text: '#ffffff', radius: 8, icon: 'error', shadow: true },

  // ── Sticky Notes (35-42) ─────────────────────────────────────────────
  { id: 'sticky-yellow', name: 'Yellow Sticky', category: 'Sticky Notes', bg: '#fff9c4', border: '#f9e54a', text: '#5d4e00', radius: 2, shadow: true, rotate: -2 },
  { id: 'sticky-pink', name: 'Pink Sticky', category: 'Sticky Notes', bg: '#fce4ec', border: '#f48fb1', text: '#880e4f', radius: 2, shadow: true, rotate: 1.5 },
  { id: 'sticky-blue', name: 'Blue Sticky', category: 'Sticky Notes', bg: '#e3f2fd', border: '#90caf9', text: '#0d47a1', radius: 2, shadow: true, rotate: -1 },
  { id: 'sticky-green', name: 'Green Sticky', category: 'Sticky Notes', bg: '#e8f5e9', border: '#a5d6a7', text: '#1b5e20', radius: 2, shadow: true, rotate: 2 },
  { id: 'sticky-orange', name: 'Orange Sticky', category: 'Sticky Notes', bg: '#fff3e0', border: '#ffcc80', text: '#e65100', radius: 2, shadow: true, rotate: -1.5 },
  { id: 'sticky-purple', name: 'Purple Sticky', category: 'Sticky Notes', bg: '#f3e5f5', border: '#ce93d8', text: '#4a148c', radius: 2, shadow: true, rotate: 1 },
  { id: 'sticky-white', name: 'White Sticky', category: 'Sticky Notes', bg: '#ffffff', border: '#e0e0e0', text: '#333333', radius: 2, shadow: true, rotate: -0.5 },
  { id: 'sticky-dark', name: 'Dark Sticky', category: 'Sticky Notes', bg: '#37474f', border: '#263238', text: '#eceff1', radius: 2, shadow: true, rotate: 1.2 },

  // ── Labels / Badges (43-50) ──────────────────────────────────────────
  { id: 'label-black', name: 'Black Label', category: 'Labels', bg: '#000000', border: '#000000', text: '#ffffff', radius: 4, compact: true, shadow: false },
  { id: 'label-red', name: 'Red Label', category: 'Labels', bg: '#ff3b30', border: '#ff3b30', text: '#ffffff', radius: 4, compact: true, shadow: false },
  { id: 'label-blue', name: 'Blue Label', category: 'Labels', bg: '#007AFF', border: '#007AFF', text: '#ffffff', radius: 4, compact: true, shadow: false },
  { id: 'label-green', name: 'Green Label', category: 'Labels', bg: '#34c759', border: '#34c759', text: '#ffffff', radius: 4, compact: true, shadow: false },
  { id: 'label-orange', name: 'Orange Label', category: 'Labels', bg: '#ff9500', border: '#ff9500', text: '#ffffff', radius: 4, compact: true, shadow: false },
  { id: 'label-purple', name: 'Purple Label', category: 'Labels', bg: '#AF52DE', border: '#AF52DE', text: '#ffffff', radius: 4, compact: true, shadow: false },
  { id: 'label-outline-black', name: 'Outline Black', category: 'Labels', bg: 'transparent', border: '#000000', text: '#000000', radius: 4, compact: true, shadow: false },
  { id: 'label-outline-red', name: 'Outline Red', category: 'Labels', bg: 'transparent', border: '#ff3b30', text: '#ff3b30', radius: 4, compact: true, shadow: false },

  // ── Pill / Tag (51-56) ───────────────────────────────────────────────
  { id: 'pill-black', name: 'Black Pill', category: 'Pills', bg: '#000000', border: '#000000', text: '#ffffff', radius: 50, compact: true, shadow: false },
  { id: 'pill-blue', name: 'Blue Pill', category: 'Pills', bg: '#007AFF', border: '#007AFF', text: '#ffffff', radius: 50, compact: true, shadow: false },
  { id: 'pill-gray', name: 'Gray Pill', category: 'Pills', bg: '#f0f0f0', border: '#d4d4d4', text: '#333333', radius: 50, compact: true, shadow: false },
  { id: 'pill-red', name: 'Red Pill', category: 'Pills', bg: '#ff3b30', border: '#ff3b30', text: '#ffffff', radius: 50, compact: true, shadow: false },
  { id: 'pill-green', name: 'Green Pill', category: 'Pills', bg: '#34c759', border: '#34c759', text: '#ffffff', radius: 50, compact: true, shadow: false },
  { id: 'pill-outline', name: 'Outline Pill', category: 'Pills', bg: 'transparent', border: '#000000', text: '#000000', radius: 50, compact: true, shadow: false },

  // ── Banners / Ribbons (57-62) ────────────────────────────────────────
  { id: 'banner-dark', name: 'Dark Banner', category: 'Banners', bg: '#1a1a1a', border: '#1a1a1a', text: '#ffffff', radius: 0, shadow: true, fullWidth: true },
  { id: 'banner-blue', name: 'Blue Banner', category: 'Banners', bg: '#007AFF', border: '#007AFF', text: '#ffffff', radius: 0, shadow: true, fullWidth: true },
  { id: 'banner-red', name: 'Red Banner', category: 'Banners', bg: '#ff3b30', border: '#ff3b30', text: '#ffffff', radius: 0, shadow: false, fullWidth: true },
  { id: 'banner-green', name: 'Green Banner', category: 'Banners', bg: '#34c759', border: '#34c759', text: '#ffffff', radius: 0, shadow: false, fullWidth: true },
  { id: 'banner-warning', name: 'Warning Banner', category: 'Banners', bg: '#fff3cd', border: '#ffc107', text: '#664d03', radius: 0, shadow: false, fullWidth: true },
  { id: 'banner-subtle', name: 'Subtle Banner', category: 'Banners', bg: '#f8f8f8', border: '#e0e0e0', text: '#333333', radius: 0, shadow: false, fullWidth: true },

  // ── Numbered Callouts (63-65) ────────────────────────────────────────
  { id: 'numcall-black', name: 'Black #', category: 'Numbered', bg: '#000000', border: '#000000', text: '#ffffff', radius: 50, numbered: true, shadow: true },
  { id: 'numcall-red', name: 'Red #', category: 'Numbered', bg: '#ff3b30', border: '#ff3b30', text: '#ffffff', radius: 50, numbered: true, shadow: true },
  { id: 'numcall-blue', name: 'Blue #', category: 'Numbered', bg: '#007AFF', border: '#007AFF', text: '#ffffff', radius: 50, numbered: true, shadow: true },
];

/**
 * Get unique categories from templates
 */
function getCommentBoxCategories() {
  const cats = [];
  for (const t of COMMENT_BOX_TEMPLATES) {
    if (!cats.includes(t.category)) cats.push(t.category);
  }
  return cats;
}

/**
 * Get templates by category
 */
function getCommentBoxesByCategory(category) {
  return COMMENT_BOX_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Find template by id
 */
function getCommentBoxTemplate(id) {
  return COMMENT_BOX_TEMPLATES.find((t) => t.id === id);
}

/**
 * Draw a comment box onto a 2D canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} template - comment box template
 * @param {number} x - left position
 * @param {number} y - top position
 * @param {number} w - width
 * @param {number} h - height
 * @param {string} text - text content
 * @param {object} opts - extra options (number, canvasWidth)
 */
function drawCommentBox(ctx, template, x, y, w, h, text, opts = {}) {
  ctx.save();

  // Rotation for sticky notes
  if (template.rotate) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((template.rotate * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  // Shadow
  if (template.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
  }

  const r = Math.min(template.radius, w / 2, h / 2);

  // Draw body
  if (template.bg && template.bg !== 'transparent') {
    ctx.fillStyle = template.bg;
    roundedRect(ctx, x, y, w, h, r);
    ctx.fill();
  }

  // Reset shadow before stroke
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Border
  ctx.strokeStyle = template.border;
  ctx.lineWidth = 2;
  roundedRect(ctx, x, y, w, h, r);
  ctx.stroke();

  // Left accent bar for status boxes
  if (template.icon) {
    ctx.fillStyle = template.border;
    roundedRect(ctx, x, y, 4, h, r > 2 ? 2 : 0);
    ctx.fill();
  }

  // Tail for speech bubbles
  if (template.tail) {
    drawTail(ctx, template, x, y, w, h);
  }

  // Arrow for callouts/tooltips
  if (template.arrow) {
    drawCalloutArrow(ctx, template, x, y, w, h);
  }

  // Icon for status boxes
  if (template.icon) {
    drawStatusIcon(ctx, template, x + 14, y + h / 2);
  }

  // Text
  const textX = template.icon ? x + 30 : x + 10;
  const textY = y + (template.compact ? h / 2 + 1 : 18);
  const maxTextW = w - (template.icon ? 40 : 20);

  ctx.fillStyle = template.text;
  ctx.font = template.compact ? 'bold 12px -apple-system, sans-serif' : '13px -apple-system, sans-serif';
  ctx.textBaseline = template.compact ? 'middle' : 'top';

  if (template.numbered && opts.number) {
    // Draw circle with number
    const circleR = Math.min(w, h) / 2 - 2;
    ctx.fillStyle = template.bg;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, circleR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = template.border;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = template.text;
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(opts.number), x + w / 2, y + h / 2);
  } else {
    ctx.textAlign = 'left';
    wrapText(ctx, text || 'Comment', textX, textY, maxTextW, 16);
  }

  ctx.restore();
}

/**
 * Draw a small preview thumbnail of a comment box template.
 */
function drawCommentBoxPreview(canvas, template) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (template.numbered) {
    const size = Math.min(w, h) - 8;
    drawCommentBox(ctx, template, (w - size) / 2, (h - size) / 2, size, size, '', { number: 1 });
  } else if (template.fullWidth) {
    drawCommentBox(ctx, template, 4, h / 2 - 10, w - 8, 20, template.name, {});
  } else if (template.compact) {
    const tw = Math.min(w - 8, 70);
    drawCommentBox(ctx, template, (w - tw) / 2, (h - 20) / 2, tw, 20, template.name, {});
  } else {
    drawCommentBox(ctx, template, 6, 6, w - 12, h - 12, template.name, {});
  }
}

// ── Drawing Helpers ─────────────────────────────────────────────────────

function roundedRect(ctx, x, y, w, h, r) {
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

function drawTail(ctx, template, x, y, w, h) {
  ctx.fillStyle = template.bg || '#ffffff';
  ctx.beginPath();
  const tailSize = 10;
  switch (template.tail) {
    case 'bottom-left':
      ctx.moveTo(x + 16, y + h);
      ctx.lineTo(x + 10, y + h + tailSize);
      ctx.lineTo(x + 26, y + h);
      break;
    case 'bottom-right':
      ctx.moveTo(x + w - 26, y + h);
      ctx.lineTo(x + w - 10, y + h + tailSize);
      ctx.lineTo(x + w - 16, y + h);
      break;
    case 'top-left':
      ctx.moveTo(x + 16, y);
      ctx.lineTo(x + 10, y - tailSize);
      ctx.lineTo(x + 26, y);
      break;
    case 'top-right':
      ctx.moveTo(x + w - 26, y);
      ctx.lineTo(x + w - 10, y - tailSize);
      ctx.lineTo(x + w - 16, y);
      break;
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = template.border;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawCalloutArrow(ctx, template, x, y, w, h) {
  const arrowSize = 8;
  ctx.fillStyle = template.bg === 'transparent' ? '#ffffff' : template.bg;
  ctx.beginPath();
  switch (template.arrow) {
    case 'left':
      ctx.moveTo(x, y + h / 2 - arrowSize);
      ctx.lineTo(x - arrowSize, y + h / 2);
      ctx.lineTo(x, y + h / 2 + arrowSize);
      break;
    case 'right':
      ctx.moveTo(x + w, y + h / 2 - arrowSize);
      ctx.lineTo(x + w + arrowSize, y + h / 2);
      ctx.lineTo(x + w, y + h / 2 + arrowSize);
      break;
    case 'top':
      ctx.moveTo(x + w / 2 - arrowSize, y);
      ctx.lineTo(x + w / 2, y - arrowSize);
      ctx.lineTo(x + w / 2 + arrowSize, y);
      break;
    case 'bottom':
      ctx.moveTo(x + w / 2 - arrowSize, y + h);
      ctx.lineTo(x + w / 2, y + h + arrowSize);
      ctx.lineTo(x + w / 2 + arrowSize, y + h);
      break;
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = template.border;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawStatusIcon(ctx, template, x, y) {
  ctx.fillStyle = template.border;
  ctx.font = 'bold 13px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const icons = {
    info: 'i',
    check: '\u2713',
    warning: '!',
    error: '\u2717',
    tip: '\u2605',
    note: '\u266A',
    important: '!!',
  };
  ctx.fillText(icons[template.icon] || 'i', x, y);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let currentY = y;
  for (const word of words) {
    const testLine = line + (line ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
}
