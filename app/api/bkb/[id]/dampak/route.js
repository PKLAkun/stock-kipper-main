// FILE: app/api/bkb/[id]/dampak/route.js
// Isi dialog konfirmasi batal/ganti (K-15). Hanya DE dan SA.

import { getRepository } from '@/lib/db';
import { dampakQuerySchema, idParamSchema } from '@/lib/validations/koreksi';
import { requireAuth, requireRole, jsonOk, jsonError, handleApiError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const result = await requireAuth();
  if (result.error) return result.error;
  const roleCheck = requireRole(result.user, ['admin']);
  if (roleCheck.error) return roleCheck.error;

  const id = idParamSchema.safeParse((await params).id);
  if (!id.success) return jsonError('ID tidak valid.', 400);

  const query = dampakQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return jsonError(query.error.errors[0].message, 400);

  try {
    const data = await getRepository().getDampakBkb(id.data, query.data);
    if (!data) return jsonError('BKB tidak ditemukan.', 404);
    return jsonOk({ data });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat dampak.');
  }
}
