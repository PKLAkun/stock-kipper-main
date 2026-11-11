import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { createMockRepo, makeUser } from '@/test/mock-repo.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { POST as ajukan } from './ajukan/route.js';
import { POST as batal } from './batal/route.js';
import { POST as setujui } from './setujui/route.js';
import { POST as tolak } from './tolak/route.js';

const ctx = (id = '4') => ({ params: Promise.resolve({ id }) });
const PW = 'rahasia';
const call = (fn, body, { origin, id } = {}) => {
  const headers = { host: 'localhost:3000' };
  if (origin) headers.origin = origin;
  return fn(new Request('http://localhost:3000/api/opname/4/x', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }), ctx(id));
};
const login = (role, id = 20 + Math.floor(Math.random() * 1e6)) => {
  const u = makeUser({ id, role, name: `U-${role}`, passwordHash: bcrypt.hashSync(PW, 4) });
  state.user = u;
  state.repo = {
    ...createMockRepo([u]),
    ajukanOpname: vi.fn(async () => ({ id: 4, status: 'diajukan' })),
    batalOpname: vi.fn(async () => ({ id: 4, status: 'dibatalkan' })),
    approveOpname: vi.fn(async () => ({ id: 4, status: 'disetujui' })),
    tolakOpname: vi.fn(async () => ({ id: 4, status: 'ditolak' })),
  };
  return u;
};
const ok = { namaAtasan: 'Pak Budi', nomorBa: 'BA/11/001', password: PW };
const domain = (message, status) => Object.assign(new Error(message), { name: 'DomainError', status });

beforeEach(() => login('staff'));

describe.each([['ajukan', ajukan, 'ajukanOpname', {}], ['batal', batal, 'batalOpname', { alasan: 'salah buat' }]])('%s (SK, Superadmin)', (_n, fn, repoFn, body) => {
  it.each(['operator', 'admin'])('%s 403', async (r) => {
    login(r);
    expect((await call(fn, body)).status).toBe(403);
    expect(state.repo[repoFn]).not.toHaveBeenCalled();
  });
  it.each(['staff', 'superadmin'])('%s 200', async (r) => {
    const u = login(r);
    expect((await call(fn, body)).status).toBe(200);
    expect(state.repo[repoFn].mock.calls[0][0]).toBe(4);
    expect(state.repo[repoFn].mock.calls[0].at(-1).id).toBe(u.id);
  });
  it('origin asing 403, belum login 401, id buruk 404', async () => {
    expect((await call(fn, body, { origin: 'http://evil.com' })).status).toBe(403);
    expect((await call(fn, body, { id: 'abc' })).status).toBe(404);
    state.user = null;
    expect((await call(fn, body)).status).toBe(401);
  });
  it('STATUS_TIDAK_SESUAI 409 dan ANALISA_WAJIB 400 diteruskan', async () => {
    state.repo[repoFn].mockRejectedValueOnce(domain('Berstatus disetujui', 409));
    expect((await call(fn, body)).status).toBe(409);
    state.repo[repoFn].mockRejectedValueOnce(domain('Analisa minimal 10 karakter', 400));
    expect((await call(fn, body)).status).toBe(400);
  });
});

describe('batal: alasan wajib', () => {
  it('kosong atau pendek 400', async () => {
    expect((await call(batal, {})).status).toBe(400);
    expect((await call(batal, { alasan: 'ab' })).status).toBe(400);
    expect(state.repo.batalOpname).not.toHaveBeenCalled();
  });
});

describe('tolak (DE, Superadmin)', () => {
  it.each(['operator', 'staff'])('%s 403', async (r) => {
    login(r);
    expect((await call(tolak, { catatan: 'hitung ulang' })).status).toBe(403);
    expect(state.repo.tolakOpname).not.toHaveBeenCalled();
  });
  it.each(['admin', 'superadmin'])('%s 200', async (r) => {
    login(r);
    expect((await call(tolak, { catatan: 'hitung ulang rak B' })).status).toBe(200);
    expect(state.repo.tolakOpname.mock.calls[0].slice(0, 2)).toEqual([4, 'hitung ulang rak B']);
  });
  it('catatan wajib 400', async () => {
    login('admin');
    expect((await call(tolak, { catatan: '' })).status).toBe(400);
    expect((await call(tolak, {})).status).toBe(400);
  });
});

describe('setujui (DE, Superadmin, wajib password)', () => {
  it.each(['operator', 'staff'])('%s 403 sebelum password dicek', async (r) => {
    login(r);
    expect((await call(setujui, ok)).status).toBe(403);
    expect(state.repo.findById).not.toHaveBeenCalled();
    expect(state.repo.approveOpname).not.toHaveBeenCalled();
  });
  it.each(['admin', 'superadmin'])('%s sukses, password tidak diteruskan', async (r) => {
    login(r);
    const res = await call(setujui, ok);
    expect(res.status).toBe(200);
    const [id, input] = state.repo.approveOpname.mock.calls[0];
    expect(id).toBe(4);
    expect(input).toEqual({ namaAtasan: 'Pak Budi', nomorBa: 'BA/11/001' });
    expect(JSON.stringify(state.repo.approveOpname.mock.calls)).not.toContain(PW);
  });
  it('password salah 401, repository tidak dipanggil', async () => {
    login('admin');
    expect((await call(setujui, { ...ok, password: 'salah' })).status).toBe(401);
    expect(state.repo.approveOpname).not.toHaveBeenCalled();
  });
  it('password kosong, nama atasan atau nomor BA kosong -> 400', async () => {
    login('admin');
    expect((await call(setujui, { ...ok, password: '' })).status).toBe(400);
    expect((await call(setujui, { ...ok, namaAtasan: '' })).status).toBe(400);
    expect((await call(setujui, { ...ok, nomorBa: ' ' })).status).toBe(400);
    expect(state.repo.approveOpname).not.toHaveBeenCalled();
  });
  it('origin asing 403, belum login 401', async () => {
    login('admin');
    expect((await call(setujui, ok, { origin: 'http://evil.com' })).status).toBe(403);
    state.user = null;
    expect((await call(setujui, ok)).status).toBe(401);
  });
  it('TIDAK_BOLEH_SENDIRI 403 dan STOK_MINUS 409 diteruskan dengan pesan ramah', async () => {
    login('admin');
    state.repo.approveOpname.mockRejectedValueOnce(domain('Cek Stok buatan sendiri tidak boleh disetujui sendiri', 403));
    expect((await call(setujui, ok)).status).toBe(403);
    state.repo.approveOpname.mockRejectedValueOnce(domain('Stok tidak cukup untuk PP-1 (Biji PP). Saldo 3, diminta 5.', 409));
    const res = await call(setujui, ok);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('Stok tidak cukup');
  });
  it('error tak dikenal 500 generik', async () => {
    login('admin');
    state.repo.approveOpname.mockRejectedValueOnce(new Error('rahasia internal'));
    const res = await call(setujui, ok);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('rahasia');
  });
});
