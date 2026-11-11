// Membersihkan sisa sesi di browser saat keluar atau berganti akun.
// sessionStorage berisi draf form (BKB, saldo SK, BKB pengganti) milik akun sebelumnya.
// Pindah halaman dengan muat ulang penuh supaya cache data (SWR) di memori ikut hilang.
// Preferensi tampilan (tema di localStorage) sengaja tidak dihapus.

export function bersihkanDrafSesi() {
  try { sessionStorage.clear(); } catch { /* storage bisa tidak tersedia */ }
}

// Tujuan setelah login hanya boleh path internal, supaya ?next= tidak bisa mengarah ke situs lain.
export function tujuanAman(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
    ? next
    : '/';
}

export function pindahDenganMuatUlang(path) {
  window.location.replace(path);
}
