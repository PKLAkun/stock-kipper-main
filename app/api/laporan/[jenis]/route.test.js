import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { makeUser } from '@/test/mock-repo.js';
import { DomainError } from '@/lib/db/koreksi.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { GET } from './route.js';

const call = (jenis, qs = '') => GET(new Request(`http://localhost:3000/api/laporan/${jenis}?${qs}`), { params: Promise.resolve({ jenis }) });
const RENTANG = 'dari=2026-11-01&sampai=2026-11-11';

const mutasiRow = { id: 1, tanggal: '2026-11-10T01:00:00Z', docNo: 'PB1', nomorUrut: 1, itemCode: 'A', itemName: 'Alfa', jenis: 'PB', keluar: 2, masuk: null, saldo: 8, shift: '1' };
const kartu = { item: { id: 3, kode: 'A', nama: 'Alfa', unit: 'kg' }, dari: null, sampai: null, saldoAwal: 0, saldoAkhir: 5, rows: [] };

beforeEach(() => {
  state.user = makeUser({ role: 'staff' });
  state.repo = {
    laporanMutasi: vi.fn(async () => ({ rows: [mutasiRow], total: 1, limit: 200, offset: 0 })),
    laporanRekap: vi.fn(async () => [{ kode: 'A', nama: 'Alfa', unit: 'kg', saldoAwal: 1, masuk: 0, keluar: 0, koreksi: 0, saldoAkhir: 1, stokMinimum: 5, diBawahMinimum: true }]),
    laporanKartu: vi.fn(async () => kartu),
    laporanStok: vi.fn(async () => [{ kode: 'A', nama: 'Alfa', unit: 'kg', saldo: 3, stokMinimum: null, diBawahMinimum: false }]),
  };
});

describe('akses', () => {
  it('belum login -> 401', async () => {
    state.user = null;
    expect((await call('stok')).status).toBe(401);
  });
  it('operator -> 403 dan repository tidak dipanggil', async () => {
    state.user = makeUser({ role: 'operator' });
    expect((await call('stok')).status).toBe(403);
    expect(state.repo.laporanStok).not.toHaveBeenCalled();
  });
  it.each(['staff', 'admin', 'superadmin'])('role %s boleh', async (role) => {
    state.user = makeUser({ role });
    expect((await call('stok')).status).toBe(200);
  });
  it('jenis tidak dikenal -> 404', async () => {
    expect((await call('lain')).status).toBe(404);
  });
});

describe('validasi', () => {
  it('mutasi tanpa tanggal -> 400', async () => {
    const res = await call('mutasi');
    expect(res.status).toBe(400);
    expect(state.repo.laporanMutasi).not.toHaveBeenCalled();
  });
  it('rentang lebih dari 1 tahun dan terbalik -> 400', async () => {
    expect((await call('rekap', 'dari=2024-01-01&sampai=2026-01-01')).status).toBe(400);
    expect((await call('rekap', 'dari=2026-11-12&sampai=2026-11-11')).status).toBe(400);
  });
  it('kartu tanpa barang -> 400', async () => {
    expect((await call('kartu')).status).toBe(400);
  });
});

describe('JSON', () => {
  it('mutasi meneruskan filter dan limit bawaan 200', async () => {
    const res = await call('mutasi', `${RENTANG}&itemId=3&jenis=pb&shift=2`);
    expect(res.status).toBe(200);
    expect((await res.json()).data.total).toBe(1);
    expect(state.repo.laporanMutasi).toHaveBeenCalledWith(expect.objectContaining({ dari: '2026-11-01', sampai: '2026-11-11', itemId: 3, jenis: 'PB', shift: '2', limit: 200 }));
  });
  it('rekap dan stok', async () => {
    expect((await (await call('rekap', `${RENTANG}&kategori=1`)).json()).data).toHaveLength(1);
    expect(state.repo.laporanRekap).toHaveBeenCalledWith({ dari: '2026-11-01', sampai: '2026-11-11', kategori: '1' });
    expect((await (await call('stok', 'kategori=4')).json()).data).toHaveLength(1);
    expect(state.repo.laporanStok).toHaveBeenCalledWith({ kategori: '4' });
  });
  it('kartu: barang tidak ada -> 404', async () => {
    state.repo.laporanKartu = vi.fn(async () => null);
    expect((await call('kartu', 'itemId=9')).status).toBe(404);
  });
  it('kartu: memanggil repository dengan itemId dan periode', async () => {
    const res = await call('kartu', 'itemId=3&dari=2026-11-01');
    expect(res.status).toBe(200);
    expect(state.repo.laporanKartu).toHaveBeenCalledWith(3, { dari: '2026-11-01' });
  });
  it('error domain diteruskan, error lain disamarkan', async () => {
    state.repo.laporanStok = vi.fn(async () => { throw new DomainError('Rentang tidak valid', 400); });
    expect((await call('stok')).status).toBe(400);
    state.repo.laporanStok = vi.fn(async () => { throw new Error('detail internal rahasia'); });
    const res = await call('stok');
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('rahasia');
  });
});

describe('format=xlsx', () => {
  it.each([
    ['mutasi', RENTANG, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['rekap', RENTANG, null],
    ['kartu', 'itemId=3', null],
    ['stok', '', null],
  ])('%s: berkas attachment dengan nama laporan-<jenis>-<tanggal>.xlsx', async (jenis, qs) => {
    const res = await call(jenis, `${qs}&format=xlsx`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
    expect(res.headers.get('content-disposition')).toMatch(new RegExp(`^attachment; filename="laporan-${jenis}-\\d{4}-\\d{2}-\\d{2}\\.xlsx"$`));
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets[0].rowCount).toBeGreaterThan(3);
  });
  it('mutasi xlsx meminta sampai 50.000 baris dari offset 0', async () => {
    await call('mutasi', `${RENTANG}&format=xlsx&limit=5&offset=9`);
    expect(state.repo.laporanMutasi).toHaveBeenCalledWith(expect.objectContaining({ limit: 50000, offset: 0 }));
  });
  it('lebih dari 50.000 baris -> 413', async () => {
    state.repo.laporanMutasi = vi.fn(async () => ({ rows: [], total: 50001 }));
    const res = await call('mutasi', `${RENTANG}&format=xlsx`);
    expect(res.status).toBe(413);
    expect(res.headers.get('content-disposition')).toBeNull();
  });
  it('operator tidak bisa mengunduh', async () => {
    state.user = makeUser({ role: 'operator' });
    expect((await call('stok', 'format=xlsx')).status).toBe(403);
  });
});
