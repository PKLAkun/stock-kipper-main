// FILE: app/api/users/route.js
// Kelola pengguna (KHUSUS SUPERADMIN): daftar (GET) dan tambah (POST).
// Operator memakai PIN (pin_hash) tanpa email dan password.

import { getRepository } from '@/lib/db';
import { createUserSchema } from '@/lib/validations/users';
import { hashPassword } from '@/lib/auth/password';
import { requireAuth, requireRole, checkSameOrigin, handleApiError, jsonOk, jsonError, publicUser } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await requireAuth();
    if (result.error) return result.error;
    const roleCheck = requireRole(result.user, ['superadmin']);
    if (roleCheck.error) return roleCheck.error;

    const users = await getRepository().listUsers();
    return jsonOk({ data: users.map(publicUser) });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat data user.');
  }
}

export async function POST(request) {
  try {
    const originCheck = checkSameOrigin(request);
    if (!originCheck.ok) return originCheck.error;

    const result = await requireAuth();
    if (result.error) return result.error;
    const roleCheck = requireRole(result.user, ['superadmin']);
    if (roleCheck.error) return roleCheck.error;

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('Format data tidak valid.', 400);
    }
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

    const repo = getRepository();
    const data = {
      name: parsed.data.name, role: parsed.data.role,
      inisial: parsed.data.inisial, timKode: parsed.data.timKode, tujuanKode: parsed.data.tujuanKode,
    };
    if (parsed.data.role === 'operator') {
      data.pinHash = await hashPassword(parsed.data.pin);
    } else {
      if (await repo.findByEmail(parsed.data.email)) return jsonError('Email sudah dipakai.', 409);
      data.email = parsed.data.email;
      data.passwordHash = await hashPassword(parsed.data.password);
    }
    const user = await repo.createUser(data, { id: result.user.id, name: result.user.name });
    return jsonOk({ data: publicUser(user), message: 'User berhasil dibuat.' }, 201);
  } catch (err) {
    return handleApiError(err, 'Gagal membuat user.');
  }
}
