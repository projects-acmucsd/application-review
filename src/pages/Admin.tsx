import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { InternalShell } from '../components/InternalShell';
import {
  AdminDueDateSkeleton,
  AdminHeroSkeleton,
  AdminPanelSkeleton,
} from '../components/LoadingSkeletons';
import {
  assignApplication,
  bulkAssignApplications,
  bulkClearAssignments,
  clearAssignmentCaches,
  clearCachedAdminAccess,
  getAdminStatus,
  getReviewerOptionsFromEnv,
  listAdminAssignments,
  listAdminReviewers,
  type AdminStatus,
  type ApplicationAssignment,
  type ReviewerOption,
} from '../lib/adminApi';
import {
  completeGoogleSignInFromRedirect,
  getStoredGoogleProfile,
  restoreGoogleSession,
  signOutFromGoogle,
} from '../lib/googleAuth';
import {
  getFirstChoiceTrack,
  getApplicationId,
  clearApplicationSheetDataCache,
  loadApplicationSheetData,
  type SheetRow,
} from '../lib/googleSheetData';
import { clearReviewCaches } from '../lib/reviewApi';
import {
  updateApplicationSourceSettings,
  getReviewSettings,
  updateReviewDueDate,
  type ApplicationSourceSettings,
} from '../lib/settingsApi';

type TrackFilter = 'all' | 'ai' | 'design' | 'gameDev' | 'hack';
type AllocationAction = 'assign' | 'unassign';

const APPLICANTS_PER_PAGE = 10;
const DEFAULT_REVIEW_DUE_DATE = '2026-05-03';
const DEFAULT_APPLICATION_SHEET_NAME = 'Form Responses 1';

const TRACK_FILTERS: Array<{ key: TrackFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'ai', label: 'AI' },
  { key: 'design', label: 'Design' },
  { key: 'hack', label: 'Hack' },
  { key: 'gameDev', label: 'Game Dev' },
];

function getTrackLabel(track: TrackFilter | null): string {
  if (track === 'ai') return 'AI';
  if (track === 'design') return 'Design';
  if (track === 'gameDev') return 'Game Dev';
  if (track === 'hack') return 'Hack';

  return 'Unspecified';
}

function getFirstChoice(headers: string[], row: SheetRow): TrackFilter | null {
  return getFirstChoiceTrack(headers, row.data);
}

