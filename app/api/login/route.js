// FILE: app/api/login/route.js
// Endpoint LOGIN (satu-satunya yang publik).
// Mengembalikan cookie sesi httpOnly setelah email+password diverifikasi.

import { NextResponse } from 'next/server';
import { loginSchema } from '@/lib/validations/auth';
import { verifyPassword } from '@/lib/auth/password';
import { getRepository } from '@/lib/db';
import { createSession } from '@/lib/auth/session';
import {
  checkLoginAttempt,
  recordLoginFailure,
  recordLoginSuccess,
  clientIpKey,
} from '@/lib/auth/rate-limit';
import { checkSameOrigin, jsonError, publicUser } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  // 1) cek asal request (CSRF) bila header Origin tersedia
  const originCheck = checkSameOrigin(request);
  if (!originCheck.ok) return originCheck.error;

  // 2) baca & validasi body (Zod)
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Format data tidak valid.', 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.errors[0].message, 400);
  }
  const { email, password } = parsed.data;

  // 3) rate limiting (proteksi brute-force) — dibatasi per IP dan per email
  const ipKey = clientIpKey(request);
  const emailKey = `email:${email.toLowerCase()}`;
  for (const key of [ipKey, emailKey]) {
    const attempt = checkLoginAttempt(key);
    if (!attempt.allowed) {
      return jsonError(
        `Terlalu banyak percobaan. Coba lagi dalam ${attempt.retryAfterSec} detik.`,
        429
      );
    }
  }

  // 4) cari user + verifikasi password
  const repo = getRepository();
  const user = await repo.findByEmail(email.toLowerCase());

  // pesan seragam utk "email tidak ada" & "password salah" (anti user-enumeration)
  const FAIL_MESSAGE = 'Email atau password salah.';

  if (!user) {
    recordLoginFailure(emailKey);
    recordLoginFailure(ipKey);
    return jsonError(FAIL_MESSAGE, 401);
  }

  if (!user.active) {
    recordLoginFailure(emailKey);
    recordLoginFailure(ipKey);
    return jsonError('Akun Anda dinonaktifkan. Hubungi administrator.', 403);
  }

  const passwordMatch = await verifyPassword(password, user.passwordHash);
  if (!passwordMatch) {
    recordLoginFailure(emailKey);
    recordLoginFailure(ipKey);
    return jsonError(FAIL_MESSAGE, 401);
  }

  // 5) sukses: reset catatan percobaan & buat sesi (cookie httpOnly)
  recordLoginSuccess(emailKey);
  recordLoginSuccess(ipKey);
  await createSession(user);

  return NextResponse.json({ ok: true, user: publicUser(user) });
}