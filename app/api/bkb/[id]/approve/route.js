// FILE: app/api/bkb/[id]/approve/route.js
// DE/SA approve. SK ikut diizinkan di route; SQL hanya meloloskan SK untuk
// BKB menunggu_de saat pengaturan "Wajib approve DE" nonaktif.

import { getRepository } from '@/lib/db';
import { idParamSchema } from '@/lib/validations/bkb';
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
  const roleCheck = requireRole(auth.user, ['admin', 'staff']);
  if (roleCheck.error) return roleCheck.error;

  const id = idParamSchema.safeParse((await params).id);
  if (!id.success) return jsonError('BKB tidak ditemukan.', 404);

  try {
    const bkb = await getRepository().approveBkb(id.data, auth.user);
    return jsonOk({
      data: {
        status: bkb.status,
        baris: bkb.items.map((r) => ({
          itemId: r.itemId, nomorUrut: r.nomorUrut, saldoSetelah: r.saldoSetelah,
        })),
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal menyetujui BKB.');
  }
}
