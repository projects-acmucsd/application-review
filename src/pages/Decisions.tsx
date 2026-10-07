import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, ArrowRightIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon, ClockIcon, XCircleIcon } from '@heroicons/react/20/solid';

import { InternalShell } from '../components/InternalShell';
import { clearCachedAdminAccess, getAdminStatus } from '../lib/adminApi';
import { buildDecisionEmailList, buildDecisionGroups, type DecisionApplicant } from '../lib/decisionApplicants';
import {
  completeGoogleSignInFromRedirect,
  getStoredGoogleProfile,
  restoreGoogleSession,
  signOutFromGoogle,
} from '../lib/googleAuth';
import { loadApplicationSheetData, type SheetRow } from '../lib/googleSheetData';
import { clearReviewCaches, listApplicationReviews, type ApplicationReview, type ReviewDecision } from '../lib/reviewApi';
import './Decisions.css';

const DECISIONS = [
  { value: 'accept', label: 'Accepted', icon: CheckCircleIcon },
  { value: 'waitlist', label: 'Waitlisted', icon: ClockIcon },
  { value: 'reject', label: 'Rejected', icon: XCircleIcon },
] as const;

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(date);
}

function DecisionBadge({ decision }: { decision: ReviewDecision }) {
  const { label, icon: Icon } = DECISIONS.find(({ value }) => value === decision)!;
  return (
    <span className={`decision-badge decision-badge--${decision}`}>
      <Icon aria-hidden="true" />
      {label}
    </span>
  );
}

function ApplicantRow({ applicant }: { applicant: DecisionApplicant }) {
  const displayId = applicant.applicationId.replace(/^sheet-row:/, '');
  const reviewHref = `/review?${new URLSearchParams({ application: applicant.applicationId })}`;
  return (
    <tr>
      <td>
        <span className="portal-item-title decision-applicant-name">{applicant.applicantName}</span>
        <span className="decision-secondary">Application ID: {displayId}</span>
      </td>
      <td>{applicant.firstChoice}</td>
      <td className="decision-rating">
        {applicant.rating === null ? (
          <span className="decision-secondary">Not rated</span>
        ) : (
          <><strong>{applicant.rating}</strong><span className="decision-rating-scale"> /10</span></>
        )}
      </td>
      <td><DecisionBadge decision={applicant.decision} /></td>
      <td>
        <span>{applicant.updatedByName}</span>
        <time className="decision-secondary" dateTime={applicant.updatedAt}>
          {formatUpdatedAt(applicant.updatedAt)}
        </time>
      </td>
      <td>
        {applicant.applicationIndex !== null ? (
          <Link className="decision-application-link" to={reviewHref} aria-label={`View application for ${applicant.applicantName}`}>
            View application <ArrowRightIcon aria-hidden="true" />
          </Link>
        ) : (
          <span className="decision-secondary">Application unavailable</span>
        )}
      </td>
    </tr>
  );
}

function AdminEmailCopy({ applicants, decisionLabel }: {
  applicants: DecisionApplicant[];
  decisionLabel: string;
}) {
  const { emails, text, missingEmailCount } = useMemo(
    () => buildDecisionEmailList(applicants), [applicants],
  );
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const category = decisionLabel.toLowerCase();
  const missingMessage = missingEmailCount > 0
    ? `${missingEmailCount} applicant${missingEmailCount === 1 ? ' has' : 's have'} no valid email.`
    : '';

  async function copyEmails() {
    if (!emails.length || copyState === 'copying') return;
    setCopyState('copying');
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  return (
    <div className="decisions-email-copy">
      <button type="button" className="decisions-copy-emails portal-control"
        aria-label={`Copy ${category} applicant emails`}
        aria-busy={copyState === 'copying'}
        disabled={!emails.length || copyState === 'copying'}
        title={emails.length ? 'Copy comma-separated emails for Gmail Bcc' : 'No valid applicant emails to copy'}
        onClick={() => void copyEmails()}>
        {copyState === 'copied' ? <CheckCircleIcon aria-hidden="true" /> : <ClipboardDocumentIcon aria-hidden="true" />}
        {copyState === 'copying' ? 'Copying…' : copyState === 'copied' ? 'Copied' : 'Copy emails'}
      </button>
      {copyState === 'copied' || missingMessage ? (
        <p className="decisions-copy-feedback portal-meta" role="status">
          {copyState === 'copied' ? `Copied ${emails.length} ${category} email${emails.length === 1 ? '' : 's'}. ` : ''}
          {missingMessage}
        </p>
      ) : null}
      {copyState === 'error' ? (
        <div className="decisions-copy-fallback">
          <p className="portal-meta" role="alert">Clipboard access failed. Select and copy the emails below.</p>
          <textarea className="portal-body" aria-label={`${decisionLabel} applicant email list`}
            readOnly value={text} onFocus={(event) => event.currentTarget.select()} />
        </div>
      ) : null}
    </div>
  );
}

function DecisionsSkeleton() {
  return (
    <div className="decisions-loading" role="status" aria-label="Loading decisions">
      <div className="decisions-loading-filters" aria-hidden="true">
        {[0, 1, 2].map((index) => <span key={index} className="portal-skeleton-block !h-8 w-28" />)}
      </div>
      <div className="portal-skeleton-block !h-8 w-72 max-w-full" aria-hidden="true" />
      <div className="decisions-loading-table" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => <div key={index} className="portal-skeleton-block !h-12" />)}
      </div>
      <span className="sr-only">Loading saved decisions.</span>
    </div>
  );
}

