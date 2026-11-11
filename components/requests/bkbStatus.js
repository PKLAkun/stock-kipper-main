// Metadata status BKB untuk Ruang Tunggu (docs/ui/03).

export const STATUS_META = {
  menunggu:    { label: 'Menunggu', tone: 'amber' },
  ditahan:     { label: 'Ditahan', tone: 'red' },
  menunggu_de: { label: 'Menunggu approve DE', tone: 'indigo' },
  selesai:     { label: 'Selesai', tone: 'green' },
  diganti:     { label: 'Diganti', tone: 'slate' },
  dibatalkan:  { label: 'Dibatalkan', tone: 'slate' },
};

export const STATUS_FILTERS = ['', 'menunggu', 'ditahan', 'menunggu_de', 'selesai', 'diganti', 'dibatalkan'];

export function isValidStatusFilter(v) {
  return STATUS_FILTERS.includes(v || '');
}

// keterangan kecil di bawah badge saat Ditahan
export function ditahanKeterangan(ditahanKarena) {
  switch (ditahanKarena) {
    case 'dibetulkan_sk': return 'Menunggu SK betulkan BKB';
    case 'menunggu_koreksi': return 'Menunggu DE koreksi saldo';
    case 'dikembalikan_de': return 'Dikembalikan DE, menunggu SK';
    case 'dikoreksi': return 'Saldo sudah dikoreksi DE';
    case 'stok_kurang':
    case 'tidak_cocok':
    default: return 'Belum dipilih yang salah';
  }
}

export const isDE = (role) => role === 'admin' || role === 'superadmin';

// Filter khusus DE/Superadmin: BKB yang perlu tindakan mereka, sama dengan hitungan lencana menu.
// Isinya: Menunggu approve DE, dan Ditahan yang menunggu DE koreksi saldo.
export const FILTER_PERLU = 'perlu';
export const FILTER_SEMUA = 'semua';
export const LABEL_PERLU = 'Perlu tindakan saya';

// Filter dari URL. DE/Superadmin tanpa ?status= mendapat "Perlu tindakan saya";
// pilihan "Semua" untuk mereka ditulis ?status=semua supaya tidak kembali ke bawaan.
export function filterDariUrl(raw, role) {
  if (raw === FILTER_SEMUA) return '';
  if (isDE(role) && (raw === FILTER_PERLU || !raw)) return FILTER_PERLU;
  return isValidStatusFilter(raw) ? raw || '' : (isDE(role) ? FILTER_PERLU : '');
}

export function perluTindakanDe(menungguDe = [], ditahan = []) {
  const koreksi = ditahan.filter((b) => (b.ditahanKarena ?? b.ditahan_karena) === 'menunggu_koreksi');
  return [...koreksi, ...menungguDe];
}

// BKB belum tersimpan boleh dibatalkan SK/DE tanpa password
export const bisaBatalSebelumTersimpan = (role, status) =>
  (role === 'staff' || isDE(role)) && ['menunggu', 'ditahan', 'menunggu_de'].includes(status);

// "525,5" atau "525.5" => 525.5. Mengembalikan { value } atau { error }.
export function parseSaldoInput(raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return { error: 'Saldo akhir wajib diisi.' };
  if (s.startsWith('-')) return { error: 'Saldo akhir tidak boleh minus.' };
  if (!/^\d+([.,]\d*)?$/.test(s)) return { error: 'Isi dengan angka, mis. 525,5.' };
  const [, frac = ''] = s.split(/[.,]/);
  if (frac.length > 3) return { error: 'Maksimal 3 angka di belakang koma.' };
  return { value: Number(s.replace(',', '.')) };
}

// selisih = angka SK dikurangi saldo sistem, tanda selalu tertulis
export function formatSelisih(sk, sistem) {
  const d = Math.round((Number(sk) - Number(sistem)) * 1000) / 1000;
  const n = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Math.abs(d));
  if (d === 0) return '0';
  return `${d > 0 ? '+' : '-'}${n}`;
}

// nilai "INISIAL/NOMOR" => { inisial, nomorUrut }
export function splitKeteranganExtra(extra) {
  const [inisial = '', nomor = ''] = String(extra || '').split('/');
  return { inisial, nomorUrut: Number(nomor) || 1 };
}
