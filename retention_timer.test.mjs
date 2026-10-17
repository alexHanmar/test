import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bootstrapUserRetentionTimer,
  calculateElapsedMs,
  formatDuration,
} from './retention_timer.mjs';

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name, listener) => {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
    dispatch: (name) => listeners.get(name)?.(),
    has: (name) => listeners.has(name),
  };
}

function createHarness({ hidden = false, storedValues = {}, storage } = {}) {
  let currentTime = 0;
  let nextIntervalId = 1;
  const activeIntervals = new Map();
  const values = new Map(Object.entries(storedValues));
  const display = {
    textContent: '',
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  const documentRef = {
    ...createEventTarget(),
    hidden,
    querySelector: () => display,
  };
  const windowRef = createEventTarget();

  const timer = bootstrapUserRetentionTimer({
    documentRef,
    windowRef,
    storage: storage ?? {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    now: () => currentTime,
    setIntervalRef: (callback) => {
      const id = nextIntervalId++;
      activeIntervals.set(id, callback);
      return id;
    },
    clearIntervalRef: (id) => activeIntervals.delete(id),
  });

  return {
    timer,
    display,
    values,
    activeIntervals,
    windowRef,
    documentRef,
    advance(ms) {
      currentTime += ms;
      activeIntervals.forEach((callback) => callback());
    },
    setHidden(value) {
      documentRef.hidden = value;
      documentRef.dispatch('visibilitychange');
    },
  };
}

test('formatDuration renders seconds as HH:MM:SS', () => {
  assert.equal(formatDuration(0), '00:00:00');
  assert.equal(formatDuration(65), '00:01:05');
  assert.equal(formatDuration(3661), '01:01:01');
  assert.equal(formatDuration(360_000), '100:00:00');
});

test('formatDuration treats invalid input as zero', () => {
  assert.equal(formatDuration(-5), '00:00:00');
  assert.equal(formatDuration(Number.NaN), '00:00:00');
  assert.equal(formatDuration(Number.POSITIVE_INFINITY), '00:00:00');
});

test('calculateElapsedMs adds active interval to accumulated time', () => {
  assert.equal(calculateElapsedMs(10_000, 1_000, 6_900), 15_900);
});

test('calculateElapsedMs ignores negative clock movement', () => {
  assert.equal(calculateElapsedMs(10_000, 6_000, 5_000), 10_000);
});

test('interval renders the running total every tick', () => {
  const harness = createHarness();

  harness.advance(2_000);

  assert.equal(harness.display.textContent, '00:00:02');
  assert.equal(harness.display.attributes.datetime, 'PT2S');
});

test('hiding the page persists the visible interval and clears the interval', () => {
  const harness = createHarness();

  harness.advance(5_500);
  harness.setHidden(true);

  assert.equal(harness.values.get('userRetentionMs'), '5500');
  assert.equal(harness.display.textContent, '00:00:05');
  assert.equal(harness.activeIntervals.size, 0);
});

test('hidden time is excluded and counting resumes when visible again', () => {
  const harness = createHarness();

  harness.advance(3_000);
  harness.setHidden(true);
  harness.advance(60_000);
  harness.setHidden(false);
  harness.advance(2_000);

  assert.equal(harness.display.textContent, '00:00:05');
  assert.equal(harness.activeIntervals.size, 1);
});

test('repeated visibility events do not start duplicate intervals', () => {
  const harness = createHarness();

  harness.setHidden(false);
  harness.setHidden(false);

  assert.equal(harness.activeIntervals.size, 1);
});

test('sub-second remainders are kept across pauses', () => {
  const harness = createHarness();

  for (let i = 0; i < 10; i += 1) {
    harness.advance(1_900);
    harness.setHidden(true);
    harness.setHidden(false);
  }

  assert.equal(harness.display.textContent, '00:00:19');
});

test('page loaded in the background does not count until visible', () => {
  const harness = createHarness({ hidden: true });

  harness.advance(600_000);
  assert.equal(harness.display.textContent, '00:00:00');
  assert.equal(harness.activeIntervals.size, 0);

  harness.setHidden(false);
  harness.advance(1_000);
  assert.equal(harness.display.textContent, '00:00:01');
});

test('restores accumulated time from storage', () => {
  const harness = createHarness({ storedValues: { userRetentionMs: '61000' } });

  assert.equal(harness.display.textContent, '00:01:01');
});

test('migrates the legacy seconds key', () => {
  const harness = createHarness({ storedValues: { userRetentionSeconds: '42' } });

  assert.equal(harness.display.textContent, '00:00:42');
});

test('ignores invalid stored values', () => {
  for (const storedValue of ['1e400', '-5', 'abc']) {
    const harness = createHarness({ storedValues: { userRetentionMs: storedValue } });
    assert.equal(harness.display.textContent, '00:00:00');
  }
});

test('storage write failure still pauses cleanly without double counting', () => {
  const harness = createHarness({
    storage: {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    },
  });

  harness.advance(10_000);
  harness.setHidden(true);
  harness.advance(10_000);

  assert.equal(harness.display.textContent, '00:00:10');
  assert.equal(harness.activeIntervals.size, 0);

  harness.setHidden(false);
  harness.advance(1_000);
  assert.equal(harness.display.textContent, '00:00:11');
});

test('storage read failure starts from zero', () => {
  const harness = createHarness({
    storage: {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
    },
  });

  harness.advance(1_000);
  assert.equal(harness.display.textContent, '00:00:01');
});

test('pagehide pauses and pageshow resumes when visible', () => {
  const harness = createHarness();

  harness.advance(2_000);
  harness.windowRef.dispatch('pagehide');
  assert.equal(harness.values.get('userRetentionMs'), '2000');
  assert.equal(harness.activeIntervals.size, 0);

  harness.advance(30_000);
  harness.windowRef.dispatch('pageshow');
  harness.advance(1_000);
  assert.equal(harness.display.textContent, '00:00:03');
});

test('destroy stops the timer and removes listeners', () => {
  const harness = createHarness();

  harness.advance(1_000);
  harness.timer.destroy();

  assert.equal(harness.activeIntervals.size, 0);
  assert.equal(harness.documentRef.has('visibilitychange'), false);
  assert.equal(harness.windowRef.has('pagehide'), false);
  assert.equal(harness.windowRef.has('pageshow'), false);
});
