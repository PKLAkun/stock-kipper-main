// FILE: app/api/users/[id]/route.js
// Kelola pengguna (KHUSUS SUPERADMIN): ubah (PUT) dan hapus (DELETE).

import { getRepository } from '@/lib/db';
import { updateUserSchema } from '@/lib/validations/users';
import { requireAuth, requireRole, checkSameOrigin, handleApiError, jsonOk, jsonError, publicUser } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PESAN_SA_TERAKHIR = 'Minimal harus ada satu Superadmin aktif.';

function parseId(rawId) {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// true bila perubahan ini menghilangkan satu superadmin aktif
function mengurangiSuperadminAktif(target, role, active) {
  return target.role === 'superadmin' && target.active && (role !== 'superadmin' || !active);
}

export async function PUT(request, { params }) {
  try {
    const originCheck = checkSameOrigin(request);
    if (!originCheck.ok) return originCheck.error;
    const result = await requireAuth();
    if (result.error) return result.error;
    const roleCheck = requireRole(result.user, ['superadmin']);
    if (roleCheck.error) return roleCheck.error;

    const { id } = await params;
    const targetId = parseId(id);
    if (!targetId) return jsonError('ID tidak valid.', 400);

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('Format data tidak valid.', 400);
    }
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

    const repo = getRepository();
    const target = await repo.findById(targetId);
    if (!target) return jsonError('User tidak ditemukan.', 404);

    const { role, active } = parsed.data;
    if (targetId === result.user.id && (role !== target.role || !active)) {
      return jsonError('Anda tidak bisa menonaktifkan atau menurunkan role diri sendiri.', 400);
    }
    // operator memakai PIN, role lain memakai email dan password: tidak bisa saling diganti
    if ((target.role === 'operator') !== (role === 'operator')) {
      return jsonError('Role Operator tidak bisa diubah dari atau ke role lain. Buat akun baru.', 400);
    }
    if (mengurangiSuperadminAktif(target, role, active) && (await repo.countByRole('superadmin', { activeOnly: true })) <= 1) {
      return jsonError(PESAN_SA_TERAKHIR, 409);
    }

    const updated = await repo.updateUser(targetId, parsed.data, { id: result.user.id, name: result.user.name });
    return jsonOk({ data: publicUser(updated), message: 'Data user berhasil diubah.' });
  } catch (err) {
    return handleApiError(err, 'Gagal mengubah data user.');
  }
}

export async function DELETE(request, { params }) {
  try {
    const originCheck = checkSameOrigin(request);
    if (!originCheck.ok) return originCheck.error;
    const result = await requireAuth();
    if (result.error) return result.error;
    const roleCheck = requireRole(result.user, ['superadmin']);
    if (roleCheck.error) return roleCheck.error;

    const { id } = await params;
    const targetId = parseId(id);
    if (!targetId) return jsonError('ID tidak valid.', 400);
    if (targetId === result.user.id) return jsonError('Anda tidak bisa menghapus akun sendiri.', 400);

    const repo = getRepository();
    const target = await repo.findById(targetId);
    if (!target) return jsonError('User tidak ditemukan.', 404);
    if (mengurangiSuperadminAktif(target, 'x', false) && (await repo.countByRole('superadmin', { activeOnly: true })) <= 1) {
      return jsonError(PESAN_SA_TERAKHIR, 409);
    }

    await repo.deleteUser(targetId, { id: result.user.id, name: result.user.name });
    return jsonOk({ message: 'User berhasil dihapus.' });
  } catch (err) {
    return handleApiError(err, 'Gagal menghapus user.');
  }
}
