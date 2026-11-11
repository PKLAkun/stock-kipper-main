// T-07: ganti BKB, ubah data BKB, koreksi saldo, dampak, kartu stok, audit.
// Ditulis dari docs/backend-api.md dan docs/keamanan.md. Repository koreksi yang asli
// dipasang di atas client Supabase palsu, supaya terjemahan error RPC `KODE|pesan` ikut teruji.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { user } from '../bkb-helpers.js';
import { createKoreksiRepository } from '@/lib/db/koreksi.js';

const state = { repo: null, user: null };
vi.mock('@/lib/db', () => ({ getRepository: () => state.repo }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => state.user }));

import { POST as gantiPOST } from '@/app/api/bkb/[id]/ganti/route.js';
import { PATCH as dataPATCH } from '@/app/api/bkb/[id]/data/route.js';
import { GET as dampakGET } from '@/app/api/bkb/[id]/dampak/route.js';
import { POST as koreksiPOST } from '@/app/api/items/[id]/koreksi/route.js';
import { GET as kartuGET } from '@/app/api/items/[id]/kartu/route.js';
import { GET as auditGET } from '@/app/api/audit/route.js';

const PASSWORD = 'rahasia-dummy-2';
const hash = bcrypt.hashSync(PASSWORD, 4);
let seq = 5000;
const ROLES = ['operator', 'staff', 'admin', 'superadmin'];
const DE_SA = ['admin', 'superadmin'];
const ctx = (id = '5') => ({ params: Promise.resolve({ id: String(id) }) });

