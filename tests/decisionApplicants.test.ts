import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDecisionEmailList, buildDecisionGroups, filterDecisionApplicantsBySearch } from '../src/lib/decisionApplicants.ts';
import type { SheetRow } from '../src/lib/googleSheetData.ts';
import type { ApplicationReview } from '../src/lib/reviewApi.ts';

function review(
  applicationId: string,
  decision: ApplicationReview['decision'],
  rating: number | null,
  overrides: Partial<ApplicationReview> = {},
): ApplicationReview {
  return {
    applicationId,
    decision,
    rating,
    updatedAt: '2026-10-06T17:00:00.000Z',
    updatedByName: 'Test Reviewer',
    updatedByEmail: 'reviewer@acmucsd.org',
    ...overrides,
  };
}

function row(index: number, name: string, firstChoice = 'AI'): SheetRow {
  const data = Array<string>(17).fill('');
  data[2] = name;
  data[13] = firstChoice;
  return { index, data };
}

test('includes every saved decision, including accepted applicants without ratings', () => {
  const groups = buildDecisionGroups({
    reviews: [
      review('sheet-row:7', 'accept', 9),
      review('sheet-row:3', 'accept', null),
      review('sheet-row:8', 'waitlist', null),
      review('sheet-row:4', 'reject', 6),
      review('sheet-row:6', 'reject', null),
      review('sheet-row:5', null, 10),
    ],
    // Sheet order must not determine which metadata belongs to a saved review.
    rows: [row(3, 'Maya Patel', 'Design'), row(7, 'Alex Chen'), row(5, 'Undecided Applicant')],
    headers: [],
  });

  assert.deepEqual(
    Object.fromEntries(Object.entries(groups).map(([decision, applicants]) => [decision, applicants.length])),
    { accept: 2, waitlist: 1, reject: 2 },
  );
  assert.deepEqual(groups.accept.map((applicant) => applicant.applicantName), ['Alex Chen', 'Maya Patel']);
  assert.equal(groups.accept[1].rating, null);
  assert.equal(groups.accept[1].applicationIndex, 3);
  assert.equal(groups.accept[1].firstChoice, 'Design');
  assert.ok(Object.values(groups).flat().every((applicant) => applicant.applicationId !== 'sheet-row:5'));
});

test('sorts ratings descending with null last, then names ignoring case and IDs deterministically', () => {
  const reviews = [
    review('sheet-row:15', 'accept', null),
    review('sheet-row:12', 'accept', 8),
    review('sheet-row:3', 'accept', 8),
    review('sheet-row:2', 'accept', 8),
    review('sheet-row:10', 'accept', 10),
    review('sheet-row:8', 'accept', 0),
  ];
  const rows = [
    row(15, 'Aaron'), row(12, 'Maya'), row(3, 'alex'),
    row(2, 'Alex'), row(10, 'Zoe'), row(8, 'Ben'),
  ];
  const expected = ['sheet-row:10', 'sheet-row:2', 'sheet-row:3', 'sheet-row:12', 'sheet-row:8', 'sheet-row:15'];
  const orderedIds = (input: ApplicationReview[]) =>
    buildDecisionGroups({ reviews: input, rows, headers: [] }).accept.map((applicant) => applicant.applicationId);

  assert.deepEqual(orderedIds(reviews), expected);
  assert.deepEqual(orderedIds([...reviews].reverse()), expected);
  assert.equal(reviews[0].applicationId, 'sheet-row:15');
});

test('keeps missing-sheet records in the count without linking to a guessed application', () => {
  const groups = buildDecisionGroups({
    reviews: [review('sheet-row:42', 'accept', 9), review('imported-application', 'waitlist', 7)],
    rows: [row(2, 'Unrelated Applicant')],
    headers: [],
  });

  for (const applicant of [...groups.accept, ...groups.waitlist]) {
    assert.equal(applicant.applicationIndex, null);
    assert.equal(applicant.applicantName, `Application ${applicant.applicationId}`);
    assert.equal(applicant.firstChoice, 'Unspecified');
  }
  assert.equal(groups.accept.length + groups.waitlist.length, 2);
});

