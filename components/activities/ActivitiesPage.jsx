'use client';

import { useEffect, useMemo, useState } from 'react';
import { mutate } from 'swr';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher } from '@/lib/api-client';
import { SkeletonTable } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import { inputClass } from '@/components/ui/Field';
import { JENIS_TRANSAKSI, LOG_LABEL } from '@/lib/constants/bkb';
import { cx, formatDateTime, formatNumber } from '@/lib/utils';

export default function ActivitiesPage() {
  const [userId, setUserId] = useState('');
  const [jenis, setJenis] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const key = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: '20' });
    if (userId) p.set('userId', userId);
    if (jenis) p.set('jenis', jenis);
    if (startDate) p.set('startDate', startDate);
    if (endDate) p.set('endDate', endDate);
    if (search) p.set('search', search);
    return `/api/activities?${p.toString()}`;
  }, [page, userId, jenis, startDate, endDate, search]);

  // Realtime: setiap baris baru di transactions_log (BKB disimpan) langsung memuat ulang daftar ini
  const { data, isLoading, error } = useRealtimeSWR(key, swrFetcher, { subscribeTables: ['transactions_log'] });

  const items = data?.data || [];
  const users = data?.users || [];
  const meta = data?.meta || { total: 0, page: 1, totalPages: 1 };
  const hasFilter = Boolean(userId || jenis || startDate || endDate || search);
  const dateOrderInvalid = Boolean(startDate && endDate && startDate > endDate);

  function resetFilters() {
    setUserId(''); setJenis(''); setStartDate(''); setEndDate(''); setSearchInput(''); setSearch(''); setPage(1);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Aktivitas Stok</h1>
        <p className="mt-1 text-sm text-slate-500">Riwayat mutasi: siapa menginput apa, kapan, dan perubahan saldonya.</p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Cari No Dok / barang / mesin..." className={`${inputClass(false, true)} lg:col-span-2`} />
          <select value={jenis} onChange={(e) => { setJenis(e.target.value); setPage(1); }} className={inputClass(false, true)}>
            <option value="">Semua Jenis</option>
            {JENIS_TRANSAKSI.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
            <option value="SA">SA — Saldo Awal</option>
            <option value="ADJ">ADJ — Koreksi Saldo</option>
          </select>
          <select value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }} className={inputClass(false, true)}>
            <option value="">Semua Pengguna</option>
            {users.map((u) => <option key={u.id} value={String(u.id)}>{u.name}</option>)}
          </select>
          {/* dua input tanggal butuh lebar sendiri; min-w-0 supaya tidak keluar dari kotak filter */}
          <div className="flex min-w-0 gap-2 sm:col-span-2">
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className={`${inputClass(false, true)} min-w-0`} aria-label="Tanggal mulai" />
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className={`${inputClass(false, true)} min-w-0`} aria-label="Tanggal akhir" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            {hasFilter ? 'Filter aktif.' : 'Tanpa filter, semua aktivitas ditampilkan.'}
            {dateOrderInvalid && <span className="text-rose-500"> Tanggal mulai melebihi tanggal akhir.</span>}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => mutate(key)} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Segarkan</button>
            {hasFilter && <button onClick={resetFilters} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Reset Filter</button>}
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-400">{formatNumber(meta.total)} mutasi ditemukan</p>

      {error ? (
        <EmptyState title="Gagal memuat data" description={error.message} />
      ) : isLoading ? (
        <SkeletonTable rows={7} />
      ) : dateOrderInvalid ? (
        <EmptyState title="Periksa rentang tanggal" description="Tanggal mulai tidak boleh lebih besar dari tanggal akhir." />
      ) : items.length === 0 ? (
        <EmptyState title={hasFilter ? 'Tidak ada hasil' : 'Belum ada aktivitas'} description={hasFilter ? 'Coba ubah filter.' : 'Mutasi akan muncul di sini setelah BKB pertama disimpan.'} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  <th className="px-4 py-3 font-medium">Waktu</th>
                  <th className="px-4 py-3 font-medium">Jenis</th>
                  <th className="px-4 py-3 font-medium">No Dokumen</th>
                  <th className="px-4 py-3 font-medium">Keterangan</th>
                  <th className="px-4 py-3 font-medium">Mesin</th>
                  <th className="px-4 py-3 font-medium">Barang</th>
                  <th className="px-4 py-3 text-right font-medium">QTY</th>
                  <th className="px-4 py-3 text-center font-medium">Saldo (Sebelum → Sesudah)</th>
                  <th className="px-4 py-3 font-medium">Aktor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {items.map((e) => (
                  <tr key={e.id} className="align-top transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{formatDateTime(e.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={e.jenis === 'ADJ' || e.jenis === 'SA' ? 'indigo' : e.direction === 'out' ? 'amber' : 'green'}>{e.jenis}</Badge>
                      <p className="mt-0.5 text-[11px] text-slate-400">{LOG_LABEL[e.jenis]}</p>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-800 dark:text-slate-100">{e.docNo || '—'}</td>
                    <td className="max-w-[180px] px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{e.keterangan || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{e.machine || '—'}</td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{e.itemCode}</p>
                      <p className="max-w-[200px] truncate text-xs text-slate-400" title={e.itemName}>{e.itemName}</p>
                    </td>
                    <td className={cx('whitespace-nowrap px-4 py-3 text-right font-semibold', e.direction === 'out' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                      {e.direction === 'out' ? '−' : '+'}{formatNumber(e.qty)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-200">
                      {formatNumber(e.balanceBefore)} → {formatNumber(e.balanceAfter)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{e.actorName || 'Sistem'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
