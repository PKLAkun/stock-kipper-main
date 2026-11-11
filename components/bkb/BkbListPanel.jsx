'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR, { mutate } from 'swr';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher } from '@/lib/api-client';
import { SkeletonTable } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import { inputClass } from '@/components/ui/Field';
import { directionOf } from '@/lib/constants/bkb';
import { STATUS_META } from '@/components/requests/bkbStatus';
import { STATUS_FILTER_OPTIONS } from './bkbAksi';
import { formatNumber } from '@/lib/utils';

const formatDate = (d) => (d ? d.split('-').reverse().join('/') : '-');

// Baris yang dibuka: ringkasan daftar tidak membawa barang, jadi diambil dari detail saat dibuka.
function BarisDetail({ id, role }) {
  const { data, error } = useSWR(`/api/bkb/${id}`, swrFetcher);
  const bkb = data?.data;
  const lihatSaldo = role !== 'operator';
  if (error) return <p className="text-xs text-rose-600">Barang tidak bisa dimuat.</p>;
  if (!bkb) return <p className="text-xs text-slate-400">Memuat barang...</p>;
  return (
    <>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400">
            {lihatSaldo && <th scope="col" className="pb-1 font-medium">No. urut</th>}
            <th scope="col" className="pb-1 font-medium">Kode</th>
            <th scope="col" className="pb-1 font-medium">Nama Barang</th>
            <th scope="col" className="pb-1 text-right font-medium">QTY</th>
            <th scope="col" className="pb-1 pl-4 font-medium">Dept Pemakai</th>
            {/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak ditampilkan lagi (K-30). */}
            {/* <th scope="col" className="pb-1 font-medium">Dept Proses</th> */}
            {lihatSaldo && <th scope="col" className="pb-1 text-right font-medium">Saldo akhir SK</th>}
            {lihatSaldo && <th scope="col" className="pb-1 text-right font-medium">Saldo sistem</th>}
          </tr>
        </thead>
        <tbody>
          {bkb.items.map((line) => (
            <tr key={line.id} className="text-slate-700 dark:text-slate-200">
              {lihatSaldo && <td className="py-1 font-mono">{bkb.status === 'selesai' ? line.nomorUrut ?? '-' : '-'}</td>}
              <td className="py-1 font-mono font-semibold">{line.itemCode}</td>
              <td className="py-1">{line.itemName}</td>
              <td className="py-1 text-right font-semibold">{formatNumber(line.qty)} <span className="font-normal text-slate-400">{line.unit}</span></td>
              <td className="py-1 pl-4">{line.deptPemakaiKode}</td>
              {/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak ditampilkan lagi (K-30). */}
              {/* <td className="py-1">{line.deptProsesKode}</td> */}
              {lihatSaldo && <td className="py-1 text-right">{bkb.status === 'selesai' && line.saldoSk != null ? formatNumber(line.saldoSk) : '-'}</td>}
              {lihatSaldo && <td className="py-1 text-right">{bkb.status === 'selesai' && line.saldoSetelah != null ? formatNumber(line.saldoSetelah) : '-'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[11px] text-slate-400">Diinput oleh {bkb.dibuatOlehNama || '—'}</p>
        <Link href={`/bkb/${id}`} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-white dark:border-slate-700 dark:text-brand-300 dark:hover:bg-slate-800">Buka detail</Link>
      </div>
    </>
  );
}

const urlParam = (name) => {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(name) || '';
};

export default function BkbListPanel({ role = 'admin' }) {
  const [searchInput, setSearchInput] = useState(() => urlParam('cari'));
  const [search, setSearch] = useState(() => urlParam('cari'));
  const [status, setStatus] = useState(() => (STATUS_FILTER_OPTIONS.some((o) => o.value === urlParam('status')) ? urlParam('status') : ''));
  const [startDate, setStartDate] = useState(() => urlParam('mulai'));
  const [endDate, setEndDate] = useState(() => urlParam('akhir'));
  const [page, setPage] = useState(() => Math.max(1, Number(urlParam('hal')) || 1));
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const key = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: '15' });
    if (search) p.set('search', search);
    if (status) p.set('status', status);
    if (startDate) p.set('startDate', startDate);
    if (endDate) p.set('endDate', endDate);
    return `/api/bkb?${p.toString()}`;
  }, [page, search, status, startDate, endDate]);

  // filter dan halaman disimpan di URL supaya Kembali dari detail mengembalikannya
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const set = (k, v) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
      set('cari', search); set('status', status); set('mulai', startDate); set('akhir', endDate); set('hal', page > 1 ? String(page) : '');
      window.history.replaceState(null, '', u);
    } catch { /* abaikan */ }
  }, [search, status, startDate, endDate, page]);

  const { data, isLoading, error } = useRealtimeSWR(key, swrFetcher, { subscribeTables: ['bkb', 'transactions_log'] });
  const rows = data?.data || [];
  const meta = data?.meta || { total: 0, page: 1, totalPages: 1 };
  const invalidRange = Boolean(startDate && endDate && startDate > endDate);

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 dark:border-slate-800 dark:bg-slate-900">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Cari No Dokumen / keterangan / mesin..."
          className={`${inputClass(false, true)} lg:col-span-2`}
        />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={inputClass(false, true)} aria-label="Status">
          {STATUS_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className={inputClass(false, true)} aria-label="Tanggal mulai" />
        <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className={inputClass(false, true)} aria-label="Tanggal akhir" />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{formatNumber(meta.total)} BKB ditemukan</p>
        <button
          onClick={() => mutate(key)}
          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Segarkan
        </button>
      </div>

      {error ? (
        <EmptyState title="Gagal memuat BKB" description={error.message} action={<button type="button" onClick={() => mutate(key)} className="mt-4 rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100">Coba lagi</button>} />
      ) : isLoading ? (
        <SkeletonTable rows={6} />
      ) : invalidRange ? (
        <EmptyState title="Periksa rentang tanggal" description="Tanggal mulai tidak boleh lebih besar dari tanggal akhir." />
      ) : rows.length === 0 ? (
        search || status || startDate || endDate ? (
          <EmptyState title="Tidak ada BKB yang cocok" action={<button type="button" onClick={() => { setSearchInput(''); setSearch(''); setStatus(''); setStartDate(''); setEndDate(''); setPage(1); }} className="mt-4 rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100">Hapus filter</button>} />
        ) : (
          <EmptyState title="Belum ada BKB" description="BKB akan muncul di sini setelah dibuat." />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  <th scope="col" className="w-10 px-3 py-3"><span className="sr-only">Buka</span></th>
                  <th className="px-3 py-3 font-medium">No Dokumen</th>
                  <th className="px-3 py-3 font-medium">Jenis</th>
                  <th className="px-3 py-3 font-medium">Tanggal</th>
                  <th className="px-3 py-3 font-medium">Keterangan</th>
                  <th className="px-3 py-3 text-center font-medium">Item</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900">
                {rows.map((bkb) => {
                  const isOpen = expanded.has(bkb.id);
                  return (
                    <Fragment key={bkb.id}>
                      <tr className="border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-3 text-slate-400">
                          <button type="button" aria-expanded={isOpen} aria-label={`${isOpen ? 'Tutup' : 'Buka'} barang ${bkb.docNo}`} onClick={() => toggle(bkb.id)} className="px-1">{isOpen ? '▾' : '▸'}</button>
                        </td>
                        <td className="px-3 py-3 font-mono font-semibold text-slate-800 dark:text-slate-100"><Link href={`/bkb/${bkb.id}`} className="hover:underline">{bkb.docNo}</Link></td>
                        <td className="px-3 py-3"><Badge tone={directionOf(bkb.jenisKode) === 'out' ? 'amber' : 'green'}>{bkb.jenisKode}</Badge></td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600 dark:text-slate-300">{formatDate(bkb.bkbDate)}</td>
                        <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{bkb.keterangan}</td>
                        <td className="px-3 py-3 text-center text-slate-500">{bkb.jumlahBaris}</td>
                        <td className="px-3 py-3"><Badge tone={(STATUS_META[bkb.status] || {}).tone || 'slate'}>{(STATUS_META[bkb.status] || {}).label || bkb.status}</Badge></td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40">
                          <td />
                          <td colSpan={7} className="px-3 py-3">
                            <BarisDetail id={bkb.id} role={role} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
