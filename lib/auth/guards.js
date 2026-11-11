// FILE: lib/auth/guards.js
// Pelindung (guard) untuk API routes: otentikasi, otorisasi role, dan CSRF.
// Dipanggil di SETIAP handler yang butuh proteksi (defense in depth).

import { NextResponse } from 'next/server';
import { getSessionUser } from './session.js';

// helper: respons JSON sukses
export function jsonOk(data, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

// helper: respons JSON gagal, JANGAN bocorkan detail internal/stack trace
export function jsonError(message, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// Ubah error domain (mis. stok kurang, nomor dokumen ganda) menjadi respons yang ramah.
// Error lain TIDAK dibocorkan: cukup pesan generik.
export function handleApiError(err, fallbackMessage = 'Terjadi kesalahan pada server.') {
  if (err?.name === 'DomainError') {
    return NextResponse.json({ ok: false, error: err.message, ...(err.extra || {}) }, { status: err.status || 400 });
  }
  console.error('[api]', err?.message || err);
  return jsonError(fallbackMessage, 500);
}

// Pastikan user login. Balikan { user } atau { error: Response }.
export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) {
    return { error: jsonError('Sesi tidak valid. Silakan login ulang.', 401) };
  }
  return { user };
}

// Pastikan role user termasuk yang diizinkan (misal ['admin']).
// Dipanggil terpisah dari requireAuth() supaya pesan errornya jelas.
export function requireRole(user, allowedRoles) {
  // superadmin memegang semua hak admin (DE)
  const effective = allowedRoles.includes('admin') ? [...allowedRoles, 'superadmin'] : allowedRoles;
  if (!user || !effective.includes(user.role)) {
    return { error: jsonError('Anda tidak memiliki akses ke fitur ini.', 403) };
  }
  return { ok: true };
}

// Pelindung CSRF untuk request yang mengubah data:
// membandingkan header Origin browser dengan host yang tertera di header Host.
//
// Kenapa memakai "Host", bukan request.url?
//   Saat aplikasi dibuka lewat IP laptop / tunnel / proxy (mis. dari HP),
//   request.url di Next.js tetap berisi localhost sehingga Origin browser
//   yang asli (mis. http://10.162.125.247:3000) terlihat "beda".
//   Header Host persis mencerminkan alamat yang dipakai browser.
//
// Skema (http vs https) sengaja diabaikan karena proksi sering memutus TLS.
// Yang penting: hostname + port atau "asal" harus SAMA persis.
export function checkSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return { ok: true }; // bukan browser (mis. curl) — tidak ada header Origin

  try {
    const originUrl = new URL(origin);
    const requestHost = request.headers.get('host') || new URL(request.url).host;

    if (!sameHostAndPort(originUrl, requestHost)) {
      return { ok: false, error: jsonError('Asal permintaan tidak valid.', 403) };
    }
    return { ok: true };
  } catch {
    // Origin tidak bisa di-parse URL => tolak
    return { ok: false, error: jsonError('Asal permintaan tidak valid.', 403) };
  }
}

// bandingkan hostname + port tanpa pedulikan skema.
// Aturan: cukup hostname sama, kecuali ada port EKSPLISIT di Origin
// (mis. :3000) — port itu harus sama persis dengan port di header Host.
function sameHostAndPort(originUrl, requestHost) {
  const parsedHost = new URL(`http://${requestHost}`);

  // hostname harus sama (case-insensitive)
  if (originUrl.hostname.toLowerCase() !== parsedHost.hostname.toLowerCase()) {
    return false;
  }

  // port eksplisit yang ditulis di Origin (mis. http://host:3000)
  const originPort = originUrl.port;
  const hostPort = parsedHost.port;

  if (originPort) {
    // Origin memakai port khusus (mis. akses dari HP via IP:3000),
    // maka Host harus menyebutkan port yang sama.
    return Boolean(hostPort) && originPort === hostPort;
  }

  // Origin memakai port default (80 untuk http, 443 untuk https).
  // Jika Host tidak menyebut port = dianggap port default juga => cocok.
  const impliedDefault = originUrl.protocol === 'https:' ? '443' : '80';
  return !hostPort || hostPort === impliedDefault;
}

// Hapus field sensitif (passwordHash, pinHash) sebelum user data dikirim ke browser
export function publicUser(user) {
  if (!user) return null;
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, pinHash, ...safe } = user;
  return safe;
}