import { describe, it, expect } from 'vitest';
import {
  opnameQuerySchema, opnameSimpanSchema, opnameBatalSchema, opnameTolakSchema, opnameSetujuiSchema, opnameIdSchema,
} from './opname.js';

const UUID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const opname = (extra = {}) => ({ alasanJenis: 'opname', items: [{ itemId: 1, qtyFisik: 10 }], ...extra });

describe('validasi opname', () => {
  it('query: default dan status tidak dikenal', () => {
    expect(opnameQuerySchema.parse({})).toEqual({ status: '', page: 1, limit: 20 });
    expect(opnameQuerySchema.safeParse({ status: 'diajukan' }).success).toBe(true);
    expect(opnameQuerySchema.safeParse({ status: 'selesai' }).success).toBe(false);
    expect(opnameQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
  it('id harus bilangan bulat positif', () => {
    expect(opnameIdSchema.safeParse('5').data).toBe(5);
    expect(opnameIdSchema.safeParse('0').success).toBe(false);
    expect(opnameIdSchema.safeParse('x').success).toBe(false);
  });
  it('simpan opname: fisik 0 boleh, minus tidak, kosong tidak', () => {
    expect(opnameSimpanSchema.safeParse(opname({ items: [{ itemId: 1, qtyFisik: 0 }] })).success).toBe(true);
    expect(opnameSimpanSchema.safeParse(opname({ items: [{ itemId: 1, qtyFisik: -1 }] })).success).toBe(false);
    expect(opnameSimpanSchema.safeParse(opname({ items: [{ itemId: 1 }] })).success).toBe(false);
    expect(opnameSimpanSchema.safeParse(opname({ items: [{ itemId: 1, qtyFisik: null }] })).success).toBe(false);
  });
  it('simpan rusak/hilang: qty wajib lebih dari 0', () => {
    for (const alasanJenis of ['rusak', 'hilang']) {
      expect(opnameSimpanSchema.safeParse({ alasanJenis, items: [{ itemId: 1, qty: 2 }] }).success).toBe(true);
      expect(opnameSimpanSchema.safeParse({ alasanJenis, items: [{ itemId: 1, qty: 0 }] }).success).toBe(false);
      expect(opnameSimpanSchema.safeParse({ alasanJenis, items: [{ itemId: 1 }] }).success).toBe(false);
    }
  });
  it('alasan jenis, jumlah barang, dobel, desimal', () => {
    expect(opnameSimpanSchema.safeParse(opname({ alasanJenis: 'lain' })).success).toBe(false);
    expect(opnameSimpanSchema.safeParse(opname({ items: [] })).success).toBe(false);
    expect(opnameSimpanSchema.safeParse(opname({ items: [{ itemId: 1, qtyFisik: 1 }, { itemId: 1, qtyFisik: 2 }] })).success).toBe(false);
    expect(opnameSimpanSchema.safeParse(opname({ items: [{ itemId: 1, qtyFisik: 1.2345 }] })).success).toBe(false);
    expect(opnameSimpanSchema.safeParse(opname({ items: [{ itemId: 1, qtyFisik: 1.234 }] })).success).toBe(true);
  });
  it('tanggal, kunci idempotensi, analisa dan catatan di-trim', () => {
    expect(opnameSimpanSchema.safeParse(opname({ tanggal: '2026-02-30' })).success).toBe(false);
    expect(opnameSimpanSchema.safeParse(opname({ tanggal: '2026-11-11', idempotencyKey: UUID })).success).toBe(true);
    expect(opnameSimpanSchema.safeParse(opname({ idempotencyKey: 'x' })).success).toBe(false);
    const r = opnameSimpanSchema.parse(opname({ catatan: '  hitung ulang ', items: [{ itemId: 1, qtyFisik: 1, analisa: '  salah hitung  ' }] }));
    expect(r.catatan).toBe('hitung ulang');
    expect(r.items[0].analisa).toBe('salah hitung');
  });
  it('batal dan tolak wajib teks', () => {
    expect(opnameBatalSchema.safeParse({ alasan: 'salah buat' }).success).toBe(true);
    expect(opnameBatalSchema.safeParse({ alasan: '  ab ' }).success).toBe(false);
    expect(opnameBatalSchema.safeParse({}).success).toBe(false);
    expect(opnameTolakSchema.safeParse({ catatan: 'hitung ulang rak B' }).success).toBe(true);
    expect(opnameTolakSchema.safeParse({ catatan: '' }).success).toBe(false);
  });
  it('setujui: nama atasan, nomor BA, password wajib', () => {
    const ok = { namaAtasan: 'Pak Budi', nomorBa: 'BA/11/001', password: 'x' };
    expect(opnameSetujuiSchema.safeParse(ok).success).toBe(true);
    expect(opnameSetujuiSchema.safeParse({ ...ok, namaAtasan: ' ' }).success).toBe(false);
    expect(opnameSetujuiSchema.safeParse({ ...ok, nomorBa: '' }).success).toBe(false);
    expect(opnameSetujuiSchema.safeParse({ ...ok, password: '' }).success).toBe(false);
    expect(opnameSetujuiSchema.safeParse({ ...ok, nomorBa: 'b'.repeat(101) }).success).toBe(false);
  });
});
