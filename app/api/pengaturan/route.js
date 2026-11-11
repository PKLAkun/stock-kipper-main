// FILE: app/api/pengaturan/route.js
// Pengaturan aplikasi. GET: semua role yang login. PUT: Superadmin dengan konfirmasi password.

import { getRepository } from '@/lib/db';
import { pengaturanSchema } from '@/lib/validations/parameter';
import { confirmPassword } from '@/lib/auth/confirm-password';
import { requireAuth, requireRole, checkSameOrigin, handleApiError, jsonOk, jsonError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await requireAuth();
    if (result.error) return result.error;
    const data = await getRepository().getPengaturan();
    return jsonOk({ data });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat pengaturan.');
  }
}

export async function PUT(request) {
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
    const parsed = pengaturanSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

    const konfirmasi = await confirmPassword(result.user, parsed.data.password);
    if (konfirmasi.error) return konfirmasi.error;

    const data = await getRepository().setPengaturan(
      { wajibApproveDe: parsed.data.wajibApproveDe, peranBuatBkb: parsed.data.peranBuatBkb, peranBuatPengganti: parsed.data.peranBuatPengganti, alasan: parsed.data.alasan || null },
      { id: result.user.id, name: result.user.name }
    );
    return jsonOk({ data });
  } catch (err) {
    return handleApiError(err, 'Pengaturan belum berubah. Coba lagi.');
  }
}
