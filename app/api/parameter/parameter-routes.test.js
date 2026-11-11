import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { repo: null, session: null, password: true };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.session }));
vi.mock('@/lib/auth/confirm-password', () => ({
  confirmPassword: async () => (state.password
    ? { ok: true }
    : { error: new Response(JSON.stringify({ ok: false, error: 'Password salah.' }), { status: 401 }) }),
}));

import { GET, POST } from './[nama]/route.js';
import { PUT } from './[nama]/[kode]/route.js';
import { GET as GET_SET, PUT as PUT_SET } from '../pengaturan/route.js';
import { POST as POST_MESIN, GET as GET_MESIN } from '../machines/route.js';
import { PUT as PUT_MESIN } from '../machines/[id]/route.js';
import * as mesinId from '../machines/[id]/route.js';

const SA = { id: 1, name: 'Rina', role: 'superadmin' };
const DE = { id: 2, name: 'Andre', role: 'admin' };
const req = (method, body, url = 'http://localhost:3000/api/x') =>
  new Request(url, { method, headers: { host: 'localhost:3000' }, body: body === undefined ? undefined : JSON.stringify(body) });
const p = (o) => ({ params: Promise.resolve(o) });

beforeEach(() => {
  state.session = SA;
  state.password = true;
  state.repo = {
    listParameter: vi.fn(async () => []),
    createParameter: vi.fn(async (n, d) => d),
    updateParameter: vi.fn(async (n, k, d) => ({ kode: k, ...d })),
    listMachines: vi.fn(async () => []),
    searchMachines: vi.fn(async () => []),
    createMachine: vi.fn(async (d) => d),
    updateMachine: vi.fn(async (id, d) => (id === 99 ? null : d)),
    getPengaturan: vi.fn(async () => ({ wajibApproveDe: true })),
    setPengaturan: vi.fn(async (d) => d),
  };
});

describe('parameter', () => {
  it('GET untuk semua role login; aktif=1 diteruskan; nama asing 404; tanpa login 401', async () => {
    state.session = DE;
    expect((await GET(req('GET', undefined, 'http://localhost:3000/api/parameter/tujuan?aktif=1'), p({ nama: 'tujuan' }))).status).toBe(200);
    expect(state.repo.listParameter).toHaveBeenCalledWith('tujuan', { aktifSaja: true });
    expect((await GET(req('GET'), p({ nama: 'lain' }))).status).toBe(404);
    state.session = null;
    expect((await GET(req('GET'), p({ nama: 'tujuan' }))).status).toBe(401);
  });

  it('POST dan PUT hanya superadmin', async () => {
    state.session = DE;
    expect((await POST(req('POST', { kode: 'A', nama: 'Aa' }), p({ nama: 'dept-pemakai' }))).status).toBe(403);
    expect((await PUT(req('PUT', { nama: 'Bb' }), p({ nama: 'dept-pemakai', kode: 'A' }))).status).toBe(403);
  });

  it('POST valid 201 dan tidak valid 400; PUT tidak ada 404', async () => {
    expect((await POST(req('POST', { kode: 'a1', nama: 'Aa' }), p({ nama: 'dept-pemakai' }))).status).toBe(201);
    expect(state.repo.createParameter.mock.calls[0][1].kode).toBe('A1');
    expect((await POST(req('POST', { kode: '', nama: 'Aa' }), p({ nama: 'dept-pemakai' }))).status).toBe(400);
    state.repo.updateParameter.mockResolvedValueOnce(null);
    expect((await PUT(req('PUT', { nama: 'Bb' }), p({ nama: 'dept-pemakai', kode: 'Z' }))).status).toBe(404);
  });

  it('409 dari repository diteruskan dengan pesan domain', async () => {
    const { DomainError } = await import('@/lib/db/supabase');
    state.repo.updateParameter.mockRejectedValueOnce(new DomainError('Kode terkunci: sudah dipakai di BKB.', 409));
    const res = await PUT(req('PUT', { kode: 'B' }), p({ nama: 'tujuan', kode: 'A' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/terkunci/i);
  });
});

describe('mesin', () => {
  it('GET semua role; POST/PUT superadmin; tidak ada DELETE', async () => {
    state.session = DE;
    expect((await GET_MESIN(req('GET'))).status).toBe(200);
    expect((await POST_MESIN(req('POST', { code: 'a', name: 'Aa' }))).status).toBe(403);
    expect((await PUT_MESIN(req('PUT', { code: 'a', name: 'Aa' }), p({ id: '1' }))).status).toBe(403);
    expect(mesinId.DELETE).toBeUndefined();
    state.session = SA;
    expect((await POST_MESIN(req('POST', { code: 'inj-1', name: 'Inj 1' }))).status).toBe(201);
    expect((await PUT_MESIN(req('PUT', { code: 'A', name: 'Aa', active: false }), p({ id: '99' }))).status).toBe(404);
  });
});

describe('pengaturan', () => {
  it('GET semua role login', async () => {
    state.session = DE;
    expect((await GET_SET()).status).toBe(200);
  });

  it('PUT hanya superadmin dan wajib password benar', async () => {
    state.session = DE;
    expect((await PUT_SET(req('PUT', { wajibApproveDe: false, password: 'x' }))).status).toBe(403);
    state.session = SA;
    expect((await PUT_SET(req('PUT', { wajibApproveDe: false }))).status).toBe(400);
    state.password = false;
    expect((await PUT_SET(req('PUT', { wajibApproveDe: false, password: 'salah' }))).status).toBe(401);
    expect(state.repo.setPengaturan).not.toHaveBeenCalled();
    state.password = true;
    expect((await PUT_SET(req('PUT', { wajibApproveDe: false, password: 'benar', alasan: 'uji' }))).status).toBe(200);
    expect(state.repo.setPengaturan).toHaveBeenCalledWith({ wajibApproveDe: false, alasan: 'uji' }, { id: 1, name: 'Rina' });
  });
});
