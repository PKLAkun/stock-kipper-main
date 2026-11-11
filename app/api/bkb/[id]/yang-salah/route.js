// FILE: app/api/bkb/[id]/yang-salah/route.js
// SK memilih apa yang salah setelah saldo tidak cocok: BKB atau saldo.

import { getRepository } from '@/lib/db';
import { yangSalahSchema, idParamSchema } from '@/lib/validations/bkb';
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
  const parsed = yangSalahSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

  try {
    const r = await getRepository().yangSalahBkb(id.data, parsed.data, auth.user);
    return jsonOk({ data: { status: r.status, ditahanKarena: r.ditahanKarena } });
  } catch (err) {
    return handleApiError(err, 'Gagal menyimpan pilihan.');
  }
}
