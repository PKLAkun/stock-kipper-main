'use client';

// Buat BKB pengganti (docs/ui/02 bagian B). Header dan dept disalin dari BKB lama (hanya baca);
// SK hanya mengubah barang dan QTY per baris. Jumlah baris sama dengan BKB lama.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { swrFetcher, apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import Spinner from '@/components/ui/Spinner';
import Skeleton from '@/components/ui/Skeleton';
import { inputClass } from '@/components/ui/Field';
import ItemAutocomplete from './ItemAutocomplete';
import { splitKeteranganExtra } from '@/components/requests/bkbStatus';
import { buildBkbBody, validateBkbForm, newIdempotencyKey, countErrors } from './bkbFormLogic';

const toItem = (l) => ({ id: l.itemId, itemCode: l.itemCode, name: l.itemName, unit: l.unit, quantity: 0 });
const draftKey = (id) => `bkb-pengganti-draft-${id}`;

// teks perubahan per baris, null bila sama dengan BKB lama
export function perubahanBaris(lama, itemId, qty) {
  const parts = [];
  if (itemId !== lama.itemId) parts.push('barang (nomor urut baru)');
  if (Number(String(qty).replace(',', '.')) !== Number(lama.qty)) parts.push('QTY');
  return parts.length ? `Diubah: ${parts.join(' dan ')}` : null;
}

