// FILE: app/api/logout/route.js
// Endpoint LOGOUT — menghapus cookie sesi.

import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth/session';
import { checkSameOrigin } from '@/lib/auth/guards';

export const runtime = 'nodejs';

export async function POST(request) {
  // proteksi CSRF standar untuk endpoint yang mengubah sesi
  const originCheck = checkSameOrigin(request);
  if (!originCheck.ok) return originCheck.error;

  await destroySession();
  return NextResponse.json({ ok: true });
}