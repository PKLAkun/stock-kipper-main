import { describe, it, expect } from 'vitest';
import { formatAngka, formatTanggal, bagiHalaman, daftarRangkap, normalisasiBkb, alasanTidakBisaCetak } from './bkb-cetak';

describe('bkb-cetak', () => {
  it('formatAngka memakai format Indonesia sampai 3 desimal', () => {
    expect(formatAngka(1250.5)).toBe('1.250,5');
    expect(formatAngka('25')).toBe('25');
    expect(formatAngka(1.23456)).toBe('1,235');
  });

  it('formatTanggal tidak bergeser zona', () => {
    expect(formatTanggal('2026-11-03')).toBe('3 Nov 2026');
    expect(formatTanggal('')).toBe('');
  });

  it('bagiHalaman mengisi baris kosong sampai 6 dan memecah di atas 8', () => {
    const r = (n) => Array.from({ length: n }, (_, i) => ({ kode: `K${i}` }));
    const a = bagiHalaman(r(2));
    expect(a).toHaveLength(1);
    expect(a[0]).toHaveLength(6);
    const b = bagiHalaman(r(9));
    expect(b.map((h) => h.length)).toEqual([8, 6]);
    expect(bagiHalaman([])[0]).toHaveLength(6);
  });

  it('daftarRangkap', () => {
    expect(daftarRangkap('semua')).toHaveLength(3);
    expect(daftarRangkap('copy1').map((r) => r.id)).toEqual(['copy1']);
    expect(daftarRangkap('ngawur')).toHaveLength(3);
  });

  it('normalisasiBkb membaca bentuk respons GET /api/bkb/[id] (mapBkb)', () => {
    const n = normalisasiBkb({
      docNo: 'PB410-26I00030', status: 'selesai', bkbDate: '2026-11-03', reference: '2', jenisKode: 'PB',
      tujuanKode: 'BIP', keterangan: 'BIP/BUD/5', pihakNama: null, dibuatOlehNama: 'Budi', dikonfirmasiOlehNama: 'Sari',
      items: [{ id: 1, itemCode: 'PP-HI10', itemName: 'Biji plastik PP', unit: 'kg', qty: 25, deptPemakaiKode: 'PL003' }],
    });
    expect(n).toMatchObject({ docNo: 'PB410-26I00030', jenis: 'PB', tanggal: '3 Nov 2026', reference: '2', catatan: 'BIP - BIP/BUD/5', diserahkan: 'Sari', diterima: 'Budi' });
    expect(n.baris[0]).toEqual({ kode: 'PP-HI10', nama: 'Biji plastik PP', qty: '25', unit: 'kg', keterangan: 'PL003' });
  });

  it('pihak lain menjadi penerima bila ada', () => {
    expect(normalisasiBkb({ pihakNama: 'Andi', dibuatOlehNama: 'Budi' }).diterima).toBe('Andi');
  });

  it('alasanTidakBisaCetak', () => {
    expect(alasanTidakBisaCetak('selesai')).toBeNull();
    expect(alasanTidakBisaCetak('menunggu')).toMatch(/belum bisa/);
    expect(alasanTidakBisaCetak('dibatalkan')).toMatch(/dibatalkan/);
  });
});
