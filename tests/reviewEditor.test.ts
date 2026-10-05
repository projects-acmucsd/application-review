import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY_REVIEW_EDITOR,
  getSavedComment,
  reviewEditorReducer,
} from '../src/lib/reviewEditor.ts';
import type { ApplicationReview } from '../src/lib/reviewApi.ts';

const savedReview: ApplicationReview = {
  applicationId: 'sheet-row:1',
  comment: 'Shared saved comment',
  rating: 7,
  decision: 'waitlist',
  updatedByEmail: 'reviewer@acmucsd.org',
  updatedByName: 'Reviewer',
  updatedAt: '2026-10-05T22:38:48.803697+00:00',
};

function loadedEditor(review: ApplicationReview | undefined = savedReview) {
  return reviewEditorReducer(EMPTY_REVIEW_EDITOR, {
    type: 'receive',
    applicationId: 'sheet-row:1',
    legacyComment: 'Old Sheet comment',
    review,
  });
}

test('legacy comments remain visible until cloud migration; clearing never restores Sheet text', () => {
  assert.equal(getSavedComment(undefined, 'Old Sheet comment'), 'Old Sheet comment');
  assert.equal(getSavedComment({ ...savedReview, comment: null }, 'Old Sheet comment'), 'Old Sheet comment');
  assert.equal(getSavedComment(savedReview, 'Old Sheet comment'), 'Shared saved comment');
  assert.equal(getSavedComment({ ...savedReview, comment: '' }, 'Old Sheet comment'), '');
});

test('cloud state replaces initial Sheet state when reviews arrive', () => {
  const initial = reviewEditorReducer(EMPTY_REVIEW_EDITOR, {
    type: 'receive',
    applicationId: 'sheet-row:1',
    legacyComment: 'Old Sheet comment',
  });
  assert.equal(initial.comment, 'Old Sheet comment');
  assert.equal(initial.expectedUpdatedAt, null);
  const loaded = reviewEditorReducer(initial, {
    type: 'receive',
    applicationId: savedReview.applicationId,
    legacyComment: 'Old Sheet comment',
    review: savedReview,
  });
  assert.equal(loaded.comment, savedReview.comment);
  assert.equal(loaded.rating, 7);
  assert.equal(loaded.decision, 'waitlist');
  assert.equal(loaded.expectedUpdatedAt, savedReview.updatedAt);
});

test('polling keeps all draft values and the original saved version while editing', () => {
  let draft = loadedEditor();
  draft = reviewEditorReducer(draft, { type: 'comment', value: 'Unsaved draft' });
  draft = reviewEditorReducer(draft, { type: 'rating', value: 9 });
  draft = reviewEditorReducer(draft, { type: 'decision', value: 'accept' });
  const polled = reviewEditorReducer(draft, {
    type: 'receive',
    applicationId: savedReview.applicationId,
    legacyComment: 'Old Sheet comment',
    review: { ...savedReview, comment: 'Another reviewer saved', updatedAt: '2026-10-05T22:40:00.000001+00:00' },
  });
  assert.equal(polled, draft);
  assert.equal(polled.comment, 'Unsaved draft');
  assert.equal(polled.rating, 9);
  assert.equal(polled.decision, 'accept');
  assert.equal(polled.expectedUpdatedAt, savedReview.updatedAt);
});

test('cancel restores the latest authoritative review after a conflicting save', () => {
  const draft = reviewEditorReducer(loadedEditor(), { type: 'comment', value: 'Unsaved draft' });
  const latest = { ...savedReview, comment: 'Another reviewer saved', rating: 10, updatedAt: '2026-10-05T22:40:00.000001+00:00' };
  const reset = reviewEditorReducer(draft, {
    type: 'reset',
    applicationId: savedReview.applicationId,
    legacyComment: 'Old Sheet comment',
    review: latest,
  });
  assert.equal(reset.comment, latest.comment);
  assert.equal(reset.rating, latest.rating);
  assert.equal(reset.expectedUpdatedAt, latest.updatedAt);
  assert.equal(reset.isEditing, false);
});

test('successful save uses the returned version and an intentional empty comment', () => {
  const draft = reviewEditorReducer(loadedEditor(), { type: 'comment', value: '' });
  const result = { ...savedReview, comment: '', updatedAt: '2026-10-05T22:40:00.000001+00:00' };
  const saved = reviewEditorReducer(draft, { type: 'saved', review: result });
  assert.equal(saved.comment, '');
  assert.equal(saved.expectedUpdatedAt, result.updatedAt);
  assert.equal(saved.isEditing, false);
});

test('a save finishing after navigation cannot overwrite the next applicant draft', () => {
  let nextApplicant = reviewEditorReducer(loadedEditor(), {
    type: 'receive',
    applicationId: 'sheet-row:2',
    legacyComment: 'Second applicant note',
  });
  nextApplicant = reviewEditorReducer(nextApplicant, { type: 'comment', value: 'Second applicant draft' });
  const afterOldSave = reviewEditorReducer(nextApplicant, { type: 'saved', review: savedReview });
  assert.equal(afterOldSave, nextApplicant);
  assert.equal(afterOldSave.applicationId, 'sheet-row:2');
  assert.equal(afterOldSave.comment, 'Second applicant draft');
});
