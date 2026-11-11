import { describe, it, expect } from 'vitest';
import { tanggalJamWib, tanggalWib, tanggalIndo, angka, periodeTeks, jenisLabel } from './format.js';

describe('format laporan', () => {
  it('tanggal WIB', () => {
    expect(tanggalJamWib('2026-11-10T20:05:00Z')).toBe('11/11/2026 03:05');
    expect(tanggalWib('2026-11-10T16:59:00Z')).toBe('10/11/2026');
    expect(tanggalJamWib(null)).toBe('');
    expect(tanggalJamWib('bukan tanggal')).toBe('');
  });
  it('tanggalIndo dan periode', () => {
    expect(tanggalIndo('2026-11-01')).toBe('01/11/2026');
    expect(tanggalIndo('x')).toBe('');
    expect(periodeTeks('2026-11-01', '2026-11-11')).toBe('01/11/2026 s/d 11/11/2026');
    expect(periodeTeks(null, '2026-11-11')).toBe('Sampai 11/11/2026');
    expect(periodeTeks()).toBe('Seluruh riwayat');
  });
  it('angka: ribuan id-ID, maksimal 3 desimal, kosong -> ""', () => {
    expect(angka(1234.5)).toBe('1.234,5');
    expect(angka(0.12345)).toBe('0,123');
    expect(angka(0)).toBe('0');
    expect(angka(null)).toBe('');
  });
  it('label jenis', () => {
    expect(jenisLabel('OPN')).toBe('Cek Stok');
    expect(jenisLabel('XYZ')).toBe('XYZ');
  });
});
