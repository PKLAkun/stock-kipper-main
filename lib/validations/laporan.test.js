import { describe, it, expect } from 'vitest';
import { mutasiQuerySchema, rekapQuerySchema, kartuQuerySchema, stokQuerySchema, MAKS_BARIS } from './laporan.js';

const ok = { dari: '2026-11-01', sampai: '2026-11-11' };

describe('mutasiQuerySchema', () => {
  it('tanggal wajib', () => {
    expect(mutasiQuerySchema.safeParse({}).success).toBe(false);
    expect(mutasiQuerySchema.safeParse(ok).success).toBe(true);
  });
  it('format tanggal dan tanggal fiktif ditolak', () => {
    expect(mutasiQuerySchema.safeParse({ dari: '01-11-2026', sampai: '2026-11-11' }).success).toBe(false);
    expect(mutasiQuerySchema.safeParse({ dari: '2026-02-30', sampai: '2026-11-11' }).success).toBe(false);
  });
  it('dari harus <= sampai', () => {
    const r = mutasiQuerySchema.safeParse({ dari: '2026-11-12', sampai: '2026-11-11' });
    expect(r.success).toBe(false);
    expect(r.error.errors[0].path).toEqual(['sampai']);
    expect(mutasiQuerySchema.safeParse({ dari: '2026-11-11', sampai: '2026-11-11' }).success).toBe(true);
  });
  it('rentang maksimal 1 tahun', () => {
    expect(mutasiQuerySchema.safeParse({ dari: '2025-11-12', sampai: '2026-11-11' }).success).toBe(true);
    expect(mutasiQuerySchema.safeParse({ dari: '2025-01-01', sampai: '2026-11-11' }).success).toBe(false);
  });
  it('filter lain opsional, string kosong diabaikan, angka dikonversi', () => {
    const r = mutasiQuerySchema.parse({ ...ok, itemId: '', jenis: 'pb', shift: '2', limit: '100', keterangan: ' ' });
    expect(r.itemId).toBeUndefined();
    expect(r.jenis).toBe('PB');
    expect(r.shift).toBe('2');
    expect(r.limit).toBe(100);
    expect(r.keterangan).toBeUndefined();
  });
  it('batas limit, shift, itemId', () => {
    expect(mutasiQuerySchema.safeParse({ ...ok, limit: String(MAKS_BARIS + 1) }).success).toBe(false);
    expect(mutasiQuerySchema.safeParse({ ...ok, limit: '0' }).success).toBe(false);
    expect(mutasiQuerySchema.safeParse({ ...ok, offset: '-1' }).success).toBe(false);
    expect(mutasiQuerySchema.safeParse({ ...ok, shift: '4' }).success).toBe(false);
    expect(mutasiQuerySchema.safeParse({ ...ok, itemId: '0' }).success).toBe(false);
    expect(mutasiQuerySchema.safeParse({ ...ok, format: 'pdf' }).success).toBe(false);
    expect(mutasiQuerySchema.safeParse({ ...ok, format: 'xlsx' }).success).toBe(true);
  });
});

describe('rekapQuerySchema', () => {
  it('kategori 1 atau 4, selain itu ditolak', () => {
    expect(rekapQuerySchema.parse({ ...ok, kategori: '4' }).kategori).toBe('4');
    expect(rekapQuerySchema.safeParse({ ...ok, kategori: '2' }).success).toBe(false);
    expect(rekapQuerySchema.parse({ ...ok, kategori: '' }).kategori).toBeUndefined();
  });
  it('tanggal wajib dan rentang diperiksa', () => {
    expect(rekapQuerySchema.safeParse({}).success).toBe(false);
    expect(rekapQuerySchema.safeParse({ dari: '2024-01-01', sampai: '2026-01-01' }).success).toBe(false);
  });
});

describe('kartuQuerySchema', () => {
  it('barang wajib, tanggal opsional', () => {
    expect(kartuQuerySchema.safeParse({}).success).toBe(false);
    expect(kartuQuerySchema.parse({ itemId: '7' }).itemId).toBe(7);
  });
  it('rentang diperiksa bila keduanya ada', () => {
    expect(kartuQuerySchema.safeParse({ itemId: 7, dari: '2026-11-12', sampai: '2026-11-11' }).success).toBe(false);
    expect(kartuQuerySchema.safeParse({ itemId: 7, dari: '2026-01-01' }).success).toBe(true);
  });
});

describe('stokQuerySchema', () => {
  it('tanpa filter lolos; kategori salah ditolak', () => {
    expect(stokQuerySchema.safeParse({}).success).toBe(true);
    expect(stokQuerySchema.safeParse({ kategori: '9' }).success).toBe(false);
  });
});
