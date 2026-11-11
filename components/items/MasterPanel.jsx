'use client';

import { useEffect, useMemo, useState } from 'react';
import { mutate } from 'swr';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher, apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import Badge from '@/components/ui/Badge';
import StockStatus from './StockStatus';
import KoreksiSaldoDialog from './KoreksiSaldoDialog';
import { SkeletonTable } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { inputClass } from '@/components/ui/Field';
import StockFormModal from './StockFormModal';
import StockDetailModal from './StockDetailModal';
import BarcodeModal from './BarcodeModal';
import { CATEGORIES } from '@/lib/constants/bkb';
import { formatDateTime, formatNumber } from '@/lib/utils';

const SORT_OPTIONS = [
  { value: 'itemCode', label: 'Kode (A-Z)' },
  { value: 'name', label: 'Nama (A-Z)' },
  { value: 'quantity', label: 'Saldo (terkecil)' },
  { value: 'updatedAt', label: 'Terbaru berubah' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Semua status' },
  { value: 'bawah_minimum', label: 'Di bawah minimum' },
  { value: 'habis', label: 'Habis' },
];

export default function MasterPanel({ isAdmin, initialStatus = '', initialRiwayatId = null }) {
  const toast = useToast();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [statusStok, setStatusStok] = useState(STATUS_OPTIONS.some((o) => o.value === initialStatus) ? initialStatus : '');
  const [sortBy, setSortBy] = useState('itemCode');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [barcodeItem, setBarcodeItem] = useState(null);
  const [koreksiItem, setKoreksiItem] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // buka Riwayat langsung dari tautan (?riwayat=<id>), mis. dari dashboard
  useEffect(() => {
    if (!initialRiwayatId) return;
    swrFetcher(`/api/items/${initialRiwayatId}`).then((r) => setDetailItem(r.data)).catch(() => {});
  }, [initialRiwayatId]);

  const key = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: '15', sortBy });
    if (search) p.set('search', search);
    if (categoryCode) p.set('categoryCode', categoryCode);
    if (statusStok) p.set('statusStok', statusStok);
    p.set('sortOrder', sortBy === 'updatedAt' ? 'desc' : 'asc');
    return `/api/items?${p.toString()}`;
  }, [page, search, categoryCode, statusStok, sortBy]);

  const { data, isLoading, error } = useRealtimeSWR(key, swrFetcher, { subscribeTables: ['items', 'transactions_log'] });
  const items = data?.data || [];
  const meta = data?.meta || { total: 0, page: 1, totalPages: 1 };

  async function handleSaveItem(payload) {
    try {
      if (editingItem) {
        await apiFetch(`/api/items/${editingItem.id}`, { method: 'PUT', body: payload });
        toast('Perubahan berhasil disimpan.');
      } else {
        await apiFetch('/api/items', { body: payload });
        toast('Barang berhasil ditambahkan.');
      }
      setEditingItem(null);
      mutate((k) => typeof k === 'string' && k.startsWith('/api/'));
      return true;
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan barang.');
      return false;
    }
  }

  async function handleDelete() {
    if (!deletingItem) return;
    setDeleteBusy(true);
    try {
      await apiFetch(`/api/items/${deletingItem.id}`, { method: 'DELETE' });
      toast('Barang berhasil dihapus.');
      setDeletingItem(null);
      mutate((k) => typeof k === 'string' && k.startsWith('/api/'));
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus barang.');
      setDeletingItem(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Cari kode atau nama barang..."
          className={`${inputClass(false, true)} flex-1`}
        />
        <select value={categoryCode} onChange={(e) => { setCategoryCode(e.target.value); setPage(1); }} className={`${inputClass(false, true)} sm:w-48`}>
          <option value="">Semua Kategori</option>
          {Object.values(CATEGORIES).map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
        </select>
        <select value={statusStok} onChange={(e) => { setStatusStok(e.target.value); setPage(1); }} className={`${inputClass(false, true)} sm:w-44`} aria-label="Status stok">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }} className={`${inputClass(false, true)} sm:w-44`}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {isAdmin && (
          <button
            onClick={() => { setEditingItem(null); setFormOpen(true); }}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            + Tambah Barang
          </button>
        )}
      </div>

      <p className="text-sm text-slate-400">
        {formatNumber(meta.total)} barang{!isAdmin && ' · mode lihat saja (Staff)'}
      </p>

      {error ? (
        <EmptyState title="Gagal memuat data" description={error.message} />
      ) : isLoading ? (
        <SkeletonTable rows={6} />
      ) : items.length === 0 ? (
        <EmptyState
          title={search || categoryCode || statusStok ? 'Tidak ada hasil' : 'Master barang masih kosong'}
          description={search || categoryCode || statusStok ? 'Ubah kata kunci atau filter.' : isAdmin ? 'Mulai dengan menekan "Tambah Barang".' : 'Hubungi Admin untuk mengisi master barang.'}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  <th className="px-4 py-3 font-medium">Kode / Tipe</th>
                  <th className="px-4 py-3 font-medium">Barcode</th>
                  <th className="px-4 py-3 font-medium">Nama Barang</th>
                  <th className="px-4 py-3 font-medium">Kategori</th>
                  <th className="px-4 py-3 font-medium">Lokasi</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo KS</th>
                  <th className="px-4 py-3 text-right font-medium">Stok Min.</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Diubah</th>
                  <th className="px-4 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {items.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-800 dark:text-slate-100">{item.itemCode}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{item.barcode || '—'}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.name}</td>
                    <td className="px-4 py-3"><Badge tone={item.categoryCode === '1' ? 'indigo' : 'slate'}>{item.categoryCode} · {CATEGORIES[item.categoryCode]?.label}</Badge></td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.locationCode}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-slate-900 dark:text-white">{formatNumber(item.quantity)}</span>
                      <span className="text-xs text-slate-400"> {item.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                      {item.stokMinimum ? <>{formatNumber(item.stokMinimum)}<span className="text-xs text-slate-400"> {item.unit}</span></> : <span className="text-xs text-slate-400">Tidak diatur</span>}
                    </td>
                    <td className="px-4 py-3"><StockStatus quantity={item.quantity} stokMinimum={item.stokMinimum} /></td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDateTime(item.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setBarcodeItem(item)} className="rounded-lg px-2 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-50 dark:hover:bg-slate-800">Barcode</button>
                            <button onClick={() => setDetailItem(item)} className="rounded-lg px-2 py-1 text-xs font-medium text-sky-600 transition hover:bg-sky-50 dark:hover:bg-slate-800">Riwayat</button>
                        {isAdmin && (
                          <>
                            <button onClick={() => setKoreksiItem(item)} className="rounded-lg px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 dark:hover:bg-slate-800">Koreksi saldo</button>
                            <button onClick={() => { setEditingItem(item); setFormOpen(true); }} className="rounded-lg px-2 py-1 text-xs font-medium text-amber-600 transition hover:bg-amber-50 dark:hover:bg-slate-800">Edit</button>
                            <button onClick={() => setDeletingItem(item)} className="rounded-lg px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 dark:hover:bg-slate-800">Hapus</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} />
        </>
      )}

      {isAdmin && (
        <>
          <StockFormModal open={formOpen} onClose={() => { setFormOpen(false); setEditingItem(null); }} item={editingItem} onSave={handleSaveItem} onKoreksi={(it) => { setFormOpen(false); setEditingItem(null); setKoreksiItem(it); }} />
          <ConfirmDialog
            open={Boolean(deletingItem)}
            onClose={() => setDeletingItem(null)}
            onConfirm={handleDelete}
            busy={deleteBusy}
            title="Hapus Barang"
            message={`Yakin ingin menghapus "${deletingItem?.itemCode} — ${deletingItem?.name}"? Barang yang sudah pernah dipakai di BKB tidak bisa dihapus.`}
          />
        </>
      )}
      <BarcodeModal open={Boolean(barcodeItem)} onClose={() => setBarcodeItem(null)} item={barcodeItem} />
      <StockDetailModal
        open={Boolean(detailItem)} onClose={() => setDetailItem(null)} item={detailItem}
        canCorrect={isAdmin} onKoreksi={(it) => { setDetailItem(null); setKoreksiItem(it); }}
      />
      {isAdmin && (
        <KoreksiSaldoDialog
          open={Boolean(koreksiItem)} onClose={() => setKoreksiItem(null)} item={koreksiItem}
          onDone={() => { toast('Saldo berhasil dikoreksi.'); mutate((k) => typeof k === 'string' && k.startsWith('/api/')); }}
        />
      )}
    </div>
  );
}
