export const REVIEWER_COMMENTS_FIELD = 'reviewer_comments';

export interface CollaborationReviewer {
  connectionId: string;
  reviewerId: string;
  reviewerName: string;
  joinedAt: string;
}

export type CollaborationClientMessage =
  | {
      type: 'join_application';
      applicationId: string;
      field?: typeof REVIEWER_COMMENTS_FIELD;
      reviewerId: string;
      reviewerName: string;
      value?: string;
      updatedAt?: string;
    }
  | {
      type: 'leave_application';
      applicationId: string;
      reviewerId: string;
      reviewerName: string;
      updatedAt: string;
    }
  | {
      type: 'comment_draft_update';
      applicationId: string;
      field: typeof REVIEWER_COMMENTS_FIELD;
      reviewerId: string;
      reviewerName: string;
      value: string;
      updatedAt: string;
    }
  | {
      type: 'comment_saved';
      applicationId: string;
      field: typeof REVIEWER_COMMENTS_FIELD;
      reviewerId: string;
      reviewerName: string;
      value: string;
      updatedAt: string;
    };

export type CollaborationServerMessage =
  | {
      type: 'presence_update';
      applicationId: string;
      reviewers: CollaborationReviewer[];
      updatedAt: string;
    }
  | {
      type: 'comment_draft_update';
      applicationId: string;
      field: typeof REVIEWER_COMMENTS_FIELD;
      reviewerId: string;
      reviewerName: string;
      value: string;
      updatedAt: string;
    }
  | {
      type: 'comment_saved';
      applicationId: string;
      field: typeof REVIEWER_COMMENTS_FIELD;
      reviewerId: string;
      reviewerName: string;
      value: string;
      updatedAt: string;
    }
  | {
      type: 'error';
      message: string;
      updatedAt: string;
    };
