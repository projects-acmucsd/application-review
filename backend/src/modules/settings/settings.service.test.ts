import assert from 'node:assert/strict';
import test from 'node:test';

import { getDefaultReviewDueDate } from './settings.service.js';

test('getDefaultReviewDueDate returns a date 14 days after the reference date', () => {
  assert.equal(
    getDefaultReviewDueDate(new Date('2026-06-15T17:00:00.000Z')),
    '2026-06-29',
  );
});
