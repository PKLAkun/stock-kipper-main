import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { createMockRepo, makeUser } from '@/test/mock-repo.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { PATCH } from './route.js';

const ctx = (id = '5') => ({ params: Promise.resolve({ id }) });
const valid = { deptPemakai: [{ baris: 1, kode: 'PRD' }], machine: 'M1', alasan: 'salah mesin', password: 'rahasia' };
function call(body, { origin, raw } = {}) {
  const headers = { host: 'localhost:3000' };
  if (origin) headers.origin = origin;
  return PATCH(new Request('http://localhost:3000/api/bkb/5/data', { method: 'PATCH', headers, body: raw ?? JSON.stringify(body) }), ctx());
}

beforeEach(() => {
  const de = makeUser({ id: 10 + Math.floor(Math.random() * 1e6), role: 'admin', passwordHash: bcrypt.hashSync('rahasia', 4) });
  state.user = de;
  state.repo = { ...createMockRepo([de]), ubahDataBkb: vi.fn(async () => ({ ok: 1 })) };
});

describe('PATCH /api/bkb/5/data', () => {
  it('asal permintaan salah -> 403', async () => {
    expect((await call(valid, { origin: 'http://evil.com' })).status).toBe(403);
  });
  it('belum login -> 401', async () => {
    state.user = null;
    expect((await call(valid)).status).toBe(401);
  });
  it.each(['staff', 'operator'])('role %s -> 403', async (role) => {
    state.user = makeUser({ id: 2, role });
    expect((await call(valid)).status).toBe(403);
    expect(state.repo.ubahDataBkb).not.toHaveBeenCalled();
  });
  it('superadmin boleh', async () => {
    state.user = { ...state.user, role: 'superadmin' };
    expect((await call(valid)).status).toBe(200);
  });
  it('body bukan JSON -> 400', async () => {
    expect((await call(null, { raw: 'x{' })).status).toBe(400);
  });
  it('password kosong -> 400', async () => {
    expect((await call({ ...valid, password: '' })).status).toBe(400);
    expect(state.repo.ubahDataBkb).not.toHaveBeenCalled();
  });
  it('password salah -> 401 dan repository tidak dipanggil', async () => {
    expect((await call({ ...valid, password: 'salah' })).status).toBe(401);
    expect(state.repo.ubahDataBkb).not.toHaveBeenCalled();
  });
  it('alasan terlalu pendek -> 400', async () => {
    expect((await call({ ...valid, alasan: 'ab' })).status).toBe(400);
  });
  it('sukses: password tidak diteruskan ke repository', async () => {
    const res = await call(valid);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(JSON.stringify(state.repo.ubahDataBkb.mock.calls)).not.toContain('rahasia');
  });
  it('DomainError dari repository diteruskan', async () => {
    state.repo.ubahDataBkb = vi.fn(async () => { throw Object.assign(new Error('Bentrok'), { name: 'DomainError', status: 409 }); });
    const res = await call(valid);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Bentrok');
  });
  it('error tak dikenal -> 500 generik', async () => {
    state.repo.ubahDataBkb = vi.fn(async () => { throw new Error('rahasia internal'); });
    const res = await call(valid);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('internal');
  });
  it.each([{ itemId: 3 }, { items: [] }, { qty: 5 }, { jenisKode: 'PR' }, { tujuanKode: 'X' }])('field terlarang %j -> 400', async (extra) => {
    expect((await call({ ...valid, ...extra })).status).toBe(400);
    expect(state.repo.ubahDataBkb).not.toHaveBeenCalled();
  });
  it('tanpa perubahan data -> 400', async () => {
    expect((await call({ alasan: 'salah mesin', password: 'rahasia' })).status).toBe(400);
  });
  it('machine null (kosongkan) diterima', async () => {
    expect((await call({ machine: null, alasan: 'salah mesin', password: 'rahasia' })).status).toBe(200);
  });
});
