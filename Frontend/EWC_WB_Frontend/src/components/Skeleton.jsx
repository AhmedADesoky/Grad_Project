import React from 'react';

export function Skeleton({ className = '' }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl ${className}`}
      style={{
        isolation: 'isolate',
        backgroundColor: 'rgba(148, 163, 184, 0.18)',  /* slate-400 at low opacity — visible on any light bg */
      }}
    >
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
          animation: 'skeleton-shimmer 1.6s ease-in-out infinite',
        }}
      />
    </div>
  );
}

/* inject the keyframe once into the document — no extra CSS file needed */
if (typeof document !== 'undefined' && !document.getElementById('skeleton-kf')) {
  const s = document.createElement('style');
  s.id = 'skeleton-kf';
  s.textContent = `
    @keyframes skeleton-shimmer {
      0%   { background-position: -200% 0; }
      100% { background-position:  200% 0; }
    }
  `;
  document.head.appendChild(s);
}

// Pre-built skeletons for common layouts
export function PlanSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-3xl border border-slate-200 bg-white/70 p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-4">
          <Skeleton className="w-16 h-16 rounded-2xl flex-shrink-0" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-5 w-40 rounded-lg" />
            <Skeleton className="h-3.5 w-60 rounded-lg" />
            <Skeleton className="h-3 w-32 rounded-lg" />
          </div>
          <div className="hidden sm:flex gap-2">
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-9 w-24 rounded-xl" />
          </div>
        </div>
        {/* Progress bar hint */}
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-20 rounded-lg" />
            <Skeleton className="h-3 w-10 rounded-lg" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      </div>

      {/* Period tabs */}
      <div className="flex gap-2 overflow-hidden">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-9 w-24 rounded-xl flex-shrink-0" />)}
      </div>

      {/* Day tabs */}
      <div className="flex gap-2 overflow-hidden">
        {[0,1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-8 w-16 rounded-xl flex-shrink-0" />)}
      </div>

      {/* Task cards — staggered heights to feel realistic */}
      <div className="space-y-3">
        {[
          { title: 'w-52', sub: 'w-72' },
          { title: 'w-40', sub: 'w-56' },
          { title: 'w-60', sub: 'w-64' },
        ].map(({ title, sub }, i) => (
          <div key={i} className="rounded-3xl border border-slate-200 bg-white/70 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Skeleton className="w-9 h-9 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className={`h-4 ${title} rounded-lg`} />
                <Skeleton className={`h-3 ${sub} rounded-lg`} />
              </div>
              <Skeleton className="h-8 w-20 rounded-xl flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stat cards row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="rounded-3xl border border-border/30 bg-card/80 p-5 space-y-3">
            <div className="flex justify-between items-start">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="w-9 h-9 rounded-2xl" />
            </div>
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-2.5 w-full rounded-full" />
          </div>
        ))}
      </div>

      {/* Chart cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1,2].map(i => (
          <div key={i} className="rounded-3xl border border-border/30 bg-card/80 p-6 space-y-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-[200px] w-full rounded-2xl" />
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="rounded-3xl border border-border/30 bg-card/80 p-6 space-y-4">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-20" />
        </div>
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex items-center gap-4 py-2 border-t border-border/20">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-5 w-10 rounded-full" />
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-14 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PDFHistorySkeleton() {
  return (
    <div className="space-y-3">
      {[1,2,3,4,5].map(i => (
        <div key={i} className="rounded-2xl border border-border/40 bg-card/80 p-4 sm:p-5 flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-36" />
            <div className="grid grid-cols-3 gap-1.5 max-w-[200px] mt-1">
              {[1,2,3].map(j => <Skeleton key={j} className="h-2 rounded-full" />)}
            </div>
          </div>
          <Skeleton className="hidden sm:block h-8 w-10 rounded-xl" />
          <Skeleton className="w-4 h-4 rounded" />
        </div>
      ))}
    </div>
  );
}
