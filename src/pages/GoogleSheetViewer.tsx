import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { InternalShell } from '../components/InternalShell';
import {
  ReviewAnswersSkeleton,
  ReviewPanelSkeleton,
  ReviewSummarySkeleton,
} from '../components/LoadingSkeletons';
import {
  clearCachedAdminAccess,
  getAdminStatus,
  hasCachedAdminAccess,
  listMyAssignments,
  type ApplicationAssignment,
} from '../lib/adminApi';
import {
  completeGoogleSignInFromRedirect,
  getGoogleApiClient,
  getStoredGoogleProfile,
  type GoogleProfile,
  restoreGoogleSession,
  signOutFromGoogle,
} from '../lib/googleAuth';
import {
  getColumnLetter,
  getFirstChoiceTrack,
  getApplicationId,
  getPriorityColumnIndexes,
  getReviewerCommentsColumnIndex,
  getSheetSectionIndexes,
  getSheetCellRange,
  getSheetQuestionLabel,
  clearApplicationSheetDataCache,
  loadApplicationSheetData,
  normalizeSheetTrackName,
  REVIEWER_COMMENTS_HEADER,
  type SheetSectionKey,
  type SheetRow,
} from '../lib/googleSheetData';
import {
  clearReviewCaches,
  listApplicationReviews,
  saveApplicationReview,
  type ApplicationReview,
  type ReviewDecision,
} from '../lib/reviewApi';
import type { ApplicationSourceSettings } from '../lib/settingsApi';
import {
  createCollaborationSocket,
  parseCollaborationMessage,
  REVIEWER_COMMENTS_FIELD,
  type CollaborationClientMessage,
  type CollaborationReviewer,
} from '../lib/collaboration';

const REFRESH_INTERVAL = 20000;

interface ReviewerIdentity {
  reviewerId: string;
  reviewerName: string;
}

interface RemoteCommentUpdate {
  reviewerId: string;
  reviewerName: string;
  value: string;
  updatedAt: string;
}

type CollaborationStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';
type SectionKey = SheetSectionKey;
type QueueFilterKey =
  | 'all'
  | 'ai'
  | 'assignedToMe'
  | 'design'
  | 'robotics'
  | 'hack';

interface ReviewSection {
  accent: string;
  count: number;
  hasResponses: boolean;
  id: string;
  indexes: number[];
  isVisible: boolean;
  key: SectionKey;
  priorityLabel?: string;
  title: string;
}

const QUEUE_FILTERS: Array<{
  key: QueueFilterKey;
  label: string;
}> = [
  { key: 'all', label: 'All' },
  { key: 'ai', label: 'AI priority' },
  { key: 'design', label: 'Design priority' },
  { key: 'hack', label: 'Hack priority' },
  { key: 'robotics', label: 'Robotics priority' },
  { key: 'assignedToMe', label: 'Assigned to me' },
];

const SECTION_CONFIGS: Array<{
  accent: string;
  id: string;
  key: SectionKey;
  priorityScoped: boolean;
  title: string;
}> = [
  {
    accent: 'bg-blue-500',
    id: 'section-general',
    key: 'general',
    priorityScoped: false,
    title: 'General',
  },
  {
    accent: 'bg-[#51c0c0]',
    id: 'section-ai',
    key: 'ai',
    priorityScoped: true,
    title: 'AI',
  },
  {
    accent: 'bg-[#816dff]',
    id: 'section-design',
    key: 'design',
    priorityScoped: true,
    title: 'Design',
  },
  {
    accent: 'bg-[#80ce1c]',
    id: 'section-hack',
    key: 'hack',
    priorityScoped: true,
    title: 'Hack',
  },
  {
    accent: 'bg-[#f9a857]',
    id: 'section-robotics',
    key: 'robotics',
    priorityScoped: true,
    title: 'Robotics',
  },
  {
    accent: 'bg-[#ff6f6f]',
    id: 'section-other',
    key: 'other',
    priorityScoped: false,
    title: 'Other',
  },
];
