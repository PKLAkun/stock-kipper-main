// FILE: lib/validations/parameter.js
// Validasi parameter, mesin, dan pengaturan (khusus Superadmin). Dijalankan di server.

import { PERAN_BUAT_BKB_PILIHAN, PERAN_BUAT_PENGGANTI_PILIHAN } from '../constants/izin-bkb.js';
import { z } from 'zod';

export const PARAM_NAMA = ['tujuan', 'dept-pemakai', 'dept-proses', 'jenis', 'tim'];

const kodeSchema = z
  .string({ required_error: 'Kode wajib diisi.', invalid_type_error: 'Kode tidak valid.' })
  .trim()
  .min(1, 'Kode wajib diisi.')
  .transform((v) => v.toUpperCase())
  .pipe(z.string().max(20, 'Kode maksimal 20 karakter.').regex(/^[A-Z0-9-]+$/, 'Kode hanya huruf kapital, angka, dan strip.'));

const namaSchema = z
  .string({ required_error: 'Nama wajib diisi.', invalid_type_error: 'Nama tidak valid.' })
  .trim()
  .min(2, 'Nama wajib diisi (minimal 2 karakter).')
  .max(60, 'Nama maksimal 60 karakter.');

const opsional = (schema) => schema.nullish().transform((v) => (v === '' ? null : v ?? null));
const aktifSchema = z.boolean({ invalid_type_error: 'Status tidak valid.' });
const urutanSchema = z.number().int().min(0).max(9999);

const dasar = { nama: namaSchema, aktif: aktifSchema.optional(), urutan: urutanSchema.optional() };

const bentuk = {
  tujuan: {
    jenisKode: z.string({ required_error: 'Pilih jenis.', invalid_type_error: 'Pilih jenis.' }).trim().min(1, 'Pilih jenis.'),
    deptPemakaiKode: opsional(z.string().trim()),
    wajibMesin: z.boolean().optional(),
  },
  'dept-pemakai': {},
  'dept-proses': { bawaan: z.boolean().optional() },
  tim: {},
  jenis: { arah: z.enum(['in', 'out'], { message: 'Arah harus in atau out.' }) },
};

// POST: kode wajib
export function parameterCreateSchema(nama) {
  return z.object({ kode: kodeSchema, ...dasar, ...bentuk[nama] });
}

// PUT: semua kolom opsional kecuali tidak boleh kosong bila dikirim. kode boleh ikut (ditolak server bila terkunci).
export function parameterUpdateSchema(nama) {
  return z.object({ kode: kodeSchema.optional(), ...dasar, nama: namaSchema.optional(), ...Object.fromEntries(
    Object.entries(bentuk[nama]).map(([k, v]) => [k, v.optional()])
  ) });
}

export const machineSchema = z.object({
  code: kodeSchema,
  name: namaSchema,
  active: aktifSchema.optional(),
});

export const pengaturanSchema = z.object({
  wajibApproveDe: z.boolean({ invalid_type_error: 'Nilai pengaturan tidak valid.' }).optional(),
  peranBuatBkb: z.array(z.enum(PERAN_BUAT_BKB_PILIHAN, { errorMap: () => ({ message: 'Role tidak valid.' }) }))
    .min(1, 'Minimal satu role harus boleh membuat BKB.')
    .max(PERAN_BUAT_BKB_PILIHAN.length, 'Role tidak valid.')
    .optional(),
  peranBuatPengganti: z.array(z.enum(PERAN_BUAT_PENGGANTI_PILIHAN, { errorMap: () => ({ message: 'Role tidak valid.' }) }))
    .min(1, 'Minimal satu role harus boleh membuat BKB pengganti.')
    .max(PERAN_BUAT_PENGGANTI_PILIHAN.length, 'Role tidak valid.')
    .optional(),
  password: z.string({ required_error: 'Password wajib diisi.', invalid_type_error: 'Password wajib diisi.' }).min(1, 'Password wajib diisi.'),
  alasan: z.string().trim().max(300, 'Alasan terlalu panjang.').nullish(),
}).refine((d) => d.wajibApproveDe !== undefined || d.peranBuatBkb !== undefined || d.peranBuatPengganti !== undefined, {
  path: ['wajibApproveDe'], message: 'Nilai pengaturan wajib diisi.',
});
