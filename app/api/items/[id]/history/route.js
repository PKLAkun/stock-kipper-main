// FILE: app/api/items/[id]/history/route.js
// Riwayat perubahan stok untuk satu barang: siapa, apa, kapan.

import { getRepository } from '@/lib/db';
import { requireAuth, jsonOk, jsonError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const result = await requireAuth();
  if (result.error) return result.error;

  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return jsonError('ID tidak valid.', 400);
  }

  const repo = getRepository();
  const itemExists = await repo.findItemById(itemId);
  if (!itemExists) return jsonError('Barang tidak ditemukan.', 404);

  const history = await repo.itemHistory(itemId, 100);
  return jsonOk({ data: history });
}