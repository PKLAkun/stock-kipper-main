// FILE: app/api/machines/[id]/route.js
// Ubah mesin (Superadmin). Menggantikan hapus: nonaktif lewat active:false. Kode terkunci setelah dipakai BKB.

import { getRepository } from '@/lib/db';
import { machineSchema } from '@/lib/validations/parameter';
import { requireAuth, requireRole, checkSameOrigin, handleApiError, jsonOk, jsonError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  try {
    const originCheck = checkSameOrigin(request);
    if (!originCheck.ok) return originCheck.error;
    const result = await requireAuth();
    if (result.error) return result.error;
    const roleCheck = requireRole(result.user, ['superadmin']);
    if (roleCheck.error) return roleCheck.error;

    const { id } = await params;
    const mesinId = Number(id);
    if (!Number.isInteger(mesinId) || mesinId <= 0) return jsonError('ID tidak valid.', 400);

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('Format data tidak valid.', 400);
    }
    const parsed = machineSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

    const data = await getRepository().updateMachine(
      mesinId,
      { ...parsed.data, active: parsed.data.active ?? true },
      { id: result.user.id, name: result.user.name }
    );
    if (!data) return jsonError('Mesin tidak ditemukan.', 404);
    return jsonOk({ data });
  } catch (err) {
    return handleApiError(err);
  }
}
