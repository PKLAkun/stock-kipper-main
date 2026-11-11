'use client';

// Filter per tab. Perubahan ditampung di draf; tabel baru dimuat saat "Tampilkan" ditekan.

import { Field, inputClass } from '@/components/ui/Field';
import ItemAutocomplete from '@/components/bkb/ItemAutocomplete';
import { JENIS_LABEL } from '@/lib/laporan/format';

const JENIS_PILIHAN = ['PB', 'PR', 'RP', 'BTL', 'TRM', 'SA', 'ADJ', 'OPN'];

export default function LaporanFilter({ tab, filter, onChange, onSubmit, pesan, sibuk }) {
  const set = (patch) => onChange({ ...filter, ...patch });
  const input = inputClass(false);
  const tanggal = (
    <>
      <Field label="Dari tanggal">
        <input type="date" className={input} value={filter.dari || ''} onChange={(e) => set({ dari: e.target.value })} />
      </Field>
      <Field label="Sampai tanggal">
        <input type="date" className={input} value={filter.sampai || ''} onChange={(e) => set({ sampai: e.target.value })} />
      </Field>
    </>
  );
  const barang = (
    <Field label="Barang" className="sm:col-span-2">
      <ItemAutocomplete
        rowKey={`laporan-${tab}`}
        selected={filter.item ? { itemCode: filter.item.itemCode, name: filter.item.name } : null}
        onSelect={(item) => set({ item: { id: item.id, itemCode: item.itemCode, name: item.name } })}
        onClear={() => set({ item: null })}
      />
      {filter.item && <p className="mt-1 text-xs text-slate-500">{filter.item.name}</p>}
    </Field>
  );
  const kategori = (
    <Field label="Kategori">
      <select className={input} value={filter.kategori || ''} onChange={(e) => set({ kategori: e.target.value })}>
        <option value="">Semua</option>
        <option value="1">Raw Material (RM)</option>
        <option value="4">Barang Olahan (BO)</option>
      </select>
    </Field>
  );

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      aria-label="Filter laporan"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tab === 'mutasi' && (
          <>
            {tanggal}
            {barang}
            <Field label="Jenis">
              <select className={input} value={filter.jenis || ''} onChange={(e) => set({ jenis: e.target.value })}>
                <option value="">Semua</option>
                {JENIS_PILIHAN.map((j) => <option key={j} value={j}>{j} - {JENIS_LABEL[j]}</option>)}
              </select>
            </Field>
            <Field label="Keterangan">
              <input type="text" maxLength={100} placeholder="mis. BIP" className={input} value={filter.keterangan || ''} onChange={(e) => set({ keterangan: e.target.value })} />
            </Field>
            <Field label="Shift">
              <select className={input} value={filter.shift || ''} onChange={(e) => set({ shift: e.target.value })}>
                <option value="">Semua</option>
                <option value="1">Shift 1</option>
                <option value="2">Shift 2</option>
                <option value="3">Shift 3</option>
              </select>
            </Field>
          </>
        )}
        {tab === 'rekap' && (<>{tanggal}{kategori}</>)}
        {tab === 'kartu' && (<>{barang}{tanggal}</>)}
        {tab === 'stok' && kategori}
      </div>
      {pesan && <p role="alert" className="text-sm text-rose-600">{pesan}</p>}
      <div>
        <button
          type="submit" disabled={sibuk}
          className="min-h-[44px] rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Tampilkan
        </button>
      </div>
    </form>
  );
}