export default function BkbPenggantiForm({ lamaId }) {
  const router = useRouter();
  const toast = useToast();
  const { data, error, isLoading, mutate: reload } = useSWR(`/api/bkb/${lamaId}`, swrFetcher, { revalidateOnFocus: false });
  const lama = data?.data;
  const [rows, setRows] = useState(null);
  const [errors, setErrors] = useState({});
  const [summary, setSummary] = useState('');
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const idem = useRef(newIdempotencyKey());

  useEffect(() => {
    if (!lama || rows) return;
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(draftKey(lamaId)) || 'null'); } catch { /* opsional */ }
    setRows(lama.items.map((l, i) => ({
      key: `p${l.id}`, lama: l,
      item: saved?.[i]?.item || toItem(l),
      qty: saved?.[i]?.qty ?? String(l.qty),
    })));
  }, [lama, rows, lamaId]);

  useEffect(() => {
    if (!rows) return;
    try { sessionStorage.setItem(draftKey(lamaId), JSON.stringify(rows.map((r) => ({ item: r.item, qty: r.qty })))); } catch { /* opsional */ }
  }, [rows, lamaId]);

  const changes = useMemo(
    () => (rows || []).map((r) => (r.item ? perubahanBaris(r.lama, r.item.id, r.qty) : 'Diubah: barang')),
    [rows],
  );
  const anyChange = changes.some(Boolean);
  const setRow = (key, patch) => { setRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r))); setServerError(''); };

  if (isLoading || (lama && !rows)) {
    return <div className="space-y-3"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-40 w-full rounded-2xl" /></div>;
  }
  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        BKB tidak bisa dimuat. <button type="button" onClick={() => reload()} className="font-semibold underline">Coba lagi</button>
      </div>
    );
  }
  if (!lama || lama.status !== 'selesai' || lama.digantiOlehBkbId) {
    return (
      <div className="rounded-2xl border border-slate-200 p-4 text-sm dark:border-slate-800">
        <p>{lama && ['diganti', 'dibatalkan'].includes(lama.status)
          ? 'BKB ini sudah diganti atau dibatalkan. Tidak bisa dibuatkan pengganti.'
          : 'BKB ini tidak bisa dibuatkan pengganti.'}</p>
        <Link href={`/bkb/${lamaId}`} className="mt-3 inline-block rounded-xl border border-slate-300 px-4 py-2 font-medium">Kembali ke detail BKB</Link>
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (busy || !anyChange) return;
    const { inisial, nomorUrut } = splitKeteranganExtra(lama.keteranganExtra);
    const header = {
      bkbKategori: lama.bkbKategori, bkbDate: String(lama.bkbDate).slice(0, 10), reference: '',
      tujuanKode: lama.tujuanKode, inisial, nomorUrut, machine: lama.machine || '',
    };
    const lines = rows.map((r) => ({
      key: r.key, item: r.item, qty: r.qty,
      deptPemakaiKode: r.lama.deptPemakaiKode || '',
      // [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak dikirim lagi (K-30).
      // deptProsesKode: r.lama.deptProsesKode || '',
    }));
    const tujuan = { kode: lama.tujuanKode, wajibMesin: Boolean(lama.machine), deptPemakaiKode: null };
    const errs = validateBkbForm({ header, lines, tujuan, isSK: true, today: '9999-12-31', menggantiBkbId: lama.id });
    setErrors(errs);
    const n = countErrors(errs);
    if (n) { setSummary(`Ada ${n} isian yang perlu diperbaiki.`); return; }
    setSummary('');
    setBusy(true);
    setServerError('');
    try {
      const body = buildBkbBody({ header, lines, tujuan, isSK: true, idempotencyKey: idem.current, menggantiBkbId: lama.id });
      const res = await apiFetch('/api/bkb', { body });
      toast(`BKB pengganti ${res.data.docNo} terkirim untuk ${lama.docNo}.`);
      try { sessionStorage.removeItem(draftKey(lamaId)); } catch { /* opsional */ }
      mutate((k) => typeof k === 'string' && k.startsWith('/api/bkb'));
      router.push(`/ruang-tunggu?bkb=${res.data.id}`);
    } catch (err) {
      setServerError(err.message || 'BKB pengganti belum terkirim. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">BKB lama (hanya baca)</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-slate-500">No. BKB</dt><dd className="font-mono font-semibold"><Link href={`/bkb/${lama.id}`} className="underline">{lama.docNo}</Link></dd></div>
          <div><dt className="text-xs text-slate-500">Keterangan</dt><dd>{lama.tujuanKode}</dd></div>
          <div><dt className="text-xs text-slate-500">Jenis</dt><dd>{lama.jenisKode}</dd></div>
          <div><dt className="text-xs text-slate-500">Kode keterangan</dt><dd className="font-mono">{lama.keterangan}</dd></div>
          {lama.machine && <div><dt className="text-xs text-slate-500">Mesin</dt><dd>{lama.machine}</dd></div>}
          <div><dt className="text-xs text-slate-500">Pemohon</dt><dd>{lama.dibuatOlehNama || '-'}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-slate-400">Untuk mengubah dept, mesin, atau keterangan, minta DE memakai Ubah data.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Detail Barang pengganti</h2>
        <div className="space-y-3">
          {rows.map((r, i) => {
            const eItem = errors[`items.${r.key}.itemId`];
            const eQty = errors[`items.${r.key}.qty`];
            return (
              <div key={r.key} className="grid gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800 lg:grid-cols-[5rem_1fr_16rem_6rem_8rem] lg:items-start">
                <div className="text-xs text-slate-500"><span className="lg:hidden">No. urut lama: </span>{r.lama.nomorUrut ?? '-'}</div>
                <div className="text-sm"><span className="font-mono font-semibold">{r.lama.itemCode}</span> <span className="text-xs text-slate-500">{r.lama.itemName}</span></div>
                <div>
                  <ItemAutocomplete
                    rowKey={r.key} selected={r.item} hasError={Boolean(eItem)} categoryCode={lama.bkbKategori}
                    onSelect={(item) => {
                      if (rows.some((x) => x.key !== r.key && x.item?.id === item.id)) {
                        setErrors((p) => ({ ...p, [`items.${r.key}.itemId`]: `${item.itemCode} sudah ada di daftar. Ubah QTY di baris itu.` }));
                        return;
                      }
                      setRow(r.key, { item }); setErrors((p) => ({ ...p, [`items.${r.key}.itemId`]: undefined }));
                    }}
                    onClear={() => setRow(r.key, { item: null })}
                  />
                  {eItem && <p role="alert" className="mt-1 text-xs text-rose-600">{eItem}</p>}
                </div>
                <div className="text-xs text-slate-500"><span className="lg:hidden">QTY lama: </span>{r.lama.qty} {r.lama.unit}</div>
                <div>
                  <input aria-label={`QTY pengganti baris ${i + 1}`} inputMode="decimal" value={r.qty}
                    onChange={(e) => setRow(r.key, { qty: e.target.value })} className={inputClass(Boolean(eQty), true)} />
                  {eQty && <p className="mt-1 text-xs text-rose-600">{eQty}</p>}
                </div>
                {changes[i] && <p className="text-xs font-medium text-amber-700 dark:text-amber-300 lg:col-span-5">&#9998; {changes[i]}</p>}
              </div>
            );
          })}
        </div>
      </section>

      <div className="space-y-2" aria-live="polite">
        {summary && <p className="text-sm text-rose-600">{summary}</p>}
        {serverError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{serverError}</p>}
        {!anyChange && <p className="text-xs text-slate-500">Belum ada perubahan dari BKB lama.</p>}
        <div className="flex justify-end gap-2">
          <Link href={`/bkb/${lama.id}`} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium">Kembali</Link>
          <button type="submit" disabled={busy || !anyChange}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
            {busy && <Spinner className="h-4 w-4" />}
            {busy ? 'Mengirim...' : 'Kirim BKB pengganti'}
          </button>
        </div>
      </div>
    </form>
  );
}
