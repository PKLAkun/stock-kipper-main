import { describe, it, expect } from 'vitest';
import { hitungShift } from './shift.js';

// jam WIB -> Date (WIB = UTC+7)
const wib = (iso) => new Date(`${iso}+07:00`);

describe('hitungShift', () => {
  it.each([
    ['2026-11-11T00:00:00', '1', '2026-11-11T08:00:00'],
    ['2026-11-11T07:59:59', '1', '2026-11-11T08:00:00'],
    ['2026-11-11T08:00:00', '2', '2026-11-11T16:00:00'],
    ['2026-11-11T15:59:59', '2', '2026-11-11T16:00:00'],
    ['2026-11-11T16:00:00', '3', '2026-11-12T00:00:00'],
    ['2026-11-11T23:59:59', '3', '2026-11-12T00:00:00'],
  ])('%s WIB -> shift %s habis %s WIB', (masuk, shift, habis) => {
    const r = hitungShift(wib(masuk));
    expect(r.shift).toBe(shift);
    expect(r.habis.getTime()).toBe(wib(habis).getTime());
  });

  it('tengah malam WIB berganti hari: 23.59 shift 3, 00.00 hari berikutnya shift 1', () => {
    expect(hitungShift(wib('2026-12-31T23:59:00')).shift).toBe('3');
    const r = hitungShift(wib('2027-01-01T00:00:00'));
    expect(r.shift).toBe('1');
    expect(r.habis.getTime()).toBe(wib('2027-01-01T08:00:00').getTime());
  });

  it('memakai WIB, bukan UTC: 17.00 UTC = 00.00 WIB hari berikutnya', () => {
    expect(hitungShift(new Date('2026-11-10T17:00:00Z')).shift).toBe('1');
    expect(hitungShift(new Date('2026-11-10T16:59:00Z')).shift).toBe('3');
  });

  it('menolak tanggal tidak valid', () => {
    expect(() => hitungShift(new Date('x'))).toThrow();
  });
});
