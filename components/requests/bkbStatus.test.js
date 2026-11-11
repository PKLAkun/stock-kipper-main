import { describe, it, expect } from 'vitest';
import {
  parseSaldoInput, formatSelisih, ditahanKeterangan, bisaBatalSebelumTersimpan, splitKeteranganExtra,
  filterDariUrl, perluTindakanDe, FILTER_PERLU,
} from './bkbStatus.js';

describe('parseSaldoInput', () => {
  it('menerima koma dan titik, serta 0', () => {
    expect(parseSaldoInput('525,5')).toEqual({ value: 525.5 });
    expect(parseSaldoInput('0')).toEqual({ value: 0 });
    expect(parseSaldoInput(' 12.250 ')).toEqual({ value: 12.25 });
  });
  it('pesan error sesuai rancangan', () => {
    expect(parseSaldoInput('').error).toBe('Saldo akhir wajib diisi.');
    expect(parseSaldoInput('-1').error).toBe('Saldo akhir tidak boleh minus.');
    expect(parseSaldoInput('abc').error).toBe('Isi dengan angka, mis. 525,5.');
    expect(parseSaldoInput('1,2345').error).toBe('Maksimal 3 angka di belakang koma.');
  });
});

describe('formatSelisih', () => {
  it('tanda selalu tertulis', () => {
    expect(formatSelisih(500, 525.5)).toBe('-25,5');
    expect(formatSelisih(10, 8)).toBe('+2');
    expect(formatSelisih(3, 3)).toBe('0');
    expect(formatSelisih(0.3, 0.1 + 0.2)).toBe('0');
  });
});

describe('helper lain', () => {
  it('keterangan ditahan', () => {
    expect(ditahanKeterangan('menunggu_koreksi')).toBe('Menunggu DE koreksi saldo');
    expect(ditahanKeterangan('dibetulkan_sk')).toBe('Menunggu SK betulkan BKB');
    expect(ditahanKeterangan('tidak_cocok')).toBe('Belum dipilih yang salah');
  });
  it('batal sebelum tersimpan: operator tidak, selesai tidak', () => {
    expect(bisaBatalSebelumTersimpan('operator', 'menunggu')).toBe(false);
    expect(bisaBatalSebelumTersimpan('staff', 'ditahan')).toBe(true);
    expect(bisaBatalSebelumTersimpan('superadmin', 'menunggu_de')).toBe(true);
    expect(bisaBatalSebelumTersimpan('admin', 'selesai')).toBe(false);
  });
  it('split keterangan extra', () => {
    expect(splitKeteranganExtra('AND/12')).toEqual({ inisial: 'AND', nomorUrut: 12 });
  });
});

describe('filter Ruang Tunggu per role', () => {
  it('DE dan Superadmin: tanpa ?status= mendapat "Perlu tindakan saya"; ?status=semua berarti Semua', () => {
    expect(filterDariUrl('', 'admin')).toBe(FILTER_PERLU);
    expect(filterDariUrl('', 'superadmin')).toBe(FILTER_PERLU);
    expect(filterDariUrl('semua', 'admin')).toBe('');
    expect(filterDariUrl('menunggu_de', 'admin')).toBe('menunggu_de');
    expect(filterDariUrl('ngawur', 'admin')).toBe(FILTER_PERLU);
  });

  it('SK dan Operator tidak berubah, dan tidak bisa memakai filter perlu', () => {
    expect(filterDariUrl('', 'staff')).toBe('');
    expect(filterDariUrl('perlu', 'staff')).toBe('');
    expect(filterDariUrl('ditahan', 'operator')).toBe('ditahan');
  });

  it('isi "Perlu tindakan saya": menunggu approve DE dan ditahan menunggu koreksi saja', () => {
    const hasil = perluTindakanDe(
      [{ id: 1, status: 'menunggu_de' }],
      [{ id: 2, ditahanKarena: 'menunggu_koreksi' }, { id: 3, ditahanKarena: 'tidak_cocok' }, { id: 4, ditahan_karena: 'menunggu_koreksi' }],
    );
    expect(hasil.map((b) => b.id)).toEqual([2, 4, 1]);
    expect(perluTindakanDe(undefined, undefined)).toEqual([]);
  });
});
