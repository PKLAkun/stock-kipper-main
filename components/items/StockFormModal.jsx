'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import { Field, inputClass } from '@/components/ui/Field';
import { itemSchema, itemUpdateSchema } from '@/lib/validations/items';
import { CATEGORIES, locationForCategory } from '@/lib/constants/bkb';
import { formatNumber } from '@/lib/utils';

const COMMON_UNITS = ['pcs', 'kg', 'gram', 'sak', 'karung', 'roll', 'meter', 'liter', 'box', 'pak'];
const EMPTY_FORM = { categoryCode: '1', itemCode: '', barcode: '', name: '', unit: 'pcs', quantity: 0, stokMinimum: '' };

export default function StockFormModal({ open, onClose, item, onSave, onKoreksi }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(item
      ? { categoryCode: item.categoryCode, itemCode: item.itemCode, barcode: item.barcode || '', name: item.name, unit: item.unit, quantity: 0, stokMinimum: item.stokMinimum ?? '' }
      : { ...EMPTY_FORM });
    setErrors({});
  }, [open, item]);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(event) {
    event.preventDefault();
    const parsed = (item ? itemUpdateSchema : itemSchema).safeParse(form);
    if (!parsed.success) {
      const next = {};
      for (const issue of parsed.error.errors) next[issue.path[0]] ||= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const ok = await onSave(parsed.data);
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? 'Edit Master Barang' : 'Tambah Master Barang'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Kategori Jenis Barang" error={errors.categoryCode}>
            <select value={form.categoryCode} onChange={(e) => setField('categoryCode', e.target.value)} className={inputClass(errors.categoryCode)}>
              {Object.values(CATEGORIES).map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
            </select>
          </Field>
          <Field label="Lokasi" hint="Otomatis mengikuti kategori">
            <input readOnly tabIndex={-1} value={locationForCategory(form.categoryCode)} className={inputClass(false)} disabled />
          </Field>
          <Field label="Kode / Tipe Barang" error={errors.itemCode}>
            <input type="text" value={form.itemCode} onChange={(e) => setField('itemCode', e.target.value)} placeholder="contoh: PP-HI10" className={`${inputClass(errors.itemCode)} font-mono`} autoFocus />
          </Field>
          <Field label="Barcode (opsional)" error={errors.barcode} hint="Nilai barcode di stiker fisik barang">
            <input type="text" value={form.barcode} onChange={(e) => setField('barcode', e.target.value)}
              placeholder="contoh: 8991234567890"
              className={`${inputClass(errors.barcode)} font-mono`} />
          </Field>
          <Field label="Satuan" error={errors.unit}>
            <input type="text" list="unit-list" value={form.unit} onChange={(e) => setField('unit', e.target.value)} className={inputClass(errors.unit)} />
            <datalist id="unit-list">{COMMON_UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          </Field>
          <Field label="Nama Barang" error={errors.name} className="sm:col-span-2">
            <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)} className={inputClass(errors.name)} />
          </Field>
          {item ? (
            <Field label="Saldo sekarang" hint="Saldo tidak bisa diubah di sini." className="sm:col-span-1">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{formatNumber(item.quantity)} {item.unit}</span>
                {onKoreksi && (
                  <button type="button" onClick={() => onKoreksi(item)} className="text-sm font-medium text-brand-600 underline hover:text-brand-700">Koreksi saldo</button>
                )}
              </div>
            </Field>
          ) : (
            <Field label="Saldo Awal (QTY)" error={errors.quantity} hint="Hanya bisa diisi sekarang. Setelah ada BKB, ubah lewat Koreksi saldo.">
              <input type="number" min="0" step="any" value={form.quantity} onChange={(e) => setField('quantity', e.target.value)} className={inputClass(errors.quantity)} />
            </Field>
          )}
          <Field label="Stok Minimum (opsional)" error={errors.stokMinimum} hint="Kosong = tidak diatur. Peringatan muncul di dashboard dan saat BKB membuat stok turun di bawah batas. BKB tidak ditahan.">
            <input type="number" min="0" step="any" value={form.stokMinimum}
              onChange={(e) => setField('stokMinimum', e.target.value)}
              className={inputClass(errors.stokMinimum)} />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Batal</button>
          <button type="submit" disabled={busy} className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">
            {busy && <Spinner className="h-4 w-4" />}
            {busy ? 'Menyimpan...' : item ? 'Simpan Perubahan' : 'Tambah Barang'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
