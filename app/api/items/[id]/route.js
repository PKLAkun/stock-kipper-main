// FILE: app/api/items/[id]/route.js
// Detail (semua role), edit & hapus (khusus admin).

import { getRepository } from '@/lib/db';
import { itemUpdateSchema } from '@/lib/validations/items';
import { requireAuth, requireRole, checkSameOrigin, jsonOk, jsonError, handleApiError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const parseId = (raw) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export async function GET(request, { params }) {
  const result = await requireAuth();
  if (result.error) return result.error;
  const itemId = parseId((await params).id);
  if (!itemId) return jsonError('ID tidak valid.', 400);
  try {
    const item = await getRepository().findItemById(itemId);
    if (!item) return jsonError('Barang tidak ditemukan.', 404);
    return jsonOk({ data: item });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request, { params }) {
  const originCheck = checkSameOrigin(request);
  if (!originCheck.ok) return originCheck.error;
  const result = await requireAuth();
  if (result.error) return result.error;
  const roleCheck = requireRole(result.user, ['admin']);
  if (roleCheck.error) return roleCheck.error;

  const itemId = parseId((await params).id);
  if (!itemId) return jsonError('ID tidak valid.', 400);

  let body;
  try { body = await request.json(); } catch { return jsonError('Format data tidak valid.', 400); }
  const parsed = itemUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

  try {
    const item = await getRepository().updateItem(itemId, parsed.data, result.user);
    if (!item) return jsonError('Barang tidak ditemukan.', 404);
    return jsonOk({ data: item, message: 'Perubahan berhasil disimpan.' });
  } catch (err) {
    return handleApiError(err, 'Gagal menyimpan perubahan.');
  }
}

export async function DELETE(request, { params }) {
  const originCheck = checkSameOrigin(request);
  if (!originCheck.ok) return originCheck.error;
  const result = await requireAuth();
  if (result.error) return result.error;
  const roleCheck = requireRole(result.user, ['admin']);
  if (roleCheck.error) return roleCheck.error;

  const itemId = parseId((await params).id);
  if (!itemId) return jsonError('ID tidak valid.', 400);
  try {
    const deleted = await getRepository().deleteItem(itemId);
    if (!deleted) return jsonError('Barang tidak ditemukan.', 404);
    return jsonOk({ message: 'Barang berhasil dihapus.' });
  } catch (err) {
    return handleApiError(err, 'Gagal menghapus barang.');
  }
}
