import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { InternalShell } from '../components/InternalShell';
import {
  clearCachedAdminAccess,
  getAdminStatus,
  hasCachedAdminAccess,
} from '../lib/adminApi';
import {
  completeGoogleSignInFromRedirect,
  getStoredGoogleProfile,
  restoreGoogleSession,
  signOutFromGoogle,
  type GoogleProfile,
} from '../lib/googleAuth';
import {
  getApplicationId,
  loadApplicationSheetData,
  type SheetRow,
} from '../lib/googleSheetData';
import {
  clearReviewCaches,
  listApplicationReviews,
  saveApplicationReview,
  type ApplicationReview,
  type ReviewDecision,
} from '../lib/reviewApi';

interface ReviewerIdentity {
  reviewerName: string;
}

interface RankedCandidate {
  applicationId: string;
  applicationIndex: number | null;
  applicantName: string;
  decision: ReviewDecision | null;
  firstChoice: string;
  rating: number;
  updatedAt: string;
  updatedByName: string;
}

const DECISION_BUTTONS: Array<{
  decision: ReviewDecision;
  label: string;
}> = [
  { decision: 'reject', label: 'Reject' },
  { decision: 'waitlist', label: 'Waitlist' },
  { decision: 'accept', label: 'Accept' },
];
const ACTIVE_DECISION_BUTTON_STYLES: Record<ReviewDecision, string> = {
  accept: 'border-[#20c76f] bg-[#20c76f] text-white',
  reject: 'border-[#ff6f6f] bg-[#ff6f6f] text-white',
  waitlist: 'border-[#f9a857] bg-[#f9a857] text-white',
};

function createReviewerIdentity(profile: GoogleProfile): ReviewerIdentity {
  return {
    reviewerName: profile.name || profile.email || 'Reviewer',
  };
}

function getApplicationIndex(applicationId: string): number | null {
  const match = /^sheet-row:(\d+)$/.exec(applicationId);
  return match ? Number(match[1]) : null;
}

function formatUpdatedAt(updatedAt: string): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function buildRankedCandidates({
  reviews,
  rows,
}: {
  reviews: ApplicationReview[];
  rows: SheetRow[];
}): RankedCandidate[] {
  const rowsByApplicationId = new Map(
    rows.map((row) => [getApplicationId(row), row]),
  );

  return reviews
    .filter((review): review is ApplicationReview & { rating: number } =>
      Number.isInteger(review.rating) && review.decision !== 'accept',
    )
    .map((review) => {
      const row = rowsByApplicationId.get(review.applicationId);
      const applicationIndex = row?.index ?? getApplicationIndex(review.applicationId);

      return {
        applicationId: review.applicationId,
        applicationIndex,
        applicantName:
          row?.data[2]?.trim() ||
          (applicationIndex ? `Application ${applicationIndex}` : review.applicationId),
        decision: review.decision,
        firstChoice: row?.data[13]?.trim() || 'Unspecified',
        rating: review.rating,
        updatedAt: review.updatedAt,
        updatedByName: review.updatedByName,
      };
    })
    .sort((left, right) => {
      if (right.rating !== left.rating) {
        return right.rating - left.rating;
      }

      const nameSort = left.applicantName.localeCompare(
        right.applicantName,
        undefined,
        { sensitivity: 'base' },
      );

      if (nameSort !== 0) {
        return nameSort;
      }

      return (left.applicationIndex ?? 0) - (right.applicationIndex ?? 0);
    });
}

function RankedCandidatesSkeleton() {
  return (
    <main
      aria-label="Loading ranked candidates"
      className="mx-auto min-h-[calc(100vh-5.275rem)] max-w-[1500px] px-5 py-7 sm:px-8"
    >
      <section className="portal-surface rounded-[1.75rem] p-6 sm:p-8">
        <div className="h-5 w-28 rounded bg-neutral-200" />
        <div className="mt-5 h-14 max-w-xl rounded-xl bg-neutral-200" />
        <div className="mt-4 h-5 max-w-2xl rounded bg-neutral-200" />
      </section>
      <section className="portal-surface-quiet mt-7 overflow-hidden rounded-[1.5rem]">
        <div className="h-12 bg-neutral-50" />
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="grid gap-4 px-6 py-5 md:grid-cols-[80px_minmax(0,1fr)_160px_160px_160px]"
          >
            <div className="h-9 rounded-full bg-neutral-200" />
            <div>
              <div className="h-5 max-w-xs rounded bg-neutral-200" />
              <div className="mt-3 h-4 max-w-[10rem] rounded bg-neutral-200" />
            </div>
            <div className="h-5 rounded bg-neutral-200" />
            <div className="h-8 rounded-full bg-neutral-200" />
            <div className="h-5 rounded bg-neutral-200" />
          </div>
        ))}
      </section>
    </main>
  );
}

