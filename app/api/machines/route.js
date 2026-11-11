// FILE: app/api/machines/route.js
// Mesin. GET: semua role yang login. POST: Superadmin. Tidak ada hapus; nonaktif lewat PUT.

import { getRepository } from '@/lib/db';
import { machineSchema } from '@/lib/validations/parameter';
import { requireAuth, requireRole, checkSameOrigin, handleApiError, jsonOk, jsonError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const result = await requireAuth();
    if (result.error) return result.error;
    const repo = getRepository();
    const q = new URL(request.url).searchParams.get('q') || '';
    const data = q ? await repo.searchMachines(q, true) : await repo.listMachines();
    return jsonOk({ data });
  } catch (err) {
    return handleApiError(err);
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
    const parsed = machineSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

    const data = await getRepository().createMachine(parsed.data, { id: result.user.id, name: result.user.name });
    return jsonOk({ data }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
