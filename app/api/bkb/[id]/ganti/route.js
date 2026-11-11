// FILE: app/api/bkb/[id]/ganti/route.js
// Ganti BKB (K-13, K-15). DE dan SA, wajib konfirmasi password.

import { getRepository } from '@/lib/db';
import { gantiSchema, idParamSchema } from '@/lib/validations/koreksi';
import { confirmPassword } from '@/lib/auth/confirm-password';
import { requireAuth, requireRole, checkSameOrigin, jsonOk, jsonError, handleApiError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
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
  const parsed = gantiSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

  const { password, ...input } = parsed.data;
  const pw = await confirmPassword(result.user, password);
  if (pw.error) return pw.error;

  try {
    const data = await getRepository().gantiBkb(id.data, input, result.user);
    return jsonOk({ data });
  } catch (err) {
    return handleApiError(err, 'Gagal mengganti BKB.');
  }
}
