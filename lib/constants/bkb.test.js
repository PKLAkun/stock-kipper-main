import { describe, it, expect } from 'vitest';
import { tentukanShiftBkb, tanggalWib } from './bkb.js';

// 2026-11-11 09:30 WIB = shift 2
const now = new Date('2026-11-11T02:30:00Z');
const dasar = { now, role: 'staff', sesiShift: null };

describe('tanggalWib', () => {
  it('memakai tanggal WIB, bukan UTC', () => {
    expect(tanggalWib(new Date('2026-11-10T18:00:00Z'))).toBe('2026-11-11');
  });
});

describe('tentukanShiftBkb', () => {
  it('hari ini: role non operator memakai jam server, reference browser diabaikan', () => {
    expect(tentukanShiftBkb({ ...dasar, bkbDate: '2026-11-11', reference: '3' })).toEqual({ reference: '2' });
    expect(tentukanShiftBkb({ ...dasar, bkbDate: undefined, reference: '' })).toEqual({ reference: '2' });
  });
  it('hari ini: operator memakai shift sesi, cadangan jam server untuk token lama', () => {
    expect(tentukanShiftBkb({ ...dasar, role: 'operator', sesiShift: '1', bkbDate: '2026-11-11' })).toEqual({ reference: '1' });
    expect(tentukanShiftBkb({ ...dasar, role: 'operator', sesiShift: null, bkbDate: '2026-11-11' })).toEqual({ reference: '2' });
  });
  it('tanggal mundur: shift wajib dari body', () => {
    expect(tentukanShiftBkb({ ...dasar, bkbDate: '2026-11-10', reference: '3' })).toEqual({ reference: '3' });
    expect(tentukanShiftBkb({ ...dasar, bkbDate: '2026-11-10', reference: '' })).toEqual({
      error: 'Shift wajib dipilih untuk tanggal yang sudah lewat.', status: 400,
    });
    expect(tentukanShiftBkb({ ...dasar, bkbDate: '2026-11-10', reference: '9' }).error).toBeTruthy();
  });
  it('tanggal masa depan ditolak', () => {
    expect(tentukanShiftBkb({ ...dasar, bkbDate: '2026-11-12', reference: '1' }).status).toBe(400);
  });
  it('pengganti dengan tanggal sama memakai shift BKB lama (atau kosong bila BKB lama tanpa shift)', () => {
    expect(tentukanShiftBkb({ ...dasar, bkbDate: '2026-11-05', reference: '', shiftLama: '3', tanggalLama: '2026-11-05' })).toEqual({ reference: '3' });
    expect(tentukanShiftBkb({ ...dasar, bkbDate: '2026-11-05', reference: '', shiftLama: null, tanggalLama: '2026-11-05' })).toEqual({ reference: null });
    expect(tentukanShiftBkb({ ...dasar, bkbDate: '2026-11-05', reference: '', shiftLama: '3', tanggalLama: '2026-11-04' }).error).toBeTruthy();
  });
});
