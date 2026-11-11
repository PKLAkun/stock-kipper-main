import { z } from 'zod';
import { MAX_QTY, CATEGORY_CODES } from '../constants/bkb.js';

const MAX_DEC = 3;
const validDec = (n) => Math.abs(Math.round(n*10**MAX_DEC) - n*10**MAX_DEC) < 1e-6;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Tanggal harus YYYY-MM-DD')
  .refine((v)=>!isNaN(Date.parse(`${v}T00:00:00Z`))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v,'Tanggal tidak valid');

// ============================================================
//  Skema BKB baru (T-06).
// ============================================================

export const BKB_STATUS_VALUES = ['menunggu', 'ditahan', 'menunggu_de', 'selesai', 'diganti', 'dibatalkan'];

export const idParamSchema = z.coerce.number({ message: 'ID tidak valid' }).int('ID tidak valid').positive('ID tidak valid');

const optText = (max) => z.string().trim().max(max).optional()
  .transform((v) => (v ? v : undefined));

const bkbLineInput = z.object({
  itemId:         z.coerce.number({ message: 'Barang wajib dipilih' }).int().positive('Barang wajib dipilih'),
  qty:            z.coerce.number({ message: 'QTY harus angka' }).positive('QTY harus lebih dari 0')
                    .max(MAX_QTY, 'QTY terlalu besar').refine(validDec, `QTY maks ${MAX_DEC} desimal`),
  deptPemakaiKode: optText(20),
  deptProsesKode:  optText(20),
});

export const bkbInputSchema = z.object({
  idempotencyKey: z.string().uuid('Kunci idempotensi tidak valid').optional(),
  bkbKategori:    z.enum(CATEGORY_CODES, { message: 'Kategori barang wajib dipilih' }),
  bkbDate:        dateStr,
  reference:      z.union([z.enum(['1', '2', '3']), z.literal('')]).optional().default(''),
  tujuanKode:     z.string().trim().min(1, 'Keterangan wajib dipilih').max(20),
  inisial:        z.string().trim().min(1, 'Inisial wajib diisi').max(6).transform((v) => v.toUpperCase()),
  nomorUrut:      z.coerce.number({ message: 'Nomor urut harus angka' }).int().min(1).max(9999),
  machine:        z.string().trim().max(40).optional().default(''),
  items:          z.array(bkbLineInput).min(1, 'Minimal satu barang').max(50),
  pihakNama:      optText(100),
  pihakDept:      optText(50),
  menggantiBkbId: z.coerce.number().int().positive().optional(),
}).superRefine((d, ctx) => {
  const seen = new Set();
  d.items.forEach((r, i) => {
    if (seen.has(r.itemId)) ctx.addIssue({ code: 'custom', path: ['items', i, 'itemId'], message: 'Barang sudah ada di daftar' });
    seen.add(r.itemId);
  });
});

// POST wajib membawa idempotencyKey
export const bkbCreateSchema = bkbInputSchema.refine((d) => !!d.idempotencyKey, {
  path: ['idempotencyKey'], message: 'Kunci idempotensi wajib diisi',
});

// PUT: tanpa menggantiBkbId dan idempotencyKey
export const bkbUpdateSchema = bkbInputSchema.refine((d) => d.menggantiBkbId === undefined, {
  path: ['menggantiBkbId'], message: 'BKB pengganti tidak boleh diubah di sini',
});

export const bkbQuerySchema = z.object({
  status:    z.union([z.enum(BKB_STATUS_VALUES), z.literal('')]).optional().default(''),
  search:    z.string().trim().max(100).optional().default(''),
  tujuan:    z.string().trim().max(20).optional().default(''),
  startDate: z.union([dateStr, z.literal('')]).optional().default(''),
  endDate:   z.union([dateStr, z.literal('')]).optional().default(''),
  page:      z.coerce.number().int().min(1).optional().default(1),
  limit:     z.coerce.number().int().min(1).max(100).optional().default(15),
});

const saldoNum = z.coerce.number({ message: 'Saldo harus angka' }).min(0, 'Saldo tidak boleh minus')
  .max(MAX_QTY * 100, 'Saldo terlalu besar').refine(validDec, `Saldo maks ${MAX_DEC} desimal`);

export const konfirmasiSchema = z.object({
  baris: z.array(z.object({
    itemId: z.coerce.number().int().positive('Barang tidak valid'),
    saldoSk: z.union([z.string().trim().min(1, 'Saldo wajib diisi'), z.number()]).pipe(saldoNum),
  })).min(1, 'Semua baris wajib diisi').max(50),
  catatan: optText(500),
}).superRefine((d, ctx) => {
  const seen = new Set();
  d.baris.forEach((r, i) => {
    if (seen.has(r.itemId)) ctx.addIssue({ code: 'custom', path: ['baris', i, 'itemId'], message: 'Barang dobel di baris konfirmasi' });
    seen.add(r.itemId);
  });
});

export const yangSalahSchema = z.object({
  pilihan: z.enum(['bkb', 'saldo'], { message: 'Pilihan tidak valid' }),
  catatan: optText(500),
});

const alasanField = z.string({ message: 'Alasan wajib diisi' }).trim()
  .min(5, 'Alasan minimal 5 karakter').max(500, 'Alasan maksimal 500 karakter');

export const kembalikanSchema = z.object({
  alasan: z.string({ message: 'Alasan wajib diisi' }).trim().min(1, 'Alasan wajib diisi').max(500),
});

export const batalSchema = z.object({ alasan: alasanField });

export const batalSelesaiSchema = z.object({
  versi:    z.string({ message: 'Versi wajib dikirim' }).min(1, 'Versi wajib dikirim'),
  alasan:   alasanField,
  password: z.string({ message: 'Password wajib diisi' }).min(1, 'Password wajib diisi'),
});
