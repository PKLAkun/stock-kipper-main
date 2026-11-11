// FILE: app/api/opname/[id]/setujui/route.js
// Setujui Cek Stok (diajukan -> disetujui; selisih diterapkan ke stok oleh fungsi SQL).
// DE dan Superadmin. Wajib nama atasan, nomor Berita Acara, dan konfirmasi password.
// Pembuat tidak boleh menyetujui miliknya sendiri (TIDAK_BOLEH_SENDIRI, 403, dicek di SQL).

import { getRepository } from '@/lib/db';
import { opnameIdSchema, opnameSetujuiSchema } from '@/lib/validations/opname';
import { confirmPassword } from '@/lib/auth/confirm-password';
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
  const roleCheck = requireRole(auth.user, ['admin']);
  if (roleCheck.error) return roleCheck.error;

  const id = opnameIdSchema.safeParse((await params).id);
  if (!id.success) return jsonError('Cek Stok tidak ditemukan.', 404);

  let body;
  try { body = await request.json(); } catch { return jsonError('Format data tidak valid.', 400); }
  const parsed = opnameSetujuiSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

  const { password, ...input } = parsed.data;
  const pw = await confirmPassword(auth.user, password);
  if (pw.error) return pw.error;

  try {
    const data = await getRepository().approveOpname(id.data, input, auth.user);
    return jsonOk({ data });
  } catch (err) {
    return handleApiError(err, 'Gagal menyetujui Cek Stok.');
  }
}
