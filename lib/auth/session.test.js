// Tes getSessionUser dari spesifikasi: S18-6, SEC-13, F08 (docs/pengujian.md).
// Token asli ditandatangani lewat jose; hanya cookie dan repository yang dipalsukan.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT } from 'jose';
import { createMockRepo, makeUser } from '../../test/mock-repo.js';
import { signSessionToken } from './jwt.js';

const state = { repo: null, cookie: undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name) => (name === 'session' && state.cookie !== undefined ? { value: state.cookie } : undefined),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));
vi.mock('../db/index.js', () => ({ getRepository: () => state.repo }));

import { getSessionUser } from './session.js';

const tokenFor = (u, over = {}) =>
  signSessionToken({ sub: u.id, role: u.role, pv: u.passwordVersion, ...over }, 8);

beforeEach(() => {
  state.cookie = undefined;
  state.repo = createMockRepo([]);
});

function setUsers(...users) {
  state.repo = createMockRepo(users);
}

describe('getSessionUser', () => {
  it('token valid + user aktif + versi sama -> user dari database', async () => {
    const u = makeUser({ id: 5, role: 'staff', passwordVersion: 3 });
    setUsers(u);
    state.cookie = await tokenFor(u);
    const got = await getSessionUser();
    expect(got.id).toBe(5);
    expect(state.repo.findById).toHaveBeenCalledWith(5);
  });

  it('user diberi sesiShift dan sesiBerakhir (ISO) dari token, tanpa hash', async () => {
    const u = makeUser({ id: 5, role: 'operator', passwordVersion: 1 });
    setUsers(u);
    const habis = Math.floor(Date.now() / 1000) + 1200;
    state.cookie = await tokenFor(u, { shift: '2', shiftHabis: habis });
    const got = await getSessionUser();
    expect(got.sesiShift).toBe('2');
    expect(got.sesiBerakhir).toBe(new Date(habis * 1000).toISOString());
  });

  it('token lama tanpa klaim shift -> sesiShift null', async () => {
    const u = makeUser({ id: 5, role: 'staff', passwordVersion: 1 });
    setUsers(u);
    state.cookie = await tokenFor(u);
    expect((await getSessionUser()).sesiShift).toBeNull();
  });

  it('tanpa cookie -> null, database tidak disentuh', async () => {
    expect(await getSessionUser()).toBeNull();
    expect(state.repo.findById).not.toHaveBeenCalled();
  });

  it('user nonaktif -> null walau token masih valid', async () => {
    const u = makeUser({ id: 5, role: 'staff', active: false });
    setUsers(u);
    state.cookie = await tokenFor(u);
    expect(await getSessionUser()).toBeNull();
  });

  it('user dinonaktifkan setelah token terbit -> null pada request berikutnya', async () => {
    const u = makeUser({ id: 5, role: 'admin' });
    setUsers(u);
    state.cookie = await tokenFor(u);
    expect(await getSessionUser()).not.toBeNull();
    u.active = false;
    expect(await getSessionUser()).toBeNull();
  });

  it('password_version di database lebih baru (password direset/role diubah) -> null', async () => {
    const u = makeUser({ id: 5, role: 'staff', passwordVersion: 1 });
    setUsers(makeUser({ ...u, passwordVersion: 2 }));
    state.cookie = await tokenFor(u);
    expect(await getSessionUser()).toBeNull();
  });

  it('password_version di token lebih besar dari database -> null', async () => {
    const u = makeUser({ id: 5, role: 'staff', passwordVersion: 1 });
    setUsers(u);
    state.cookie = await tokenFor(u, { pv: 9 });
    expect(await getSessionUser()).toBeNull();
  });

  it('token tanpa klaim pv -> null', async () => {
    const u = makeUser({ id: 5, role: 'staff' });
    setUsers(u);
    state.cookie = await tokenFor(u, { pv: undefined });
    expect(await getSessionUser()).toBeNull();
  });

  it('role diambil dari database, bukan dari token (token mengaku superadmin)', async () => {
    const u = makeUser({ id: 5, role: 'operator', passwordVersion: 1 });
    setUsers(u);
    state.cookie = await tokenFor(u, { role: 'superadmin' });
    const got = await getSessionUser();
    expect(got.role).toBe('operator');
  });

  it('role diturunkan di database -> request berikutnya memakai role baru', async () => {
    const u = makeUser({ id: 5, role: 'admin' });
    setUsers(u);
    state.cookie = await tokenFor(u);
    u.role = 'staff';
    expect((await getSessionUser()).role).toBe('staff');
  });

  it('user sudah dihapus dari database -> null', async () => {
    const u = makeUser({ id: 5 });
    setUsers();
    state.cookie = await tokenFor(u);
    expect(await getSessionUser()).toBeNull();
  });

  it('sub dimanipulasi ke user lain: yang dikembalikan hanya bila pv cocok', async () => {
    const a = makeUser({ id: 1, role: 'operator', passwordVersion: 1 });
    const b = makeUser({ id: 2, role: 'admin', passwordVersion: 7 });
    setUsers(a, b);
    state.cookie = await tokenFor(a, { sub: 2 });
    expect(await getSessionUser()).toBeNull();
  });

  describe('token rusak (SEC-13)', () => {
    const u = makeUser({ id: 5, role: 'staff' });
    beforeEach(() => setUsers(u));

    it.each(['sampah', 'a.b.c', ''])('string %j -> null', async (t) => {
      state.cookie = t;
      expect(await getSessionUser()).toBeNull();
      expect(state.repo.findById).not.toHaveBeenCalled();
    });

    it('ditandatangani kunci lain -> null', async () => {
      state.cookie = await new SignJWT({ role: 'superadmin', pv: 1 })
        .setProtectedHeader({ alg: 'HS256' }).setSubject('5').setIssuedAt().setExpirationTime('8h')
        .sign(new TextEncoder().encode('kunci-lain-kunci-lain-kunci-lain-1234'));
      expect(await getSessionUser()).toBeNull();
      expect(state.repo.findById).not.toHaveBeenCalled();
    });

    it('kedaluwarsa -> null', async () => {
      const key = new TextEncoder().encode(process.env.AUTH_SECRET);
      state.cookie = await new SignJWT({ role: 'staff', pv: 1 })
        .setProtectedHeader({ alg: 'HS256' }).setSubject('5')
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
        .sign(key);
      expect(await getSessionUser()).toBeNull();
    });

    it('payload diubah tanpa tanda tangan ulang -> null', async () => {
      const t = await tokenFor(u);
      const [h, , s] = t.split('.');
      const payload = Buffer.from(JSON.stringify({ sub: '5', role: 'superadmin', pv: 1, exp: 9999999999 })).toString('base64url');
      state.cookie = `${h}.${payload}.${s}`;
      expect(await getSessionUser()).toBeNull();
    });

    it('alg none -> null', async () => {
      const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
      state.cookie = `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ sub: '5', role: 'superadmin', pv: 1, exp: 9999999999 })}.`;
      expect(await getSessionUser()).toBeNull();
    });
  });
});
