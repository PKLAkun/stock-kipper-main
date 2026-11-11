// Logika murni halaman detail BKB (docs/ui/04): aksi per role, penjelasan status, riwayat, dampak.
import { formatNumber } from '@/lib/utils';
import { bolehBuatPengganti } from '@/lib/constants/izin-bkb';

export const isDE = (role) => role === 'admin' || role === 'superadmin';

// Aksi yang tampil untuk role + status. `pengganti` = BKB pengganti yang menunggu Ganti oleh DE (atau null).
// `peranBuatPengganti` = Pengaturan role yang boleh membuat BKB pengganti (bawaan: SK).
export function aksiTersedia(role, bkb, pengganti = null, peranBuatPengganti) {
  const a = { cetak: false, bukaRuangTunggu: false, buatPengganti: false, ganti: false, gantiNonaktifAlasan: '', ubahData: false, batal: false };
  if (!bkb || role === 'operator') return a;
  const selesai = bkb.status === 'selesai';
  const belumTersimpan = ['menunggu', 'ditahan', 'menunggu_de'].includes(bkb.status);
  a.bukaRuangTunggu = belumTersimpan;
  a.cetak = selesai;
  if (selesai && bolehBuatPengganti(role, peranBuatPengganti)) a.buatPengganti = true;
  if (isDE(role) && selesai) {
    a.ubahData = true;
    a.batal = true;
    a.ganti = Boolean(pengganti);
    if (!pengganti) a.gantiNonaktifAlasan = 'Minta SK membuat BKB pengganti dulu.';
  }
  return a;
}

export const STATUS_PENJELASAN_OPERATOR = {
  menunggu: 'BKB Anda menunggu dicek Stock keeper.',
  ditahan: 'Ada yang perlu dicek ulang. Stock keeper akan menghubungi bila perlu.',
  menunggu_de: 'BKB sudah dicek. Menunggu approve Data entry.',
  selesai: 'BKB tersimpan dan stok sudah berubah.',
  diganti: 'BKB ini diganti BKB lain.',
  dibatalkan: 'BKB ini dibatalkan.',
};

const AKSI_LABEL = {
  buat: 'Dibuat',
  betulkan: 'Diperbaiki SK',
  konfirmasi: 'Saldo dicek',
  approve: 'Disimpan',
  simpan: 'Disimpan',
  kembalikan: 'Dikembalikan DE ke SK',
  yang_salah: 'Pilihan "Yang salah?"',
  koreksi: 'Saldo dikoreksi DE',
  ubah_data: 'Data diubah',
  ganti: 'Diganti',
  batal: 'Dibatalkan',
};

export function labelAksiRiwayat(aksi) {
  return AKSI_LABEL[aksi] || String(aksi || '').replace(/_/g, ' ') || '-';
}

const FIELD_LABEL = { dept_pemakai: 'Dept pemakai', dept_proses: 'Dept proses', machine: 'Mesin', keterangan: 'Keterangan', keterangan_extra: 'Keterangan' };

// ringkasan "Dept pemakai A menjadi B" dari data_lama/data_baru bila bentuknya objek datar
export function ringkasPerubahan(dataLama, dataBaru) {
  if (!dataBaru || typeof dataBaru !== 'object') return '';
  const out = [];
  for (const k of Object.keys(dataBaru)) {
    const baru = dataBaru[k];
    if (baru !== null && typeof baru === 'object') continue;
    const lama = dataLama && typeof dataLama === 'object' ? dataLama[k] : undefined;
    out.push(`${FIELD_LABEL[k] || k} ${lama ?? '-'} menjadi ${baru ?? '-'}`);
  }
  return out.join('; ');
}

// Respons GET /api/bkb/[id]/dampak => props ConfirmActionDialog
export function dampakKeDialog(dampak, aksi) {
  if (!dampak) return { stockRows: undefined, warnings: [], blockers: [] };
  const stockRows = (dampak.baris || []).map((b) => {
    const d = Number(b.saldoSesudah) - Number(b.saldoSekarang);
    return {
      kode: b.itemCode, nama: b.itemName,
      perubahan: `${d > 0 ? '+' : ''}${formatNumber(d)}`,
      sebelum: formatNumber(b.saldoSekarang), sesudah: formatNumber(b.saldoSesudah),
    };
  });
  const p = dampak.peringatan || [];
  const warnings = [];
  const blockers = [];
  if (p.includes('minus')) blockers.push(`Saldo akan menjadi minus. ${aksi === 'ganti' ? 'Ganti' : 'Pembatalan'} tidak bisa dilanjutkan.`);
  if (p.includes('selisih_besar')) warnings.push('Selisih saldo SK dan saldo sistem lebih besar dari QTY barang.');
  if (p.includes('lebih_7_hari')) warnings.push('BKB ini disimpan lebih dari 7 hari lalu.');
  return { stockRows, warnings, blockers };
}

export const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'menunggu', label: 'Menunggu' },
  { value: 'ditahan', label: 'Ditahan' },
  { value: 'menunggu_de', label: 'Menunggu approve DE' },
  { value: 'selesai', label: 'Selesai' },
  { value: 'diganti', label: 'Diganti' },
  { value: 'dibatalkan', label: 'Dibatalkan' },
];
