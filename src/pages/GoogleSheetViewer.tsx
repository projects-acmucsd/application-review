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
  getSheetCellRange,
  getSheetQuestionLabel,
  clearApplicationSheetDataCache,
  loadApplicationSheetData,
  normalizeSheetTrackName,
  parseSheetSectionHeader,
  REVIEWER_COMMENTS_HEADER,
  type SheetSectionKey,
  type SheetRow,
} from '../lib/googleSheetData';
import {
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
  | 'gameDev'
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
  { key: 'gameDev', label: 'Game Dev priority' },
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
    id: 'section-game-dev',
    key: 'gameDev',
    priorityScoped: true,
    title: 'Game Dev',
  },
  {
    accent: 'bg-[#ff6f6f]',
    id: 'section-other',
    key: 'other',
    priorityScoped: false,
    title: 'Other',
  },
];

const LEGACY_SECTION_RANGES: Record<SectionKey, { end: number; start: number }> = {
  ai: { end: 25, start: 17 },
  design: { end: 34, start: 25 },
  gameDev: { end: 53, start: 47 },
  general: { end: 17, start: 0 },
  hack: { end: 47, start: 34 },
  other: { end: 57, start: 53 },
};

function createReviewerIdentity(profile: GoogleProfile): ReviewerIdentity {
  const fallbackName = profile.email || 'Unknown Reviewer';

  return {
    reviewerId: profile.email || profile.name || 'unknown-reviewer',
    reviewerName: profile.name || fallbackName,
  };
}

function normalizeTrackName(value: string): QueueFilterKey | null {
  const normalized = value.toLowerCase().replace(/[\s_-]+/g, '');

  if (normalized === 'ai') return 'ai';
  if (normalized === 'design') return 'design';
  if (normalized === 'hack') return 'hack';
  if (normalized === 'gamedev') return 'gameDev';
  if (normalized === 'assignedtome' || normalized === 'mine') {
    return 'assignedToMe';
  }
  if (normalized === 'all') return 'all';

  return null;
}

function getSectionTitle(sectionKey: SectionKey): string {
  return (
    SECTION_CONFIGS.find((section) => section.key === sectionKey)?.title ??
    'Unspecified'
  );
}

function getFirstChoicePriority(
  headers: string[],
  row: SheetRow,
): QueueFilterKey | null {
  const firstChoice = getFirstChoiceTrack(headers, row.data);

  return firstChoice;
}

function createEmptySectionIndexes(): Record<SectionKey, number[]> {
  return {
    ai: [],
    design: [],
    gameDev: [],
    general: [],
    hack: [],
    other: [],
  };
}

function getLegacySectionIndexes(headersLength: number): Record<SectionKey, number[]> {
  const sectionIndexes = createEmptySectionIndexes();

  SECTION_CONFIGS.forEach((section) => {
    const range = LEGACY_SECTION_RANGES[section.key];
    const end = Math.min(headersLength, range.end);
    for (let index = range.start; index < end; index += 1) {
      sectionIndexes[section.key].push(index);
    }
  });

  return sectionIndexes;
}

function getSectionIndexesFromHeaders(headers: string[]): Record<SectionKey, number[]> {
  const sectionIndexes = createEmptySectionIndexes();
  const parsedHeaders = headers.map(parseSheetSectionHeader);
  const firstPrefixedHeaderIndex = parsedHeaders.findIndex(
    (header) => header.hasSectionPrefix,
  );

  if (firstPrefixedHeaderIndex === -1) {
    return getLegacySectionIndexes(headers.length);
  }

  parsedHeaders.forEach((header, index) => {
    if (header.sectionKey) {
      sectionIndexes[header.sectionKey].push(index);
      return;
    }

    if (index < firstPrefixedHeaderIndex) {
      sectionIndexes.general.push(index);
    }
  });

  return sectionIndexes;
}

function getReviewerCommentValue(headers: string[], rowData: string[]): string {
  const commentColumnIndex = getReviewerCommentsColumnIndex(headers);
  return commentColumnIndex >= 0 ? rowData[commentColumnIndex] || '' : '';
}

function hasSectionResponses(indexes: number[], rowData: string[]): boolean {
  return indexes.some((index) => Boolean(rowData[index]?.trim()));
}

function buildReviewSections({
  currentRow,
  headers,
  priorities,
}: {
  currentRow: string[];
  headers: string[];
  priorities: Partial<Record<SectionKey, number>>;
}): ReviewSection[] {
  const sectionIndexes = getSectionIndexesFromHeaders(headers);

  return SECTION_CONFIGS.map((section) => {
    const indexes = sectionIndexes[section.key];
    const priority = priorities[section.key];

    return {
      accent: section.accent,
      count: indexes.length,
      hasResponses: hasSectionResponses(indexes, currentRow),
      id: section.id,
      indexes,
      isVisible: section.priorityScoped ? priority !== undefined : true,
      key: section.key,
      priorityLabel: priority ? `#${priority} priority` : undefined,
      title: section.title,
    };
  });
}

function isAssignmentHeader(header: string): boolean {
  const normalized = header.toLowerCase();

  if (/comment|note|feedback/.test(normalized)) {
    return false;
  }

  return /assigned|assignee|reviewer|owner/.test(normalized);
}

