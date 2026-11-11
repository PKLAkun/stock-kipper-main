import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bkbRepo, ctx, req, user, validBkb } from '../../../../test/bkb-helpers.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { GET, PUT } from './route.js';

beforeEach(() => { state.repo = bkbRepo(); state.user = user('staff'); });

describe('GET /api/bkb/[id]', () => {
  it('404 bila repository mengembalikan null (milik orang lain / tidak ada)', async () => {
    state.user = user('operator', 7);
    expect((await GET(req('GET'), ctx(5))).status).toBe(404);
    expect(state.repo.getBkb).toHaveBeenCalledWith(5, { ownerId: 7 });
  });

  it('SK tanpa batas pemilik', async () => {
    state.repo.getBkb.mockResolvedValue({ id: 5 });
    const res = await GET(req('GET'), ctx(5));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: 5 });
    expect(state.repo.getBkb).toHaveBeenCalledWith(5, { ownerId: undefined });
  });

  it('404 untuk id bukan angka', async () => {
    expect((await GET(req('GET'), ctx('abc'))).status).toBe(404);
  });
});

describe('PUT /api/bkb/[id]', () => {
  it('hanya SK: operator dan admin 403', async () => {
    state.user = user('operator');
    expect((await PUT(req('PUT', validBkb()), ctx(5))).status).toBe(403);
    state.user = user('admin');
    expect((await PUT(req('PUT', validBkb()), ctx(5))).status).toBe(403);
  });

  it('SK berhasil membetulkan', async () => {
    const res = await PUT(req('PUT', validBkb({ pihakNama: 'Budi' })), ctx(5));
    expect(res.status).toBe(200);
    expect(state.repo.updateBkb.mock.calls[0][0]).toBe(5);
  });

  it('menggantiBkbId ditolak pada PUT', async () => {
    expect((await PUT(req('PUT', validBkb({ menggantiBkbId: 2 })), ctx(5))).status).toBe(400);
  });

  it('409 status tidak sesuai diteruskan', async () => {
    state.repo.updateBkb.mockRejectedValue(Object.assign(new Error('Status tidak sesuai'), { name: 'DomainError', status: 409 }));
    expect((await PUT(req('PUT', validBkb({ pihakNama: 'B' })), ctx(5))).status).toBe(409);
  });
});
