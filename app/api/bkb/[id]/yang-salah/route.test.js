import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bkbRepo, ctx, req, user } from '../../../../../test/bkb-helpers.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { POST } from './route.js';

beforeEach(() => { state.repo = bkbRepo(); state.user = user('staff'); });

describe('POST /api/bkb/[id]/yang-salah', () => {
  it('hanya SK', async () => {
    state.user = user('operator');
    expect((await POST(req('POST', { pilihan: 'bkb' }), ctx(1))).status).toBe(403);
  });

  it('pilihan saldo mengembalikan ditahanKarena', async () => {
    state.repo.yangSalahBkb.mockResolvedValue({ status: 'ditahan', ditahanKarena: 'menunggu_koreksi' });
    const res = await POST(req('POST', { pilihan: 'saldo', catatan: 'cek ulang' }), ctx(1));
    expect((await res.json()).data).toEqual({ status: 'ditahan', ditahanKarena: 'menunggu_koreksi' });
  });

  it('400 untuk pilihan tidak valid', async () => {
    expect((await POST(req('POST', { pilihan: 'lain' }), ctx(1))).status).toBe(400);
  });

  it('409 bila status bukan ditahan', async () => {
    state.repo.yangSalahBkb.mockRejectedValue(Object.assign(new Error('Status BKB tidak sesuai'), { name: 'DomainError', status: 409 }));
    expect((await POST(req('POST', { pilihan: 'bkb' }), ctx(1))).status).toBe(409);
  });
});
