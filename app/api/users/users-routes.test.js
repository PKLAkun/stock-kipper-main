import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

const state = { repo: null, session: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.session }));

import { DomainError } from '@/lib/db/supabase';
import { GET, POST } from './route.js';
import { PUT, DELETE } from './[id]/route.js';
import { POST as SET_PIN } from './[id]/set-pin/route.js';
import { POST as RESET } from './[id]/reset-password/route.js';

const SA = { id: 1, name: 'Rina', role: 'superadmin', active: true };
const full = (o) => ({ id: 2, name: 'X', email: 'x@x.com', passwordHash: 'SECRET1', pinHash: 'SECRET2', role: 'staff', active: true, passwordVersion: 1, ...o });

function req(method, body) {
  return new Request('http://localhost:3000/api/users', {
    method, headers: { host: 'localhost:3000' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id) => ({ params: Promise.resolve({ id: String(id) }) });

function makeRepo(users) {
  const list = users.map((u) => ({ ...u }));
  return {
    list,
    listUsers: vi.fn(async () => list),
    findById: vi.fn(async (id) => list.find((u) => u.id === id) || null),
    findByEmail: vi.fn(async (e) => list.find((u) => u.email === e) || null),
    countByRole: vi.fn(async (role, o = {}) => list.filter((u) => u.role === role && (!o.activeOnly || u.active)).length),
    createUser: vi.fn(async (d) => full({ id: 50, ...d })),
    updateUser: vi.fn(async (id, d) => full({ id, ...d })),
    setPin: vi.fn(async () => ({})),
    resetPassword: vi.fn(async () => ({})),
    deleteUser: vi.fn(async () => true),
  };
}

beforeEach(() => {
  state.session = SA;
  state.repo = makeRepo([full({ id: 1, role: 'superadmin' }), full({ id: 2 }), full({ id: 3, role: 'operator', email: null })]);
});

describe('akses', () => {
  it('selain superadmin ditolak 403 di semua endpoint', async () => {
    state.session = { id: 7, name: 'DE', role: 'admin', active: true };
    expect((await GET()).status).toBe(403);
    expect((await POST(req('POST', {}))).status).toBe(403);
    expect((await PUT(req('PUT', { name: 'a', role: 'staff', active: true }), ctx(2))).status).toBe(403);
    expect((await DELETE(req('DELETE'), ctx(2))).status).toBe(403);
    expect((await SET_PIN(req('POST', { pin: '1234' }), ctx(3))).status).toBe(403);
    expect((await RESET(req('POST', { password: 'abcdefgh' }), ctx(2))).status).toBe(403);
  });

  it('origin asing ditolak 403', async () => {
    const r = new Request('http://localhost:3000/api/users', { method: 'POST', headers: { host: 'localhost:3000', origin: 'http://evil.com' }, body: '{}' });
    expect((await POST(r)).status).toBe(403);
  });
});

describe('GET /api/users', () => {
  it('tidak mengirim hash password maupun PIN', async () => {
    const res = await GET();
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('SECRET1');
    expect(text).not.toContain('SECRET2');
    expect(text).not.toMatch(/passwordHash|pinHash/);
  });
});

describe('POST /api/users', () => {
  it('operator: PIN di-hash ke pinHash, tanpa email dan password', async () => {
    const res = await POST(req('POST', { name: 'Budi', role: 'operator', pin: '1234', tujuanKode: 'INJ2' }));
    expect(res.status).toBe(201);
    const arg = state.repo.createUser.mock.calls[0][0];
    expect(arg.email).toBeUndefined();
    expect(arg.passwordHash).toBeUndefined();
    expect(bcrypt.compareSync('1234', arg.pinHash)).toBe(true);
    expect(JSON.stringify(await res.json())).not.toMatch(/pinHash|passwordHash/);
  });

  it('operator baru wajib keterangan (tujuanKode)', async () => {
    const res = await POST(req('POST', { name: 'Budi', role: 'operator', pin: '1234' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Keterangan/);
  });

  it('operator: inisial kapital, tim dan keterangan diteruskan ke repository', async () => {
    const res = await POST(req('POST', { name: 'Budi', role: 'operator', pin: '1234', inisial: 'bud', timKode: 'TARIK', tujuanKode: 'INJ2' }));
    expect(res.status).toBe(201);
    expect(state.repo.createUser.mock.calls[0][0]).toMatchObject({ inisial: 'BUD', timKode: 'TARIK', tujuanKode: 'INJ2' });
  });

  it('role non-operator: tim dan keterangan dibuang, inisial tetap', async () => {
    await POST(req('POST', { name: 'Baru', role: 'staff', email: 'b@x.com', password: 'abcdefgh', inisial: 'ab', timKode: 'TARIK', tujuanKode: 'INJ2' }));
    expect(state.repo.createUser.mock.calls[0][0]).toMatchObject({ inisial: 'AB', timKode: null, tujuanKode: null });
  });

  it('inisial tidak valid -> 400; inisial dobel dari repository -> 409 ramah', async () => {
    expect((await POST(req('POST', { name: 'B', role: 'staff', email: 'b@x.com', password: 'abcdefgh', inisial: 'A1' }))).status).toBe(400);
    expect((await POST(req('POST', { name: 'B', role: 'staff', email: 'b@x.com', password: 'abcdefgh', inisial: 'ABCDEFG' }))).status).toBe(400);
    state.repo.createUser.mockRejectedValueOnce(new DomainError('Inisial sudah dipakai pengguna lain.', 409));
    const res = await POST(req('POST', { name: 'B', role: 'staff', email: 'b@x.com', password: 'abcdefgh', inisial: 'AB' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Inisial sudah dipakai/);
  });

  it('operator tanpa PIN -> 400', async () => {
    expect((await POST(req('POST', { name: 'Budi', role: 'operator' }))).status).toBe(400);
  });

  it('role superadmin dengan email dan password diterima; email ganda 409', async () => {
    expect((await POST(req('POST', { name: 'Baru', role: 'superadmin', email: 'baru@x.com', password: 'abcdefgh' }))).status).toBe(201);
    expect((await POST(req('POST', { name: 'Dobel', role: 'staff', email: 'x@x.com', password: 'abcdefgh' }))).status).toBe(409);
  });
});

describe('PUT /api/users/[id]', () => {
  it('inisial, tim, keterangan diteruskan; tidak dikirim = undefined (nilai lama dipertahankan)', async () => {
    await PUT(req('PUT', { name: 'Op', role: 'operator', active: true, inisial: 'op', timKode: 'SUPLAI', tujuanKode: 'BIP' }), ctx(3));
    expect(state.repo.updateUser.mock.calls[0][1]).toMatchObject({ inisial: 'OP', timKode: 'SUPLAI', tujuanKode: 'BIP' });
    await PUT(req('PUT', { name: 'Op', role: 'operator', active: false }), ctx(3));
    const d = state.repo.updateUser.mock.calls[1][1];
    expect(d.inisial).toBeUndefined();
    expect(d.timKode).toBeUndefined();
  });

  it('menolak menurunkan atau menonaktifkan akun sendiri', async () => {
    expect((await PUT(req('PUT', { name: 'Rina', role: 'admin', active: true }), ctx(1))).status).toBe(400);
    expect((await PUT(req('PUT', { name: 'Rina', role: 'superadmin', active: false }), ctx(1))).status).toBe(400);
  });

  it('menolak menurunkan atau menonaktifkan superadmin aktif terakhir (409)', async () => {
    state.repo = makeRepo([full({ id: 1, role: 'superadmin' }), full({ id: 5, role: 'superadmin' })]);
    state.repo.list[0].active = false; // hanya id 5 yang aktif
    state.session = { id: 1, name: 'Rina', role: 'superadmin', active: true };
    expect((await PUT(req('PUT', { name: 'S', role: 'staff', active: true }), ctx(5))).status).toBe(409);
    expect((await PUT(req('PUT', { name: 'S', role: 'superadmin', active: false }), ctx(5))).status).toBe(409);
    expect(state.repo.updateUser).not.toHaveBeenCalled();
  });

  it('boleh menurunkan superadmin bila masih ada superadmin aktif lain', async () => {
    state.repo = makeRepo([full({ id: 1, role: 'superadmin' }), full({ id: 5, role: 'superadmin' })]);
    expect((await PUT(req('PUT', { name: 'S', role: 'admin', active: true }), ctx(5))).status).toBe(200);
  });

  it('operator tidak bisa diubah ke role lain, dan sebaliknya', async () => {
    expect((await PUT(req('PUT', { name: 'O', role: 'staff', active: true }), ctx(3))).status).toBe(400);
    expect((await PUT(req('PUT', { name: 'X', role: 'operator', active: true }), ctx(2))).status).toBe(400);
  });

  it('respons tidak membawa hash', async () => {
    const res = await PUT(req('PUT', { name: 'X2', role: 'admin', active: true }), ctx(2));
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toMatch(/SECRET|pinHash|passwordHash/);
  });
});

describe('DELETE /api/users/[id]', () => {
  it('menolak hapus diri sendiri (400) dan superadmin aktif terakhir (409)', async () => {
    expect((await DELETE(req('DELETE'), ctx(1))).status).toBe(400);
    state.repo = makeRepo([full({ id: 1, role: 'superadmin' }), full({ id: 5, role: 'superadmin' })]);
    state.repo.list[0].active = false;
    expect((await DELETE(req('DELETE'), ctx(5))).status).toBe(409);
  });

  it('menghapus user biasa', async () => {
    expect((await DELETE(req('DELETE'), ctx(2))).status).toBe(200);
    expect(state.repo.deleteUser).toHaveBeenCalledWith(2, expect.objectContaining({ id: 1 }));
  });
});

describe('POST /api/users/[id]/set-pin', () => {
  it('menyimpan bcrypt PIN lewat repo.setPin (pin_hash)', async () => {
    const res = await SET_PIN(req('POST', { pin: '4321' }), ctx(3));
    expect(res.status).toBe(200);
    const [id, hash] = state.repo.setPin.mock.calls[0];
    expect(id).toBe(3);
    expect(hash).not.toBe('4321');
    expect(bcrypt.compareSync('4321', hash)).toBe(true);
  });

  it('PIN tidak valid -> 400; bukan operator -> 400; tidak ada -> 404', async () => {
    expect((await SET_PIN(req('POST', { pin: '12' }), ctx(3))).status).toBe(400);
    expect((await SET_PIN(req('POST', { pin: 'abcd' }), ctx(3))).status).toBe(400);
    expect((await SET_PIN(req('POST', { pin: '1234' }), ctx(2))).status).toBe(400);
    expect((await SET_PIN(req('POST', { pin: '1234' }), ctx(99))).status).toBe(404);
    expect(state.repo.setPin).not.toHaveBeenCalled();
  });
});

describe('POST /api/users/[id]/reset-password', () => {
  it('operator ditolak (memakai PIN); user lain berhasil', async () => {
    expect((await RESET(req('POST', { password: 'abcdefgh' }), ctx(3))).status).toBe(400);
    expect((await RESET(req('POST', { password: 'abcdefgh' }), ctx(2))).status).toBe(200);
    expect(state.repo.resetPassword).toHaveBeenCalledTimes(1);
  });
});