export default function RankedCandidates() {
  const navigate = useNavigate();
  const [reviewer, setReviewer] = useState<ReviewerIdentity | null>(() => {
    const storedProfile = getStoredGoogleProfile();
    return storedProfile ? createReviewerIdentity(storedProfile) : null;
  });
  const [isAdmin, setIsAdmin] = useState(() => hasCachedAdminAccess());
  const [isLoading, setIsLoading] = useState(true);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [reviews, setReviews] = useState<ApplicationReview[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [savingDecisionById, setSavingDecisionById] = useState<
    Record<string, ReviewDecision>
  >({});

  useEffect(() => {
    let isMounted = true;

    async function initializeRankings() {
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

        const [sheetData, applicationReviews] = await Promise.all([
          loadApplicationSheetData(),
          listApplicationReviews({ fresh: true }),
        ]);

        if (!isMounted) {
          return;
        }

        setRows(sheetData.rows);
        setReviews(applicationReviews);
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Failed to load ranked candidates.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void initializeRankings();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const rankedCandidates = useMemo(
    () => buildRankedCandidates({ reviews, rows }),
    [reviews, rows],
  );

  const signOut = async () => {
    await signOutFromGoogle();
    clearCachedAdminAccess();
    clearReviewCaches();
    setIsAdmin(false);
    navigate('/');
  };

  const updateCandidateDecision = async (
    candidate: RankedCandidate,
    decision: ReviewDecision,
  ) => {
    setErrorMessage('');
    setSavingDecisionById((current) => ({
      ...current,
      [candidate.applicationId]: decision,
    }));

    try {
      const savedReview = await saveApplicationReview({
        applicationId: candidate.applicationId,
        decision,
        rating: candidate.rating,
      });

      setReviews((currentReviews) => {
        const existingIndex = currentReviews.findIndex(
          (review) => review.applicationId === savedReview.applicationId,
        );

        if (existingIndex === -1) {
          return [savedReview, ...currentReviews];
        }

        return currentReviews.map((review, index) =>
          index === existingIndex ? savedReview : review,
        );
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to update decision.',
      );
    } finally {
      setSavingDecisionById((current) => {
        const next = { ...current };
        delete next[candidate.applicationId];
        return next;
      });
    }
  };

  return (
    <InternalShell
      activePath="dashboard"
      onSignOut={() => void signOut()}
      reviewerName={reviewer ? `Signed in as ${reviewer.reviewerName}` : undefined}
      showAdmin={isAdmin}
    >
      {isLoading ? (
        <RankedCandidatesSkeleton />
      ) : (
        <main className="mx-auto min-h-[calc(100vh-5.275rem)] max-w-[1500px] px-5 py-7 sm:px-8">
          <section className="portal-surface rounded-[1.75rem] p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-500">
              Ranked candidates
            </p>
            <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-4xl font-medium leading-tight text-[#2f3138] sm:text-5xl">
                  Candidate ratings
                </h1>
                <p className="mt-3 max-w-3xl text-base font-medium leading-7 text-neutral-500">
                  Candidates are sorted by rating from highest to lowest. Ties
                  are sorted alphabetically. Accepted candidates are hidden.
                </p>
              </div>
              <Link
                to="/"
                className="portal-square-control inline-flex h-12 items-center justify-center border border-neutral-200/80 bg-white/70 px-6 text-base font-bold text-neutral-600 transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                Back to Dashboard
              </Link>
            </div>
          </section>

          {errorMessage ? (
            <p className="mt-5 rounded-2xl border border-[#ff6f6f]/25 bg-[#ff6f6f]/10 px-5 py-4 text-sm font-semibold text-[#b83232]">
              {errorMessage}
            </p>
          ) : null}

          <section className="portal-surface-quiet mt-7 overflow-hidden rounded-[1.5rem]">
            <div className="portal-row-band flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-400">
                {rankedCandidates.length} candidates pending final decision
              </p>
              <p className="text-sm font-semibold text-neutral-500">
                Rating desc, name asc
              </p>
            </div>

            {rankedCandidates.length ? (
              <div className="divide-y divide-neutral-100">
                {rankedCandidates.map((candidate, index) => (
                  <div
                    key={candidate.applicationId}
                    className="grid gap-4 px-6 py-5 md:grid-cols-[80px_minmax(0,1fr)_120px_300px_160px] md:items-center"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-lg font-bold text-blue-600">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <Link
                        to={
                          candidate.applicationIndex
                            ? `/review?q=${candidate.applicationIndex}`
                            : '/review'
                        }
                        className="text-lg font-bold text-[#333] transition-colors hover:text-blue-600"
                      >
                        {candidate.applicantName}
                      </Link>
                      <p className="mt-1 text-sm font-semibold text-neutral-400">
                        {candidate.applicationIndex
                          ? `Application ${candidate.applicationIndex}`
                          : candidate.applicationId}
                        {' · '}
                        {candidate.firstChoice}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-400">
                        Rating
                      </p>
                      <p className="mt-1 text-3xl font-bold text-[#333]">
                        {candidate.rating}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-400">
                        Decision
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {DECISION_BUTTONS.map(({ decision, label }) => {
                          const isSelected = candidate.decision === decision;
                          const savingDecision =
                            savingDecisionById[candidate.applicationId];
                          const isSaving = Boolean(savingDecision);
                          const isSavingThisDecision =
                            savingDecision === decision;

                          return (
                            <button
                              key={decision}
                              type="button"
                              disabled={isSaving}
                              onClick={() =>
                                void updateCandidateDecision(candidate, decision)
                              }
                              className={`portal-square-control border px-3 py-2 text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                                isSelected
                                  ? ACTIVE_DECISION_BUTTON_STYLES[decision]
                                  : 'border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50'
                              }`}
                            >
                              {isSavingThisDecision ? 'Saving' : label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-neutral-500">
                      <p>{candidate.updatedByName}</p>
                      <p className="mt-1 text-neutral-400">
                        {formatUpdatedAt(candidate.updatedAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-16 text-center">
                <h2 className="text-3xl font-bold text-[#333]">
                  N/A
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-6 text-neutral-500">
                  There are no rated candidates waiting for a final decision.
                  Accepted candidates are hidden from this view.
                </p>
                <Link
                  to="/review"
                  className="portal-square-control mt-6 inline-flex h-12 items-center justify-center bg-blue-400 px-6 text-base font-bold text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                >
                  Start Reviewing
                </Link>
              </div>
            )}
          </section>
        </main>
      )}
    </InternalShell>
  );
}
