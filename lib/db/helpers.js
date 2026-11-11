// FILE: lib/db/helpers.js
// Helper kecil untuk adapter database.

// Zona waktu operasional pabrik (WIB). Filter tanggal dihitung per hari WIB, bukan UTC.
const TZ = '+07:00';

export function startOfDayWib(dateStr) {
  return dateStr ? `${dateStr}T00:00:00${TZ}` : '';
}

// awal hari BERIKUTNYA (eksklusif) supaya seluruh jam pada tanggal akhir ikut tercakup
export function endExclusiveWib(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.toISOString().slice(0, 10)}T00:00:00${TZ}`;
}

// Bersihkan kata kunci sebelum disisipkan ke filter .or() PostgREST
// (koma/kurung/% akan merusak sintaks filter => mencegah filter injection).
export function safeSearch(value) {
  return String(value || '').replace(/[,()%*\\:"']/g, ' ').trim();
}

export function todayWib() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
