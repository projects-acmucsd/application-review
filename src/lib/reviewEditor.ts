import type { ApplicationReview, ReviewDecision } from './reviewApi';

export interface ReviewEditorState {
  applicationId: string | null;
  comment: string;
  rating: number | null;
  decision: ReviewDecision | null;
  expectedUpdatedAt: string | null;
  isEditing: boolean;
}

export const EMPTY_REVIEW_EDITOR: ReviewEditorState = {
  applicationId: null,
  comment: '',
  rating: null,
  decision: null,
  expectedUpdatedAt: null,
  isEditing: false,
};

interface SavedReviewState {
  applicationId: string | null;
  review?: ApplicationReview;
  legacyComment: string;
}

type ReviewEditorAction =
  | ({ type: 'receive' | 'reset' } & SavedReviewState)
  | { type: 'edit' }
  | { type: 'comment'; value: string }
  | { type: 'rating'; value: number }
  | { type: 'decision'; value: ReviewDecision }
  | { type: 'saved'; review: ApplicationReview };

export function getSavedComment(
  review: ApplicationReview | undefined,
  legacyComment: string,
): string {
  // Null means no cloud comment yet. An empty string is an intentional clear.
  return review?.comment ?? legacyComment;
}

function fromSavedReview({
  applicationId,
  review,
  legacyComment,
}: SavedReviewState): ReviewEditorState {
  if (!applicationId) return EMPTY_REVIEW_EDITOR;
  return {
    applicationId,
    comment: getSavedComment(review, legacyComment),
    rating: review?.rating ?? null,
    decision: review?.decision ?? null,
    expectedUpdatedAt: review?.updatedAt ?? null,
    isEditing: false,
  };
}

export function reviewEditorReducer(
  state: ReviewEditorState,
  action: ReviewEditorAction,
): ReviewEditorState {
  switch (action.type) {
    case 'receive':
      // Polling must preserve both the draft and the version it started from.
      if (state.applicationId === action.applicationId && state.isEditing) {
        return state;
      }
      return fromSavedReview(action);
    case 'reset':
      return fromSavedReview(action);
    case 'edit':
      return { ...state, isEditing: true };
    case 'comment':
      return { ...state, comment: action.value, isEditing: true };
    case 'rating':
      return { ...state, rating: action.value, isEditing: true };
    case 'decision':
      return {
        ...state,
        decision: state.decision === action.value ? null : action.value,
        isEditing: true,
      };
    case 'saved':
      // A save can finish after navigation. Never replace the next applicant's draft.
      if (state.applicationId !== action.review.applicationId) return state;
      return fromSavedReview({
        applicationId: action.review.applicationId,
        review: action.review,
        legacyComment: '',
      });
  }
}
