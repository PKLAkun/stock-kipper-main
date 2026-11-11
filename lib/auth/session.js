// FILE: lib/auth/session.js
// Manajemen sesi login (Node runtime / server side).
// Sesi disimpan sebagai cookie httpOnly -> tidak bisa dibaca JavaScript browser,
// sehingga lebih aman dari serangan XSS.

import { cookies } from 'next/headers';
import { getEnv } from '../env.js';
import { getRepository } from '../db/index.js';
import { hitungShift } from './shift.js';
import { getCookieName, signSessionToken, verifySessionToken, sessionCookieOptions } from './jwt.js';

const TOKEN_HOURS = 8;

function cookieOptions() {
  return sessionCookieOptions();
}

// Buat token untuk user lalu simpan ke cookie
export async function createSession(user) {
  const env = getEnv();
  const hours = env.sessionHours || TOKEN_HOURS;
  // [Tahap 2, 11-11-2026, T-21] Dinonaktifkan: token kini membawa shift dan shiftHabis.
  // const token = await signSessionToken(
  //   { sub: user.id, role: user.role, pv: user.passwordVersion },
  //   hours
  // );
  const { shift, habis } = hitungShift(new Date());
  const token = await signSessionToken(
    {
      sub: user.id,
      role: user.role,
      pv: user.passwordVersion,
      shift,
      shiftHabis: Math.floor(habis.getTime() / 1000),
    },
    hours
  );
  const store = await cookies();
  store.set(getCookieName(), token, cookieOptions());
}

export async function destroySession() {
  const store = await cookies();
  store.delete(getCookieName());
}

export function getSessionToken(store) {
  return store.get(getCookieName())?.value;
}

// Ambil user yang sedang login BERDASARKAN database, bukan sekadar trust JWT.
// - token harus valid (tanda tangan + belum kedaluwarsa)
// - user harus masih ada, masih aktif, dan password belum di-reset
//   (password_version di token harus sama dengan di DB)
export async function getSessionUser() {
  const store = await cookies();
  const token = getSessionToken(store);
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const repo = getRepository();
  const user = await repo.findById(Number(payload.sub));
  if (!user) return null;
  if (!user.active) return null;
  if (user.passwordVersion !== Number(payload.pv)) return null;

  // [Tahap 2, 11-11-2026, T-21] Dinonaktifkan: user kini diberi sesiShift dan sesiBerakhir dari token.
  // return user;
  return {
    ...user,
    sesiShift: payload.shift ? String(payload.shift) : null,
    sesiBerakhir: payload.exp ? new Date(Number(payload.exp) * 1000).toISOString() : null,
  };
}