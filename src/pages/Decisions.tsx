import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, ArrowRightIcon, ChevronDownIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon, ClockIcon, XCircleIcon } from '@heroicons/react/20/solid';

import { InternalShell } from '../components/InternalShell';
import { clearCachedAdminAccess, getAdminStatus } from '../lib/adminApi';
import { buildDecisionEmailGroups, buildDecisionGroups, filterDecisionApplicantsBySearch, type DecisionApplicant, type DecisionEmailGroup } from '../lib/decisionApplicants';
import { readApplicantSearch, writeApplicantSearch } from '../lib/applicationFilters';
import { ApplicantSearchField } from '../components/ApplicantSearchField';
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
  const groups = useMemo(
    () => buildDecisionEmailGroups(applicants), [applicants],
  );
  const [open, setOpen] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState<number>();
  const [result, setResult] = useState<{
    status: 'copying' | 'copied' | 'error';
    group: DecisionEmailGroup;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const openAtEnd = useRef(false);
  const menuId = useId();
  const category = decisionLabel.toLowerCase();
  const copying = result?.status === 'copying';
  const { missingEmailCount } = result?.group ?? groups[0];
  const missingMessage = missingEmailCount > 0
    ? `${missingEmailCount} applicant${missingEmailCount === 1 ? ' has' : 's have'} no valid email.`
    : '';

  useLayoutEffect(() => {
    if (!open) return;
    const fitMenu = () => {
      const top = menu.current?.getBoundingClientRect().top;
      if (top !== undefined) setMenuMaxHeight(Math.min(416, Math.max(88, window.innerHeight - top - 16)));
    };
    fitMenu();
    const items = menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    (openAtEnd.current ? items?.[items.length - 1] : items?.[0])?.focus();
    const dismissOutside = (event: PointerEvent) => {
      if (root.current && !event.composedPath().includes(root.current)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    window.addEventListener('resize', fitMenu);
    window.addEventListener('scroll', fitMenu, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      window.removeEventListener('resize', fitMenu);
      window.removeEventListener('scroll', fitMenu, true);
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
    trigger.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  }

  async function copyEmails(group: DecisionEmailGroup) {
    if (!group.emails.length || copying) return;
    closeMenu();
    setResult({ status: 'copying', group });
    try {
      await navigator.clipboard.writeText(group.text);
      setResult({ status: 'copied', group });
    } catch {
      setResult({ status: 'error', group });
    }
  }

  return (
    <div ref={root} className="decisions-email-copy" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <div className="decisions-copy-anchor">
        <button ref={trigger} type="button" className="decisions-copy-emails portal-control"
          aria-label={`Copy ${category} applicant emails`}
          aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
          aria-busy={copying} disabled={!groups[0].emails.length || copying}
          title={groups[0].emails.length ? 'Choose applicant emails to copy for Gmail Bcc' : 'No valid applicant emails to copy'}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              openAtEnd.current = event.key === 'ArrowUp';
              setOpen(true);
            }
          }}
          onClick={() => {
            openAtEnd.current = false;
            setOpen((value) => !value);
          }}>
          {result?.status === 'copied' ? <CheckCircleIcon aria-hidden="true" /> : <ClipboardDocumentIcon aria-hidden="true" />}
          {copying ? 'Copying…' : 'Copy emails'}
          <ChevronDownIcon aria-hidden="true" />
        </button>
        {open ? (
          <div ref={menu} id={menuId} role="menu" aria-labelledby={`${menuId}-heading`}
            className="decisions-copy-menu" style={{ maxHeight: menuMaxHeight }} onKeyDown={onMenuKeyDown}>
            <p id={`${menuId}-heading`} className="decisions-copy-menu-heading">Copy {category} emails</p>
            {groups.map((group) => (
              <button key={group.key} type="button" role="menuitem" tabIndex={-1}
                className="decisions-copy-menu-item" disabled={!group.emails.length}
                aria-label={`${group.label}: copy ${group.emails.length} ${category} email${group.emails.length === 1 ? '' : 's'}`}
                onClick={() => void copyEmails(group)}>
                <span>{group.label}</span><span className="decisions-copy-menu-count">{group.emails.length}</span>
              </button>
            ))}
            <p className="decisions-copy-menu-footer">Choose a group to copy</p>
          </div>
        ) : null}
      </div>
      {!open && (result?.status === 'copied' || missingMessage) ? (
        <p className="decisions-copy-feedback portal-meta" role="status">
          {result?.status === 'copied'
            ? `Copied ${result.group.emails.length} ${category}${result.group.key === 'all' ? '' : ` ${result.group.label}`} email${result.group.emails.length === 1 ? '' : 's'}. ` : ''}
          {missingMessage}
        </p>
      ) : null}
      {!open && result?.status === 'error' ? (
        <div className="decisions-copy-fallback">
          <p className="portal-meta" role="alert">Clipboard access failed. Select and copy the {category}{result.group.key === 'all' ? '' : ` ${result.group.label}`} emails below.</p>
          <textarea className="portal-body" aria-label={`${decisionLabel} ${result.group.label} email list`}
            readOnly value={result.group.text} onFocus={(event) => event.currentTarget.select()} />
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
  const appliedSearch = readApplicantSearch(searchParams);
  // Local input with a debounced push, matching the review queue. See its comments.
  const [searchInput, setSearchInput] = useState(appliedSearch);
  const pushedSearch = useRef(appliedSearch);
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
  // Search every bucket, so the tab counts reveal which decision a name landed in.
  const searchedGroups = useMemo(() => ({
    accept: filterDecisionApplicantsBySearch(groups.accept, appliedSearch),
    waitlist: filterDecisionApplicantsBySearch(groups.waitlist, appliedSearch),
    reject: filterDecisionApplicantsBySearch(groups.reject, appliedSearch),
  }), [groups, appliedSearch]);
  const applicants = searchedGroups[selectedDecision];

  useEffect(() => {
    if (appliedSearch !== pushedSearch.current) {
      pushedSearch.current = appliedSearch;
      setSearchInput(appliedSearch);
    }
  }, [appliedSearch]);

  useEffect(() => {
    if (searchInput.trim() === appliedSearch) return;
    const timer = setTimeout(() => {
      pushedSearch.current = searchInput.trim();
      // No pager on this page, so pass a null page and leave q and application alone.
      setSearchParams(writeApplicantSearch(searchParams, searchInput, null), { replace: true });
    }, 200);
    return () => clearTimeout(timer);
  }, [appliedSearch, searchInput, searchParams, setSearchParams]);

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
                  {label}<span className="decision-filter-count">{searchedGroups[value].length}</span>
                </button>
              ))}
            </nav>
            <section id="decision-results" className="decisions-results" aria-labelledby="decision-results-heading">
              <div className="decisions-results-toolbar">
                <div className="decisions-results-heading">
                  <h2 id="decision-results-heading">{selectedLabel} applicants</h2>
                  <p role="status">
                    {appliedSearch
                      ? `${applicants.length} of ${groups[selectedDecision].length} match "${appliedSearch}"`
                      : `${applicants.length} ${applicants.length === 1 ? 'applicant' : 'applicants'}`}
                  </p>
                </div>
                <ApplicantSearchField className="decisions-search" inputClassName="decisions-search-input"
                  value={searchInput} onChange={setSearchInput} />
                {/* Copy groups use the whole decision bucket, independently of name search. */}
                {isAdmin ? <AdminEmailCopy key={selectedDecision} applicants={groups[selectedDecision]} decisionLabel={selectedLabel} /> : null}
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
                  {appliedSearch ? (
                    <>
                      <h3>No {selectedLabel.toLowerCase()} applicants match "{appliedSearch}"</h3>
                      <p>Check the other decisions above, or clear the search to see everyone.</p>
                      <button type="button" className="decisions-review-link" onClick={() => setSearchInput('')}>Clear search</button>
                    </>
                  ) : (
                    <>
                      <h3>No {selectedLabel.toLowerCase()} applicants yet</h3>
                      <p>Applicants will appear here when a {selectedDecision === 'accept' ? 'acceptance' : selectedDecision === 'waitlist' ? 'waitlist' : 'rejection'} decision is saved.</p>
                      <Link to="/review" className="decisions-review-link">Review applications</Link>
                    </>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </InternalShell>
  );
}
