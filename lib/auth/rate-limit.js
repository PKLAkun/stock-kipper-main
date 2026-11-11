// FILE: lib/auth/rate-limit.js
// Pembatasan percobaan login (brute-force protection).
// - Maksimal MAX_ATTEMPTS percobaan gagal dalam jendela waktu WINDOW_MS
// - Jika lewat, akun/IP diblokir sementara (lockout) selama LOCKOUT_MS
//
// CATATAN: limiter ini in-memory (reset saat server restart).
// Untuk skala besar (multi-instance di Vercel) gunakan penyimpanan bersama,
// misalnya Upstash Redis. Untuk proyek magang ini sudah cukup.

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 menit
const LOCKOUT_MS = 15 * 60 * 1000; // 15 menit

const attempts = new Map();

function now() {
  return Date.now();
}

function cleanUp(key) {
  const rec = attempts.get(key);
  if (!rec) return;
  // hapus catatan lama supaya Map tidak membesar terus
  if (now() - rec.firstAt > WINDOW_MS && now() - (rec.lastAt || rec.firstAt) > WINDOW_MS) {
    attempts.delete(key);
  }
}

// cek apakah key (email/ip) boleh mencoba login lagi
export function checkLoginAttempt(key) {
  cleanUp(key);
  const rec = attempts.get(key);

  // belum ada catatan => bebas login
  if (!rec) return { allowed: true, remaining: MAX_ATTEMPTS, retryAfterSec: 0 };

  // sedang dalam masa lockout
  if (rec.blockedUntil && now() < rec.blockedUntil) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((rec.blockedUntil - now()) / 1000),
    };
  }

  const withinWindow = now() - rec.firstAt < WINDOW_MS;
  const remaining = withinWindow ? Math.max(0, MAX_ATTEMPTS - rec.count) : MAX_ATTEMPTS;
  return { allowed: remaining > 0, remaining, retryAfterSec: 0 };
}

// catat kegagalan login; otomatis aktifkan lockout jika sudah lewat batas
export function recordLoginFailure(key) {
  const rec = attempts.get(key) || { count: 0, firstAt: now(), blockedUntil: null };
  if (rec.blockedUntil && now() < rec.blockedUntil) return;

  rec.count += 1;
  rec.lastAt = now();
  if (rec.count >= MAX_ATTEMPTS) {
    rec.blockedUntil = now() + LOCKOUT_MS;
    rec.count = 0;
  }
  attempts.set(key, rec);
}

// login berhasil => reset catatan untuk key itu
export function recordLoginSuccess(key) {
  attempts.delete(key);
}

// buat key dari alamat IP klien (pakai header dari proxy/edge)
export function clientIpKey(request) {
  const fwd = request.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : (request.ip || 'unknown');
  return `ip:${ip}`;
}