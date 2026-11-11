import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeUser } from '@/test/mock-repo.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { GET } from './route.js';

const call = (id = '3') => GET(new Request(`http://localhost:3000/api/items/${id}/kartu`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  state.user = makeUser({ role: 'staff' });
  state.repo = { getKartuStok: vi.fn(async () => [{ nomorUrut: 1 }]) };
});

describe('GET /api/items/[id]/kartu', () => {
  it('belum login -> 401', async () => {
    state.user = null;
    expect((await call()).status).toBe(401);
  });
  it('operator -> 403', async () => {
    state.user = makeUser({ role: 'operator' });
    expect((await call()).status).toBe(403);
  });
  it.each(['staff', 'admin', 'superadmin'])('role %s boleh', async (role) => {
    state.user = makeUser({ role });
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([{ nomorUrut: 1 }]);
  });
  it('id tidak valid -> 400', async () => {
    expect((await call('0')).status).toBe(400);
  });
  it('barang tidak ada -> 404', async () => {
    state.repo.getKartuStok = vi.fn(async () => null);
    expect((await call()).status).toBe(404);
  });
});
