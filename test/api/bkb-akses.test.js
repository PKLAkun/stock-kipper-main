// T-06: akses, kepemilikan data, dan urutan pengecekan route BKB.
// Ditulis dari docs/backend-api.md dan docs/keamanan.md, bukan dari isi route.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { bkbRepo, ctx, user, validBkb, UUID } from '../bkb-helpers.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { GET as listGET, POST as createPOST } from '@/app/api/bkb/route.js';
import { GET as detailGET, PUT as betulkanPUT } from '@/app/api/bkb/[id]/route.js';
import { POST as konfirmasiPOST } from '@/app/api/bkb/[id]/konfirmasi/route.js';
import { POST as yangSalahPOST } from '@/app/api/bkb/[id]/yang-salah/route.js';
import { POST as approvePOST } from '@/app/api/bkb/[id]/approve/route.js';
import { POST as kembalikanPOST } from '@/app/api/bkb/[id]/kembalikan/route.js';
import { POST as batalPOST } from '@/app/api/bkb/[id]/batal/route.js';

const PASSWORD = 'rahasia-dummy-1';
const hash = bcrypt.hashSync(PASSWORD, 4);
let seq = 1000; // id user unik supaya rate limit konfirmasi password tidak saling mengganggu
const V1 = '2026-11-05T03:00:00.000Z';
const V0 = '2026-11-05T02:00:00.000Z';
const ROLES = ['operator', 'staff', 'admin', 'superadmin'];

