/**
 * Clarity Guide Editor — Notion-style document editor
 * Single scrollable page with inline-editable step blocks,
 * contentEditable title/description, and floating annotation toolbar.
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
  let activeCommentBoxIndex = -1;
  let draggingCommentBox = null;
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
      renderDocument();
    }

    bindEvents();
    initCommentBoxPicker();
  });

  // ── Event Binding ───────────────────────────────────────────────────────

  function bindEvents() {
    // Export dropdown
    const exportBtn = document.getElementById('btn-export-menu');
    const exportMenu = document.getElementById('export-dropdown');
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => exportMenu.classList.add('hidden'));

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

    // Doc header edits
    document.getElementById('doc-title').addEventListener('input', (e) => {
      if (!session) return;
      session.title = e.target.textContent.trim();
      document.getElementById('session-title').textContent = session.title || 'Untitled Guide';
      saveSession();
    });

    document.getElementById('doc-subtitle').addEventListener('input', (e) => {
      if (!session) return;
      session.description = e.target.textContent.trim();
      saveSession();
    });

    // Session title in topbar
    document.getElementById('session-title').addEventListener('input', (e) => {
      if (!session) return;
      session.title = e.target.textContent.trim();
      document.getElementById('doc-title').textContent = session.title;
      saveSession();
    });

    // Floating annotation toolbar
    document.querySelectorAll('.float-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        if (!tool) return;

        if (tool === 'commentbox') {
          toggleCommentBoxPicker();
          return;
        }

        closeCommentBoxPicker();

        if (annotationTool === tool) {
          annotationTool = null;
          btn.classList.remove('active');
        } else {
          document.querySelectorAll('.float-btn').forEach((b) => b.classList.remove('active'));
          annotationTool = tool;
          btn.classList.add('active');
        }
      });
    });

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

    // Click outside to deselect step
    document.getElementById('doc-page').addEventListener('click', (e) => {
      if (!e.target.closest('.step-image-wrap')) {
        deselectStep();
      }
    });
  }

  // ── Render Full Document ──────────────────────────────────────────────

  function renderDocument() {
    if (!session) return;

    // Header
    const titleEl = document.getElementById('doc-title');
    const subtitleEl = document.getElementById('doc-subtitle');
    const topTitle = document.getElementById('session-title');

    titleEl.textContent = session.title || '';
    subtitleEl.textContent = session.description || '';
    topTitle.textContent = session.title || 'Untitled Guide';

    renderSteps();
  }

  function renderSteps() {
    const container = document.getElementById('doc-steps');
    const emptyEl = document.getElementById('doc-empty');
    const steps = session?.steps || [];

    container.innerHTML = '';

    if (steps.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const block = document.createElement('div');
      block.className = 'step-block';
      block.dataset.index = i;

      // Drag handle
      const handle = document.createElement('div');
      handle.className = 'step-drag-handle';
      handle.innerHTML = '<svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor"><circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/><circle cx="3" cy="6" r="1.2"/><circle cx="7" cy="6" r="1.2"/><circle cx="3" cy="10" r="1.2"/><circle cx="7" cy="10" r="1.2"/><circle cx="3" cy="14" r="1.2"/><circle cx="7" cy="14" r="1.2"/></svg>';

      // Title row: number badge + contentEditable title
      const titleRow = document.createElement('div');
      titleRow.className = 'step-title-row';

      const badge = document.createElement('span');
      badge.className = 'step-number';
      badge.textContent = i + 1;

      const title = document.createElement('span');
      title.className = 'step-title';
      title.contentEditable = 'true';
      title.spellcheck = false;
      title.textContent = step.title || '';
      title.addEventListener('input', () => {
        step.title = title.textContent.trim();
        saveSession();
      });
      title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); }
      });

      titleRow.appendChild(badge);
      titleRow.appendChild(title);

      // Description — contentEditable paragraph
      const desc = document.createElement('div');
      desc.className = 'step-desc';
      desc.contentEditable = 'true';
      desc.spellcheck = false;
      desc.textContent = step.description || '';
      desc.addEventListener('input', () => {
        step.description = desc.textContent.trim();
        saveSession();
      });

      // Screenshot image block
      const imgWrap = document.createElement('div');
      imgWrap.className = 'step-image-wrap';
      imgWrap.dataset.stepIndex = i;

      const screenshotSrc = step.croppedScreenshot || step.screenshot;
      if (screenshotSrc) {
        const img = document.createElement('img');
        img.className = 'step-image';
        img.src = screenshotSrc;
        img.alt = `Step ${i + 1}`;
        imgWrap.appendChild(img);

        // Annotation canvas overlay
        const canvas = document.createElement('canvas');
        canvas.className = 'step-annotation-canvas';
        canvas.dataset.stepIndex = i;
        imgWrap.appendChild(canvas);

        // Click to select for annotations
        imgWrap.addEventListener('click', (e) => {
          e.stopPropagation();
          selectStep(i, imgWrap, canvas);
        });

        // Size canvas when image loads
        img.addEventListener('load', () => {
          canvas.width = imgWrap.offsetWidth;
          canvas.height = imgWrap.offsetHeight;
          redrawStepAnnotations(i, canvas);
        });
      } else {
        imgWrap.style.display = 'none';
      }

      // Meta info
      const meta = document.createElement('div');
      meta.className = 'step-meta';
      if (step.url) {
        const urlSpan = document.createElement('span');
        urlSpan.className = 'step-meta-url';
        urlSpan.textContent = truncateUrl(step.url);
        meta.appendChild(urlSpan);
      }

      // Divider
      const divider = document.createElement('div');
      divider.className = 'step-divider';

      block.appendChild(handle);
      block.appendChild(titleRow);
      block.appendChild(desc);
      if (screenshotSrc) block.appendChild(imgWrap);
      block.appendChild(meta);

      container.appendChild(block);

      // Add divider between steps (not after last)
      if (i < steps.length - 1) {
        container.appendChild(divider);
      }
    }
  }

  // ── Step Selection (for annotations) ──────────────────────────────────

  let activeCanvas = null;
  let activeImgWrap = null;

  function selectStep(index, imgWrap, canvas) {
    // Deselect previous
    if (activeImgWrap) activeImgWrap.classList.remove('selected');

    selectedStepIndex = index;
    activeCommentBoxIndex = -1;
    activeCanvas = canvas;
    activeImgWrap = imgWrap;

    imgWrap.classList.add('selected');

    // Show floating toolbar
    document.getElementById('float-toolbar').classList.remove('hidden');

    // Resize canvas
    canvas.width = imgWrap.offsetWidth;
    canvas.height = imgWrap.offsetHeight;

    // Reset comment box counter
    commentBoxNumberCounter = 1;
    const step = session.steps[index];
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

    redrawStepAnnotations(index, canvas);

    // Bind annotation events to this canvas
    canvas.onmousedown = onAnnotationStart;
    canvas.onmousemove = onAnnotationMove;
    canvas.onmouseup = onAnnotationEnd;
    canvas.ondblclick = onAnnotationDblClick;
  }

  function deselectStep() {
    if (activeImgWrap) activeImgWrap.classList.remove('selected');
    activeImgWrap = null;
    activeCanvas = null;
    selectedStepIndex = -1;
    annotationTool = null;
    document.querySelectorAll('.float-btn').forEach((b) => b.classList.remove('active'));
    document.getElementById('float-toolbar').classList.add('hidden');
    closeCommentBoxPicker();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMMENT BOX PICKER
  // ══════════════════════════════════════════════════════════════════════════

  function initCommentBoxPicker() {
    const categories = getCommentBoxCategories();
    const catContainer = document.getElementById('commentbox-categories');

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
        grid.querySelectorAll('.commentbox-item').forEach((el) => el.classList.remove('active'));
        item.classList.add('active');
        document.querySelectorAll('.float-btn').forEach((b) => b.classList.remove('active'));
        document.getElementById('btn-commentbox').classList.add('active');
        if (activeCanvas) activeCanvas.style.cursor = 'crosshair';
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
      const pos = getCanvasPos(e);
      const step = session?.steps?.[selectedStepIndex];
      if (step?.annotations) {
        for (let i = step.annotations.length - 1; i >= 0; i--) {
          const a = step.annotations[i];
          if (a.type === 'commentbox' && isInsideBox(pos.x, pos.y, a)) {
            draggingCommentBox = { index: i, offsetX: pos.x - a.startX, offsetY: pos.y - a.startY };
            return;
          }
        }
      }
      return;
    }
    annotationStart = getCanvasPos(e);
  }

  function onAnnotationMove(e) {
    if (draggingCommentBox) {
      const pos = getCanvasPos(e);
      const step = session.steps[selectedStepIndex];
      const a = step.annotations[draggingCommentBox.index];
      const dx = pos.x - draggingCommentBox.offsetX - a.startX;
      const dy = pos.y - draggingCommentBox.offsetY - a.startY;
      a.startX += dx; a.startY += dy;
      a.endX += dx; a.endY += dy;
      draggingCommentBox.offsetX = pos.x - a.startX;
      draggingCommentBox.offsetY = pos.y - a.startY;
      redrawStepAnnotations(selectedStepIndex, activeCanvas);
      return;
    }

    if (!annotationStart || !annotationTool || !activeCanvas) return;
    const ctx = activeCanvas.getContext('2d');
    const pos = getCanvasPos(e);

    ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
    redrawStepAnnotations(selectedStepIndex, activeCanvas, ctx);

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
        step.annotations.push({
          type: 'commentbox', templateId: selectedCommentBoxTemplate.id,
          startX: x, startY: y, endX: x + w, endY: y + h,
          text: selectedCommentBoxTemplate.numbered ? '' : 'Type here...',
          number: selectedCommentBoxTemplate.numbered ? commentBoxNumberCounter++ : undefined,
        });
        activeCommentBoxIndex = step.annotations.length - 1;
      }
    } else {
      step.annotations.push({
        type: annotationTool,
        startX: annotationStart.x, startY: annotationStart.y,
        endX: pos.x, endY: pos.y,
      });
    }

    saveSession();
    annotationStart = null;
    redrawStepAnnotations(selectedStepIndex, activeCanvas);
  }

  function onAnnotationDblClick(e) {
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
    if ((e.key === 'Delete' || e.key === 'Backspace') && activeCommentBoxIndex >= 0) {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.contentEditable === 'true')) return;

      const step = session?.steps?.[selectedStepIndex];
      if (step?.annotations?.[activeCommentBoxIndex]) {
        step.annotations.splice(activeCommentBoxIndex, 1);
        activeCommentBoxIndex = -1;
        saveSession();
        if (activeCanvas) redrawStepAnnotations(selectedStepIndex, activeCanvas);
      }
    }

    if (e.key === 'Escape') {
      activeCommentBoxIndex = -1;
      hideCommentBoxTextInput();
      if (activeCanvas) redrawStepAnnotations(selectedStepIndex, activeCanvas);
    }
  }

  function showCommentBoxTextInput(annotation) {
    if (!activeImgWrap) return;
    let input = activeImgWrap.querySelector('.commentbox-text-input');
    if (!input) {
      input = document.createElement('textarea');
      input.className = 'commentbox-text-input';
      activeImgWrap.appendChild(input);
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
      if (activeCanvas) redrawStepAnnotations(selectedStepIndex, activeCanvas);
    };
    input.onblur = () => hideCommentBoxTextInput();
  }

  function hideCommentBoxTextInput() {
    document.querySelectorAll('.commentbox-text-input').forEach((el) => {
      el.style.display = 'none';
    });
  }

  function isInsideBox(x, y, a) {
    return x >= a.startX && x <= a.endX && y >= a.startY && y <= a.endY;
  }

  function getCanvasPos(e) {
    const canvas = e.target.closest('canvas') || activeCanvas;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function redrawStepAnnotations(stepIndex, canvas, ctx) {
    if (!canvas) return;
    if (!ctx) ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const step = session?.steps?.[stepIndex];
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
          drawCommentBox(ctx, template, a.startX, a.startY, a.endX - a.startX, a.endY - a.startY, a.text || '', { number: a.number });
          if (i === activeCommentBoxIndex) {
            ctx.save();
            ctx.strokeStyle = '#2383e2';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(a.startX - 3, a.startY - 3, a.endX - a.startX + 6, a.endY - a.startY + 6);
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
    ctx.strokeStyle = '#191919';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function drawHighlight(ctx, x1, y1, x2, y2) {
    ctx.fillStyle = 'rgba(255, 230, 0, 0.25)';
    ctx.strokeStyle = 'rgba(200, 180, 0, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    ctx.fill(); ctx.stroke();
  }

  function drawBlur(ctx, x1, y1, x2, y2) {
    ctx.fillStyle = 'rgba(200, 200, 200, 0.7)';
    ctx.beginPath();
    ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    ctx.fill();
  }

  function drawNumberBadge(ctx, x, y, number) {
    ctx.fillStyle = '#2383e2';
    ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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
      canvas.width = 80; canvas.height = 60;
      canvas.className = 'cursor-preview-canvas';
      drawCursorPreview(canvas, cursor);
      const label = document.createElement('span');
      label.className = 'cursor-item-label';
      label.textContent = cursor.name;
      item.appendChild(canvas); item.appendChild(label);
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

    document.getElementById('video-progress').classList.remove('hidden');
    document.getElementById('btn-do-generate').classList.add('hidden');
    document.getElementById('video-preview').classList.add('hidden');
    document.getElementById('btn-download-video').classList.add('hidden');

    const progressFill = document.getElementById('video-progress-fill');
    const progressText = document.getElementById('video-progress-text');

    try {
      generatedVideoBlob = await generateVideoFromSteps(session, {
        cursorStyleId: selectedCursorId, width, height, fps, stepDuration, zoomLevel,
        onProgress: (p) => {
          const pct = Math.round(p * 100);
          progressFill.style.width = pct + '%';
          progressText.textContent = `Generating... ${pct}%`;
        },
      });

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
    if (idx >= 0) sessions[idx] = session;
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
