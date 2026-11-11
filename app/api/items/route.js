// FILE: app/api/items/route.js
// Master barang — LIST (semua role, read-only untuk staff) dan TAMBAH (khusus admin).

import { getRepository } from '@/lib/db';
import { itemSchema, listOptionsSchema } from '@/lib/validations/items';
import { requireAuth, requireRole, checkSameOrigin, jsonOk, jsonError, handleApiError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const result = await requireAuth();
  if (result.error) return result.error;

  const params = {};
  for (const [k, v] of new URL(request.url).searchParams) if (v !== '') params[k] = v;
  const query = listOptionsSchema.safeParse(params);
  if (!query.success) return jsonError(query.error.errors[0].message, 400);

  try {
    const { items, total } = await getRepository().listItems(query.data);
    return jsonOk({
      data: items,
      meta: { total, page: query.data.page, limit: query.data.limit, totalPages: Math.max(1, Math.ceil(total / query.data.limit)) },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat master barang.');
  }
}

export async function POST(request) {
  const originCheck = checkSameOrigin(request);
  if (!originCheck.ok) return originCheck.error;
  const result = await requireAuth();
  if (result.error) return result.error;
  const roleCheck = requireRole(result.user, ['admin']);
  if (roleCheck.error) return roleCheck.error;

  let body;
  try { body = await request.json(); } catch { return jsonError('Format data tidak valid.', 400); }
  const parsed = itemSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);

  try {
    const item = await getRepository().createItem(parsed.data, result.user);
    return jsonOk({ data: item, message: 'Barang berhasil ditambahkan.' }, 201);
  } catch (err) {
    return handleApiError(err, 'Gagal menambahkan barang.');
  }
}
