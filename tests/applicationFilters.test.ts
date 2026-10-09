import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterRowsByApplicantSearch,
  filterRowsByApplicationFilters,
  getBinaryQuestions,
  matchesApplicantSearch,
  normalizeApplicantSearchText,
  readApplicantSearch,
  getReviewPage,
  readApplicationFilters,
  readQueueScope,
  writeApplicantSearch,
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
  assert.deepEqual(filterRowsByApplicationFilters(rows, headers, { decisionStatus: null, firstChoice: 'ai', questions }).map(({ index }) => index), [1, 4]);
  assert.deepEqual(filterRowsByApplicationFilters(rows, headers, { decisionStatus: null, firstChoice: null, questions: [{ question: headers[2], answer: 'no' }] }).map(({ index }) => index), [2]);
  assert.deepEqual(filterRowsByApplicationFilters(rows, headers, { decisionStatus: null, firstChoice: 'ai', questions: [] }).map(({ index }) => index), [1, 3, 4]);
});

test('missing questions produce no matches, and header reordering does not change the selected question', () => {
  const filters = { decisionStatus: null, firstChoice: null, questions: [{ question: headers[2], answer: 'yes' as const }] };
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
  const filters = { decisionStatus: null, firstChoice: 'design' as const, questions: [{ question: 'Question with & and :?', answer: 'no' as const }] };
  const next = writeApplicationFilters(params, filters);
  assert.equal(next.get('filter'), 'assignedToMe');
  assert.equal(next.get('extra'), 'keep');
  assert.deepEqual(readApplicationFilters(next), filters);
  assert.equal(params.get('q'), '8');
});

