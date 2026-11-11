'use client';

// Form Cek Stok (buat baru atau ubah draf/ditolak). docs/ui/09-cek-stok.md.
// Jumlah fisik (opname) atau jumlah rusak/hilang, selisih dihitung di layar, analisa per baris.

import { useRef } from 'react';
import ItemAutocomplete from '@/components/bkb/ItemAutocomplete';
import { Field, inputClass } from '@/components/ui/Field';
import { cx, formatNumber } from '@/lib/utils';
import { ALASAN_LABEL, ANALISA_MIN, barisKosong, hitungSelisih } from './opnameLogic';

const fmtSelisih = (s) => (s == null ? '-' : `${s > 0 ? '+' : ''}${formatNumber(s)}`);

export default function OpnameForm({ form, setForm, errors = {}, disabled = false, alasanTerkunci = false }) {
  const seq = useRef(0);
  const opname = form.alasanJenis === 'opname';
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setLine = (key, patch) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const tambah = () => setForm((f) => ({ ...f, lines: [...f.lines, barisKosong(`n${++seq.current}`)] }));
  const hapus = (key) => setForm((f) => {
    const lines = f.lines.filter((l) => l.key !== key);
    return { ...f, lines: lines.length ? lines : [barisKosong(`n${++seq.current}`)] };
  });
  const fokusJumlah = (key) => setTimeout(() => document.querySelector(`[data-row="${key}"][data-field="jumlah"]`)?.focus(), 30);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Alasan *">
          <select
            value={form.alasanJenis} disabled={disabled || alasanTerkunci}
            onChange={(e) => set({ alasanJenis: e.target.value, lines: form.lines.map((l) => ({ ...l, jumlah: '' })) })}
            className={inputClass(false)}
          >
            {Object.entries(ALASAN_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Field>
        <Field label="Tanggal *">
          <input type="date" value={form.tanggal} disabled={disabled} onChange={(e) => set({ tanggal: e.target.value })} className={inputClass(false)} />
        </Field>
        <Field label="Catatan" hint="Opsional, maks. 500 karakter">
          <input type="text" maxLength={500} value={form.catatan} disabled={disabled} onChange={(e) => set({ catatan: e.target.value })} className={inputClass(false)} />
        </Field>
      </div>
      {alasanTerkunci && <p className="text-xs text-slate-500">Alasan tidak bisa diganti setelah draf dibuat. Untuk alasan lain, buat Cek Stok baru.</p>}

      <p className="text-sm text-slate-600 dark:text-slate-300">
        {opname
          ? 'Ketik jumlah fisik hasil hitungan. Selisih = fisik - saldo sistem. Barang yang selisihnya tidak 0 wajib diberi analisa.'
          : `Ketik jumlah barang yang ${form.alasanJenis}. Selisih = minus jumlah. Setiap baris wajib diberi analisa.`}
      </p>
      {errors.umum && <p role="alert" className="text-sm text-rose-600">{errors.umum}</p>}

      <ul className="space-y-3">
        {form.lines.map((line, i) => {
          const e = errors[line.key] || {};
          const sel = line.item ? hitungSelisih(form.alasanJenis, line.item.quantity, line.jumlah) : null;
          return (
            <li key={line.key} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-start">
                <div className="relative">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Barang {i + 1}</span>
                  <ItemAutocomplete
                    rowKey={line.key} selected={line.item} hasError={Boolean(e.item)}
                    onSelect={(item) => setLine(line.key, { item })}
                    onClear={() => setLine(line.key, { item: null })}
                    onPicked={() => fokusJumlah(line.key)}
                  />
                  {line.item && <p className="mt-1 truncate text-xs text-slate-500">{line.item.name}</p>}
                  {e.item && <p role="alert" className="mt-1 text-xs text-rose-600">{e.item}</p>}
                </div>
                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-500">Saldo sistem</span>
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm tabular-nums dark:bg-slate-800/60">
                    {line.item ? `${formatNumber(line.item.quantity)} ${line.item.unit || ''}` : '-'}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor={`jml-${line.key}`}>
                    {opname ? 'Jumlah fisik' : `Jumlah ${form.alasanJenis}`}
                  </label>
                  <input
                    id={`jml-${line.key}`} data-row={line.key} data-field="jumlah" inputMode="decimal" disabled={disabled}
                    value={line.jumlah} onChange={(ev) => setLine(line.key, { jumlah: ev.target.value })}
                    className={cx(inputClass(Boolean(e.jumlah), true), 'text-base sm:text-sm')}
                  />
                  {e.jumlah && <p role="alert" className="mt-1 text-xs text-rose-600">{e.jumlah}</p>}
                </div>
                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-500">Selisih</span>
                  <p className={cx('rounded-xl px-3 py-2 text-sm font-semibold tabular-nums', sel ? (sel < 0 ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300') : 'bg-slate-50 dark:bg-slate-800/60')}>
                    {fmtSelisih(sel)}
                  </p>
                </div>
                {!disabled && (
                  <button type="button" onClick={() => hapus(line.key)} aria-label={`Hapus baris ${i + 1}`}
                    className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm text-slate-500 hover:text-rose-600 lg:mt-5 dark:border-slate-700">
                    Hapus
                  </button>
                )}
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor={`ana-${line.key}`}>
                  Analisa {sel !== 0 || !opname ? `(wajib, minimal ${ANALISA_MIN} karakter)` : '(opsional, selisih 0)'}
                </label>
                <textarea
                  id={`ana-${line.key}`} rows={2} maxLength={500} disabled={disabled} value={line.analisa}
                  onChange={(ev) => setLine(line.key, { analisa: ev.target.value })}
                  className={cx(inputClass(Boolean(e.analisa), true), 'text-base sm:text-sm')}
                />
                {e.analisa && <p role="alert" className="mt-1 text-xs text-rose-600">{e.analisa}</p>}
              </div>
            </li>
          );
        })}
      </ul>

      {!disabled && (
        <button type="button" onClick={tambah} className="min-h-[44px] rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:border-brand-400 hover:text-brand-600 dark:border-slate-700 dark:text-slate-300">
          + Tambah barang
        </button>
      )}
    </div>
  );
}
