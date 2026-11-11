// FILE: lib/validations/laporan.js
// Validasi query laporan (T-26, K-33): tanggal YYYY-MM-DD, rentang maksimal 1 tahun, dari <= sampai.

import { z } from 'zod';

export const JENIS_LAPORAN = ['mutasi', 'rekap', 'kartu', 'stok'];
export const MAKS_BARIS = 50000;
export const MAKS_HARI = 366; // 1 tahun (tahun kabisat), dihitung inklusif

// "" dari formulir dianggap tidak diisi
const kosong = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const opsional = (schema) => z.preprocess(kosong, schema.optional());

const tanggalAsli = z
  .string({ message: 'Tanggal tidak valid' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus berformat YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Tanggal tidak ada di kalender');

const tanggal = tanggalAsli;
const idSchema = z.coerce.number({ message: 'Barang tidak valid' }).int('Barang tidak valid').positive('Barang tidak valid');
const kategori = z.enum(['1', '4'], { message: 'Kategori harus 1 atau 4' });
const teks = (maks) => z.string().trim().max(maks, `Maksimal ${maks} karakter`);

const hariAntara = (dari, sampai) =>
  Math.round((Date.parse(`${sampai}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86400000) + 1;

// Rentang: dari <= sampai dan paling lama 1 tahun. Dipakai bila kedua tanggal ada.
function cekRentang(v, ctx) {
  if (!v.dari || !v.sampai) return;
  if (v.dari > v.sampai) {
    ctx.addIssue({ code: 'custom', path: ['sampai'], message: 'Tanggal sampai tidak boleh sebelum tanggal dari' });
  } else if (hariAntara(v.dari, v.sampai) > MAKS_HARI) {
    ctx.addIssue({ code: 'custom', path: ['sampai'], message: 'Rentang tanggal maksimal 1 tahun' });
  }
}

const wajibTanggal = (v, ctx) => {
  if (!v.dari) ctx.addIssue({ code: 'custom', path: ['dari'], message: 'Tanggal dari wajib diisi' });
  if (!v.sampai) ctx.addIssue({ code: 'custom', path: ['sampai'], message: 'Tanggal sampai wajib diisi' });
};

const format = opsional(z.enum(['json', 'xlsx'], { message: 'Format harus json atau xlsx' }));

export const mutasiQuerySchema = z
  .object({
    dari: opsional(tanggal),
    sampai: opsional(tanggal),
    itemId: opsional(idSchema),
    jenis: opsional(z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}$/, 'Jenis tidak valid')),
    tujuan: opsional(teks(50)),
    keterangan: opsional(teks(100)),
    shift: opsional(z.enum(['1', '2', '3'], { message: 'Shift harus 1, 2, atau 3' })),
    limit: opsional(z.coerce.number().int('Limit tidak valid').min(1, 'Limit minimal 1').max(MAKS_BARIS, `Limit maksimal ${MAKS_BARIS}`)),
    offset: opsional(z.coerce.number().int('Offset tidak valid').min(0, 'Offset tidak boleh minus')),
    format,
  })
  .superRefine((v, ctx) => {
    wajibTanggal(v, ctx);
    cekRentang(v, ctx);
  });

export const rekapQuerySchema = z
  .object({
    dari: opsional(tanggal),
    sampai: opsional(tanggal),
    kategori: opsional(kategori),
    format,
  })
  .superRefine((v, ctx) => {
    wajibTanggal(v, ctx);
    cekRentang(v, ctx);
  });

// Kartu stok: tanggal boleh kosong (seluruh riwayat); bila dua-duanya diisi, rentang diperiksa.
export const kartuQuerySchema = z
  .object({
    itemId: idSchema,
    dari: opsional(tanggal),
    sampai: opsional(tanggal),
    format,
  })
  .superRefine(cekRentang);

export const stokQuerySchema = z.object({
  kategori: opsional(kategori),
  format,
});

export const LAPORAN_SCHEMA = {
  mutasi: mutasiQuerySchema,
  rekap: rekapQuerySchema,
  kartu: kartuQuerySchema,
  stok: stokQuerySchema,
};

// Ubah hasil safeParse gagal menjadi satu pesan ramah
export const pesanPertama = (parsed) => parsed.error.errors[0]?.message || 'Filter tidak valid';