test('ignores malformed and duplicate answer parameters without discarding valid filters', () => {
  const params = new URLSearchParams('firstChoice=invalid&answer=not-json');
  for (const item of [['Valid?', 'yes'], ['Valid?', 'no'], ['Other?', 'maybe'], [4, 'yes'], ['', 'no']]) params.append('answer', JSON.stringify(item));
  assert.deepEqual(readApplicationFilters(params), { decisionStatus: null, firstChoice: null, questions: [{ question: 'Valid?', answer: 'yes' }] });
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
    assert.equal(writeApplicationFilters(params, { decisionStatus: null, firstChoice: 'ai', questions: [] }).get('filter'), 'assignedToMe');
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

const searchHeaders = ['Timestamp', 'Email Address', 'Full Name'];
const searchRows = [
  { index: 1, data: ['t', 'maya@acmucsd.org', 'Maya  Patel'] },
  { index: 2, data: ['t', 'jchen@acmucsd.org', 'José Chen'] },
  { index: 3, data: ['t', 'alex@acmucsd.org', 'Alex Rivera'] },
];

test('reads the search term without colliding with the legacy name alias', () => {
  assert.equal(readApplicantSearch(new URLSearchParams('search=%20Maya%20')), 'Maya');
  assert.equal(readApplicantSearch(new URLSearchParams()), '');
  assert.equal(readApplicantSearch(new URLSearchParams('search=%20%20')), '');
  // ?name= stays a legacy track alias in both directions.
  assert.equal(readApplicantSearch(new URLSearchParams('name=AI')), '');
  assert.equal(readApplicationFilters(new URLSearchParams('search=ai')).firstChoice, null);
  assert.equal(readQueueScope(new URLSearchParams('search=mine')), 'all');
});

test('writing a search resets pagination, drops a pinned application and keeps other filters', () => {
  const params = new URLSearchParams('filter=assignedToMe&firstChoice=ai&q=8&application=sheet-row%3A14&extra=keep');
  params.append('answer', JSON.stringify(['Valid?', 'yes']));
  const next = writeApplicantSearch(params, '  Maya  ', 1);
  assert.equal(next.get('search'), 'Maya');
  assert.equal(next.get('q'), '1');
  assert.equal(next.has('application'), false);
  for (const [key, value] of [['filter', 'assignedToMe'], ['firstChoice', 'ai'], ['extra', 'keep']]) {
    assert.equal(next.get(key), value);
  }
  assert.deepEqual(next.getAll('answer'), [JSON.stringify(['Valid?', 'yes'])]);
  // The caller's params are never mutated.
  assert.equal(params.get('q'), '8');
  for (const blank of ['', '   ']) assert.equal(writeApplicantSearch(params, blank, 1).has('search'), false);
  // A null page leaves pagination and selection untouched, for pages without a pager.
  const unpaged = writeApplicantSearch(params, 'Maya', null);
  assert.equal(unpaged.get('q'), '8');
  assert.equal(unpaged.get('application'), 'sheet-row:14');
});

test('applying popover filters preserves an active search term', () => {
  const searched = writeApplicantSearch(new URLSearchParams('q=4'), 'may', 1);
  const applied = writeApplicationFilters(searched, { decisionStatus: null, firstChoice: 'design', questions: [] });
  assert.equal(applied.get('search'), 'may');
  assert.equal(applied.get('firstChoice'), 'design');
  assert.equal(applied.get('q'), '1');
  // Round-trips through a real URL, including characters that need encoding.
  const encoded = new URLSearchParams(writeApplicantSearch(new URLSearchParams(), 'a&b?c%d+e', 1).toString());
  assert.equal(readApplicantSearch(encoded), 'a&b?c%d+e');
});

test('matches applicants on name or email, folding case, accents and repeated spaces', () => {
  const indexes = (term: string) => filterRowsByApplicantSearch(searchRows, searchHeaders, term).map(({ index }) => index);
  assert.deepEqual(indexes('maya'), [1]);
  assert.deepEqual(indexes('MAYA'), [1]);
  assert.deepEqual(indexes('maya patel'), [1]);
  assert.deepEqual(indexes('jose'), [2]);
  assert.deepEqual(indexes('chen'), [2]);
  assert.deepEqual(indexes('acmucsd.org'), [1, 2, 3]);
  assert.deepEqual(indexes('nobody'), []);
  for (const blank of ['', '   ']) assert.equal(filterRowsByApplicantSearch(searchRows, searchHeaders, blank), searchRows);
  assert.equal(normalizeApplicantSearchText('  José   Chen '), 'jose chen');
  // With no headers the resolver falls back to the original form columns.
  assert.equal(matchesApplicantSearch([], ['t', 'maya@acmucsd.org', 'Maya Patel'], 'maya'), true);
  assert.equal(matchesApplicantSearch(searchHeaders, [], 'maya'), false);
});

const decisionRows = [
  { index: 1, data: ['Accepted applicant', 'AI', 'yes'] },
  { index: 2, data: ['Waitlisted applicant', 'Design', 'no'] },
  { index: 3, data: ['Rejected applicant', 'AI', 'yes'] },
  { index: 4, data: ['Comment only applicant', 'AI', 'yes'] },
  { index: 5, data: ['Untouched applicant', 'Design', 'no'] },
];
const decisionReviews = {
  'sheet-row:1': { decision: 'accept' as const },
  'sheet-row:2': { decision: 'waitlist' as const },
  'sheet-row:3': { decision: 'reject' as const },
  'sheet-row:4': { decision: null },
};

test('decision status uses saved decisions; None includes null decisions and applicants without reviews', () => {
  for (const [decisionStatus, expected] of [
    ['accept', [1]], ['waitlist', [2]], ['reject', [3]], ['none', [4, 5]], [null, [1, 2, 3, 4, 5]],
  ] as const) {
    assert.deepEqual(filterRowsByApplicationFilters(decisionRows, headers, {
      decisionStatus, firstChoice: null, questions: [],
    }, decisionReviews).map(({ index }) => index), expected);
  }
});

test('decision filtering combines with first choice, questions, search and an already scoped queue', () => {
  const filters = { decisionStatus: 'none' as const, firstChoice: 'ai' as const, questions: [{ question: headers[2], answer: 'yes' as const }] };
  const matched = filterRowsByApplicationFilters(decisionRows, headers, filters, decisionReviews);
  assert.deepEqual(matched.map(({ index }) => index), [4]);
  assert.deepEqual(filterRowsByApplicantSearch(matched, headers, 'comment only').map(({ index }) => index), [4]);
  assert.deepEqual(filterRowsByApplicationFilters(decisionRows.slice(0, 3), headers, filters, decisionReviews), []);
});

test('unknown review data never counts as None, and a saved decision removes an applicant from None', () => {
  const filters = { decisionStatus: 'none' as const, firstChoice: null, questions: [] };
  assert.deepEqual(filterRowsByApplicationFilters(decisionRows, headers, filters, null), []);
  assert.equal(filterRowsByApplicationFilters(decisionRows, headers, { ...filters, decisionStatus: null }, null).length, 5);
  assert.equal(filterRowsByApplicationFilters(decisionRows, headers, filters, {}).length, 5);
  const updated = { ...decisionReviews, 'sheet-row:4': { decision: 'accept' as const } };
  assert.deepEqual(filterRowsByApplicationFilters(decisionRows, headers, filters, updated).map(({ index }) => index), [5]);
});

test('decision URLs survive reload, search and queue changes and clear with Reset', () => {
  for (const decisionStatus of ['accept', 'waitlist', 'reject', 'none'] as const) {
    const filters = { decisionStatus, firstChoice: 'ai' as const, questions: [] };
    const params = new URLSearchParams('filter=assignedToMe&search=applicant&q=9&application=sheet-row:4');
    const written = writeApplicationFilters(params, filters);
    assert.deepEqual(readApplicationFilters(new URLSearchParams(written.toString())), filters);
    assert.equal(written.get('q'), '1');
    assert.equal(written.has('application'), false);
    assert.equal(written.get('filter'), 'assignedToMe');
    assert.equal(written.get('search'), 'applicant');
    assert.equal(writeApplicantSearch(written, 'new', 1).get('decision'), decisionStatus);
    const reset = writeApplicationFilters(written, { decisionStatus: null, firstChoice: null, questions: [] });
    assert.equal(reset.has('decision'), false);
    assert.equal(reset.get('search'), 'applicant');
  }
  for (const value of ['accepted', 'invalid', 'null', '']) {
    assert.equal(readApplicationFilters(new URLSearchParams({ decision: value })).decisionStatus, null);
  }
});
