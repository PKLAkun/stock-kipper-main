import { describe, it, expect } from 'vitest';
import { itemSchema, itemUpdateSchema, listOptionsSchema } from './items.js';

const base = { categoryCode: '1', itemCode: 'PP-1', name: 'PP', unit: 'kg' };

describe('validasi barang', () => {
  it('tambah: saldo awal default 0, stok minimum kosong/0 menjadi null', () => {
    expect(itemSchema.parse(base)).toMatchObject({ quantity: 0, stokMinimum: null });
    expect(itemSchema.parse({ ...base, stokMinimum: '' }).stokMinimum).toBeNull();
    expect(itemSchema.parse({ ...base, stokMinimum: 0 }).stokMinimum).toBeNull();
    expect(itemSchema.parse({ ...base, stokMinimum: '50', quantity: '12.5' })).toMatchObject({ stokMinimum: 50, quantity: 12.5 });
  });
  it('stok minimum negatif ditolak; saldo awal negatif ditolak', () => {
    expect(itemSchema.safeParse({ ...base, stokMinimum: -1 }).success).toBe(false);
    expect(itemSchema.safeParse({ ...base, quantity: -1 }).success).toBe(false);
  });
  it('ubah: quantity dibuang, tidak pernah sampai ke repository', () => {
    const r = itemUpdateSchema.parse({ ...base, quantity: 999, stokMinimum: 10 });
    expect('quantity' in r).toBe(false);
    expect(r.stokMinimum).toBe(10);
  });
  it('daftar: statusStok dan sort kekurangan', () => {
    expect(listOptionsSchema.parse({ statusStok: 'bawah_minimum', sortBy: 'kekurangan' })).toMatchObject({ statusStok: 'bawah_minimum', sortBy: 'kekurangan' });
    expect(listOptionsSchema.safeParse({ statusStok: 'x' }).success).toBe(false);
  });
});
