import { describe, it, expect, vi } from 'vitest';

vi.mock('./session.js', () => ({ getSessionUser: vi.fn() }));

import { requireRole, checkSameOrigin, publicUser } from './guards.js';

describe('requireRole', () => {
  it('meloloskan role yang diizinkan', () => {
    expect(requireRole({ role: 'staff' }, ['admin', 'staff'])).toEqual({ ok: true });
  });

  it('menolak role lain dengan 403', async () => {
    const r = requireRole({ role: 'operator' }, ['admin']);
    expect(r.error.status).toBe(403);
    expect((await r.error.json()).ok).toBe(false);
  });

  it('superadmin lolos bila admin diizinkan', () => {
    expect(requireRole({ role: 'superadmin' }, ['admin']).ok).toBe(true);
    expect(requireRole({ role: 'superadmin' }, ['admin', 'staff']).ok).toBe(true);
  });

  it('superadmin ditolak bila admin tidak diizinkan', () => {
    expect(requireRole({ role: 'superadmin' }, ['staff']).error.status).toBe(403);
  });

  it('admin tidak otomatis lolos untuk superadmin saja', () => {
    expect(requireRole({ role: 'admin' }, ['superadmin']).error.status).toBe(403);
  });

  it('selalu mengembalikan objek (tidak pernah undefined)', () => {
    expect(requireRole({ role: 'admin' }, ['admin'])).toBeTypeOf('object');
  });
});

function req(headers, url = 'http://localhost:3000/api/x') {
  return { headers: new Headers(headers), url };
}

describe('checkSameOrigin', () => {
  it('lolos tanpa header Origin', () => {
    expect(checkSameOrigin(req({})).ok).toBe(true);
  });
  it('lolos bila host dan port sama', () => {
    expect(checkSameOrigin(req({ origin: 'http://10.0.0.5:3000', host: '10.0.0.5:3000' })).ok).toBe(true);
  });
  it('menolak host berbeda', async () => {
    const r = checkSameOrigin(req({ origin: 'http://evil.com', host: 'localhost:3000' }));
    expect(r.ok).toBe(false);
    expect(r.error.status).toBe(403);
  });
  it('menolak port berbeda', () => {
    expect(checkSameOrigin(req({ origin: 'http://localhost:4000', host: 'localhost:3000' })).ok).toBe(false);
  });
  it('menolak Origin yang tidak bisa di-parse', () => {
    expect(checkSameOrigin(req({ origin: 'bukan-url', host: 'localhost' })).ok).toBe(false);
  });
});

describe('publicUser', () => {
  it('membuang passwordHash dan pinHash', () => {
    const u = publicUser({ id: 1, name: 'A', passwordHash: 'x', pinHash: 'y' });
    expect(u).toEqual({ id: 1, name: 'A' });
  });
  it('membawa sesiShift dan sesiBerakhir', () => {
    const u = publicUser({ id: 1, passwordHash: 'x', sesiShift: '2', sesiBerakhir: '2026-11-11T09:00:00.000Z' });
    expect(u).toEqual({ id: 1, sesiShift: '2', sesiBerakhir: '2026-11-11T09:00:00.000Z' });
  });
});
