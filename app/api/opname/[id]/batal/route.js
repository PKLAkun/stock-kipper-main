// FILE: app/api/opname/[id]/batal/route.js
// Batalkan Cek Stok (draf atau ditolak -> dibatalkan). SK dan Superadmin. Alasan wajib.

import { getRepository } from '@/lib/db';
import { opnameIdSchema, opnameBatalSchema } from '@/lib/validations/opname';
import {
  requireAuth, requireRole, checkSameOrigin, jsonOk, jsonError, handleApiError,
} from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const originCheck = checkSameOrigin(request);
  if (!originCheck.ok) return originCheck.error;
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const roleCheck = requireRole(auth.user, ['staff', 'superadmin']);
  if (roleCheck.error) return roleCheck.error;

  const id = opnameIdSchema.safeParse((await params).id);
  if (!id.success) return jsonError('Cek Stok tidak ditemukan.', 404);

  let body;
  try { body = await request.json(); } catch { return jsonError('Format data tidak valid.', 400); }
  const parsed = opnameBatalSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

  try {
    const data = await getRepository().batalOpname(id.data, parsed.data.alasan, auth.user);
    return jsonOk({ data });
  } catch (err) {
    return handleApiError(err, 'Gagal membatalkan Cek Stok.');
  }
}
