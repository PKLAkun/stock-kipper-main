import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { createMockRepo, makeUser } from '../../test/mock-repo.js';

const state = { repo: null };
vi.mock('../db/index.js', () => ({ getRepository: () => state.repo }));
vi.mock('./session.js', () => ({ getSessionUser: vi.fn() }));

import { confirmPassword } from './confirm-password.js';

let userSeq = 100;
let user;

beforeEach(() => {
  userSeq += 1;
  user = makeUser({ id: userSeq, role: 'admin', passwordHash: bcrypt.hashSync('rahasia123', 4) });
  state.repo = createMockRepo([user]);
});

describe('confirmPassword', () => {
  it('ok bila password benar', async () => {
    expect(await confirmPassword(user, 'rahasia123')).toEqual({ ok: true });
  });

  it('401 "Password salah." bila salah', async () => {
    const r = await confirmPassword(user, 'salah');
    expect(r.error.status).toBe(401);
    expect((await r.error.json()).error).toBe('Password salah.');
  });

  it('401 bila password kosong', async () => {
    expect((await confirmPassword(user, '')).error.status).toBe(401);
  });

  it('429 setelah 5 kali salah, walau password berikutnya benar', async () => {
    for (let i = 0; i < 5; i++) await confirmPassword(user, 'salah');
    const r = await confirmPassword(user, 'rahasia123');
    expect(r.error.status).toBe(429);
    expect((await r.error.json()).error).toMatch(/^Terlalu banyak percobaan\. Coba lagi dalam \d+ detik\.$/);
  });

  it('limit per user: user lain tidak terkena', async () => {
    for (let i = 0; i < 5; i++) await confirmPassword(user, 'salah');
    const other = makeUser({ id: user.id + 1000, role: 'admin', passwordHash: user.passwordHash });
    state.repo = createMockRepo([user, other]);
    expect(await confirmPassword(other, 'rahasia123')).toEqual({ ok: true });
  });

  it('berhasil mereset hitungan gagal', async () => {
    for (let i = 0; i < 4; i++) await confirmPassword(user, 'salah');
    expect((await confirmPassword(user, 'rahasia123')).ok).toBe(true);
    for (let i = 0; i < 4; i++) await confirmPassword(user, 'salah');
    expect((await confirmPassword(user, 'rahasia123')).ok).toBe(true);
  });
});
