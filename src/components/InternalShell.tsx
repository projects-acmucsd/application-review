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
      className={`relative z-10 flex h-10 min-w-[7.75rem] items-center justify-center whitespace-nowrap rounded-full px-4 text-center text-sm font-bold leading-none transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
        active
          ? 'text-blue-600'
          : 'text-neutral-500 hover:text-neutral-800'
      }`}
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
  const activeIndex = navItems.findIndex((item) => item.active);

  return (
    <div className="portal-internal-shell min-h-screen text-[#333]">
      <header className="portal-internal-header sticky top-0 z-40 bg-white">
        <div className="mx-auto flex min-h-[4.875rem] max-w-[1680px] flex-wrap items-center justify-between gap-4 px-5 py-3 lg:flex-nowrap sm:px-8">
          <AcmLogoMark />
          <div className="flex flex-wrap items-center justify-end gap-3 lg:flex-nowrap">
            <nav
              className="relative grid grid-flow-col items-center overflow-hidden rounded-full border border-neutral-200/80 bg-white p-1 shadow-sm shadow-neutral-900/5"
              style={{
                gridTemplateColumns: `repeat(${navItems.length}, 7.75rem)`,
              }}
            >
              <span
                aria-hidden="true"
                className="absolute bottom-1 top-1 rounded-full bg-blue-100 shadow-sm shadow-blue-500/10 transition-[left,opacity] duration-300 ease-out"
                style={{
                  left: `calc(0.25rem + ${Math.max(activeIndex, 0) * 7.75}rem)`,
                  opacity: activeIndex >= 0 ? 1 : 0,
                  width: '7.75rem',
                }}
              />
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
              <div className="hidden shrink-0 whitespace-nowrap rounded-full border border-blue-100/80 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-600 shadow-sm shadow-blue-500/5 sm:block">
                {reviewerName}
              </div>
            ) : null}
            {onSignOut ? (
              <button
                onClick={onSignOut}
                className="shrink-0 whitespace-nowrap rounded-full bg-[#333] px-4 py-2 text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-[#333] focus:ring-offset-2 active:translate-y-0"
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
