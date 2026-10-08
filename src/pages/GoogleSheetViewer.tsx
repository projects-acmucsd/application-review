import { useEffect, useState, useRef, useCallback, useReducer, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ApplicationFiltersPopover } from '../components/ApplicationFiltersPopover';
import {
  filterRowsByApplicationFilters,
  getBinaryQuestions,
  readApplicationFilters,
  readQueueScope,
  writeApplicationFilters,
} from '../lib/applicationFilters';
import { InternalShell } from '../components/InternalShell';
import { ReviewToolbar } from '../components/ReviewToolbar';
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
  getStoredGoogleProfile,
  type GoogleProfile,
  restoreGoogleSession,
  signOutFromGoogle,
} from '../lib/googleAuth';
import {
  getFirstChoiceTrack,
  getApplicationId,
  getPriorityColumnIndexes,
  getReviewerCommentsColumnIndex,
  getSheetSectionIndexes,
  getSheetQuestionLabel,
  loadApplicationSheetData,
  normalizeSheetTrackName,
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
import { getReviewSelectionIndex } from '../lib/reviewNavigation';
import {
  EMPTY_REVIEW_EDITOR,
  reviewEditorReducer,
} from '../lib/reviewEditor';
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
type QueueFilterKey = 'all' | 'assignedToMe';

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
  { key: 'assignedToMe', label: 'Assigned' },
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

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error && error.message ? error.message : fallbackMessage;
}

function createReviewerIdentity(profile: GoogleProfile): ReviewerIdentity {
  const fallbackName = profile.email || 'Unknown Reviewer';

  return {
    reviewerId: profile.email || profile.name || 'unknown-reviewer',
    reviewerName: profile.name || fallbackName,
  };
}

