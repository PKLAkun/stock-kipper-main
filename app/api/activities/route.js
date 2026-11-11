// FILE: app/api/activities/route.js
// Riwayat aktivitas stok GLOBAL dengan filter:
//   ?userId=..  aktivitas milik user tertentu
//   &startDate=YYYY-MM-DD&endDate=YYYY-MM-DD   rentang tanggal
//   &search=..  cari nama barang / email user
//   &page=..&limit=..
// Digunakan oleh halaman "Aktivitas".

import { getRepository } from '@/lib/db';
import { activitiesQuerySchema } from '@/lib/validations/activities';
import { requireAuth, jsonOk, jsonError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const result = await requireAuth();
  if (result.error) return result.error;

  // abaikan parameter kosong supaya default schema (page=1, dst.) bekerja
  const params = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (value !== '') params[key] = value;
  }

  const query = activitiesQuerySchema.safeParse(params);
  if (!query.success) {
    return jsonError(query.error.errors[0].message, 400);
  }

  try {
    const repo = getRepository();
    const { items, total, users } = await repo.listActivities(query.data);
    const page = query.data.page;
    return jsonOk({
      data: items,
      meta: {
        total,
        page,
        limit: query.data.limit,
        totalPages: Math.max(1, Math.ceil(total / query.data.limit)),
      },
      users,
    });
  } catch {
    return jsonError('Gagal memuat aktivitas.', 500);
  }
}