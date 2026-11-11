// FILE: lib/auth/shift.js
// Hitung shift kerja dari jam WIB (UTC+7). Fungsi murni: tanpa import Node dan
// tidak bergantung pada timezone mesin, jadi aman dipakai di Edge maupun browser.
//   shift 1: 00.00-07.59 (habis 08.00)
//   shift 2: 08.00-15.59 (habis 16.00)
//   shift 3: 16.00-23.59 (habis 00.00 hari berikutnya)

const JAM_MS = 60 * 60 * 1000;
const HARI_MS = 24 * JAM_MS;
const WIB_MS = 7 * JAM_MS;
const PANJANG_SHIFT_MS = 8 * JAM_MS;

export function hitungShift(date = new Date()) {
  const t = date instanceof Date ? date.getTime() : new Date(date).getTime();
  if (!Number.isFinite(t)) throw new TypeError('Tanggal tidak valid.');
  const wib = t + WIB_MS; // "jam dinding" WIB dibaca sebagai UTC
  const awalHari = Math.floor(wib / HARI_MS) * HARI_MS;
  const indeks = Math.floor((wib - awalHari) / PANJANG_SHIFT_MS); // 0, 1, 2
  const habisWib = awalHari + (indeks + 1) * PANJANG_SHIFT_MS;
  return { shift: String(indeks + 1), habis: new Date(habisWib - WIB_MS) };
}
