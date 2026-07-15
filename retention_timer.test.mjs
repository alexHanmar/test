import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
