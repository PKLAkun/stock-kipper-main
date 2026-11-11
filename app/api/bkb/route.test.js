import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bkbRepo, req, user, validBkb } from '../../../test/bkb-helpers.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { GET, POST } from './route.js';

beforeEach(() => { state.repo = bkbRepo(); state.user = user('staff'); });
// operator dengan akun lengkap (keterangan dan inisial dari Superadmin)
const op = (extra = {}) => ({ ...user('operator', 3), tujuanKode: 'INJ1', inisial: 'RDI', sesiShift: '2', ...extra });

describe('GET /api/bkb', () => {
  it('401 tanpa sesi', async () => {
    state.user = null;
    expect((await GET(req('GET'))).status).toBe(401);
  });

  it('operator dipaksa hanya BKB miliknya', async () => {
    state.user = user('operator', 7);
    const res = await GET(req('GET', undefined, 'http://localhost:3000/api/bkb?status=menunggu&ownerId=99'));
    expect(res.status).toBe(200);
    expect(state.repo.listBkb.mock.calls[0][0]).toMatchObject({ ownerId: 7, status: 'menunggu' });
  });

  it('SK tidak dibatasi pemilik, meta halaman benar', async () => {
    state.repo.listBkb.mockResolvedValue({ items: [{ id: 1 }], total: 31 });
    const body = await (await GET(req('GET', undefined, 'http://localhost:3000/api/bkb?limit=15&page=2'))).json();
    expect(state.repo.listBkb.mock.calls[0][0].ownerId).toBeUndefined();
    expect(body.meta).toEqual({ total: 31, page: 2, limit: 15, totalPages: 3 });
  });

  it('400 untuk status tidak dikenal', async () => {
    expect((await GET(req('GET', undefined, 'http://localhost:3000/api/bkb?status=aneh'))).status).toBe(400);
  });
});

