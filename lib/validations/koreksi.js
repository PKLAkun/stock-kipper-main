// FILE: lib/validations/koreksi.js
// Validasi untuk dampak, ganti BKB, ubah data BKB, koreksi saldo, kartu stok, dan riwayat aksi.

import { z } from 'zod';
import { MAX_QTY } from '../constants/bkb.js';

const MAX_DEC = 3;
const validDec = (n) => Math.abs(Math.round(n * 10 ** MAX_DEC) - n * 10 ** MAX_DEC) < 1e-6;
const idSchema = z.coerce.number({ message: 'ID tidak valid' }).int('ID tidak valid').positive('ID tidak valid');
const alasanSchema = z.string({ message: 'Alasan wajib diisi' }).trim().min(5, 'Alasan minimal 5 karakter').max(500, 'Alasan maksimal 500 karakter');
const passwordSchema = z.string({ message: 'Password wajib diisi' }).min(1, 'Password wajib diisi').max(200, 'Password terlalu panjang');
const versiSchema = z.string({ message: 'Versi wajib dikirim' }).trim().min(1, 'Versi wajib dikirim').max(100);
const kodeSchema = z.string().trim().min(1, 'Kode wajib diisi').max(50);
const tanggal = (msg) => z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, msg);

export const dampakQuerySchema = z
  .object({
    aksi: z.enum(['batal', 'ganti'], { message: 'Aksi harus batal atau ganti' }),
    penggantiId: idSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.aksi === 'ganti' && v.penggantiId == null) {
      ctx.addIssue({ code: 'custom', path: ['penggantiId'], message: 'penggantiId wajib untuk aksi ganti' });
    }
  });

export const gantiSchema = z.object({
  versi: versiSchema,
  penggantiId: idSchema,
  alasan: alasanSchema,
  password: passwordSchema,
});

const barisKode = z.array(z.object({ baris: idSchema, kode: kodeSchema }).strict()).min(1).max(100);

// .strict(): field lain (barang, qty, jenis, tujuan, dst.) ditolak
export const ubahDataSchema = z
  .object({
    deptPemakai: barisKode.optional(),
    deptProses: barisKode.optional(),
    machine: z.string().trim().max(50).nullable().optional(),
    keteranganExtra: z.string().trim().max(100).optional(),
    alasan: alasanSchema,
    password: passwordSchema,
  })
  .strict({ message: 'Hanya dept pemakai, dept proses, mesin, dan keterangan yang boleh diubah' })
  .refine(
    (v) => v.deptPemakai !== undefined || v.deptProses !== undefined || v.machine !== undefined || v.keteranganExtra !== undefined,
    { message: 'Tidak ada data yang diubah' }
  );

export const koreksiSchema = z.object({
  saldoBaru: z.number({ message: 'Saldo baru harus angka' }).min(0, 'Saldo tidak boleh negatif').max(MAX_QTY, 'Saldo terlalu besar').refine(validDec, `Saldo maks ${MAX_DEC} desimal`),
  alasan: alasanSchema,
  // [Tahap 2, 11-11-2026, T-25] Wajib: nama atasan dan nomor Berita Acara (K-32).
  namaAtasan: z.string({ message: 'Nama atasan wajib diisi' }).trim().min(1, 'Nama atasan wajib diisi').max(100, 'Nama atasan maksimal 100 karakter'),
  nomorBa: z.string({ message: 'Nomor BA wajib diisi' }).trim().min(1, 'Nomor BA wajib diisi').max(100, 'Nomor BA maksimal 100 karakter'),
  password: passwordSchema,
  bkbId: idSchema.optional(),
});

export const idParamSchema = idSchema;

export const auditQuerySchema = z.object({
  entitas: z.string().trim().max(50).optional(),
  entitasId: z.string().trim().max(50).optional(),
  startDate: tanggal('Tanggal mulai harus format YYYY-MM-DD').optional(),
  endDate: tanggal('Tanggal akhir harus format YYYY-MM-DD').optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});
