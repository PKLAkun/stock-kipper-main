import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bkbRepo, ctx, req, user } from '../../../../../test/bkb-helpers.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { POST } from './route.js';

beforeEach(() => { state.repo = bkbRepo(); state.user = user('admin'); });

describe('POST /api/bkb/[id]/kembalikan', () => {
  it('SK 403', async () => {
    state.user = user('staff');
    expect((await POST(req('POST', { alasan: 'salah' }), ctx(1))).status).toBe(403);
  });

  it('400 tanpa alasan', async () => {
    expect((await POST(req('POST', { alasan: '  ' }), ctx(1))).status).toBe(400);
  });

  it('sukses', async () => {
    const res = await POST(req('POST', { alasan: 'QTY salah' }), ctx(1));
    expect((await res.json()).data).toEqual({ status: 'ditahan', ditahanKarena: 'dikembalikan_de' });
    expect(state.repo.kembalikanBkb.mock.calls[0].slice(0, 2)).toEqual([1, 'QTY salah']);
  });
});
