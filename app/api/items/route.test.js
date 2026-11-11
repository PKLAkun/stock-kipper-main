import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeUser } from '@/test/mock-repo.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { GET, POST } from './route.js';
import { PUT } from './[id]/route.js';

const body = { categoryCode: '1', itemCode: 'PP-1', name: 'PP', unit: 'kg', quantity: 20, stokMinimum: 5 };
const post = (b) => POST(new Request('http://localhost:3000/api/items', { method: 'POST', headers: { host: 'localhost:3000' }, body: JSON.stringify(b) }));
const put = (b) => PUT(new Request('http://localhost:3000/api/items/3', { method: 'PUT', headers: { host: 'localhost:3000' }, body: JSON.stringify(b) }), { params: Promise.resolve({ id: '3' }) });

beforeEach(() => {
  state.user = makeUser({ role: 'admin' });
  state.repo = {
    createItem: vi.fn(async (d) => ({ id: 1, ...d })),
    updateItem: vi.fn(async (id, d) => ({ id, ...d })),
    listItems: vi.fn(async () => ({ items: [], total: 0 })),
  };
});

describe('/api/items', () => {
  it('POST: staff 403, DE 201 dengan saldo awal dan stok minimum', async () => {
    state.user = makeUser({ role: 'staff' });
    expect((await post(body)).status).toBe(403);
    state.user = makeUser({ role: 'superadmin' });
    expect((await post(body)).status).toBe(201);
    expect(state.repo.createItem.mock.calls[0][0]).toMatchObject({ quantity: 20, stokMinimum: 5 });
  });
  it('POST: stok minimum negatif -> 400', async () => {
    expect((await post({ ...body, stokMinimum: -2 })).status).toBe(400);
  });
  it('PUT: quantity tidak diteruskan ke repository', async () => {
    const res = await put({ ...body, quantity: 9999 });
    expect(res.status).toBe(200);
    expect('quantity' in state.repo.updateItem.mock.calls[0][1]).toBe(false);
  });
  it('PUT: staff 403', async () => {
    state.user = makeUser({ role: 'staff' });
    expect((await put(body)).status).toBe(403);
  });
  it('GET: filter statusStok diteruskan; nilai salah -> 400', async () => {
    const ok = await GET(new Request('http://localhost:3000/api/items?statusStok=bawah_minimum&sortBy=kekurangan'));
    expect(ok.status).toBe(200);
    expect(state.repo.listItems.mock.calls[0][0]).toMatchObject({ statusStok: 'bawah_minimum', sortBy: 'kekurangan' });
    expect((await GET(new Request('http://localhost:3000/api/items?statusStok=zzz'))).status).toBe(400);
  });
});
