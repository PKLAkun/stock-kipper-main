// FILE: app/api/audit/route.js
// Riwayat aksi dari audit_log (K-24). DE dan SA.

import { getRepository } from '@/lib/db';
import { auditQuerySchema } from '@/lib/validations/koreksi';
import { requireAuth, requireRole, jsonOk, jsonError, handleApiError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const result = await requireAuth();
  if (result.error) return result.error;
  const roleCheck = requireRole(result.user, ['admin']);
  if (roleCheck.error) return roleCheck.error;

  // abaikan parameter kosong supaya default schema bekerja
  const params = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (value !== '') params[key] = value;
  }
  const query = auditQuerySchema.safeParse(params);
  if (!query.success) return jsonError(query.error.errors[0].message, 400);

  try {
    const { rows, total } = await getRepository().listAudit(query.data);
    return jsonOk({
      data: rows,
      meta: {
        total,
        page: query.data.page,
        limit: query.data.limit,
        totalPages: Math.max(1, Math.ceil(total / query.data.limit)),
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat riwayat aksi.');
  }
}
