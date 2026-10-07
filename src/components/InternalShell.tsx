import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import acmLogo from '../assets/acm-logo.png';
import {
  getAdminStatus,
  listAdminAssignments,
  listAdminReviewers,
  listMyAssignments,
} from '../lib/adminApi';
import { loadApplicationSheetData } from '../lib/googleSheetData';
import { getReviewStats, listApplicationReviews } from '../lib/reviewApi';
import { getReviewSettings } from '../lib/settingsApi';

interface InternalShellProps {
  activePath: 'admin' | 'dashboard' | 'review';
  children: ReactNode;
  className?: string;
  onSignOut?: () => void;
  reviewerName?: string;
  showAdmin?: boolean;
}

function AcmLogoMark() {
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

function NavLink({
  active,
  label,
  onPrefetch,
  to,
}: {
  active: boolean;
  label: string;
  onPrefetch: () => void;
  to: string;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      onClick={onPrefetch}
      onFocus={onPrefetch}
      onMouseEnter={onPrefetch}
      onTouchStart={onPrefetch}
      className={`portal-nav-link${active ? ' is-active' : ''}`}
    >
      {label}
    </Link>
  );
}

function prefetchRouteData(to: string) {
  if (to === '/review') {
    void Promise.allSettled([
      loadApplicationSheetData(),
      listMyAssignments(),
      listApplicationReviews(),
    ]);
    return;
  }

  if (to === '/admin') {
    void Promise.allSettled([
      loadApplicationSheetData(),
      getReviewSettings(),
      getAdminStatus().then((status) =>
        status.isAdmin
          ? Promise.allSettled([listAdminAssignments(), listAdminReviewers()])
          : undefined,
      ),
    ]);
    return;
  }

  if (to === '/') {
    void Promise.allSettled([
      getReviewSettings(),
      getReviewStats(),
      loadApplicationSheetData(),
      listMyAssignments(),
      listApplicationReviews(),
    ]);
  }
}

export function InternalShell({
  activePath,
  children,
  className = '',
  onSignOut,
  reviewerName,
  showAdmin = false,
}: InternalShellProps) {
  const shouldShowAdmin = showAdmin || activePath === 'admin';
  const navItems = [
    { active: activePath === 'dashboard', label: 'Dashboard', to: '/' },
    { active: activePath === 'review', label: 'Applications', to: '/review' },
    ...(shouldShowAdmin
      ? [{ active: activePath === 'admin', label: 'Admin', to: '/admin' }]
      : []),
  ];

  return (
    <div className={`portal-internal-shell min-h-screen text-[#333] ${className}`}>
      <header className="portal-internal-header sticky top-0 z-40 bg-white">
        <div className="portal-header-content">
          <AcmLogoMark />
          <div className="portal-header-controls">
            <nav className="portal-nav" aria-label="Main navigation">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  active={item.active}
                  label={item.label}
                  onPrefetch={() => prefetchRouteData(item.to)}
                  to={item.to}
                />
              ))}
            </nav>
            {reviewerName ? (
              <div className="portal-reviewer-name">
                {reviewerName}
              </div>
            ) : null}
            {onSignOut ? (
              <button
                onClick={onSignOut}
                className="portal-control shrink-0 whitespace-nowrap rounded-full bg-[#333] px-4 py-2 text-white transition-all duration-200 hover:-translate-y-0.5 hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-[#333] focus:ring-offset-2 active:translate-y-0"
              >
                Sign Out
              </button>
            ) : null}
          </div>
        </div>
        <div className="h-[0.4rem] w-full bg-[linear-gradient(270deg,#ff6f6f,#f9a857_18.75%,#80ce1c_36.98%,#51c0c0_55.73%,#62b0ff_75%,#816dff)]" />
      </header>
      {children}
    </div>
  );
}
