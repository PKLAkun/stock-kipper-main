import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bkbRepo, ctx, req, user } from '../../../../../test/bkb-helpers.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));
const confirmPassword = vi.fn();
vi.mock('@/lib/auth/confirm-password', () => ({ confirmPassword: (u, p) => confirmPassword(u, p) }));

import { POST } from './route.js';

const setStatus = (status) => state.repo.getBkb.mockResolvedValue({ id: 1, status, versi: '2026-11-07T08:00:00+00:00' });

beforeEach(() => {
  state.repo = bkbRepo();
  state.user = user('staff');
  confirmPassword.mockReset();
  confirmPassword.mockResolvedValue({ ok: true });
});

describe('POST /api/bkb/[id]/batal belum tersimpan', () => {
  it.each(['menunggu', 'ditahan', 'menunggu_de'])('SK membatalkan %s tanpa password', async (st) => {
    setStatus(st);
    const res = await POST(req('POST', { alasan: 'salah input' }), ctx(1));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ status: 'dibatalkan' });
    expect(confirmPassword).not.toHaveBeenCalled();
  });

  it('operator 403', async () => {
    state.user = user('operator');
    expect((await POST(req('POST', { alasan: 'salah input' }), ctx(1))).status).toBe(403);
  });

  it('400 alasan kurang dari 5 karakter', async () => {
    setStatus('menunggu');
    expect((await POST(req('POST', { alasan: 'abc' }), ctx(1))).status).toBe(400);
    expect(state.repo.batalBkb).not.toHaveBeenCalled();
  });

  it('404 bila BKB tidak ada', async () => {
    expect((await POST(req('POST', { alasan: 'salah input' }), ctx(1))).status).toBe(404);
  });

  it.each(['dibatalkan', 'diganti'])('409 untuk status %s', async (st) => {
    setStatus(st);
    expect((await POST(req('POST', { alasan: 'salah input' }), ctx(1))).status).toBe(409);
  });
});

describe('POST /api/bkb/[id]/batal selesai', () => {
  const full = { versi: '2026-11-07T08:00:00Z', alasan: 'salah barang', password: 'rahasia' };
  beforeEach(() => { setStatus('selesai'); state.user = user('admin'); });

  it('SK 403 (stok berubah, hanya DE/SA)', async () => {
    state.user = user('staff');
    expect((await POST(req('POST', full), ctx(1))).status).toBe(403);
    expect(state.repo.batalBkb).not.toHaveBeenCalled();
  });

  it('DE dengan password benar dan versi cocok: sukses', async () => {
    const res = await POST(req('POST', full), ctx(1));
    expect(res.status).toBe(200);
    expect(confirmPassword).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }), 'rahasia');
    expect(state.repo.batalBkb).toHaveBeenCalledWith(1, 'salah barang', expect.any(Object), '2026-11-07T08:00:00Z');
  });

  it('password salah: 401 dan stok tidak disentuh', async () => {
    const { jsonError } = await import('@/lib/auth/guards');
    confirmPassword.mockResolvedValue({ error: jsonError('Password salah.', 401) });
    expect((await POST(req('POST', full), ctx(1))).status).toBe(401);
    expect(state.repo.batalBkb).not.toHaveBeenCalled();
  });

  it('400 tanpa password atau versi', async () => {
    expect((await POST(req('POST', { versi: '2026-11-07T08:00:00Z', alasan: 'salah barang' }), ctx(1))).status).toBe(400);
    expect((await POST(req('POST', { alasan: 'salah barang', password: 'x' }), ctx(1))).status).toBe(400);
    expect(confirmPassword).not.toHaveBeenCalled();
  });

  it('409 bila versi tidak cocok', async () => {
    const res = await POST(req('POST', { ...full, versi: '2026-11-07T07:59:59Z' }), ctx(1));
    expect(res.status).toBe(409);
    expect(state.repo.batalBkb).not.toHaveBeenCalled();
  });

  it('versi beda format tapi waktu sama tidak memicu 409 palsu, dan dikirim ke repository', async () => {
    const res = await POST(req('POST', full), ctx(1));
    expect(res.status).toBe(200);
    expect(state.repo.batalBkb).toHaveBeenCalledWith(1, 'salah barang', expect.any(Object), '2026-11-07T08:00:00Z');
  });

  it('400 untuk versi bukan tanggal', async () => {
    expect((await POST(req('POST', { ...full, versi: 'abc' }), ctx(1))).status).toBe(400);
  });

  it('409 VERSI_BERUBAH dari SQL (balapan setelah cek route) diteruskan', async () => {
    state.repo.batalBkb.mockRejectedValue(Object.assign(new Error('BKB berubah'), { name: 'DomainError', status: 409 }));
    expect((await POST(req('POST', full), ctx(1))).status).toBe(409);
  });

  it('403 DILARANG dari SQL (aktor non-DE, balapan status) diteruskan', async () => {
    state.repo.batalBkb.mockRejectedValue(Object.assign(new Error('Tidak berhak'), { name: 'DomainError', status: 403 }));
    expect((await POST(req('POST', full), ctx(1))).status).toBe(403);
  });

  it('409 stok minus dari SQL diteruskan', async () => {
    state.repo.batalBkb.mockRejectedValue(Object.assign(new Error('Stok jadi minus'), { name: 'DomainError', status: 409 }));
    expect((await POST(req('POST', full), ctx(1))).status).toBe(409);
  });
});
