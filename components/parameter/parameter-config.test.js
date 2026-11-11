import { describe, it, expect } from 'vitest';
import { TAB_IDS, normalisasiBaris, susunBody, validasi, perubahanBerdampak, tabValid } from './parameter-config';

describe('parameter-config: tab Tim dan Dept Proses (T-22)', () => {
  it('tab tim ada, dept-proses disembunyikan dan jatuh ke tujuan', () => {
    expect(TAB_IDS).toContain('tim');
    expect(TAB_IDS).not.toContain('dept-proses');
    expect(tabValid('tim')).toBe('tim');
    expect(tabValid('dept-proses')).toBe('tujuan');
    expect(susunBody('tim', { kode: 'tarik', nama: 'Tim Tarik' }, null)).toEqual({ kode: 'TARIK', nama: 'Tim Tarik' });
  });
});

describe('parameter-config', () => {
  it('tabValid jatuh ke tujuan untuk nilai asing', () => {
    expect(tabValid('jenis')).toBe('jenis');
    expect(tabValid('xyz')).toBe('tujuan');
  });

  it('normalisasiBaris menerima snake_case dan arah masuk/keluar', () => {
    const r = normalisasiBaris('tujuan', { kode: 'BIP', nama: 'BIP', jenis_kode: 'PB', wajib_mesin: true, terkunci: true });
    expect(r.jenisKode).toBe('PB');
    expect(r.wajibMesin).toBe(true);
    expect(r.terkunci).toBe(true);
    expect(normalisasiBaris('jenis', { kode: 'PB', nama: 'x', arah: 'keluar' }).arah).toBe('out');
  });

  it('susunBody membuang kode bila terkunci', () => {
    const baris = { kode: 'BIP', terkunci: true, aktif: true };
    const body = susunBody('dept-pemakai', { kode: 'bip', nama: 'Baru', aktif: true }, baris);
    expect(body).toEqual({ nama: 'Baru', aktif: true });
  });

  it('susunBody mesin memakai code/name', () => {
    expect(susunBody('mesin', { kode: 'htf-1', nama: 'HTF 1' }, null)).toEqual({ code: 'HTF-1', name: 'HTF 1' });
  });

  it('validasi kode dan nama', () => {
    expect(validasi('dept-proses', { kode: '', nama: '' }, null)).toEqual({ kode: 'Kode wajib diisi.', nama: 'Nama wajib diisi.' });
    expect(validasi('dept-proses', { kode: 'A B', nama: 'ok' }, null).kode).toMatch(/huruf/);
    expect(validasi('tujuan', { kode: 'A', nama: 'Aa' }, null).jenisKode).toBe('Pilih jenis.');
  });

  it('perubahanBerdampak hanya untuk baris terkunci', () => {
    const label = { jenis: (k) => k, dept: (k) => k || 'Pilih manual' };
    const baris = { terkunci: true, jenisKode: 'PB', deptPemakaiKode: null, wajibMesin: false };
    const form = { jenisKode: 'PB', deptPemakaiKode: '', wajibMesin: true };
    expect(perubahanBerdampak(form, baris, label)).toEqual([{ label: 'Wajib mesin', sebelum: 'Tidak', sesudah: 'Ya' }]);
    expect(perubahanBerdampak(form, { ...baris, terkunci: false }, label)).toEqual([]);
  });
});
