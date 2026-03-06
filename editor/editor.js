/**
 * Clarity Guide Editor
 * Two-panel interface for editing captured documentation guides.
 */

(() => {
  'use strict';

  let session = null;
  let selectedStepIndex = -1;
  let annotationTool = null;
  let annotationStart = null;
  let exporter = null;

  // Comment box state
  let selectedCommentBoxTemplate = null;
  let activeCommentBoxIndex = -1; // which comment box is being text-edited
  let draggingCommentBox = null; // { index, offsetX, offsetY }
  let commentBoxNumberCounter = 1;

  // ── Init ────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', async () => {
    exporter = new ClarityExporter();

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');

    if (sessionId) {
      const data = await chrome.storage.local.get('sessions');
      const sessions = data.sessions || [];
      session = sessions.find((s) => s.id === sessionId);
    }

    if (!session) {
      const data = await chrome.storage.local.get('sessions');
      const sessions = data.sessions || [];
      session = sessions.find((s) => s.type === 'guide');
    }

    if (session) {
      exporter.setSession(session);
      document.getElementById('session-title').textContent = session.title;
      renderStepList();
    }

    bindEvents();
    initCommentBoxPicker();
  });

  // ── Event Binding ───────────────────────────────────────────────────────

  function bindEvents() {
    document.getElementById('btn-export-html').addEventListener('click', () => {
      const html = exporter.exportHTML();
      ClarityExporter.downloadBlob(html, `${session.title}.html`, 'text/html');
    });

    document.getElementById('btn-export-md').addEventListener('click', () => {
      const md = exporter.exportMarkdown();
      ClarityExporter.downloadBlob(md, `${session.title}.md`, 'text/markdown');
    });

    document.getElementById('btn-export-pdf').addEventListener('click', () => {
      exporter.exportPDF();
    });

    // Title/desc editing
    document.getElementById('preview-title').addEventListener('input', (e) => {
      if (selectedStepIndex < 0) return;
      session.steps[selectedStepIndex].title = e.target.value;
      saveSession();
      renderStepList();
    });

    document.getElementById('preview-desc').addEventListener('input', (e) => {
      if (selectedStepIndex < 0) return;
      session.steps[selectedStepIndex].description = e.target.value;
      saveSession();
    });

    // Annotation tools
    document.querySelectorAll('.anno-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        if (!tool) return;

        if (tool === 'commentbox') {
          toggleCommentBoxPicker();
          return;
        }

        // Close comment picker if open
        closeCommentBoxPicker();

        if (annotationTool === tool) {
          annotationTool = null;
          btn.classList.remove('active');
        } else {
          document.querySelectorAll('.anno-btn').forEach((b) => b.classList.remove('active'));
          annotationTool = tool;
          btn.classList.add('active');
        }
      });
    });

    // Annotation canvas
    const canvas = document.getElementById('preview-annotation-canvas');
    canvas.addEventListener('mousedown', onAnnotationStart);
    canvas.addEventListener('mousemove', onAnnotationMove);
    canvas.addEventListener('mouseup', onAnnotationEnd);
    canvas.addEventListener('dblclick', onAnnotationDblClick);

    // Comment box picker close
    document.getElementById('commentbox-picker-close').addEventListener('click', closeCommentBoxPicker);

    // Global key handler for comment box text editing
    document.addEventListener('keydown', onCommentBoxKeydown);

    // Video generator
    document.getElementById('btn-generate-video').addEventListener('click', openVideoModal);
    document.getElementById('video-modal-close').addEventListener('click', closeVideoModal);
    document.getElementById('video-modal-x').addEventListener('click', closeVideoModal);
    document.getElementById('btn-do-generate').addEventListener('click', startVideoGeneration);
    document.getElementById('btn-download-video').addEventListener('click', downloadGeneratedVideo);

    initCursorPicker();
  }

  // ── Step List Rendering ─────────────────────────────────────────────────

  function renderStepList() {
    const list = document.getElementById('step-list');
    const steps = session?.steps || [];
    document.getElementById('step-count').textContent = steps.length;

    list.innerHTML = '';
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const el = document.createElement('div');
      el.className = 'step-item' + (i === selectedStepIndex ? ' active' : '');
      el.innerHTML = `
        <span class="step-item-number">${i + 1}</span>
        <div class="step-item-info">
          <span class="step-item-title">${escapeHtml(step.title || `Step ${i + 1}`)}</span>
          <span class="step-item-url">${escapeHtml(truncateUrl(step.url))}</span>
        </div>
        ${(step.croppedScreenshot || step.screenshot) ? `<img class="step-item-thumb" src="${step.croppedScreenshot || step.screenshot}" />` : ''}
      `;
      el.addEventListener('click', () => selectStep(i));
      list.appendChild(el);
    }
  }

  // ── Step Selection ──────────────────────────────────────────────────────

  function selectStep(index) {
    selectedStepIndex = index;
    activeCommentBoxIndex = -1;
    const step = session.steps[index];

    document.getElementById('preview-empty').classList.add('hidden');
    document.getElementById('preview-content').classList.remove('hidden');

    const img = document.getElementById('preview-screenshot');
    const screenshotSrc = step.croppedScreenshot || step.screenshot;
    if (screenshotSrc) {
      img.src = screenshotSrc;
      img.style.display = 'block';
    } else {
      img.style.display = 'none';
    }

    document.getElementById('preview-title').value = step.title || '';
    document.getElementById('preview-desc').value = step.description || '';
    document.getElementById('preview-url').textContent = step.url || '';
    document.getElementById('preview-selector').textContent = step.selector || '';

    // Resize annotation canvas
    const wrap = document.querySelector('.preview-screenshot-wrap');
    const canvas = document.getElementById('preview-annotation-canvas');
    canvas.width = wrap.offsetWidth;
    canvas.height = wrap.offsetHeight;

    // Count existing numbered comment boxes for counter
    commentBoxNumberCounter = 1;
    if (step.annotations) {
      for (const a of step.annotations) {
        if (a.type === 'commentbox' && a.templateId) {
          const t = getCommentBoxTemplate(a.templateId);
          if (t?.numbered && a.number >= commentBoxNumberCounter) {
            commentBoxNumberCounter = a.number + 1;
          }
        }
      }
    }

    redrawStepAnnotations();
    renderStepList();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMMENT BOX PICKER
  // ══════════════════════════════════════════════════════════════════════════

  function initCommentBoxPicker() {
    const categories = getCommentBoxCategories();
    const catContainer = document.getElementById('commentbox-categories');
    const gridContainer = document.getElementById('commentbox-grid');

    // Render category tabs
    catContainer.innerHTML = '';
    categories.forEach((cat, i) => {
      const btn = document.createElement('button');
      btn.className = 'commentbox-cat-btn' + (i === 0 ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        catContainer.querySelectorAll('.commentbox-cat-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderCommentBoxGrid(cat);
      });
      catContainer.appendChild(btn);
    });

    // Render first category
    renderCommentBoxGrid(categories[0]);
  }

  function renderCommentBoxGrid(category) {
    const grid = document.getElementById('commentbox-grid');
    const templates = getCommentBoxesByCategory(category);
    grid.innerHTML = '';

    for (const template of templates) {
      const item = document.createElement('div');
      item.className = 'commentbox-item' + (selectedCommentBoxTemplate?.id === template.id ? ' active' : '');
      item.title = template.name;

      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 60;
      canvas.className = 'commentbox-preview-canvas';
      drawCommentBoxPreview(canvas, template);

      const label = document.createElement('span');
      label.className = 'commentbox-item-label';
      label.textContent = template.name;

      item.appendChild(canvas);
      item.appendChild(label);

      item.addEventListener('click', () => {
        selectedCommentBoxTemplate = template;
        annotationTool = 'commentbox';

        // Update active states
        grid.querySelectorAll('.commentbox-item').forEach((el) => el.classList.remove('active'));
        item.classList.add('active');
        document.querySelectorAll('.anno-btn').forEach((b) => b.classList.remove('active'));
        document.getElementById('btn-commentbox').classList.add('active');

        // Set canvas cursor
        const annoCanvas = document.getElementById('preview-annotation-canvas');
        annoCanvas.style.cursor = 'crosshair';
      });

      grid.appendChild(item);
    }
  }

  function toggleCommentBoxPicker() {
    const picker = document.getElementById('commentbox-picker');
    if (picker.classList.contains('hidden')) {
      picker.classList.remove('hidden');
      document.getElementById('btn-commentbox').classList.add('active');
    } else {
      closeCommentBoxPicker();
    }
  }

  function closeCommentBoxPicker() {
    document.getElementById('commentbox-picker').classList.add('hidden');
    if (annotationTool === 'commentbox' && !selectedCommentBoxTemplate) {
      document.getElementById('btn-commentbox').classList.remove('active');
      annotationTool = null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ANNOTATIONS
  // ══════════════════════════════════════════════════════════════════════════

  function onAnnotationStart(e) {
    if (!annotationTool) {
      // Check if clicking on existing comment box for dragging
      const pos = getCanvasPos(e);
      const step = session?.steps?.[selectedStepIndex];
      if (step?.annotations) {
        for (let i = step.annotations.length - 1; i >= 0; i--) {
          const a = step.annotations[i];
          if (a.type === 'commentbox' && isInsideBox(pos.x, pos.y, a)) {
            draggingCommentBox = {
              index: i,
              offsetX: pos.x - a.startX,
              offsetY: pos.y - a.startY,
            };
            return;
          }
        }
      }
      return;
    }

    const pos = getCanvasPos(e);
    annotationStart = { x: pos.x, y: pos.y };
  }

  function onAnnotationMove(e) {
    // Handle dragging
    if (draggingCommentBox) {
      const pos = getCanvasPos(e);
      const step = session.steps[selectedStepIndex];
      const a = step.annotations[draggingCommentBox.index];
      const dx = pos.x - draggingCommentBox.offsetX - a.startX;
      const dy = pos.y - draggingCommentBox.offsetY - a.startY;
      a.startX += dx;
      a.startY += dy;
      a.endX += dx;
      a.endY += dy;
      draggingCommentBox.offsetX = pos.x - a.startX;
      draggingCommentBox.offsetY = pos.y - a.startY;
      redrawStepAnnotations();
      return;
    }

    if (!annotationStart || !annotationTool) return;
    const canvas = document.getElementById('preview-annotation-canvas');
    const ctx = canvas.getContext('2d');
    const pos = getCanvasPos(e);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    redrawStepAnnotations(ctx);

    if (annotationTool === 'arrow') {
      drawArrow(ctx, annotationStart.x, annotationStart.y, pos.x, pos.y);
    } else if (annotationTool === 'highlight') {
      drawHighlight(ctx, annotationStart.x, annotationStart.y, pos.x, pos.y);
    } else if (annotationTool === 'commentbox' && selectedCommentBoxTemplate) {
      const x = Math.min(annotationStart.x, pos.x);
      const y = Math.min(annotationStart.y, pos.y);
      const w = Math.abs(pos.x - annotationStart.x);
      const h = Math.abs(pos.y - annotationStart.y);
      if (w > 5 && h > 5) {
        drawCommentBox(ctx, selectedCommentBoxTemplate, x, y, w, h, 'Type here...', { number: commentBoxNumberCounter });
      }
    }
  }

  function onAnnotationEnd(e) {
    // End drag
    if (draggingCommentBox) {
      draggingCommentBox = null;
      saveSession();
      return;
    }

    if (!annotationStart || !annotationTool) return;
    const pos = getCanvasPos(e);

    const step = session.steps[selectedStepIndex];
    if (!step.annotations) step.annotations = [];

    if (annotationTool === 'commentbox' && selectedCommentBoxTemplate) {
      const x = Math.min(annotationStart.x, pos.x);
      const y = Math.min(annotationStart.y, pos.y);
      const w = Math.abs(pos.x - annotationStart.x);
      const h = Math.abs(pos.y - annotationStart.y);

      if (w > 10 && h > 10) {
        const anno = {
          type: 'commentbox',
          templateId: selectedCommentBoxTemplate.id,
          startX: x,
          startY: y,
          endX: x + w,
          endY: y + h,
          text: selectedCommentBoxTemplate.numbered ? '' : 'Type here...',
          number: selectedCommentBoxTemplate.numbered ? commentBoxNumberCounter++ : undefined,
        };
        step.annotations.push(anno);
        activeCommentBoxIndex = step.annotations.length - 1;
      }
    } else {
      step.annotations.push({
        type: annotationTool,
        startX: annotationStart.x,
        startY: annotationStart.y,
        endX: pos.x,
        endY: pos.y,
      });
    }

    saveSession();
    annotationStart = null;
    redrawStepAnnotations();
  }

  function onAnnotationDblClick(e) {
    // Double-click to edit comment box text
    const pos = getCanvasPos(e);
    const step = session?.steps?.[selectedStepIndex];
    if (!step?.annotations) return;

    for (let i = step.annotations.length - 1; i >= 0; i--) {
      const a = step.annotations[i];
      if (a.type === 'commentbox' && isInsideBox(pos.x, pos.y, a)) {
        activeCommentBoxIndex = i;
        showCommentBoxTextInput(a);
        return;
      }
    }
  }

  function onCommentBoxKeydown(e) {
    // Delete active comment box with Delete/Backspace when no input focused
    if ((e.key === 'Delete' || e.key === 'Backspace') && activeCommentBoxIndex >= 0) {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

      const step = session?.steps?.[selectedStepIndex];
      if (step?.annotations?.[activeCommentBoxIndex]) {
        step.annotations.splice(activeCommentBoxIndex, 1);
        activeCommentBoxIndex = -1;
        saveSession();
        redrawStepAnnotations();
      }
    }

    // Escape to deselect
    if (e.key === 'Escape') {
      activeCommentBoxIndex = -1;
      hideCommentBoxTextInput();
      redrawStepAnnotations();
    }
  }

  function showCommentBoxTextInput(annotation) {
    let input = document.getElementById('commentbox-text-input');
    if (!input) {
      input = document.createElement('textarea');
      input.id = 'commentbox-text-input';
      input.className = 'commentbox-text-input';
      document.querySelector('.preview-screenshot-wrap').appendChild(input);
    }

    input.value = annotation.text || '';
    input.style.display = 'block';
    input.style.left = annotation.startX + 'px';
    input.style.top = annotation.startY + 'px';
    input.style.width = (annotation.endX - annotation.startX) + 'px';
    input.style.height = (annotation.endY - annotation.startY) + 'px';
    input.focus();

    input.oninput = () => {
      annotation.text = input.value;
      saveSession();
      redrawStepAnnotations();
    };

    input.onblur = () => {
      hideCommentBoxTextInput();
    };
  }

  function hideCommentBoxTextInput() {
    const input = document.getElementById('commentbox-text-input');
    if (input) input.style.display = 'none';
  }

  function isInsideBox(x, y, annotation) {
    return x >= annotation.startX && x <= annotation.endX &&
           y >= annotation.startY && y <= annotation.endY;
  }

  function getCanvasPos(e) {
    const canvas = document.getElementById('preview-annotation-canvas');
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function redrawStepAnnotations(ctx) {
    const canvas = document.getElementById('preview-annotation-canvas');
    if (!ctx) ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const step = session?.steps?.[selectedStepIndex];
    if (!step?.annotations) return;

    for (let i = 0; i < step.annotations.length; i++) {
      const a = step.annotations[i];
      if (a.type === 'arrow') {
        drawArrow(ctx, a.startX, a.startY, a.endX, a.endY);
      } else if (a.type === 'highlight') {
        drawHighlight(ctx, a.startX, a.startY, a.endX, a.endY);
      } else if (a.type === 'blur') {
        drawBlur(ctx, a.startX, a.startY, a.endX, a.endY);
      } else if (a.type === 'number') {
        drawNumberBadge(ctx, a.startX, a.startY, a.number || 1);
      } else if (a.type === 'commentbox') {
        const template = getCommentBoxTemplate(a.templateId);
        if (template) {
          const w = a.endX - a.startX;
          const h = a.endY - a.startY;
          drawCommentBox(ctx, template, a.startX, a.startY, w, h, a.text || '', { number: a.number });

          // Draw selection border if active
          if (i === activeCommentBoxIndex) {
            ctx.save();
            ctx.strokeStyle = '#007AFF';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(a.startX - 3, a.startY - 3, w + 6, h + 6);
            ctx.setLineDash([]);
            ctx.restore();
          }
        }
      }
    }
  }

  // ── Drawing Primitives ──────────────────────────────────────────────────

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

  function drawHighlight(ctx, x1, y1, x2, y2) {
    ctx.fillStyle = 'rgba(255, 230, 0, 0.25)';
    ctx.strokeStyle = 'rgba(200, 180, 0, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.abs(x2 - x1),
      Math.abs(y2 - y1)
    );
    ctx.fill();
    ctx.stroke();
  }

  function drawBlur(ctx, x1, y1, x2, y2) {
    ctx.fillStyle = 'rgba(200, 200, 200, 0.7)';
    ctx.beginPath();
    ctx.rect(
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.abs(x2 - x1),
      Math.abs(y2 - y1)
    );
    ctx.fill();
  }

  function drawNumberBadge(ctx, x, y, number) {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), x, y);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIDEO GENERATOR UI
  // ══════════════════════════════════════════════════════════════════════════

  let selectedCursorId = 'default';
  let generatedVideoBlob = null;

  function initCursorPicker() {
    const categories = getCursorCategories();
    const catContainer = document.getElementById('cursor-categories');

    catContainer.innerHTML = '';
    categories.forEach((cat, i) => {
      const btn = document.createElement('button');
      btn.className = 'cursor-cat-btn' + (i === 0 ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        catContainer.querySelectorAll('.cursor-cat-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderCursorGrid(cat);
      });
      catContainer.appendChild(btn);
    });

    renderCursorGrid(categories[0]);
  }

  function renderCursorGrid(category) {
    const grid = document.getElementById('cursor-grid');
    const cursors = getCursorsByCategory(category);
    grid.innerHTML = '';

    for (const cursor of cursors) {
      const item = document.createElement('div');
      item.className = 'cursor-item' + (selectedCursorId === cursor.id ? ' active' : '');
      item.title = cursor.name;

      const canvas = document.createElement('canvas');
      canvas.width = 60;
      canvas.height = 50;
      canvas.className = 'cursor-preview-canvas';
      drawCursorPreview(canvas, cursor);

      const label = document.createElement('span');
      label.className = 'cursor-item-label';
      label.textContent = cursor.name;

      item.appendChild(canvas);
      item.appendChild(label);

      item.addEventListener('click', () => {
        selectedCursorId = cursor.id;
        grid.querySelectorAll('.cursor-item').forEach((el) => el.classList.remove('active'));
        item.classList.add('active');
      });

      grid.appendChild(item);
    }
  }

  function openVideoModal() {
    document.getElementById('video-modal').classList.remove('hidden');
    document.getElementById('video-progress').classList.add('hidden');
    document.getElementById('video-preview').classList.add('hidden');
    document.getElementById('btn-download-video').classList.add('hidden');
    document.getElementById('btn-do-generate').classList.remove('hidden');
    generatedVideoBlob = null;
  }

  function closeVideoModal() {
    document.getElementById('video-modal').classList.add('hidden');
    // Revoke any object URLs
    const video = document.getElementById('video-result');
    if (video.src) { URL.revokeObjectURL(video.src); video.src = ''; }
  }

  async function startVideoGeneration() {
    if (!session?.steps?.length) return;

    const resVal = document.getElementById('video-resolution').value.split('x');
    const width = parseInt(resVal[0]);
    const height = parseInt(resVal[1]);
    const fps = parseInt(document.getElementById('video-fps').value);
    const stepDuration = parseInt(document.getElementById('video-step-duration').value);
    const zoomLevel = parseFloat(document.getElementById('video-zoom').value);

    // Show progress
    document.getElementById('video-progress').classList.remove('hidden');
    document.getElementById('btn-do-generate').classList.add('hidden');
    document.getElementById('video-preview').classList.add('hidden');
    document.getElementById('btn-download-video').classList.add('hidden');

    const progressFill = document.getElementById('video-progress-fill');
    const progressText = document.getElementById('video-progress-text');

    try {
      generatedVideoBlob = await generateVideoFromSteps(session, {
        cursorStyleId: selectedCursorId,
        width,
        height,
        fps,
        stepDuration,
        zoomLevel,
        onProgress: (p) => {
          const pct = Math.round(p * 100);
          progressFill.style.width = pct + '%';
          progressText.textContent = `Generating... ${pct}%`;
        },
      });

      // Show preview
      const video = document.getElementById('video-result');
      video.src = URL.createObjectURL(generatedVideoBlob);
      document.getElementById('video-preview').classList.remove('hidden');
      document.getElementById('btn-download-video').classList.remove('hidden');
      progressText.textContent = 'Done!';
    } catch (err) {
      console.error('[Clarity] Video generation failed:', err);
      progressText.textContent = 'Failed: ' + err.message;
      document.getElementById('btn-do-generate').classList.remove('hidden');
    }
  }

  function downloadGeneratedVideo() {
    if (!generatedVideoBlob) return;
    const url = URL.createObjectURL(generatedVideoBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title || 'clarity-guide'}-video.webm`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
  }

  // ── Storage ─────────────────────────────────────────────────────────────

  async function saveSession() {
    const data = await chrome.storage.local.get('sessions');
    const sessions = data.sessions || [];
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      sessions[idx] = session;
    }
    await chrome.storage.local.set({ sessions });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function truncateUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      return u.hostname + u.pathname.slice(0, 30);
    } catch {
      return url.slice(0, 40);
    }
  }
})();
