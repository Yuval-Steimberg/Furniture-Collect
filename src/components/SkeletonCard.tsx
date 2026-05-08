// Skeleton loader cards — shown while data fetches.
// Uses the .shimmer utility from index.css for a premium wave effect.

function Bone({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-md ${className}`} />;
}

export function SkeletonStatCard() {
  return (
    <div className="rounded-xl p-4 sm:p-5 border border-border bg-card overflow-hidden">
      <div className="flex items-start gap-3">
        <Bone className="h-9 w-9 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2.5 min-w-0 pt-0.5">
          <Bone className="h-2.5 w-20" />
          <Bone className="h-6 w-24" />
          <Bone className="h-2 w-32" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonProjectCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 space-y-2">
          <Bone className="h-4 w-40" />
          <Bone className="h-3 w-28" />
        </div>
        <Bone className="h-10 w-10 rounded-lg flex-shrink-0" />
      </div>
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/50">
        <Bone className="h-12 rounded-lg" />
        <Bone className="h-12 rounded-lg" />
        <Bone className="h-12 rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonItemRow() {
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 overflow-hidden">
      <div className="flex gap-3">
        <Bone className="h-16 w-16 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2.5 min-w-0 pt-0.5">
          <Bone className="h-4 w-48" />
          <Bone className="h-3 w-32" />
          <div className="flex gap-2 pt-0.5">
            <Bone className="h-5 w-16 rounded-full" />
            <Bone className="h-5 w-14 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonListRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0">
      <Bone className="h-8 w-8 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Bone className="h-3.5 w-36" />
        <Bone className="h-2.5 w-24" />
      </div>
      <Bone className="h-6 w-16 rounded-full" />
    </div>
  );
}
