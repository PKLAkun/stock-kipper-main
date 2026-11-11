// FILE: app/api/dashboard/route.js
// Data ringkasan untuk halaman Dashboard (total item, nilai stok, dll).

import { requireAuth, jsonOk, jsonError } from '@/lib/auth/guards';
import { getDashboardData } from '@/lib/db/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await requireAuth();
  if (result.error) return result.error;

  try {
    const data = await getDashboardData();
    return jsonOk({ data });
  } catch (err) {
    // jangan bocorkan pesan error internal ke klien
    return jsonError('Gagal memuat data dashboard.', 500);
  }
}