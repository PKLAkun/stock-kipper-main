import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bkbRepo, ctx, req, user } from '../../../../../test/bkb-helpers.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { POST } from './route.js';

const body = { baris: [{ itemId: 5, saldoSk: '10.5' }, { itemId: 6, saldoSk: 3 }] };
beforeEach(() => { state.repo = bkbRepo(); state.user = user('staff'); });

describe('POST /api/bkb/[id]/konfirmasi', () => {
  it('hanya SK', async () => {
    state.user = user('admin');
    expect((await POST(req('POST', body), ctx(1))).status).toBe(403);
  });

  it('semua cocok: saldo sistem tidak dikirim', async () => {
    state.repo.konfirmasiBkb.mockResolvedValue({
      status: 'menunggu_de',
      items: [{ itemId: 5, saldoSk: 10.5, saldoSistemKonfirmasi: 10.5, cocok: true }],
    });
    const data = (await (await POST(req('POST', body), ctx(1))).json()).data;
    expect(data.status).toBe('menunggu_de');
    expect(data.baris[0]).toEqual({ itemId: 5, saldoSk: 10.5, cocok: true });
    expect(state.repo.konfirmasiBkb.mock.calls[0][1].baris[0].saldoSk).toBe(10.5);
  });

  it('ada tidak cocok: saldo sistem dan selisih dikirim', async () => {
    state.repo.konfirmasiBkb.mockResolvedValue({
      status: 'ditahan',
      items: [
        { itemId: 5, saldoSk: 10, saldoSistemKonfirmasi: 12, cocok: false },
        { itemId: 6, saldoSk: 3, saldoSistemKonfirmasi: 3, cocok: true },
      ],
    });
    const data = (await (await POST(req('POST', body), ctx(1))).json()).data;
    expect(data.status).toBe('ditahan');
    expect(data.baris[0]).toMatchObject({ saldoSistem: 12, selisih: -2, cocok: false });
  });

  it('400 untuk baris kosong, saldo minus, saldo bukan angka, item dobel', async () => {
    for (const baris of [[], [{ itemId: 5, saldoSk: -1 }], [{ itemId: 5, saldoSk: 'abc' }], [{ itemId: 5, saldoSk: '' }],
      [{ itemId: 5, saldoSk: 1 }, { itemId: 5, saldoSk: 2 }]]) {
      expect((await POST(req('POST', { baris }), ctx(1))).status, JSON.stringify(baris)).toBe(400);
    }
    expect(state.repo.konfirmasiBkb).not.toHaveBeenCalled();
  });

  it('saldo 0 diterima', async () => {
    expect((await POST(req('POST', { baris: [{ itemId: 5, saldoSk: 0 }] }), ctx(1))).status).toBe(200);
  });
});
