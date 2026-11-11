import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeUser } from '@/test/mock-repo.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { GET } from './route.js';

const call = (qs, id = '5') => GET(new Request(`http://localhost:3000/api/bkb/${id}/dampak${qs}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  state.user = makeUser({ id: 1, role: 'admin' });
  state.repo = { getDampakBkb: vi.fn(async () => ({ versi: 'v1', baris: [], peringatan: [] })) };
});

describe('GET /api/bkb/[id]/dampak', () => {
  it('belum login -> 401', async () => {
    state.user = null;
    expect((await call('?aksi=batal')).status).toBe(401);
  });
  it.each(['operator', 'staff'])('role %s -> 403', async (role) => {
    state.user = makeUser({ role });
    expect((await call('?aksi=batal')).status).toBe(403);
  });
  it('aksi tidak valid atau kosong -> 400', async () => {
    expect((await call('?aksi=hapus')).status).toBe(400);
    expect((await call('')).status).toBe(400);
  });
  it('aksi ganti tanpa penggantiId -> 400', async () => {
    expect((await call('?aksi=ganti')).status).toBe(400);
  });
  it('id tidak valid -> 400', async () => {
    expect((await call('?aksi=batal', 'abc')).status).toBe(400);
  });
  it('batal -> sukses', async () => {
    const res = await call('?aksi=batal');
    expect(res.status).toBe(200);
    expect((await res.json()).data.versi).toBe('v1');
    expect(state.repo.getDampakBkb).toHaveBeenCalledWith(5, { aksi: 'batal' });
  });
  it('ganti dengan penggantiId -> sukses', async () => {
    await call('?aksi=ganti&penggantiId=9');
    expect(state.repo.getDampakBkb).toHaveBeenCalledWith(5, { aksi: 'ganti', penggantiId: 9 });
  });
  it('BKB tidak ada -> 404', async () => {
    state.repo.getDampakBkb = vi.fn(async () => null);
    expect((await call('?aksi=batal')).status).toBe(404);
  });
});
