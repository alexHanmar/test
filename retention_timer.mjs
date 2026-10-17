const STORAGE_KEY = 'userRetentionMs';
const LEGACY_STORAGE_KEY = 'userRetentionSeconds';

export function formatDuration(totalSeconds) {
  const numericSeconds = Number(totalSeconds);
  const safeSeconds = Number.isFinite(numericSeconds)
    ? Math.max(0, Math.floor(numericSeconds))
    : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export function calculateElapsedMs(accumulatedMs, startedAtMs, nowMs) {
  return Math.max(0, accumulatedMs) + Math.max(0, nowMs - startedAtMs);
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

// Accessing sessionStorage throws when site data is blocked or in sandboxed iframes.
function resolveDefaultStorage() {
  try {
    return globalThis.sessionStorage ?? createMemoryStorage();
  } catch {
    return createMemoryStorage();
  }
}

function parseNonNegative(value) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function readStoredMs(storage) {
  try {
    const storedMs = parseNonNegative(storage.getItem(STORAGE_KEY));
    if (storedMs !== null) return storedMs;

    const legacySeconds = parseNonNegative(storage.getItem(LEGACY_STORAGE_KEY));
    return legacySeconds === null ? 0 : legacySeconds * 1000;
  } catch {
    return 0;
  }
}

function writeStoredMs(storage, totalMs) {
  try {
    storage.setItem(STORAGE_KEY, String(totalMs));
  } catch {
    // Persistence is best effort; the in-memory total stays authoritative.
  }
}

export function bootstrapUserRetentionTimer({
  documentRef = document,
  windowRef = globalThis,
  storage = resolveDefaultStorage(),
  now = () => Date.now(),
  setIntervalRef = setInterval,
  clearIntervalRef = clearInterval,
} = {}) {
  const display = documentRef.querySelector('[data-retention-timer]');
  if (!display) return null;

  let accumulatedMs = readStoredMs(storage);
  let startedAtMs = 0;
  let intervalId = null;
  let isRunning = false;

  const getCurrentMs = () => (
    isRunning
      ? calculateElapsedMs(accumulatedMs, startedAtMs, now())
      : accumulatedMs
  );

  const render = () => {
    const totalSeconds = Math.floor(getCurrentMs() / 1000);
    display.textContent = formatDuration(totalSeconds);
    display.setAttribute('datetime', `PT${totalSeconds}S`);
  };

  const start = () => {
    if (isRunning) return;

    startedAtMs = now();
    isRunning = true;
    intervalId = setIntervalRef(render, 1000);
    render();
  };

  const pause = () => {
    if (isRunning) {
      // Update in-memory state before touching storage so a storage failure
      // cannot leave the timer half-stopped.
      accumulatedMs = calculateElapsedMs(accumulatedMs, startedAtMs, now());
      isRunning = false;
      clearIntervalRef(intervalId);
      intervalId = null;
      writeStoredMs(storage, accumulatedMs);
    }
    render();
  };

  const syncWithVisibility = () => {
    if (documentRef.hidden) {
      pause();
    } else {
      start();
    }
  };

  documentRef.addEventListener('visibilitychange', syncWithVisibility);
  windowRef.addEventListener?.('pagehide', pause);
  windowRef.addEventListener?.('pageshow', syncWithVisibility);
  syncWithVisibility();

  const destroy = () => {
    pause();
    documentRef.removeEventListener?.('visibilitychange', syncWithVisibility);
    windowRef.removeEventListener?.('pagehide', pause);
    windowRef.removeEventListener?.('pageshow', syncWithVisibility);
  };

  return { pause, render, start, destroy };
}

if (typeof document !== 'undefined') {
  bootstrapUserRetentionTimer();
}