function getSectionTitle(sectionKey: SectionKey): string {
  return (
    SECTION_CONFIGS.find((section) => section.key === sectionKey)?.title ??
    'Unspecified'
  );
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
  const sectionIndexes = getSheetSectionIndexes(headers);

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
  reviewer,
  rows,
}: {
  assignmentFallbackEnabled: boolean;
  assignments: ApplicationAssignment[];
  filter: QueueFilterKey;
  headers: string[];
  reviewer: ReviewerIdentity | null;
  rows: SheetRow[];
}) {
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

  return rows;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const binaryQuestions = useMemo(
    () => getBinaryQuestions(headers, allRows),
    [headers, allRows],
  );
  const appliedFilters = readApplicationFilters(searchParams);
  const [editor, dispatchEditor] = useReducer(
    reviewEditorReducer,
    EMPTY_REVIEW_EDITOR,
  );
  const {
    isEditing,
    comment: commentText,
    rating: draftRating,
    decision: draftDecision,
  } = editor;
  const [isAdmin, setIsAdmin] = useState(() => hasCachedAdminAccess());
  const [showConflictWarning, setShowConflictWarning] = useState(false);
  const [newData, setNewData] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewLoadError, setReviewLoadError] = useState('');
  const [assignmentWarning, setAssignmentWarning] = useState('');
  const [reviewsWarning, setReviewsWarning] = useState('');
  const [reviewsReady, setReviewsReady] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [isAssignmentsLoading, setIsAssignmentsLoading] = useState(true);
  const [reviewsByApplicationId, setReviewsByApplicationId] = useState<
    Record<string, ApplicationReview>
  >({});
  const lastFetchedRow = useRef<SheetRow | null>(null);
  const collaborationSocket = useRef<WebSocket | null>(null);
  const applicationIdRef = useRef<string | null>(null);
  const commentTextRef = useRef('');
  const isSavingReviewRef = useRef(false);
  const reviewRequestSequence = useRef(0);
  const [applicationId, setApplicationId] = useState<string | null>(null);
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
    applicationIdRef.current = applicationId;
  }, [applicationId]);

  const fetchSheetData = useCallback(async () => {
    setIsLoading(true);
    setReviewLoadError('');
    try {
      const sheetData = await loadApplicationSheetData();
      setApplicationSource(sheetData.source);
      setHeaders(sheetData.headers);
      setAllRows(sheetData.rows);
    } catch (error) {
      console.error('Error loading sheet data:', error);
      setHeaders([]);
      setAllRows([]);
      setApplicationSource(null);
      setReviewLoadError(
        `Failed to load application data. ${getErrorMessage(
          error,
          'Check Google Sheets access and try again.',
        )}`,
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchAssignments = useCallback(async () => {
    setIsAssignmentsLoading(true);
    setAssignmentWarning('');
    try {
      const nextAssignments = await listMyAssignments();
      setAssignments(nextAssignments);
      setAssignmentFallbackEnabled(false);
    } catch (error) {
      console.error('Error loading assignments:', error);
      setAssignments([]);
      setAssignmentFallbackEnabled(true);
      setAssignmentWarning(
        `Assignment data could not be loaded. ${getErrorMessage(
          error,
          'Assigned-to-me counts may be incomplete.',
        )}`,
      );
    } finally {
      setIsAssignmentsLoading(false);
    }
  }, []);

  const fetchApplicationReviews = useCallback(async () => {
    if (isSavingReviewRef.current) return;
    const requestSequence = ++reviewRequestSequence.current;
    try {
      const reviews = await listApplicationReviews({ fresh: true });
      if (requestSequence !== reviewRequestSequence.current || isSavingReviewRef.current) {
        return;
      }
      setReviewsByApplicationId(
        Object.fromEntries(
          reviews.map((review) => [review.applicationId, review]),
        ),
      );
      setReviewsReady(true);
      setReviewsWarning('');
    } catch (error) {
      if (requestSequence !== reviewRequestSequence.current || isSavingReviewRef.current) {
        return;
      }
      console.error('Error loading application reviews:', error);
      setReviewsReady(false);
      setReviewsWarning(
        `Saved reviews could not be loaded. ${getErrorMessage(
          error,
          'Saving is disabled until the latest reviews can be loaded.',
        )}`,
      );
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
    const activeFilter = readQueueScope(searchParams);

    const scopedRows = filterRowsByQueueFilter({
      assignmentFallbackEnabled,
      assignments,
      filter: activeFilter,
      headers,
      reviewer,
      rows: allRows,
    });

    const filtered = filterRowsByApplicationFilters(scopedRows, headers, readApplicationFilters(searchParams));
    setFilteredRows(filtered);

    const selectionIndex = getReviewSelectionIndex({
      rows: filtered,
      applicationId: searchParams.get('application'),
      page: searchParams.get('q'),
    });
    const row = filtered[selectionIndex];
    if (row) {
      setApplicationId(getApplicationId(row));
      if (!lastFetchedRow.current || lastFetchedRow.current.index !== row.index) {
        lastFetchedRow.current = row;
        setCurrentRow(row.data);
        setSaveError('');
        setNewData(null);
        setShowConflictWarning(false);
        setRemoteDraft(null);
        setLastRemoteSave(null);
      }
    } else {
      setApplicationId(null);
      setCurrentRow([]);
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
    dispatchEditor({
      type: 'receive',
      applicationId,
      review: applicationId ? reviewsByApplicationId[applicationId] : undefined,
      legacyComment: getReviewerCommentValue(headers, currentRow),
    });
  }, [applicationId, currentRow, headers, reviewsByApplicationId]);

  useEffect(() => {
    if (!reviewer) return;
    const interval = setInterval(() => void fetchApplicationReviews(), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchApplicationReviews, reviewer]);

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
            }
          }
        }
      } catch (err) {
        console.error('Auto-refresh error:', err);
        setAssignmentWarning(
          `Application auto-refresh failed. ${getErrorMessage(
            err,
            'Refresh the page before making review decisions.',
          )}`,
        );
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

  const updateDataSmoothly = (newRow: string[]) => {
    const rowIndex = lastFetchedRow.current?.index || 0;
    lastFetchedRow.current = {
      data: newRow,
      index: rowIndex,
    };
    setCurrentRow(newRow);
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
    // Collaboration messages are notifications, not database versions.
    setRemoteDraft(null);
    setLastRemoteSave(update);
    void fetchApplicationReviews();
  }, [fetchApplicationReviews]);

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
    if (!socket) {
      collaborationSocket.current = null;
      setCollaborationStatus('idle');
      setCollaborationReviewers([]);
      return;
    }

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
    if (isSavingReviewRef.current || !reviewsReady) return;
    if (!lastFetchedRow.current || !applicationId || !applicationSource) return;
    if (editor.applicationId !== applicationId) return;
    const savedApplicationId = applicationId;

    isSavingReviewRef.current = true;
    ++reviewRequestSequence.current;
    setIsSavingReview(true);
    setSaveError('');
    try {
      const savedReview = await saveApplicationReview({
        applicationId: savedApplicationId,
        comment: commentText,
        expectedUpdatedAt: editor.expectedUpdatedAt,
        rating: draftRating,
        decision: draftDecision,
      });
      setReviewsByApplicationId((currentReviews) => ({
        ...currentReviews,
        [savedReview.applicationId]: savedReview,
      }));
      dispatchEditor({ type: 'saved', review: savedReview });

      if (applicationIdRef.current === savedApplicationId) {
        broadcastCommentSaved(savedReview.comment ?? '');
      }
    } catch (error) {
      console.error('Save review error:', error);
      if (applicationIdRef.current === savedApplicationId) {
        setSaveError(getErrorMessage(error, 'Failed to save review. Please try again.'));
      }
    } finally {
      isSavingReviewRef.current = false;
      setIsSavingReview(false);
      // A failed save can mean another reviewer committed a newer version.
      void fetchApplicationReviews();
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
          className="text-blue-600 underline decoration-blue-200 underline-offset-4 hover:text-blue-700"
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
    clearReviewCaches();
    setIsAdmin(false);
    navigate('/');
  };

  const resetEditor = () => {
    dispatchEditor({
      type: 'reset',
      applicationId,
      review: applicationId ? reviewsByApplicationId[applicationId] : undefined,
      legacyComment: getReviewerCommentValue(headers, currentRow),
    });
    setSaveError('');
  };

  const activeQueueFilter = readQueueScope(searchParams);
  const selectionIndex = getReviewSelectionIndex({
    rows: filteredRows,
    applicationId: searchParams.get('application'),
    page: searchParams.get('q'),
  });
  const currentPage = selectionIndex + 1;
  const applicantName = currentRow[2] || 'Loading applicant';
  const firstChoiceTrack = getFirstChoiceTrack(headers, currentRow);
  const firstChoice = firstChoiceTrack
    ? getSectionTitle(firstChoiceTrack)
    : 'Unspecified';
  const priorities = getSectionPriorities();
  const hasPrevious = currentPage > 1;
  const hasNext = filteredRows.length > currentPage;
  const progressPercent = filteredRows.length
    ? Math.min((currentPage / filteredRows.length) * 100, 100)
    : 0;

  const createReviewHref = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.delete('application');
    params.set('q', String(page));
    return `/review?${params.toString()}`;
  };

  const createQueueFilterHref = (filter: QueueFilterKey) => {
    const params = writeApplicationFilters(searchParams, appliedFilters);
    if (filter === 'assignedToMe') params.set('filter', filter);
    else params.delete('filter');
    return `/review?${params.toString()}`;
  };

  const getQueueRows = (filter: QueueFilterKey) => filterRowsByQueueFilter({
    assignmentFallbackEnabled,
    assignments,
    filter,
    headers,
    reviewer,
    rows: allRows,
  });
  const getQueueFilterCount = (filter: QueueFilterKey) =>
    filterRowsByApplicationFilters(getQueueRows(filter), headers, appliedFilters).length;
  const hasNoAssignments = activeQueueFilter === 'assignedToMe' && !getQueueRows('assignedToMe').length;
  const filterTracks = SECTION_CONFIGS.flatMap(({ key, title }) =>
    key === 'general' || key === 'other' ? [] : [{ key, label: title }],
  );

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
  const reviewDataWarning = [assignmentWarning, reviewsWarning, saveError]
    .filter(Boolean)
    .join(' ');
  const hasReviewLoadError = Boolean(reviewLoadError);
  const hasUnavailableApplication = searchParams.has('application') && selectionIndex === -1;
  const hasEmptyFilteredQueue =
    !hasReviewLoadError && !isReviewLoading && (!filteredRows.length || hasUnavailableApplication);
  const emptyQueueTitle = hasUnavailableApplication
    ? 'Application unavailable'
    : hasNoAssignments ? 'No assigned applications' : 'No matching applications';
  const emptyQueueDescription = hasUnavailableApplication
    ? 'This application is not available in the current queue. Choose All applications to continue.'
    : hasNoAssignments
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
            <p className="portal-eyebrow text-blue-500">
              Data refresh
            </p>
            <h3 className="portal-subheading mt-2 text-[#333]">
              New data available
            </h3>
            <p className="portal-body mt-3 text-neutral-600">
              New data was detected while you were editing. Copy your current
              comment before refreshing if you need to preserve it.
            </p>
            <div className="portal-body mt-4 rounded-2xl bg-neutral-100 p-4 text-neutral-700">
              <pre className="portal-body whitespace-pre-wrap font-sans">{commentText}</pre>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => {
                  updateDataSmoothly(newData);
                  setShowConflictWarning(false);
                  dispatchEditor({
                    type: 'reset',
                    applicationId,
                    review: applicationId ? reviewsByApplicationId[applicationId] : undefined,
                    legacyComment: getReviewerCommentValue(headers, newData),
                  });
                }}
                className="portal-control bg-blue-400 px-5 py-2 text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
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
        toolbar={
          !isReviewLoading && !hasReviewLoadError && !hasEmptyFilteredQueue ? (
            <ReviewToolbar
              currentPage={currentPage}
              filteredCount={filteredRows.length}
              hasNext={hasNext}
              hasPrevious={hasPrevious}
              isEditing={isEditing}
              isReady={reviewsReady && editor.applicationId === applicationId}
              isSaving={isSavingReview}
              nextHref={hasNext ? createReviewHref(currentPage + 1) : undefined}
              previousHref={
                hasPrevious ? createReviewHref(currentPage - 1) : undefined
              }
              saveComment={saveComment}
              onReset={resetEditor}
            />
          ) : undefined
        }
      >
        <main className="mx-auto min-h-[calc(100vh-8.275rem)] max-w-[1500px] px-5 py-8 sm:px-8">
          {!isReviewLoading ? (
            <section className="portal-surface-quiet px-6 py-4 sm:px-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {QUEUE_FILTERS.map((filter) => {
                    const isActive = activeQueueFilter === filter.key;
                    const count = getQueueFilterCount(filter.key);

                    return (
                      <Link
                        key={filter.key}
                        to={createQueueFilterHref(filter.key)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`portal-control portal-square-control border px-3 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 ${
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
                <ApplicationFiltersPopover applied={appliedFilters} questions={binaryQuestions} tracks={filterTracks}
                  onApply={(filters) => setSearchParams(writeApplicationFilters(searchParams, filters))} />
              </div>
            </section>
          ) : null}

          {reviewDataWarning && !hasReviewLoadError ? (
            <p className="portal-meta portal-square-field mt-5 border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
              {reviewDataWarning}
            </p>
          ) : null}

          <div className={isReviewLoading ? '' : 'mt-7'}>
            {isReviewLoading ? (
              <ReviewSummarySkeleton />
            ) : hasReviewLoadError ? (
              <section className="portal-surface-quiet p-8 text-center">
                <p className="portal-eyebrow text-blue-500">
                  Application review
                </p>
                <h1 className="portal-page-title mt-3 text-[#2f3138]">
                  Unable to load applications
                </h1>
                <p className="portal-meta mx-auto mt-3 max-w-2xl text-neutral-500">
                  {reviewLoadError}
                </p>
                <button
                  type="button"
                  onClick={() => void fetchSheetData()}
                  className="portal-control portal-control--large portal-square-control mt-6 inline-flex h-12 items-center justify-center bg-blue-400 px-6 text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                >
                  Retry
                </button>
              </section>
            ) : hasEmptyFilteredQueue ? (
              <section className="portal-surface-quiet p-8 text-center">
                <p className="portal-eyebrow text-blue-500">
                  Application review
                </p>
                <h1 className="portal-page-title mt-3 text-[#2f3138]">
                  {emptyQueueTitle}
                </h1>
                <p className="portal-meta mx-auto mt-3 max-w-xl text-neutral-500">
                  {emptyQueueDescription}
                </p>
                {hasUnavailableApplication ? (
                  <Link to={createQueueFilterHref('all')}
                    className="portal-control portal-control--large portal-square-control mt-6 inline-flex h-12 items-center justify-center bg-blue-400 px-6 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2">
                    All applications
                  </Link>
                ) : null}
              </section>
            ) : (
              <section className="portal-surface p-6 sm:p-8">
                <div className="grid gap-8 xl:grid-cols-[minmax(0,0.85fr)_minmax(520px,0.75fr)] xl:items-stretch">
                  <div className="flex min-h-[15rem] h-full flex-col justify-between">
                    <div className="flex flex-col items-start text-left">
                      <div>
                        <p className="portal-eyebrow text-blue-500">
                          Application review
                        </p>
                        <h1 className="portal-page-title mt-3 max-w-4xl text-[#2f3138]">
                          {applicantName}
                        </h1>
                      </div>
                    </div>
                    <div className="mt-8 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <div className="min-w-0">
                        <p className="portal-eyebrow text-neutral-400">
                          First choice
                        </p>
                        <p className="portal-subheading mt-1 text-blue-500">
                          {firstChoice}
                        </p>
                      </div>
                      <span className="portal-label inline-flex w-fit items-center bg-[#333] px-4 py-2 text-white">
                        {filteredRows.length
                          ? `Application ${currentPage} of ${filteredRows.length}`
                          : 'Loading queue'}
                      </span>
                    </div>
                  </div>

                  <div className="portal-row-band min-w-0 px-6 py-5 sm:px-8">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      <div>
                        <p className="portal-metric portal-metric--compact text-[#333]">
                          {filteredRows.length ? currentPage : '-'}
                        </p>
                        <p className="portal-meta text-neutral-500">
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

                    <p className="portal-eyebrow mt-5 text-neutral-400">
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
                              <span className="portal-label block">
                                {section.title}
                              </span>
                              <span className="portal-meta text-neutral-400">
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

          {!hasReviewLoadError && !hasEmptyFilteredQueue ? (
          <div className="mt-7">
            <section className="min-w-0 space-y-7">
              {isReviewLoading ? (
                <ReviewAnswersSkeleton />
              ) : selectedAnswerSection ? (
                <article
                  id={selectedAnswerSection.id}
                  className="portal-surface-quiet scroll-mt-40 overflow-hidden px-6 py-7 sm:px-8"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
                    <div className="flex items-center gap-3">
                      <span className={`h-4 w-4 rounded-full ${selectedAnswerSection.accent}`} />
                      <div>
                        <h2 className="portal-section-title text-[#2f3138]">
                          {selectedAnswerSection.title}
                        </h2>
                        <p className="portal-meta text-neutral-400">
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
                            <h3 className="portal-question whitespace-pre-wrap text-[#333]">
                              {question}
                            </h3>
                            <div className="portal-answer whitespace-pre-wrap text-neutral-700">
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

              <div id="review-panel" className="scroll-mt-40">
                {isReviewLoading ? (
                  <ReviewPanelSkeleton />
                ) : (
                  <ReviewPanel
                    commentText={commentText}
                    isSaving={isSavingReview}
                    isReady={reviewsReady && editor.applicationId === applicationId}
                    selectedDecision={draftDecision}
                    selectedRating={draftRating}
                    setCommentText={(value) => dispatchEditor({ type: 'comment', value })}
                    onBeginEditing={() => dispatchEditor({ type: 'edit' })}
                    setLastRemoteSave={setLastRemoteSave}
                    setRemoteDraft={setRemoteDraft}
                    onDecisionChange={(decision) => {
                      dispatchEditor({ type: 'decision', value: decision });
                    }}
                    onRatingChange={(rating) => {
                      dispatchEditor({ type: 'rating', value: rating });
                    }}
                    onDraftChange={broadcastCommentDraft}
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
  isSaving: boolean;
  isReady: boolean;
  selectedDecision: ReviewDecision | null;
  selectedRating: number | null;
  setCommentText: (value: string) => void;
  onBeginEditing: () => void;
  setLastRemoteSave: (value: RemoteCommentUpdate | null) => void;
  setRemoteDraft: (value: RemoteCommentUpdate | null) => void;
  onDecisionChange: (decision: ReviewDecision) => void;
  onDraftChange: (value: string) => void;
  onRatingChange: (rating: number) => void;
}

function ReviewPanel({
  commentText,
  isSaving,
  isReady,
  selectedDecision,
  selectedRating,
  setCommentText,
  onBeginEditing,
  setLastRemoteSave,
  setRemoteDraft,
  onDecisionChange,
  onDraftChange,
  onRatingChange,
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
      <div className="grid gap-8">
        <section className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="portal-eyebrow text-blue-500">
                Review
              </p>
              <h2 className="portal-card-title mt-1 text-[#333]">
                Rating
              </h2>
            </div>
          </div>

          {!isReady ? (
            <p role="status" className="mt-4 text-sm text-neutral-500">
              Waiting for the latest saved review before editing.
            </p>
          ) : null}

          {isSaving ? (
            <div
              aria-live="polite"
              className="mt-4 border border-blue-100 bg-blue-50 px-4 py-3"
            >
              <div className="portal-label flex items-center justify-between gap-4 text-blue-600">
                <span>Saving review</span>
                <span className="portal-label text-blue-400">
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
                    disabled={isSaving || !isReady}
                    onClick={() => onRatingChange(score)}
                    className={`portal-control portal-control--compact portal-square-control flex h-8 w-8 items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
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
                    disabled={isSaving || !isReady}
                    onClick={() => onDecisionChange(option.decision)}
                    className={`portal-control portal-square-control h-9 border px-3 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
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
            disabled={isSaving || !isReady}
            onFocus={onBeginEditing}
            onChange={(event) => {
              onBeginEditing();
              setCommentText(event.target.value);
              setRemoteDraft(null);
              setLastRemoteSave(null);
              onDraftChange(event.target.value);
            }}
            className="portal-answer portal-muted-field mt-5 h-56 w-full resize-none border p-4 text-neutral-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-wait disabled:opacity-70"
            placeholder="Enter review comments, notes, and decision context here..."
          />
        </section>
      </div>
    </div>
  );
}