function isAssignedToReviewer(
  row: SheetRow,
  headers: string[],
  reviewer: ReviewerIdentity | null,
): boolean {
  if (!reviewer) {
    return false;
  }

  const assignmentColumnIndexes = headers
    .map((header, index) => (isAssignmentHeader(header) ? index : -1))
    .filter((index) => index >= 0);

  if (!assignmentColumnIndexes.length) {
    return false;
  }

  const reviewerTokens = [
    reviewer.reviewerId,
    reviewer.reviewerId.split('@')[0],
    reviewer.reviewerName,
  ]
    .map((value) => value.toLowerCase().trim())
    .filter(Boolean);

  return assignmentColumnIndexes.some((index) => {
    const assignedValue = (row.data[index] || '').toLowerCase();
    return reviewerTokens.some((token) => assignedValue.includes(token));
  });
}

function isAssignedToReviewerByRecord(
  row: SheetRow,
  assignments: ApplicationAssignment[],
  reviewer: ReviewerIdentity | null,
): boolean {
  if (!reviewer) {
    return false;
  }

  const reviewerEmail = reviewer.reviewerId.toLowerCase();
  return assignments.some(
    (assignment) =>
      assignment.applicationId === getApplicationId(row) &&
      assignment.assigneeEmail.toLowerCase() === reviewerEmail,
  );
}

function filterRowsByQueueFilter({
  assignmentFallbackEnabled,
  assignments,
  filter,
  headers,
  legacyFirstChoiceFilter,
  reviewer,
  rows,
  useLegacyFirstChoiceFilter,
}: {
  assignmentFallbackEnabled: boolean;
  assignments: ApplicationAssignment[];
  filter: QueueFilterKey;
  headers: string[];
  legacyFirstChoiceFilter: QueueFilterKey | null;
  reviewer: ReviewerIdentity | null;
  rows: SheetRow[];
  useLegacyFirstChoiceFilter: boolean;
}) {
  if (useLegacyFirstChoiceFilter && legacyFirstChoiceFilter) {
    return rows.filter(
      (row) => getFirstChoicePriority(headers, row) === filter,
    );
  }

  if (filter === 'all') {
    return rows;
  }

  if (filter === 'assignedToMe') {
    if (!assignmentFallbackEnabled || assignments.length) {
      return rows.filter((row) =>
        isAssignedToReviewerByRecord(row, assignments, reviewer),
      );
    }

    return rows.filter((row) => isAssignedToReviewer(row, headers, reviewer));
  }

  return rows.filter((row) => getFirstChoicePriority(headers, row) === filter);
}

