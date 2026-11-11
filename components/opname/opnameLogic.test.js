import { describe, it, expect } from 'vitest';
import {
  hitungSelisih, validasiForm, bodyDariForm, formDariOpname, bolehUbah, bolehSetujuiIni, pembuatSendiri,
  peringatanSaldoBerubah, dampakSetujui, bolehBuat, bolehSetuju,
} from './opnameLogic.js';

const item = (id, quantity) => ({ id, itemCode: `K${id}`, name: `Barang ${id}`, unit: 'kg', quantity });
const line = (key, it, jumlah, analisa = '') => ({ key, item: it, jumlah, analisa });
const form = (alasanJenis, lines) => ({ alasanJenis, tanggal: '2026-11-11', catatan: '', lines });

describe('hitungSelisih', () => {
  it('opname: fisik - sistem; rusak/hilang: minus jumlah', () => {
    expect(hitungSelisih('opname', 10, '8')).toBe(-2);
    expect(hitungSelisih('opname', 10, '12,5')).toBe(2.5);
    expect(hitungSelisih('opname', 0.1, '0.3')).toBe(0.2);
    expect(hitungSelisih('rusak', 10, '3')).toBe(-3);
    expect(hitungSelisih('hilang', 10, 3)).toBe(-3);
    expect(hitungSelisih('opname', 10, '')).toBeNull();
    expect(hitungSelisih('opname', 10, 'abc')).toBeNull();
  });
});

describe('validasiForm', () => {
  it('form kosong -> error umum', () => {
    expect(validasiForm(form('opname', [line('a', null, '')])).errors.umum).toMatch(/minimal satu barang/);
  });
  it('jumlah wajib, tidak minus, rusak tidak boleh 0, fisik 0 boleh', () => {
    expect(validasiForm(form('opname', [line('a', item(1, 5), '')])).errors.a.jumlah).toMatch(/wajib/);
    expect(validasiForm(form('opname', [line('a', item(1, 5), '-1')])).errors.a.jumlah).toMatch(/minus/);
    expect(validasiForm(form('rusak', [line('a', item(1, 5), '0')])).errors.a.jumlah).toMatch(/lebih dari 0/);
    expect(validasiForm(form('opname', [line('a', item(1, 5), '0')])).count).toBe(0);
    expect(validasiForm(form('opname', [line('a', item(1, 5), '1.2345')])).errors.a.jumlah).toMatch(/3 angka/);
  });
  it('barang dobel ditolak', () => {
    const r = validasiForm(form('opname', [line('a', item(1, 5), '1'), line('b', item(1, 5), '2')]));
    expect(r.errors.b.item).toMatch(/sudah ada/);
  });
  it('draf tidak minta analisa; ajukan minta bila selisih != 0 dan minimal 10 karakter', () => {
    const f = form('opname', [line('a', item(1, 10), '8', 'pendek')]);
    expect(validasiForm(f, 'draf').count).toBe(0);
    expect(validasiForm(f, 'ajukan').errors.a.analisa).toMatch(/minimal 10/);
    const ok = form('opname', [line('a', item(1, 10), '8', 'salah hitung kemarin')]);
    expect(validasiForm(ok, 'ajukan').count).toBe(0);
  });
  it('selisih 0 tidak butuh analisa; rusak selalu selisih != 0', () => {
    expect(validasiForm(form('opname', [line('a', item(1, 10), '10')]), 'ajukan').count).toBe(0);
    expect(validasiForm(form('rusak', [line('a', item(1, 10), '2')]), 'ajukan').errors.a.analisa).toBeTruthy();
  });
  it('baris kosong sepenuhnya diabaikan', () => {
    expect(validasiForm(form('opname', [line('a', item(1, 10), '10'), line('b', null, '')]), 'ajukan').count).toBe(0);
  });
});

