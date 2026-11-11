'use client';

import { cx } from '@/lib/utils';

export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  // daftar nomor halaman (maksimal ~5 dengan titik-titik)
  const pages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  if (start > 1) pages.push(1);
  if (start > 2) pages.push('...');
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (end < totalPages - 1) pages.push('...');
  if (end < totalPages) pages.push(totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className="text-sm text-slate-500">
        Halaman {page} dari {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Sebelumnya
        </button>
        {pages.map((item, index) =>
          item === '...' ? (
            <span key={`dots-${index}`} className="px-2 text-sm text-slate-400">
              ...
            </span>
          ) : (
            <button
              key={item}
              onClick={() => onChange(Number(item))}
              className={cx(
                'h-9 w-9 rounded-lg text-sm font-medium transition',
                item === page
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              )}
            >
              {item}
            </button>
          )
        )}
        <button
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}