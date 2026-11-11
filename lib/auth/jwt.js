// FILE: lib/auth/jwt.js
// Fungsi murni untuk membuat & memverifikasi token sesi (JWT) memakai `jose`.
// Tidak boleh meng-import modul Node (next/headers/db) supaya aman dipakai
// di middleware (Edge Runtime) yang tidak punya akses database.

import { SignJWT, jwtVerify } from 'jose';
import { getEnv } from '../env.js';

const SESSION_COOKIE = 'session';

function secretKey(secret) {
  return new TextEncoder().encode(secret);
}

// Hitung exp (detik epoch). Operator: paling lama sampai shift habis. Role lain: jam sesi biasa.
export function hitungExpSesi({ role, shiftHabis }, expiresInHours, nowSeconds = Math.floor(Date.now() / 1000)) {
  const biasa = nowSeconds + Math.round((expiresInHours || 8) * 3600);
  if (role === 'operator' && Number.isFinite(Number(shiftHabis))) {
    return Math.min(biasa, Number(shiftHabis));
  }
  return biasa;
}

// klaim shift & shiftHabis hanya dimasukkan bila ada (token lama tidak punya)
function klaim(payload) {
  const c = { role: payload.role, pv: payload.pv };
  if (payload.shift !== undefined && payload.shift !== null) c.shift = String(payload.shift);
  if (payload.shiftHabis !== undefined && payload.shiftHabis !== null) c.shiftHabis = Number(payload.shiftHabis);
  return c;
}

// isi token: sub (user id), role, pv (password version untuk membatalkan sesi lama),
// shift ('1'|'2'|'3') dan shiftHabis (detik epoch). Operator: exp = min(jam sesi, shiftHabis).
export function signSessionToken(payload, expiresInHours) {
  // [Tahap 2, 11-11-2026, T-21] Dinonaktifkan: exp sekarang dihitung lewat hitungExpSesi (batas shift operator).
  // return new SignJWT({ role: payload.role, pv: payload.pv })
  //   .setProtectedHeader({ alg: 'HS256' })
  //   .setSubject(String(payload.sub))
  //   .setIssuedAt()
  //   .setExpirationTime(`${expiresInHours || 8}h`)
  //   .sign(secretKey(getEnv().authSecret));
  return new SignJWT(klaim(payload))
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.sub))
    .setIssuedAt()
    .setExpirationTime(hitungExpSesi(payload, expiresInHours))
    .sign(secretKey(getEnv().authSecret));
}

// Perpanjang sesi tanpa mengubah batas absolut (exp tetap). Klaim shift ikut terbawa.
export function renewSessionToken(payload, expiresAtSeconds) {
  // [Tahap 2, 11-11-2026, T-21] Dinonaktifkan: klaim shift dan shiftHabis harus ikut terbawa.
  // return new SignJWT({ role: payload.role, pv: payload.pv })
  return new SignJWT(klaim(payload))
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.sub))
    .setIssuedAt()
    .setExpirationTime(expiresAtSeconds)
    .sign(secretKey(getEnv().authSecret));
}

// Opsi cookie sesi: TANPA maxAge/expires -> hilang saat browser ditutup.
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

export async function verifySessionToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(getEnv().authSecret));
    return payload; // { sub, role, pv, exp, ... }
  } catch {
    return null; // token salah / kedaluwarsa / diutak-atik
  }
}

export function getCookieName() {
  return SESSION_COOKIE;
}