test('uses the detected overall first-choice column instead of a fixed sheet position', () => {
  const applicantRow = row(4, 'Jordan Lee', 'Wrong legacy value');
  applicantRow.data[3] = 'Mechanical Engineer';
  applicantRow.data[6] = 'Robotics';
  const headers = Array<string>(17).fill('Question');
  headers[3] = '[Robotics] Your first choice role';
  headers[6] = '[General] First Priority';

  const { accept } = buildDecisionGroups({
    reviews: [review('sheet-row:4', 'accept', 8)],
    rows: [applicantRow],
    headers,
  });

  assert.equal(accept[0].firstChoice, 'Robotics');
});

test('retains the legacy first-choice fallback when headers have no overall first choice', () => {
  const headers = Array<string>(17).fill('Question');
  headers[4] = 'Second Priority';
  const { reject } = buildDecisionGroups({
    reviews: [review('sheet-row:9', 'reject', 4)],
    rows: [row(9, 'Taylor Kim', '  Hack  ')],
    headers,
  });

  assert.equal(reject[0].firstChoice, 'Hack');
});

test('preserves the saved update and uses reviewer email only when the name is blank', () => {
  const { accept, waitlist, reject } = buildDecisionGroups({
    reviews: [
      review('sheet-row:2', 'accept', null, { updatedByName: '  Maya Reviewer  ', updatedAt: '2026-10-05T01:02:03.000Z' }),
      review('sheet-row:3', 'waitlist', null, { updatedByName: ' ', updatedByEmail: ' backup@acmucsd.org ' }),
      review('sheet-row:4', 'reject', null, { updatedByName: '', updatedByEmail: ' ' }),
    ],
    rows: [row(2, '  Alex Chen  '), row(3, ''), row(4, 'Casey Nguyen', '')],
    headers: [],
  });

  assert.equal(accept[0].applicantName, 'Alex Chen');
  assert.equal(accept[0].updatedByName, 'Maya Reviewer');
  assert.equal(accept[0].updatedAt, '2026-10-05T01:02:03.000Z');
  assert.equal(waitlist[0].updatedByName, 'backup@acmucsd.org');
  assert.equal(waitlist[0].applicantName, 'Application 3');
  assert.equal(reject[0].updatedByName, 'Unknown reviewer');
  assert.equal(reject[0].firstChoice, 'Unspecified');
});

test('returns all empty groups when there are no saved decisions', () => {
  assert.deepEqual(buildDecisionGroups({ reviews: [], rows: [], headers: [] }), {
    accept: [], waitlist: [], reject: [],
  });
  assert.deepEqual(buildDecisionGroups({
    reviews: [review('sheet-row:2', null, null)], rows: [row(2, 'Unreviewed')], headers: [],
  }), { accept: [], waitlist: [], reject: [] });
});

test('reads applicant email from the general email column, independently of reviewer email', () => {
  const applicant = row(14, 'Alex Chen');
  applicant.data[1] = 'not-the-email-column';
  applicant.data[4] = 'track-contact@example.test';
  applicant.data[6] = ' Alex.Chen+projects@example.test ';
  const headers = Array<string>(17).fill('Question');
  headers[4] = '[Robotics] Email Address';
  headers[6] = '[General] Email Address';
  const groups = buildDecisionGroups({
    reviews: [review('sheet-row:14', 'accept', null)],
    rows: [applicant],
    headers,
  });

  assert.equal(groups.accept[0].email, 'Alex.Chen+projects@example.test');
});

test('retains the legacy applicant email column when there is no labelled email header', () => {
  const applicant = row(2, 'Maya Patel');
  applicant.data[1] = ' maya@example.test ';
  const groups = buildDecisionGroups({
    reviews: [review('sheet-row:2', 'waitlist', 8), review('sheet-row:999', 'reject', null)],
    rows: [applicant],
    headers: [],
  });

  assert.equal(groups.waitlist[0].email, 'maya@example.test');
  assert.equal(groups.reject[0].email, null);
});


