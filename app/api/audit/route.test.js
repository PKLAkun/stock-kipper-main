import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeUser } from '@/test/mock-repo.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { GET } from './route.js';

const call = (qs = '') => GET(new Request(`http://localhost:3000/api/audit${qs}`));

beforeEach(() => {
  state.user = makeUser({ role: 'admin' });
  state.repo = { listAudit: vi.fn(async () => ({ rows: [{ id: 1 }], total: 41 })) };
});

describe('GET /api/audit', () => {
  it('belum login -> 401', async () => {
    state.user = null;
    expect((await call()).status).toBe(401);
  });
  it.each(['operator', 'staff'])('role %s -> 403', async (role) => {
    state.user = makeUser({ role });
    expect((await call()).status).toBe(403);
  });
  it('default page/limit dan meta', async () => {
    const res = await call('?entitas=&entitasId=');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.meta).toEqual({ total: 41, page: 1, limit: 20, totalPages: 3 });
    expect(state.repo.listAudit).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });
  it('filter diteruskan', async () => {
    await call('?entitas=bkb&entitasId=5&startDate=2026-11-01&endDate=2026-11-08&page=2&limit=10');
    expect(state.repo.listAudit).toHaveBeenCalledWith({ entitas: 'bkb', entitasId: '5', startDate: '2026-11-01', endDate: '2026-11-08', page: 2, limit: 10 });
  });
  it('tanggal salah / limit berlebih -> 400', async () => {
    expect((await call('?startDate=1-1-2026')).status).toBe(400);
    expect((await call('?limit=1000')).status).toBe(400);
  });
});
