import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import acmLogo from '../assets/acm-logo.png';
import { InternalShell } from '../components/InternalShell';
import { DashboardSkeleton } from '../components/LoadingSkeletons';
import {
  clearCachedAdminAccess,
  getAdminStatus,
  hasCachedAdminAccess,
  listAdminAssignments,
  listAdminReviewers,
  listMyAssignments,
} from '../lib/adminApi';
import {
  completeGoogleSignInFromRedirect,
  getGoogleAuthErrorMessage,
  getStoredGoogleProfile,
  hasStoredGoogleSession,
  hasGoogleSignInStartRequest,
  isDevelopmentAuthEnabled,
  redirectToGoogleSignIn,
  restoreGoogleSession,
  signInWithDevelopmentUser,
  signOutFromGoogle,
} from '../lib/googleAuth';
import { loadApplicationSheetData } from '../lib/googleSheetData';
import {
  clearReviewCaches,
  getReviewStats,
  listApplicationReviews,
  type ReviewStats,
} from '../lib/reviewApi';
import { getDefaultReviewDueDate } from '../lib/reviewDefaults';
import { getReviewDeadlineState } from '../lib/reviewDeadline';
import { getReviewSettings } from '../lib/settingsApi';

import './Home.css';

const DEFAULT_REVIEW_STATS: ReviewStats = {
  totalDecisions: 0,
  accepted: 0,
  waitlisted: 0,
  rejected: 0,
};

