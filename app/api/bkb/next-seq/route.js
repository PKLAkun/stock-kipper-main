// FILE: app/api/bkb/next-seq/route.js
// Kembalikan nomor urut berikutnya untuk kombinasi tujuan+inisial.
// Dipakai form BKB untuk auto-fill nomor urut (masih bisa diedit).
// Contoh: GET /api/bkb/next-seq?tujuan=BIP&inisial=AND → { next: 3 }

import { getRepository } from '@/lib/db';
import { requireAuth, jsonOk, jsonError, handleApiError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const result = await requireAuth();
  if (result.error) return result.error;

  const url = new URL(request.url);
  const tujuan  = url.searchParams.get('tujuan')?.trim().toUpperCase() || '';
  const inisial = url.searchParams.get('inisial')?.trim().toUpperCase() || '';

  // Kode tujuan kini dari tabel param_tujuan; cukup cek format di sini
  if (!/^[A-Z0-9_-]{1,20}$/.test(tujuan)) return jsonError('Tujuan tidak valid.', 400);

  try {
    const next = await getRepository().nextBkbSeq(tujuan, inisial);
    return jsonOk({ next });
  } catch (err) {
    return handleApiError(err, 'Gagal mengambil nomor urut.');
  }
}
