const STORAGE_KEY = 'userRetentionSeconds';

export function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export function calculateElapsedSeconds(accumulatedSeconds, startedAtMs, nowMs) {
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  return Math.max(0, Math.floor(accumulatedSeconds)) + Math.floor(elapsedMs / 1000);
}

export function bootstrapUserRetentionTimer({
  documentRef = document,
  storage = sessionStorage,
  now = () => Date.now(),
  setIntervalRef = setInterval,
  clearIntervalRef = clearInterval,
} = {}) {
  const display = documentRef.querySelector('[data-retention-timer]');
  if (!display) return null;

  let accumulatedSeconds = Number(storage.getItem(STORAGE_KEY)) || 0;
  let startedAtMs = now();
  let intervalId = null;

  const render = () => {
    const totalSeconds = documentRef.hidden
      ? accumulatedSeconds
      : calculateElapsedSeconds(accumulatedSeconds, startedAtMs, now());

    display.textContent = formatDuration(totalSeconds);
    display.setAttribute('datetime', `PT${totalSeconds}S`);
  };

  const persistActiveTime = () => {
    if (!documentRef.hidden) {
      accumulatedSeconds = calculateElapsedSeconds(
        accumulatedSeconds,
        startedAtMs,
        now(),
      );
      storage.setItem(STORAGE_KEY, String(accumulatedSeconds));
    }
  };

  const start = () => {
    startedAtMs = now();
    if (intervalId === null) {
      intervalId = setIntervalRef(render, 1000);
    }
    render();
  };

  const pause = () => {
    persistActiveTime();
    if (intervalId !== null) {
      clearIntervalRef(intervalId);
      intervalId = null;
    }
    render();
  };

  const handleVisibilityChange = () => {
    if (documentRef.hidden) {
      pause();
    } else {
      start();
    }
  };

  documentRef.addEventListener('visibilitychange', handleVisibilityChange);
  globalThis.addEventListener?.('pagehide', persistActiveTime);
  start();

  return { pause, render, start };
}

if (typeof document !== 'undefined') {
  bootstrapUserRetentionTimer();
}
