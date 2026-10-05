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

test('parseReviewBody accepts a shared comment and preserves timestamp precision', () => {
  assert.deepEqual(
    parseReviewBody({
      comment: 'First line\nSecond line',
      expectedUpdatedAt: '2026-10-05T22:38:48.803697+00:00',
      rating: 7,
      decision: 'waitlist',
    }),
    {
      comment: 'First line\nSecond line',
      expectedUpdatedAt: '2026-10-05T22:38:48.803697+00:00',
      rating: 7,
      decision: 'waitlist',
    },
  );
});

test('parseReviewBody accepts an intentionally empty comment on a new review', () => {
  assert.deepEqual(parseReviewBody({ comment: '', expectedUpdatedAt: null }), {
    comment: '',
    expectedUpdatedAt: null,
    rating: null,
    decision: null,
  });
});

test('parseReviewBody rejects comments without a concurrency version', () => {
  assert.throws(
    () => parseReviewBody({ comment: 'Draft' }),
    /Comment saves require expectedUpdatedAt\./,
  );
});

test('parseReviewBody rejects non-text comments and invalid concurrency versions', () => {
  for (const comment of [null, 7, {}, 'bad\0text']) {
    assert.throws(
      () => parseReviewBody({ comment, expectedUpdatedAt: null }),
      /Comment must be text without null characters\./,
    );
  }
  for (const expectedUpdatedAt of [
    7, {}, '', 'yesterday', '2026-20-05T22:00:00Z', '2026-02-30T22:00:00Z',
  ]) {
    assert.throws(
      () => parseReviewBody({ comment: 'Draft', expectedUpdatedAt }),
      /expectedUpdatedAt must be a valid timestamp or null\./,
    );
  }
});

test('parseReviewBody rejects non-object requests', () => {
  for (const body of [null, [], 'text', 7]) {
    assert.throws(() => parseReviewBody(body), /Review must be an object\./);
  }
});
