'use client';

import { angka } from '@/lib/laporan/format';
import { cx } from '@/lib/utils';

// Kartu ringkasan di atas tabel. items: [{ label, nilai, peringatan? }]
export default function LaporanRingkasan({ items, cetak = false }) {
  if (!items?.length) return null;
  return (
    <dl className={cx('grid gap-3', cetak ? 'lap-ringkasan' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4')}>
      {items.map((it) => (
        <div
          key={it.label}
          className={cx(
            !cetak && 'rounded-xl border bg-white p-3 dark:bg-slate-900',
            !cetak && (it.peringatan && it.nilai > 0 ? 'border-rose-300 dark:border-rose-800' : 'border-slate-200 dark:border-slate-800'),
          )}
        >
          <dt className={cetak ? undefined : 'text-xs text-slate-500'}>{it.label}</dt>
          <dd className={cetak ? 'lap-ringkasan-nilai' : cx('mt-1 text-lg font-bold tabular-nums', it.peringatan && it.nilai > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-white')}>
            {angka(it.nilai) || '0'}
          </dd>
        </div>
      ))}
    </dl>
  );
}
