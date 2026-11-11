import { cx } from '@/lib/utils';

export default function Skeleton({ className }) {
  return <div className={cx('animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800', className)} />;
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <div className="grid grid-cols-6 gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-3" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid grid-cols-6 gap-4 border-b border-slate-100 px-4 py-4 last:border-0 dark:border-slate-800">
          {Array.from({ length: 6 }).map((_, j) => (
            <Skeleton key={j} className="h-4" />
          ))}
        </div>
      ))}
    </div>
  );
}