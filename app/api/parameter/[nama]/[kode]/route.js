// FILE: app/api/parameter/[nama]/[kode]/route.js
// Ubah parameter (Superadmin). Kode (dan arah untuk jenis) ditolak 409 bila sudah dipakai BKB.

import { getRepository } from '@/lib/db';
import { PARAM_NAMA, parameterUpdateSchema } from '@/lib/validations/parameter';
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

    const { nama, kode } = await params;
    if (!PARAM_NAMA.includes(nama)) return jsonError('Parameter tidak dikenal.', 404);

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('Format data tidak valid.', 400);
    }
    const parsed = parameterUpdateSchema(nama).safeParse(body);
    if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

    const data = await getRepository().updateParameter(nama, decodeURIComponent(kode), parsed.data, {
      id: result.user.id, name: result.user.name,
    });
    if (!data) return jsonError('Parameter tidak ditemukan.', 404);
    return jsonOk({ data });
  } catch (err) {
    return handleApiError(err, 'Gagal menyimpan parameter.');
  }
}
