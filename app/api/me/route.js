// FILE: app/api/me/route.js
// Mengembalikan data user yang sedang login (dipakai komponen untuk menampilkan nama/role).

import { requireAuth, jsonOk, publicUser } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await requireAuth();
  if (result.error) return result.error;
  return jsonOk({ user: publicUser(result.user) });
}