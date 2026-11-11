// FILE: app/api/opname/route.js
// Cek Stok (K-31). GET: SK, DE, Superadmin. POST (buat draf): SK dan Superadmin (P-52). Operator 403.

import { getRepository } from '@/lib/db';
import { opnameQuerySchema, opnameSimpanSchema } from '@/lib/validations/opname';
import {
  requireAuth, requireRole, checkSameOrigin, jsonOk, jsonError, handleApiError,
} from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const roleCheck = requireRole(auth.user, ['staff', 'admin']);
  if (roleCheck.error) return roleCheck.error;

  const params = {};
  for (const [k, v] of new URL(request.url).searchParams) if (v !== '') params[k] = v;
  const query = opnameQuerySchema.safeParse(params);
  if (!query.success) return jsonError(query.error.errors[0].message, 400);

  try {
    const { items, total } = await getRepository().listOpname(query.data);
    return jsonOk({
      data: items,
      meta: {
        total, page: query.data.page, limit: query.data.limit,
        totalPages: Math.max(1, Math.ceil(total / query.data.limit)),
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat daftar Cek Stok.');
  }
}

export async function POST(request) {
  const originCheck = checkSameOrigin(request);
  if (!originCheck.ok) return originCheck.error;
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const roleCheck = requireRole(auth.user, ['staff', 'superadmin']);
  if (roleCheck.error) return roleCheck.error;

  let body;
  try { body = await request.json(); } catch { return jsonError('Format data tidak valid.', 400); }
  const parsed = opnameSimpanSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

  try {
    const data = await getRepository().simpanOpname(parsed.data, auth.user);
    return jsonOk({ data }, 201);
  } catch (err) {
    return handleApiError(err, 'Gagal menyimpan Cek Stok.');
  }
}
