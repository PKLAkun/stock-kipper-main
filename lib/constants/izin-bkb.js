// Siapa yang boleh membuat BKB dan BKB pengganti, diatur Superadmin di halaman Pengaturan
// (app_settings 'peran_buat_bkb' dan 'peran_buat_pengganti'). Dua pengaturan ini terpisah.
// Dipakai di server (API, halaman) dan di tampilan. Fungsi SQL buat_bkb mengecek lagi.

export const PERAN_BUAT_BKB_PILIHAN = ['operator', 'staff', 'admin', 'superadmin'];
export const PERAN_BUAT_BKB_DEFAULT = ['operator', 'staff'];

// Operator tidak punya form BKB pengganti, jadi tidak termasuk pilihan.
export const PERAN_BUAT_PENGGANTI_PILIHAN = ['staff', 'admin', 'superadmin'];
export const PERAN_BUAT_PENGGANTI_DEFAULT = ['staff'];

function normal(nilai, pilihan, bawaan) {
  if (!Array.isArray(nilai)) return bawaan;
  const bersih = pilihan.filter((r) => nilai.includes(r));
  return bersih.length > 0 ? bersih : bawaan;
}

export const normalPeranBuatBkb = (nilai) => normal(nilai, PERAN_BUAT_BKB_PILIHAN, PERAN_BUAT_BKB_DEFAULT);
export const normalPeranBuatPengganti = (nilai) => normal(nilai, PERAN_BUAT_PENGGANTI_PILIHAN, PERAN_BUAT_PENGGANTI_DEFAULT);

export function bolehBuatBkb(role, peran) {
  return normalPeranBuatBkb(peran).includes(role);
}

export function bolehBuatPengganti(role, peranPengganti) {
  return normalPeranBuatPengganti(peranPengganti).includes(role);
}
