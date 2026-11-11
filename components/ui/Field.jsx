export function Field({ label, hint, error, children, className = '' }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export function inputClass(hasError, compact = false) {
  return (
    `w-full rounded-xl border bg-white text-sm outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ` +
    `dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800/50 ` +
    (compact ? 'px-2.5 py-2 ' : 'px-3.5 py-2.5 ') +
    (hasError
      ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-400/30'
      : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500/30 dark:border-slate-700')
  );
}
