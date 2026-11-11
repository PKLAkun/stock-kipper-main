import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { createMockRepo, makeUser } from '../../../test/mock-repo.js';

const state = { repo: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
const createSession = vi.fn();
vi.mock('@/lib/auth/session', () => ({ createSession: (u) => createSession(u) }));

import { POST } from './route.js';

let ipSeq = 0;
function post(body, ip) {
  return new Request('http://localhost:3000/api/operator-login', {
    method: 'POST',
    headers: { host: 'localhost:3000', 'x-forwarded-for': ip || `10.0.0.${++ipSeq}` },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  createSession.mockClear();
  state.repo = createMockRepo([
    makeUser({ id: 1, role: 'operator', pinHash: bcrypt.hashSync('1234', 4) }),
    makeUser({ id: 2, role: 'operator', active: false, pinHash: bcrypt.hashSync('1234', 4) }),
    makeUser({ id: 3, role: 'operator', pinHash: null }),
    makeUser({ id: 4, role: 'admin', pinHash: bcrypt.hashSync('1234', 4) }),
  ]);
});

describe('POST /api/operator-login', () => {
  it('login berhasil dengan PIN benar dan membuat sesi', async () => {
    const res = await POST(post({ operatorId: 1, pin: '1234' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe(1);
    expect(body.user.passwordHash).toBeUndefined();
    expect(body.user.pinHash).toBeUndefined();
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('PIN salah -> 401', async () => {
    const res = await POST(post({ operatorId: 1, pin: '9999' }));
    expect(res.status).toBe(401);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('operator nonaktif -> 401', async () => {
    expect((await POST(post({ operatorId: 2, pin: '1234' }))).status).toBe(401);
  });

  it('bukan operator -> 401', async () => {
    expect((await POST(post({ operatorId: 4, pin: '1234' }))).status).toBe(401);
  });

  it('user tidak ada -> 401', async () => {
    expect((await POST(post({ operatorId: 99, pin: '1234' }))).status).toBe(401);
  });

  it('PIN belum diatur -> 401', async () => {
    expect((await POST(post({ operatorId: 3, pin: '1234' }))).status).toBe(401);
  });

  it('data tidak lengkap -> 400', async () => {
    expect((await POST(post({ operatorId: 1 }))).status).toBe(400);
  });

  it('Origin asing -> 403', async () => {
    const req = new Request('http://localhost:3000/api/operator-login', {
      method: 'POST',
      headers: { host: 'localhost:3000', origin: 'http://evil.com' },
      body: JSON.stringify({ operatorId: 1, pin: '1234' }),
    });
    expect((await POST(req)).status).toBe(403);
  });

  it('429 setelah 5 PIN salah dari IP yang sama', async () => {
    for (let i = 0; i < 5; i++) await POST(post({ operatorId: 1, pin: '0000' }, '10.9.9.9'));
    expect((await POST(post({ operatorId: 1, pin: '1234' }, '10.9.9.9'))).status).toBe(429);
  });

  it('429 untuk akun yang sama walau IP berganti (tebakan PIN tersebar)', async () => {
    state.repo = createMockRepo([makeUser({ id: 7, role: 'operator', pinHash: bcrypt.hashSync('1234', 4) })]);
    for (let i = 0; i < 5; i++) await POST(post({ operatorId: 7, pin: '0000' }));
    expect((await POST(post({ operatorId: 7, pin: '1234' }))).status).toBe(429);
  });
});
