// FILE: app/api/opname/[id]/route.js
// Detail Cek Stok (GET: SK, DE, Superadmin) dan ubah draf atau yang ditolak (PUT: SK dan Superadmin).

import { getRepository } from '@/lib/db';
import { opnameIdSchema, opnameSimpanSchema } from '@/lib/validations/opname';
import {
  requireAuth, requireRole, checkSameOrigin, jsonOk, jsonError, handleApiError,
} from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const roleCheck = requireRole(auth.user, ['staff', 'admin']);
  if (roleCheck.error) return roleCheck.error;

  const id = opnameIdSchema.safeParse((await params).id);
  if (!id.success) return jsonError('Cek Stok tidak ditemukan.', 404);

  try {
    const data = await getRepository().getOpname(id.data);
    if (!data) return jsonError('Cek Stok tidak ditemukan.', 404);
    return jsonOk({ data });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat Cek Stok.');
  }
}

export async function PUT(request, { params }) {
  const originCheck = checkSameOrigin(request);
  if (!originCheck.ok) return originCheck.error;
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const roleCheck = requireRole(auth.user, ['staff', 'superadmin']);
  if (roleCheck.error) return roleCheck.error;

  const id = opnameIdSchema.safeParse((await params).id);
  if (!id.success) return jsonError('Cek Stok tidak ditemukan.', 404);

  let body;
  try { body = await request.json(); } catch { return jsonError('Format data tidak valid.', 400); }
  const parsed = opnameSimpanSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

  try {
    const data = await getRepository().simpanOpname(parsed.data, auth.user, id.data);
    return jsonOk({ data });
  } catch (err) {
    return handleApiError(err, 'Gagal menyimpan Cek Stok.');
  }
}
