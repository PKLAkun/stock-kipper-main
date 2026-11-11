import { describe, it, expect } from 'vitest';
import { dampakQuerySchema, gantiSchema, ubahDataSchema, koreksiSchema, auditQuerySchema } from './koreksi.js';

describe('validasi koreksi', () => {
  it('dampak: ganti butuh penggantiId', () => {
    expect(dampakQuerySchema.safeParse({ aksi: 'ganti' }).success).toBe(false);
    expect(dampakQuerySchema.safeParse({ aksi: 'ganti', penggantiId: '3' }).data.penggantiId).toBe(3);
    expect(dampakQuerySchema.safeParse({ aksi: 'batal' }).success).toBe(true);
  });
  it('ganti: lengkap vs kurang', () => {
    const ok = { versi: 'v', penggantiId: 2, alasan: 'salah input', password: 'x' };
    expect(gantiSchema.safeParse(ok).success).toBe(true);
    expect(gantiSchema.safeParse({ ...ok, alasan: '1234' }).success).toBe(false);
    expect(gantiSchema.safeParse({ ...ok, penggantiId: 0 }).success).toBe(false);
  });
  it('ubah data: strict dan minimal satu perubahan', () => {
    const base = { alasan: 'salah mesin', password: 'x' };
    expect(ubahDataSchema.safeParse({ ...base, machine: 'M1' }).success).toBe(true);
    expect(ubahDataSchema.safeParse(base).success).toBe(false);
    expect(ubahDataSchema.safeParse({ ...base, machine: 'M1', qty: 3 }).success).toBe(false);
    expect(ubahDataSchema.safeParse({ ...base, deptProses: [{ baris: 1, kode: '' }] }).success).toBe(false);
  });
  it('koreksi: saldo tidak boleh negatif', () => {
    const base = { alasan: 'stock opname', namaAtasan: 'Pak Budi', nomorBa: 'BA/11/001', password: 'x' };
    expect(koreksiSchema.safeParse({ ...base, saldoBaru: 0 }).success).toBe(true);
    expect(koreksiSchema.safeParse({ ...base, saldoBaru: -0.5 }).success).toBe(false);
    expect(koreksiSchema.safeParse({ ...base, saldoBaru: 1, bkbId: 'x' }).success).toBe(false);
    expect(koreksiSchema.safeParse({ ...base, saldoBaru: 1.2345 }).success).toBe(false);
    expect(koreksiSchema.safeParse({ ...base, saldoBaru: 1.234 }).success).toBe(true);
  });
  it('koreksi: nama atasan dan nomor BA wajib, 1-100 karakter, di-trim', () => {
    const base = { saldoBaru: 1, alasan: 'stock opname', namaAtasan: 'Pak Budi', nomorBa: 'BA/11/001', password: 'x' };
    expect(koreksiSchema.safeParse(base).success).toBe(true);
    const { namaAtasan, ...tanpaNama } = base;
    const { nomorBa, ...tanpaBa } = base;
    expect(koreksiSchema.safeParse(tanpaNama).success).toBe(false);
    expect(koreksiSchema.safeParse(tanpaBa).success).toBe(false);
    expect(koreksiSchema.safeParse({ ...base, namaAtasan: '   ' }).success).toBe(false);
    expect(koreksiSchema.safeParse({ ...base, nomorBa: '' }).success).toBe(false);
    expect(koreksiSchema.safeParse({ ...base, namaAtasan: 'a'.repeat(101) }).success).toBe(false);
    expect(koreksiSchema.safeParse({ ...base, nomorBa: 'b'.repeat(101) }).success).toBe(false);
    expect(koreksiSchema.parse({ ...base, namaAtasan: '  Pak Budi  ' }).namaAtasan).toBe('Pak Budi');
  });
  it('audit: default dan batas', () => {
    expect(auditQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(auditQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});
