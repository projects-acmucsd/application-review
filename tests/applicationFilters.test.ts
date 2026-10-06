import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterRowsByApplicationFilters,
  getBinaryQuestions,
  getReviewPage,
  readApplicationFilters,
  readQueueScope,
  writeApplicationFilters,
} from '../src/lib/applicationFilters.ts';

const headers = ['Name', 'First Choice', '[General] Weekly meetings?', '[AI] Prior project?', 'Reviewer Comments', 'Assigned reviewer', 'Free text'];
const rows = [
  { index: 1, data: ['A', 'AI', ' Yes ', 'NO', 'yes', 'yes', 'yes'] },
  { index: 2, data: ['B', 'Design', 'no', 'yes', 'no', 'no', 'maybe'] },
  { index: 3, data: ['C', 'AI', '', 'yes', '', '', 'no'] },
  { index: 4, data: ['D', 'AI', 'yes', 'no', '', '', ''] },
];

test('detects exact binary answers, skips blanks, metadata, mixed answers and duplicate headers', () => {
  assert.deepEqual(getBinaryQuestions(headers, rows).map(({ header }) => header), [headers[2], headers[3]]);
  assert.deepEqual(getBinaryQuestions(['Only Yes', 'Blank', 'Duplicate', 'Duplicate'], [{ index: 1, data: ['YES', '', 'yes', 'no'] }]), [{ header: 'Only Yes', label: 'Only Yes' }]);
  assert.deepEqual(getBinaryQuestions(headers, []), []);
});

test('combines first choice with all question conditions and never matches blank answers', () => {
  const questions = [{ question: headers[2], answer: 'yes' as const }, { question: headers[3], answer: 'no' as const }];
  assert.deepEqual(filterRowsByApplicationFilters(rows, headers, { firstChoice: 'ai', questions }).map(({ index }) => index), [1, 4]);
  assert.deepEqual(filterRowsByApplicationFilters(rows, headers, { firstChoice: null, questions: [{ question: headers[2], answer: 'no' }] }).map(({ index }) => index), [2]);
  assert.deepEqual(filterRowsByApplicationFilters(rows, headers, { firstChoice: 'ai', questions: [] }).map(({ index }) => index), [1, 3, 4]);
});

test('missing questions produce no matches, and header reordering does not change the selected question', () => {
  const filters = { firstChoice: null, questions: [{ question: headers[2], answer: 'yes' as const }] };
  assert.deepEqual(filterRowsByApplicationFilters(rows, ['Changed'], filters), []);
  assert.equal(filterRowsByApplicationFilters([{ index: 1, data: ['yes', 'AI'] }], [headers[2], 'First Choice'], filters).length, 1);
});

test('canonicalizes legacy section URLs while preserving Assigned, other parameters and resetting pagination', () => {
  for (const query of ['filter=AI&q=4', 'name=AI&q=4']) {
    const params = new URLSearchParams(query);
    const filters = readApplicationFilters(params);
    assert.equal(filters.firstChoice, 'ai');
    const next = writeApplicationFilters(params, filters);
    assert.equal(next.get('firstChoice'), 'ai');
    assert.equal(next.has('name'), false);
    assert.equal(next.has('filter'), false);
    assert.equal(next.get('q'), '1');
  }
  const params = new URLSearchParams('filter=assignedToMe&q=8&extra=keep');
  const filters = { firstChoice: 'design' as const, questions: [{ question: 'Question with & and :?', answer: 'no' as const }] };
  const next = writeApplicationFilters(params, filters);
  assert.equal(next.get('filter'), 'assignedToMe');
  assert.equal(next.get('extra'), 'keep');
  assert.deepEqual(readApplicationFilters(next), filters);
  assert.equal(params.get('q'), '8');
});

test('ignores malformed and duplicate answer parameters without discarding valid filters', () => {
  const params = new URLSearchParams('firstChoice=invalid&answer=not-json');
  for (const item of [['Valid?', 'yes'], ['Valid?', 'no'], ['Other?', 'maybe'], [4, 'yes'], ['', 'no']]) params.append('answer', JSON.stringify(item));
  assert.deepEqual(readApplicationFilters(params), { firstChoice: null, questions: [{ question: 'Valid?', answer: 'yes' }] });
});

test('validates and clamps page indexes after filtering', () => {
  for (const value of ['wat', '-1', '0', '1.5', 'Infinity']) assert.equal(getReviewPage(new URLSearchParams({ q: value }), 4), 1);
  assert.equal(getReviewPage(new URLSearchParams('q=20'), 4), 4);
  assert.equal(getReviewPage(new URLSearchParams('q=2'), 4), 2);
  assert.equal(getReviewPage(new URLSearchParams('q=20'), 0), 1);
});


test('preserves and canonicalizes legacy Assigned aliases', () => {
  for (const query of ['filter=mine', 'filter=assigned_to_me', 'filter=ASSIGNEDTOME', 'name=mine']) {
    const params = new URLSearchParams(query);
    assert.equal(readQueueScope(params), 'assignedToMe');
    assert.equal(writeApplicationFilters(params, { firstChoice: 'ai', questions: [] }).get('filter'), 'assignedToMe');
  }
});

test('uses one priority source while queue scope remains independent', () => {
  const params = new URLSearchParams('filter=ai&firstChoice=design');
  assert.equal(readQueueScope(params), 'all');
  const filters = readApplicationFilters(params);
  assert.equal(filters.firstChoice, 'design');
  assert.deepEqual(filterRowsByApplicationFilters(rows, headers, filters).map(({ index }) => index), [2]);
});

test('retains binary questions with metadata words and disambiguates repeated section questions', () => {
  const questions = ['Would you like email updates?', 'Have you received feedback on a project?', '[AI] Available?', '[Hack] Available?'];
  const detected = getBinaryQuestions(questions, [{ index: 1, data: ['yes', 'no', 'yes', 'no'] }]);
  assert.deepEqual(detected.map(({ label }) => label), [questions[0], questions[1], 'Available? (AI)', 'Available? (Hack)']);
});
