
import { getRepository } from '@/lib/db';
import { searchSchema } from '@/lib/validations/items';
import { requireAuth, jsonOk, jsonError, handleApiError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const result = await requireAuth();
  if (result.error) return result.error;

  const parsed = searchSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);
  const { q, code, ids } = parsed.data;

  const categoryCode = new URL(request.url).searchParams.get('categoryCode') || '';

  try {
    const repo = getRepository();
    if (ids) return jsonOk({ data: await repo.findItemsByIds(ids.split(',').map(Number)) });
    if (code) {
      const item = await repo.findItemByCode(code);
      // Filter kategori jika diminta
      if (item && categoryCode && item.categoryCode !== categoryCode) {
        return jsonOk({ data: null }); // tidak ditemukan untuk kategori ini
      }
      return jsonOk({ data: item });
    }
    const all = await repo.searchItems(q, categoryCode ? 20 : 8);
    const filtered = categoryCode ? all.filter((it) => it.categoryCode === categoryCode) : all;
    return jsonOk({ data: filtered.slice(0, 8) });
  } catch (err) {
    return handleApiError(err, 'Gagal mencari barang.');
  }
}
