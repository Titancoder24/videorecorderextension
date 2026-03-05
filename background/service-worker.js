/**
 * Clarity Background Service Worker
 * Handles messaging, capture coordination, and storage management.
 */

const STATE = {
  mode: null, // 'guide' | 'recording' | null
  recording: false,
  paused: false,
  tabId: null,
  streamId: null,
  sessions: [],
};

// ── Message Router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handlers = {
    'start-guide': handleStartGuide,
    'start-recording': handleStartRecording,
    'stop-capture': handleStopCapture,
    'pause-capture': handlePauseCapture,
    'resume-capture': handleResumeCapture,
    'capture-screenshot': handleCaptureScreenshot,
    'add-step': handleAddStep,
    'get-state': handleGetState,
    'get-sessions': handleGetSessions,
    'delete-session': handleDeleteSession,
    'request-desktop-capture': handleDesktopCapture,
  };

  const handler = handlers[msg.type];
  if (handler) {
    handler(msg, sender).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // async
  }
});

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleGetState() {
  return {
    mode: STATE.mode,
    recording: STATE.recording,
    paused: STATE.paused,
  };
}

async function handleStartGuide(msg, sender) {
  const tabId = msg.tabId || sender.tab?.id;
  STATE.mode = 'guide';
  STATE.recording = true;
  STATE.paused = false;
  STATE.tabId = tabId;

  const session = {
    id: crypto.randomUUID(),
    type: 'guide',
    title: msg.title || 'Untitled Guide',
    createdAt: Date.now(),
    steps: [],
  };

  await saveSession(session);

  // Inject content script toolbar
  await chrome.tabs.sendMessage(tabId, {
    type: 'show-toolbar',
    mode: 'guide',
    sessionId: session.id,
  });

  return { sessionId: session.id };
}

async function handleStartRecording(msg, sender) {
  const tabId = msg.tabId || sender.tab?.id;
  STATE.mode = 'recording';
  STATE.recording = true;
  STATE.paused = false;
  STATE.tabId = tabId;

  const session = {
    id: crypto.randomUUID(),
    type: 'recording',
    title: msg.title || 'Untitled Recording',
    createdAt: Date.now(),
    events: [],
    cursorStyle: msg.cursorStyle || 'ripple',
    zoomEvents: [],
    annotations: [],
  };

  await saveSession(session);

  await chrome.tabs.sendMessage(tabId, {
    type: 'show-toolbar',
    mode: 'recording',
    sessionId: session.id,
  });

  return { sessionId: session.id };
}

async function handleDesktopCapture(msg, sender) {
  return new Promise((resolve) => {
    chrome.desktopCapture.chooseDesktopMedia(
      ['screen', 'window', 'tab'],
      sender.tab,
      (streamId) => {
        if (streamId) {
          STATE.streamId = streamId;
          resolve({ streamId });
        } else {
          resolve({ error: 'User cancelled desktop capture' });
        }
      }
    );
  });
}

async function handleStopCapture() {
  const mode = STATE.mode;
  const tabId = STATE.tabId;

  STATE.mode = null;
  STATE.recording = false;
  STATE.paused = false;
  STATE.streamId = null;

  if (tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'hide-toolbar' });
    } catch (_) {
      // Tab may have closed
    }
  }

  STATE.tabId = null;
  return { stopped: true, mode };
}

async function handlePauseCapture() {
  STATE.paused = true;
  if (STATE.tabId) {
    await chrome.tabs.sendMessage(STATE.tabId, { type: 'set-paused', paused: true });
  }
  return { paused: true };
}

async function handleResumeCapture() {
  STATE.paused = false;
  if (STATE.tabId) {
    await chrome.tabs.sendMessage(STATE.tabId, { type: 'set-paused', paused: false });
  }
  return { paused: false };
}

async function handleCaptureScreenshot() {
  if (!STATE.tabId) return { error: 'No active tab' };
  const dataUrl = await chrome.tabs.captureVisibleTab(null, {
    format: 'png',
    quality: 85,
  });
  return { dataUrl };
}

async function handleAddStep(msg) {
  const sessions = await loadSessions();
  const session = sessions.find((s) => s.id === msg.sessionId);
  if (!session) return { error: 'Session not found' };

  session.steps.push(msg.step);
  await chrome.storage.local.set({ sessions });
  return { stepCount: session.steps.length };
}

async function handleGetSessions() {
  const sessions = await loadSessions();
  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      type: s.type,
      title: s.title,
      createdAt: s.createdAt,
      stepCount: s.steps?.length || 0,
    })),
  };
}

async function handleDeleteSession(msg) {
  let sessions = await loadSessions();
  sessions = sessions.filter((s) => s.id !== msg.sessionId);
  await chrome.storage.local.set({ sessions });
  return { deleted: true };
}

// ── Storage Helpers ─────────────────────────────────────────────────────────

async function loadSessions() {
  const data = await chrome.storage.local.get('sessions');
  return data.sessions || [];
}

async function saveSession(session) {
  const sessions = await loadSessions();
  sessions.unshift(session);
  await chrome.storage.local.set({ sessions });
}
