// FILE: lib/auth/password.js
// Keamanan password: SELALU di-hash (bcrypt) sebelum disimpan.
// Password plain text tidak pernah disimpan maupun dikirim ke database.

import bcrypt from 'bcryptjs';

// hashPassword: mengubah password plain menjadi hash (untuk disimpan di DB)
export async function hashPassword(plainPassword) {
  // 10 = cost factor bcrypt (semakin besar, semakin lambat / aman)
  return bcrypt.hash(plainPassword, 10);
}

// verifyPassword: membandingkan input login dengan hash di database
export async function verifyPassword(plainPassword, hashedPassword) {
  if (!plainPassword || !hashedPassword) return false;
  return bcrypt.compare(plainPassword, hashedPassword);
}