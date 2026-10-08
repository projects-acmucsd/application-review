import { Link } from 'react-router-dom';

interface ReviewToolbarProps {
  currentPage: number;
  filteredCount: number;
  hasNext: boolean;
  hasPrevious: boolean;
  isEditing: boolean;
  isReady: boolean;
  isSaving: boolean;
  nextHref?: string;
  previousHref?: string;
  saveComment: () => Promise<void>;
  onReset: () => void;
}

const NAV_CONTROL_CLASS =
  'portal-control portal-square-control flex h-10 min-w-24 items-center justify-center gap-1.5 px-4 transition-colors focus:outline-none';
const NAV_DISABLED_CLASS =
  'cursor-not-allowed border border-neutral-100 bg-neutral-50 text-neutral-300';

function PreviousControl({
  hasPrevious,
  isSaving,
  previousHref,
}: Pick<ReviewToolbarProps, 'hasPrevious' | 'isSaving' | 'previousHref'>) {
  if (!hasPrevious || !previousHref || isSaving) {
    return (
      <span aria-disabled="true" className={`${NAV_CONTROL_CLASS} ${NAV_DISABLED_CLASS}`}>
        <span aria-hidden="true">&larr;</span>
        Prev
      </span>
    );
  }

  return (
    <Link
      to={previousHref}
      rel="prev"
      className={`${NAV_CONTROL_CLASS} border border-blue-100 bg-white text-blue-600 hover:bg-blue-50 focus:ring-2 focus:ring-blue-300`}
    >
      <span aria-hidden="true">&larr;</span>
      Prev
    </Link>
  );
}

function NextControl({
  hasNext,
  isSaving,
  nextHref,
}: Pick<ReviewToolbarProps, 'hasNext' | 'isSaving' | 'nextHref'>) {
  if (!hasNext || !nextHref || isSaving) {
    return (
      <span aria-disabled="true" className={`${NAV_CONTROL_CLASS} ${NAV_DISABLED_CLASS}`}>
        Next
        <span aria-hidden="true">&rarr;</span>
      </span>
    );
  }

  return (
    <Link
      to={nextHref}
      rel="next"
      className={`${NAV_CONTROL_CLASS} bg-blue-400 text-white hover:bg-blue-500 focus:ring-2 focus:ring-blue-400 focus:ring-offset-2`}
    >
      Next
      <span aria-hidden="true">&rarr;</span>
    </Link>
  );
}

export function ReviewToolbar({
  currentPage,
  filteredCount,
  hasNext,
  hasPrevious,
  isEditing,
  isReady,
  isSaving,
  nextHref,
  previousHref,
  saveComment,
  onReset,
}: ReviewToolbarProps) {
  return (
    <div
      aria-label="Application navigation"
      // min-h keeps the bar a fixed height whether or not Save and Cancel show.
      className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2"
    >
      <PreviousControl
        hasPrevious={hasPrevious}
        isSaving={isSaving}
        previousHref={previousHref}
      />

      <p
        aria-live="polite"
        className="portal-label order-last w-full text-center text-neutral-500 sm:order-none sm:w-auto"
      >
        {filteredCount ? `Application ${currentPage} of ${filteredCount}` : 'Loading queue'}
      </p>

      <div className="flex items-center gap-3">
        <NextControl hasNext={hasNext} isSaving={isSaving} nextHref={nextHref} />

        {isEditing ? (
          <>
            {/* Save sits next to Next for the first time, so keep them visibly apart. */}
            <span aria-hidden="true" className="h-6 w-px bg-neutral-200" />
            <button
              disabled={isSaving}
              onClick={onReset}
              className="portal-control portal-square-control h-10 bg-neutral-100 px-4 text-neutral-600 transition-colors hover:bg-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              aria-busy={isSaving}
              disabled={isSaving || !isReady}
              onClick={() => void saveComment()}
              className="portal-control portal-square-control h-10 min-w-20 bg-[#333] px-4 text-white transition-opacity hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-[#333] focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
