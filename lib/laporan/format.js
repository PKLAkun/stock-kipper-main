// FILE: lib/laporan/format.js
// Format tampilan laporan, dipakai bersama oleh layar, halaman cetak, dan Excel (server).

export const JENIS_LABEL = {
  PB: 'Pemakaian', PR: 'Hasil Produksi', RP: 'Retur Pemakaian', BTL: 'Distribusi / Penjualan',
  TRM: 'Transfer Masuk', SA: 'Saldo Awal', ADJ: 'Koreksi Saldo', OPN: 'Cek Stok',
};

export const KATEGORI_LABEL = { 1: 'Raw Material (RM)', 4: 'Barang Olahan (BO)' };

const pad = (n) => String(n).padStart(2, '0');

// 2026-11-10T20:00:00Z -> 11/11/2026 03:00 (WIB)
export function tanggalJamWib(ts) {
  if (!ts) return '';
  const d = new Date(new Date(ts).getTime() + 7 * 3600 * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function tanggalWib(ts) {
  return tanggalJamWib(ts).slice(0, 10);
}

// 2026-11-11 -> 11/11/2026
export function tanggalIndo(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// Angka untuk layar: pemisah ribuan Indonesia, 3 desimal paling banyak. null -> ''.
export function angka(v) {
  if (v == null || v === '') return '';
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Number(v));
}

export function periodeTeks(dari, sampai) {
  if (dari && sampai) return `${tanggalIndo(dari)} s/d ${tanggalIndo(sampai)}`;
  if (sampai) return `Sampai ${tanggalIndo(sampai)}`;
  if (dari) return `Sejak ${tanggalIndo(dari)}`;
  return 'Seluruh riwayat';
}

export const jenisLabel = (j) => JENIS_LABEL[j] || j || '';
