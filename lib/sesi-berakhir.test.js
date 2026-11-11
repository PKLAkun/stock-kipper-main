import { describe, it, expect } from 'vitest';
import { hitungStatusSesi, jamWib } from './sesi-berakhir.js';

const akhir = '2026-11-11T09:00:00.000Z'; // 16.00 WIB
const t = (iso) => new Date(iso).getTime();

describe('jamWib', () => {
  it('memformat HH.MM WIB', () => {
    expect(jamWib(new Date(akhir))).toBe('16.00');
    expect(jamWib(new Date('2026-11-10T17:05:00Z'))).toBe('00.05');
  });
});

describe('hitungStatusSesi', () => {
  it('lebih dari 10 menit sebelum habis: belum ada peringatan', () => {
    const r = hitungStatusSesi(akhir, t('2026-11-11T08:49:59Z'));
    expect(r).toMatchObject({ aktif: true, tampilPeringatan: false, habis: false, jamBerakhir: '16.00' });
  });
  it('tepat 10 menit sebelum habis: peringatan tampil', () => {
    expect(hitungStatusSesi(akhir, t('2026-11-11T08:50:00Z')).tampilPeringatan).toBe(true);
  });
  it('1 detik sebelum habis: masih peringatan, belum habis', () => {
    const r = hitungStatusSesi(akhir, t('2026-11-11T08:59:59Z'));
    expect(r.tampilPeringatan).toBe(true);
    expect(r.habis).toBe(false);
  });
  it('tepat saat habis dan sesudahnya: habis, tanpa peringatan', () => {
    for (const w of ['2026-11-11T09:00:00Z', '2026-11-11T09:30:00Z']) {
      const r = hitungStatusSesi(akhir, t(w));
      expect(r.habis).toBe(true);
      expect(r.tampilPeringatan).toBe(false);
    }
  });
  it('tanpa sesiBerakhir atau tidak valid: tidak aktif', () => {
    for (const v of [null, undefined, '', 'bukan-tanggal']) {
      expect(hitungStatusSesi(v, Date.now())).toMatchObject({ aktif: false, habis: false, tampilPeringatan: false });
    }
  });
});
