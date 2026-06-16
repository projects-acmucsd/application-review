import assert from 'node:assert/strict';
import test from 'node:test';

import { parseReviewBody } from './reviews.routes.js';

test('parseReviewBody accepts valid review values', () => {
  assert.deepEqual(
    parseReviewBody({
      decision: 'accept',
      rating: 10,
    }),
    {
      decision: 'accept',
      rating: 10,
    },
  );
});

test('parseReviewBody normalizes omitted review values to null', () => {
  assert.deepEqual(parseReviewBody({}), {
    decision: null,
    rating: null,
  });
});

test('parseReviewBody rejects non-numeric ratings', () => {
  assert.throws(
    () => parseReviewBody({ rating: '10' }),
    /Rating must be a number or null\./,
  );
});

test('parseReviewBody rejects invalid decisions', () => {
  assert.throws(
    () => parseReviewBody({ decision: 'maybe' }),
    /Decision must be reject, waitlist, accept, or null\./,
  );
});
