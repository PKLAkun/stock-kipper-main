// FILE: app/api/bkb/[id]/konfirmasi/route.js
// SK mengetik saldo akhir. Saldo sistem hanya dikirim bila ada yang tidak cocok.

import { getRepository } from '@/lib/db';
import { konfirmasiSchema, idParamSchema } from '@/lib/validations/bkb';
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
  const roleCheck = requireRole(auth.user, ['staff']);
  if (roleCheck.error) return roleCheck.error;

  const id = idParamSchema.safeParse((await params).id);
  if (!id.success) return jsonError('BKB tidak ditemukan.', 404);

  let body;
  try { body = await request.json(); } catch { return jsonError('Format data tidak valid.', 400); }
  const parsed = konfirmasiSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

  try {
    const bkb = await getRepository().konfirmasiBkb(id.data, parsed.data, auth.user);
    const adaSelisih = bkb.items.some((r) => r.cocok === false);
    const baris = bkb.items.map((r) => ({
      itemId: r.itemId,
      saldoSk: r.saldoSk,
      cocok: r.cocok,
      // saldo sistem dan selisih hanya dibuka saat ada yang tidak cocok
      ...(adaSelisih
        ? { saldoSistem: r.saldoSistemKonfirmasi, selisih: r.saldoSk - r.saldoSistemKonfirmasi }
        : {}),
    }));
    return jsonOk({ data: { status: bkb.status, baris } });
  } catch (err) {
    return handleApiError(err, 'Gagal mengonfirmasi saldo.');
  }
}
