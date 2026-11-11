'use client';

// SK mengetik saldo akhir per barang (docs/ui/03 bagian B).
// Saldo sistem tidak tampil di sini dan tidak dikirim server selama status Menunggu.

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { formatNumber } from '@/lib/utils';
import { inputClass } from '@/components/ui/Field';
import Spinner from '@/components/ui/Spinner';
import { parseSaldoInput } from './bkbStatus';

const draftKey = (id) => `ruang-tunggu-saldo-${id}`;

function readDraft(id) {
  try { return JSON.parse(sessionStorage.getItem(draftKey(id)) || '{}'); } catch { return {}; }
}
function writeDraft(id, v) {
  try { sessionStorage.setItem(draftKey(id), JSON.stringify(v)); } catch { /* draf opsional */ }
}
function clearDraft(id) {
  try { sessionStorage.removeItem(draftKey(id)); } catch { /* draf opsional */ }
}

export default function KonfirmasiSaldo({ bkb, disabled, onDone, onBetulkan, onDetail }) {
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => { setValues(readDraft(bkb.id)); }, [bkb.id]);

  function setValue(itemId, v) {
    setValues((prev) => {
      const next = { ...prev, [itemId]: v };
      writeDraft(bkb.id, next);
      return next;
    });
    setErrors((p) => ({ ...p, [itemId]: undefined }));
  }

  async function submit() {
    if (busy || disabled) return;
    const errs = {};
    const baris = [];
    for (const l of bkb.items) {
      const r = parseSaldoInput(values[l.itemId]);
      if (r.error) errs[l.itemId] = r.error; else baris.push({ itemId: l.itemId, saldoSk: r.value });
    }
    setErrors(errs);
    const bad = Object.keys(errs);
    if (bad.length) {
      setSummary(`Ada ${bad.length} baris yang belum benar.`);
      document.getElementById(`saldo-${bkb.id}-${bad[0]}`)?.focus();
      return;
    }
    setSummary('');
    setServerError('');
    setBusy(true);
    try {
      const res = await apiFetch(`/api/bkb/${bkb.id}/konfirmasi`, { body: { baris } });
      clearDraft(bkb.id);
      onDone(res.data);
    } catch (err) {
      setServerError(err.status === 409 || err.status === 400 ? err.message : 'Saldo belum bisa diperiksa. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  const hasDraft = Object.values(values).some((v) => String(v || '').trim() !== '');

  return (
    <div className="mt-4 space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
        <li>Cek barang dan QTY sesuai barang fisik. Salah? Betulkan BKB dulu.</li>
        <li>Ketik saldo akhir tiap barang dari kartu stok Anda. Saldo sistem disembunyikan sampai Anda memeriksa.</li>
      </ol>

      <div className="space-y-2">
        {bkb.items.map((l) => {
          const id = `saldo-${bkb.id}-${l.itemId}`;
          return (
            <div key={l.id} className="grid gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-[1fr_auto_14rem] sm:items-start">
              <div className="text-sm">
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{l.itemCode}</span>
                <span className="ml-2 text-xs text-slate-500">{l.itemName}</span>
                {/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak ditampilkan lagi (K-30). */}
                {/* <p className="text-xs text-slate-500 sm:hidden">Dept {l.deptPemakaiKode || '-'} / {l.deptProsesKode || '-'}</p> */}
                <p className="text-xs text-slate-500 sm:hidden">Dept {l.deptPemakaiKode || '-'}</p>
              </div>
              <div className="text-sm tabular-nums text-slate-700 dark:text-slate-200">
                QTY <strong>{formatNumber(l.qty)}</strong> {l.unit}
                {/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak ditampilkan lagi (K-30). */}
                {/* <span className="hidden text-xs text-slate-500 sm:inline"> · {l.deptPemakaiKode || '-'} / {l.deptProsesKode || '-'}</span> */}
                <span className="hidden text-xs text-slate-500 sm:inline"> · {l.deptPemakaiKode || '-'}</span>
              </div>
              <div>
                <label htmlFor={id} className="sr-only">Saldo akhir untuk {l.itemCode}</label>
                <input
                  id={id}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Saldo akhir (kartu stok)"
                  value={values[l.itemId] ?? ''}
                  disabled={busy || disabled}
                  aria-invalid={Boolean(errors[l.itemId])}
                  onChange={(e) => setValue(l.itemId, e.target.value)}
                  className={`${inputClass(Boolean(errors[l.itemId]))} text-base sm:text-sm`}
                />
                {errors[l.itemId] && <p className="mt-1 text-xs text-rose-600">{errors[l.itemId]}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div aria-live="polite">
        {summary && <p className="text-sm text-rose-600">{summary}</p>}
        {serverError && <p role="alert" className="text-sm text-rose-600">{serverError}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onDetail}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
          Buka detail
        </button>
        <button type="button" disabled={busy || disabled}
          onClick={() => {
            if (hasDraft && !window.confirm('Isian saldo akan dibuang karena barang atau QTY bisa berubah. Lanjutkan?')) return;
            clearDraft(bkb.id);
            onBetulkan();
          }}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
          Betulkan BKB
        </button>
        <button type="button" onClick={submit} disabled={busy || disabled}
          className="ml-auto flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {busy && <Spinner className="h-4 w-4" />}
          {busy ? 'Memeriksa...' : 'Periksa saldo'}
        </button>
      </div>
    </div>
  );
}
