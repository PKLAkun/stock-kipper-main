import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { signSessionToken } from '@/lib/auth/jwt';
import middleware from './middleware.js';

async function run(role, path, method = 'GET') {
  const headers = {};
  if (role) {
    const token = await signSessionToken({ sub: 1, role, pv: 1 }, 8);
    headers.cookie = `session=${token}`;
  }
  const res = await middleware(new NextRequest(`http://localhost:3000${path}`, { method, headers }));
  const loc = res.headers.get('location');
  return { status: res.status, location: loc ? new URL(loc).pathname : null };
}

const pass = (r) => r.status === 200 && !r.location;
const redirectTo = (r, to) => r.status === 307 && r.location === to;

describe('tanpa login', () => {
  it('halaman diarahkan ke /login', async () => {
    expect(redirectTo(await run(null, '/'), '/login')).toBe(true);
  });
  it('API -> 401', async () => {
    expect((await run(null, '/api/bkb')).status).toBe(401);
  });
  it('/login dan /api/operator-login publik', async () => {
    expect(pass(await run(null, '/login'))).toBe(true);
    expect(pass(await run(null, '/api/operator-login', 'POST'))).toBe(true);
  });
});

describe('halaman khusus superadmin', () => {
  for (const path of ['/user', '/parameter', '/pengaturan']) {
    it(`${path}: superadmin lolos`, async () => {
      expect(pass(await run('superadmin', path))).toBe(true);
    });
    for (const role of ['admin', 'staff']) {
      it(`${path}: ${role} dialihkan ke /`, async () => {
        expect(redirectTo(await run(role, path), '/')).toBe(true);
      });
    }
    it(`${path}: operator dialihkan ke /buat-bkb`, async () => {
      expect(redirectTo(await run('operator', path), '/buat-bkb')).toBe(true);
    });
  }
  it('awalan teks mirip tidak ikut terkunci', async () => {
    expect(pass(await run('admin', '/userguide'))).toBe(true);
  });
});

describe('API khusus superadmin', () => {
  const cases = [
    ['/api/users', 'GET'], ['/api/users/3', 'PUT'],
    ['/api/parameter', 'POST'], ['/api/parameter', 'PUT'],
    ['/api/pengaturan', 'PUT'],
    ['/api/machines', 'POST'], ['/api/machines/2', 'PUT'], ['/api/machines/2', 'DELETE'],
  ];
  for (const [path, method] of cases) {
    it(`${method} ${path}: superadmin lolos, admin 403`, async () => {
      expect(pass(await run('superadmin', path, method))).toBe(true);
      expect((await run('admin', path, method)).status).toBe(403);
      expect((await run('staff', path, method)).status).toBe(403);
    });
  }
  it('GET dibuka untuk admin dan staff', async () => {
    for (const p of ['/api/machines', '/api/parameter', '/api/pengaturan']) {
      expect(pass(await run('admin', p))).toBe(true);
      expect(pass(await run('staff', p))).toBe(true);
    }
  });
});

describe('admin dan staff', () => {
  it('bebas membuka halaman operasional', async () => {
    for (const role of ['admin', 'staff']) {
      expect(pass(await run(role, '/'))).toBe(true);
      expect(pass(await run(role, '/api/bkb'))).toBe(true);
    }
  });
  it('/login dialihkan ke /', async () => {
    expect(redirectTo(await run('admin', '/login'), '/')).toBe(true);
  });
});

