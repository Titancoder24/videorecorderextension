/**
 * Clarity Background Service Worker v2
 * Handles side panel, messaging, capture coordination, and storage.
 */

const STATE = {
  mode: null, // 'guide' | 'recording' | null
  recording: false,
  paused: false,
  tabId: null,
  streamId: null,
  currentSessionId: null,
};

// ── Open side panel on action click ───────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Enable side panel for all tabs
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ── Persist capture across page navigations ─────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && STATE.recording && STATE.tabId === tabId) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/content.css'] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] });
      const stepCount = await getStepCount(STATE.currentSessionId);
      await chrome.tabs.sendMessage(tabId, {
        type: 'show-toolbar',
        mode: STATE.mode,
        sessionId: STATE.currentSessionId,
        resumeStepCount: stepCount,
      });
    } catch (_) {
      // Page might not allow injection (chrome:// pages)
    }
  }
});

async function getStepCount(sessionId) {
  const sessions = await loadSessions();
  const session = sessions.find((s) => s.id === sessionId);
  return session?.steps?.length || 0;
}

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
    'remove-last-step': handleRemoveLastStep,
    'remove-step-at': handleRemoveStepAt,
    'update-session-title': handleUpdateSessionTitle,
    'get-state': handleGetState,
    'get-sessions': handleGetSessions,
    'get-session': handleGetSession,
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

  STATE.currentSessionId = session.id;
  await saveSession(session);

  // Inject content script toolbar
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'show-toolbar',
      mode: 'guide',
      sessionId: session.id,
    });
  } catch (e) {
    // Content script might not be injected yet
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js'],
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content/content.css'],
    });
    await chrome.tabs.sendMessage(tabId, {
      type: 'show-toolbar',
      mode: 'guide',
      sessionId: session.id,
    });
  }

  // Notify sidepanel
  broadcastToExtension({
    type: 'capture-started',
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

  STATE.currentSessionId = session.id;
  await saveSession(session);

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'show-toolbar',
      mode: 'recording',
      sessionId: session.id,
    });
  } catch (e) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js'],
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content/content.css'],
    });
    await chrome.tabs.sendMessage(tabId, {
      type: 'show-toolbar',
      mode: 'recording',
      sessionId: session.id,
    });
  }

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
    } catch (_) {}
  }

  STATE.tabId = null;

  // Notify sidepanel
  broadcastToExtension({ type: 'capture-stopped' });

  return { stopped: true, mode };
}

async function handlePauseCapture() {
  STATE.paused = true;
  if (STATE.tabId) {
    try {
      await chrome.tabs.sendMessage(STATE.tabId, { type: 'set-paused', paused: true });
    } catch (_) {}
  }
  return { paused: true };
}

async function handleResumeCapture() {
  STATE.paused = false;
  if (STATE.tabId) {
    try {
      await chrome.tabs.sendMessage(STATE.tabId, { type: 'set-paused', paused: false });
    } catch (_) {}
  }
  return { paused: false };
}

async function handleCaptureScreenshot() {
  if (!STATE.tabId) return { error: 'No active tab' };
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 90,
    });
    return { dataUrl };
  } catch (e) {
    return { error: e.message };
  }
}

async function handleAddStep(msg) {
  const sessions = await loadSessions();
  const session = sessions.find((s) => s.id === msg.sessionId);
  if (!session) return { error: 'Session not found' };

  const stepNumber = session.steps.length + 1;
  msg.step.number = stepNumber;
  session.steps.push(msg.step);
  await chrome.storage.local.set({ sessions });

  // Notify sidepanel about new step
  broadcastToExtension({
    type: 'step-added',
    step: msg.step,
    stepNumber,
  });

  return { stepCount: session.steps.length, stepNumber };
}

async function handleRemoveLastStep(msg) {
  const sessions = await loadSessions();
  const session = sessions.find((s) => s.id === msg.sessionId);
  if (!session || !session.steps.length) return { error: 'No steps to remove' };

  session.steps.pop();
  await chrome.storage.local.set({ sessions });

  if (STATE.tabId) {
    try {
      await chrome.tabs.sendMessage(STATE.tabId, {
        type: 'remove-last-badge',
        stepCount: session.steps.length,
      });
    } catch (_) {}
  }

  return { stepCount: session.steps.length };
}

async function handleRemoveStepAt(msg) {
  const sessions = await loadSessions();
  const session = sessions.find((s) => s.id === msg.sessionId);
  if (!session) return { error: 'Session not found' };

  session.steps.splice(msg.index, 1);
  await chrome.storage.local.set({ sessions });

  if (STATE.tabId) {
    try {
      await chrome.tabs.sendMessage(STATE.tabId, {
        type: 'rebuild-badges',
        steps: session.steps,
      });
    } catch (_) {}
  }

  return { stepCount: session.steps.length };
}

async function handleUpdateSessionTitle(msg) {
  const sessions = await loadSessions();
  const session = sessions.find((s) => s.id === msg.sessionId);
  if (!session) return { error: 'Session not found' };

  session.title = msg.title;
  await chrome.storage.local.set({ sessions });
  return { ok: true };
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

async function handleGetSession(msg) {
  const sessions = await loadSessions();
  const session = sessions.find((s) => s.id === msg.sessionId);
  return { session: session || null };
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

// ── Broadcast to extension pages (sidepanel, popup) ─────────────────────────

function broadcastToExtension(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {
    // No listeners — side panel may not be open
  });
}
