import { NextResponse } from 'next/server';
import { getRepository } from '@/lib/db';
import { createSession } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/password';
import { checkSameOrigin, jsonError } from '@/lib/auth/guards';
import { checkLoginAttempt, recordLoginFailure, recordLoginSuccess, clientIpKey } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const originCheck = checkSameOrigin(request);
  if (!originCheck.ok) return originCheck.error;

  let body;
  try { body = await request.json(); } catch { return jsonError('Format data tidak valid.', 400); }

  const { operatorId, pin } = body;
  if (!operatorId || !pin) return jsonError('Operator dan PIN wajib diisi.', 400);

  // Dibatasi per IP dan per akun operator (docs/keamanan.md), supaya header IP palsu tidak membuka tebakan PIN tanpa batas
  const ipKey = clientIpKey(request);
  const accountKey = `operator:${Number(operatorId)}`;
  for (const key of [ipKey, accountKey]) {
    const attempt = checkLoginAttempt(key);
    if (!attempt.allowed) {
      return jsonError(`Terlalu banyak percobaan. Coba lagi dalam ${attempt.retryAfterSec} detik.`, 429);
    }
  }
  const fail = () => { recordLoginFailure(ipKey); recordLoginFailure(accountKey); };

  const user = await getRepository().findById(Number(operatorId));

  if (!user || user.role !== 'operator' || !user.active) {
    fail();
    return jsonError('Operator tidak ditemukan atau tidak aktif.', 401);
  }

  if (!user.pinHash) {
    fail();
    return jsonError('PIN belum diatur untuk operator ini. Hubungi admin.', 401);
  }

  const match = await verifyPassword(String(pin), user.pinHash);
  if (!match) {
    fail();
    return jsonError('PIN salah.', 401);
  }

  recordLoginSuccess(accountKey);
  await createSession(user);

  return NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, role: user.role, email: user.email },
  });
}