describe('operator', () => {
  it('/ dialihkan ke /buat-bkb', async () => {
    expect(redirectTo(await run('operator', '/'), '/buat-bkb')).toBe(true);
  });
  it('/login dialihkan ke /buat-bkb', async () => {
    expect(redirectTo(await run('operator', '/login'), '/buat-bkb')).toBe(true);
  });
  it('halaman yang diizinkan', async () => {
    for (const p of ['/buat-bkb', '/ruang-tunggu', '/bkb/12']) {
      expect(pass(await run('operator', p))).toBe(true);
    }
  });
  it('API yang diizinkan', async () => {
    for (const [p, m] of [
      ['/api/bkb', 'POST'], ['/api/bkb/12', 'GET'], ['/api/bkb/next-seq', 'GET'],
      ['/api/items/search', 'GET'], ['/api/machines', 'GET'], ['/api/parameter', 'GET'],
      ['/api/pengaturan', 'GET'], ['/api/me', 'GET'], ['/api/logout', 'POST'],
    ]) {
      expect(pass(await run('operator', p, m)), `${m} ${p}`).toBe(true);
    }
  });
  it('halaman lain dialihkan ke /buat-bkb', async () => {
    for (const p of ['/stok', '/laporan', '/laporan/cetak', '/cek-stok', '/cek-stok/1', '/user', '/bkbx']) {
      expect(redirectTo(await run('operator', p), '/buat-bkb'), p).toBe(true);
    }
  });
  it('API lain 403', async () => {
    for (const [p, m] of [
      ['/api/items', 'GET'], ['/api/users', 'GET'], ['/api/machines', 'POST'],
      ['/api/parameter', 'PUT'], ['/api/pengaturan', 'PUT'], ['/api/requests', 'GET'],
      // [Tahap 2, 11-11-2026, T-27] Cek Stok, Laporan, dan Koreksi saldo tertutup untuk operator
      ['/api/opname', 'GET'], ['/api/opname', 'POST'], ['/api/opname/1/setujui', 'POST'],
      ['/api/laporan/mutasi', 'GET'], ['/api/laporan/rekap', 'GET'], ['/api/items/1/koreksi', 'POST'],
    ]) {
      expect((await run('operator', p, m)).status, `${m} ${p}`).toBe(403);
    }
  });
});

describe('sesi idle', () => {
  it('token lama (iat > idle) -> sesi berakhir', async () => {
    const { SignJWT } = await import('jose');
    const old = Math.floor(Date.now() / 1000) - 60 * 60;
    const token = await new SignJWT({ role: 'admin', pv: 1 })
      .setProtectedHeader({ alg: 'HS256' }).setSubject('1').setIssuedAt(old)
      .setExpirationTime('8h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    const res = await middleware(new NextRequest('http://localhost:3000/api/bkb', { headers: { cookie: `session=${token}` } }));
    expect(res.status).toBe(401);
  });
});

describe('klaim shift (T-21)', () => {
  const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET);

  it('perpanjangan iat membawa shift dan shiftHabis, exp tetap', async () => {
    const { SignJWT, jwtVerify } = await import('jose');
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600;
    const token = await new SignJWT({ role: 'operator', pv: 1, shift: '2', shiftHabis: exp })
      .setProtectedHeader({ alg: 'HS256' }).setSubject('1').setIssuedAt(now - 10 * 60)
      .setExpirationTime(exp).sign(secret());
    const res = await middleware(new NextRequest('http://localhost:3000/buat-bkb', { headers: { cookie: `session=${token}` } }));
    const baru = res.cookies.get('session')?.value;
    expect(baru).toBeTruthy();
    const { payload } = await jwtVerify(baru, secret());
    expect(payload).toMatchObject({ role: 'operator', shift: '2', shiftHabis: exp, exp });
  });

  it('token operator yang shift-nya sudah habis (exp lewat) -> dianggap tidak login', async () => {
    const { SignJWT } = await import('jose');
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ role: 'operator', pv: 1, shift: '1', shiftHabis: now - 5 })
      .setProtectedHeader({ alg: 'HS256' }).setSubject('1').setIssuedAt(now - 600)
      .setExpirationTime(now - 5).sign(secret());
    const res = await middleware(new NextRequest('http://localhost:3000/api/bkb', { headers: { cookie: `session=${token}` } }));
    expect(res.status).toBe(401);
  });
});
