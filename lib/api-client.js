// FILE: lib/api-client.js
// Helper untuk memanggil API dari sisi klien (browser).
// Semua call memakai fetch biasa + handling error yang rapi.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// untuk useSWR: ambil data lalu balikin pesan error yang bisa ditampilkan
export async function swrFetcher(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || 'Terjadi kesalahan saat memuat data.', res.status);
  }
  return data;
}

// untuk POST/PUT/DELETE dengan body JSON
// timeoutMs: batas waktu per permintaan (bawaan 15 detik). Habis => ApiError status 0.
export const DEFAULT_TIMEOUT_MS = 15000;

export async function apiFetch(url, { method = 'POST', body = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new ApiError('Server terlalu lama menjawab. Periksa koneksi lalu coba lagi.', 0);
    }
    throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.', 0);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || 'Terjadi kesalahan. Silakan coba lagi.', res.status);
  }
  return data;
}