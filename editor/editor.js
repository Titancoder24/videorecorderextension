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

  // ── Init ────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', async () => {
    exporter = new ClarityExporter();

    // Load session from URL params or storage
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');

    if (sessionId) {
      const data = await chrome.storage.local.get('sessions');
      const sessions = data.sessions || [];
      session = sessions.find((s) => s.id === sessionId);
    }

    if (!session) {
      // Load most recent guide session
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
        ${step.screenshot ? `<img class="step-item-thumb" src="${step.screenshot}" />` : ''}
      `;
      el.addEventListener('click', () => selectStep(i));
      list.appendChild(el);
    }
  }

  // ── Step Selection ──────────────────────────────────────────────────────

  function selectStep(index) {
    selectedStepIndex = index;
    const step = session.steps[index];

    document.getElementById('preview-empty').classList.add('hidden');
    document.getElementById('preview-content').classList.remove('hidden');

    const img = document.getElementById('preview-screenshot');
    if (step.screenshot) {
      img.src = step.screenshot;
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

    // Redraw annotations for this step
    redrawStepAnnotations();
    renderStepList();
  }

  // ── Annotations ─────────────────────────────────────────────────────────

  function onAnnotationStart(e) {
    if (!annotationTool) return;
    const rect = e.target.getBoundingClientRect();
    annotationStart = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function onAnnotationMove(e) {
    if (!annotationStart || !annotationTool) return;
    const canvas = document.getElementById('preview-annotation-canvas');
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    redrawStepAnnotations(ctx);

    if (annotationTool === 'arrow') {
      drawArrow(ctx, annotationStart.x, annotationStart.y, x, y);
    } else if (annotationTool === 'highlight') {
      drawHighlight(ctx, annotationStart.x, annotationStart.y, x, y);
    }
  }

  function onAnnotationEnd(e) {
    if (!annotationStart || !annotationTool) return;
    const canvas = document.getElementById('preview-annotation-canvas');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const step = session.steps[selectedStepIndex];
    if (!step.annotations) step.annotations = [];

    step.annotations.push({
      type: annotationTool,
      startX: annotationStart.x,
      startY: annotationStart.y,
      endX: x,
      endY: y,
    });

    saveSession();
    annotationStart = null;
    redrawStepAnnotations();
  }

  function redrawStepAnnotations(ctx) {
    const canvas = document.getElementById('preview-annotation-canvas');
    if (!ctx) ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const step = session?.steps?.[selectedStepIndex];
    if (!step?.annotations) return;

    for (const a of step.annotations) {
      if (a.type === 'arrow') {
        drawArrow(ctx, a.startX, a.startY, a.endX, a.endY);
      } else if (a.type === 'highlight') {
        drawHighlight(ctx, a.startX, a.startY, a.endX, a.endY);
      } else if (a.type === 'blur') {
        drawBlur(ctx, a.startX, a.startY, a.endX, a.endY);
      } else if (a.type === 'number') {
        drawNumberBadge(ctx, a.startX, a.startY, a.number || 1);
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