describe('bodyDariForm', () => {
  it('opname memakai qtyFisik, rusak memakai qty, baris kosong dibuang, analisa di-trim', () => {
    const b = bodyDariForm(form('opname', [line('a', item(1, 10), '8', ' salah hitung '), line('b', null, '')]), 'uuid');
    expect(b).toEqual({ alasanJenis: 'opname', tanggal: '2026-11-11', catatan: '', idempotencyKey: 'uuid', items: [{ itemId: 1, qtyFisik: 8, analisa: 'salah hitung' }] });
    const r = bodyDariForm(form('rusak', [line('a', item(2, 10), '2,5')]));
    expect(r.items).toEqual([{ itemId: 2, qty: 2.5 }]);
    expect('idempotencyKey' in r).toBe(false);
  });
});

describe('formDariOpname', () => {
  it('memetakan baris; saldo memakai saldo sekarang', () => {
    const f = formDariOpname({ alasanJenis: 'opname', tanggal: '2026-11-11', catatan: null, items: [{ id: 3, itemId: 5, itemCode: 'A', itemName: 'a', unit: 'kg', saldoSistemSaatHitung: 10, saldoSekarang: 12, qtyFisik: 8, qty: null, analisa: null }] });
    expect(f.lines[0]).toMatchObject({ jumlah: '8', analisa: '', item: { id: 5, quantity: 12 } });
  });
});

describe('hak akses', () => {
  it('peran', () => {
    expect(bolehBuat('staff') && bolehBuat('superadmin')).toBe(true);
    expect(bolehBuat('admin') || bolehBuat('operator')).toBe(false);
    expect(bolehSetuju('admin') && bolehSetuju('superadmin')).toBe(true);
    expect(bolehSetuju('staff') || bolehSetuju('operator')).toBe(false);
  });
  it('ubah hanya draf/ditolak oleh pembuat peran; setujui bukan buatan sendiri', () => {
    expect(bolehUbah({ status: 'draf' }, { role: 'staff' })).toBe(true);
    expect(bolehUbah({ status: 'ditolak' }, { role: 'superadmin' })).toBe(true);
    expect(bolehUbah({ status: 'diajukan' }, { role: 'staff' })).toBe(false);
    expect(bolehUbah({ status: 'draf' }, { role: 'admin' })).toBe(false);
    const o = { status: 'diajukan', dibuatOlehId: 4 };
    expect(bolehSetujuiIni(o, { id: 9, role: 'admin' })).toBe(true);
    expect(bolehSetujuiIni(o, { id: 4, role: 'superadmin' })).toBe(false);
    expect(pembuatSendiri(o, { id: 4, role: 'superadmin' })).toBe(true);
    expect(bolehSetujuiIni({ ...o, status: 'draf' }, { id: 9, role: 'admin' })).toBe(false);
    expect(bolehSetujuiIni(o, { id: 9, role: 'staff' })).toBe(false);
  });
});

describe('setujui', () => {
  const o = { items: [
    { itemCode: 'A', itemName: 'a', unit: 'kg', selisih: -2, saldoSistemSaatHitung: 10, saldoSekarang: 10, saldoBerubah: false },
    { itemCode: 'B', itemName: 'b', unit: 'kg', selisih: -5, saldoSistemSaatHitung: 10, saldoSekarang: 3, saldoBerubah: true },
    { itemCode: 'C', itemName: 'c', unit: 'kg', selisih: 0, saldoSistemSaatHitung: 4, saldoSekarang: 4, saldoBerubah: false },
  ] };
  it('peringatan hanya untuk saldo yang berubah', () => {
    const w = peringatanSaldoBerubah(o);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('B');
  });
  it('dampak mengabaikan selisih 0 dan menandai yang jadi minus', () => {
    const d = dampakSetujui(o);
    expect(d.rows.map((r) => r.kode)).toEqual(['A', 'B']);
    expect(d.rows[0].sesudah).toBe(8);
    expect(d.minus.map((r) => r.kode)).toEqual(['B']);
  });
});
