import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, req, user } from '../../../test/bkb-helpers.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { GET, POST } from './route.js';
import { GET as GET_ID, PUT } from './[id]/route.js';

const body = (o = {}) => ({ alasanJenis: 'opname', items: [{ itemId: 5, qtyFisik: 8 }], ...o });
const url = 'http://localhost:3000/api/opname';

beforeEach(() => {
  state.user = user('staff', 3);
  state.repo = {
    listOpname: vi.fn(async () => ({ items: [{ id: 1 }], total: 41 })),
    getOpname: vi.fn(async () => ({ id: 4, status: 'draf', items: [] })),
    simpanOpname: vi.fn(async () => ({ id: 4, status: 'draf' })),
  };
});

describe('GET /api/opname', () => {
  it('belum login 401, operator 403', async () => {
    state.user = null;
    expect((await GET(req('GET', undefined, url))).status).toBe(401);
    state.user = user('operator');
    expect((await GET(req('GET', undefined, url))).status).toBe(403);
    expect(state.repo.listOpname).not.toHaveBeenCalled();
  });
  it.each(['staff', 'admin', 'superadmin'])('%s boleh, filter dan paging diteruskan', async (r) => {
    state.user = user(r);
    const res = await GET(req('GET', undefined, `${url}?status=diajukan&page=2&limit=20`));
    expect(res.status).toBe(200);
    expect(state.repo.listOpname).toHaveBeenCalledWith({ status: 'diajukan', page: 2, limit: 20 });
    expect((await res.json()).meta).toEqual({ total: 41, page: 2, limit: 20, totalPages: 3 });
  });
  it('status tidak dikenal 400', async () => {
    expect((await GET(req('GET', undefined, `${url}?status=x`))).status).toBe(400);
  });
});

describe('POST /api/opname', () => {
  it('origin asing 403', async () => {
    const r = new Request(url, { method: 'POST', headers: { host: 'localhost:3000', origin: 'http://evil.com' }, body: JSON.stringify(body()) });
    expect((await POST(r)).status).toBe(403);
  });
  it.each(['operator', 'admin'])('%s 403', async (r) => {
    state.user = user(r);
    expect((await POST(req('POST', body(), url))).status).toBe(403);
    expect(state.repo.simpanOpname).not.toHaveBeenCalled();
  });
  it.each(['staff', 'superadmin'])('%s boleh -> 201, actor dari sesi', async (r) => {
    state.user = user(r, 8);
    const res = await POST(req('POST', body({ actor: { id: 1, role: 'superadmin' } }), url));
    expect(res.status).toBe(201);
    expect(state.repo.simpanOpname.mock.calls.at(-1)[1]).toMatchObject({ id: 8, role: r });
  });
  it('data tidak valid 400, body bukan JSON 400', async () => {
    expect((await POST(req('POST', body({ items: [] }), url))).status).toBe(400);
    const bad = new Request(url, { method: 'POST', headers: { host: 'localhost:3000' }, body: 'x{' });
    expect((await POST(bad)).status).toBe(400);
  });
  it('DomainError diteruskan, error asing 500 generik', async () => {
    state.repo.simpanOpname.mockRejectedValueOnce(Object.assign(new Error('Barang tidak ada'), { name: 'DomainError', status: 404 }));
    expect((await POST(req('POST', body(), url))).status).toBe(404);
    state.repo.simpanOpname.mockRejectedValueOnce(new Error('rahasia internal'));
    const res = await POST(req('POST', body(), url));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('rahasia');
  });
});

describe('/api/opname/[id]', () => {
  it('GET: operator 403, id buruk 404, tidak ada 404, ada 200', async () => {
    state.user = user('operator');
    expect((await GET_ID(req('GET', undefined, `${url}/4`), ctx(4))).status).toBe(403);
    state.user = user('admin');
    expect((await GET_ID(req('GET', undefined, `${url}/x`), ctx('x'))).status).toBe(404);
    state.repo.getOpname.mockResolvedValueOnce(null);
    expect((await GET_ID(req('GET', undefined, `${url}/9`), ctx(9))).status).toBe(404);
    expect((await GET_ID(req('GET', undefined, `${url}/4`), ctx(4))).status).toBe(200);
  });
  it('PUT: DE 403; SK meneruskan id dari path', async () => {
    state.user = user('admin');
    expect((await PUT(req('PUT', body(), `${url}/4`), ctx(4))).status).toBe(403);
    state.user = user('staff');
    const res = await PUT(req('PUT', body(), `${url}/4`), ctx(4));
    expect(res.status).toBe(200);
    expect(state.repo.simpanOpname.mock.calls[0][2]).toBe(4);
  });
  it('PUT: STATUS_TIDAK_SESUAI 409 diteruskan', async () => {
    state.repo.simpanOpname.mockRejectedValue(Object.assign(new Error('Berstatus disetujui'), { name: 'DomainError', status: 409 }));
    expect((await PUT(req('PUT', body(), `${url}/4`), ctx(4))).status).toBe(409);
  });
});
