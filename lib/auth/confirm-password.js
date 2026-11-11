// FILE: lib/auth/confirm-password.js
// Konfirmasi password user yang sedang login untuk aksi penting.
// Rate limit per user (kunci `confirm:<userId>`), memakai limiter yang ada.

import { getRepository } from '../db/index.js';
import { jsonError } from './guards.js';
import { verifyPassword } from './password.js';
import { checkLoginAttempt, recordLoginFailure, recordLoginSuccess } from './rate-limit.js';

// Balikan { ok: true } atau { error: Response } (401 salah, 429 terlalu banyak).
export async function confirmPassword(user, password) {
  const key = `confirm:${user.id}`;
  const attempt = checkLoginAttempt(key);
  if (!attempt.allowed) {
    return { error: jsonError(`Terlalu banyak percobaan. Coba lagi dalam ${attempt.retryAfterSec} detik.`, 429) };
  }

  // hash diambil dari database, bukan dari objek sesi yang dikirim pemanggil
  const record = await getRepository().findById(user.id);
  const match = await verifyPassword(String(password || ''), record?.passwordHash);
  if (!match) {
    recordLoginFailure(key);
    return { error: jsonError('Password salah.', 401) };
  }

  recordLoginSuccess(key);
  return { ok: true };
}
