// FILE: app/api/bkb/[id]/data/route.js
// Ubah data BKB yang sudah tersimpan (K-16): hanya kolom non-stok. DE dan SA, wajib password.

import { getRepository } from '@/lib/db';
import { ubahDataSchema, idParamSchema } from '@/lib/validations/koreksi';
import { confirmPassword } from '@/lib/auth/confirm-password';
import { requireAuth, requireRole, checkSameOrigin, jsonOk, jsonError, handleApiError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const originCheck = checkSameOrigin(request);
  if (!originCheck.ok) return originCheck.error;
  const result = await requireAuth();
  if (result.error) return result.error;
  const roleCheck = requireRole(result.user, ['admin']);
  if (roleCheck.error) return roleCheck.error;

  const id = idParamSchema.safeParse((await params).id);
  if (!id.success) return jsonError('ID tidak valid.', 400);

  let body;
  try { body = await request.json(); } catch { return jsonError('Format data tidak valid.', 400); }
  const parsed = ubahDataSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

  const { password, ...input } = parsed.data;
  const pw = await confirmPassword(result.user, password);
  if (pw.error) return pw.error;

  try {
    const data = await getRepository().ubahDataBkb(id.data, input, result.user);
    return jsonOk({ data });
  } catch (err) {
    return handleApiError(err, 'Gagal mengubah data BKB.');
  }
}
