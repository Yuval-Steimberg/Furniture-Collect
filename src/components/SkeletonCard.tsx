// Skeleton loader cards — shown while data is fetching. Uses the
// shimmer animation from index.css (.skeleton class not available here
// so we do it inline with Tailwind animate-pulse + bg-muted).
export function SkeletonStatCard() {
  return (
    <div className="rounded-xl p-4 sm:p-5 border border-border bg-card animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-muted flex-shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <div className="h-2.5 w-20 bg-muted rounded" />
          <div className="h-6 w-24 bg-muted rounded" />
          <div className="h-2.5 w-32 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonProjectCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 animate-pulse">
      <div className="h-4 w-48 bg-muted rounded mb-2" />
      <div className="h-3 w-32 bg-muted rounded mb-4" />
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="h-16 bg-muted rounded-lg" />
        <div className="h-16 bg-muted rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonItemRow() {
  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-md bg-muted flex-shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <div className="h-4 w-48 bg-muted rounded" />
          <div className="h-3 w-32 bg-muted rounded" />
          <div className="h-3 w-24 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}