function mergeReviewers(
  backendReviewers: ReviewerOption[],
  envReviewers: ReviewerOption[],
): ReviewerOption[] {
  const reviewerMap = new Map<string, ReviewerOption>();

  [...backendReviewers, ...envReviewers].forEach((reviewer) => {
    reviewerMap.set(reviewer.email.toLowerCase(), {
      email: reviewer.email.toLowerCase(),
      name: reviewer.name || reviewer.email,
    });
  });

  return Array.from(reviewerMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function findAssignment(
  row: SheetRow,
  assignments: ApplicationAssignment[],
): ApplicationAssignment | null {
  const applicationId = getApplicationId(row);
  return (
    assignments.find((assignment) => assignment.applicationId === applicationId) ??
    null
  );
}

function formatAdminTimestamp(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function AdminMetric({
  accentClassName,
  label,
  value,
}: {
  accentClassName: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex min-h-28 flex-col justify-center px-6 py-5 text-center sm:px-8">
      <span className={`mx-auto h-1 w-12 ${accentClassName}`} />
      <p className="mt-5 text-4xl font-medium leading-none text-[#2f3138]">
        {value}
      </p>
      <p className="mt-3 text-sm font-semibold text-neutral-500">{label}</p>
    </div>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState(
    () => getStoredGoogleProfile()?.name ?? '',
  );
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [assignments, setAssignments] = useState<ApplicationAssignment[]>([]);
  const [reviewers, setReviewers] = useState<ReviewerOption[]>([]);
  const [trackFilter, setTrackFilter] = useState<TrackFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReviewerEmail, setSelectedReviewerEmail] = useState('');
  const [isReviewerDropdownOpen, setIsReviewerDropdownOpen] = useState(false);
  const [assignmentCount, setAssignmentCount] = useState('30');
  const [allocationAction, setAllocationAction] =
    useState<AllocationAction>('assign');
  const [applicantPage, setApplicantPage] = useState(1);
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [assigningApplicationId, setAssigningApplicationId] = useState('');
  const [reviewDueDateInput, setReviewDueDateInput] = useState(
    DEFAULT_REVIEW_DUE_DATE,
  );
  const [reviewDueDateUpdatedAt, setReviewDueDateUpdatedAt] = useState('');
  const [isSavingReviewDueDate, setIsSavingReviewDueDate] = useState(false);
  const [applicationSource, setApplicationSource] =
    useState<ApplicationSourceSettings | null>(null);
  const [applicationSourceUrlInput, setApplicationSourceUrlInput] =
    useState('');
  const [isSavingApplicationSource, setIsSavingApplicationSource] =
    useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const reviewerDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadAdminData() {
      try {
        const redirectedSession = await completeGoogleSignInFromRedirect();
        const session = redirectedSession ?? (await restoreGoogleSession());

        if (!session) {
          navigate('/');
          return;
        }

        if (isMounted) {
          setUserName(session.profile.name);
        }

        const sheetDataPromise = loadApplicationSheetData();
        const reviewSettingsPromise = getReviewSettings();

        void sheetDataPromise.catch(() => undefined);
        void reviewSettingsPromise.catch(() => undefined);

        const status = await getAdminStatus();
        if (isMounted) {
          setAdminStatus(status);
          setUserName(status.profile.name);
        }

        if (!status.isAdmin) {
          if (isMounted) {
            setErrorMessage('Admin access is required for assignment tools.');
          }
          return;
        }

        const [sheetData, assignmentRows, backendReviewers, reviewSettings] =
          await Promise.all([
            sheetDataPromise,
            listAdminAssignments(),
            listAdminReviewers(),
            reviewSettingsPromise,
          ]);

        if (!isMounted) {
          return;
        }

        const mergedReviewers = mergeReviewers(
          backendReviewers,
          getReviewerOptionsFromEnv(),
        );

        setHeaders(sheetData.headers);
        setRows(sheetData.rows);
        setApplicationSource(sheetData.source);
        setApplicationSourceUrlInput(sheetData.source.spreadsheetUrl);
        setAssignments(assignmentRows);
        setReviewers(mergedReviewers);
        setReviewDueDateInput(reviewSettings.dueDate);
        setReviewDueDateUpdatedAt(
          reviewSettings.updatedAt.startsWith('1970-')
            ? ''
            : reviewSettings.updatedAt,
        );
        setSelectedReviewerEmail(
          (currentEmail) => currentEmail || mergedReviewers[0]?.email || '',
        );
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Failed to load admin assignment tools.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadAdminData();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const signOut = async () => {
    await signOutFromGoogle();
    clearCachedAdminAccess();
    navigate('/');
  };

  const filteredRows = rows.filter((row) => {
    const matchesTrack =
      trackFilter === 'all' || getFirstChoice(headers, row) === trackFilter;
    const normalizedSearch = searchQuery.toLowerCase().trim();

    if (!normalizedSearch) {
      return matchesTrack;
    }

    const applicantName = (row.data[2] || '').toLowerCase();
    const applicantEmail = (row.data[1] || '').toLowerCase();
    return (
      matchesTrack &&
      (applicantName.includes(normalizedSearch) ||
        applicantEmail.includes(normalizedSearch))
    );
  });

  const applicantPageCount = Math.max(
    1,
    Math.ceil(filteredRows.length / APPLICANTS_PER_PAGE),
  );
  const currentApplicantPage = Math.min(applicantPage, applicantPageCount);
  const applicantStartIndex =
    (currentApplicantPage - 1) * APPLICANTS_PER_PAGE;
  const paginatedRows = filteredRows.slice(
    applicantStartIndex,
    applicantStartIndex + APPLICANTS_PER_PAGE,
  );
  const applicantRangeStart = filteredRows.length ? applicantStartIndex + 1 : 0;
  const applicantRangeEnd = Math.min(
    applicantStartIndex + APPLICANTS_PER_PAGE,
    filteredRows.length,
  );

  useEffect(() => {
    setApplicantPage(1);
  }, [allocationAction, searchQuery, trackFilter]);

  useEffect(() => {
    setApplicantPage((currentPage) =>
      Math.min(Math.max(currentPage, 1), applicantPageCount),
    );
  }, [applicantPageCount]);

  useEffect(() => {
    if (allocationAction === 'unassign') {
      setIsReviewerDropdownOpen(false);
    }
  }, [allocationAction]);

  useEffect(() => {
    if (!isReviewerDropdownOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        reviewerDropdownRef.current &&
        !reviewerDropdownRef.current.contains(event.target as Node)
      ) {
        setIsReviewerDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsReviewerDropdownOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isReviewerDropdownOpen]);

  const updateAssignmentState = (newAssignments: ApplicationAssignment[]) => {
    setAssignments((currentAssignments) => {
      const newAssignmentIds = new Set(
        newAssignments.map((assignment) => assignment.applicationId),
      );
      const rest = currentAssignments.filter(
        (item) => !newAssignmentIds.has(item.applicationId),
      );
      return [...newAssignments, ...rest];
    });
  };

  const clearAssignmentState = (applicationIds: string[]) => {
    const clearedApplicationIds = new Set(applicationIds);
    setAssignments((currentAssignments) =>
      currentAssignments.filter(
        (assignment) => !clearedApplicationIds.has(assignment.applicationId),
      ),
    );
  };

  const unassignedFilteredRows = filteredRows.filter(
    (row) => !findAssignment(row, assignments),
  );
  const assignedFilteredRows = filteredRows.filter((row) =>
    findAssignment(row, assignments),
  );
  const assignmentProgressPercent = filteredRows.length
    ? Math.min((assignedFilteredRows.length / filteredRows.length) * 100, 100)
    : 0;
  const sourceRows =
    allocationAction === 'assign' ? unassignedFilteredRows : assignedFilteredRows;
  const maxBulkCount = Math.min(sourceRows.length, 250);
  const normalizedAssignmentCount = Number.parseInt(assignmentCount, 10);
  const requestedAssignmentCount = Number.isFinite(normalizedAssignmentCount)
    ? Math.min(Math.max(normalizedAssignmentCount, 0), maxBulkCount)
    : 0;
  const selectedReviewer = reviewers.find(
    (reviewer) => reviewer.email === selectedReviewerEmail,
  );
  const totalApplications = rows.length;
  const totalAssignedApplications = assignments.length;
  const totalUnassignedApplications = Math.max(
    totalApplications - totalAssignedApplications,
    0,
  );
  const visibleApplications = filteredRows.length;

  const handleBulkAssignment = async () => {
    const reviewer = reviewers.find(
      (option) => option.email === selectedReviewerEmail,
    );

    if (allocationAction === 'assign' && !reviewer) {
      setErrorMessage('Choose a reviewer before allocating applications.');
      return;
    }

    if (requestedAssignmentCount < 1) {
      setErrorMessage(
        allocationAction === 'assign'
          ? 'Choose at least one unassigned application to allocate.'
          : 'Choose at least one assigned application to unassign.',
      );
      return;
    }

    setIsBulkAssigning(true);
    setErrorMessage('');

    try {
      const applicationIds = sourceRows
        .slice(0, requestedAssignmentCount)
        .map(getApplicationId);

      if (allocationAction === 'unassign') {
        const clearedApplicationIds = await bulkClearAssignments({
          applicationIds,
        });
        clearAssignmentState(clearedApplicationIds);
        return;
      }

      if (!reviewer) {
        throw new Error('Selected reviewer was not found.');
      }

      const newAssignments = await bulkAssignApplications({
        applicationIds,
        assignee: reviewer,
      });

      updateAssignmentState(newAssignments);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : allocationAction === 'assign'
            ? 'Failed to allocate applications.'
            : 'Failed to unassign applications.',
      );
    } finally {
      setIsBulkAssigning(false);
    }
  };

  const handleRowAssignment = async (row: SheetRow) => {
    const reviewer = reviewers.find(
      (option) => option.email === selectedReviewerEmail,
    );

    if (!reviewer) {
      setErrorMessage('Choose a reviewer before assigning an application.');
      return;
    }

    const applicationId = getApplicationId(row);
    setAssigningApplicationId(applicationId);
    setErrorMessage('');

    try {
      const newAssignment = await assignApplication({
        applicationId,
        assignee: reviewer,
      });
      updateAssignmentState([newAssignment]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to assign application.',
      );
    } finally {
      setAssigningApplicationId('');
    }
  };

  const handleReviewDueDateSave = async () => {
    if (!reviewDueDateInput) {
      setErrorMessage('Choose a review due date before saving.');
      return;
    }

    setIsSavingReviewDueDate(true);
    setErrorMessage('');

    try {
      const settings = await updateReviewDueDate(reviewDueDateInput);
      setReviewDueDateInput(settings.dueDate);
      setReviewDueDateUpdatedAt(
        settings.updatedAt.startsWith('1970-') ? '' : settings.updatedAt,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to update the review due date.',
      );
    } finally {
      setIsSavingReviewDueDate(false);
    }
  };

  const handleApplicationSourceSave = async () => {
    if (!applicationSourceUrlInput.trim()) {
      setErrorMessage('Paste a Google Sheet link before saving.');
      return;
    }

    const shouldResetCurrentCycle = window.confirm(
      'Switching the source resets assignments, ratings, decisions, and dashboard stats for the active cycle. Continue?',
    );

    if (!shouldResetCurrentCycle) {
      return;
    }

    setIsSavingApplicationSource(true);
    setErrorMessage('');

    try {
      const settings = await updateApplicationSourceSettings({
        spreadsheetUrl: applicationSourceUrlInput,
        sheetName: DEFAULT_APPLICATION_SHEET_NAME,
        clearCurrentData: true,
      });
      clearAssignmentCaches();
      clearApplicationSheetDataCache();
      clearReviewCaches();
      const sheetData = await loadApplicationSheetData(settings, {
        bypassCache: true,
      });

      setApplicationSource(settings);
      setApplicationSourceUrlInput(settings.spreadsheetUrl);
      setHeaders(sheetData.headers);
      setRows(sheetData.rows);
      setAssignments([]);
      setApplicantPage(1);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to update the application source.',
      );
    } finally {
      setIsSavingApplicationSource(false);
    }
  };

  return (
    <InternalShell
      activePath="admin"
      onSignOut={() => void signOut()}
      reviewerName={
        userName ? `Signed in as ${userName}` : 'Signed in'
      }
      showAdmin
    >
      <main className="mx-auto min-h-[calc(100vh-5.275rem)] max-w-[1500px] px-5 py-6 sm:px-8">
        {isLoading ? (
          <AdminHeroSkeleton />
        ) : (
          <section className="portal-surface px-6 py-6 sm:px-8">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-500">
                  Admin
                </p>
                <h1 className="text-4xl font-medium leading-[1.08] text-[#2f3138] sm:text-5xl">
                  Control Panel
                </h1>
              </div>
              <Link
                to="/review"
                className="portal-square-control inline-flex h-12 items-center justify-center bg-blue-400 px-6 text-base font-bold text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
              >
                Open Applications
              </Link>
            </div>
          </section>
        )}

        {errorMessage ? (
          <p className="portal-square-field mt-5 border border-[#ff6f6f]/20 bg-[#ff6f6f]/10 px-4 py-3 text-sm font-semibold text-[#b83232]">
            {errorMessage}
          </p>
        ) : null}

        {adminStatus && !adminStatus.isAdmin ? (
          <section className="portal-surface-quiet mt-6 px-6 py-5">
            <h2 className="text-2xl font-bold text-[#333]">
              Admin access required
            </h2>
            <p className="mt-2 text-sm font-medium leading-6 text-neutral-500">
              Your ACM Google account can access the reviewer portal, but it is
              not listed in `ADMIN_EMAILS`.
            </p>
          </section>
        ) : null}

        {adminStatus?.isAdmin && !isLoading ? (
          <section className="portal-surface-quiet mt-6 overflow-hidden">
            <div className="grid divide-y divide-neutral-200/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
              <AdminMetric
                accentClassName="bg-blue-400"
                label="Applications"
                value={totalApplications}
              />
              <AdminMetric
                accentClassName="bg-emerald-400"
                label="Assigned"
                value={totalAssignedApplications}
              />
              <AdminMetric
                accentClassName="bg-amber-400"
                label="Unassigned"
                value={totalUnassignedApplications}
              />
              <AdminMetric
                accentClassName="bg-[#333]"
                label="Reviewers"
                value={reviewers.length}
              />
            </div>
          </section>
        ) : null}

        {adminStatus?.isAdmin ? (
          isLoading ? (
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <AdminDueDateSkeleton />
              <AdminDueDateSkeleton />
            </div>
          ) : (
            <div className="mt-7 grid gap-px overflow-hidden bg-neutral-200/70 xl:grid-cols-2">
              <section className="portal-row-band px-6 py-6 sm:px-8">
                <div className="grid min-h-28 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.44fr)] lg:items-center">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-500">
                      Settings
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-[#333]">
                      Review due date
                    </h2>
                    {reviewDueDateUpdatedAt ? (
                      <p className="mt-2 text-sm font-semibold text-neutral-500">
                        Last updated{' '}
                        {formatAdminTimestamp(reviewDueDateUpdatedAt)}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">
                        Due date
                      </span>
                      <input
                        type="date"
                        value={reviewDueDateInput}
                        onChange={(event) =>
                          setReviewDueDateInput(event.target.value)
                        }
                        className="portal-muted-field portal-square-field mt-2 h-12 w-full border px-4 text-sm font-semibold text-[#333] outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleReviewDueDateSave()}
                      disabled={isSavingReviewDueDate || !reviewDueDateInput}
                      className="portal-square-control mt-auto h-12 bg-blue-400 px-5 text-sm font-bold text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
                    >
                      {isSavingReviewDueDate ? 'Saving...' : 'Save date'}
                    </button>
                  </div>
                </div>
              </section>

              <section className="portal-row-band px-6 py-6 sm:px-8">
                <div className="grid min-h-28 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.44fr)] lg:items-center">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-500">
                      Source
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-[#333]">
                      Cycle Change
                    </h2>
                    {applicationSource &&
                    !applicationSource.updatedAt.startsWith('1970-') ? (
                      <p className="mt-2 text-sm font-semibold text-neutral-500">
                        Last changed{' '}
                        {formatAdminTimestamp(applicationSource.updatedAt)}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">
                        Google Sheet link
                      </span>
                      <input
                        value={applicationSourceUrlInput}
                        onChange={(event) =>
                          setApplicationSourceUrlInput(event.target.value)
                        }
                        className="portal-muted-field portal-square-field mt-2 h-12 w-full border px-4 text-sm font-semibold text-[#333] outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleApplicationSourceSave()}
                      disabled={
                        isSavingApplicationSource ||
                        !applicationSourceUrlInput.trim()
                      }
                      className="portal-square-control mt-auto h-12 bg-blue-400 px-5 text-sm font-bold text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
                    >
                      {isSavingApplicationSource
                        ? 'Validating...'
                        : 'Save source'}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )
        ) : null}

        {adminStatus?.isAdmin ? (
          <section className="portal-surface-quiet mt-7">
            {isLoading ? (
              <div className="px-6 py-5 sm:px-8">
                <AdminPanelSkeleton />
              </div>
            ) : reviewers.length ? (
              <>
                <div className="grid gap-6 px-6 py-5 sm:px-8 lg:grid-cols-[minmax(0,0.46fr)_minmax(0,1fr)] lg:items-center">
                  <div>
                    <h2 className="text-3xl font-medium text-[#2f3138]">
                      Application Allocation
                    </h2>
                    <p className="mt-2 text-sm font-semibold text-neutral-500">
                      {visibleApplications} applicants in the current view
                    </p>
                    <div className="mt-3 max-w-md">
                      <div className="flex items-center justify-between gap-4 text-xs font-bold uppercase tracking-[0.14em] text-neutral-400">
                        <span>{assignedFilteredRows.length} assigned</span>
                        <span>{unassignedFilteredRows.length} unassigned</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden bg-neutral-100">
                        <div
                          className="h-full bg-blue-400 transition-[width] duration-300"
                          style={{ width: `${assignmentProgressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      className="portal-muted-field portal-square-field h-11 min-w-0 border px-4 text-sm font-medium text-[#333] outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 sm:w-56"
                      placeholder="Search applicant"
                    />
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {TRACK_FILTERS.map((filter) => (
                        <button
                          key={filter.key}
                          type="button"
                          onClick={() => setTrackFilter(filter.key)}
                          className={`portal-square-control border px-3 py-2 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                            trackFilter === filter.key
                              ? 'border-blue-300 bg-blue-50 text-blue-700'
                              : 'border-neutral-200 bg-transparent text-neutral-500 hover:bg-blue-50 hover:text-blue-600'
                          }`}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-px bg-neutral-200/70 lg:grid-cols-[240px_minmax(0,1fr)_160px_200px] lg:items-stretch">
                  <div className="portal-row-band px-6 py-4 sm:px-8 lg:pr-4">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">
                      Action
                    </span>
                    <div className="portal-muted-field portal-square-field mt-2 grid h-12 grid-cols-2 border p-1">
                      {(['assign', 'unassign'] as const).map((action) => (
                        <button
                          key={action}
                          type="button"
                          onClick={() => setAllocationAction(action)}
                          className={`portal-square-control text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                            allocationAction === action
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-neutral-500 hover:text-neutral-800'
                          }`}
                        >
                          {action === 'assign' ? 'Assign' : 'Unassign'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div
                    ref={reviewerDropdownRef}
                    className="portal-row-band relative px-6 py-4 sm:px-8 lg:px-4"
                  >
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">
                      Reviewer
                    </span>
                    <button
                      type="button"
                      disabled={allocationAction === 'unassign'}
                      aria-haspopup="listbox"
                      aria-expanded={isReviewerDropdownOpen}
                      onClick={() =>
                        setIsReviewerDropdownOpen((isOpen) => !isOpen)
                      }
                      className="portal-muted-field portal-square-field mt-2 flex h-12 w-full items-center justify-between gap-3 border px-4 text-left text-sm font-semibold text-[#333] outline-none transition hover:border-blue-200 focus:border-blue-300 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400"
                    >
                      <span className="truncate">
                        {selectedReviewer?.name ?? 'Choose reviewer'}
                      </span>
                      <svg
                        aria-hidden="true"
                        className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${
                          isReviewerDropdownOpen ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="m6 9 6 6 6-6"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.25"
                        />
                      </svg>
                    </button>
                    {isReviewerDropdownOpen &&
                    allocationAction !== 'unassign' ? (
                      <div
                        role="listbox"
                        className="portal-square-field absolute z-30 mt-2 max-h-64 w-full overflow-auto border border-neutral-200 bg-white p-1 shadow-xl shadow-neutral-900/10"
                      >
                        {reviewers.map((reviewer) => {
                          const isSelected =
                            reviewer.email === selectedReviewerEmail;

                          return (
                            <button
                              key={reviewer.email}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => {
                                setSelectedReviewerEmail(reviewer.email);
                                setIsReviewerDropdownOpen(false);
                              }}
                              className={`portal-square-control flex w-full flex-col px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                                isSelected
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'text-[#333] hover:bg-neutral-50'
                              }`}
                            >
                              <span className="text-sm font-bold">
                                {reviewer.name}
                              </span>
                              <span className="text-xs font-semibold text-neutral-400">
                                {reviewer.email}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <label className="portal-row-band block px-6 py-4 sm:px-8 lg:px-4">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">
                      Applicants
                    </span>
                    <input
                      type="number"
                      min="1"
                      max={maxBulkCount}
                      value={assignmentCount}
                      onChange={(event) =>
                        setAssignmentCount(event.target.value)
                      }
                      className="portal-muted-field portal-square-field mt-2 h-12 w-full border px-4 text-sm font-semibold text-[#333] outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>

                  <div className="portal-row-band flex items-end px-6 py-4 sm:px-8 lg:pl-4">
                    <button
                      type="button"
                      onClick={() => void handleBulkAssignment()}
                      disabled={
                        isBulkAssigning ||
                        requestedAssignmentCount < 1 ||
                        (allocationAction === 'assign' &&
                          !selectedReviewerEmail)
                      }
                      className={`portal-square-control h-12 w-full px-5 text-sm font-bold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 ${
                        allocationAction === 'assign'
                          ? 'bg-blue-400 hover:bg-blue-500 focus:ring-blue-400'
                          : 'bg-[#333] hover:bg-neutral-700 focus:ring-[#333]'
                      }`}
                    >
                      {isBulkAssigning
                        ? allocationAction === 'assign'
                          ? 'Allocating...'
                          : 'Unassigning...'
                        : allocationAction === 'assign'
                          ? `Allocate ${requestedAssignmentCount || 0}`
                          : `Unassign ${requestedAssignmentCount || 0}`}
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden">
                  <div className="portal-row-band grid grid-cols-[minmax(0,1fr)_180px_220px] gap-4 px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-neutral-400 sm:px-8">
                    <span>Applicant</span>
                    <span>First choice</span>
                    <span>Assigned to</span>
                  </div>
                  <div className="divide-y divide-neutral-100">
                    {paginatedRows.length ? (
                      paginatedRows.map((row) => {
                        const applicationId = getApplicationId(row);
                        const assignment = findAssignment(row, assignments);

                        return (
                          <div
                            key={applicationId}
                            className="grid gap-4 px-6 py-4 transition-colors hover:bg-[#f8fbff] sm:px-8 md:grid-cols-[minmax(0,1fr)_180px_220px] md:items-center"
                          >
                            <div>
                              <p className="text-sm font-bold text-[#333]">
                                {row.data[2] || 'Unnamed applicant'}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-neutral-400">
                                Application {row.index}
                              </p>
                            </div>
                            <span className="text-sm font-bold text-blue-500">
                              {getTrackLabel(getFirstChoice(headers, row))}
                            </span>
                            {assignment ? (
                              <span className="portal-square-control inline-flex w-fit border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
                                {assignment.assigneeName}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleRowAssignment(row)}
                                disabled={
                                  !selectedReviewerEmail ||
                                  assigningApplicationId === applicationId
                                }
                                className="portal-square-control inline-flex h-9 w-fit items-center justify-center bg-blue-400 px-4 text-xs font-bold text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
                              >
                                {assigningApplicationId === applicationId
                                  ? 'Assigning...'
                                  : 'Assign'}
                              </button>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="px-6 py-8 text-sm font-semibold text-neutral-500 sm:px-8">
                        No applicants match the current filters.
                      </div>
                    )}
                  </div>
                  <div className="portal-row-band flex flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                    <p className="text-sm font-semibold text-neutral-500">
                      Showing {applicantRangeStart}-{applicantRangeEnd} of{' '}
                      {filteredRows.length} applicants
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setApplicantPage((currentPage) =>
                            Math.max(currentPage - 1, 1),
                          )
                        }
                        disabled={currentApplicantPage <= 1}
                        className="portal-square-control border border-neutral-200 px-4 py-2 text-sm font-bold text-neutral-600 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700">
                        {currentApplicantPage} / {applicantPageCount}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setApplicantPage((currentPage) =>
                            Math.min(currentPage + 1, applicantPageCount),
                          )
                        }
                        disabled={currentApplicantPage >= applicantPageCount}
                        className="portal-square-control border border-neutral-200 px-4 py-2 text-sm font-bold text-neutral-600 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-6 bg-neutral-50 p-6 text-sm font-semibold text-neutral-500">
                Add reviewers to `REVIEWER_LIST` or `VITE_REVIEWER_LIST` to
                enable assignment controls.
              </div>
            )}
          </section>
        ) : null}
      </main>
    </InternalShell>
  );
}
