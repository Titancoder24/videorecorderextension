/**
 * Clarity Export Engine v2
 * Produces Tango-style guides with highlighted elements,
 * cropped screenshots, numbered steps, and premium layout.
 */

class ClarityExporter {
  constructor() {
    this.session = null;
  }

  setSession(session) {
    this.session = session;
  }

  // ── HTML Export — Premium Tango-style Guide ──────────────────────────

  exportHTML() {
    if (!this.session || this.session.type !== 'guide') {
      throw new Error('No guide session loaded');
    }

    const steps = this.session.steps || [];
    const stepsHtml = steps
      .map(
        (step, i) => `
      <div class="step">
        <div class="step-header">
          <span class="step-number">${i + 1}</span>
          <h3 class="step-title">${escapeHtml(step.title || `Step ${i + 1}`)}</h3>
          <button class="step-edit-btn" onclick="this.closest('.step').querySelector('.step-desc-edit').focus()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
          </button>
        </div>
        <div class="step-body">
          ${step.croppedScreenshot
            ? `<div class="step-screenshot-wrap">
                <img class="step-screenshot" src="${step.croppedScreenshot}" alt="Step ${i + 1}" />
              </div>`
            : step.screenshot
              ? `<div class="step-screenshot-wrap">
                  <img class="step-screenshot" src="${step.screenshot}" alt="Step ${i + 1}" />
                </div>`
              : ''
          }
          ${step.description
            ? `<p class="step-description">${escapeHtml(step.description)}</p>`
            : ''
          }
        </div>
      </div>`
      )
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(this.session.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
      background: #fafafa;
      color: #000;
      -webkit-font-smoothing: antialiased;
    }

    /* Header */
    .guide-header {
      background: #fff;
      border-bottom: 1px solid #e5e5e5;
      padding: 32px 0;
    }
    .guide-header-inner {
      max-width: 720px;
      margin: 0 auto;
      padding: 0 24px;
    }
    .guide-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 20px;
    }
    .guide-brand svg { color: #000; }
    .guide-brand span { font-size: 14px; font-weight: 600; letter-spacing: -0.3px; }
    .guide-title {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin-bottom: 8px;
      line-height: 1.2;
    }
    .guide-meta {
      font-size: 13px;
      color: #888;
      display: flex;
      gap: 12px;
    }

    /* Steps */
    .guide-steps {
      max-width: 720px;
      margin: 0 auto;
      padding: 24px 24px 60px;
    }
    .step {
      background: #fff;
      border: 1px solid #e5e5e5;
      border-radius: 12px;
      margin-bottom: 16px;
      overflow: hidden;
      transition: box-shadow 0.2s;
    }
    .step:hover {
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }
    .step-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid #f0f0f0;
    }
    .step-number {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #000;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .step-title {
      font-size: 15px;
      font-weight: 600;
      flex: 1;
      letter-spacing: -0.2px;
    }
    .step-edit-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: none;
      background: transparent;
      cursor: pointer;
      color: #bbb;
      transition: all 0.15s;
    }
    .step-edit-btn:hover {
      background: #f0f0f0;
      color: #666;
    }
    .step-body {
      padding: 0;
    }
    .step-screenshot-wrap {
      position: relative;
      background: #f9f9f9;
    }
    .step-screenshot {
      width: 100%;
      display: block;
    }
    .step-description {
      padding: 16px 20px;
      font-size: 14px;
      line-height: 1.6;
      color: #444;
    }

    /* TOC sidebar (print) */
    @media print {
      body { background: #fff; }
      .step { break-inside: avoid; box-shadow: none; }
    }

    /* Footer */
    .guide-footer {
      text-align: center;
      padding: 24px;
      font-size: 11px;
      color: #ccc;
    }
  </style>
</head>
<body>
  <header class="guide-header">
    <div class="guide-header-inner">
      <div class="guide-brand">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/></svg>
        <span>Clarity</span>
      </div>
      <h1 class="guide-title">${escapeHtml(this.session.title)}</h1>
      <div class="guide-meta">
        <span>${steps.length} steps</span>
        <span>${new Date(this.session.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  </header>

  <div class="guide-steps">
    ${stepsHtml}
  </div>

  <div class="guide-footer">Generated by Clarity</div>
</body>
</html>`;
  }

  // ── Markdown Export ───────────────────────────────────────────────────

  exportMarkdown() {
    if (!this.session || this.session.type !== 'guide') {
      throw new Error('No guide session loaded');
    }

    const steps = this.session.steps || [];
    let md = `# ${this.session.title}\n\n`;
    md += `*${steps.length} steps &middot; ${new Date(this.session.createdAt).toLocaleDateString()}*\n\n---\n\n`;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      md += `## ${i + 1}. ${step.title || 'Action'}\n\n`;
      if (step.description) md += `${step.description}\n\n`;
      if (step.croppedScreenshot || step.screenshot) {
        md += `![Step ${i + 1}](${step.croppedScreenshot || step.screenshot})\n\n`;
      }
      if (step.url) md += `> URL: ${step.url}\n\n`;
      if (i < steps.length - 1) md += `---\n\n`;
    }

    md += `\n---\n*Generated by Clarity*\n`;
    return md;
  }

  // ── PDF Export ────────────────────────────────────────────────────────

  exportPDF() {
    const html = this.exportHTML();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  }

  // ── Download Helpers ──────────────────────────────────────────────────

  static downloadVideo(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `clarity-recording-${Date.now()}.webm`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
  }

  static downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

if (typeof window !== 'undefined') {
  window.ClarityExporter = ClarityExporter;
}
