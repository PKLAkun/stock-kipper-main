// FILE: app/api/bkb/[id]/batal/route.js
// Batal BKB.
// - Belum tersimpan (menunggu, ditahan, menunggu_de): SK, DE, SA. Tanpa password.
// - selesai: hanya DE/SA, wajib versi + password (stok dibalik oleh SQL).

import { getRepository } from '@/lib/db';
import { batalSchema, batalSelesaiSchema, idParamSchema } from '@/lib/validations/bkb';
import { confirmPassword } from '@/lib/auth/confirm-password';
import {
  requireAuth, requireRole, checkSameOrigin, jsonOk, jsonError, handleApiError,
} from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BELUM_TERSIMPAN = ['menunggu', 'ditahan', 'menunggu_de'];

export async function POST(request, { params }) {
  const originCheck = checkSameOrigin(request);
  if (!originCheck.ok) return originCheck.error;

  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const roleCheck = requireRole(auth.user, ['staff', 'admin']);
  if (roleCheck.error) return roleCheck.error;

  const id = idParamSchema.safeParse((await params).id);
  if (!id.success) return jsonError('BKB tidak ditemukan.', 404);

  let body;
  try { body = await request.json(); } catch { return jsonError('Format data tidak valid.', 400); }

  try {
    const repo = getRepository();
    const bkb = await repo.getBkb(id.data);
    if (!bkb) return jsonError('BKB tidak ditemukan.', 404);

    if (BELUM_TERSIMPAN.includes(bkb.status)) {
      const parsed = batalSchema.safeParse(body);
      if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);
      const r = await repo.batalBkb(id.data, parsed.data.alasan, auth.user);
      return jsonOk({ data: { status: r.status } });
    }

    if (bkb.status !== 'selesai') {
      return jsonError('Status BKB tidak mengizinkan pembatalan.', 409);
    }

    // BKB selesai: stok dibalik, hanya DE/SA dan wajib password
    const adminCheck = requireRole(auth.user, ['admin']);
    if (adminCheck.error) return adminCheck.error;

    const parsed = batalSelesaiSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

    const pw = await confirmPassword(auth.user, parsed.data.password);
    if (pw.error) return pw.error;

    // bandingkan sebagai waktu, bukan string (format timestamp bisa beda)
    const kirim = new Date(parsed.data.versi).getTime();
    if (Number.isNaN(kirim)) return jsonError('Versi tidak valid.', 400);
    if (kirim !== new Date(bkb.versi).getTime()) {
      return jsonError('BKB berubah sejak dialog dibuka. Buka dialog lagi.', 409);
    }
    // SQL membandingkan lagi setelah FOR UPDATE (VERSI_BERUBAH => 409)
    const r = await repo.batalBkb(id.data, parsed.data.alasan, auth.user, parsed.data.versi);
    return jsonOk({ data: { status: r.status } });
  } catch (err) {
    return handleApiError(err, 'Gagal membatalkan BKB.');
  }
}
