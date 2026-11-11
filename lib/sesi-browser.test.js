import { describe, it, expect } from 'vitest';
import { tujuanAman } from './sesi-browser.js';

describe('tujuanAman', () => {
  it('hanya path internal yang diterima', () => {
    expect(tujuanAman('/ruang-tunggu?status=menunggu')).toBe('/ruang-tunggu?status=menunggu');
    expect(tujuanAman(null)).toBe('/');
    expect(tujuanAman('https://contoh.com')).toBe('/');
    expect(tujuanAman('//contoh.com')).toBe('/');
    expect(tujuanAman('/\\contoh.com')).toBe('/');
  });
});
