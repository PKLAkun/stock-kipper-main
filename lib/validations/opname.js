// FILE: lib/validations/opname.js
// Validasi Cek Stok / opname (T-24, K-31). Aturan: docs/rancangan-tahap-2.md bagian 1.3.

import { z } from 'zod';
import { MAX_QTY } from '../constants/bkb.js';

const MAX_DEC = 3;
const validDec = (n) => Math.abs(Math.round(n * 10 ** MAX_DEC) - n * 10 ** MAX_DEC) < 1e-6;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus YYYY-MM-DD')
  .refine((v) => !isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'Tanggal tidak valid');

export const OPNAME_STATUS_VALUES = ['draf', 'diajukan', 'disetujui', 'ditolak', 'dibatalkan'];
export const OPNAME_ALASAN_VALUES = ['opname', 'rusak', 'hilang'];
export const ANALISA_MIN = 10;

export const opnameIdSchema = z.coerce.number({ message: 'ID tidak valid' }).int('ID tidak valid').positive('ID tidak valid');

export const opnameQuerySchema = z.object({
  status: z.union([z.enum(OPNAME_STATUS_VALUES), z.literal('')]).optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const jumlah = (msg, min = null) => {
  let n = z.number({ message: msg });
  if (min !== null) n = n.min(min, 'Jumlah fisik tidak boleh minus');
  return n.max(MAX_QTY, 'Jumlah terlalu besar').refine(validDec, `Jumlah maks ${MAX_DEC} desimal`);
};

const baris = z.object({
  itemId: z.coerce.number({ message: 'Barang wajib dipilih' }).int().positive('Barang wajib dipilih'),
  // opname: jumlah fisik (0 boleh); rusak/hilang: jumlah (lebih dari 0)
  qtyFisik: jumlah('Jumlah fisik harus angka', 0).optional(),
  qty: jumlah('Jumlah harus angka').optional(),
  analisa: z.string().trim().max(500, 'Analisa maksimal 500 karakter').optional(),
});

export const opnameSimpanSchema = z.object({
  idempotencyKey: z.string().uuid('Kunci idempotensi tidak valid').optional(),
  tanggal: dateStr.optional(),
  alasanJenis: z.enum(OPNAME_ALASAN_VALUES, { message: 'Alasan harus opname, rusak, atau hilang' }),
  catatan: z.string().trim().max(500, 'Catatan maksimal 500 karakter').optional(),
  items: z.array(baris).min(1, 'Minimal satu barang').max(100, 'Maksimal 100 barang'),
}).superRefine((v, ctx) => {
  const seen = new Set();
  v.items.forEach((r, i) => {
    if (seen.has(r.itemId)) ctx.addIssue({ code: 'custom', path: ['items', i, 'itemId'], message: 'Barang tidak boleh dobel' });
    seen.add(r.itemId);
    if (v.alasanJenis === 'opname') {
      if (r.qtyFisik == null) ctx.addIssue({ code: 'custom', path: ['items', i, 'qtyFisik'], message: 'Jumlah fisik wajib diisi' });
    } else if (r.qty == null || !(r.qty > 0)) {
      ctx.addIssue({ code: 'custom', path: ['items', i, 'qty'], message: 'Jumlah harus lebih dari 0' });
    }
  });
});

const teks = (label, min, max) => z.string({ message: `${label} wajib diisi` }).trim()
  .min(min, min <= 1 ? `${label} wajib diisi` : `${label} minimal ${min} karakter`)
  .max(max, `${label} maksimal ${max} karakter`);

export const opnameBatalSchema = z.object({ alasan: teks('Alasan', 5, 300) });
export const opnameTolakSchema = z.object({ catatan: teks('Catatan penolakan', 5, 500) });
export const opnameSetujuiSchema = z.object({
  namaAtasan: teks('Nama atasan', 1, 100),
  nomorBa: teks('Nomor BA', 1, 100),
  password: z.string({ message: 'Password wajib diisi' }).min(1, 'Password wajib diisi').max(200, 'Password terlalu panjang'),
});
