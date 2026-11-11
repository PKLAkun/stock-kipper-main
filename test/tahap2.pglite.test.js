// Tes tahap 2 (T-20): akun operator, shift, dept proses opsional, Cek Stok (opname), koreksi saldo
// dengan atasan dan BA, laporan rekap dan mutasi. Memakai PGlite, tanpa Supabase.
// Kontrak: docs/database.md bagian "Tahap 2".

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const SCHEMA = readFileSync(path.resolve(__dirname, '../supabase/schema.sql'), 'utf8');
const STUB = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema if not exists realtime;
  create or replace function realtime.send(payload jsonb, event text, topic text, private boolean)
  returns void language sql as $$ select null::void $$;
`;

const OP = { id: 7001, name: 'Operator T2', role: 'operator' };
const SK = { id: 7002, name: 'SK T2', role: 'staff' };
const SK2 = { id: 7005, name: 'SK Dua', role: 'staff' };
const DE = { id: 7003, name: 'DE T2', role: 'admin' };
const SA = { id: 7004, name: 'Super T2', role: 'superadmin' };

let db;
let seq = 0;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(SCHEMA);
  await db.query(
    `insert into users (id, name, role, pin_hash) values ($1, $2, 'operator', 'x')`, [OP.id, OP.name]);
}, 60_000);
afterAll(async () => { await db?.close(); });

const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await rows(sql, params))[0];
const J = (v) => JSON.stringify(v);
// Memanggil fungsi dengan argumen posisi; objek dikirim sebagai jsonb, sisanya apa adanya.
async function call(name, ...args) {
  const ph = args.map((a, i) => (a !== null && typeof a === 'object' ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(', ');
  const vals = args.map((a) => (a !== null && typeof a === 'object' ? J(a) : a));
  return (await db.query(`select public.${name}(${ph}) as r`, vals)).rows[0].r;
}
async function galat(promise) {
  let err;
  try { await promise; } catch (e) { err = e; }
  expect(err, 'seharusnya ditolak').toBeDefined();
  const m = String(err.message).match(/^([A-Z][A-Z0-9_]+)\|/);
  expect(m, `format KODE|pesan: ${err.message}`).not.toBeNull();
  return m[1];
}
async function barang(qty, extra = {}) {
  seq += 1;
  const r = await call('create_item_master',
    { category_code: '1', item_code: `T2-${seq}`, name: `Barang T2 ${seq}`, unit: 'pcs', quantity: qty, ...extra }, DE);
  return r;
}
const saldo = async (id) => Number((await one(`select quantity from items where id = $1`, [id])).quantity);
const aturOperator = (tujuan, inisial = null) => db.query(
  `update users set tujuan_kode = $2, inisial = $3 where id = $1`, [OP.id, tujuan, inisial]);

const bkbP = (b, qty = 1, extra = {}) => ({
  bkb_kategori: '1', bkb_date: '2026-11-08', items: [{ item_id: b.id, qty }], ...extra,
});

describe('data awal tahap 2', () => {
  it('param_tim, keterangan dan dept proses sesuai rancangan', async () => {
    const tim = await rows(`select kode, nama from param_tim order by urutan`);
    expect(tim.map((r) => r.kode)).toEqual(['TARIK', 'SUPLAI', 'TEMPEL']);
    const t = Object.fromEntries((await rows(`select * from param_tujuan`)).map((r) => [r.kode, r]));
    expect(t.INJ1.dept_pemakai_kode).toBe('PL003');
    expect(t.INJ3.wajib_mesin).toBe(true);
    expect(t.PROSES.nama).toBe('Proses Gudang (Tempel)');
    expect(t.TEMPEL.aktif).toBe(false);
    expect(t.IHW.aktif).toBe(false);
    expect(t.REJECT).toMatchObject({ jenis_kode: 'PB', dept_pemakai_kode: '52', aktif: true });
    const d = await rows(`select kode, nama, bawaan from param_dept_proses order by urutan`);
    expect(d[0]).toMatchObject({ kode: 'P1', nama: 'Plastik Umum', bawaan: true });
    expect(d[4].nama).toBe('Plastik Assembly');
  });

  it('inisial akun: format dan keunikan', async () => {
    await db.query(`insert into users (name, role, pin_hash, inisial) values ('A1','operator','x','ABC')`);
    await expect(db.query(`insert into users (name, role, pin_hash, inisial) values ('A2','operator','x','ABC')`)).rejects.toThrow();
    await expect(db.query(`insert into users (name, role, pin_hash, inisial) values ('A3','operator','x','abc1')`)).rejects.toThrow();
    await db.query(`insert into users (name, role, pin_hash) values ('A4','operator','x'), ('A5','operator','x')`);
  });
});

describe('buat_bkb: operator, inisial, shift, dept proses', () => {
  it('operator tanpa tujuan akun ditolak AKUN_BELUM_DIATUR', async () => {
    const b = await barang(10);
    await aturOperator(null);
    expect(await galat(call('buat_bkb', bkbP(b, 1, { tujuan_kode: 'BIP' }), OP))).toBe('AKUN_BELUM_DIATUR');
    // akun yang tidak ada di tabel users juga ditolak
    expect(await galat(call('buat_bkb', bkbP(b, 1, { tujuan_kode: 'BIP' }), { id: 99999, name: 'Hantu', role: 'operator' })))
      .toBe('AKUN_BELUM_DIATUR');
  });

  it('operator memakai tujuan akun walau body berbeda', async () => {
    const b = await barang(10);
    await aturOperator('RAKIT');
    const r = await call('buat_bkb', bkbP(b, 1, { tujuan_kode: 'INJ1' }), OP);
    expect(r.tujuan_kode).toBe('RAKIT');
    expect(r.jenis_kode).toBe('PB');
  });

  it('role lain tetap memilih tujuan sendiri', async () => {
    const b = await barang(10);
    const r = await call('buat_bkb', bkbP(b, 1, { tujuan_kode: 'QC', pihak_nama: 'X' }), SK);
    expect(r.tujuan_kode).toBe('QC');
  });

  it('inisial diambil dari akun, mengalahkan kiriman browser', async () => {
    const b = await barang(10);
    await aturOperator('BIP', 'ANDRE');
    const r = await call('buat_bkb', bkbP(b, 1, { inisial: 'XXX', nomor_urut: '5' }), OP);
    expect(r.keterangan_extra).toBe('ANDRE/5');
    await aturOperator('BIP', null);
    const r2 = await call('buat_bkb', bkbP(b, 1, { inisial: 'xyz', nomor_urut: '6' }), OP);
    // [Tahap 2, 11-11-2026, T-27] Akun tanpa inisial: dari nama akun, kiriman browser diabaikan (temuan review)
    expect(r2.keterangan_extra).not.toContain('xyz');
    expect(r2.keterangan_extra).toMatch(/^[A-Z0-9]{1,3}\/6$/);
  });

  it('reference (shift) hanya kosong, 1, 2, atau 3', async () => {
    const b = await barang(10);
    await aturOperator('BIP');
    expect(await galat(call('buat_bkb', bkbP(b, 1, { reference: '4' }), OP))).toBe('DATA_TIDAK_VALID');
    expect(await galat(call('buat_bkb', bkbP(b, 1, { reference: 'REF-1' }), OP))).toBe('DATA_TIDAK_VALID');
    expect((await call('buat_bkb', bkbP(b, 1, { reference: '2' }), OP)).reference).toBe('2');
    expect((await call('buat_bkb', bkbP(b, 1), OP)).reference).toBeNull();
    expect((await call('buat_bkb', bkbP(b, 1, { reference: '' }), OP)).reference).toBeNull();
  });

  it('dept proses boleh kosong; bila dikirim harus ada', async () => {
    const b = await barang(10);
    await aturOperator('BIP');
    const r = await call('buat_bkb', bkbP(b, 1), OP);
    expect(r.items[0].dept_proses_kode).toBeNull();
    expect(r.items[0].dept_pemakai_kode).toBe('PL003');
    const p = bkbP(b, 1);
    p.items[0].dept_proses_kode = 'P2';
    expect((await call('buat_bkb', p, OP)).items[0].dept_proses_kode).toBe('P2');
    p.items[0].dept_proses_kode = 'PX';
    expect(await galat(call('buat_bkb', p, OP))).toBe('DATA_TIDAK_VALID');
  });

  it('betulkan, konfirmasi, approve, ubah data, ganti tetap jalan dengan dept proses kosong; shift masuk log', async () => {
    const b = await barang(100);
    await aturOperator('BIP');
    const lama = await call('buat_bkb', bkbP(b, 10, { reference: '3' }), OP);
    const bet = await call('betulkan_bkb', lama.id, { items: [{ item_id: b.id, qty: 10 }], reference: '1' }, SK);
    expect(bet.items[0].dept_proses_kode).toBeNull();
    expect(await galat(call('betulkan_bkb', lama.id, { reference: '9' }, SK))).toBe('DATA_TIDAK_VALID');
    await call('konfirmasi_bkb', bet.id, [{ bkb_item_id: bet.items[0].id, saldo_sk: 90 }], SK);
    const sel = await call('approve_bkb', bet.id, DE);
    expect(sel.status).toBe('selesai');
    const log = await one(`select * from transactions_log where bkb_id = $1`, [bet.id]);
    expect(log.shift).toBe('1');
    expect(log.dept_proses).toBeNull();
    const ubah = await call('ubah_data_bkb', bet.id, { keterangan: 'BIP/AND/9' }, 'uji', DE);
    expect(ubah.keterangan).toBe('BIP/AND/9');
    const peng = await call('buat_bkb', bkbP(b, 20, { mengganti_bkb_id: bet.id, pihak_nama: 'SK', tujuan_kode: 'BIP' }), SK);
    await call('konfirmasi_bkb', peng.id, [{ bkb_item_id: peng.items[0].id, saldo_sk: 80 }], SK);
    const g = await call('ganti_bkb', bet.id, peng.id, 'qty salah', DE);
    expect(g.ganti_berhasil).toBe(true);
    expect(await saldo(b.id)).toBe(80);
  });
});

describe('koreksi_saldo: nama atasan dan nomor BA', () => {
  it('wajib atasan dan BA; tercatat di riwayat dan audit', async () => {
    const b = await barang(50);
    expect(await galat(call('koreksi_saldo', b.id, 40, 'uji', '', 'BA-1', DE))).toBe('DATA_TIDAK_VALID');
    expect(await galat(call('koreksi_saldo', b.id, 40, 'uji', 'Atasan', '  ', DE))).toBe('DATA_TIDAK_VALID');
    expect(await galat(call('koreksi_saldo', b.id, 40, 'uji', null, null, DE))).toBe('DATA_TIDAK_VALID');
    expect(await saldo(b.id)).toBe(50);
    const l = await call('koreksi_saldo', b.id, 40, 'uji', ' Pak Budi ', 'BA-77', DE);
    expect(l).toMatchObject({ jenis: 'ADJ', aksi: 'koreksi', nama_atasan: 'Pak Budi', nomor_ba: 'BA-77', direction: 'out' });
    expect(l.nomor_urut).toBeNull();
    const a = await one(`select * from audit_log where entitas = 'items' and entitas_id = $1 and aksi = 'ubah'`, [String(b.id)]);
    expect(a.data_baru).toMatchObject({ nama_atasan: 'Pak Budi', nomor_ba: 'BA-77' });
    expect(await saldo(b.id)).toBe(40);
  });
});

describe('Cek Stok (opname)', () => {
  const buatOpname = (b, fisik, extra = {}, actor = SK) => call('simpan_opname',
    { alasan_jenis: 'opname', items: [{ item_id: b.id, qty_fisik: fisik, analisa: 'Selisih karena salah hitung kemarin' }], ...extra }, actor);
  const ANALISA = 'Hasil hitung ulang di gudang';

  it('simpan draf: nomor OPN-YYMM-00001, saldo sistem tersimpan, stok tidak berubah', async () => {
    const b = await barang(100);
    const o = await buatOpname(b, 95, { tanggal: '2026-11-11' });
    expect(o.nomor).toMatch(/^OPN-2611-\d{5}$/);
    expect(o.status).toBe('draf');
    expect(o.dibuat_oleh_nama).toBe(SK.name);
    expect(o.items[0]).toMatchObject({ item_id: b.id, qty_fisik: 95, selisih: -5, saldo_sistem_saat_hitung: 100 });
    expect(o.items[0].item_code).toBe(b.item_code);
    expect(await saldo(b.id)).toBe(100);
    const o2 = await buatOpname(b, 95, { tanggal: '2026-11-12' });
    expect(Number(o2.nomor.slice(-5))).toBe(Number(o.nomor.slice(-5)) + 1);
    const o3 = await buatOpname(b, 95, { tanggal: '2026-12-01' });
    expect(o3.nomor).toMatch(/^OPN-2612-00001$/);
  });

  it('idempotency_key mengembalikan opname yang sama; draf bisa diubah', async () => {
    const b = await barang(100);
    const key = '22222222-3333-4444-8555-666666666666';
    const a = await buatOpname(b, 90, { idempotency_key: key });
    const c = await buatOpname(b, 90, { idempotency_key: key });
    expect(c.id).toBe(a.id);
    const u = await call('simpan_opname', { id: a.id, items: [{ item_id: b.id, qty_fisik: 80, analisa: ANALISA }] }, SK);
    expect(u.id).toBe(a.id);
    expect(u.items).toHaveLength(1);
    expect(u.items[0]).toMatchObject({ qty_fisik: 80, selisih: -20 });
  });

  it('peran: operator dan admin tidak boleh membuat; staff tidak boleh menyetujui', async () => {
    const b = await barang(10);
    const p = { alasan_jenis: 'opname', items: [{ item_id: b.id, qty_fisik: 10 }] };
    expect(await galat(call('simpan_opname', p, OP))).toBe('DILARANG');
    expect(await galat(call('simpan_opname', p, DE))).toBe('DILARANG');
    const o = await call('simpan_opname', p, SK);
    expect(await galat(call('ajukan_opname', o.id, DE))).toBe('DILARANG');
    await call('ajukan_opname', o.id, SK);
    expect(await galat(call('approve_opname', o.id, 'Atasan', 'BA-1', SK2))).toBe('DILARANG');
    expect(await galat(call('tolak_opname', o.id, 'x', SK2))).toBe('DILARANG');
  });

  it('data tidak valid: kosong, dobel, qty minus/nol, barang tidak ada', async () => {
    const b = await barang(10);
    expect(await galat(call('simpan_opname', { alasan_jenis: 'opname', items: [] }, SK))).toBe('DATA_TIDAK_VALID');
    expect(await galat(call('simpan_opname', { alasan_jenis: 'salah', items: [{ item_id: b.id, qty_fisik: 1 }] }, SK))).toBe('DATA_TIDAK_VALID');
    expect(await galat(call('simpan_opname', { alasan_jenis: 'opname', items: [{ item_id: b.id, qty_fisik: 1 }, { item_id: b.id, qty_fisik: 2 }] }, SK))).toBe('DATA_TIDAK_VALID');
    expect(await galat(call('simpan_opname', { alasan_jenis: 'opname', items: [{ item_id: b.id, qty_fisik: -1 }] }, SK))).toBe('DATA_TIDAK_VALID');
    expect(await galat(call('simpan_opname', { alasan_jenis: 'rusak', items: [{ item_id: b.id, qty: 0 }] }, SK))).toBe('DATA_TIDAK_VALID');
    expect(await galat(call('simpan_opname', { alasan_jenis: 'opname', items: [{ item_id: 987654, qty_fisik: 1 }] }, SK))).toBe('BARANG_TIDAK_ADA');
  });

  it('ajukan tanpa analisa (kurang dari 10 karakter) untuk selisih tidak nol ditolak; selisih 0 tidak perlu analisa', async () => {
    const b = await barang(100);
    const o = await call('simpan_opname', { alasan_jenis: 'opname', items: [{ item_id: b.id, qty_fisik: 90, analisa: 'pendek' }] }, SK);
    expect(await galat(call('ajukan_opname', o.id, SK))).toBe('ANALISA_WAJIB');
    expect((await one(`select status from opname where id = $1`, [o.id])).status).toBe('draf');
    const nol = await call('simpan_opname', { alasan_jenis: 'opname', items: [{ item_id: b.id, qty_fisik: 100 }] }, SK);
    expect((await call('ajukan_opname', nol.id, SK)).status).toBe('diajukan');
  });

  it('approve menerapkan SELISIH walau ada BKB tersimpan di antaranya', async () => {
    const b = await barang(100);
    const o = await buatOpname(b, 90);           // sistem 100, fisik 90 => selisih -10
    await call('ajukan_opname', o.id, SK);
    expect(await saldo(b.id)).toBe(100);         // belum berubah selama diajukan
    // BKB keluar 30 disimpan di antaranya: saldo menjadi 70
    await db.query(`update users set tujuan_kode = 'BIP' where id = $1`, [OP.id]);
    const bkb = await call('buat_bkb', bkbP(b, 30), OP);
    await call('konfirmasi_bkb', bkb.id, [{ bkb_item_id: bkb.items[0].id, saldo_sk: 70 }], SK);
    await call('approve_bkb', bkb.id, DE);
    expect(await saldo(b.id)).toBe(70);
    const a = await call('approve_opname', o.id, ' Pak Atasan ', 'BA-OPN-1', DE);
    expect(a.status).toBe('disetujui');
    expect(a.nama_atasan).toBe('Pak Atasan');
    expect(a.items[0]).toMatchObject({ saldo_sebelum: 70, saldo_setelah: 60, selisih: -10 });
    expect(await saldo(b.id)).toBe(60);          // 70 - 10, bukan 90
    const log = await one(`select * from transactions_log where doc_no = $1`, [o.nomor]);
    expect(log).toMatchObject({ jenis: 'OPN', aksi: 'opname', direction: 'out', nama_atasan: 'Pak Atasan', nomor_ba: 'BA-OPN-1',
      balance_before: '70.000', balance_after: '60.000' });
    expect(log.nomor_urut).toBeNull();
    expect(Number((await one(`select urut_terakhir from items where id = $1`, [b.id])).urut_terakhir)).toBe(1);
    // tidak bisa disetujui dua kali
    expect(await galat(call('approve_opname', o.id, 'A', 'B', DE))).toBe('STATUS_TIDAK_SESUAI');
    expect(await saldo(b.id)).toBe(60);
  });

  it('selisih positif menambah stok; selisih 0 tidak menulis riwayat', async () => {
    const b1 = await barang(10);
    const b2 = await barang(20);
    const o = await call('simpan_opname', { alasan_jenis: 'opname', items: [
      { item_id: b1.id, qty_fisik: 15, analisa: 'Ditemukan barang di rak lain' },
      { item_id: b2.id, qty_fisik: 20 }] }, SK);
    await call('ajukan_opname', o.id, SK);
    await call('approve_opname', o.id, 'Atasan', 'BA-2', SA);
    expect(await saldo(b1.id)).toBe(15);
    expect(await saldo(b2.id)).toBe(20);
    expect(Number((await one(`select count(*)::int c from transactions_log where doc_no = $1`, [o.nomor])).c)).toBe(1);
  });

  it('hasil minus ditolak STOK_MINUS dan tidak ada yang berubah', async () => {
    const b1 = await barang(10);
    const b2 = await barang(50);
    const o = await call('simpan_opname', { alasan_jenis: 'rusak', items: [
      { item_id: b2.id, qty: 5, analisa: 'Pecah saat dipindahkan' },
      { item_id: b1.id, qty: 8, analisa: 'Rusak terkena air hujan' }] }, SK);
    await call('ajukan_opname', o.id, SK);
    // BKB keluar menghabiskan stok b1 lebih dulu
    await db.query(`update users set tujuan_kode = 'BIP' where id = $1`, [OP.id]);
    const bkb = await call('buat_bkb', bkbP(b1, 5), OP);
    await call('konfirmasi_bkb', bkb.id, [{ bkb_item_id: bkb.items[0].id, saldo_sk: 5 }], SK);
    await call('approve_bkb', bkb.id, DE);
    expect(await galat(call('approve_opname', o.id, 'Atasan', 'BA-3', DE))).toBe('STOK_MINUS');
    expect(await saldo(b1.id)).toBe(5);
    expect(await saldo(b2.id)).toBe(50);
    expect((await one(`select status from opname where id = $1`, [o.id])).status).toBe('diajukan');
    expect(Number((await one(`select count(*)::int c from transactions_log where doc_no = $1`, [o.nomor])).c)).toBe(0);
  });

  it('pembuat tidak boleh menyetujui miliknya sendiri; atasan dan BA wajib', async () => {
    const b = await barang(10);
    const o = await call('simpan_opname', { alasan_jenis: 'opname', items: [{ item_id: b.id, qty_fisik: 8, analisa: ANALISA }] }, SA);
    await call('ajukan_opname', o.id, SA);
    expect(await galat(call('approve_opname', o.id, 'Atasan', 'BA-4', SA))).toBe('TIDAK_BOLEH_SENDIRI');
    expect(await galat(call('approve_opname', o.id, '', 'BA-4', DE))).toBe('DATA_TIDAK_VALID');
    expect(await galat(call('approve_opname', o.id, 'Atasan', ' ', DE))).toBe('DATA_TIDAK_VALID');
    expect(await saldo(b.id)).toBe(10);
    expect((await call('approve_opname', o.id, 'Atasan', 'BA-4', DE)).status).toBe('disetujui');
  });

  it('tolak lalu ubah dan ajukan lagi, lalu disetujui', async () => {
    const b = await barang(100);
    const o = await buatOpname(b, 80);
    await call('ajukan_opname', o.id, SK);
    expect(await galat(call('tolak_opname', o.id, '  ', DE))).toBe('DATA_TIDAK_VALID');
    const t = await call('tolak_opname', o.id, 'Hitung ulang', DE);
    expect(t).toMatchObject({ status: 'ditolak', catatan_tolak: 'Hitung ulang', ditolak_oleh_nama: DE.name });
    expect(await galat(call('approve_opname', o.id, 'A', 'B', DE))).toBe('STATUS_TIDAK_SESUAI');
    const u = await call('simpan_opname', { id: o.id, items: [{ item_id: b.id, qty_fisik: 85, analisa: ANALISA }] }, SK);
    expect(u.items[0].selisih).toBe(-15);
    expect((await call('ajukan_opname', o.id, SK)).status).toBe('diajukan');
    expect((await call('approve_opname', o.id, 'Atasan', 'BA-5', DE)).status).toBe('disetujui');
    expect(await saldo(b.id)).toBe(85);
    expect(await galat(call('simpan_opname', { id: o.id, items: [{ item_id: b.id, qty_fisik: 1 }] }, SK))).toBe('STATUS_TIDAK_SESUAI');
  });

  it('rusak dan hilang mengurangi stok sebesar jumlahnya', async () => {
    const b = await barang(40);
    const o = await call('simpan_opname', { alasan_jenis: 'rusak', items: [{ item_id: b.id, qty: 6, analisa: 'Rusak saat bongkar muat' }] }, SK);
    expect(o.items[0]).toMatchObject({ qty: 6, qty_fisik: null, selisih: -6 });
    await call('ajukan_opname', o.id, SK);
    await call('approve_opname', o.id, 'Atasan', 'BA-6', DE);
    expect(await saldo(b.id)).toBe(34);
    const h = await call('simpan_opname', { alasan_jenis: 'hilang', items: [{ item_id: b.id, qty: 4, analisa: 'Tidak ditemukan di gudang' }] }, SK);
    await call('ajukan_opname', h.id, SK);
    await call('approve_opname', h.id, 'Atasan', 'BA-7', SA);
    expect(await saldo(b.id)).toBe(30);
  });

  it('batal: hanya draf atau ditolak, alasan wajib; opname tidak bisa dihapus', async () => {
    const b = await barang(10);
    const o = await buatOpname(b, 5);
    expect(await galat(call('batal_opname', o.id, '', SK))).toBe('DATA_TIDAK_VALID');
    const x = await call('batal_opname', o.id, 'Salah buat', SK);
    expect(x).toMatchObject({ status: 'dibatalkan', alasan_batal: 'Salah buat' });
    expect(await galat(call('ajukan_opname', o.id, SK))).toBe('STATUS_TIDAK_SESUAI');
    const o2 = await buatOpname(b, 5);
    await call('ajukan_opname', o2.id, SK);
    expect(await galat(call('batal_opname', o2.id, 'x', SK))).toBe('STATUS_TIDAK_SESUAI');
    await expect(db.query(`delete from opname`)).rejects.toThrow(/TIDAK_BOLEH_HAPUS/);
    await expect(db.query(`delete from opname_items`)).rejects.toThrow(/TIDAK_BOLEH_HAPUS/);
  });

  it('RLS deny-all dan hak execute hanya service_role', async () => {
    const r = await rows(`select has_function_privilege('anon', 'public.approve_opname(bigint,text,text,jsonb)', 'execute') a,
      has_function_privilege('service_role', 'public.approve_opname(bigint,text,text,jsonb)', 'execute') s,
      has_function_privilege('anon', 'public.laporan_rekap(date,date,text)', 'execute') a2,
      has_function_privilege('service_role', 'public.laporan_mutasi(jsonb)', 'execute') s2`);
    expect(r[0]).toEqual({ a: false, s: true, a2: false, s2: true });
    const rls = await rows(`select relname, relrowsecurity from pg_class where relname in ('opname','opname_items','param_tim')`);
    expect(rls.every((x) => x.relrowsecurity)).toBe(true);
    expect(rls).toHaveLength(3);
  });
});

describe('laporan', () => {
  it('rekap: saldo_awal + masuk - keluar + koreksi = saldo_akhir, tanda di bawah minimum', async () => {
    const b = await barang(100, { stok_minimum: 50 });
    await db.query(`update users set tujuan_kode = 'BIP' where id = $1`, [OP.id]);
    const keluar = await call('buat_bkb', bkbP(b, 30, { reference: '2' }), OP);
    await call('konfirmasi_bkb', keluar.id, [{ bkb_item_id: keluar.items[0].id, saldo_sk: 70 }], SK);
    await call('approve_bkb', keluar.id, DE);
    await call('koreksi_saldo', b.id, 65, 'selisih kartu', 'Atasan', 'BA-9', DE);          // koreksi -5
    const o = await call('simpan_opname', { alasan_jenis: 'opname', items: [{ item_id: b.id, qty_fisik: 70, analisa: 'Ditemukan sisa di rak' }] }, SK);
    await call('ajukan_opname', o.id, SK);
    await call('approve_opname', o.id, 'Atasan', 'BA-10', DE);                             // opname +5
    // riwayat dibuat sekarang: dari kemarin sampai besok mencakup semuanya; periode masa lalu tidak
    const lebar = await call('laporan_rekap', '2020-01-01', '2099-12-31', '1');
    const x = lebar.find((r) => r.item_id === b.id);
    expect(x).toMatchObject({ item_code: b.item_code, saldo_awal: 0, masuk: 100, keluar: 30, koreksi: 0, saldo_akhir: 70, di_bawah_minimum: false });
    // setiap baris konsisten
    for (const r of lebar) {
      expect(Number(r.saldo_awal) + Number(r.masuk) - Number(r.keluar) + Number(r.koreksi)).toBeCloseTo(Number(r.saldo_akhir), 6);
    }
    const lampau = (await call('laporan_rekap', '2020-01-01', '2020-12-31', null)).find((r) => r.item_id === b.id);
    expect(lampau).toMatchObject({ saldo_awal: 0, masuk: 0, keluar: 0, koreksi: 0, saldo_akhir: 0 });
    // periode mulai besok: semua transaksi sebelum periode, saldo awal = saldo akhir
    const besok = (await call('laporan_rekap', '2099-01-01', '2099-01-31', '1')).find((r) => r.item_id === b.id);
    expect(besok).toMatchObject({ saldo_awal: 70, masuk: 0, keluar: 0, koreksi: 0, saldo_akhir: 70 });
    expect(await galat(call('laporan_rekap', '2026-02-01', '2026-01-01', null))).toBe('DATA_TIDAK_VALID');
  });

  it('rekap memisahkan koreksi (ADJ + OPN) dari masuk dan keluar, kategori menyaring, minimum ditandai', async () => {
    const b = await barang(20, { stok_minimum: 20 });
    const b4 = await call('create_item_master', { category_code: '4', item_code: `T2K4-${++seq}`, name: 'Barang kat 4', quantity: 5 }, DE);
    await call('koreksi_saldo', b.id, 12, 'selisih', 'Atasan', 'BA-11', DE);
    const o = await call('simpan_opname', { alasan_jenis: 'hilang', items: [{ item_id: b.id, qty: 2, analisa: 'Hilang tanpa jejak' }] }, SK);
    await call('ajukan_opname', o.id, SK);
    await call('approve_opname', o.id, 'Atasan', 'BA-12', DE);
    const r1 = await call('laporan_rekap', '2020-01-01', '2099-12-31', '1');
    const x = r1.find((r) => r.item_id === b.id);
    expect(x).toMatchObject({ masuk: 20, keluar: 0, koreksi: -10, saldo_akhir: 10, di_bawah_minimum: true });
    expect(r1.find((r) => r.item_id === b4.id)).toBeUndefined();
    const r4 = await call('laporan_rekap', '2020-01-01', '2099-12-31', '4');
    expect(r4.every((r) => r.category_code === '4')).toBe(true);
    expect(r4.find((r) => r.item_id === b4.id)).toBeDefined();
  });

  it('mutasi: filter dan total', async () => {
    const b = await barang(100);
    await db.query(`update users set tujuan_kode = 'QC' where id = $1`, [OP.id]);
    const k = await call('buat_bkb', bkbP(b, 10, { reference: '3' }), OP);
    await call('konfirmasi_bkb', k.id, [{ bkb_item_id: k.items[0].id, saldo_sk: 90 }], SK);
    await call('approve_bkb', k.id, DE);
    await call('koreksi_saldo', b.id, 80, 'selisih', 'Atasan', 'BA-13', DE);
    const semua = await call('laporan_mutasi', { item_id: b.id });
    expect(semua.total).toBe(3);                          // SA, PB, ADJ
    expect(semua.rows.map((r) => r.jenis)).toEqual(['SA', 'PB', 'ADJ']);
    const pb = await call('laporan_mutasi', { item_id: b.id, jenis: 'PB', shift: '3', tujuan: 'QC' });
    expect(pb.total).toBe(1);
    expect(pb.rows[0]).toMatchObject({ shift: '3', doc_no: k.doc_no, tujuan_kode: 'QC' });
    expect((await call('laporan_mutasi', { item_id: b.id, shift: '1' })).total).toBe(0);
    expect((await call('laporan_mutasi', { item_id: b.id, keterangan: 'koreksi' })).total).toBe(1);
    const hal = await call('laporan_mutasi', { item_id: b.id, limit: 1, offset: 1 });
    expect(hal.total).toBe(3);
    expect(hal.rows).toHaveLength(1);
    expect(hal.rows[0].jenis).toBe('PB');
    expect((await call('laporan_mutasi', { item_id: b.id, dari: '2099-01-01' })).total).toBe(0);
    expect(await galat(call('laporan_mutasi', { limit: 50001 }))).toBe('DATA_TIDAK_VALID');
    expect((await call('laporan_mutasi', null)).rows).toBeDefined();
  });
});
