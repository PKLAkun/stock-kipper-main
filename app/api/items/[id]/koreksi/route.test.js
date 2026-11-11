import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { createMockRepo, makeUser } from '@/test/mock-repo.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { POST } from './route.js';

const ctx = (id = '5') => ({ params: Promise.resolve({ id }) });
const valid = { saldoBaru: 12.5, alasan: 'hasil stock opname', namaAtasan: 'Pak Budi', nomorBa: 'BA/11/001', password: 'rahasia', bkbId: 7 };
function call(body, { origin, raw } = {}) {
  const headers = { host: 'localhost:3000' };
  if (origin) headers.origin = origin;
  return POST(new Request('http://localhost:3000/api/items/5/koreksi', { method: 'POST', headers, body: raw ?? JSON.stringify(body) }), ctx());
}

beforeEach(() => {
  const de = makeUser({ id: 10 + Math.floor(Math.random() * 1e6), role: 'admin', passwordHash: bcrypt.hashSync('rahasia', 4) });
  state.user = de;
  state.repo = { ...createMockRepo([de]), koreksiSaldo: vi.fn(async () => ({ ok: 1 })) };
});

describe('POST /api/items/5/koreksi', () => {
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
    expect(state.repo.koreksiSaldo).not.toHaveBeenCalled();
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
    expect(state.repo.koreksiSaldo).not.toHaveBeenCalled();
  });
  it('password salah -> 401 dan repository tidak dipanggil', async () => {
    expect((await call({ ...valid, password: 'salah' })).status).toBe(401);
    expect(state.repo.koreksiSaldo).not.toHaveBeenCalled();
  });
  it('nama atasan atau nomor BA kosong -> 400', async () => {
    expect((await call({ ...valid, namaAtasan: '' })).status).toBe(400);
    expect((await call({ ...valid, nomorBa: '  ' })).status).toBe(400);
    expect(state.repo.koreksiSaldo).not.toHaveBeenCalled();
  });
  it('namaAtasan dan nomorBa diteruskan ke repository', async () => {
    await call(valid);
    expect(state.repo.koreksiSaldo.mock.calls[0][1]).toMatchObject({ namaAtasan: 'Pak Budi', nomorBa: 'BA/11/001' });
  });
  it('alasan terlalu pendek -> 400', async () => {
    expect((await call({ ...valid, alasan: 'ab' })).status).toBe(400);
  });
  it('sukses: password tidak diteruskan ke repository', async () => {
    const res = await call(valid);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(JSON.stringify(state.repo.koreksiSaldo.mock.calls)).not.toContain('rahasia');
  });
  it('DomainError dari repository diteruskan', async () => {
    state.repo.koreksiSaldo = vi.fn(async () => { throw Object.assign(new Error('Bentrok'), { name: 'DomainError', status: 409 }); });
    const res = await call(valid);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Bentrok');
  });
  it('error tak dikenal -> 500 generik', async () => {
    state.repo.koreksiSaldo = vi.fn(async () => { throw new Error('rahasia internal'); });
    const res = await call(valid);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('internal');
  });
  it('saldo negatif -> 400', async () => {
    expect((await call({ ...valid, saldoBaru: -1 })).status).toBe(400);
  });
  it('saldo 0 diterima', async () => {
    expect((await call({ ...valid, saldoBaru: 0 })).status).toBe(200);
  });
  it('saldo bukan angka -> 400', async () => {
    expect((await call({ ...valid, saldoBaru: '5' })).status).toBe(400);
  });
});