export default function Decisions() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDecision = searchParams.get('decision');
  const selectedDecision: ReviewDecision = requestedDecision === 'waitlist' || requestedDecision === 'reject'
    ? requestedDecision : 'accept';
  const selectedLabel = DECISIONS.find(({ value }) => value === selectedDecision)!.label;
  const [reviewerName, setReviewerName] = useState(() => getStoredGoogleProfile()?.name || getStoredGoogleProfile()?.email || '');
  // Admin actions wait for the role response, rather than a localStorage hint.
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [reviews, setReviews] = useState<ApplicationReview[]>([]);
  const [loadError, setLoadError] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError('');
    setIsAdmin(false);

    async function loadDecisions() {
      try {
        const redirectedSession = await completeGoogleSignInFromRedirect();
        const session = redirectedSession ?? await restoreGoogleSession();
        if (!isMounted) return;
        if (!session) {
          navigate('/', { replace: true });
          return;
        }
        setReviewerName(session.profile.name || session.profile.email);
        void getAdminStatus().then((status) => {
          if (isMounted) setIsAdmin(status.isAdmin);
        }).catch(() => {
          if (isMounted) {
            clearCachedAdminAccess();
            setIsAdmin(false);
          }
        });
        const [sheetData, savedReviews] = await Promise.all([
          loadApplicationSheetData(), listApplicationReviews({ fresh: true }),
        ]);
        if (!isMounted) return;
        setHeaders(sheetData.headers);
        setRows(sheetData.rows);
        setReviews(savedReviews);
      } catch (error) {
        if (isMounted) setLoadError(error instanceof Error ? error.message : 'Failed to load saved decisions.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void loadDecisions();
    return () => { isMounted = false; };
  }, [navigate, reloadVersion]);

  const groups = useMemo(() => buildDecisionGroups({ reviews, rows, headers }), [reviews, rows, headers]);
  const applicants = groups[selectedDecision];

  async function signOut() {
    try {
      await signOutFromGoogle();
      clearCachedAdminAccess();
      clearReviewCaches();
      navigate('/');
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Failed to sign out. Please try again.');
    }
  }

  return (
    <InternalShell activePath="dashboard" showAdmin={isAdmin} onSignOut={() => void signOut()}
      reviewerName={reviewerName ? `Signed in as ${reviewerName}` : undefined}>
      <main className="decisions-page">
        <header className="decisions-heading-row">
          <div>
            <p className="decisions-eyebrow">Decisions</p>
            <h1>View decisions</h1>
            <p className="decisions-description">Browse applicants by their saved decision.</p>
          </div>
          <Link to="/" className="decisions-back-link"><ArrowLeftIcon aria-hidden="true" />Back to Dashboard</Link>
        </header>
        {signOutError ? <p role="alert" className="decisions-error">{signOutError}</p> : null}
        {isLoading ? <DecisionsSkeleton /> : loadError ? (
          <section className="decisions-error-state" role="alert">
            <h2>Could not load decisions</h2>
            <p>{loadError}</p>
            <button type="button" className="decisions-retry" onClick={() => setReloadVersion((version) => version + 1)}>Try again</button>
          </section>
        ) : (
          <>
            <nav className="decisions-filters" aria-label="Decision filters">
              {DECISIONS.map(({ value, label }) => (
                <button key={value} type="button" className={`decision-filter decision-filter--${value}`}
                  aria-pressed={selectedDecision === value} aria-controls="decision-results"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set('decision', value);
                    setSearchParams(next);
                  }}>
                  {label}<span className="decision-filter-count">{groups[value].length}</span>
                </button>
              ))}
            </nav>
            <section id="decision-results" className="decisions-results" aria-labelledby="decision-results-heading">
              <div className="decisions-results-toolbar">
                <div className="decisions-results-heading">
                  <h2 id="decision-results-heading">{selectedLabel} applicants</h2>
                  <p role="status">{applicants.length} {applicants.length === 1 ? 'applicant' : 'applicants'}</p>
                </div>
                {isAdmin ? <AdminEmailCopy key={selectedDecision} applicants={applicants} decisionLabel={selectedLabel} /> : null}
              </div>
              {applicants.length ? (
                <div className="decisions-table-scroll" role="region" aria-label={`${selectedLabel} applicants table`} tabIndex={0}>
                  <table className="decisions-table">
                    <thead><tr>
                      <th scope="col">Applicant</th><th scope="col">First choice</th><th scope="col">Rating</th>
                      <th scope="col">Decision</th><th scope="col">Updated by</th><th scope="col">Application</th>
                    </tr></thead>
                    <tbody>{applicants.map((applicant) => <ApplicantRow key={applicant.applicationId} applicant={applicant} />)}</tbody>
                  </table>
                </div>
              ) : (
                <div className="decisions-empty">
                  <h3>No {selectedLabel.toLowerCase()} applicants yet</h3>
                  <p>Applicants will appear here when a {selectedDecision === 'accept' ? 'acceptance' : selectedDecision === 'waitlist' ? 'waitlist' : 'rejection'} decision is saved.</p>
                  <Link to="/review" className="decisions-review-link">Review applications</Link>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </InternalShell>
  );
}