function request(method, body, { origin = 'http://localhost:3000', url = 'http://localhost:3000/api/x', raw } = {}) {
  const headers = { host: 'localhost:3000' };
  if (origin) headers.origin = origin;
  return new Request(url, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
}

// Client Supabase palsu: hanya yang dipakai createKoreksiRepository untuk ganti/dampak/koreksi/ubah data.
function fakeClient({ bkbRows = {}, rpc = async () => ({ data: {}, error: null }) } = {}) {
  const rpcSpy = vi.fn(rpc);
  return {
    rpc: rpcSpy,
    from(table) {
      const q = { id: null };
      const chain = {
        select: () => chain,
        eq: (_c, v) => { q.id = Number(v); return chain; },
        order: () => chain,
        maybeSingle: async () => ({ data: table === 'bkb' ? bkbRows[q.id] || null : null, error: null }),
        then: (res) => res({ data: [], error: null }),
      };
      return chain;
    },
  };
}

function pakaiRepo(client) {
  state.repo = { ...createKoreksiRepository(client), findById: null };
  return client;
}

function login(role, id = ++seq) {
  state.user = user(role, id);
  state.repo.findById = vi.fn(async () => ({ id, role, passwordHash: hash }));
  return state.user;
}

const gantiBody = (o = {}) => ({ versi: V1, penggantiId: 6, alasan: 'salah input barang', password: PASSWORD, ...o });
const dataBody = (o = {}) => ({ machine: 'M1', alasan: 'salah mesin', password: PASSWORD, ...o });
const koreksiBody = (o = {}) => ({ saldoBaru: 12, alasan: 'hasil stock opname', namaAtasan: 'Pak Budi', nomorBa: 'BA/11/001', password: PASSWORD, ...o });

const V1 = '2026-11-05T03:00:00.000Z';
const BKB_SELESAI = { 5: { id: 5, status: 'selesai', updated_at: V1, disimpan_at: new Date().toISOString(), mengganti_bkb_id: null, param_jenis: { arah: 'out' } } };

beforeEach(() => {
  pakaiRepo(fakeClient({ bkbRows: BKB_SELESAI }));
  state.user = null;
});

const AKSI = [
  { nama: 'ganti', call: (o) => gantiPOST(request('POST', gantiBody(), o), ctx(5)), rpc: 'ganti_bkb' },
  { nama: 'ubah data', call: (o) => dataPATCH(request('PATCH', dataBody(), o), ctx(5)), rpc: 'ubah_data_bkb' },
  { nama: 'koreksi saldo', call: (o) => koreksiPOST(request('POST', koreksiBody(), o), ctx(5)), rpc: 'koreksi_saldo' },
];

describe.each(AKSI)('$nama: hanya DE/SA', (a) => {
  it.each(ROLES)('%s', async (role) => {
    login(role);
    const res = await a.call();
    if (DE_SA.includes(role)) {
      expect(res.status).toBe(200);
    } else {
      expect(res.status).toBe(403);
    }
  });

  it('operator dan SK ditolak sebelum password dicek dan tanpa memanggil RPC', async () => {
    const client = pakaiRepo(fakeClient({ bkbRows: BKB_SELESAI }));
    for (const role of ['operator', 'staff']) {
      login(role);
      expect((await a.call()).status).toBe(403);
      expect(state.repo.findById).not.toHaveBeenCalled();
    }
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('belum login -> 401', async () => {
    expect((await a.call()).status).toBe(401);
  });

  it('origin asing -> 403 walau DE login dan password benar', async () => {
    const client = pakaiRepo(fakeClient({ bkbRows: BKB_SELESAI }));
    login('admin');
    const res = await a.call({ origin: 'http://evil.example' });
    expect(res.status).toBe(403);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('origin asing tanpa login -> 403 (origin dicek dulu)', async () => {
    expect((await a.call({ origin: 'http://evil.example' })).status).toBe(403);
  });
});

describe('password wajib untuk ganti, ubah data, koreksi saldo', () => {
  const cases = [
    ['ganti', (b) => gantiPOST(request('POST', b), ctx(5)), gantiBody],
    ['ubah data', (b) => dataPATCH(request('PATCH', b), ctx(5)), dataBody],
    ['koreksi saldo', (b) => koreksiPOST(request('POST', b), ctx(5)), koreksiBody],
  ];

  describe.each(cases)('%s', (_n, call, make) => {
    let client;
    beforeEach(() => { client = pakaiRepo(fakeClient({ bkbRows: BKB_SELESAI })); login('admin'); });

    it('tanpa field password -> 400', async () => {
      const { password, ...tanpa } = make();
      expect((await call(tanpa)).status).toBe(400);
      expect(client.rpc).not.toHaveBeenCalled();
    });

    it('password kosong -> 400', async () => {
      expect((await call(make({ password: '' }))).status).toBe(400);
      expect(client.rpc).not.toHaveBeenCalled();
    });

    it('password bukan string -> 400', async () => {
      expect((await call(make({ password: 12345 }))).status).toBe(400);
    });

    it('password salah -> 401 dan RPC tidak dipanggil', async () => {
      const res = await call(make({ password: 'salah-salah' }));
      expect(res.status).toBe(401);
      expect(client.rpc).not.toHaveBeenCalled();
    });

    it('password milik user lain (SA) tidak berlaku untuk DE', async () => {
      state.repo.findById = vi.fn(async (id) => ({ id, passwordHash: bcrypt.hashSync('punya-orang-lain', 4) }));
      expect((await call(make())).status).toBe(401);
      expect(client.rpc).not.toHaveBeenCalled();
    });

    it('alasan kurang dari 5 karakter -> 400', async () => {
      expect((await call(make({ alasan: 'abc' }))).status).toBe(400);
      expect(client.rpc).not.toHaveBeenCalled();
    });

    it('tanpa alasan -> 400', async () => {
      const { alasan, ...tanpa } = make();
      expect((await call(tanpa)).status).toBe(400);
    });

    it('5 kali salah -> 429, termasuk untuk password yang benar', async () => {
      for (let i = 0; i < 5; i++) await call(make({ password: 'salah-salah' }));
      expect((await call(make())).status).toBe(429);
      expect(client.rpc).not.toHaveBeenCalled();
    });

    it('password tidak ikut diteruskan ke repository / RPC', async () => {
      expect((await call(make())).status).toBe(200);
      expect(JSON.stringify(client.rpc.mock.calls)).not.toContain(PASSWORD);
    });
  });
});

describe('koreksi saldo: validasi', () => {
  beforeEach(() => login('admin'));
  const call = (b) => koreksiPOST(request('POST', b), ctx(5));

  it.each([
    ['saldo negatif', { saldoBaru: -1 }],
    ['saldo string', { saldoBaru: '12' }],
    ['saldo null', { saldoBaru: null }],
    ['bkbId negatif', { bkbId: -3 }],
  ])('%s -> 400', async (_n, o) => {
    expect((await call(koreksiBody(o))).status).toBe(400);
  });

  it('nama atasan dan nomor BA kosong -> 400, RPC tidak dipanggil', async () => {
    const client = pakaiRepo(fakeClient());
    login('admin');
    expect((await call(koreksiBody({ namaAtasan: '', nomorBa: '' }))).status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('saldo 0 sah (stok boleh kosong, tidak boleh minus)', async () => {
    expect((await call(koreksiBody({ saldoBaru: 0 }))).status).toBe(200);
  });

  it('id barang bukan angka -> 400', async () => {
    expect((await koreksiPOST(request('POST', koreksiBody()), ctx('abc'))).status).toBe(400);
  });

  it('RPC menerima actor dari sesi, bukan dari body', async () => {
    const client = pakaiRepo(fakeClient());
    const u = login('admin');
    await call(koreksiBody({ actor: { id: 1, role: 'superadmin' }, p_actor: { id: 1 } }));
    expect(client.rpc.mock.calls[0][1].p_actor).toEqual({ id: u.id, name: u.name, role: 'admin' });
  });
});

describe('ubah data BKB: hanya kolom non-stok', () => {
  beforeEach(() => login('admin'));
  const call = (b) => dataPATCH(request('PATCH', b), ctx(5));

  it.each([
    ['qty', { items: [{ itemId: 5, qty: 99 }] }],
    ['qty tingkat atas', { qty: 99 }],
    ['jenis', { jenis: 'PB' }],
    ['tujuan', { tujuanKode: 'BIP' }],
    ['status', { status: 'selesai' }],
    ['barang', { itemId: 9 }],
  ])('field %s ditolak', async (_n, extra) => {
    const client = pakaiRepo(fakeClient());
    login('admin');
    expect((await call(dataBody(extra))).status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('tanpa perubahan apa pun -> 400', async () => {
    expect((await call({ alasan: 'tidak ada', password: PASSWORD })).status).toBe(400);
  });

  it('dept pemakai diteruskan ke RPC dengan nama kolom SQL', async () => {
    const client = pakaiRepo(fakeClient());
    login('admin');
    const res = await call({ deptPemakai: [{ baris: 1, kode: 'PRD' }], alasan: 'salah dept', password: PASSWORD });
    expect(res.status).toBe(200);
    const [fn, args] = client.rpc.mock.calls[0];
    expect(fn).toBe('ubah_data_bkb');
    expect(args.p.dept_pemakai).toEqual([{ baris: 1, kode: 'PRD' }]);
    expect(args.p).not.toHaveProperty('password');
  });

  it('BKB belum selesai -> 409 dari SQL sampai ke client', async () => {
    pakaiRepo(fakeClient({ rpc: async () => ({ data: null, error: { message: 'STATUS_TIDAK_SESUAI|Hanya BKB selesai yang bisa diubah datanya.' } }) }));
    login('admin');
    const res = await call(dataBody());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Hanya BKB selesai yang bisa diubah datanya.');
  });
});

describe('ganti BKB: versi dan urutan status', () => {
  beforeEach(() => login('admin'));
  const call = (b) => gantiPOST(request('POST', b), ctx(5));

  it('versi kedaluwarsa -> 409, RPC tidak dipanggil', async () => {
    const client = pakaiRepo(fakeClient({ bkbRows: BKB_SELESAI }));
    login('admin');
    const res = await call(gantiBody({ versi: '2026-11-05T02:00:00.000Z' }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('VERSI_BERUBAH');
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('versi cocok -> RPC ganti_bkb dengan id lama dan pengganti dari request', async () => {
    const client = pakaiRepo(fakeClient({ bkbRows: BKB_SELESAI }));
    login('admin');
    const res = await call(gantiBody());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ lama: { status: 'diganti' }, pengganti: { status: 'selesai' } });
    expect(client.rpc).toHaveBeenCalledWith('ganti_bkb', expect.objectContaining({ p_id_lama: 5, p_id_pengganti: 6 }));
  });

  it('BKB lama tidak ada -> 404', async () => {
    pakaiRepo(fakeClient({ bkbRows: {} }));
    login('admin');
    expect((await call(gantiBody())).status).toBe(404);
  });

  it('tanpa versi atau penggantiId -> 400', async () => {
    const { versi, ...a } = gantiBody();
    const { penggantiId, ...b } = gantiBody();
    expect((await call(a)).status).toBe(400);
    expect((await call(b)).status).toBe(400);
  });

  it('SALDO_PENGGANTI_TIDAK_COCOK -> 409 dengan kode untuk dialog', async () => {
    pakaiRepo(fakeClient({
      bkbRows: BKB_SELESAI,
      rpc: async () => ({ data: null, error: { message: 'SALDO_PENGGANTI_TIDAK_COCOK|Saldo pengganti tidak cocok.' } }),
    }));
    login('admin');
    const res = await call(gantiBody());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: 'Saldo pengganti tidak cocok.', code: 'SALDO_PENGGANTI_TIDAK_COCOK' });
  });
});

describe('error RPC KODE|pesan diterjemahkan ke status yang benar', () => {
  const rpcError = (message) => ({ rpc: async () => ({ data: null, error: { message } }) });
  const kunjungi = async (message) => {
    pakaiRepo(fakeClient(rpcError(message)));
    login('admin');
    return koreksiPOST(request('POST', koreksiBody()), ctx(5));
  };

  it.each([
    ['STATUS_TIDAK_SESUAI|Status tidak sesuai.', 409],
    ['STOK_MINUS|Stok akan minus.', 409],
    ['SALDO_PENGGANTI_TIDAK_COCOK|Saldo pengganti tidak cocok.', 409],
    ['BARANG_TIDAK_ADA|Barang tidak ditemukan.', 404],
    ['BKB_TIDAK_ADA|BKB tidak ditemukan.', 404],
    ['SALDO_NEGATIF|Saldo tidak boleh negatif.', 400],
    ['DATA_TIDAK_VALID|Data tidak valid.', 400],
  ])('%s -> %i', async (msg, status) => {
    const res = await kunjungi(msg);
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe(msg.split('|')[1]);
  });

  // docs/backend-api.md: 403 = role tidak berhak. bkb.js memetakan DILARANG ke 403; koreksi.js harus sama.
  it('DILARANG|... -> 403', async () => {
    expect((await kunjungi('DILARANG|Anda tidak berhak.')).status).toBe(403);
  });

  it('segmen setelah "|" kedua (detail internal) tidak dikirim ke browser', async () => {
    const res = await kunjungi('STATUS_TIDAK_SESUAI|Status tidak sesuai.|detail: tabel bkb baris 55 trigger fn_x');
    const txt = JSON.stringify(await res.json());
    expect(txt).not.toMatch(/tabel bkb|trigger|fn_x/);
  });

  it.each([
    'duplicate key value violates unique constraint "items_pkey"',
    'connection to server at "db.abc.supabase.co" failed',
    'permission denied for table audit_log',
    'STATUS tidak pakai format|kode huruf kecil',
  ])('error mentah %j -> 500 generik tanpa bocor', async (msg) => {
    const res = await kunjungi(msg);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Gagal mengoreksi saldo.');
    expect(JSON.stringify(body)).not.toMatch(/supabase|audit_log|items_pkey|permission/);
  });

  it('error RPC pada ganti diterjemahkan sama (STOK_MINUS -> 409)', async () => {
    pakaiRepo(fakeClient({ bkbRows: BKB_SELESAI, ...rpcError('STOK_MINUS|Stok jadi minus.') }));
    login('admin');
    const res = await gantiPOST(request('POST', gantiBody()), ctx(5));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Stok jadi minus.');
  });
});

describe('dampak, kartu stok, audit: akses per role', () => {
  const url = (p) => `http://localhost:3000${p}`;
  const get = (p) => request('GET', undefined, { url: url(p), origin: null });

  beforeEach(() => {
    state.repo = {
      getDampakBkb: vi.fn(async () => ({ versi: 'v1', baris: [], peringatan: [] })),
      getKartuStok: vi.fn(async () => []),
      listAudit: vi.fn(async () => ({ rows: [], total: 0 })),
    };
  });

  const ENDPOINTS = [
    ['dampak', ['admin', 'superadmin'], () => dampakGET(get('/api/bkb/5/dampak?aksi=batal'), ctx(5)), 'getDampakBkb'],
    ['kartu stok', ['staff', 'admin', 'superadmin'], () => kartuGET(get('/api/items/5/kartu'), ctx(5)), 'getKartuStok'],
    ['audit', ['admin', 'superadmin'], () => auditGET(get('/api/audit')), 'listAudit'],
  ];

  describe.each(ENDPOINTS)('%s', (_n, allowed, call, fn) => {
    it.each(ROLES)('%s', async (role) => {
      login(role);
      const res = await call();
      expect(res.status).toBe(allowed.includes(role) ? 200 : 403);
      if (!allowed.includes(role)) expect(state.repo[fn]).not.toHaveBeenCalled();
    });
    it('belum login -> 401', async () => {
      expect((await call()).status).toBe(401);
    });
  });

  it('dampak: aksi tidak dikenal, atau ganti tanpa penggantiId -> 400', async () => {
    login('admin');
    expect((await dampakGET(get('/api/bkb/5/dampak?aksi=hapus'), ctx(5))).status).toBe(400);
    expect((await dampakGET(get('/api/bkb/5/dampak?aksi=ganti'), ctx(5))).status).toBe(400);
    expect((await dampakGET(get('/api/bkb/5/dampak'), ctx(5))).status).toBe(400);
    expect(state.repo.getDampakBkb).not.toHaveBeenCalled();
  });

  it('dampak: BKB tidak ada -> 404; BKB belum tersimpan -> 409', async () => {
    login('admin');
    state.repo.getDampakBkb.mockResolvedValue(null);
    expect((await dampakGET(get('/api/bkb/5/dampak?aksi=batal'), ctx(5))).status).toBe(404);
  });

  it('dampak (repository asli): BKB berstatus menunggu -> 409', async () => {
    pakaiRepo(fakeClient({ bkbRows: { 5: { ...BKB_SELESAI[5], status: 'menunggu' } } }));
    login('admin');
    const res = await dampakGET(get('/api/bkb/5/dampak?aksi=batal'), ctx(5));
    expect(res.status).toBe(409);
  });

  it('kartu: barang tidak ada -> 404', async () => {
    login('staff');
    state.repo.getKartuStok.mockResolvedValue(null);
    expect((await kartuGET(get('/api/items/5/kartu'), ctx(5))).status).toBe(404);
  });

  it('audit: tanggal salah format dan limit di luar batas -> 400', async () => {
    login('admin');
    expect((await auditGET(get('/api/audit?startDate=05-11-2026'))).status).toBe(400);
    expect((await auditGET(get('/api/audit?limit=1000'))).status).toBe(400);
    expect((await auditGET(get('/api/audit?page=0'))).status).toBe(400);
    expect(state.repo.listAudit).not.toHaveBeenCalled();
  });

  it('audit: filter diteruskan, meta dihitung', async () => {
    login('superadmin');
    state.repo.listAudit.mockResolvedValue({ rows: [{ id: 1 }], total: 45 });
    const body = await (await auditGET(get('/api/audit?entitas=bkb&entitasId=5&limit=20'))).json();
    expect(state.repo.listAudit.mock.calls[0][0]).toMatchObject({ entitas: 'bkb', entitasId: '5', limit: 20, page: 1 });
    expect(body.meta).toEqual({ total: 45, page: 1, limit: 20, totalPages: 3 });
  });
});
