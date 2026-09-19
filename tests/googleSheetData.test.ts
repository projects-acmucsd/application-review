import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getColumnLetter,
  getDynamicSheetValuesRange,
  getFirstChoiceTrack,
  getPriorityColumnIndexes,
  getReviewerCommentsColumnIndex,
  getSheetQuestionLabel,
  getSheetSectionIndexes,
  normalizeSheetTrackName,
  parseSheetSectionHeader,
  REVIEWER_COMMENTS_HEADER,
  type ApplicationSheetData,
} from '../src/lib/googleSheetData.ts';

const source: ApplicationSheetData['source'] = {
  sheetName: "Form Responses 1",
  sheetRange: 'A:BE',
  spreadsheetId: 'spreadsheet-id',
  spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/spreadsheet-id/edit',
  updatedAt: '2026-06-16T00:00:00.000Z',
  updatedByEmail: 'system@acmucsd.org',
};

test('builds a Google Sheets range through the last detected header column', () => {
  const headers = Array.from({ length: 60 }, (_, index) => `Question ${index + 1}`);

  assert.equal(getColumnLetter(1), 'A');
  assert.equal(getColumnLetter(26), 'Z');
  assert.equal(getColumnLetter(27), 'AA');
  assert.equal(getColumnLetter(60), 'BH');
  assert.equal(getDynamicSheetValuesRange(source, headers), "'Form Responses 1'!A1:BH");
});

test('parses section-prefixed headers into the review sections the UI renders', () => {
  const headers = [
    'Timestamp',
    'Email Address',
    'Applicant Name',
    '[General] Why ACM?',
    '[AI] ML experience',
    '[Design] Portfolio',
    '[Hack] Hackathon experience',
    '[Robotics] Robotics experience',
    '[Other] Anything else?',
    REVIEWER_COMMENTS_HEADER,
  ];

  assert.deepEqual(parseSheetSectionHeader('[AI] ML experience'), {
    hasSectionPrefix: true,
    question: 'ML experience',
    sectionKey: 'ai',
  });
  assert.equal(getSheetQuestionLabel('[Robotics] Robotics experience'), 'Robotics experience');
  assert.deepEqual(getSheetSectionIndexes(headers), {
    ai: [4],
    design: [5],
    robotics: [7],
    general: [0, 1, 2, 3],
    hack: [6],
    other: [8],
  });
});

test('falls back to legacy column groups when headers do not have section prefixes', () => {
  const headers = Array.from({ length: 60 }, (_, index) => `Question ${index + 1}`);

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(getSheetSectionIndexes(headers)).map(([section, indexes]) => [
        section,
        indexes.length,
      ]),
    ),
    {
      ai: 8,
      design: 9,
      robotics: 6,
      general: 17,
      hack: 13,
      other: 4,
    },
  );
});

test('detects priority columns, first-choice track, and reviewer comments reliably', () => {
  const headers = [
    'Timestamp',
    'Email Address',
    'Applicant Name',
    'First Choice',
    'Second Priority',
    'Third Choice',
    'Fourth Priority',
    ' reviewer comments ',
  ];
  const row = [
    '2026-06-16',
    'applicant@example.com',
    'Test Applicant',
    'Robotics',
    'AI',
    'Design',
    'Hack',
    '',
  ];

  assert.deepEqual(getPriorityColumnIndexes(headers), [
    { index: 3, priority: 1 },
    { index: 4, priority: 2 },
    { index: 5, priority: 3 },
    { index: 6, priority: 4 },
  ]);
  assert.equal(getFirstChoiceTrack(headers, row), 'robotics');
  assert.equal(normalizeSheetTrackName('Robotics'), 'robotics');
  assert.equal(getReviewerCommentsColumnIndex(headers), 7);
});

test('returns null for unsupported tracks instead of mapping them to Robotics', () => {
  for (const name of ['Game Dev', 'gamedev', 'Game Development', 'game', 'robot', 'unknown', '']) {
    assert.equal(normalizeSheetTrackName(name), null);
    assert.equal(getFirstChoiceTrack(['First Choice'], [name]), null);
  }
  for (const name of ['Game Dev', 'Game Development']) {
    assert.deepEqual(parseSheetSectionHeader(`[${name}] Engine experience`), {
      hasSectionPrefix: false,
      question: 'Engine experience',
      sectionKey: null,
    });
  }
});
