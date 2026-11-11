// FILE: app/api/bkb/route.js
// BKB: GET (semua role; operator hanya BKB miliknya) | POST (role sesuai Pengaturan "peran_buat_bkb").

import { bolehBuatBkb, bolehBuatPengganti } from '@/lib/constants/izin-bkb';
import { getRepository } from '@/lib/db';
import { tentukanShiftBkb, nameToInitial } from '@/lib/constants/bkb';
import { bkbCreateSchema, bkbQuerySchema } from '@/lib/validations/bkb';
import {
  requireAuth, checkSameOrigin, jsonOk, jsonError, handleApiError,
} from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const params = {};
  for (const [k, v] of new URL(request.url).searchParams) if (v !== '') params[k] = v;
  const query = bkbQuerySchema.safeParse(params);
  if (!query.success) return jsonError(query.error.errors[0].message, 400);

  // operator hanya melihat BKB miliknya, apa pun query-nya
  const ownerId = auth.user.role === 'operator' ? auth.user.id : undefined;

  try {
    const { items, total } = await getRepository().listBkb({ ...query.data, ownerId });
    return jsonOk({
      data: items,
      meta: {
        total, page: query.data.page, limit: query.data.limit,
        totalPages: Math.max(1, Math.ceil(total / query.data.limit)),
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat daftar BKB.');
  }
}

export async function POST(request) {
  const originCheck = checkSameOrigin(request);
  if (!originCheck.ok) return originCheck.error;

  const auth = await requireAuth();
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); } catch { return jsonError('Format data tidak valid.', 400); }

  const parsed = bkbCreateSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);
  const d = parsed.data;

  const isOperator = auth.user.role === 'operator';
  if (isOperator) {
    if (d.pihakNama || d.pihakDept || d.menggantiBkbId) {
      return jsonError('Operator tidak boleh mengisi pihak lain atau BKB pengganti.', 400);
    }
  } else if (!d.pihakNama && !d.menggantiBkbId) {
    return jsonError('Nama pihak wajib diisi.', 400);
  }

  // role yang boleh membuat BKB dan BKB pengganti diatur terpisah oleh Superadmin; fungsi SQL mengecek lagi
  let pengaturan;
  try {
    pengaturan = await getRepository().getPengaturan();
  } catch (err) {
    return handleApiError(err, 'Gagal menyimpan BKB.');
  }
  if (d.menggantiBkbId) {
    if (!bolehBuatPengganti(auth.user.role, pengaturan.peranBuatPengganti)) {
      return jsonError('Role Anda tidak diizinkan membuat BKB pengganti.', 403);
    }
  } else if (!bolehBuatBkb(auth.user.role, pengaturan.peranBuatBkb)) {
    return jsonError('Role Anda tidak diizinkan membuat BKB.', 403);
  }

  try {
    // [Tahap 2, 11-11-2026, T-23] Server tidak mempercayai tujuan, inisial, dan shift dari browser.
    // Operator: tujuan dari akun. Semua role: inisial dari akun (bila ada). Shift dari sesi/jam server.
    // Operator tanpa keterangan akun ditolak fungsi SQL (AKUN_BELUM_DIATUR, dipetakan ke 409 di lib/db/bkb.js).

    // BKB pengganti dengan tanggal sama memakai shift BKB lama
    let lama = null;
    if (d.menggantiBkbId) lama = await getRepository().getBkb(d.menggantiBkbId);
    const shift = tentukanShiftBkb({
      bkbDate: d.bkbDate, reference: d.reference, role: auth.user.role, sesiShift: auth.user.sesiShift,
      shiftLama: lama?.reference, tanggalLama: lama ? String(lama.bkbDate).slice(0, 10) : undefined,
    });
    if (shift.error) return jsonError(shift.error, shift.status);

    const saved = await getRepository().createBkb(
      {
        ...d,
        tujuanKode: isOperator ? (auth.user.tujuanKode || d.tujuanKode) : d.tujuanKode, // SQL tetap memakai akun
        // [Tahap 2, 11-11-2026, T-27] Dinonaktifkan (temuan review): inisial dari browser tidak dipercaya.
        // inisial: auth.user.inisial || d.inisial,
        inisial: auth.user.inisial || nameToInitial(auth.user.name),
        reference: shift.reference || '',
        sumber: isOperator ? 'operator' : 'non_operator',
      },
      auth.user,
    );
    return jsonOk({ data: { id: saved.id, docNo: saved.docNo, status: saved.status } }, 201);
  } catch (err) {
    return handleApiError(err, 'Gagal menyimpan BKB.');
  }
}
