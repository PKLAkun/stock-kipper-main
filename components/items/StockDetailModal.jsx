'use client';

import Link from 'next/link';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import StockStatus from './StockStatus';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher } from '@/lib/api-client';
import { CATEGORIES } from '@/lib/constants/bkb';
import { formatNumber } from '@/lib/utils';

const AKSI_LABEL = { simpan: 'Buat', batal: 'Batal', saldo_awal: 'Saldo awal', koreksi: 'Koreksi' };
const fmtTanggal = (v) => new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });

// Kartu stok per nomor urut (K-21). Data dari GET /api/items/[id]/kartu.
export default function StockDetailModal({ open, onClose, item, canCorrect, onKoreksi }) {
  const key = open && item ? `/api/items/${item.id}/kartu` : null;
  const { data, error, isLoading, mutate } = useRealtimeSWR(key, swrFetcher, {
    subscribeTables: ['transactions_log', 'bkb', 'items'],
  });
  const rows = data?.data;

  if (!item) return null;

  return (
    <Modal open={open} onClose={onClose} title={`${item.itemCode} — ${item.name}`} wide>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <InfoBox label="Kategori" value={`${item.categoryCode} · ${CATEGORIES[item.categoryCode]?.label}`} />
        <InfoBox label="Lokasi" value={item.locationCode} />
        <InfoBox label="Saldo KS" value={`${formatNumber(item.quantity)} ${item.unit}`} />
        <InfoBox label="Stok Min." value={item.stokMinimum ? `${formatNumber(item.stokMinimum)} ${item.unit}` : 'Tidak diatur'} />
        <InfoBox label="Status" value={<StockStatus quantity={item.quantity} stokMinimum={item.stokMinimum} />} />
      </div>

      {canCorrect && (
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => onKoreksi(item)} className="rounded-xl border border-brand-600 px-3 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-slate-800">
            Koreksi saldo
          </button>
        </div>
      )}

      <h3 className="mb-3 mt-4 text-sm font-semibold text-slate-800 dark:text-slate-100">Riwayat Mutasi</h3>
      {error && !rows ? (
        <div role="alert" className="flex items-center gap-3 text-sm text-rose-600">
          {error.message || 'Gagal memuat riwayat.'}
          <button type="button" onClick={() => mutate()} className="rounded-lg border border-rose-300 px-2 py-1 text-xs font-medium hover:bg-rose-50">Coba lagi</button>
        </div>
      ) : isLoading && !rows ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><Spinner className="h-4 w-4" /> Memuat riwayat...</div>
      ) : !rows || rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Belum ada mutasi.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="text-slate-400">
                <th scope="col" className="pb-2 font-medium">No. Urut</th>
                <th scope="col" className="pb-2 font-medium">Tanggal</th>
                <th scope="col" className="pb-2 font-medium">No Dok</th>
                <th scope="col" className="pb-2 font-medium">Jenis</th>
                <th scope="col" className="pb-2 text-right font-medium">Keluar</th>
                <th scope="col" className="pb-2 text-right font-medium">Masuk</th>
                <th scope="col" className="pb-2 text-right font-medium">Saldo SK</th>
                <th scope="col" className="pb-2 text-right font-medium">Saldo sistem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r, i) => <KartuRow key={`${r.nomorUrut ?? 'x'}-${r.tanggal}-${i}`} r={r} />)}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function KartuRow({ r }) {
  const keluarQty = r.arah === 'out';
  const adj = r.jenis === 'ADJ' || r.jenis === 'SA';
  const jenisLabel = adj ? AKSI_LABEL[r.aksi] || r.jenis : r.aksi === 'batal' ? `${r.jenis} (Batal)` : r.jenis;
  const beda = r.saldoSk != null && r.saldoSistem != null && Number(r.saldoSk) !== Number(r.saldoSistem);
  return (
    <tr className={`align-top text-slate-700 dark:text-slate-200 ${r.berlaku ? '' : 'opacity-60'}`}>
      <td className="py-2 font-mono">{r.nomorUrut ?? '-'}</td>
      <td className="whitespace-nowrap py-2 text-slate-500">{fmtTanggal(r.tanggal)}</td>
      <td className="py-2 font-mono">
        {r.docNo ? (r.bkbId ? <Link href={`/bkb/${r.bkbId}`} className="text-brand-600 underline">{r.docNo}</Link> : r.docNo) : '—'}
        {!r.berlaku && <p className="font-sans text-[11px] text-slate-500">Tidak berlaku: {r.aksi === 'batal' ? 'pembalikan stok' : 'dibatalkan atau diganti'}</p>}
      </td>
      <td className="py-2"><Badge tone={adj ? 'indigo' : keluarQty ? 'amber' : 'green'}>{jenisLabel}</Badge></td>
      <td className="py-2 text-right tabular-nums">{keluarQty ? formatNumber(r.qty) : '-'}</td>
      <td className="py-2 text-right tabular-nums">{keluarQty ? '-' : formatNumber(r.qty)}</td>
      <td className="py-2 text-right tabular-nums">{r.aksi === 'simpan' && r.saldoSk != null ? formatNumber(r.saldoSk) : <span className="text-slate-400">Tidak ada data</span>}</td>
      <td className="py-2 text-right font-semibold tabular-nums">
        {formatNumber(r.saldoSistem)}
        {beda && <span className="ml-1 text-amber-600">Beda {formatNumber(r.saldoSk - r.saldoSistem)}</span>}
      </td>
    </tr>
  );
}

function InfoBox({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}
