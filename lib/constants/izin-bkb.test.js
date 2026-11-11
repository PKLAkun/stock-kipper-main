import { describe, it, expect } from 'vitest';
import { bolehBuatBkb, bolehBuatPengganti, normalPeranBuatBkb, PERAN_BUAT_BKB_DEFAULT } from './izin-bkb.js';

describe('izin membuat BKB', () => {
  it('bawaan: operator dan SK', () => {
    expect(normalPeranBuatBkb(undefined)).toEqual(PERAN_BUAT_BKB_DEFAULT);
    expect(normalPeranBuatBkb([])).toEqual(PERAN_BUAT_BKB_DEFAULT);
    expect(normalPeranBuatBkb(['tamu'])).toEqual(PERAN_BUAT_BKB_DEFAULT);
    expect(bolehBuatBkb('staff')).toBe(true);
    expect(bolehBuatBkb('admin')).toBe(false);
  });

  it('mengikuti pengaturan, tanpa hierarki role', () => {
    expect(bolehBuatBkb('admin', ['admin'])).toBe(true);
    expect(bolehBuatBkb('superadmin', ['admin'])).toBe(false);
    expect(bolehBuatBkb('staff', ['operator'])).toBe(false);
  });

  it('BKB pengganti: pengaturan terpisah, bawaan SK, operator tidak termasuk pilihan', () => {
    expect(bolehBuatPengganti('staff')).toBe(true);
    expect(bolehBuatPengganti('admin')).toBe(false);
    expect(bolehBuatPengganti('operator', ['operator', 'staff'])).toBe(false);
    expect(bolehBuatPengganti('admin', ['admin'])).toBe(true);
    expect(bolehBuatPengganti('staff', ['admin'])).toBe(false);
    expect(bolehBuatPengganti('staff', ['operator'])).toBe(true); // isi tidak valid -> bawaan
  });
});
