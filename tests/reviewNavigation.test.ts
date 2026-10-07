import assert from 'node:assert/strict';
import test from 'node:test';
import { getReviewSelectionIndex } from '../src/lib/reviewNavigation';
import { writeApplicationFilters } from '../src/lib/applicationFilters';

const rows = [{ index: 27, data: ['Maya'] }, { index: 14, data: ['Alex'] }];

test('direct application links resolve the saved ID after queue sorting', () => {
  assert.equal(getReviewSelectionIndex({ rows, applicationId: 'sheet-row:14', page: '1' }), 1);
  assert.equal(getReviewSelectionIndex({ rows: [...rows].reverse(), applicationId: 'sheet-row:14', page: '99' }), 0);
});
test('a missing or invalid explicit application never selects someone else', () => {
  for (const applicationId of ['sheet-row:31', '', 'not-an-id']) {
    assert.equal(getReviewSelectionIndex({ rows, applicationId, page: '1' }), -1);
  }
  assert.equal(getReviewSelectionIndex({ rows: [], applicationId: 'sheet-row:14', page: null }), -1);
});
test('ordinary pagination remains one-based, clamps to the queue, and defaults safely', () => {
  assert.equal(getReviewSelectionIndex({ rows, applicationId: null, page: '2' }), 1);
  assert.equal(getReviewSelectionIndex({ rows, applicationId: null, page: '99' }), 1);
  for (const page of [null, 'bad', '0', '-1', '1.5', '2x']) {
    assert.equal(getReviewSelectionIndex({ rows, applicationId: null, page }), 0);
  }
});

test('applying filters clears a direct application selection and restarts pagination', () => {
  const next = writeApplicationFilters(new URLSearchParams('application=sheet-row%3A14&q=4&filter=assignedToMe'), {
    firstChoice: 'ai', questions: [],
  });
  assert.equal(next.has('application'), false);
  assert.equal(next.get('q'), '1');
  assert.equal(next.get('filter'), 'assignedToMe');
  assert.equal(next.get('firstChoice'), 'ai');
});
