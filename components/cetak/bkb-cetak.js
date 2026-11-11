// Fungsi murni untuk tampilan cetak BKB (docs/ui/08-cetak-bkb.md).

export const BARIS_PER_HALAMAN = 8;
export const BARIS_MINIMAL = 6;

export const RANGKAP = [
  { id: 'asli', label: 'Asli', penanda: 'Asli' },
  { id: 'copy1', label: 'Copy 1', penanda: 'Copy 1' },
  { id: 'copy2', label: 'Copy 2', penanda: 'Copy 2' },
];

export function pilihanRangkapValid(v) {
  return ['semua', 'asli', 'copy1', 'copy2'].includes(v) ? v : 'semua';
}

export function daftarRangkap(pilihan) {
  const p = pilihanRangkapValid(pilihan);
  return p === 'semua' ? RANGKAP : RANGKAP.filter((r) => r.id === p);
}

export function formatAngka(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(v);
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// "3 Nov 2026" (tanggal kalender; string YYYY-MM-DD dibaca apa adanya tanpa geser zona)
export function formatTanggal(v) {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (m) return `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

// Respons GET /api/bkb/[id] (mapBkb di lib/db/bkb.js) sudah camelCase:
// docNo, status, reference, bkbDate, jenisKode, tujuanKode, keterangan, pihakNama,
// dikonfirmasiOlehNama, dibuatOlehNama, dan items[]: { itemCode, itemName, unit, qty, deptPemakaiKode }.
// Nama jenis dan nama dept tidak ada di respons, jadi yang dicetak hanya kodenya.
const teks = (v) => (v == null ? '' : String(v));

export function normalisasiBkb(raw) {
  const b = raw || {};
  const tujuan = teks(b.tujuanKode);
  const ket = teks(b.keterangan || b.keteranganExtra);
  return {
    docNo: teks(b.docNo),
    status: teks(b.status),
    reference: teks(b.reference),
    tanggal: formatTanggal(b.bkbDate),
    jenis: teks(b.jenisKode),
    catatan: [tujuan, ket && ket !== tujuan ? ket : ''].filter(Boolean).join(' - '),
    diserahkan: teks(b.dikonfirmasiOlehNama),
    diterima: teks(b.pihakNama) || teks(b.dibuatOlehNama),
    baris: (b.items || []).map((r) => ({
      kode: teks(r.itemCode),
      nama: teks(r.itemName),
      qty: formatAngka(r.qty),
      unit: teks(r.unit),
      keterangan: teks(r.deptPemakaiKode),
    })),
  };
}

// Bagi baris ke lembar (maks 8 per lembar); lembar terakhir diisi baris kosong sampai 6.
export function bagiHalaman(baris, perHalaman = BARIS_PER_HALAMAN, minimal = BARIS_MINIMAL) {
  const kosong = { kode: '', nama: '', qty: '', unit: '', keterangan: '', kosong: true };
  const hasil = [];
  for (let i = 0; i < baris.length; i += perHalaman) hasil.push(baris.slice(i, i + perHalaman));
  if (hasil.length === 0) hasil.push([]);
  const terakhir = hasil[hasil.length - 1].slice();
  while (terakhir.length < minimal) terakhir.push(kosong);
  hasil[hasil.length - 1] = terakhir;
  return hasil;
}

// Alasan BKB tidak bisa dicetak, atau null bila boleh.
export function alasanTidakBisaCetak(status) {
  if (status === 'selesai') return null;
  if (status === 'diganti') return 'BKB ini sudah diganti dan tidak dicetak.';
  if (status === 'dibatalkan') return 'BKB ini sudah dibatalkan dan tidak dicetak.';
  return 'BKB ini belum bisa dicetak. Hanya BKB berstatus Selesai.';
}