export default function GoogleSheetViewer() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<SheetRow[]>([]);
  const [applicationSource, setApplicationSource] =
    useState<ApplicationSourceSettings | null>(null);
  const [assignments, setAssignments] = useState<ApplicationAssignment[]>([]);
  const [assignmentFallbackEnabled, setAssignmentFallbackEnabled] =
    useState(false);
  const [filteredRows, setFilteredRows] = useState<SheetRow[]>([]);
  const [currentRow, setCurrentRow] = useState<string[]>([]);
  const [reviewer, setReviewer] = useState<ReviewerIdentity | null>(() => {
    const storedProfile = getStoredGoogleProfile();
    return storedProfile ? createReviewerIdentity(storedProfile) : null;
  });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isEditing, setIsEditing] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isAdmin, setIsAdmin] = useState(() => hasCachedAdminAccess());
  const [showConflictWarning, setShowConflictWarning] = useState(false);
  const [newData, setNewData] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [isAssignmentsLoading, setIsAssignmentsLoading] = useState(true);
  const [reviewsByApplicationId, setReviewsByApplicationId] = useState<
    Record<string, ApplicationReview>
  >({});
  const lastFetchedRow = useRef<SheetRow | null>(null);
  const collaborationSocket = useRef<WebSocket | null>(null);
  const applicationIdRef = useRef<string | null>(null);
  const commentTextRef = useRef('');
  const headersRef = useRef<string[]>([]);
  const isEditingRef = useRef(false);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [draftRating, setDraftRating] = useState<number | null>(null);
  const [draftDecision, setDraftDecision] = useState<ReviewDecision | null>(null);
  const [, setCollaborationStatus] =
    useState<CollaborationStatus>('idle');
  const [, setCollaborationReviewers] = useState<
    CollaborationReviewer[]
  >([]);
  const [, setRemoteDraft] = useState<RemoteCommentUpdate | null>(
    null,
  );
  const [, setLastRemoteSave] =
    useState<RemoteCommentUpdate | null>(null);
  const [selectedSectionKey, setSelectedSectionKey] =
    useState<SectionKey>('general');

  useEffect(() => {
    commentTextRef.current = commentText;
  }, [commentText]);

  useEffect(() => {
    headersRef.current = headers;
  }, [headers]);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    applicationIdRef.current = applicationId;
  }, [applicationId]);

  const fetchSheetData = useCallback(async () => {
    setIsLoading(true);
    try {
      const sheetData = await loadApplicationSheetData();
      setApplicationSource(sheetData.source);
      setHeaders(sheetData.headers);
      setAllRows(sheetData.rows);
    } catch (error) {
      console.error('Error loading sheet data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchAssignments = useCallback(async () => {
    setIsAssignmentsLoading(true);
    try {
      const nextAssignments = await listMyAssignments();
      setAssignments(nextAssignments);
      setAssignmentFallbackEnabled(false);
    } catch (error) {
      console.error('Error loading assignments:', error);
      setAssignments([]);
      setAssignmentFallbackEnabled(true);
    } finally {
      setIsAssignmentsLoading(false);
    }
  }, []);

  const fetchApplicationReviews = useCallback(async () => {
    try {
      const reviews = await listApplicationReviews();
      setReviewsByApplicationId(
        Object.fromEntries(
          reviews.map((review) => [review.applicationId, review]),
        ),
      );
    } catch (error) {
      console.error('Error loading application reviews:', error);
      setReviewsByApplicationId({});
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initializeSession() {
      try {
        const redirectedSession = await completeGoogleSignInFromRedirect();
        const session = redirectedSession ?? (await restoreGoogleSession());

        if (!session) {
          navigate('/');
          return;
        }

        if (!isMounted) {
          return;
        }

        setReviewer(createReviewerIdentity(session.profile));
        void getAdminStatus()
          .then((status) => {
            if (isMounted) {
              setIsAdmin(status.isAdmin);
            }
          })
          .catch(() => {
            if (isMounted) {
              clearCachedAdminAccess();
              setIsAdmin(false);
            }
          });
        await fetchSheetData();
        void Promise.allSettled([
          fetchAssignments(),
          fetchApplicationReviews(),
        ]);
      } catch (error) {
        console.error('Failed to initialize Google session:', error);
        if (isMounted) {
          navigate('/');
        }
      }
    }

    void initializeSession();

    return () => {
      isMounted = false;
    };
  }, [fetchApplicationReviews, fetchAssignments, fetchSheetData, navigate]);

  useEffect(() => {
    const filterParam = searchParams.get('filter');
    const legacyNameFilter = normalizeTrackName(searchParams.get('name') || '');
    const activeFilter = normalizeTrackName(filterParam || '') ?? legacyNameFilter ?? 'all';
    const pageParam = parseInt(searchParams.get('q') || '1', 10) - 1;
    const useLegacyFirstChoiceFilter = Boolean(!filterParam && legacyNameFilter);

    const filtered = filterRowsByQueueFilter({
      assignmentFallbackEnabled,
      assignments,
      filter: activeFilter,
      headers,
      legacyFirstChoiceFilter: legacyNameFilter,
      reviewer,
      rows: allRows,
      useLegacyFirstChoiceFilter,
    });

    setFilteredRows(filtered);

    const row = filtered[pageParam];
    if (row) {
      setApplicationId(getApplicationId(row));
      if (!lastFetchedRow.current || lastFetchedRow.current.index !== row.index) {
        lastFetchedRow.current = row;
        setCurrentRow(row.data);
        setCommentText(getReviewerCommentValue(headers, row.data));
        setRemoteDraft(null);
        setLastRemoteSave(null);
      }
    } else {
      setApplicationId(null);
      setCurrentRow([]);
      setCommentText('');
      lastFetchedRow.current = null;
    }
  }, [
    allRows,
    assignmentFallbackEnabled,
    assignments,
    headers,
    reviewer,
    searchParams,
  ]);

  useEffect(() => {
    if (!applicationId) {
      setDraftRating(null);
      setDraftDecision(null);
      return;
    }

    const review = reviewsByApplicationId[applicationId];
    setDraftRating(review?.rating ?? null);
    setDraftDecision(review?.decision ?? null);
  }, [applicationId, reviewsByApplicationId]);

  useEffect(() => {
    if (!applicationSource) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const sheetData = await loadApplicationSheetData(applicationSource, {
          bypassCache: true,
        });
        const rows = sheetData.rows;
        if (!rows.length) return;

        setHeaders((previousHeaders) =>
          JSON.stringify(previousHeaders) !== JSON.stringify(sheetData.headers)
            ? sheetData.headers
            : previousHeaders,
        );

        setAllRows((prev) => {
          const changed = rows.some(
            (row: SheetRow, index: number) =>
              JSON.stringify(row.data) !== JSON.stringify(prev[index]?.data),
          );
          return changed ? rows : prev;
        });

        if (lastFetchedRow.current) {
          const updatedRow = rows.find(
            (row: SheetRow) => row.index === lastFetchedRow.current?.index,
          );
          if (
            updatedRow &&
            JSON.stringify(updatedRow.data) !==
              JSON.stringify(lastFetchedRow.current.data)
          ) {
            if (isEditing) {
              setNewData(updatedRow.data);
              setShowConflictWarning(true);
            } else {
              lastFetchedRow.current = updatedRow;
              setCurrentRow(updatedRow.data);
              setCommentText(
                getReviewerCommentValue(sheetData.headers, updatedRow.data),
              );
            }
          }
        }
      } catch (err) {
        console.error('Auto-refresh error:', err);
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [applicationSource, isEditing]);

  const updateCachedRow = useCallback((rowIndex: number, nextData: string[]) => {
    setAllRows((previousRows) =>
      previousRows.map((row) =>
        row.index === rowIndex ? { ...row, data: nextData } : row,
      ),
    );
  }, []);

  const updateDataSmoothly = (newRow: string[], nextHeaders = headers) => {
    const rowIndex = lastFetchedRow.current?.index || 0;
    lastFetchedRow.current = {
      data: newRow,
      index: rowIndex,
    };
    setCurrentRow(newRow);
    setCommentText(getReviewerCommentValue(nextHeaders, newRow));
    if (rowIndex) {
      updateCachedRow(rowIndex, newRow);
    }
  };

  const sendCollaborationMessage = useCallback(
    (message: CollaborationClientMessage) => {
      if (collaborationSocket.current?.readyState === WebSocket.OPEN) {
        collaborationSocket.current.send(JSON.stringify(message));
      }
    },
    [],
  );

  const applyRemoteSavedComment = useCallback((update: RemoteCommentUpdate) => {
    const existingCommentColumnIndex = getReviewerCommentsColumnIndex(
      headersRef.current,
    );
    const commentColumnIndex =
      existingCommentColumnIndex >= 0
        ? existingCommentColumnIndex
        : headersRef.current.length;

    if (existingCommentColumnIndex < 0) {
      const nextHeaders = [...headersRef.current, REVIEWER_COMMENTS_HEADER];
      headersRef.current = nextHeaders;
      setHeaders(nextHeaders);
    }

    setCurrentRow((previousRow) => {
      const nextRow = [...previousRow];
      nextRow[commentColumnIndex] = update.value;

      if (lastFetchedRow.current) {
        lastFetchedRow.current = {
          data: nextRow,
          index: lastFetchedRow.current.index,
        };
        updateCachedRow(lastFetchedRow.current.index, nextRow);
      }

      return nextRow;
    });

    setCommentText(update.value);
    setRemoteDraft(null);
    setLastRemoteSave(update);
  }, [updateCachedRow]);

  const broadcastCommentDraft = useCallback(
    (value: string) => {
      if (!applicationId || !reviewer) {
        return;
      }

      sendCollaborationMessage({
        type: 'comment_draft_update',
        applicationId,
        field: REVIEWER_COMMENTS_FIELD,
        reviewerId: reviewer.reviewerId,
        reviewerName: reviewer.reviewerName,
        value,
        updatedAt: new Date().toISOString(),
      });
    },
    [applicationId, reviewer, sendCollaborationMessage],
  );

  const broadcastCommentSaved = useCallback(
    (value: string) => {
      if (!applicationId || !reviewer) {
        return;
      }

      sendCollaborationMessage({
        type: 'comment_saved',
        applicationId,
        field: REVIEWER_COMMENTS_FIELD,
        reviewerId: reviewer.reviewerId,
        reviewerName: reviewer.reviewerName,
        value,
        updatedAt: new Date().toISOString(),
      });
    },
    [applicationId, reviewer, sendCollaborationMessage],
  );

  useEffect(() => {
    if (!applicationId || !reviewer) {
      setCollaborationStatus('idle');
      setCollaborationReviewers([]);
      return;
    }

    const socket = createCollaborationSocket();
    let isActiveSocket = true;
    collaborationSocket.current = socket;
    setCollaborationStatus('connecting');
    setCollaborationReviewers([]);

    socket.addEventListener('open', () => {
      if (!isActiveSocket) {
        return;
      }

      setCollaborationStatus('connected');
      socket.send(
        JSON.stringify({
          type: 'join_application',
          applicationId,
          field: REVIEWER_COMMENTS_FIELD,
          reviewerId: reviewer.reviewerId,
          reviewerName: reviewer.reviewerName,
          value: commentTextRef.current,
          updatedAt: new Date().toISOString(),
        } satisfies CollaborationClientMessage),
      );
    });

    socket.addEventListener('close', () => {
      if (!isActiveSocket) {
        return;
      }

      setCollaborationStatus('disconnected');
      setCollaborationReviewers([]);
    });

    socket.addEventListener('error', () => {
      if (!isActiveSocket) {
        return;
      }

      setCollaborationStatus('disconnected');
    });

    socket.addEventListener('message', (event: MessageEvent) => {
      if (!isActiveSocket) {
        return;
      }

      if (typeof event.data !== 'string') {
        return;
      }

      const message = parseCollaborationMessage(event.data);
      if (!message || message.type === 'error') {
        return;
      }

      if (message.applicationId !== applicationIdRef.current) {
        return;
      }

      if (message.type === 'presence_update') {
        setCollaborationReviewers(message.reviewers);
        return;
      }

      const update = {
        reviewerId: message.reviewerId,
        reviewerName: message.reviewerName,
        value: message.value,
        updatedAt: message.updatedAt,
      };

      if (message.type === 'comment_draft_update') {
        setRemoteDraft(update);
        setLastRemoteSave(null);
        if (isEditingRef.current) {
          setCommentText(message.value);
        }
        return;
      }

      applyRemoteSavedComment(update);
    });

    return () => {
      isActiveSocket = false;

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: 'leave_application',
            applicationId,
            reviewerId: reviewer.reviewerId,
            reviewerName: reviewer.reviewerName,
            updatedAt: new Date().toISOString(),
          } satisfies CollaborationClientMessage),
        );
      }

      socket.close();
      if (collaborationSocket.current === socket) {
        collaborationSocket.current = null;
      }
    };
  }, [applicationId, applyRemoteSavedComment, reviewer]);

  const saveComment = async () => {
    if (isSavingReview) return;
    if (!lastFetchedRow.current || !applicationId || !applicationSource) return;
    const rowIndex = lastFetchedRow.current.index + 1;
    const existingCommentColumnIndex = getReviewerCommentsColumnIndex(headers);
    const shouldCreateCommentColumn = existingCommentColumnIndex < 0;
    const commentColumnIndex = shouldCreateCommentColumn
      ? headers.length
      : existingCommentColumnIndex;
    const colIndex = commentColumnIndex + 1;

    try {
      setIsSavingReview(true);
      const colLetter = getColumnLetter(colIndex);
      const gapi = await getGoogleApiClient();
      const cellRange = getSheetCellRange(
        applicationSource,
        `${colLetter}${rowIndex}`,
      );
      const currentVal = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: applicationSource.spreadsheetId,
        range: cellRange,
      });
      const existingValue = currentVal.result.values?.[0]?.[0] || '';
      const currentAnswer = currentRow[commentColumnIndex] || '';

      if (existingValue !== currentAnswer) {
        const conflictedData = [...currentRow];
        conflictedData[commentColumnIndex] = existingValue;
        setNewData(conflictedData);
        setShowConflictWarning(true);
        return;
      }

      if (shouldCreateCommentColumn) {
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: applicationSource.spreadsheetId,
          range: getSheetCellRange(applicationSource, `${colLetter}1`),
          valueInputOption: 'RAW',
          resource: { values: [[REVIEWER_COMMENTS_HEADER]] },
        });
        setHeaders((currentHeaders) =>
          getReviewerCommentsColumnIndex(currentHeaders) >= 0
            ? currentHeaders
            : [...currentHeaders, REVIEWER_COMMENTS_HEADER],
        );
      }

      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: applicationSource.spreadsheetId,
        range: cellRange,
        valueInputOption: 'RAW',
        resource: { values: [[commentText]] },
      });
      clearApplicationSheetDataCache();

      const updated = [...currentRow];
      updated[commentColumnIndex] = commentText;
      const nextHeaders = shouldCreateCommentColumn
        ? [...headers, REVIEWER_COMMENTS_HEADER]
        : headers;
      updateDataSmoothly(updated, nextHeaders);

      const savedReview = await saveApplicationReview({
        applicationId,
        rating: draftRating,
        decision: draftDecision,
      });
      setReviewsByApplicationId((currentReviews) => ({
        ...currentReviews,
        [savedReview.applicationId]: savedReview,
      }));

      broadcastCommentSaved(commentText);
      setIsEditing(false);
    } catch (error) {
      console.error('Save comment error:', error);
      alert('Failed to save comment. Please try again.');
    } finally {
      setIsSavingReview(false);
    }
  };

  const getSectionPriorities = useCallback(() => {
    const priorities: Partial<Record<SectionKey, number>> = {};

    getPriorityColumnIndexes(headers).forEach(({ index, priority }) => {
      const section = normalizeSheetTrackName(currentRow[index] || '');
      if (section) {
        priorities[section] = priority;
      }
    });

    return priorities;
  }, [currentRow, headers]);

  const linkifyText = (text: string) => {
    if (!text) return text;
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    return text.split(urlPattern).map((part, index) =>
      part.match(urlPattern) ? (
        <a
          key={`${part}-${index}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-blue-600 underline decoration-blue-200 underline-offset-4 hover:text-blue-700"
        >
          {part}
        </a>
      ) : (
        part
      ),
    );
  };

  const signOut = async () => {
    await signOutFromGoogle();
    clearCachedAdminAccess();
    setIsAdmin(false);
    navigate('/');
  };

  const filterParam = searchParams.get('filter');
  const nameFilter = searchParams.get('name');
  const legacyNameFilter = normalizeTrackName(nameFilter || '');
  const activeQueueFilter =
    normalizeTrackName(filterParam || '') ?? legacyNameFilter ?? 'all';
  const currentPage = Math.max(parseInt(searchParams.get('q') || '1', 10), 1);
  const applicantName = currentRow[2] || 'Loading applicant';
  const firstChoiceTrack = getFirstChoiceTrack(headers, currentRow);
  const firstChoice = firstChoiceTrack
    ? getSectionTitle(firstChoiceTrack)
    : 'Unspecified';
  const priorities = getSectionPriorities();
  const commentValue = getReviewerCommentValue(headers, currentRow);
  const hasPrevious = currentPage > 1;
  const hasNext = filteredRows.length > currentPage;
  const progressPercent = filteredRows.length
    ? Math.min((currentPage / filteredRows.length) * 100, 100)
    : 0;

  const createReviewHref = (page: number) => {
    const params = new URLSearchParams();
    params.set('q', String(page));
    if (filterParam) {
      params.set('filter', filterParam);
    } else if (nameFilter) {
      params.set('name', nameFilter);
    }
    return `/review?${params.toString()}`;
  };

  const createQueueFilterHref = (filter: QueueFilterKey) => {
    const params = new URLSearchParams();
    params.set('q', '1');

    if (filter !== 'all') {
      params.set('filter', filter);
    }

    const queryString = params.toString();
    return `/review${queryString ? `?${queryString}` : ''}`;
  };

  const getQueueFilterCount = (filter: QueueFilterKey) =>
    filterRowsByQueueFilter({
      assignmentFallbackEnabled,
      assignments,
      filter,
      headers,
      legacyFirstChoiceFilter: null,
      reviewer,
      rows: allRows,
      useLegacyFirstChoiceFilter: false,
    }).length;

  const sections = buildReviewSections({
    currentRow,
    headers,
    priorities,
  });

  const visibleAnswerSections = sections.filter((section) => section.isVisible);
  const selectedAnswerSection =
    visibleAnswerSections.find((section) => section.key === selectedSectionKey) ??
    visibleAnswerSections[0];
  const isAssignmentScopedLoading =
    activeQueueFilter === 'assignedToMe' && isAssignmentsLoading;
  const isReviewLoading =
    (isLoading || isAssignmentScopedLoading) &&
    (!headers.length || !currentRow.length);
  const hasEmptyFilteredQueue =
    !isReviewLoading && !filteredRows.length;
  const emptyQueueTitle =
    activeQueueFilter === 'assignedToMe'
      ? 'N/A'
      : 'No matching applications';
  const emptyQueueDescription =
    activeQueueFilter === 'assignedToMe'
      ? 'There are no applications assigned to you right now.'
      : 'No applications match the current filter.';

  useEffect(() => {
    if (!visibleAnswerSections.some((section) => section.key === selectedSectionKey)) {
      setSelectedSectionKey('general');
    }
  }, [selectedSectionKey, visibleAnswerSections]);

  return (
    <>
      {showConflictWarning && newData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="portal-surface w-full max-w-lg rounded-[1.5rem] p-6">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-500">
              Data refresh
            </p>
            <h3 className="mt-2 text-2xl font-bold text-[#333]">
              New data available
            </h3>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              New data was detected while you were editing. Copy your current
              comment before refreshing if you need to preserve it.
            </p>
            <div className="mt-4 rounded-2xl bg-neutral-100 p-4 text-sm text-neutral-700">
              <pre className="whitespace-pre-wrap">{commentText}</pre>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => {
                  updateDataSmoothly(newData);
                  setShowConflictWarning(false);
                  setIsEditing(false);
                }}
                className="bg-blue-400 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
              >
                Refresh Data
              </button>
            </div>
          </div>
        </div>
      )}

      <InternalShell
        activePath="review"
        onSignOut={() => void signOut()}
        reviewerName={reviewer ? `Signed in as ${reviewer.reviewerName}` : undefined}
        showAdmin={isAdmin}
      >
        <main className="mx-auto min-h-[calc(100vh-5.275rem)] max-w-[1500px] px-5 py-8 sm:px-8">
          {!isReviewLoading ? (
            <section className="portal-surface-quiet px-6 py-4 sm:px-8">
              <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
                <p className="text-lg font-medium uppercase tracking-[0.24em] text-blue-500">
                  Filters
                </p>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {QUEUE_FILTERS.map((filter) => {
                    const isActive = activeQueueFilter === filter.key;
                    const count = getQueueFilterCount(filter.key);

                    return (
                      <Link
                        key={filter.key}
                        to={createQueueFilterHref(filter.key)}
                        className={`portal-square-control border px-3 py-2 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                          isActive
                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                            : 'border-neutral-200 bg-transparent text-neutral-500 hover:bg-blue-50 hover:text-blue-600'
                        }`}
                      >
                        {filter.label}
                        <span className="ml-2 text-neutral-400">
                          {count}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}

          <div className={isReviewLoading ? '' : 'mt-7'}>
            {isReviewLoading ? (
              <ReviewSummarySkeleton />
            ) : hasEmptyFilteredQueue ? (
              <section className="portal-surface-quiet p-8 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-500">
                  Application review
                </p>
                <h1 className="mt-3 text-5xl font-medium text-[#2f3138]">
                  {emptyQueueTitle}
                </h1>
                <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-6 text-neutral-500">
                  {emptyQueueDescription}
                </p>
              </section>
            ) : (
              <section className="portal-surface p-6 sm:p-8">
                <div className="grid gap-8 xl:grid-cols-[minmax(0,0.85fr)_minmax(520px,0.75fr)] xl:items-stretch">
                  <div className="flex min-h-[15rem] h-full flex-col justify-between">
                    <div className="flex flex-col items-start text-left">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-500">
                          Application review
                        </p>
                        <h1 className="mt-3 max-w-4xl text-4xl font-medium leading-tight text-[#2f3138] sm:text-5xl">
                          {applicantName}
                        </h1>
                      </div>
                    </div>
                    <div className="mt-8 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-400">
                          First choice
                        </p>
                        <p className="mt-1 text-2xl font-bold text-blue-500">
                          {firstChoice}
                        </p>
                      </div>
                      <span className="inline-flex w-fit items-center bg-[#333] px-4 py-2 text-sm font-bold text-white">
                        {filteredRows.length
                          ? `Application ${currentPage} of ${filteredRows.length}`
                          : 'Loading queue'}
                      </span>
                    </div>
                  </div>

                  <div className="portal-row-band min-w-0 px-6 py-5 sm:px-8">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      <div>
                        <p className="text-3xl font-bold text-[#333]">
                          {filteredRows.length ? currentPage : '-'}
                        </p>
                        <p className="text-xs font-semibold text-neutral-500">
                          of {filteredRows.length || '-'} applications
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full rounded-full bg-blue-400 transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    <p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-neutral-400">
                      Sections
                    </p>
                    <div className="mt-3 grid w-full gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                      {sections.map((section) => {
                        const isSelected =
                          selectedAnswerSection?.key === section.key;
                        const isEmptyVisibleSection =
                          section.isVisible &&
                          !section.hasResponses &&
                          section.key !== 'general' &&
                          section.key !== 'other';
                        const statusLabel = !section.isVisible
                          ? 'Not selected'
                          : isEmptyVisibleSection
                            ? 'No responses'
                            : section.priorityLabel || `${section.count} prompts`;
                        const stateClass = !section.isVisible
                          ? 'bg-neutral-50 text-neutral-300 opacity-55'
                          : isSelected
                            ? isEmptyVisibleSection
                              ? 'bg-neutral-50 text-neutral-500'
                              : 'bg-blue-50 text-blue-700'
                            : isEmptyVisibleSection
                              ? 'bg-neutral-50/80 text-neutral-400 opacity-75 hover:bg-neutral-50'
                              : 'bg-white/70 text-[#333] hover:bg-blue-50';

                        return (
                          <button
                            key={section.key}
                            type="button"
                            onClick={() => setSelectedSectionKey(section.key)}
                            disabled={!section.isVisible}
                            title={
                              isEmptyVisibleSection
                                ? `${section.title} was ranked, but no section answers were provided.`
                                : undefined
                            }
                            className={`portal-square-control flex min-h-[3.35rem] w-full items-center gap-3 px-4 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed ${stateClass}`}
                          >
                            <span
                              className={`h-3 w-3 rounded-full ${section.accent} ${
                                !section.isVisible || isEmptyVisibleSection
                                  ? 'opacity-35'
                                  : ''
                              }`}
                            />
                            <span>
                              <span className="block text-sm font-bold">
                                {section.title}
                              </span>
                              <span className="text-xs font-semibold text-neutral-400">
                                {statusLabel}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>

          {!hasEmptyFilteredQueue ? (
          <div className="mt-7">
            <section className="min-w-0 space-y-7">
              {isReviewLoading ? (
                <ReviewAnswersSkeleton />
              ) : selectedAnswerSection ? (
                <article
                  id={selectedAnswerSection.id}
                  className="portal-surface-quiet scroll-mt-28 overflow-hidden px-6 py-7 sm:px-8"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
                    <div className="flex items-center gap-3">
                      <span className={`h-4 w-4 rounded-full ${selectedAnswerSection.accent}`} />
                      <div>
                        <h2 className="text-3xl font-medium text-[#2f3138]">
                          {selectedAnswerSection.title}
                        </h2>
                        <p className="text-sm font-semibold text-neutral-400">
                          {selectedAnswerSection.priorityLabel ||
                            `${selectedAnswerSection.count} prompts`}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-neutral-100 border-t border-neutral-200/70">
                    {selectedAnswerSection.indexes
                      .map((rowIndex) => {
                        const question = getSheetQuestionLabel(headers[rowIndex] || '');
                        const answer = currentRow[rowIndex];
                        return (
                          <div
                            key={`${selectedAnswerSection.key}-${rowIndex}`}
                            className="grid gap-4 py-5 transition-colors hover:bg-[#f8fbff] md:grid-cols-[minmax(180px,0.42fr)_minmax(0,0.58fr)]"
                          >
                            <h3 className="text-sm font-bold leading-6 text-[#333]">
                              {question}
                            </h3>
                            <div className="whitespace-pre-wrap text-sm leading-7 text-neutral-700">
                              {answer ? (
                                linkifyText(answer)
                              ) : (
                                <span className="italic text-neutral-400">
                                  No answer provided
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </article>
              ) : null}

              <div id="review-panel" className="scroll-mt-28">
                {isReviewLoading ? (
                  <ReviewPanelSkeleton />
                ) : (
                  <ReviewPanel
                    commentText={commentText}
                    currentPage={currentPage}
                    filteredCount={filteredRows.length}
                    hasNext={hasNext}
                    hasPrevious={hasPrevious}
                    isEditing={isEditing}
                    isSaving={isSavingReview}
                    nextHref={hasNext ? createReviewHref(currentPage + 1) : undefined}
                    previousHref={
                      hasPrevious ? createReviewHref(currentPage - 1) : undefined
                    }
                    saveComment={saveComment}
                    selectedDecision={draftDecision}
                    selectedRating={draftRating}
                    setCommentText={setCommentText}
                    setIsEditing={setIsEditing}
                    setLastRemoteSave={setLastRemoteSave}
                    setRemoteDraft={setRemoteDraft}
                    onDecisionChange={(decision) => {
                      setIsEditing(true);
                      setDraftDecision((currentDecision) =>
                        currentDecision === decision ? null : decision,
                      );
                    }}
                    onRatingChange={(rating) => {
                      setIsEditing(true);
                      setDraftRating(rating);
                    }}
                    onDraftChange={broadcastCommentDraft}
                    onReset={() => {
                      setIsEditing(false);
                      setCommentText(commentValue);
                      const savedReview = applicationId
                        ? reviewsByApplicationId[applicationId]
                        : undefined;
                      setDraftRating(savedReview?.rating ?? null);
                      setDraftDecision(savedReview?.decision ?? null);
                    }}
                  />
                )}
              </div>
            </section>
          </div>
          ) : null}
        </main>
      </InternalShell>
    </>
  );
}

interface ReviewPanelProps {
  commentText: string;
  currentPage: number;
  filteredCount: number;
  hasNext: boolean;
  hasPrevious: boolean;
  isEditing: boolean;
  isSaving: boolean;
  nextHref?: string;
  selectedDecision: ReviewDecision | null;
  selectedRating: number | null;
  previousHref?: string;
  saveComment: () => Promise<void>;
  setCommentText: (value: string) => void;
  setIsEditing: (value: boolean) => void;
  setLastRemoteSave: (value: RemoteCommentUpdate | null) => void;
  setRemoteDraft: (value: RemoteCommentUpdate | null) => void;
  onDecisionChange: (decision: ReviewDecision) => void;
  onDraftChange: (value: string) => void;
  onRatingChange: (rating: number) => void;
  onReset: () => void;
}

function ReviewPanel({
  commentText,
  currentPage,
  filteredCount,
  hasNext,
  hasPrevious,
  isEditing,
  isSaving,
  nextHref,
  previousHref,
  saveComment,
  selectedDecision,
  selectedRating,
  setCommentText,
  setIsEditing,
  setLastRemoteSave,
  setRemoteDraft,
  onDecisionChange,
  onDraftChange,
  onRatingChange,
  onReset,
}: ReviewPanelProps) {
  const decisionOptions: Array<{
    decision: ReviewDecision;
    label: string;
    selectedClassName: string;
    unselectedClassName: string;
  }> = [
    {
      decision: 'reject',
      label: 'Reject',
      selectedClassName: 'border-red-500 bg-red-500 text-white shadow-red-100',
      unselectedClassName: 'border-red-100 bg-white text-red-600 hover:bg-red-50',
    },
    {
      decision: 'waitlist',
      label: 'Waitlist',
      selectedClassName:
        'border-amber-500 bg-amber-400 text-white shadow-amber-100',
      unselectedClassName:
        'border-amber-100 bg-white text-amber-600 hover:bg-amber-50',
    },
    {
      decision: 'accept',
      label: 'Accept',
      selectedClassName:
        'border-emerald-500 bg-emerald-500 text-white shadow-emerald-100',
      unselectedClassName:
        'border-emerald-100 bg-white text-emerald-600 hover:bg-emerald-50',
    },
  ];

  return (
    <div className="comments-section portal-surface-quiet px-6 py-7 sm:px-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-stretch">
        <section className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-500">
                Review
              </p>
              <h2 className="mt-1 text-2xl font-bold text-[#333]">
                Rating
              </h2>
            </div>
            {isEditing ? (
              <div className="flex gap-2">
                <button
                  disabled={isSaving}
                  onClick={onReset}
                  className="bg-neutral-100 px-4 py-2 text-sm font-bold text-neutral-600 transition-colors hover:bg-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  aria-busy={isSaving}
                  disabled={isSaving}
                  onClick={() => void saveComment()}
                  className="min-w-20 bg-[#333] px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-[#333] focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            ) : null}
          </div>

          {isSaving ? (
            <div
              aria-live="polite"
              className="mt-4 border border-blue-100 bg-blue-50 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-4 text-sm font-bold text-blue-600">
                <span>Saving review</span>
                <span className="text-xs uppercase tracking-[0.18em] text-blue-400">
                  Please wait
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden bg-white">
                <div className="portal-auth-progress h-full w-1/3 bg-blue-400" />
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div
              aria-label="Decision score scale"
              className="flex flex-wrap gap-2"
            >
              {Array.from({ length: 10 }, (_, index) => index + 1).map(
                (score) => (
                  <button
                    key={score}
                    type="button"
                    aria-pressed={selectedRating === score}
                    disabled={isSaving}
                    onClick={() => onRatingChange(score)}
                    className={`portal-square-control flex h-8 w-8 items-center justify-center text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
                      selectedRating === score
                        ? 'scale-110 bg-blue-500 text-white shadow-md shadow-blue-200'
                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                    }`}
                  >
                    {score}
                  </button>
                ),
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {decisionOptions.map((option) => {
                const isSelected = selectedDecision === option.decision;

                return (
                  <button
                    key={option.decision}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={isSaving}
                    onClick={() => onDecisionChange(option.decision)}
                    className={`portal-square-control h-9 border px-3 text-sm font-bold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
                      isSelected
                        ? option.selectedClassName
                        : option.unselectedClassName
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <textarea
            value={commentText}
            disabled={isSaving}
            onFocus={() => setIsEditing(true)}
            onChange={(event) => {
              setIsEditing(true);
              setCommentText(event.target.value);
              setRemoteDraft(null);
              setLastRemoteSave(null);
              onDraftChange(event.target.value);
            }}
            className="portal-muted-field mt-5 h-56 w-full resize-none border p-4 text-sm leading-7 text-neutral-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-wait disabled:opacity-70"
            placeholder="Enter review comments, notes, and decision context here..."
          />
        </section>

        <div className="flex min-h-56 flex-col gap-3 border-t border-neutral-200/70 pt-6 lg:h-full lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div className="text-center">
            <p className="text-xl font-bold text-[#333]">
              {filteredCount ? `${currentPage} of ${filteredCount}` : 'Loading queue'}
            </p>
          </div>
          <div className="grid flex-1 gap-3">
            {hasNext && nextHref && !isSaving ? (
              <Link
                to={nextHref}
                className="flex min-h-20 w-full items-center justify-center bg-blue-400 px-4 text-lg font-bold text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
              >
                Next
              </Link>
            ) : (
              <span className="flex min-h-20 w-full items-center justify-center bg-neutral-100 px-4 text-lg font-bold text-neutral-300">
                Next
              </span>
            )}
            {hasPrevious && previousHref && !isSaving ? (
              <Link
                to={previousHref}
                className="flex min-h-20 w-full items-center justify-center border border-blue-100 bg-white px-4 text-lg font-bold text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                Prev
              </Link>
            ) : (
              <span className="flex min-h-20 w-full items-center justify-center border border-neutral-100 bg-neutral-50 px-4 text-lg font-bold text-neutral-300">
                Prev
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
