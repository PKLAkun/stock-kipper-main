// FILE: lib/utils.js
// Fungsi kecil yang dipakai bersama di server maupun klien.

// deteksi error "email sudah dipakai" (pelanggaran unique PostgreSQL)
export function isUniqueViolation(err) {
  return err?.code === '23505';
}

// format angka jadi Rupiah, contoh: Rp50.000
export function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

// format angka polos, contoh: 12.500
export function formatNumber(value) {
  return new Intl.NumberFormat('id-ID').format(value || 0);
}

// format tanggal-waktu, contoh: 20/09/2026 14:30
export function formatDateTime(dateTime) {
  if (!dateTime) return '-';
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// penggabung class Tailwind secara sederhana
export function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}