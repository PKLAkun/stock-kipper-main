// FILE: app/api/bkb/[id]/route.js
// GET: detail BKB (operator hanya miliknya) | PUT: Betulkan BKB (SK).

import { getRepository } from '@/lib/db';
import { bkbUpdateSchema, idParamSchema } from '@/lib/validations/bkb';
import {
  requireAuth, requireRole, checkSameOrigin, jsonOk, jsonError, handleApiError,
} from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const id = idParamSchema.safeParse((await params).id);
  if (!id.success) return jsonError('BKB tidak ditemukan.', 404);

  const ownerId = auth.user.role === 'operator' ? auth.user.id : undefined;
  try {
    const bkb = await getRepository().getBkb(id.data, { ownerId });
    // milik orang lain disembunyikan dari operator sebagai 404
    if (!bkb) return jsonError('BKB tidak ditemukan.', 404);
    return jsonOk({ data: bkb });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat BKB.');
  }
}

export async function PUT(request, { params }) {
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

  const parsed = bkbUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

  try {
    const saved = await getRepository().updateBkb(id.data, parsed.data, auth.user);
    return jsonOk({ data: saved });
  } catch (err) {
    return handleApiError(err, 'Gagal membetulkan BKB.');
  }
}
