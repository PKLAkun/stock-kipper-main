// FILE: app/api/users/[id]/set-pin/route.js
// Set PIN akun operator (KHUSUS SUPERADMIN). PIN disimpan sebagai bcrypt di kolom pin_hash.

import { getRepository } from '@/lib/db';
import { setPinSchema } from '@/lib/validations/users';
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
    const parsed = setPinSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

    const repo = getRepository();
    const target = await repo.findById(targetId);
    if (!target) return jsonError('User tidak ditemukan.', 404);
    if (target.role !== 'operator') return jsonError('PIN hanya untuk role operator.', 400);

    const pinHash = await hashPassword(parsed.data.pin);
    await repo.setPin(targetId, pinHash, { id: result.user.id, name: result.user.name });
    return jsonOk({ message: 'PIN berhasil diset.' });
  } catch (err) {
    return handleApiError(err, 'Gagal menyimpan PIN.');
  }
}
