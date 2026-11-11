'use client';

// Tabel laporan (layar dan cetak). Dept proses tidak ditampilkan (K-30).
// cetak=true: kelas polos "lap-tabel" (gayanya ada di LaporanCetak); false: Tailwind untuk layar.

import { angka, tanggalJamWib, tanggalWib, jenisLabel, periodeTeks } from '@/lib/laporan/format';
import { cx } from '@/lib/utils';

const KOLOM = {
  mutasi: [
    { k: 'tanggal', h: 'Tanggal', f: (r) => tanggalJamWib(r.tanggal), nowrap: true },
    { k: 'docNo', h: 'No. BKB', f: (r) => r.docNo || '-', nowrap: true },
    { k: 'nomorUrut', h: 'No. Urut', f: (r) => r.nomorUrut ?? '-', tengah: true },
    { k: 'barang', h: 'Barang', f: (r) => `${r.itemCode} - ${r.itemName}` },
    { k: 'jenis', h: 'Jenis', f: (r) => jenisLabel(r.jenis) },
    { k: 'keterangan', h: 'Keterangan', f: (r) => r.keterangan || '-' },
    { k: 'masuk', h: 'Masuk', f: (r) => angka(r.masuk), kanan: true },
    { k: 'keluar', h: 'Keluar', f: (r) => angka(r.keluar), kanan: true },
    { k: 'saldo', h: 'Saldo', f: (r) => angka(r.saldo), kanan: true },
    { k: 'petugas', h: 'Petugas', f: (r) => r.petugas || '-' },
    { k: 'shift', h: 'Shift', f: (r) => r.shift || '-', tengah: true },
  ],
  rekap: [
    { k: 'kode', h: 'Kode', f: (r) => r.kode, nowrap: true },
    { k: 'nama', h: 'Nama barang', f: (r) => r.nama },
    { k: 'unit', h: 'Unit', f: (r) => r.unit, tengah: true },
    { k: 'saldoAwal', h: 'Saldo awal', f: (r) => angka(r.saldoAwal), kanan: true },
    { k: 'masuk', h: 'Masuk', f: (r) => angka(r.masuk), kanan: true },
    { k: 'keluar', h: 'Keluar', f: (r) => angka(r.keluar), kanan: true },
    { k: 'koreksi', h: 'Koreksi / Cek Stok', f: (r) => angka(r.koreksi), kanan: true },
    { k: 'saldoAkhir', h: 'Saldo akhir', f: (r) => angka(r.saldoAkhir), kanan: true },
    { k: 'stokMinimum', h: 'Stok min.', f: (r) => (r.stokMinimum == null ? '-' : angka(r.stokMinimum)), kanan: true },
    { k: 'tanda', h: 'Status', f: (r) => (r.diBawahMinimum ? 'Di bawah minimum' : ''), tebalBila: (r) => r.diBawahMinimum },
  ],
  kartu: [
    { k: 'jenis', h: 'Kode input', f: (r) => r.jenis, nowrap: true },
    { k: 'kodeKeterangan', h: 'Kode keterangan', f: (r) => r.kodeKeterangan || '-', nowrap: true },
    { k: 'tanggal', h: 'Tanggal', f: (r) => tanggalWib(r.tanggal), nowrap: true },
    { k: 'docNo', h: 'No. BKB', f: (r) => r.docNo || '-', nowrap: true },
    { k: 'masuk', h: 'Masuk', f: (r) => angka(r.masuk), kanan: true },
    { k: 'keluar', h: 'Keluar', f: (r) => angka(r.keluar), kanan: true },
    { k: 'saldoAkhir', h: 'Saldo akhir', f: (r) => angka(r.saldoAkhir), kanan: true, tebal: true },
    { k: 'saldoSk', h: 'Saldo SK', f: (r) => (r.saldoSk == null ? '' : angka(r.saldoSk)), kanan: true },
  ],
  stok: [
    { k: 'kode', h: 'Kode', f: (r) => r.kode, nowrap: true },
    { k: 'nama', h: 'Nama barang', f: (r) => r.nama },
    { k: 'unit', h: 'Unit', f: (r) => r.unit, tengah: true },
    { k: 'saldo', h: 'Saldo sistem', f: (r) => angka(r.saldo), kanan: true },
    { k: 'stokMinimum', h: 'Stok min.', f: (r) => (r.stokMinimum == null ? '-' : angka(r.stokMinimum)), kanan: true },
    { k: 'tanda', h: 'Status', f: (r) => (r.diBawahMinimum ? 'Di bawah minimum' : ''), tebalBila: (r) => r.diBawahMinimum },
    { k: 'fisik', h: 'Fisik', f: () => '', kolomIsi: true },
  ],
};

