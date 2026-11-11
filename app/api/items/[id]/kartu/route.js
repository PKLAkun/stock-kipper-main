// FILE: app/api/items/[id]/kartu/route.js
// Kartu stok per barang menurut nomor urut (K-21). SK, DE, dan SA.

import { getRepository } from '@/lib/db';
import { idParamSchema } from '@/lib/validations/koreksi';
import { requireAuth, requireRole, jsonOk, jsonError, handleApiError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const result = await requireAuth();
  if (result.error) return result.error;
  const roleCheck = requireRole(result.user, ['staff', 'admin']);
  if (roleCheck.error) return roleCheck.error;

  const id = idParamSchema.safeParse((await params).id);
  if (!id.success) return jsonError('ID tidak valid.', 400);

  try {
    const data = await getRepository().getKartuStok(id.data);
    if (!data) return jsonError('Barang tidak ditemukan.', 404);
    return jsonOk({ data });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat kartu stok.');
  }
}
