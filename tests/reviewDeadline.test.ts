import assert from 'node:assert/strict';
import test from 'node:test';

import { getReviewDeadlineState } from '../src/lib/reviewDeadline.ts';

test('counts local calendar days rather than rounding partial days', () => {
  const state = getReviewDeadlineState('2026-10-09', new Date(2026, 9, 6, 23, 59));

  assert.equal(state.daysLeft, 3);
  assert.equal(state.hasPassed, false);
  assert.equal(state.remainingPercentage, (3 / 14) * 100);
  assert.equal(state.dueDate.getDate(), 9);
});

test('shows zero remaining time on the deadline date', () => {
  const state = getReviewDeadlineState('2026-10-09', new Date(2026, 9, 9, 0, 1));

  assert.equal(state.daysLeft, 0);
  assert.equal(state.hasPassed, false);
  assert.equal(state.remainingPercentage, 0);
});

test('expired deadlines have no fake minimum progress', () => {
  const state = getReviewDeadlineState('2026-10-09', new Date(2026, 9, 10));

  assert.equal(state.daysLeft, 0);
  assert.equal(state.hasPassed, true);
  assert.equal(state.remainingPercentage, 0);
});

test('clamps the remaining-time bar to the 14-day window', () => {
  const state = getReviewDeadlineState('2026-10-31', new Date(2026, 9, 1));

  assert.equal(state.daysLeft, 30);
  assert.equal(state.remainingPercentage, 100);
});

test('calendar-day countdown stays correct across daylight-saving transitions', () => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';

  try {
    assert.equal(
      getReviewDeadlineState('2026-03-09', new Date(2026, 2, 7, 23, 59)).daysLeft,
      2,
    );
    assert.equal(
      getReviewDeadlineState('2026-11-02', new Date(2026, 9, 31, 0, 1)).daysLeft,
      2,
    );
    assert.equal(
      getReviewDeadlineState('2026-10-09', new Date('2026-10-07T01:00:00Z')).daysLeft,
      3,
    );
  } finally {
    if (originalTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimezone;
    }
  }
});