function request(method, body, { origin = 'http://localhost:3000', raw } = {}) {
  const headers = { host: 'localhost:3000' };
  if (origin) headers.origin = origin;
  return new Request('http://localhost:3000/api/bkb', {
    method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}

function login(role, id = ++seq) {
  state.user = user(role, id);
  state.repo.findById = vi.fn(async () => ({ id, role, passwordHash: hash }));
  return state.user;
}

// Repository dalam memori yang menghormati ownerId seperti kontrak GET /api/bkb.
function memoryRepo(rows) {
  return bkbRepo({
    listBkb: vi.fn(async ({ ownerId } = {}) => {
      const items = rows.filter((r) => ownerId === undefined || r.dibuatOlehId === ownerId);
      return { items, total: items.length };
    }),
    getBkb: vi.fn(async (id, { ownerId } = {}) => {
      const r = rows.find((x) => x.id === id);
      if (!r) return null;
      if (ownerId !== undefined && r.dibuatOlehId !== ownerId) return null;
      return r;
    }),
  });
}

const ROWS = [
  { id: 1, docNo: 'A', status: 'menunggu', dibuatOlehId: 10, versi: V1 },
  { id: 2, docNo: 'B', status: 'selesai', dibuatOlehId: 11, versi: V1 },
  { id: 3, docNo: 'C', status: 'menunggu', dibuatOlehId: 10, versi: V1 },
];

beforeEach(() => {
  state.repo = bkbRepo();
  state.user = null;
});

describe('kepemilikan data operator', () => {
  beforeEach(() => { state.repo = memoryRepo(ROWS); });

  it('list: operator hanya melihat BKB miliknya', async () => {
    login('operator', 10);
    const body = await (await listGET(request('GET'))).json();
    expect(body.data.map((r) => r.id)).toEqual([1, 3]);
    expect(body.meta.total).toBe(2);
  });

  it('list: query dimanipulasi (ownerId, status lain) tidak melonggarkan batas pemilik', async () => {
    login('operator', 10);
    const url = 'http://localhost:3000/api/bkb?ownerId=11&dibuatOlehId=11&status=selesai';
    const res = await listGET(new Request(url, { headers: { host: 'localhost:3000' } }));
    const calls = state.repo.listBkb.mock.calls[0][0];
    expect(calls.ownerId).toBe(10);
    expect((await res.json()).data.every((r) => r.dibuatOlehId === 10)).toBe(true);
  });

  it('detail: BKB milik operator lain -> 404 (bukan 403, supaya keberadaannya tersembunyi)', async () => {
    login('operator', 10);
    const res = await detailGET(request('GET'), ctx(2));
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain('"docNo"');
  });

  it('detail: BKB milik sendiri -> 200', async () => {
    login('operator', 10);
    expect((await detailGET(request('GET'), ctx(1))).status).toBe(200);
  });

  it.each(['staff', 'admin', 'superadmin'])('list dan detail: %s melihat semua BKB', async (role) => {
    login(role);
    expect((await (await listGET(request('GET'))).json()).data).toHaveLength(3);
    expect((await detailGET(request('GET'), ctx(2))).status).toBe(200);
  });

  it('belum login -> 401 untuk list dan detail', async () => {
    expect((await listGET(request('GET'))).status).toBe(401);
    expect((await detailGET(request('GET'), ctx(1))).status).toBe(401);
  });

  it('id bukan angka positif -> 404', async () => {
    login('staff');
    for (const id of ['abc', '0', '-1', '1.5']) {
      expect((await detailGET(request('GET'), ctx(id))).status).toBe(404);
    }
  });

  it('filter status tidak dikenal -> 400', async () => {
    login('staff');
    const res = await listGET(new Request('http://localhost:3000/api/bkb?status=hacked', { headers: { host: 'localhost:3000' } }));
    expect(res.status).toBe(400);
  });
});

// Matriks role per endpoint (docs/backend-api.md). Nilai: peran yang boleh.
const SK_ONLY = ['staff'];
const DE_SA = ['admin', 'superadmin'];
const MATRIX = [
  {
    nama: 'buat (POST /api/bkb)', allowed: ['operator', 'staff'],
    call: (role) => createPOST(request('POST', role === 'operator' ? validBkb() : validBkb({ pihakNama: 'Budi' }))),
    repoFn: 'createBkb',
  },
  {
    nama: 'betulkan (PUT /api/bkb/[id])', allowed: SK_ONLY,
    call: () => betulkanPUT(request('PUT', validBkb({ pihakNama: 'Budi' })), ctx(1)), repoFn: 'updateBkb',
  },
  {
    nama: 'konfirmasi', allowed: SK_ONLY,
    call: () => konfirmasiPOST(request('POST', { baris: [{ itemId: 5, saldoSk: 10 }] }), ctx(1)), repoFn: 'konfirmasiBkb',
  },
  {
    nama: 'yang-salah', allowed: SK_ONLY,
    call: () => yangSalahPOST(request('POST', { pilihan: 'bkb' }), ctx(1)), repoFn: 'yangSalahBkb',
  },
  {
    // route mengizinkan SK; SQL yang membatasi (menunggu_de + pengaturan nonaktif)
    nama: 'approve', allowed: ['staff', ...DE_SA],
    call: () => approvePOST(request('POST', {}), ctx(1)), repoFn: 'approveBkb',
  },
  {
    nama: 'kembalikan', allowed: DE_SA,
    call: () => kembalikanPOST(request('POST', { alasan: 'saldo salah' }), ctx(1)), repoFn: 'kembalikanBkb',
  },
  {
    nama: 'batal (BKB belum tersimpan)', allowed: ['staff', ...DE_SA],
    call: () => batalPOST(request('POST', { alasan: 'salah input' }), ctx(1)), repoFn: 'batalBkb',
    prep: () => state.repo.getBkb.mockResolvedValue({ id: 1, status: 'menunggu', versi: V1 }),
  },
];

describe.each(MATRIX)('matriks role: $nama', (ep) => {
  it.each(ROLES)('%s', async (role) => {
    login(role);
    ep.prep?.();
    const res = await ep.call(role);
    if (ep.allowed.includes(role)) {
      expect(res.status, `${role} seharusnya lolos`).toBeLessThan(300);
      expect(state.repo[ep.repoFn]).toHaveBeenCalledTimes(1);
    } else {
      expect(res.status, `${role} seharusnya ditolak`).toBe(403);
      expect(state.repo[ep.repoFn]).not.toHaveBeenCalled();
    }
  });

  it('belum login -> 401, repository tidak disentuh', async () => {
    const res = await ep.call('staff');
    expect(res.status).toBe(401);
    expect(state.repo[ep.repoFn]).not.toHaveBeenCalled();
  });
});

describe('batal BKB selesai: hanya DE/SA dengan password', () => {
  const selesai = () => state.repo.getBkb.mockResolvedValue({ id: 1, status: 'selesai', versi: V1 });
  const body = (over = {}) => ({ versi: V1, alasan: 'salah input barang', password: PASSWORD, ...over });
  const call = (b) => batalPOST(request('POST', b), ctx(1));

  it.each(DE_SA)('%s dengan password benar -> 200 dan batalBkb dipanggil', async (role) => {
    const u = login(role);
    selesai();
    const res = await call(body());
    expect(res.status).toBe(200);
    expect(state.repo.batalBkb).toHaveBeenCalledWith(1, 'salah input barang', u, V1);
  });

  it('SK tidak boleh membatalkan BKB selesai walau password benar -> 403', async () => {
    login('staff'); selesai();
    expect((await call(body())).status).toBe(403);
    expect(state.repo.batalBkb).not.toHaveBeenCalled();
  });

  it('tanpa password -> ditolak, stok tidak dibalik', async () => {
    login('admin'); selesai();
    const { password, ...tanpa } = body();
    const res = await call(tanpa);
    expect(res.status).toBe(400);
    expect(state.repo.batalBkb).not.toHaveBeenCalled();
  });

  it('password kosong -> ditolak', async () => {
    login('admin'); selesai();
    expect((await call(body({ password: '' }))).status).toBe(400);
    expect(state.repo.batalBkb).not.toHaveBeenCalled();
  });

  it('password salah -> 401 dan pesan tidak membocorkan hash', async () => {
    login('admin'); selesai();
    const res = await call(body({ password: 'salah-salah' }));
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain(hash);
    expect(state.repo.batalBkb).not.toHaveBeenCalled();
  });

  it('password salah berulang -> 429 (rate limit), bahkan sebelum password benar dicoba', async () => {
    login('admin'); selesai();
    for (let i = 0; i < 5; i++) await call(body({ password: 'salah-salah' }));
    expect((await call(body())).status).toBe(429);
    expect(state.repo.batalBkb).not.toHaveBeenCalled();
  });

  it('versi kedaluwarsa -> 409, batalBkb tidak dipanggil', async () => {
    login('admin'); selesai();
    expect((await call(body({ versi: V0 }))).status).toBe(409);
    expect(state.repo.batalBkb).not.toHaveBeenCalled();
  });

  it('tanpa versi -> 400', async () => {
    login('admin'); selesai();
    const { versi, ...tanpa } = body();
    expect((await call(tanpa)).status).toBe(400);
  });

  it('alasan kurang dari 5 karakter -> 400', async () => {
    login('admin'); selesai();
    expect((await call(body({ alasan: 'abc' }))).status).toBe(400);
  });

  it('hash password dari database, bukan dari objek sesi: user sesi membawa passwordHash palsu', async () => {
    login('admin');
    state.user.passwordHash = bcrypt.hashSync('lain', 4);
    selesai();
    expect((await call(body({ password: 'lain' }))).status).toBe(401);
    expect((await call(body())).status).toBe(200);
  });
});

describe('batal: urutan status', () => {
  const call = () => batalPOST(request('POST', { alasan: 'salah input' }), ctx(1));

  it.each(['menunggu', 'ditahan', 'menunggu_de'])('status %s: SK batal tanpa password -> 200', async (status) => {
    login('staff');
    state.repo.getBkb.mockResolvedValue({ id: 1, status });
    expect((await call()).status).toBe(200);
    expect(state.repo.findById).not.toHaveBeenCalled(); // password tidak diminta
  });

  it.each(['diganti', 'dibatalkan'])('status akhir %s -> 409', async (status) => {
    login('admin');
    state.repo.getBkb.mockResolvedValue({ id: 1, status });
    expect((await call()).status).toBe(409);
    expect(state.repo.batalBkb).not.toHaveBeenCalled();
  });

  it('BKB tidak ada -> 404', async () => {
    login('admin');
    expect((await call()).status).toBe(404);
  });

  it('alasan wajib juga untuk BKB belum tersimpan', async () => {
    login('staff');
    state.repo.getBkb.mockResolvedValue({ id: 1, status: 'menunggu' });
    expect((await batalPOST(request('POST', {}), ctx(1))).status).toBe(400);
  });

  it('error stok minus dari repository -> 409 dengan pesan domain', async () => {
    login('admin');
    state.repo.getBkb.mockResolvedValue({ id: 1, status: 'selesai', versi: V1 });
    state.repo.batalBkb.mockRejectedValue(Object.assign(new Error('Stok jadi minus'), { name: 'DomainError', status: 409 }));
    const res = await batalPOST(request('POST', { versi: V1, alasan: 'salah input', password: PASSWORD }), ctx(1));
    expect(res.status).toBe(409);
  });
});

describe('origin asing pada aksi yang mengubah data', () => {
  const EVIL = 'http://evil.example';
  const mutasi = [
    ['buat', () => createPOST(request('POST', validBkb(), { origin: EVIL })), 'createBkb'],
    ['betulkan', () => betulkanPUT(request('PUT', validBkb({ pihakNama: 'B' }), { origin: EVIL }), ctx(1)), 'updateBkb'],
    ['konfirmasi', () => konfirmasiPOST(request('POST', { baris: [{ itemId: 5, saldoSk: 1 }] }, { origin: EVIL }), ctx(1)), 'konfirmasiBkb'],
    ['yang-salah', () => yangSalahPOST(request('POST', { pilihan: 'bkb' }, { origin: EVIL }), ctx(1)), 'yangSalahBkb'],
    ['approve', () => approvePOST(request('POST', {}, { origin: EVIL }), ctx(1)), 'approveBkb'],
    ['kembalikan', () => kembalikanPOST(request('POST', { alasan: 'x' }, { origin: EVIL }), ctx(1)), 'kembalikanBkb'],
    ['batal', () => batalPOST(request('POST', { alasan: 'salah input' }, { origin: EVIL }), ctx(1)), 'batalBkb'],
  ];

  it.each(mutasi)('%s -> 403 untuk role yang sebenarnya berhak', async (_n, call, fn) => {
    // role yang sebenarnya berhak, supaya 403 pasti berasal dari Origin
    login(['approveBkb', 'kembalikanBkb', 'batalBkb'].includes(fn) ? 'admin' : 'staff');
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/asal/i);
    expect(state.repo[fn]).not.toHaveBeenCalled();
  });

  it('origin dicek sebelum login: tanpa sesi + origin asing -> 403, bukan 401', async () => {
    expect((await createPOST(request('POST', validBkb(), { origin: EVIL }))).status).toBe(403);
  });

  it('origin beda port -> 403', async () => {
    login('staff');
    const res = await konfirmasiPOST(request('POST', { baris: [{ itemId: 5, saldoSk: 1 }] }, { origin: 'http://localhost:4000' }), ctx(1));
    expect(res.status).toBe(403);
  });

  it('origin sama -> lolos; tanpa header Origin (non-browser) -> lolos', async () => {
    login('staff');
    expect((await konfirmasiPOST(request('POST', { baris: [{ itemId: 5, saldoSk: 1 }] }), ctx(1))).status).toBe(200);
    expect((await konfirmasiPOST(request('POST', { baris: [{ itemId: 5, saldoSk: 1 }] }, { origin: null }), ctx(1))).status).toBe(200);
  });
});

describe('Zod menolak input buruk', () => {
  const post = (b, role = 'staff') => { login(role); return createPOST(request('POST', b)); };
  const sk = (extra = {}) => validBkb({ pihakNama: 'Budi', ...extra });

  it('JSON rusak -> 400', async () => {
    login('staff');
    expect((await createPOST(request('POST', undefined, { raw: '{bukan json' }))).status).toBe(400);
    expect(state.repo.createBkb).not.toHaveBeenCalled();
  });

  it.each([
    ['tanpa idempotencyKey', () => { const b = sk(); delete b.idempotencyKey; return b; }],
    ['idempotencyKey bukan UUID', () => sk({ idempotencyKey: 'abc' })],
    ['kategori tidak dikenal', () => sk({ bkbKategori: 'Z' })],
    ['tanggal tidak ada di kalender', () => sk({ bkbDate: '2026-02-31' })],
    ['format tanggal salah', () => sk({ bkbDate: '05-11-2026' })],
    ['items kosong', () => sk({ items: [] })],
    ['qty nol', () => sk({ items: [{ itemId: 5, qty: 0 }] })],
    ['qty negatif', () => sk({ items: [{ itemId: 5, qty: -1 }] })],
    ['qty 4 desimal', () => sk({ items: [{ itemId: 5, qty: 1.2345 }] })],
    ['qty bukan angka', () => sk({ items: [{ itemId: 5, qty: 'banyak' }] })],
    ['barang dobel', () => sk({ items: [{ itemId: 5, qty: 1 }, { itemId: 5, qty: 2 }] })],
    ['itemId negatif', () => sk({ items: [{ itemId: -5, qty: 1 }] })],
    ['nomorUrut 0', () => sk({ nomorUrut: 0 })],
    ['inisial kosong', () => sk({ inisial: '' })],
    ['tujuanKode kosong', () => sk({ tujuanKode: '' })],
    ['reference di luar 1-3', () => sk({ reference: '9' })],
    ['lebih dari 50 baris', () => sk({ items: Array.from({ length: 51 }, (_, i) => ({ itemId: i + 1, qty: 1 })) })],
  ])('POST: %s -> 400 dan repository tidak dipanggil', async (_n, make) => {
    const res = await post(make());
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
    expect(state.repo.createBkb).not.toHaveBeenCalled();
  });

  it('operator mengisi pihakNama, pihakDept, atau menggantiBkbId -> 400', async () => {
    for (const extra of [{ pihakNama: 'X' }, { pihakDept: 'Y' }, { menggantiBkbId: 3 }]) {
      expect((await post(validBkb(extra), 'operator')).status).toBe(400);
    }
    expect(state.repo.createBkb).not.toHaveBeenCalled();
  });

  it('SK tanpa pihakNama (bukan pengganti) -> 400; dengan menggantiBkbId tanpa pihakNama -> 201', async () => {
    expect((await post(validBkb())).status).toBe(400);
    expect((await post(validBkb({ menggantiBkbId: 3 }))).status).toBe(201);
  });

  it('operator tidak bisa memalsukan sumber lewat body; server menentukan sumber', async () => {
    await post({ ...validBkb(), sumber: 'non_operator' }, 'operator');
    expect(state.repo.createBkb.mock.calls[0][0].sumber).toBe('operator');
  });

  it('PUT: menggantiBkbId ditolak, input buruk ditolak', async () => {
    login('staff');
    expect((await betulkanPUT(request('PUT', sk({ menggantiBkbId: 2 })), ctx(1))).status).toBe(400);
    expect((await betulkanPUT(request('PUT', sk({ items: [] })), ctx(1))).status).toBe(400);
    expect(state.repo.updateBkb).not.toHaveBeenCalled();
  });

  it.each([
    ['baris kosong', { baris: [] }],
    ['saldo negatif', { baris: [{ itemId: 5, saldoSk: -1 }] }],
    ['saldo bukan angka', { baris: [{ itemId: 5, saldoSk: 'abc' }] }],
    ['saldo string kosong', { baris: [{ itemId: 5, saldoSk: '' }] }],
    ['barang dobel', { baris: [{ itemId: 5, saldoSk: 1 }, { itemId: 5, saldoSk: 2 }] }],
    ['tanpa baris', {}],
  ])('konfirmasi: %s -> 400', async (_n, b) => {
    login('staff');
    expect((await konfirmasiPOST(request('POST', b), ctx(1))).status).toBe(400);
    expect(state.repo.konfirmasiBkb).not.toHaveBeenCalled();
  });

  it('yang-salah: pilihan di luar bkb/saldo -> 400', async () => {
    login('staff');
    expect((await yangSalahPOST(request('POST', { pilihan: 'lain' }), ctx(1))).status).toBe(400);
    expect((await yangSalahPOST(request('POST', {}), ctx(1))).status).toBe(400);
  });

  it('kembalikan: alasan kosong atau spasi -> 400', async () => {
    login('admin');
    expect((await kembalikanPOST(request('POST', { alasan: '   ' }), ctx(1))).status).toBe(400);
    expect((await kembalikanPOST(request('POST', {}), ctx(1))).status).toBe(400);
    expect(state.repo.kembalikanBkb).not.toHaveBeenCalled();
  });

  it('id path bukan angka pada aksi -> 404 tanpa menyentuh repository', async () => {
    login('admin');
    expect((await approvePOST(request('POST', {}), ctx('abc'))).status).toBe(404);
    expect(state.repo.approveBkb).not.toHaveBeenCalled();
  });
});

describe('urutan status dan error domain diteruskan', () => {
  const domain = (msg, status) => Object.assign(new Error(msg), { name: 'DomainError', status });

  it.each([
    ['konfirmasi saat selesai', () => konfirmasiPOST(request('POST', { baris: [{ itemId: 5, saldoSk: 1 }] }), ctx(1)), 'konfirmasiBkb', 'staff'],
    ['approve saat menunggu (lompat langkah)', () => approvePOST(request('POST', {}), ctx(1)), 'approveBkb', 'admin'],
    ['kembalikan saat menunggu', () => kembalikanPOST(request('POST', { alasan: 'x' }), ctx(1)), 'kembalikanBkb', 'admin'],
    ['yang-salah saat menunggu', () => yangSalahPOST(request('POST', { pilihan: 'bkb' }), ctx(1)), 'yangSalahBkb', 'staff'],
    ['betulkan saat selesai', () => betulkanPUT(request('PUT', validBkb({ pihakNama: 'B' })), ctx(1)), 'updateBkb', 'staff'],
  ])('%s -> 409 dari repository sampai ke client', async (_n, call, fn, role) => {
    login(role);
    state.repo[fn].mockRejectedValue(domain('Status BKB tidak sesuai.', 409));
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Status BKB tidak sesuai.');
  });

  it('error non-domain (mis. pesan SQL) tidak bocor ke browser -> 500 generik', async () => {
    login('admin');
    state.repo.approveBkb.mockRejectedValue(new Error('relation "bkb" does not exist at supabase.co host=db.xyz'));
    const res = await approvePOST(request('POST', {}), ctx(1));
    expect(res.status).toBe(500);
    const txt = JSON.stringify(await res.json());
    expect(txt).not.toMatch(/relation|supabase|host=/);
  });

  it('approve: respons hanya memuat status dan baris ringkas', async () => {
    login('admin');
    state.repo.approveBkb.mockResolvedValue({
      status: 'selesai', secret: 'x', items: [{ itemId: 5, nomorUrut: 3, saldoSetelah: 7, saldoSk: 99, passwordHash: 'h' }],
    });
    const body = await (await approvePOST(request('POST', {}), ctx(1))).json();
    expect(body.data).toEqual({ status: 'selesai', baris: [{ itemId: 5, nomorUrut: 3, saldoSetelah: 7 }] });
  });
});

describe('saldo sistem tersembunyi saat SK mengetik', () => {
  it('konfirmasi semua cocok -> saldoSistem dan selisih tidak dikirim', async () => {
    login('staff');
    state.repo.konfirmasiBkb.mockResolvedValue({
      status: 'menunggu_de', items: [{ itemId: 5, saldoSk: 10, cocok: true, saldoSistemKonfirmasi: 10 }],
    });
    const b = await (await konfirmasiPOST(request('POST', { baris: [{ itemId: 5, saldoSk: 10 }] }), ctx(1))).json();
    expect(b.data.baris[0]).not.toHaveProperty('saldoSistem');
    expect(b.data.baris[0]).not.toHaveProperty('selisih');
  });

  it('ada yang tidak cocok -> saldoSistem dan selisih dikirim', async () => {
    login('staff');
    state.repo.konfirmasiBkb.mockResolvedValue({
      status: 'ditahan', items: [{ itemId: 5, saldoSk: 8, cocok: false, saldoSistemKonfirmasi: 10 }],
    });
    const b = await (await konfirmasiPOST(request('POST', { baris: [{ itemId: 5, saldoSk: 8 }] }), ctx(1))).json();
    expect(b.data.baris[0]).toMatchObject({ saldoSistem: 10, selisih: -2, cocok: false });
  });
});

describe('idempotency key', () => {
  it('diteruskan ke repository apa adanya, bersama sumber dan user dari sesi', async () => {
    const u = login('operator');
    const res = await createPOST(request('POST', validBkb()));
    expect(res.status).toBe(201);
    const [input, actor] = state.repo.createBkb.mock.calls[0];
    expect(input.idempotencyKey).toBe(UUID);
    expect(input.sumber).toBe('operator');
    expect(actor).toBe(u);
  });

  it('kirim ulang dengan key sama: kedua panggilan membawa key yang sama dan hasilnya BKB yang sama', async () => {
    login('operator');
    const hasil = { id: 9, docNo: 'PB410-26K00001', status: 'menunggu' };
    state.repo.createBkb.mockResolvedValue(hasil);
    const a = await (await createPOST(request('POST', validBkb()))).json();
    const b = await (await createPOST(request('POST', validBkb()))).json();
    expect(a.data).toEqual(b.data);
    const keys = state.repo.createBkb.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys).toEqual([UUID, UUID]);
  });

  it('jenis dan nomor dokumen dari client diabaikan: tidak sampai ke repository sebagai nilai tepercaya', async () => {
    login('operator');
    await createPOST(request('POST', { ...validBkb(), docNo: 'PALSU-1', jenis: 'XX', status: 'selesai' }));
    const input = state.repo.createBkb.mock.calls[0][0];
    expect(input).not.toHaveProperty('docNo');
    expect(input).not.toHaveProperty('jenis');
    expect(input).not.toHaveProperty('status');
  });
});
