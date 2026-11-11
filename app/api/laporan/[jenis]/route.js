// FILE: app/api/laporan/[jenis]/route.js
// Laporan (T-26, K-33): jenis = mutasi | rekap | kartu | stok. SK, DE, dan Superadmin (operator 403).
// Tanpa format: JSON untuk layar. ?format=xlsx: berkas Excel dibuat di server, paling banyak 50.000 baris.

import { getRepository } from '@/lib/db';
import { DomainError } from '@/lib/db/koreksi';
import { todayWib } from '@/lib/db/helpers';
import { LAPORAN_SCHEMA, MAKS_BARIS, pesanPertama } from '@/lib/validations/laporan';
import { buatExcelMutasi, buatExcelRekap, buatExcelKartu, buatExcelStok, namaFileLaporan, XLSX_MIME } from '@/lib/laporan/excel';
import { requireAuth, requireRole, jsonOk, jsonError, handleApiError } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const terlaluBesar = () =>
  new DomainError(`Hasil lebih dari ${MAKS_BARIS.toLocaleString('id-ID')} baris. Persempit filter lalu coba lagi.`, 413, { code: 'TERLALU_BESAR' });

function berkasXlsx(buffer, jenis) {
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${namaFileLaporan(jenis, todayWib())}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(request, { params }) {
  const result = await requireAuth();
  if (result.error) return result.error;
  const roleCheck = requireRole(result.user, ['staff', 'admin']);
  if (roleCheck.error) return roleCheck.error;

  const { jenis } = await params;
  const schema = LAPORAN_SCHEMA[jenis];
  if (!schema) return jsonError('Jenis laporan tidak dikenal.', 404);

  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return jsonError(pesanPertama(parsed), 400);
  const { format, ...filter } = parsed.data;
  const xlsx = format === 'xlsx';

  try {
    const repo = getRepository();

    if (jenis === 'mutasi') {
      if (xlsx) {
        const r = await repo.laporanMutasi({ ...filter, limit: MAKS_BARIS, offset: 0 });
        if (r.total > MAKS_BARIS) throw terlaluBesar();
        return berkasXlsx(await buatExcelMutasi({ rows: r.rows, filter }), jenis);
      }
      return jsonOk({ data: await repo.laporanMutasi({ ...filter, limit: filter.limit ?? 200 }) });
    }

    if (jenis === 'rekap') {
      const rows = await repo.laporanRekap(filter);
      if (rows.length > MAKS_BARIS) throw terlaluBesar();
      if (xlsx) return berkasXlsx(await buatExcelRekap({ rows, filter }), jenis);
      return jsonOk({ data: rows });
    }

    if (jenis === 'kartu') {
      const { itemId, ...periode } = filter;
      const kartu = await repo.laporanKartu(itemId, periode);
      if (!kartu) return jsonError('Barang tidak ditemukan.', 404);
      if (kartu.rows.length > MAKS_BARIS) throw terlaluBesar();
      if (xlsx) return berkasXlsx(await buatExcelKartu({ kartu }), jenis);
      return jsonOk({ data: kartu });
    }

    const rows = await repo.laporanStok(filter);
    if (rows.length > MAKS_BARIS) throw terlaluBesar();
    if (xlsx) return berkasXlsx(await buatExcelStok({ rows, filter }), jenis);
    return jsonOk({ data: rows });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat laporan.');
  }
}
