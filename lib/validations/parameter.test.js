import { describe, it, expect } from 'vitest';
import { PARAM_NAMA, parameterCreateSchema, parameterUpdateSchema, machineSchema, pengaturanSchema } from './parameter.js';

describe('parameter tim (T-22)', () => {
  it('tim dikenal dan hanya butuh kode dan nama', () => {
    expect(PARAM_NAMA).toContain('tim');
    expect(parameterCreateSchema('tim').safeParse({ kode: 'tarik', nama: 'Tim Tarik' }).data).toMatchObject({ kode: 'TARIK', nama: 'Tim Tarik' });
  });
});

describe('validasi parameter', () => {
  it('kode diubah ke kapital dan dibatasi karakternya', () => {
    expect(parameterCreateSchema('dept-pemakai').parse({ kode: ' pl003 ', nama: 'Produksi' }).kode).toBe('PL003');
    expect(parameterCreateSchema('dept-pemakai').safeParse({ kode: 'a b', nama: 'Produksi' }).success).toBe(false);
    expect(parameterCreateSchema('dept-pemakai').safeParse({ kode: 'A'.repeat(21), nama: 'Produksi' }).success).toBe(false);
    expect(parameterCreateSchema('dept-pemakai').safeParse({ nama: 'Produksi' }).success).toBe(false);
  });

  it('tujuan wajib jenis; dept bawaan kosong menjadi null', () => {
    const s = parameterCreateSchema('tujuan');
    expect(s.safeParse({ kode: 'BIP', nama: 'BIP' }).success).toBe(false);
    const ok = s.parse({ kode: 'BIP', nama: 'BIP', jenisKode: 'PB', deptPemakaiKode: '', wajibMesin: false });
    expect(ok.deptPemakaiKode).toBeNull();
  });

  it('jenis wajib arah in/out', () => {
    const s = parameterCreateSchema('jenis');
    expect(s.safeParse({ kode: 'PB', nama: 'Pemakaian', arah: 'keluar' }).success).toBe(false);
    expect(s.safeParse({ kode: 'PB', nama: 'Pemakaian', arah: 'out' }).success).toBe(true);
  });

  it('update: semua kolom opsional, tapi nama tidak boleh pendek', () => {
    const s = parameterUpdateSchema('tujuan');
    expect(s.parse({ aktif: false })).toEqual({ aktif: false });
    expect(s.safeParse({ nama: 'A' }).success).toBe(false);
  });

  it('mesin dan pengaturan', () => {
    expect(machineSchema.parse({ code: 'htf-200', name: 'HTF 200' }).code).toBe('HTF-200');
    expect(pengaturanSchema.safeParse({ wajibApproveDe: false }).success).toBe(false);
    expect(pengaturanSchema.safeParse({ wajibApproveDe: 'ya', password: 'x' }).success).toBe(false);
    expect(pengaturanSchema.safeParse({ wajibApproveDe: false, password: 'x', alasan: 'uji' }).success).toBe(true);
    expect(pengaturanSchema.safeParse({ password: 'x' }).success).toBe(false);
    expect(pengaturanSchema.safeParse({ peranBuatBkb: [], password: 'x' }).success).toBe(false);
    expect(pengaturanSchema.safeParse({ peranBuatBkb: ['tamu'], password: 'x' }).success).toBe(false);
    expect(pengaturanSchema.safeParse({ peranBuatBkb: ['staff', 'admin'], password: 'x' }).success).toBe(true);
    expect(pengaturanSchema.safeParse({ peranBuatPengganti: ['operator'], password: 'x' }).success).toBe(false);
    expect(pengaturanSchema.safeParse({ peranBuatPengganti: [], password: 'x' }).success).toBe(false);
    expect(pengaturanSchema.safeParse({ peranBuatPengganti: ['admin'], password: 'x' }).success).toBe(true);
  });
});
