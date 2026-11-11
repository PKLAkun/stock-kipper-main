import { describe, it, expect } from 'vitest';
import { createUserSchema, updateUserSchema } from './users.js';

describe('validasi pengguna: inisial, tim, keterangan', () => {
  const op = { name: 'Op', role: 'operator', pin: '1234', tujuanKode: 'INJ2' };

  it('inisial dijadikan kapital; kosong menjadi null', () => {
    expect(createUserSchema.parse({ ...op, inisial: ' ab ' }).inisial).toBe('AB');
    expect(createUserSchema.parse({ ...op, inisial: '' }).inisial).toBeNull();
    expect(createUserSchema.parse(op).inisial).toBeNull();
  });

  it('inisial harus 2-6 huruf A-Z', () => {
    for (const x of ['A', 'ABCDEFG', 'A1', 'AB-']) {
      expect(createUserSchema.safeParse({ ...op, inisial: x }).success).toBe(false);
    }
  });

  it('operator baru wajib keterangan; non-operator membuang tim dan keterangan', () => {
    expect(createUserSchema.safeParse({ name: 'Op', role: 'operator', pin: '1234' }).success).toBe(false);
    const sk = createUserSchema.parse({ name: 'SK', role: 'staff', email: 's@x.com', password: 'abcdefgh', timKode: 'TARIK', tujuanKode: 'INJ2' });
    expect(sk.timKode).toBeNull();
    expect(sk.tujuanKode).toBeNull();
  });

  it('update: field baru opsional (undefined dipertahankan)', () => {
    const r = updateUserSchema.parse({ name: 'A', role: 'staff', active: true });
    expect(r.inisial).toBeUndefined();
    expect(r.timKode).toBeUndefined();
    expect(updateUserSchema.parse({ name: 'A', role: 'staff', active: true, inisial: 'xy', tujuanKode: '' })).toMatchObject({ inisial: 'XY', tujuanKode: null });
  });
});
