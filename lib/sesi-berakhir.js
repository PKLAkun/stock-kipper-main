// Logika murni penghitung waktu peringatan sesi berakhir (shift habis).
// Hanya untuk tampilan; penegakan sesungguhnya ada di exp token (server).

export const PERINGATAN_MENIT = 10;

// "HH.MM" dalam WIB (UTC+7), tanpa bergantung timezone mesin
export function jamWib(date) {
  const w = new Date(date.getTime() + 7 * 3600 * 1000);
  const dua = (n) => String(n).padStart(2, '0');
  return `${dua(w.getUTCHours())}.${dua(w.getUTCMinutes())}`;
}

// Status sesi pada waktu `sekarang` (ms epoch). sesiBerakhir: ISO string dari /api/me.
// Balikan: { aktif, tampilPeringatan, habis, jamBerakhir, sisaMs }
export function hitungStatusSesi(sesiBerakhir, sekarang = Date.now(), peringatanMenit = PERINGATAN_MENIT) {
  const akhir = sesiBerakhir ? new Date(sesiBerakhir).getTime() : NaN;
  if (!Number.isFinite(akhir)) {
    return { aktif: false, tampilPeringatan: false, habis: false, jamBerakhir: null, sisaMs: null };
  }
  const sisaMs = akhir - sekarang;
  return {
    aktif: true,
    tampilPeringatan: sisaMs > 0 && sisaMs <= peringatanMenit * 60 * 1000,
    habis: sisaMs <= 0,
    jamBerakhir: jamWib(new Date(akhir)),
    sisaMs,
  };
}
