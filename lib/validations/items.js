import { z } from 'zod';
import { CATEGORY_CODES, MAX_QTY } from '../constants/bkb.js';

// Stok minimum: kosong atau 0 berarti "tidak diatur" (disimpan null)
const stokMinimum = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.coerce.number({ message: 'Stok minimum harus angka' }).min(0, 'Stok minimum tidak boleh negatif').max(MAX_QTY).nullable()
).transform((v) => (v ? v : null));

const itemBase = {
  categoryCode: z.enum(CATEGORY_CODES,{message:'Kategori wajib dipilih'}),
  itemCode:     z.string().trim().min(1,'Kode barang wajib diisi').max(50),
  barcode:      z.string().trim().max(100).optional().default(''),
  name:         z.string().trim().min(1,'Nama barang wajib diisi').max(150),
  unit:         z.string().trim().min(1,'Satuan wajib diisi').max(20),
  stokMinimum,
};

// Tambah barang: quantity = saldo awal (hanya jalur ini yang boleh mengisi saldo)
export const itemSchema = z.object({
  ...itemBase,
  quantity: z.coerce.number({message:'Saldo awal harus angka'}).min(0,'Saldo awal tidak boleh negatif').max(MAX_QTY).optional().default(0),
});

// Ubah barang: quantity tidak diterima (key tak dikenal dibuang), saldo hanya lewat koreksi
export const itemUpdateSchema = z.object(itemBase);

export const listOptionsSchema = z.object({
  search:       z.string().trim().max(100).optional().default(''),
  categoryCode: z.union([z.enum(CATEGORY_CODES),z.literal('')]).optional().default(''),
  sortBy:       z.enum(['name','itemCode','quantity','updatedAt','kekurangan']).optional().default('itemCode'),
  sortOrder:    z.enum(['asc','desc']).optional().default('asc'),
  statusStok:   z.enum(['bawah_minimum','habis']).optional(),
  page:         z.coerce.number().int().min(1).optional().default(1),
  limit:        z.coerce.number().int().min(1).max(100).optional().default(15),
});

export const searchSchema = z.object({
  q:    z.string().trim().max(60).optional().default(''),
  code: z.string().trim().max(100).optional().default(''),
  ids:  z.string().regex(/^\d+(,\d+){0,49}$/,'ids tidak valid').optional(),
});
