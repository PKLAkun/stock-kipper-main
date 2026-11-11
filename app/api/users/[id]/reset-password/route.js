// FILE: app/api/users/[id]/reset-password/route.js
// Reset password user (KHUSUS SUPERADMIN). password_version naik, sehingga sesi lama user itu berakhir.

import { getRepository } from '@/lib/db';
import { resetPasswordSchema } from '@/lib/validations/auth';
import { hashPassword } from '@/lib/auth/password';
import { requireAuth, requireRole, checkSameOrigin, handleApiError, jsonOk, jsonError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  try {
    const originCheck = checkSameOrigin(request);
    if (!originCheck.ok) return originCheck.error;
    const result = await requireAuth();
    if (result.error) return result.error;
    const roleCheck = requireRole(result.user, ['superadmin']);
    if (roleCheck.error) return roleCheck.error;

    const { id } = await params;
    const targetId = Number(id);
    if (!Number.isInteger(targetId) || targetId <= 0) return jsonError('ID tidak valid.', 400);

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('Format data tidak valid.', 400);
    }
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

    const repo = getRepository();
    const target = await repo.findById(targetId);
    if (!target) return jsonError('User tidak ditemukan.', 404);
    if (target.role === 'operator') return jsonError('Operator memakai PIN, bukan password.', 400);

    const passwordHash = await hashPassword(parsed.data.password);
    await repo.resetPassword(targetId, passwordHash, { id: result.user.id, name: result.user.name });
    return jsonOk({ message: 'Password berhasil direset. Sesi lama user tersebut ditutup.' });
  } catch (err) {
    return handleApiError(err, 'Gagal mereset password.');
  }
}
