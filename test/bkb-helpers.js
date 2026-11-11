// Helper tes route BKB: request palsu dan repository BKB palsu.
import { vi } from 'vitest';

export const UUID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

export function req(method, body, url = 'http://localhost:3000/api/bkb') {
  return new Request(url, {
    method,
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const ctx = (id) => ({ params: Promise.resolve({ id: String(id) }) });

export const user = (role, id = 1) => ({ id, name: `U-${role}`, role });

export function bkbRepo(overrides = {}) {
  return {
    listBkb: vi.fn(async () => ({ items: [], total: 0 })),
    getBkb: vi.fn(async () => null),
    createBkb: vi.fn(async () => ({ id: 9, docNo: 'PB410-26K00001', status: 'menunggu' })),
    getPengaturan: vi.fn(async () => ({ wajibApproveDe: true, peranBuatBkb: ['operator', 'staff'], peranBuatPengganti: ['staff'] })),
    updateBkb: vi.fn(async () => ({ id: 9, status: 'menunggu' })),
    konfirmasiBkb: vi.fn(async () => ({ status: 'menunggu_de', items: [] })),
    approveBkb: vi.fn(async () => ({ status: 'selesai', items: [] })),
    batalBkb: vi.fn(async () => ({ status: 'dibatalkan' })),
    kembalikanBkb: vi.fn(async () => ({ status: 'ditahan', ditahanKarena: 'dikembalikan_de' })),
    yangSalahBkb: vi.fn(async () => ({ status: 'ditahan', ditahanKarena: 'dibetulkan_sk' })),
    ...overrides,
  };
}

export const validBkb = (extra = {}) => ({
  idempotencyKey: UUID,
  bkbKategori: '1',
  bkbDate: '2026-11-05',
  reference: '1',
  tujuanKode: 'BIP',
  inisial: 'and',
  nomorUrut: 1,
  machine: '',
  items: [{ itemId: 5, qty: 2.5 }],
  ...extra,
});
