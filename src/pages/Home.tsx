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
import { getReviewSettings } from '../lib/settingsApi';

const DEFAULT_REVIEW_DUE_DATE = '2026-05-03';
const DEFAULT_REVIEW_STATS: ReviewStats = {
  totalDecisions: 0,
  accepted: 0,
  waitlisted: 0,
  rejected: 0,
};

function toDateAtEndOfDay(dateValue: string): Date {
  return new Date(`${dateValue}T23:59:59`);
}

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
      <p className="text-sm font-semibold text-neutral-500">
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
    <div className="flex min-h-32 flex-col items-start justify-center px-6 py-6 text-left sm:px-8">
      <span className={`h-1 w-12 ${accentClassName}`} />
      <p className="mt-5 text-4xl font-medium leading-none text-[#2f3138]">
        {value}
      </p>
      <p className="mt-3 text-sm font-medium text-neutral-500">
        {label}
      </p>
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
  const [isAdmin, setIsAdmin] = useState(() => hasCachedAdminAccess());
  const [reviewDueDateValue, setReviewDueDateValue] = useState(
    DEFAULT_REVIEW_DUE_DATE,
  );
  const [reviewStats, setReviewStats] =
    useState<ReviewStats>(DEFAULT_REVIEW_STATS);
  const shouldShowDashboardSkeleton = isLoading && hasStoredGoogleSession();
  const shellReviewerName = userName ? `Signed in as ${userName}` : undefined;

  const loadDashboardData = useCallback((isMounted: () => boolean = () => true) => {
    void Promise.allSettled([
      loadApplicationSheetData(),
      listMyAssignments(),
      listApplicationReviews(),
    ]);
    void getReviewSettings()
      .then((settings) => {
        if (isMounted()) {
          setReviewDueDateValue(settings.dueDate);
        }
      })
      .catch(() => {
        if (isMounted()) {
          setReviewDueDateValue(DEFAULT_REVIEW_DUE_DATE);
        }
      });
    void getReviewStats()
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
          error instanceof Error ? error.message : 'Failed to initialize Google sign-in.',
        );
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

  const signIn = () => {
    setErrorMessage('');
    void redirectToGoogleSignIn().catch((error: unknown) => {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to start Google sign-in.',
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
      setIsAdmin(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to sign out from Google.',
      );
    }
  };
  
  const loginPanel = (
    <div className="w-full max-w-[560px]">
      <h1 className="mb-9 text-center text-[2.75rem] font-medium leading-[1.18] text-[#2f3138]">
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
            className="flex h-11 w-full items-center justify-center gap-3 rounded-2xl bg-blue-400 px-4 text-xl font-bold text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
          >
            <span className="rounded-full bg-white p-0.5">
              <GoogleIcon />
            </span>
            Continue with Google
          </button>
          {isDevelopmentAuthEnabled() ? (
            <button
              onClick={signInForDevelopment}
              className="flex h-11 w-full items-center justify-center rounded-2xl bg-[#333] px-4 text-base font-bold text-white transition-opacity hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-[#333] focus:ring-offset-2"
            >
              Use Test Reviewer
            </button>
          ) : null}
        </div>
      )}

      {errorMessage ? (
        <p className="mt-4 rounded-lg border border-[#ff6f6f]/20 bg-[#ff6f6f]/10 px-3 py-2 text-left text-sm font-medium text-[#b83232]">
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

  const firstName = userName.trim().split(/\s+/)[0] || 'Reviewer';
  const today = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  const reviewDueDate = toDateAtEndOfDay(reviewDueDateValue);
  const reviewDueDateLabel = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(reviewDueDate);
  const daysUntilDue = Math.max(
    0,
    Math.ceil((reviewDueDate.getTime() - Date.now()) / 86_400_000),
  );
  const deadlineProgress = Math.min(
    Math.max(((14 - daysUntilDue) / 14) * 100, 8),
    100,
  );
  const dashboardStats = [
    {
      accentClassName: 'bg-blue-400',
      label: 'Total decisions',
      value: String(reviewStats.totalDecisions),
    },
    {
      accentClassName: 'bg-emerald-400',
      label: 'Accepted',
      value: String(reviewStats.accepted),
    },
    {
      accentClassName: 'bg-amber-400',
      label: 'Waitlisted',
      value: String(reviewStats.waitlisted),
    },
    {
      accentClassName: 'bg-rose-400',
      label: 'Rejected',
      value: String(reviewStats.rejected),
    },
  ];

  const signedInPage = (
    <InternalShell
      activePath="dashboard"
      onSignOut={() => void signOut()}
      reviewerName={shellReviewerName}
      showAdmin={isAdmin}
    >
      <main className="mx-auto min-h-[calc(100vh-5.275rem)] max-w-[1500px] px-5 py-8 sm:px-8">
        <section className="portal-surface p-6 sm:p-8">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)] lg:items-stretch">
            <div className="flex min-h-[19rem] flex-col justify-between">
              <div>
                <p className="text-sm font-semibold text-[#333]">{today}</p>
                <h1 className="mt-6 max-w-4xl text-4xl font-medium leading-[1.08] text-[#2f3138] sm:text-5xl xl:text-6xl">
                  Welcome to the Projects Review Portal,
                  <span className="block">{firstName}</span>
                </h1>
                <p className="mt-6 max-w-2xl text-base font-medium leading-7 text-neutral-500">
                  Get to reviewing the applications lil bro
                </p>
              </div>
              <Link
                to="/review"
                className="mt-8 inline-flex h-12 w-full items-center justify-center bg-blue-400 px-6 text-base font-bold text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 sm:w-fit"
              >
                Start Reviewing
              </Link>
            </div>

            <aside className="portal-row-band flex min-h-[19rem] flex-col justify-between px-6 py-7 sm:px-8">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-500">
                  Due date
                </p>
                <h2 className="mt-4 text-4xl font-medium leading-tight text-[#2f3138]">
                  {reviewDueDateLabel}
                </h2>
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-[0.14em] text-neutral-400">
                  <span>{daysUntilDue} days left</span>
                  <span>Review deadline</span>
                </div>
                <div className="h-2 overflow-hidden bg-neutral-100">
                  <div
                    className="h-full bg-blue-400"
                    style={{ width: `${deadlineProgress}%` }}
                  />
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="portal-surface-quiet mt-8 px-6 py-7 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-3xl font-medium text-[#2f3138]">
                Application Ratings
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-neutral-500">
                Ranked candidates sorted by rating, then alphabetically.
              </p>
            </div>
            <Link
              to="/rankings"
              className="inline-flex h-12 w-full items-center justify-center bg-[#2f3138] px-6 text-base font-bold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#2f3138] focus:ring-offset-2 sm:w-28"
            >
              View
            </Link>
          </div>
        </section>

        <section className="portal-surface-quiet mt-8 overflow-hidden">
          <div className="px-6 pb-3 sm:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-500">
              Decision overview
            </p>
            <h2 className="mt-2 text-3xl font-medium text-[#2f3138]">
              Review Outcomes
            </h2>
          </div>
          <div className="grid divide-y divide-neutral-200/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
            {dashboardStats.map((stat) => (
              <DashboardStat
                accentClassName={stat.accentClassName}
                key={stat.label}
                label={stat.label}
                value={stat.value}
              />
            ))}
          </div>
        </section>

        <section className="portal-surface-quiet mt-10 px-6 py-7 sm:px-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(220px,auto)] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-500">
                Workflow
              </p>
              <h2 className="mt-2 text-3xl font-medium text-[#2f3138]">
                Continue the application queue
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-neutral-500">
                Jump back into reviews without changing the current Google Sheet source.
              </p>
            </div>
            <Link
              to="/review"
              className="inline-flex h-12 w-full items-center justify-center bg-blue-400 px-6 text-base font-bold text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 sm:w-52"
            >
              Open Applications
            </Link>
          </div>
        </section>
      </main>
    </InternalShell>
  );

  return (
    <>
      {shouldShowDashboardSkeleton ? (
        <InternalShell
          activePath="dashboard"
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
