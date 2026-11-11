// Logika murni form Buat BKB (dites di bkbFormLogic.test.js).

import { bkbCreateSchema } from '@/lib/validations/bkb';

export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // cadangan untuk lingkungan tanpa crypto.randomUUID (UUID v4 acak)
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/[x]/g, () => ((Math.random() * 16) | 0).toString(16));
}

// Susun body POST /api/bkb. Dept pemakai baris hanya dikirim bila keterangan tidak punya dept bawaan.
// Keterangan (tujuanKode), inisial, dan shift (reference) tetap dikirim, tapi server memakai data akun dan sesi.
export function buildBkbBody({ header, lines, tujuan, isSK, idempotencyKey, menggantiBkbId }) {
  const body = {
    idempotencyKey,
    bkbKategori: header.bkbKategori,
    bkbDate: header.bkbDate,
    reference: header.reference || '',
    tujuanKode: header.tujuanKode,
    inisial: header.inisial,
    nomorUrut: header.nomorUrut,
    machine: tujuan?.wajibMesin ? header.machine : '',
    items: lines.map((l) => ({
      itemId: l.item?.id ?? null,
      qty: l.qty,
      deptPemakaiKode: tujuan?.deptPemakaiKode ? undefined : (l.deptPemakaiKode || undefined),
      // [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak dikirim lagi (K-30).
      // deptProsesKode: l.deptProsesKode || undefined,
    })),
  };
  if (isSK && !menggantiBkbId) { body.pihakNama = header.pihakNama; body.pihakDept = header.pihakDept; }
  if (menggantiBkbId) body.menggantiBkbId = menggantiBkbId;
  return body;
}

const QTY_RE = /^\d+([.,]\d{0,3})?$/;

// Validasi sisi klien. Mengembalikan peta galat: kunci 'tujuanKode', 'machine', 'pihakNama', ...,
// 'items.<keyBaris>.itemId|qty|deptPemakaiKode'. Server tetap memvalidasi ulang.
// perluShift: true bila tanggal BKB sudah lewat (shift dipilih manual, wajib).
export function validateBkbForm({ header, lines, tujuan, isSK, today, menggantiBkbId, perluShift = false }) {
  const e = {};
  if (!header.tujuanKode) e.tujuanKode = 'Pilih keterangan.';
  if (!header.inisial?.trim()) e.inisial = 'Inisial wajib diisi.';
  if (!(Number(header.nomorUrut) >= 1)) e.nomorUrut = 'Nomor harus 1 atau lebih.';
  if (header.bkbDate > today) e.bkbDate = 'Tanggal tidak boleh lebih dari hari ini.';
  if (perluShift && !['1', '2', '3'].includes(header.reference)) e.reference = 'Shift wajib dipilih untuk tanggal yang sudah lewat.';
  if (tujuan?.wajibMesin && !header.machine?.trim()) e.machine = `Mesin wajib diisi untuk keterangan ${tujuan.kode}.`;
  if (isSK && !menggantiBkbId) {
    const n = (header.pihakNama || '').trim();
    const d = (header.pihakDept || '').trim();
    if (n.length < 2) e.pihakNama = 'Nama pihak wajib diisi.';
    else if (n.length > 60) e.pihakNama = 'Nama pihak maksimal 60 karakter.';
    if (d.length < 2) e.pihakDept = 'Departemen pihak wajib diisi.';
    else if (d.length > 60) e.pihakDept = 'Departemen pihak maksimal 60 karakter.';
  }
  const seen = new Set();
  lines.forEach((l) => {
    const k = `items.${l.key}`;
    if (!l.item) e[`${k}.itemId`] = 'Pilih barang.';
    else if (seen.has(l.item.id)) e[`${k}.itemId`] = `${l.item.itemCode} sudah ada di daftar. Ubah QTY di baris itu.`;
    else seen.add(l.item.id);
    const q = String(l.qty ?? '').trim();
    if (!q || !QTY_RE.test(q) || Number(q.replace(',', '.')) <= 0) {
      e[`${k}.qty`] = /[.,]\d{4,}/.test(q) ? 'Maksimal 3 angka di belakang koma.' : 'QTY harus lebih dari 0.';
    }
    if (tujuan && !tujuan.deptPemakaiKode && !l.deptPemakaiKode) e[`${k}.deptPemakaiKode`] = 'Pilih dept pemakai.';
  });
  return e;
}

// Validasi akhir dengan skema server yang sama (jaring pengaman). Mengembalikan pesan pertama atau ''.
export function schemaError(body) {
  const normalized = {
    ...body,
    items: body.items.map((i) => ({ ...i, qty: String(i.qty).replace(',', '.') })),
  };
  const r = bkbCreateSchema.safeParse(normalized);
  return r.success ? '' : r.error.errors[0].message;
}

export function countErrors(errors) {
  return Object.values(errors).filter(Boolean).length;
}
