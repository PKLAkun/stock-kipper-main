import { cx } from '@/lib/utils';

const TONES = {
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  red: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
};

export default function Badge({ tone = 'slate', children }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', TONES[tone])}>
      {children}
    </span>
  );
}

// badge status saldo: Habis (0) / Tersedia
export function StockStatusBadge({ quantity }) {
  if (quantity <= 0) return <Badge tone="red">Habis</Badge>;
  return <Badge tone="green">Tersedia</Badge>;
}

// badge khusus role user
export function RoleBadge({ role }) {
  return <Badge tone={role === 'admin' ? 'indigo' : 'slate'}>{role === 'admin' ? 'Admin' : 'Staff'}</Badge>;
}