test('formats only the selected decision group as comma-separated applicant emails', () => {
  const accepted = row(14, 'Alex Chen');
  accepted.data[1] = 'alex@example.test';
  const unratedAccepted = row(27, 'Maya Patel');
  unratedAccepted.data[1] = 'maya@example.test';
  const waitlisted = row(31, 'Jordan Lee');
  waitlisted.data[1] = 'jordan@example.test';
  const rejected = row(42, 'Sam Rivera');
  rejected.data[1] = 'sam@example.test';
  const undecided = row(56, 'Taylor Kim');
  undecided.data[1] = 'taylor@example.test';
  const groups = buildDecisionGroups({
    reviews: [review('sheet-row:14', 'accept', 9), review('sheet-row:27', 'accept', null),
      review('sheet-row:31', 'waitlist', 8), review('sheet-row:42', 'reject', 3), review('sheet-row:56', null, 10)],
    rows: [undecided, rejected, waitlisted, unratedAccepted, accepted], headers: [],
  });

  assert.equal(buildDecisionEmailList(groups.accept).text, 'alex@example.test, maya@example.test');
  assert.equal(buildDecisionEmailList(groups.waitlist).text, 'jordan@example.test');
  assert.equal(buildDecisionEmailList(groups.reject).text, 'sam@example.test');
});

test('deduplicates emails ignoring case and skips blank or malformed addresses', () => {
  const recipients = buildDecisionEmailList([
    { email: ' Alex+projects@example.test ' }, { email: 'alex+projects@EXAMPLE.test' },
    { email: null }, { email: ' ' }, { email: 'not an email' },
    { email: 'one@example.test, two@example.test' }, { email: 'injected@example.test\nBcc: other@example.test' },
    { email: 'maya@example.test' },
  ]);

  assert.deepEqual(recipients.emails, ['Alex+projects@example.test', 'maya@example.test']);
  assert.equal(recipients.text, 'Alex+projects@example.test, maya@example.test');
  assert.equal(recipients.missingEmailCount, 5);
});

test('does not substitute another column when the detected email cell is empty', () => {
  const applicant = row(2, 'Alex Chen');
  applicant.data[1] = 'different-contact@example.test';
  const headers = Array<string>(17).fill('Question');
  headers[6] = 'Email Address';
  const groups = buildDecisionGroups({ reviews: [review('sheet-row:2', 'accept', 9)], rows: [applicant], headers });

  assert.deepEqual(buildDecisionEmailList(groups.accept), { emails: [], text: '', missingEmailCount: 1 });
  assert.deepEqual(buildDecisionEmailList([]), { emails: [], text: '', missingEmailCount: 0 });
});

test('searching decision groups matches name or email and leaves the order alone', () => {
  const groups = buildDecisionGroups({
    reviews: [review('sheet-row:1', 'accept', 9), review('sheet-row:2', 'accept', 8), review('sheet-row:3', 'reject', 4)],
    rows: [row(1, 'Maya Patel'), row(2, 'José Chen'), row(3, 'Alex Rivera')],
    headers: [],
  });

  assert.deepEqual(filterDecisionApplicantsBySearch(groups.accept, 'maya').map((a) => a.applicantName), ['Maya Patel']);
  assert.deepEqual(filterDecisionApplicantsBySearch(groups.accept, 'JOSE').map((a) => a.applicantName), ['José Chen']);
  assert.deepEqual(filterDecisionApplicantsBySearch(groups.reject, 'maya'), []);
  // An empty term passes the group straight through, order intact.
  for (const blank of ['', '   ']) {
    assert.deepEqual(filterDecisionApplicantsBySearch(groups.accept, blank), groups.accept);
  }
  // The counts a reviewer sees on the tabs while searching.
  assert.deepEqual(
    (['accept', 'reject'] as const).map((key) => filterDecisionApplicantsBySearch(groups[key], 'rivera').length),
    [0, 1],
  );
});
