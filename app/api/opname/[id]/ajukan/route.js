// FILE: app/api/opname/[id]/ajukan/route.js
// Ajukan Cek Stok (draf atau ditolak -> diajukan). SK dan Superadmin. Analisa dicek di fungsi SQL.

import { getRepository } from '@/lib/db';
import { opnameIdSchema } from '@/lib/validations/opname';
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

  try {
    const data = await getRepository().ajukanOpname(id.data, auth.user);
    return jsonOk({ data });
  } catch (err) {
    return handleApiError(err, 'Gagal mengajukan Cek Stok.');
  }
}