describe('POST /api/bkb', () => {
  it('403 asal tidak valid', async () => {
    const r = new Request('http://localhost:3000/api/bkb', {
      method: 'POST', headers: { host: 'localhost:3000', origin: 'http://evil.com' }, body: '{}',
    });
    expect((await POST(r)).status).toBe(403);
  });

  it('403 untuk admin (bawaan Pengaturan: hanya O dan SK)', async () => {
    state.user = user('admin');
    expect((await POST(req('POST', validBkb({ pihakNama: 'X' })))).status).toBe(403);
    expect(state.repo.createBkb).not.toHaveBeenCalled();
  });

  it('mengikuti Pengaturan peran_buat_bkb: DE diizinkan, SK ditolak', async () => {
    state.repo.getPengaturan.mockResolvedValue({ wajibApproveDe: true, peranBuatBkb: ['admin'] });
    state.user = user('admin');
    expect((await POST(req('POST', validBkb({ pihakNama: 'X' })))).status).toBe(201);
    state.user = user('staff');
    expect((await POST(req('POST', validBkb({ pihakNama: 'X' })))).status).toBe(403);
    expect(state.repo.createBkb).toHaveBeenCalledTimes(1);
  });

  it('BKB pengganti memakai pengaturan sendiri, terpisah dari BKB biasa', async () => {
    // BKB biasa hanya operator, pengganti tetap SK
    state.repo.getPengaturan.mockResolvedValue({ wajibApproveDe: true, peranBuatBkb: ['operator'], peranBuatPengganti: ['staff'] });
    state.user = user('staff');
    expect((await POST(req('POST', validBkb({ pihakNama: 'X' })))).status).toBe(403);
    expect((await POST(req('POST', validBkb({ menggantiBkbId: 5 })))).status).toBe(201);
    // pengganti hanya DE: SK ditolak
    state.repo.getPengaturan.mockResolvedValue({ wajibApproveDe: true, peranBuatBkb: ['operator', 'staff'], peranBuatPengganti: ['admin'] });
    expect((await POST(req('POST', validBkb({ menggantiBkbId: 5 })))).status).toBe(403);
    expect(state.repo.createBkb).toHaveBeenCalledTimes(1);
  });

  it('operator berhasil: 201 dan sumber operator', async () => {
    state.user = op();
    const res = await POST(req('POST', validBkb()));
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual({ id: 9, docNo: 'PB410-26K00001', status: 'menunggu' });
    const [input, actor] = state.repo.createBkb.mock.calls[0];
    expect(input.sumber).toBe('operator');
    expect(input.inisial).toBe('RDI');
    expect(actor.id).toBe(3);
  });

  it('operator ditolak bila mengirim pihakNama atau menggantiBkbId', async () => {
    state.user = op();
    expect((await POST(req('POST', validBkb({ pihakNama: 'Budi' })))).status).toBe(400);
    expect((await POST(req('POST', validBkb({ menggantiBkbId: 4 })))).status).toBe(400);
    expect(state.repo.createBkb).not.toHaveBeenCalled();
  });

  it('SK wajib pihakNama kecuali BKB pengganti', async () => {
    expect((await POST(req('POST', validBkb()))).status).toBe(400);
    expect((await POST(req('POST', validBkb({ pihakNama: 'Budi', pihakDept: 'GA' })))).status).toBe(201);
    expect(state.repo.createBkb.mock.calls[0][0].sumber).toBe('non_operator');
    expect((await POST(req('POST', validBkb({ menggantiBkbId: 4 })))).status).toBe(201);
  });

  it('400 tanpa idempotencyKey, key bukan UUID, barang dobel, qty nol', async () => {
    state.user = op();
    expect((await POST(req('POST', validBkb({ idempotencyKey: undefined })))).status).toBe(400);
    expect((await POST(req('POST', validBkb({ idempotencyKey: 'abc' })))).status).toBe(400);
    expect((await POST(req('POST', validBkb({ items: [{ itemId: 1, qty: 1 }, { itemId: 1, qty: 2 }] })))).status).toBe(400);
    expect((await POST(req('POST', validBkb({ items: [{ itemId: 1, qty: 0 }] })))).status).toBe(400);
    expect((await POST(req('POST', validBkb({ items: [] })))).status).toBe(400);
  });

  it('DomainError dari repository diteruskan (409)', async () => {
    state.user = op();
    state.repo.createBkb.mockRejectedValue(Object.assign(new Error('Stok tidak cukup'), { name: 'DomainError', status: 409 }));
    const res = await POST(req('POST', validBkb()));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Stok tidak cukup');
  });

  it('error tak dikenal: 500 generik tanpa bocor pesan', async () => {
    state.user = op();
    state.repo.createBkb.mockRejectedValue(new Error('relation bkb secret'));
    const res = await POST(req('POST', validBkb()));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
});

describe('POST /api/bkb: tujuan, inisial, shift dari server (T-23)', () => {
  // 2026-11-11 09:30 WIB = shift 2
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-11T02:30:00Z')); });
  afterEach(() => { vi.useRealTimers(); });
  const sent = () => state.repo.createBkb.mock.calls[0][0];

  it('operator: tujuan, inisial dari akun dan shift dari sesi; nilai browser diabaikan', async () => {
    state.user = op({ sesiShift: '1' });
    const res = await POST(req('POST', validBkb({ bkbDate: '2026-11-11', tujuanKode: 'BIP', inisial: 'ZZZ', reference: '3' })));
    expect(res.status).toBe(201);
    expect(sent()).toMatchObject({ tujuanKode: 'INJ1', inisial: 'RDI', reference: '1' });
  });

  it('operator token lama (tanpa sesiShift): shift dari jam server', async () => {
    state.user = op({ sesiShift: null });
    await POST(req('POST', validBkb({ bkbDate: '2026-11-11' })));
    expect(sent().reference).toBe('2');
  });

  it('operator tanpa keterangan akun: 409 ramah dari repository diteruskan', async () => {
    state.user = op({ tujuanKode: null });
    state.repo.createBkb.mockRejectedValue(Object.assign(new Error('Akun Anda belum diatur. Hubungi Superadmin.'), { name: 'DomainError', status: 409 }));
    const res = await POST(req('POST', validBkb({ bkbDate: '2026-11-11' })));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Akun Anda belum diatur. Hubungi Superadmin.');
  });

  it('SK hari ini: shift dari jam server, reference browser diabaikan; tujuan SK dari body; inisial akun', async () => {
    state.user = { ...user('staff'), inisial: 'SKA' };
    await POST(req('POST', validBkb({ bkbDate: '2026-11-11', reference: '3', pihakNama: 'X', pihakDept: 'Y' })));
    expect(sent()).toMatchObject({ tujuanKode: 'BIP', inisial: 'SKA', reference: '2' });
  });

  // [Tahap 2, 11-11-2026, T-27] Dinonaktifkan (temuan review): inisial dari browser tidak lagi dipercaya.
  // it('SK tanpa inisial akun memakai inisial body', async () => {
  //   await POST(req('POST', validBkb({ bkbDate: '2026-11-11', pihakNama: 'X', pihakDept: 'Y' })));
  //   expect(sent().inisial).toBe('AND');
  // });
  it('SK tanpa inisial akun: inisial dari nama akun, kiriman browser diabaikan', async () => {
    await POST(req('POST', validBkb({ bkbDate: '2026-11-11', inisial: 'ZZZ', pihakNama: 'X', pihakDept: 'Y' })));
    expect(sent().inisial).toBe('U-S'); // nameToInitial('U-staff')
  });

  it('tanggal mundur: shift dari body wajib 1/2/3', async () => {
    const res = await POST(req('POST', validBkb({ bkbDate: '2026-11-05', reference: '', pihakNama: 'X', pihakDept: 'Y' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Shift wajib dipilih untuk tanggal yang sudah lewat.');
    expect(state.repo.createBkb).not.toHaveBeenCalled();
    const ok = await POST(req('POST', validBkb({ bkbDate: '2026-11-05', reference: '3', pihakNama: 'X', pihakDept: 'Y' })));
    expect(ok.status).toBe(201);
    expect(sent().reference).toBe('3');
  });

  it('operator tanggal mundur juga wajib memilih shift', async () => {
    state.user = op();
    expect((await POST(req('POST', validBkb({ bkbDate: '2026-11-05', reference: '' })))).status).toBe(400);
  });

  it('tanggal masa depan ditolak 400', async () => {
    const res = await POST(req('POST', validBkb({ bkbDate: '2026-11-12', pihakNama: 'X', pihakDept: 'Y' })));
    expect(res.status).toBe(400);
    expect(state.repo.createBkb).not.toHaveBeenCalled();
  });

  it('pengganti dengan tanggal sama memakai shift BKB lama', async () => {
    state.repo.getBkb.mockResolvedValue({ id: 5, bkbDate: '2026-11-05', reference: '3' });
    const res = await POST(req('POST', validBkb({ bkbDate: '2026-11-05', reference: '', menggantiBkbId: 5 })));
    expect(res.status).toBe(201);
    expect(sent().reference).toBe('3');
  });

  it('pengganti dengan tanggal berbeda mengikuti aturan tanggal biasa', async () => {
    state.repo.getBkb.mockResolvedValue({ id: 5, bkbDate: '2026-11-04', reference: '3' });
    const res = await POST(req('POST', validBkb({ bkbDate: '2026-11-05', reference: '', menggantiBkbId: 5 })));
    expect(res.status).toBe(400);
  });
});
