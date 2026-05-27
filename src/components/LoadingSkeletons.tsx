function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`portal-skeleton-block ${className}`} />;
}

function SkeletonLine({ className = '' }: { className?: string }) {
  return <SkeletonBlock className={`!h-4 !rounded-sm ${className}`} />;
}

function ApplicantSummarySkeletonContent() {
  return (
    <div>
      <SkeletonLine className="w-40" />
      <SkeletonBlock className="mt-5 !h-16 !w-full !max-w-[46rem] !rounded-xl" />
      <SkeletonLine className="mt-8 w-32" />
      <SkeletonLine className="mt-3 !h-7 w-44" />
      <SkeletonLine className="mt-7 !h-9 w-40 !rounded-full" />
    </div>
  );
}

function ReviewControlsSkeletonContent() {
  return (
    <div>
      <SkeletonLine className="!h-10 w-12" />
      <SkeletonLine className="mt-3 w-32" />
      <SkeletonLine className="mt-5 !h-2 w-full !rounded-full" />
      <SkeletonLine className="mt-8 w-32" />
      <SkeletonBlock className="mt-4 !h-[9.25rem] !rounded-xl" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-full" />
      </div>
    </div>
  );
}

function AnswerRowsSkeletonContent() {
  const rows = [
    ['w-2/3', 'w-3/4'],
    ['w-1/2', 'w-full'],
    ['w-3/4', 'w-2/3'],
    ['w-1/2', 'w-5/6'],
    ['w-2/3', 'w-3/4'],
    ['w-1/2', 'w-full'],
  ];

  return (
    <div className="divide-y divide-neutral-100">
      {rows.map(([questionWidth, answerWidth], index) => (
        <div
          key={`${questionWidth}-${answerWidth}-${index}`}
          className="grid gap-4 py-5 first:pt-0 last:pb-0 md:grid-cols-[minmax(180px,0.42fr)_minmax(0,0.58fr)]"
        >
          <div>
            <SkeletonLine className={questionWidth} />
            {index % 3 === 0 ? (
              <SkeletonLine className="mt-3 w-1/2" />
            ) : null}
          </div>
          <div>
            <SkeletonLine className={answerWidth} />
            {index % 2 === 0 ? (
              <SkeletonLine className="mt-3 w-2/3" />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoginAuthSkeleton() {
  return (
    <div
      aria-label="Loading Google sign-in"
      className="h-11 rounded-2xl border border-neutral-200 bg-white p-2"
    >
      <SkeletonBlock className="!h-full !rounded-xl" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <main
      aria-label="Loading dashboard"
      className="mx-auto min-h-[calc(100vh-5.275rem)] max-w-[1500px] px-5 py-8 sm:px-8"
    >
      <section className="portal-surface p-6 sm:p-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)] lg:items-stretch">
          <div className="flex min-h-[19rem] flex-col justify-between">
            <div>
              <SkeletonLine className="w-40" />
              <SkeletonBlock className="mt-6 !h-28 w-full !max-w-[48rem] !rounded-xl" />
              <SkeletonLine className="mt-6 w-3/4 max-w-[34rem]" />
            </div>
            <SkeletonLine className="mt-8 !h-12 w-full sm:w-44" />
          </div>

          <div className="portal-row-band flex min-h-[19rem] flex-col justify-between px-6 py-7 sm:px-8">
            <div>
              <SkeletonLine className="w-24" />
              <SkeletonLine className="mt-4 !h-10 w-48" />
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between gap-4">
                <SkeletonLine className="w-24" />
                <SkeletonLine className="w-36" />
              </div>
              <SkeletonLine className="!h-2 w-full" />
            </div>
          </div>
        </div>
      </section>

      <section className="portal-surface-quiet mt-8 px-6 py-7 sm:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full max-w-2xl">
            <SkeletonLine className="!h-8 w-full max-w-md" />
            <SkeletonLine className="mt-3 w-3/4 max-w-xl" />
          </div>
          <SkeletonLine className="!h-12 w-full sm:w-28" />
        </div>
      </section>

      <section className="portal-surface-quiet mt-8 overflow-hidden">
        <div className="px-6 pb-3 sm:px-8">
          <SkeletonLine className="w-32" />
          <SkeletonLine className="mt-3 !h-8 w-64" />
        </div>
        <div className="grid divide-y divide-neutral-200/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="flex min-h-32 flex-col justify-center px-5 py-6"
            >
              <SkeletonLine className="!h-1 w-12" />
              <SkeletonLine className="!h-9 w-14" />
              <SkeletonLine className="mt-4 w-32" />
            </div>
          ))}
        </div>
      </section>

      <section className="portal-surface-quiet mt-10 px-6 py-7 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(220px,auto)] lg:items-center">
          <div className="w-full max-w-2xl">
            <SkeletonLine className="w-24" />
            <SkeletonLine className="mt-3 !h-8 w-full max-w-md" />
            <SkeletonLine className="mt-3 w-3/4 max-w-xl" />
          </div>
          <SkeletonLine className="!h-12 w-full sm:w-52" />
        </div>
      </section>
    </main>
  );
}

export function ReviewQueueSkeleton() {
  return (
    <div
      aria-label="Loading review queue"
      className="portal-surface-quiet p-5"
    >
      <SkeletonBlock className="!h-24 !rounded-xl" />
      <div className="mt-4 space-y-3">
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-3/4" />
      </div>
    </div>
  );
}

export function ReviewSummarySkeleton() {
  return (
    <div
      aria-label="Loading applicant summary"
      className="portal-surface overflow-hidden"
    >
      <div className="grid gap-6 p-6 sm:p-8 xl:grid-cols-[minmax(0,0.86fr)_minmax(460px,0.74fr)] xl:items-stretch">
        <ApplicantSummarySkeletonContent />

        <div className="min-w-0 xl:border-l xl:border-neutral-200/70 xl:pl-8">
          <ReviewControlsSkeletonContent />
        </div>
      </div>
    </div>
  );
}

export function ReviewAnswersSkeleton() {
  return (
    <article
      aria-label="Loading application answers"
      className="portal-surface-quiet overflow-hidden"
    >
      <div className="portal-row-band px-6 py-4">
        <div className="flex items-center gap-3">
          <SkeletonLine className="!h-4 !w-4 !rounded-full" />
          <div className="w-full max-w-xs">
            <SkeletonLine className="!h-8 w-44" />
            <SkeletonLine className="mt-3 w-24" />
          </div>
        </div>
      </div>
      <div className="p-6">
        <AnswerRowsSkeletonContent />
      </div>
    </article>
  );
}

export function ReviewPanelSkeleton() {
  return (
    <div
      aria-label="Loading reviewer comments"
      className="comments-section portal-surface-quiet p-6"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-stretch">
        <section className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SkeletonLine className="w-28" />
              <SkeletonLine className="mt-3 !h-8 w-44" />
            </div>
            <div className="flex gap-2">
              <SkeletonLine className="!h-10 w-20 !rounded-full" />
              <SkeletonLine className="!h-10 w-20 !rounded-full" />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {Array.from({ length: 10 }, (_, index) => (
              <SkeletonLine
                key={index}
                className="!h-8 !w-8 !rounded-full"
              />
            ))}
          </div>
          <SkeletonBlock className="mt-5 !h-56 !rounded-xl" />
        </section>

        <div className="flex min-h-56 flex-col gap-3 pt-5 lg:h-full lg:pl-6 lg:pt-0">
          <SkeletonLine className="mx-auto !h-7 w-24" />
          <SkeletonBlock className="!h-20 !rounded-xl" />
          <SkeletonBlock className="!h-20 !rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function AdminPanelSkeleton() {
  return (
    <div aria-label="Loading admin assignment panel">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.44fr)_minmax(0,1fr)] lg:items-center">
        <div className="w-full max-w-md">
          <SkeletonLine className="!h-8 w-64" />
          <div className="mt-5 flex items-center justify-between gap-4">
            <SkeletonLine className="w-24" />
            <SkeletonLine className="w-32" />
          </div>
          <SkeletonLine className="mt-3 !h-2 w-full !rounded-full" />
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:justify-end">
          <SkeletonLine className="!h-11 w-full !rounded-2xl sm:w-48" />
          <SkeletonLine className="!h-11 w-full !rounded-full sm:w-80" />
        </div>
      </div>

      <div className="portal-row-band -mx-6 mt-6 grid gap-4 px-6 py-5 lg:grid-cols-[260px_minmax(0,1fr)_180px_220px] lg:items-end">
        <div>
          <SkeletonLine className="w-20" />
          <SkeletonLine className="mt-2 !h-12 w-full !rounded-2xl" />
        </div>
        <div>
          <SkeletonLine className="w-24" />
          <SkeletonLine className="mt-2 !h-12 w-full !rounded-2xl" />
        </div>
        <div>
          <SkeletonLine className="w-24" />
          <SkeletonLine className="mt-2 !h-12 w-full !rounded-2xl" />
        </div>
        <SkeletonLine className="!h-12 w-full !rounded-2xl" />
      </div>

      <div className="-mx-6 overflow-hidden">
        <div className="portal-row-band grid grid-cols-[minmax(0,1fr)_180px_220px] gap-4 px-6 py-3">
          <SkeletonLine className="w-24" />
          <SkeletonLine className="w-28" />
          <SkeletonLine className="w-28" />
        </div>
        <div className="divide-y divide-neutral-100">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="grid gap-4 px-6 py-4 md:grid-cols-[minmax(0,1fr)_180px_220px] md:items-center"
            >
              <div>
                <SkeletonLine className="w-44" />
                <SkeletonLine className="mt-3 w-24" />
              </div>
              <SkeletonLine className="w-28" />
              <SkeletonLine className="!h-9 w-24 !rounded-full" />
            </div>
          ))}
        </div>
        <div className="portal-row-band flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <SkeletonLine className="w-56" />
          <div className="flex gap-2">
            <SkeletonLine className="!h-10 w-20 !rounded-full" />
            <SkeletonLine className="!h-10 w-20 !rounded-full" />
            <SkeletonLine className="!h-10 w-20 !rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminHeroSkeleton() {
  return (
    <section
      aria-label="Loading admin control panel"
      className="portal-surface p-6 sm:p-8"
    >
      <SkeletonLine className="w-20" />
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <SkeletonBlock className="!h-14 w-full max-w-md !rounded-xl" />
        <SkeletonLine className="!h-12 w-full !rounded-2xl sm:w-48" />
      </div>
    </section>
  );
}

export function AdminDueDateSkeleton() {
  return (
    <section
      aria-label="Loading due date settings"
      className="portal-surface-quiet p-6"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-end">
        <div>
          <SkeletonLine className="w-24" />
          <SkeletonLine className="mt-3 !h-7 w-48" />
          <SkeletonLine className="mt-3 w-44" />
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
          <SkeletonLine className="!h-12 w-full !rounded-2xl" />
          <SkeletonLine className="!h-12 w-full !rounded-2xl" />
        </div>
      </div>
    </section>
  );
}
