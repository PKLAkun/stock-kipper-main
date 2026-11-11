// FILE: components/laporan/laporan-query.js
// Logika murni tampilan laporan: daftar tab, filter bawaan, pembuatan query, kelengkapan filter.

export const TABS = [
  { id: 'mutasi', label: 'Mutasi', judul: 'Laporan Mutasi Stok' },
  { id: 'rekap', label: 'Rekap stok', judul: 'Laporan Rekap Stok' },
  { id: 'kartu', label: 'Kartu stok', judul: 'Kartu Stok' },
  { id: 'stok', label: 'Stok saat ini', judul: 'Stok Saat Ini' },
];

export const tabValid = (id) => (TABS.some((t) => t.id === id) ? id : 'mutasi');

// hari ini di WIB, YYYY-MM-DD
export const hariIniWib = (now = Date.now()) => new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
export const awalBulanWib = (now = Date.now()) => `${hariIniWib(now).slice(0, 8)}01`;

export function filterBawaan(tab, now = Date.now()) {
  const dari = awalBulanWib(now);
  const sampai = hariIniWib(now);
  switch (tab) {
    case 'mutasi': return { dari, sampai, item: null, jenis: '', keterangan: '', shift: '' };
    case 'rekap': return { dari, sampai, kategori: '' };
    case 'kartu': return { dari, sampai, item: null };
    default: return { kategori: '' };
  }
}

// kunci filter yang dikirim ke API per tab
const KUNCI = {
  mutasi: ['dari', 'sampai', 'jenis', 'keterangan', 'shift'],
  rekap: ['dari', 'sampai', 'kategori'],
  kartu: ['dari', 'sampai'],
  stok: ['kategori'],
};

// Query string untuk API dan halaman cetak. extra: { format, limit, offset }
export function buatQuery(tab, filter, extra = {}) {
  const sp = new URLSearchParams();
  for (const k of KUNCI[tab] || []) {
    const v = filter?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') sp.set(k, String(v).trim());
  }
  if ((tab === 'mutasi' || tab === 'kartu') && filter?.item?.id) sp.set('itemId', String(filter.item.id));
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  return sp.toString();
}

// Pesan bila filter belum cukup untuk memuat laporan; null bila lengkap
export function kekuranganFilter(tab, filter) {
  if (tab === 'kartu' && !filter?.item?.id) return 'Pilih barang untuk melihat kartu stok.';
  if (tab === 'mutasi' || tab === 'rekap') {
    if (!filter?.dari || !filter?.sampai) return 'Isi tanggal dari dan sampai.';
  }
  if (filter?.dari && filter?.sampai) {
    if (filter.dari > filter.sampai) return 'Tanggal sampai tidak boleh sebelum tanggal dari.';
    const hari = Math.round((Date.parse(`${filter.sampai}T00:00:00Z`) - Date.parse(`${filter.dari}T00:00:00Z`)) / 86400000) + 1;
    if (hari > 366) return 'Rentang tanggal maksimal 1 tahun.';
  }
  return null;
}

// Filter dari query halaman cetak (tanpa objek barang; itemId dipakai langsung)
export function filterDariQuery(tab, sp) {
  const get = (k) => (typeof sp?.[k] === 'string' ? sp[k] : '');
  const f = {};
  for (const k of KUNCI[tab] || []) f[k] = get(k);
  if (tab === 'mutasi' || tab === 'kartu') f.itemId = /^\d+$/.test(get('itemId')) ? get('itemId') : '';
  return f;
}

// Query API dari filter hasil filterDariQuery
export function queryDariFilterCetak(tab, f, extra = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f || {})) if (v) sp.set(k, v);
  for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, String(v));
  return sp.toString();
}

const jumlah = (rows, k) => Math.round(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0) * 1000) / 1000;

// Ringkasan angka di atas tabel. data: bentuk respons API per tab.
export function hitungRingkasan(tab, data) {
  if (!data) return [];
  if (tab === 'mutasi') {
    const rows = data.rows || [];
    const sebagian = rows.length < (data.total ?? rows.length);
    const sufiks = sebagian ? ' (baris tampil)' : '';
    return [
      { label: 'Jumlah transaksi', nilai: data.total ?? rows.length },
      { label: `Total masuk${sufiks}`, nilai: jumlah(rows, 'masuk') },
      { label: `Total keluar${sufiks}`, nilai: jumlah(rows, 'keluar') },
    ];
  }
  if (tab === 'rekap') {
    const rows = Array.isArray(data) ? data : [];
    return [
      { label: 'Jumlah barang', nilai: rows.length },
      { label: 'Di bawah stok minimum', nilai: rows.filter((r) => r.diBawahMinimum).length, peringatan: true },
    ];
  }
  if (tab === 'kartu') {
    const rows = data.rows || [];
    return [
      { label: 'Saldo awal', nilai: data.saldoAwal },
      { label: 'Total masuk', nilai: jumlah(rows, 'masuk') },
      { label: 'Total keluar', nilai: jumlah(rows, 'keluar') },
      { label: 'Saldo akhir', nilai: data.saldoAkhir },
    ];
  }
  const rows = Array.isArray(data) ? data : [];
  return [
    { label: 'Jumlah barang', nilai: rows.length },
    { label: 'Di bawah stok minimum', nilai: rows.filter((r) => r.diBawahMinimum).length, peringatan: true },
  ];
}
