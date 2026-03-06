/**
 * Clarity Render Engine
 * Post-processing renderer that applies cinematic effects to recorded video.
 * Processes: zoom transforms, cursor animations, background effects, annotations.
 *
 * Designed for low-RAM environments — processes frame-by-frame using
 * OffscreenCanvas and requestAnimationFrame.
 */

class ClarityRenderer {
  constructor(options = {}) {
    this.width = options.width || 1920;
    this.height = options.height || 1080;
    this.fps = options.fps || 30;
    this.canvas = null;
    this.ctx = null;
    this.videoElement = null;
    this.metadata = null;
    this.onProgress = options.onProgress || (() => {});
    this.onComplete = options.onComplete || (() => {});
  }

  async init(videoBlob, metadata) {
    this.metadata = metadata;

    // Create offscreen canvas for rendering
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d');

    // Load video
    this.videoElement = document.createElement('video');
    this.videoElement.muted = true;
    this.videoElement.src = URL.createObjectURL(videoBlob);

    await new Promise((resolve) => {
      this.videoElement.onloadedmetadata = resolve;
    });
  }

  async render() {
    const duration = this.videoElement.duration;
    const totalFrames = Math.ceil(duration * this.fps);
    const frameInterval = 1 / this.fps;
    const outputChunks = [];

    const outputStream = this.canvas.captureStream(this.fps);
    const recorder = new MediaRecorder(outputStream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 4000000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) outputChunks.push(e.data);
    };

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(outputChunks, { type: 'video/webm' });
        this.onComplete(blob);
        resolve(blob);
      };

      recorder.start();
      this._processFrames(0, totalFrames, frameInterval, recorder);
    });
  }

  async _processFrames(frame, totalFrames, interval, recorder) {
    if (frame >= totalFrames) {
      recorder.stop();
      return;
    }

    const time = frame * interval;
    this.videoElement.currentTime = time;

    await new Promise((resolve) => {
      this.videoElement.onseeked = resolve;
    });

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Layer 1: Base video frame
    this._drawBaseFrame(time);

    // Layer 2: Zoom transform
    this._applyZoom(time);

    // Layer 3: Cursor animation
    this._drawCursor(time);

    // Layer 4: Annotations
    this._drawAnnotations(time);

    // Layer 5: Background effects
    this._drawBackgroundEffects(time);

    // Report progress
    this.onProgress(frame / totalFrames);

    // Process next frame
    requestAnimationFrame(() => {
      this._processFrames(frame + 1, totalFrames, interval, recorder);
    });
  }

  _drawBaseFrame(time) {
    this.ctx.drawImage(this.videoElement, 0, 0, this.width, this.height);
  }

  _applyZoom(time) {
    const timeMs = time * 1000;
    const events = this.metadata.events || [];
    const zoomEvents = events.filter((e) => e.type === 'zoom');

    for (const z of zoomEvents) {
      const zStart = z.t;
      const zEnd = z.t + (z.duration || 400);

      if (timeMs >= zStart && timeMs <= zEnd + 1000) {
        const progress = Math.min(1, (timeMs - zStart) / (z.duration || 400));
        const eased = easeInOutCubic(progress);

        // Zoom in phase
        let scale, fadeOut;
        if (timeMs <= zEnd) {
          scale = 1 + (z.level - 1) * eased;
          fadeOut = 0;
        } else {
          // Zoom out phase
          const outProgress = Math.min(1, (timeMs - zEnd) / 1000);
          scale = z.level - (z.level - 1) * easeInOutCubic(outProgress);
          fadeOut = outProgress;
        }

        const cx = z.centerX || this.width / 2;
        const cy = z.centerY || this.height / 2;

        this.ctx.save();
        this.ctx.translate(cx, cy);
        this.ctx.scale(scale, scale);
        this.ctx.translate(-cx, -cy);
        this.ctx.drawImage(this.videoElement, 0, 0, this.width, this.height);
        this.ctx.restore();
      }
    }
  }

  _drawCursor(time) {
    const timeMs = time * 1000;
    const events = this.metadata.events || [];
    const style = this.metadata.cursorStyle || 'ripple';

    // Find nearest cursor position
    const moveEvents = events.filter((e) => e.type === 'move');
    let cursor = null;
    for (const m of moveEvents) {
      if (m.t <= timeMs) cursor = m;
      else break;
    }

    if (!cursor) return;

    const { x, y } = cursor;

    // Draw cursor based on style
    switch (style) {
      case 'glow':
        this._drawGlowCursor(x, y);
        break;
      case 'spotlight':
        this._drawSpotlightCursor(x, y);
        break;
      case 'ripple':
        this._drawRippleCursor(x, y, timeMs, events);
        break;
      case 'trail':
        // Trail removed — draw cursor at current position only
        break;
      case 'pulse':
        this._drawPulseCursor(x, y, timeMs);
        break;
      case 'particle':
        this._drawParticleCursor(x, y, timeMs, events);
        break;
    }
  }

  _drawGlowCursor(x, y) {
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, 20);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
    gradient.addColorStop(1, 'transparent');
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 20, 0, Math.PI * 2);
    this.ctx.fill();
  }

  _drawSpotlightCursor(x, y) {
    // Dim everything except spotlight area
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Clear spotlight circle
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-out';
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, 80);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 80, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  _drawRippleCursor(x, y, timeMs, events) {
    // Draw ripple on click events
    const clicks = events.filter((e) => e.type === 'click');
    for (const c of clicks) {
      const diff = timeMs - c.t;
      if (diff >= 0 && diff < 600) {
        const progress = diff / 600;
        const radius = 20 + progress * 30;
        const alpha = 1 - progress;

        this.ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.5})`;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }
  }

  _drawTrailCursor(x, y, timeMs, moveEvents) {
    const trailLength = 300; // ms
    const recent = moveEvents.filter(
      (m) => m.t <= timeMs && m.t >= timeMs - trailLength
    );

    for (let i = 0; i < recent.length; i++) {
      const alpha = (i / recent.length) * 0.3;
      const size = 3 + (i / recent.length) * 3;
      this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(recent[i].x, recent[i].y, size, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  _drawPulseCursor(x, y, timeMs) {
    const pulsePhase = (timeMs % 1200) / 1200;
    const scale = 1 + 0.3 * Math.sin(pulsePhase * Math.PI * 2);
    const radius = 8 * scale;
    const alpha = 0.3 + 0.1 * Math.sin(pulsePhase * Math.PI * 2);

    this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  _drawParticleCursor(x, y, timeMs, events) {
    const clicks = events.filter((e) => e.type === 'click');
    for (const c of clicks) {
      const diff = timeMs - c.t;
      if (diff >= 0 && diff < 400) {
        const progress = diff / 400;
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * 2 * i) / 8;
          const dist = progress * 30;
          const px = c.x + Math.cos(angle) * dist;
          const py = c.y + Math.sin(angle) * dist;
          const alpha = 1 - progress;

          this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
          this.ctx.beginPath();
          this.ctx.arc(px, py, 2, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    }
  }

  _drawAnnotations(time) {
    const timeMs = time * 1000;
    const events = this.metadata.events || [];
    const annotations = events.filter(
      (e) => e.type === 'annotation' && e.t <= timeMs
    );

    for (const a of annotations) {
      if (a.startX != null) {
        this._drawArrow(a.startX, a.startY, a.endX, a.endY);
      }
    }
  }

  _drawArrow(x1, y1, x2, y2) {
    const headLen = 12;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    this.ctx.strokeStyle = '#000';
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(x2, y2);
    this.ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.moveTo(x2, y2);
    this.ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.stroke();
  }

  _drawBackgroundEffects(time) {
    const timeMs = time * 1000;
    const events = this.metadata.events || [];
    const zoomEvents = events.filter((e) => e.type === 'zoom');

    // Only show effects during zoom transitions
    for (const z of zoomEvents) {
      const zStart = z.t;
      const zEnd = z.t + (z.duration || 400);

      if (timeMs >= zStart && timeMs <= zEnd + 500) {
        const progress = (timeMs - zStart) / (z.duration || 400);

        // Cinematic vignette
        this._drawVignette(Math.min(1, progress) * 0.3);

        // Sparkle particles
        this._drawSparkles(timeMs, z);

        // Light sweep
        if (progress < 1) {
          this._drawLightSweep(progress);
        }
      }
    }
  }

  _drawVignette(intensity) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const radius = Math.max(this.width, this.height) * 0.7;

    const gradient = this.ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(1, `rgba(0, 0, 0, ${intensity})`);

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  _drawSparkles(timeMs, zoomEvent) {
    const seed = zoomEvent.t;
    const count = 12;

    for (let i = 0; i < count; i++) {
      const phase = ((timeMs - seed + i * 100) % 800) / 800;
      if (phase > 0.5) continue;

      const x = pseudoRandom(seed + i * 1000) * this.width;
      const y = pseudoRandom(seed + i * 2000) * this.height;
      const size = 1 + pseudoRandom(seed + i * 3000) * 3;
      const alpha = (0.5 - phase) * 0.6;

      this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(x, y, size, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  _drawLightSweep(progress) {
    const x = progress * (this.width + 200) - 100;
    const gradient = this.ctx.createLinearGradient(x - 50, 0, x + 50, 0);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
    gradient.addColorStop(1, 'transparent');

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(x - 50, 0, 100, this.height);
  }

  destroy() {
    if (this.videoElement) {
      URL.revokeObjectURL(this.videoElement.src);
      this.videoElement = null;
    }
    this.canvas = null;
    this.ctx = null;
  }
}

// ── Easing Functions ──────────────────────────────────────────────────────

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function pseudoRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Export for use in editor
if (typeof window !== 'undefined') {
  window.ClarityRenderer = ClarityRenderer;
}
