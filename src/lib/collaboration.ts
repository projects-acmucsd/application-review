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
      field: typeof REVIEWER_COMMENTS_FIELD;
      reviewerId: string;
      reviewerName: string;
      value: string;
      updatedAt: string;
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

function getWebSocketBaseUrl(): string {
  if (import.meta.env.VITE_WS_BASE_URL) {
    return import.meta.env.VITE_WS_BASE_URL.replace(/\/$/, '');
  }

  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/^http/, 'ws').replace(
      /\/$/,
      '',
    );
  }

  if (window.location.hostname === 'localhost') {
    return 'ws://localhost:4000';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

export function createCollaborationSocket(): WebSocket {
  return new WebSocket(`${getWebSocketBaseUrl()}/ws/collaboration`);
}

export function parseCollaborationMessage(
  value: string,
): CollaborationServerMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) {
    return null;
  }

  return parsed as CollaborationServerMessage;
}