// KOP kartu stok: nama barang, kode barang, periode
export function KartuKop({ kartu, cetak }) {
  const baris = [
    ['Nama barang', kartu.item.nama],
    ['Kode barang', kartu.item.kode],
    ['Per tanggal', periodeTeks(kartu.dari, kartu.sampai)],
    ['Saldo awal', `${angka(kartu.saldoAwal)} ${kartu.item.unit || ''}`.trim()],
  ];
  return (
    <dl className={cx(cetak ? 'lap-kop' : 'grid gap-x-6 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-900')}>
      {baris.map(([l, v]) => (
        <div key={l} className="flex gap-2">
          <dt className={cetak ? 'lap-kop-l' : 'w-28 shrink-0 text-slate-500'}>{l}</dt>
          <dd className={cetak ? 'lap-kop-v' : 'font-semibold text-slate-900 dark:text-white'}>: {v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function LaporanTabel({ tab, data, cetak = false }) {
  const kolom = KOLOM[tab];
  const rows = tab === 'mutasi' || tab === 'kartu' ? data?.rows || [] : Array.isArray(data) ? data : [];
  if (!kolom) return null;

  const th = cetak ? undefined : 'whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500';
  return (
    <div className={cetak ? undefined : 'overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800'}>
      <table className={cetak ? 'lap-tabel' : 'w-full min-w-[720px] text-sm'}>
        <thead className={cetak ? undefined : 'bg-slate-50 dark:bg-slate-900'}>
          <tr>
            {kolom.map((c) => (
              <th key={c.k} scope="col" className={cx(th, c.kanan ? 'text-right' : c.tengah ? 'text-center' : 'text-left')}>{c.h}</th>
            ))}
          </tr>
        </thead>
        <tbody className={cetak ? undefined : 'divide-y divide-slate-100 dark:divide-slate-800'}>
          {rows.length === 0 && (
            <tr><td colSpan={kolom.length} className={cetak ? 'lap-kosong' : 'px-3 py-8 text-center text-slate-500'}>Tidak ada data untuk filter ini.</td></tr>
          )}
          {rows.map((r, i) => {
            const bawah = r.diBawahMinimum;
            return (
              <tr key={r.id ?? r.itemId ?? `${r.docNo}-${i}`} className={cx(!cetak && bawah && 'bg-rose-50 dark:bg-rose-950/30', cetak && bawah && 'lap-bawah')}>
                {kolom.map((c) => (
                  <td
                    key={c.k}
                    className={cx(
                      !cetak && 'px-3 py-2 text-slate-700 dark:text-slate-200',
                      c.kanan && 'text-right tabular-nums', c.tengah && 'text-center',
                      c.nowrap && 'whitespace-nowrap',
                      (c.tebal || c.tebalBila?.(r)) && 'font-semibold',
                      !cetak && c.tebalBila?.(r) && 'text-rose-700 dark:text-rose-300',
                      c.kolomIsi && (cetak ? 'lap-fisik' : 'min-w-[96px] border-l border-dashed border-slate-300 dark:border-slate-700'),
                    )}
                  >
                    {c.f(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
