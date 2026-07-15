import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bootstrapUserRetentionTimer,
  calculateElapsedSeconds,
  formatDuration,
} from './retention_timer.mjs';

test('formatDuration renders seconds as HH:MM:SS', () => {
  assert.equal(formatDuration(0), '00:00:00');
  assert.equal(formatDuration(65), '00:01:05');
  assert.equal(formatDuration(3661), '01:01:01');
});

test('calculateElapsedSeconds adds active interval to accumulated time', () => {
  assert.equal(calculateElapsedSeconds(10, 1_000, 6_900), 15);
});

test('calculateElapsedSeconds ignores negative clock movement', () => {
  assert.equal(calculateElapsedSeconds(10, 6_000, 5_000), 10);
});

test('visibility change persists the final visible interval before pausing', () => {
  let currentTime = 0;
  const listeners = new Map();
  const storedValues = new Map();
  const display = {
    textContent: '',
    setAttribute() {},
  };
  const documentRef = {
    hidden: false,
    querySelector: () => display,
    addEventListener: (name, listener) => listeners.set(name, listener),
  };
  const storage = {
    getItem: (key) => storedValues.get(key) ?? null,
    setItem: (key, value) => storedValues.set(key, value),
  };

  bootstrapUserRetentionTimer({
    documentRef,
    storage,
    now: () => currentTime,
    setIntervalRef: () => 1,
    clearIntervalRef: () => {},
  });

  currentTime = 5_500;
  documentRef.hidden = true;
  listeners.get('visibilitychange')();

  assert.equal(storedValues.get('userRetentionSeconds'), '5');
  assert.equal(display.textContent, '00:00:05');
});
