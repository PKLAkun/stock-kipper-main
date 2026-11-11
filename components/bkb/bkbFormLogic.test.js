import { describe, it, expect } from 'vitest';
import { buildBkbBody, validateBkbForm, schemaError, newIdempotencyKey, countErrors } from './bkbFormLogic.js';

const header = {
  bkbKategori: '4', bkbDate: '2026-11-05', reference: '', tujuanKode: 'INJ1', inisial: 'AND', nomorUrut: 3,
  machine: 'M-01', pihakNama: 'Rudi', pihakDept: 'Gudang B',
};
const line = (o = {}) => ({ key: 'r1', item: { id: 5, itemCode: 'PP-HI10' }, qty: '2,5', deptPemakaiKode: '45', deptProsesKode: 'P1', ...o });
const today = '2026-11-08';

describe('buildBkbBody', () => {
  it('tidak mengirim dept pemakai bila tujuan punya dept bawaan; kirim idempotencyKey', () => {
    const k = newIdempotencyKey();
    const b = buildBkbBody({ header, lines: [line()], tujuan: { wajibMesin: true, deptPemakaiKode: 'PL003' }, isSK: false, idempotencyKey: k });
    expect(b.idempotencyKey).toBe(k);
    expect(b.items[0].deptPemakaiKode).toBeUndefined();
    expect(b.machine).toBe('M-01');
    expect(b.pihakNama).toBeUndefined();
  });
  it('dept proses tidak dikirim lagi', () => {
    const b = buildBkbBody({ header, lines: [line()], tujuan: { wajibMesin: false }, isSK: false, idempotencyKey: newIdempotencyKey() });
    expect(b.items[0]).not.toHaveProperty('deptProsesKode', 'P1');
    expect(b.items[0].deptProsesKode).toBeUndefined();
  });
  it('mesin dikosongkan bila tujuan tak wajib mesin; SK mengirim pihak', () => {
    const b = buildBkbBody({ header, lines: [line()], tujuan: { wajibMesin: false }, isSK: true, idempotencyKey: newIdempotencyKey() });
    expect(b.machine).toBe('');
    expect(b.pihakNama).toBe('Rudi');
    expect(b.items[0].deptPemakaiKode).toBe('45');
  });
  it('pengganti: menggantiBkbId dikirim, pihak tidak', () => {
    const b = buildBkbBody({ header, lines: [line()], tujuan: { wajibMesin: false }, isSK: true, idempotencyKey: newIdempotencyKey(), menggantiBkbId: 9 });
    expect(b.menggantiBkbId).toBe(9);
    expect(b.pihakNama).toBeUndefined();
  });
  it('body lolos skema server', () => {
    const b = buildBkbBody({ header, lines: [line()], tujuan: { wajibMesin: true, deptPemakaiKode: 'PL003' }, isSK: true, idempotencyKey: newIdempotencyKey() });
    expect(schemaError(b)).toBe('');
  });
});

describe('validateBkbForm', () => {
  const t = { kode: 'INJ1', wajibMesin: true, deptPemakaiKode: null };
  it('valid => kosong', () => {
    expect(validateBkbForm({ header, lines: [line()], tujuan: t, isSK: true, today })).toEqual({});
  });
  it('mesin wajib, pihak wajib untuk SK, tanggal masa depan', () => {
    const e = validateBkbForm({
      header: { ...header, machine: '', pihakNama: '', pihakDept: 'x', bkbDate: '2026-12-01' },
      lines: [line()], tujuan: t, isSK: true, today,
    });
    expect(e.machine).toBe('Mesin wajib diisi untuk keterangan INJ1.');
    expect(e.pihakNama).toBe('Nama pihak wajib diisi.');
    expect(e.pihakDept).toBe('Departemen pihak wajib diisi.');
    expect(e.bkbDate).toBe('Tanggal tidak boleh lebih dari hari ini.');
  });
  it('operator tidak diminta pihak; pengganti SK juga tidak', () => {
    const h = { ...header, pihakNama: '', pihakDept: '' };
    expect(validateBkbForm({ header: h, lines: [line()], tujuan: t, isSK: false, today })).toEqual({});
    expect(validateBkbForm({ header: h, lines: [line()], tujuan: t, isSK: true, today, menggantiBkbId: 3 })).toEqual({});
  });
  it('baris: barang kosong, qty 0, desimal berlebih, barang dobel, dept wajib bila tak ada bawaan', () => {
    const e = validateBkbForm({
      header,
      lines: [line({ key: 'a', item: null }), line({ key: 'b', qty: '0' }), line({ key: 'c', qty: '1,2345', item: { id: 6, itemCode: 'X' } }),
        line({ key: 'd' }), line({ key: 'e', deptPemakaiKode: '' , item: { id: 7, itemCode: 'Y' } })],
      tujuan: t, isSK: false, today,
    });
    expect(e['items.a.itemId']).toBe('Pilih barang.');
    expect(e['items.b.qty']).toBe('QTY harus lebih dari 0.');
    expect(e['items.c.qty']).toBe('Maksimal 3 angka di belakang koma.');
    expect(e['items.d.itemId']).toMatch(/sudah ada di daftar/);
    expect(e['items.e.deptPemakaiKode']).toBe('Pilih dept pemakai.');
    expect(countErrors(e)).toBe(5);
  });
  it('shift wajib hanya bila tanggal mundur (perluShift)', () => {
    expect(validateBkbForm({ header: { ...header, reference: '' }, lines: [line()], tujuan: t, isSK: false, today }).reference).toBeUndefined();
    expect(validateBkbForm({ header: { ...header, reference: '' }, lines: [line()], tujuan: t, isSK: false, today, perluShift: true }).reference)
      .toBe('Shift wajib dipilih untuk tanggal yang sudah lewat.');
    expect(validateBkbForm({ header: { ...header, reference: '2' }, lines: [line()], tujuan: t, isSK: false, today, perluShift: true }).reference).toBeUndefined();
  });
  it('dept pemakai tidak diminta bila tujuan punya dept bawaan', () => {
    const e = validateBkbForm({ header, lines: [line({ deptPemakaiKode: '' })], tujuan: { ...t, deptPemakaiKode: 'PL003' }, isSK: false, today });
    expect(e).toEqual({});
  });
});