function hasGoogleAuthRedirectParams(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('code') || params.has('error') || hasGoogleSignInStartRequest();
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AcmLogo() {
  return (
    <div className="flex items-center gap-2">
      <img
        src={acmLogo}
        alt="ACM"
        className="h-[60px] w-[60px] flex-none object-contain"
      />
      <span className="text-base font-semibold text-neutral-800">
        at UC San Diego
      </span>
    </div>
  );
}

function PortalAuthLoader() {
  return (
    <div
      aria-label="Completing Google sign-in"
      className="flex flex-col items-center gap-4"
    >
      <div className="w-full rounded-2xl border border-neutral-200 bg-white p-2">
        <div className="h-3 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full w-1/3 rounded-full bg-[linear-gradient(270deg,#ff6f6f,#f9a857_18.75%,#80ce1c_36.98%,#51c0c0_55.73%,#62b0ff_75%,#816dff)] portal-auth-progress" />
        </div>
      </div>
      <p className="portal-meta text-neutral-500">
        Completing Google sign-in...
      </p>
    </div>
  );
}

function DashboardStat({
  accentClassName,
  label,
  value,
}: {
  accentClassName: string;
  label: string;
  value: string;
}) {
  return (
    <div className="dashboard-stat">
      <span aria-hidden="true" className={`dashboard-stat__accent ${accentClassName}`} />
      <dt className="dashboard-stat__label">{label}</dt>
      <dd className="dashboard-stat__value">{value}</dd>
    </div>
  );
}

export default function Home() {
  const [isSignedIn, setIsSignedIn] = useState(() => hasStoredGoogleSession());
  const [userName, setUserName] = useState(
    () => getStoredGoogleProfile()?.name ?? '',
  );
  const [isLoading, setIsLoading] = useState(() => hasGoogleAuthRedirectParams());
  const [errorMessage, setErrorMessage] = useState('');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [isAdmin, setIsAdmin] = useState(() => hasCachedAdminAccess());
  const [reviewDueDateValue, setReviewDueDateValue] = useState(
    () => getDefaultReviewDueDate(),
  );
  const [reviewStats, setReviewStats] =
    useState<ReviewStats>(DEFAULT_REVIEW_STATS);
  const shouldShowDashboardSkeleton = isLoading && hasStoredGoogleSession();
  const shellReviewerName = userName ? `Signed in as ${userName}` : undefined;

  const loadDashboardData = useCallback((isMounted: () => boolean = () => true) => {
    void Promise.allSettled([
      loadApplicationSheetData(),
      listMyAssignments(),
      listApplicationReviews({ fresh: true }),
    ]);
    void getReviewSettings()
      .then((settings) => {
        if (isMounted()) {
          setReviewDueDateValue(settings.dueDate);
        }
      })
      .catch(() => {
        if (isMounted()) {
          setReviewDueDateValue(getDefaultReviewDueDate());
        }
      });
    void getReviewStats({ fresh: true })
      .then((stats) => {
        if (isMounted()) {
          setReviewStats(stats);
        }
      })
      .catch(() => {
        if (isMounted()) {
          setReviewStats(DEFAULT_REVIEW_STATS);
        }
      });
    void getAdminStatus()
      .then((status) => {
        if (isMounted()) {
          setIsAdmin(status.isAdmin);
        }
        if (status.isAdmin) {
          void Promise.allSettled([
            listAdminAssignments(),
            listAdminReviewers(),
          ]);
        }
      })
      .catch(() => {
        if (isMounted()) {
          clearCachedAdminAccess();
          setIsAdmin(false);
        }
      });
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      try {
        const redirectedSession = await completeGoogleSignInFromRedirect();
        const session = redirectedSession ?? (await restoreGoogleSession());

        if (!isMounted) {
          return;
        }

        setIsSignedIn(Boolean(session));
        setUserName(session?.profile.name ?? '');

        if (session) {
          loadDashboardData(() => isMounted);
        } else {
          clearCachedAdminAccess();
          setIsAdmin(false);
          setReviewStats(DEFAULT_REVIEW_STATS);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          getGoogleAuthErrorMessage(error, 'Failed to initialize Google sign-in.'),
        );
        setIsSignedIn(false);
        setUserName('');
        clearCachedAdminAccess();
        setIsAdmin(false);
        setReviewStats(DEFAULT_REVIEW_STATS);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      isMounted = false;
    };
  }, [loadDashboardData]);

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const interval = window.setInterval(() => setCurrentDate(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, [isSignedIn]);

  const signIn = () => {
    setErrorMessage('');
    void redirectToGoogleSignIn().catch((error: unknown) => {
      setErrorMessage(
        getGoogleAuthErrorMessage(error, 'Failed to start Google sign-in.'),
      );
    });
  };

  const signInForDevelopment = () => {
    setErrorMessage('');
    const session = signInWithDevelopmentUser();
    setIsSignedIn(true);
    setUserName(session.profile.name);
    clearCachedAdminAccess();
    clearReviewCaches();
    setIsAdmin(false);
    loadDashboardData();
  };

  const signOut = async () => {
    setErrorMessage('');

    try {
      await signOutFromGoogle();
      setIsSignedIn(false);
      setUserName('');
      setReviewStats(DEFAULT_REVIEW_STATS);
      clearCachedAdminAccess();
      clearReviewCaches();
      setIsAdmin(false);
    } catch (error) {
      setErrorMessage(
        getGoogleAuthErrorMessage(error, 'Failed to sign out from Google.'),
      );
    }
  };

  const loginPanel = (
    <div className="w-full max-w-[560px]">
      <h1 className="portal-page-title mb-9 text-center text-[#2f3138]">
        ACM Projects
        <br />
        Application Portal
      </h1>

      {isLoading ? (
        <PortalAuthLoader />
      ) : (
        <div className="space-y-3">
          <button
            onClick={signIn}
            className="portal-control portal-control--large flex h-11 w-full items-center justify-center gap-3 rounded-2xl bg-blue-400 px-4 text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
          >
            <span className="rounded-full bg-white p-0.5">
              <GoogleIcon />
            </span>
            Continue with Google
          </button>
          {isDevelopmentAuthEnabled() ? (
            <button
              onClick={signInForDevelopment}
              className="portal-control portal-control--large flex h-11 w-full items-center justify-center rounded-2xl bg-[#333] px-4 text-white transition-opacity hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-[#333] focus:ring-offset-2"
            >
              Use Test Reviewer
            </button>
          ) : null}
        </div>
      )}

      {errorMessage ? (
        <p className="portal-meta mt-4 rounded-lg border border-[#ff6f6f]/20 bg-[#ff6f6f]/10 px-3 py-2 text-left text-[#b83232]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );

  const loggedOutPage = (
    <div className="min-h-screen bg-white text-[#333]">
      <header className="fixed top-0 z-10 w-full bg-white">
        <div className="flex h-[4.875rem] items-center px-8">
          <AcmLogo />
        </div>
        <div className="h-[0.4rem] w-full bg-[linear-gradient(270deg,#ff6f6f,#f9a857_18.75%,#80ce1c_36.98%,#51c0c0_55.73%,#62b0ff_75%,#816dff)]" />
      </header>

      <main className="flex min-h-screen items-center justify-center px-8 pt-[5.275rem]">
        {loginPanel}
      </main>
    </div>
  );

  const { dueDate, daysLeft, hasPassed, remainingPercentage } =
    getReviewDeadlineState(reviewDueDateValue, currentDate);
  const reviewDueDateLabel = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dueDate);
  const deadlineStatusLabel = daysLeft > 0
    ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`
    : hasPassed ? 'Deadline passed' : 'Due today';
  const dashboardStats = [
    {
      accentClassName: 'dashboard-stat__accent--total',
      label: 'Total decisions',
      value: String(reviewStats.totalDecisions),
    },
    {
      accentClassName: 'dashboard-stat__accent--accepted',
      label: 'Accepted',
      value: String(reviewStats.accepted),
    },
    {
      accentClassName: 'dashboard-stat__accent--waitlisted',
      label: 'Waitlisted',
      value: String(reviewStats.waitlisted),
    },
    {
      accentClassName: 'dashboard-stat__accent--rejected',
      label: 'Rejected',
      value: String(reviewStats.rejected),
    },
  ];

  const signedInPage = (
    <InternalShell
      activePath="dashboard"
      className="dashboard-shell"
      onSignOut={() => void signOut()}
      reviewerName={shellReviewerName}
      showAdmin={isAdmin}
    >
      <main className="dashboard-page">
        <section className="dashboard-hero" aria-labelledby="dashboard-heading">
          <div className="dashboard-intro">
            <h1 id="dashboard-heading" className="dashboard-heading">
              <span>Projects Application</span>
              <span className="dashboard-heading__accent">Review Portal</span>
            </h1>
            <p className="dashboard-subtitle">
              Get to reviewing the applications lil bro
            </p>
            <div className="dashboard-actions">
              <Link to="/review" className="dashboard-action dashboard-action--review">
                Review
              </Link>
              <Link to="/rankings" className="dashboard-action dashboard-action--decisions">
                View Decisions
              </Link>
            </div>
          </div>

          <aside className="dashboard-deadline" aria-label="Review deadline">
            <h2 className="dashboard-deadline__date">
              <time dateTime={reviewDueDateValue}>{reviewDueDateLabel}</time>
            </h2>
            <p className="dashboard-deadline__status">{deadlineStatusLabel}</p>
            <progress
              className="dashboard-deadline__progress"
              aria-label="Review time remaining"
              aria-valuetext={deadlineStatusLabel}
              max={100}
              value={remainingPercentage}
            />
          </aside>
        </section>

        <section className="dashboard-summary" aria-label="Review decisions">
          <dl className="dashboard-stats">
            {dashboardStats.map((stat) => (
              <DashboardStat
                accentClassName={stat.accentClassName}
                key={stat.label}
                label={stat.label}
                value={stat.value}
              />
            ))}
          </dl>
        </section>
      </main>
    </InternalShell>
  );

  return (
    <>
      {shouldShowDashboardSkeleton ? (
        <InternalShell
          activePath="dashboard"
          className="dashboard-shell"
          onSignOut={() => void signOut()}
          reviewerName={shellReviewerName}
          showAdmin={isAdmin}
        >
          <DashboardSkeleton />
        </InternalShell>
      ) : isSignedIn ? (
        signedInPage
      ) : (
        loggedOutPage
      )}
    </>
  );
}
