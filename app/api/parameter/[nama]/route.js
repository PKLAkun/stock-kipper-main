// FILE: app/api/parameter/[nama]/route.js
// Parameter (tujuan, dept-pemakai, dept-proses, jenis): daftar untuk semua role yang login,
// tambah hanya Superadmin. Tidak ada hapus; nonaktif lewat aktif:false.

import { getRepository } from '@/lib/db';
import { PARAM_NAMA, parameterCreateSchema } from '@/lib/validations/parameter';
import { requireAuth, requireRole, checkSameOrigin, handleApiError, jsonOk, jsonError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const result = await requireAuth();
    if (result.error) return result.error;
    const { nama } = await params;
    if (!PARAM_NAMA.includes(nama)) return jsonError('Parameter tidak dikenal.', 404);

    const aktifSaja = new URL(request.url).searchParams.get('aktif') === '1';
    const data = await getRepository().listParameter(nama, { aktifSaja });
    return jsonOk({ data });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat parameter.');
  }
}

export async function POST(request, { params }) {
  try {
    const originCheck = checkSameOrigin(request);
    if (!originCheck.ok) return originCheck.error;
    const result = await requireAuth();
    if (result.error) return result.error;
    const roleCheck = requireRole(result.user, ['superadmin']);
    if (roleCheck.error) return roleCheck.error;

    const { nama } = await params;
    if (!PARAM_NAMA.includes(nama)) return jsonError('Parameter tidak dikenal.', 404);

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('Format data tidak valid.', 400);
    }
    const parsed = parameterCreateSchema(nama).safeParse(body);
    if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

    const data = await getRepository().createParameter(nama, parsed.data, { id: result.user.id, name: result.user.name });
    return jsonOk({ data }, 201);
  } catch (err) {
    return handleApiError(err, 'Gagal menyimpan parameter.');
  }
}
