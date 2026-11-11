'use client';

import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher } from '@/lib/api-client';
import { formatDateTime, formatNumber } from '@/lib/utils';
import Link from 'next/link';
import StockStatus from '@/components/items/StockStatus';
import { SkeletonTable } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';

const JENIS_LABEL = {
  PB: 'pemakaian', PR: 'hasil produksi', RP: 'retur pemakaian', BTL: 'transfer keluar',
  TRM: 'transfer in', SA: 'saldo awal', ADJ: 'koreksi saldo',
};

function Icon({ d }) {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function SummaryCard({ title, value, note, icon, tone }) {
  const tones = {
    indigo: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div>
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      {note && <p className="mt-1 text-xs text-slate-400">{note}</p>}
    </div>
  );
}

export default function DashboardView({ isAdmin }) {
  const { data, isLoading, error } = useRealtimeSWR('/api/dashboard', swrFetcher, {
    subscribeTables: ['items', 'transactions_log', 'bkb'],
  });

  const dashboard = data?.data;

  // barang di bawah stok minimum, kekurangan terbesar dulu (GET /api/items, filter statusStok)
  const warn = useRealtimeSWR('/api/items?statusStok=bawah_minimum&sortBy=kekurangan&limit=100', swrFetcher, {
    subscribeTables: ['items'],
  });
  const lowItems = warn.data?.data || [];

  if (error) {
    return (
      <EmptyState
        title="Gagal memuat dashboard"
        description={error.message}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Ringkasan kondisi stok saat ini (terupdate otomatis).</p>
      </div>

      {/* kartu ringkasan */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Total Barang" value={isLoading ? '...' : formatNumber(dashboard?.totalItems)} note="Jenis barang di master" tone="indigo" icon={<Icon d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />} />
        <SummaryCard title="Raw Material (1)" value={isLoading ? '...' : formatNumber(dashboard?.rawCount)} note="Lokasi 100" tone="emerald" icon={<Icon d="M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4" />} />
        <SummaryCard title="Barang Olahan (4)" value={isLoading ? '...' : formatNumber(dashboard?.finishedCount)} note={`Lokasi 800 · ${formatNumber(dashboard?.emptyCount)} barang saldo habis`} tone="amber" icon={<Icon d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />} />
        <SummaryCard title="BKB Hari Ini" value={isLoading ? '...' : formatNumber(dashboard?.bkbToday)} note={isAdmin ? `${formatNumber(dashboard?.totalAdmin)} admin, ${formatNumber(dashboard?.totalStaff)} staff` : 'Dokumen diinput hari ini'} tone="slate" icon={<Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Peringatan Stok Minimum</h2>
          <Link href="/stok?tab=master&status=bawah_minimum" className="text-sm font-medium text-brand-600 hover:underline">Lihat semua &rsaquo;</Link>
        </div>
        <div className="p-2">
          {warn.isLoading ? (
            <SkeletonTable rows={3} />
          ) : warn.error ? (
            <div className="flex items-center justify-between px-4 py-6 text-sm text-rose-600">
              Gagal memuat peringatan stok.
              <button type="button" onClick={() => warn.mutate()} className="rounded-lg border border-rose-300 px-2 py-1 text-xs font-medium hover:bg-rose-50">Coba lagi</button>
            </div>
          ) : lowItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              Semua stok di atas batas minimum.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {lowItems.slice(0, 10).map((it) => (
                <li key={it.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-3 text-sm">
                  <p className="min-w-0 text-slate-800 dark:text-slate-100">
                    <span aria-hidden="true" className="mr-1 text-amber-600">&#9888;</span>
                    <Link href={`/stok?riwayat=${it.id}`} className="font-mono font-semibold text-brand-600 hover:underline">{it.itemCode}</Link>
                    {' '}· {it.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    Saldo {formatNumber(it.quantity)} {it.unit} · Min. {formatNumber(it.stokMinimum)} ·{' '}
                    <span className="font-semibold text-amber-700 dark:text-amber-300">Kurang {formatNumber(it.stokMinimum - it.quantity)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* aktivitas terbaru */}
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Aktivitas Terbaru</h2>
          </div>
          <div className="p-2">
            {isLoading ? (
              <SkeletonTable rows={4} />
            ) : (dashboard?.recentActivity || []).length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">Belum ada aktivitas.</div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {dashboard.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-3 py-3">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${a.direction === 'out' ? 'bg-rose-400' : 'bg-emerald-500'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700 dark:text-slate-200">
                        <span className="font-mono font-semibold">{a.docNo || a.jenis}</span>{' '}
                        <span className="text-slate-400">{JENIS_LABEL[a.jenis] || a.jenis}</span>{' '}
                        <span className="font-semibold">{a.itemCode}</span>{' '}
                        <span className={a.direction === 'out' ? 'text-rose-500' : 'text-emerald-600'}>
                          {a.direction === 'out' ? '−' : '+'}{formatNumber(a.qty)}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        Saldo {formatNumber(a.balanceBefore)} → {formatNumber(a.balanceAfter)} · {a.actorName || 'Sistem'} · {formatDateTime(a.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* stok menipis */}
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Saldo Terendah</h2>
          </div>
          <div className="p-2">
            {isLoading ? (
              <SkeletonTable rows={4} />
            ) : (dashboard?.lowestBalanceItems || []).length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">Belum ada barang di master.</div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {dashboard.lowestBalanceItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        <span className="font-mono">{item.itemCode}</span> · {item.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        Saldo KS {formatNumber(item.quantity)} {item.unit} · Lokasi {item.locationCode}
                        {item.stokMinimum ? ` · Stok min. ${formatNumber(item.stokMinimum)}` : ''}
                      </p>
                    </div>
                    <StockStatus quantity={item.quantity} stokMinimum={item.stokMinimum} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}