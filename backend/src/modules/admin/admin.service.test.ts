import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getReviewerOptionFromAuthUser,
  mergeReviewerOptions,
} from './admin.service.js';

test('getReviewerOptionFromAuthUser includes ACM Google auth users', () => {
  assert.deepEqual(
    getReviewerOptionFromAuthUser({
      email: 'Reviewer@ACMUCSD.org',
      user_metadata: {
        full_name: 'Test Reviewer',
      },
    }),
    {
      email: 'reviewer@acmucsd.org',
      name: 'Test Reviewer',
    },
  );
});

test('getReviewerOptionFromAuthUser ignores non-ACM users', () => {
  assert.equal(
    getReviewerOptionFromAuthUser({
      email: 'reviewer@example.com',
      user_metadata: {
        name: 'External Reviewer',
      },
    }),
    null,
  );
});

test('mergeReviewerOptions deduplicates auth and configured reviewers', () => {
  assert.deepEqual(
    mergeReviewerOptions(
      [
        {
          email: 'reviewer@acmucsd.org',
          name: 'Configured Name',
        },
        {
          email: 'lead@acmucsd.org',
          name: 'Lead Reviewer',
        },
      ],
      [
        {
          email: 'reviewer@acmucsd.org',
          name: 'Auth Name',
        },
      ],
    ),
    [
      {
        email: 'reviewer@acmucsd.org',
        name: 'Configured Name',
      },
      {
        email: 'lead@acmucsd.org',
        name: 'Lead Reviewer',
      },
    ],
  );
});
