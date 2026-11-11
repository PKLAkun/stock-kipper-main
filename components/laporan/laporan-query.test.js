import { describe, it, expect } from 'vitest';
import { TABS, tabValid, filterBawaan, buatQuery, kekuranganFilter, filterDariQuery, queryDariFilterCetak, hariIniWib, awalBulanWib } from './laporan-query.js';

const NOW = Date.parse('2026-11-11T20:00:00Z'); // 12 Nov 03:00 WIB

describe('laporan-query', () => {
  it('empat tab; tab tidak dikenal -> mutasi', () => {
    expect(TABS.map((t) => t.id)).toEqual(['mutasi', 'rekap', 'kartu', 'stok']);
    expect(tabValid('kartu')).toBe('kartu');
    expect(tabValid('x')).toBe('mutasi');
  });
  it('tanggal WIB', () => {
    expect(hariIniWib(NOW)).toBe('2026-11-12');
    expect(awalBulanWib(NOW)).toBe('2026-11-01');
    expect(filterBawaan('rekap', NOW)).toEqual({ dari: '2026-11-01', sampai: '2026-11-12', kategori: '' });
    expect(filterBawaan('stok')).toEqual({ kategori: '' });
  });
  it('buatQuery: hanya nilai terisi, itemId dari barang, tambahan format', () => {
    const f = { dari: '2026-11-01', sampai: '2026-11-11', item: { id: 7 }, jenis: 'PB', keterangan: ' ', shift: '' };
    expect(buatQuery('mutasi', f)).toBe('dari=2026-11-01&sampai=2026-11-11&jenis=PB&itemId=7');
    expect(buatQuery('mutasi', f, { format: 'xlsx' })).toContain('format=xlsx');
    expect(buatQuery('stok', { kategori: '4' })).toBe('kategori=4');
    expect(buatQuery('kartu', { dari: '', sampai: '', item: { id: 2 } })).toBe('itemId=2');
  });
  it('kekuranganFilter', () => {
    expect(kekuranganFilter('kartu', { item: null })).toMatch(/barang/);
    expect(kekuranganFilter('kartu', { item: { id: 1 } })).toBeNull();
    expect(kekuranganFilter('mutasi', { dari: '', sampai: '2026-11-01' })).toMatch(/tanggal/);
    expect(kekuranganFilter('rekap', { dari: '2026-11-05', sampai: '2026-11-01' })).toMatch(/sebelum/);
    expect(kekuranganFilter('rekap', { dari: '2024-01-01', sampai: '2026-01-01' })).toMatch(/1 tahun/);
    expect(kekuranganFilter('stok', { kategori: '' })).toBeNull();
  });
  it('filter cetak dari query halaman', () => {
    const f = filterDariQuery('mutasi', { dari: '2026-11-01', sampai: '2026-11-11', itemId: '7', jenis: 'PB', lain: 'x' });
    expect(f).toEqual({ dari: '2026-11-01', sampai: '2026-11-11', jenis: 'PB', keterangan: '', shift: '', itemId: '7' });
    expect(filterDariQuery('kartu', { itemId: 'abc' }).itemId).toBe('');
    expect(queryDariFilterCetak('mutasi', f, { limit: 50000 })).toBe('dari=2026-11-01&sampai=2026-11-11&jenis=PB&itemId=7&limit=50000');
  });
});

import { hitungRingkasan } from './laporan-query.js';

describe('hitungRingkasan', () => {
  it('mutasi: total dari server, jumlah dari baris tampil', () => {
    const r = hitungRingkasan('mutasi', { total: 5, rows: [{ masuk: 1.5, keluar: null }, { masuk: null, keluar: 2 }] });
    expect(r.map((x) => x.nilai)).toEqual([5, 1.5, 2]);
    expect(r[1].label).toContain('baris tampil');
    expect(hitungRingkasan('mutasi', { total: 2, rows: [{ masuk: 1 }, { keluar: 1 }] })[1].label).toBe('Total masuk');
  });
  it('rekap dan stok menghitung barang di bawah minimum', () => {
    const rows = [{ diBawahMinimum: true }, { diBawahMinimum: false }];
    expect(hitungRingkasan('rekap', rows).map((x) => x.nilai)).toEqual([2, 1]);
    expect(hitungRingkasan('stok', rows).map((x) => x.nilai)).toEqual([2, 1]);
  });
  it('kartu', () => {
    const r = hitungRingkasan('kartu', { saldoAwal: 10, saldoAkhir: 6, rows: [{ keluar: 4 }] });
    expect(r.map((x) => x.nilai)).toEqual([10, 0, 4, 6]);
  });
  it('tanpa data -> []', () => {
    expect(hitungRingkasan('kartu', null)).toEqual([]);
  });
});
