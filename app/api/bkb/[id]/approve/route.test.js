import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bkbRepo, ctx, req, user } from '../../../../../test/bkb-helpers.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { POST } from './route.js';

beforeEach(() => { state.repo = bkbRepo(); state.user = user('admin'); });

describe('POST /api/bkb/[id]/approve', () => {
  it('operator 403', async () => {
    state.user = user('operator');
    expect((await POST(req('POST', {}), ctx(1))).status).toBe(403);
    expect(state.repo.approveBkb).not.toHaveBeenCalled();
  });

  it('DE dan superadmin lolos, SK diteruskan ke SQL', async () => {
    state.repo.approveBkb.mockResolvedValue({ status: 'selesai', items: [{ itemId: 5, nomorUrut: 4, saldoSetelah: 8, qty: 2 }] });
    for (const r of ['admin', 'superadmin', 'staff']) {
      state.user = user(r);
      const res = await POST(req('POST', {}), ctx(1));
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual({ status: 'selesai', baris: [{ itemId: 5, nomorUrut: 4, saldoSetelah: 8 }] });
    }
  });

  it('409 stok kurang diteruskan', async () => {
    state.repo.approveBkb.mockRejectedValue(Object.assign(new Error('Stok tidak cukup'), { name: 'DomainError', status: 409 }));
    expect((await POST(req('POST', {}), ctx(1))).status).toBe(409);
  });
});
