'use client';

// Betulkan BKB oleh SK (docs/ui/03 bagian D). PUT /api/bkb/[id]; status kembali Menunggu.
// Tujuan, jenis, dan mesin tidak diubah di sini: dikirim ulang apa adanya.

import { useState } from 'react';
import useSWR from 'swr';
import { apiFetch, swrFetcher } from '@/lib/api-client';
import { inputClass } from '@/components/ui/Field';
import Spinner from '@/components/ui/Spinner';
import ItemAutocomplete from '@/components/bkb/ItemAutocomplete';
import { splitKeteranganExtra } from './bkbStatus';

let seq = 0;
const newKey = () => `b${++seq}`;

export default function BetulkanBkb({ bkb, onSaved, onCancel }) {
  const { data: pemakai } = useSWR('/api/parameter/dept-pemakai?aktif=1', swrFetcher);
  // [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak dipakai lagi (K-30).
  // const { data: proses } = useSWR('/api/parameter/dept-proses?aktif=1', swrFetcher);
  const [lines, setLines] = useState(() => bkb.items.map((l) => ({
    key: newKey(),
    item: { id: l.itemId, itemCode: l.itemCode, name: l.itemName, unit: l.unit, quantity: 0 },
    qty: String(l.qty),
    deptPemakaiKode: l.deptPemakaiKode || '',
    deptProsesKode: l.deptProsesKode || '',
  })));
  const [pihakNama, setPihakNama] = useState(bkb.pihakNama || '');
  const [pihakDept, setPihakDept] = useState(bkb.pihakDept || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const setLine = (key, patch) => setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const nonOperator = bkb.sumber === 'non_operator';

  async function simpan() {
    if (busy) return;
    const qtyBad = lines.some((l) => !(Number(String(l.qty).replace(',', '.')) > 0));
    if (lines.length === 0 || lines.some((l) => !l.item) || qtyBad) {
      setError('Setiap baris butuh barang dan QTY lebih dari 0.');
      return;
    }
    if (nonOperator && !pihakNama.trim() && !bkb.menggantiBkbId) {
      setError('Nama pihak wajib diisi.');
      return;
    }
    const { inisial, nomorUrut } = splitKeteranganExtra(bkb.keteranganExtra);
    const body = {
      bkbKategori: bkb.bkbKategori,
      bkbDate: String(bkb.bkbDate).slice(0, 10),
      reference: bkb.reference || '',
      tujuanKode: bkb.tujuanKode,
      inisial,
      nomorUrut,
      machine: bkb.machine || '',
      pihakNama: nonOperator ? pihakNama : undefined,
      pihakDept: nonOperator ? pihakDept : undefined,
      items: lines.map((l) => ({
        itemId: l.item.id,
        qty: Number(String(l.qty).replace(',', '.')),
        deptPemakaiKode: l.deptPemakaiKode || undefined,
        // [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak dikirim lagi (K-30); SQL mempertahankan nilai lama baris.
        // deptProsesKode: l.deptProsesKode || undefined,
      })),
    };
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/bkb/${bkb.id}`, { method: 'PUT', body });
      onSaved();
    } catch (err) {
      setError(err.message || 'Perbaikan belum tersimpan. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  const options = (list, empty) => (
    <>
      <option value="">{empty}</option>
      {(list?.data || []).map((p) => <option key={p.kode} value={p.kode}>{p.kode} - {p.nama}</option>)}
    </>
  );

  return (
    <div className="mt-4 space-y-3">
      {bkb.status === 'ditahan' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          BKB ini ditahan karena saldo tidak cocok. Setelah disimpan, ketik saldo akhir lagi.
        </p>
      )}

      <div className="space-y-2">
        {lines.map((l) => (
          <div key={l.key} className="grid gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-[1fr_7rem_10rem_auto] sm:items-center">
            <ItemAutocomplete
              rowKey={l.key}
              selected={l.item}
              categoryCode={bkb.bkbKategori}
              onSelect={(item) => setLine(l.key, { item })}
              onClear={() => setLine(l.key, { item: null })}
            />
            <input aria-label="QTY" inputMode="decimal" value={l.qty} disabled={busy}
              onChange={(e) => setLine(l.key, { qty: e.target.value })} className={`${inputClass(false)} text-right`} />
            <select aria-label="Dept Pemakai" value={l.deptPemakaiKode} disabled={busy}
              onChange={(e) => setLine(l.key, { deptPemakaiKode: e.target.value })} className={inputClass(false)}>
              {options(pemakai, 'Dept pemakai')}
            </select>
            {/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak ditampilkan lagi; baris lama tetap menyimpan nilainya di database (K-30). */}
            {/* <select aria-label="Dept Proses" value={l.deptProsesKode} disabled={busy}
              onChange={(e) => setLine(l.key, { deptProsesKode: e.target.value })} className={inputClass(false)}>
              {options(proses, 'Dept proses')}
            </select> */}
            <button type="button" disabled={busy || lines.length === 1} aria-label="Hapus baris"
              onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
              className="rounded-lg px-2 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:hover:bg-rose-950/40">
              Hapus
            </button>
          </div>
        ))}
        <button type="button" disabled={busy}
          onClick={() => setLines((p) => [...p, { key: newKey(), item: null, qty: '', deptPemakaiKode: '', deptProsesKode: '' }])}
          className="rounded-xl border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          + Tambah baris
        </button>
      </div>

      {nonOperator && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input aria-label="Nama pihak" placeholder="Nama pihak" value={pihakNama} disabled={busy}
            onChange={(e) => setPihakNama(e.target.value)} className={inputClass(false)} />
          <input aria-label="Departemen pihak" placeholder="Departemen pihak" value={pihakDept} disabled={busy}
            onChange={(e) => setPihakDept(e.target.value)} className={inputClass(false)} />
        </div>
      )}

      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
          Batal
        </button>
        <button type="button" onClick={simpan} disabled={busy}
          className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {busy && <Spinner className="h-4 w-4" />}
          Simpan perbaikan
        </button>
      </div>
    </div>
  );
}
