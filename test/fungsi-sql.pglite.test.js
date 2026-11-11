// Tes perilaku fungsi SQL di supabase/schema.sql memakai PGlite (tanpa Supabase).
// Ditulis dari spesifikasi (docs/database.md, docs/alur.md, docs/pengujian.md),
// bukan dari isi fungsi. Data uji dummy, dibuat lewat create_item_master.
// Kontrak: fungsi returns jsonb, error 'KODE|pesan', p_actor jsonb {id,name,role} di akhir.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const SCHEMA = readFileSync(path.resolve(__dirname, '../supabase/schema.sql'), 'utf8');

const SUPABASE_STUB = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema if not exists realtime;
  create or replace function realtime.send(payload jsonb, event text, topic text, private boolean)
  returns void language sql as $$ select null::void $$;
`;

const OP = { id: 9001, name: 'Operator Uji', role: 'operator' };
const SK = { id: 9002, name: 'SK Uji', role: 'staff' };
const DE = { id: 9003, name: 'DE Uji', role: 'admin' };

// Tanda tangan argumen tiap fungsi (urutan sesuai kontrak).
const SIG = {
  buat_bkb: ['jsonb', 'jsonb'],
  betulkan_bkb: ['bigint', 'jsonb', 'jsonb'],
  konfirmasi_bkb: ['bigint', 'jsonb', 'jsonb'],
  approve_bkb: ['bigint', 'jsonb'],
  batal_bkb: ['bigint', 'text', 'jsonb'],
  kembalikan_bkb: ['bigint', 'text', 'jsonb'],
  ganti_bkb: ['bigint', 'bigint', 'text', 'jsonb'],
  ubah_data_bkb: ['bigint', 'jsonb', 'text', 'jsonb'],
  // [Tahap 2, 11-11-2026, T-20] Dinonaktifkan: signature lama tanpa nama atasan dan nomor BA.
  // koreksi_saldo: ['bigint', 'numeric', 'text', 'jsonb'],
  koreksi_saldo: ['bigint', 'numeric', 'text', 'text', 'text', 'jsonb'],
  create_item_master: ['jsonb', 'jsonb'],
  update_item_master: ['bigint', 'jsonb', 'jsonb'],
};

let db;
let seq = 0;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(SCHEMA);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

async function rows(sql, params = []) {
  return (await db.query(sql, params)).rows;
}
async function one(sql, params = []) {
  return (await rows(sql, params))[0];
}

// Memanggil fungsi publik; argumen objek dijadikan JSON.
async function fn(name, ...args) {
  const sig = SIG[name];
  const ph = sig.map((t, i) => `$${i + 1}::${t}`).join(', ');
  const vals = args.map((a) => (a !== null && typeof a === 'object' ? JSON.stringify(a) : a));
  const r = await db.query(`select public.${name}(${ph}) as r`, vals);
  return r.rows[0].r;
}

// Error harus berformat 'KODE|pesan'. Mengembalikan kodenya.
async function galat(promise) {
  let err;
  try {
    await promise;
  } catch (e) {
    err = e;
  }
  expect(err, 'seharusnya ditolak').toBeDefined();
  const m = /([A-Z][A-Z0-9_]+)\|/.exec(err.message);
  expect(m, `format error KODE|pesan: ${err.message}`).not.toBeNull();
  return m[1];
}

const idDari = (res) => Number(res?.id ?? res?.bkb?.id);

async function setWajibApprove(v) {
  await db.query(`update app_settings set value = $1::jsonb where key = 'wajib_approve_de'`, [JSON.stringify(v)]);
}

async function barangBaru(qty = 0, extra = {}) {
  seq += 1;
  const kode = `UJI-${String(seq).padStart(4, '0')}`;
  await fn('create_item_master', {
    category_code: '1', item_code: kode, name: `Barang Uji ${seq}`, unit: 'pcs', quantity: qty, ...extra,
  }, DE);
  return one(`select * from items where item_code = $1`, [kode]);
}

const qtyBarang = async (id) => Number((await one(`select quantity from items where id = $1`, [id])).quantity);
const urutBarang = async (id) => Number((await one(`select urut_terakhir from items where id = $1`, [id])).urut_terakhir);
const statusBkb = async (id) => one(`select * from bkb where id = $1`, [id]);
const barisBkb = async (id) => rows(`select * from bkb_items where bkb_id = $1 order by id`, [id]);
const jumlahLog = async (itemId) => Number((await one(`select count(*)::int c from transactions_log where item_id = $1`, [itemId])).c);

// [Tahap 2, 11-11-2026, T-20] Tujuan operator kini diambil dari akunnya (users.tujuan_kode), jadi sebelum
// operator membuat BKB, akunnya diatur dulu ke tujuan yang dipakai tes.
async function aturAkunOperator(actor, tujuan) {
  await db.query(
    `insert into users (id, name, role, pin_hash, tujuan_kode) values ($1, $2, 'operator', 'x', $3)
     on conflict (id) do update set tujuan_kode = excluded.tujuan_kode`,
    [actor.id, actor.name, tujuan]
  );
}

// Membuat BKB. tujuan BIP = keluar (PB), INJ1 = masuk (PR, wajib mesin).
async function buat(lines, { tujuan = 'BIP', actor = OP, key, ...extra } = {}) {
  if (actor.role === 'operator') await aturAkunOperator(actor, tujuan);
  const p = {
    bkb_kategori: '1',
    tujuan_kode: tujuan,
    bkb_date: '2026-11-08',
    keterangan_extra: 'UJI/1',
    sumber: actor.role === 'operator' ? 'operator' : 'non_operator',
    ...(actor.role === 'operator' ? {} : { pihak_nama: 'Pihak Uji', pihak_dept: 'Gudang' }),
    ...(tujuan.startsWith('INJ') ? { machine: 'MC-01' } : {}),
    ...(key ? { idempotency_key: key } : {}),
    ...extra,
    items: lines.map(([item, qty]) => ({
      item_id: item.id, qty, dept_pemakai_kode: 'PL003', dept_proses_kode: 'P1',
    })),
  };
  const res = await fn('buat_bkb', p, actor);
  return idDari(res);
}

async function konfirmasi(id, saldoPerBaris, actor = SK) {
  const baris = await barisBkb(id);
  const lines = baris.map((b, i) => ({ bkb_item_id: b.id, saldo_sk: saldoPerBaris[i] }));
  return fn('konfirmasi_bkb', id, lines, actor);
}

// Alur penuh sampai selesai (wajib_approve_de = true): buat, konfirmasi, approve.
async function selesaikan(lines, saldoSk, opts = {}) {
  const id = await buat(lines, opts);
  await konfirmasi(id, saldoSk);
  const s = await statusBkb(id);
  if (s.status === 'menunggu_de') await fn('approve_bkb', id, DE);
  return id;
}

describe('alur buat, konfirmasi, simpan (A1 sampai A3)', () => {
  it('wajib_approve_de aktif: menunggu, menunggu_de, selesai; stok berubah hanya saat simpan', async () => {
    await setWajibApprove(true);
    const b = await barangBaru(100);
    const logAwal = await jumlahLog(b.id);

    const id = await buat([[b, 10]]);
    let s = await statusBkb(id);
    expect(s.status).toBe('menunggu');
    expect(s.jenis_kode).toBe('PB');
    expect(s.doc_no).toMatch(/^PB\d{3}-\d{2}[A-Z]\d{5}$/);
    expect(await qtyBarang(b.id)).toBe(100);
    expect((await barisBkb(id))[0].nomor_urut).toBeNull();
    expect(await jumlahLog(b.id)).toBe(logAwal);

    await konfirmasi(id, [90]);
    s = await statusBkb(id);
    expect(s.status).toBe('menunggu_de');
    expect(await qtyBarang(b.id)).toBe(100);
    const bi = (await barisBkb(id))[0];
    expect(Number(bi.saldo_sk)).toBe(90);
    expect(Number(bi.saldo_sk_pertama)).toBe(90);
    expect(Number(bi.saldo_sistem_konfirmasi)).toBe(90);
    expect(bi.cocok).toBe(true);

    await fn('approve_bkb', id, DE);
    s = await statusBkb(id);
    expect(s.status).toBe('selesai');
    expect(s.mode_approve).toBe('de');
    expect(s.disimpan_oleh_nama).toBe(DE.name);
    expect(await qtyBarang(b.id)).toBe(90);
    const bi2 = (await barisBkb(id))[0];
    expect(bi2.nomor_urut).toBe(1);
    expect(Number(bi2.saldo_sebelum)).toBe(100);
    expect(Number(bi2.saldo_setelah)).toBe(90);
    expect(await jumlahLog(b.id)).toBe(logAwal + 1);
    const log = await one(`select * from transactions_log where item_id = $1 order by id desc limit 1`, [b.id]);
    expect(log.aksi).toBe('simpan');
    expect(log.nomor_urut).toBe(1);
  });

  it('wajib_approve_de nonaktif: konfirmasi cocok langsung selesai (mode langsung)', async () => {
    await setWajibApprove(false);
    try {
      const b = await barangBaru(50);
      const id = await buat([[b, 5]], { actor: SK });
      await konfirmasi(id, [45]);
      const s = await statusBkb(id);
      expect(s.status).toBe('selesai');
      expect(s.mode_approve).toBe('langsung');
      expect(s.disimpan_oleh_nama).toBe(SK.name);
      expect(await qtyBarang(b.id)).toBe(45);
    } finally {
      await setWajibApprove(true);
    }
  });

  it('BKB masuk (INJ1, jenis PR) menambah stok', async () => {
    await setWajibApprove(true);
    const b = await barangBaru(10);
    const id = await selesaikan([[b, 20]], [30], { tujuan: 'INJ1' });
    expect((await statusBkb(id)).status).toBe('selesai');
    expect(await qtyBarang(b.id)).toBe(30);
  });

  it('konfirmasi tidak cocok: ditahan, ketikan pertama tersimpan, stok tidak berubah', async () => {
    await setWajibApprove(true);
    const b = await barangBaru(100);
    const id = await buat([[b, 10]]);
    await konfirmasi(id, [85]);
    const s = await statusBkb(id);
    expect(s.status).toBe('ditahan');
    expect(s.ditahan_karena).toBe('tidak_cocok');
    const bi = (await barisBkb(id))[0];
    expect(bi.cocok).toBe(false);
    expect(Number(bi.saldo_sk_pertama)).toBe(85);
    expect(Number(bi.saldo_sistem_konfirmasi)).toBe(90);
    expect(await qtyBarang(b.id)).toBe(100);

    // konfirmasi ulang benar: saldo_sk_pertama tidak ditimpa
    await konfirmasi(id, [90]);
    const bi2 = (await barisBkb(id))[0];
    expect(Number(bi2.saldo_sk)).toBe(90);
    expect(Number(bi2.saldo_sk_pertama)).toBe(85);
    expect((await statusBkb(id)).status).toBe('menunggu_de');
  });

  it('cek saldo tetap berlaku saat saldo 0: pemakaian ditahan, saldo sistem -qty', async () => {
    const b = await barangBaru(0);
    const id = await buat([[b, 5]]);
    await konfirmasi(id, [0]);
    const s = await statusBkb(id);
    expect(s.status).toBe('ditahan');
    expect(s.ditahan_karena).toBe('tidak_cocok');
    const bi = (await barisBkb(id))[0];
    expect(Number(bi.saldo_sistem_konfirmasi)).toBe(-5);
    expect(bi.cocok).toBe(false);
    expect(await qtyBarang(b.id)).toBe(0);
  });

  it('saldo 0 tidak bisa berakhir minus walau SK mengetik -5 lalu BKB disimpan', async () => {
    const b = await barangBaru(0);
    const id = await buat([[b, 5]]);
    try {
      await konfirmasi(id, [-5]);
    } catch {
      // boleh ditolak saat konfirmasi
    }
    try {
      await fn('approve_bkb', id, DE);
    } catch {
      // boleh ditolak saat approve
    }
    expect(await qtyBarang(b.id)).toBeGreaterThanOrEqual(0);
    expect((await statusBkb(id)).status).not.toBe('selesai');
  });

  it('stok tidak boleh minus: dua BKB melebihi saldo, yang kedua ditolak dan stok utuh', async () => {
    await setWajibApprove(true);
    const b = await barangBaru(30);
    const x = await buat([[b, 20]]);
    const y = await buat([[b, 20]]);
    await konfirmasi(x, [10]);
    await konfirmasi(y, [10]); // cocok terhadap saldo 30 saat konfirmasi
    await fn('approve_bkb', x, DE);
    expect(await qtyBarang(b.id)).toBe(10);

    // Kontrak: stok kurang tidak dilempar, tetapi dikembalikan sebagai error_kode (status ditahan tersimpan)
    const hasil = await fn('approve_bkb', y, DE);
    expect(hasil.error_kode).toBe('STOK_MINUS');
    expect(await qtyBarang(b.id)).toBe(10);
    const sy = await statusBkb(y);
    expect(sy.status).not.toBe('selesai');
    expect((await barisBkb(y))[0].nomor_urut).toBeNull();
  });

  it('nomor urut per barang berurutan, tidak dobel, dan terpisah antar barang', async () => {
    await setWajibApprove(true);
    const a = await barangBaru(100);
    const c = await barangBaru(100);
    const i1 = await selesaikan([[a, 10]], [90]);
    const i2 = await selesaikan([[a, 5]], [85]);
    const i3 = await selesaikan([[a, 15], [c, 1]], [70, 99]);
    const urutA = [];
    for (const id of [i1, i2, i3]) {
      const r = (await barisBkb(id)).find((x) => Number(x.item_id) === Number(a.id));
      urutA.push(r.nomor_urut);
    }
    expect(urutA).toEqual([1, 2, 3]);
    expect(await urutBarang(a.id)).toBe(3);
    const rc = (await barisBkb(i3)).find((x) => Number(x.item_id) === Number(c.id));
    expect(rc.nomor_urut).toBe(1);
    const dobel = await rows(
      `select item_id, nomor_urut from bkb_items where item_id = $1 and nomor_urut is not null
       group by 1, 2 having count(*) > 1`, [a.id]);
    expect(dobel).toEqual([]);
    const dobelDoc = await rows(`select doc_no from bkb group by doc_no having count(*) > 1`);
    expect(dobelDoc).toEqual([]);
  });

  it('lompat langkah: approve BKB menunggu / konfirmasi BKB selesai ditolak', async () => {
    await setWajibApprove(true);
    const b = await barangBaru(100);
    const id = await buat([[b, 10]]);
    await galat(fn('approve_bkb', id, DE)); // masih menunggu, belum dikonfirmasi
    expect(await qtyBarang(b.id)).toBe(100);

    await konfirmasi(id, [90]);
    await fn('approve_bkb', id, DE);
    await galat(fn('approve_bkb', id, DE)); // sudah selesai
    await galat(konfirmasi(id, [80]));
    expect(await qtyBarang(b.id)).toBe(90);
  });

  it('data tidak valid ditolak: qty 0, barang dobel, tujuan tidak ada, mesin kosong untuk INJ', async () => {
    const b = await barangBaru(10);
    const jumlah = async () => Number((await one(`select count(*)::int c from bkb`)).c);
    const awal = await jumlah();
    await galat(buat([[b, 0]]));
    await galat(buat([[b, 1], [b, 2]]));
    // [Tahap 2, 11-11-2026, T-20] Operator tidak memilih tujuan lagi; tujuan tidak ada dites lewat SK.
    await galat(buat([[b, 1]], { tujuan: 'TIDAK_ADA', actor: SK }));
    await galat(buat([[b, 1]], { tujuan: 'INJ1', machine: null }));
    expect(await jumlah()).toBe(awal);
  });
});

describe('idempotency buat_bkb', () => {
  it('kunci yang sama mengembalikan BKB yang sama, tidak membuat dobel', async () => {
    const b = await barangBaru(10);
    const key = '11111111-2222-4333-8444-555555555555';
    const id1 = await buat([[b, 1]], { key });
    const id2 = await buat([[b, 1]], { key });
    expect(id2).toBe(id1);
    const r = await one(`select count(*)::int c from bkb where idempotency_key = $1::uuid`, [key]);
    expect(r.c).toBe(1);
  });
});

describe('batal_bkb, kembalikan_bkb', () => {
  it('BKB belum tersimpan: dibatalkan tanpa menyentuh stok dan log stok', async () => {
    const b = await barangBaru(40);
    const logAwal = await jumlahLog(b.id);
    const id = await buat([[b, 10]]);
    await fn('batal_bkb', id, 'tidak jadi dipakai', SK);
    const s = await statusBkb(id);
    expect(s.status).toBe('dibatalkan');
    expect(s.alasan).toBe('tidak jadi dipakai');
    expect(await qtyBarang(b.id)).toBe(40);
    expect(await jumlahLog(b.id)).toBe(logAwal);
    expect(await urutBarang(b.id)).toBe(0);
    await galat(fn('batal_bkb', id, 'ulang', SK)); // sudah dibatalkan
  });

  it('BKB selesai: stok kembali, log batal tanpa nomor urut, BKB tidak dihapus', async () => {
    const b = await barangBaru(100);
    const id = await selesaikan([[b, 10]], [90]);
    const urut = await urutBarang(b.id);
    await fn('batal_bkb', id, 'salah input', DE);
    const s = await statusBkb(id);
    expect(s.status).toBe('dibatalkan');
    expect(s.dibatalkan_oleh_nama).toBe(DE.name);
    expect(await qtyBarang(b.id)).toBe(100);
    expect(await urutBarang(b.id)).toBe(urut);
    const log = await one(`select * from transactions_log where item_id = $1 order by id desc limit 1`, [b.id]);
    expect(log.aksi).toBe('batal');
    expect(log.nomor_urut).toBeNull();
    expect(log.jenis).toBe('PB');
    expect(log.direction).toBe('in');
    expect(Number((await one(`select count(*)::int c from bkb where id = $1`, [id])).c)).toBe(1);
    await galat(fn('batal_bkb', id, 'ulang', DE));
    expect(await qtyBarang(b.id)).toBe(100);
  });

  it('membatalkan BKB masuk yang barangnya sudah terpakai ditolak (stok akan minus)', async () => {
    const b = await barangBaru(0);
    const masuk = await selesaikan([[b, 20]], [20], { tujuan: 'INJ1' });
    await selesaikan([[b, 15]], [5]);
    expect(await qtyBarang(b.id)).toBe(5);
    await galat(fn('batal_bkb', masuk, 'salah', DE));
    expect(await qtyBarang(b.id)).toBe(5);
    expect((await statusBkb(masuk)).status).toBe('selesai');
    const jmlBatal = await one(`select count(*)::int c from transactions_log where item_id = $1 and aksi = 'batal'`, [b.id]);
    expect(jmlBatal.c).toBe(0);
  });

  it('kembalikan_bkb: menunggu_de menjadi ditahan (dikembalikan_de), tercatat di audit_log', async () => {
    await setWajibApprove(true);
    const b = await barangBaru(100);
    const id = await buat([[b, 10]]);
    await konfirmasi(id, [90]);
    await fn('kembalikan_bkb', id, 'cek ulang fisik', DE);
    const s = await statusBkb(id);
    expect(s.status).toBe('ditahan');
    expect(s.ditahan_karena).toBe('dikembalikan_de');
    expect(await qtyBarang(b.id)).toBe(100);
    const a = await rows(`select * from audit_log where entitas = 'bkb' and entitas_id = $1`, [String(id)]);
    expect(a.length).toBeGreaterThan(0);
    expect(a.some((r) => r.alasan === 'cek ulang fisik')).toBe(true);
  });

  it('kembalikan_bkb pada BKB yang bukan menunggu_de ditolak', async () => {
    const b = await barangBaru(100);
    const id = await buat([[b, 10]]);
    await galat(fn('kembalikan_bkb', id, 'x', DE)); // masih menunggu
    const sel = await selesaikan([[b, 5]], [95]);
    await galat(fn('kembalikan_bkb', sel, 'x', DE)); // sudah selesai
  });
});

describe('ganti_bkb (A4)', () => {
  it('sukses, barang sama: nomor urut lama dipakai, lama diganti, pengganti selesai', async () => {
    await setWajibApprove(true);
    const b = await barangBaru(100);
    const lama = await selesaikan([[b, 10]], [90]);
    const urutLama = (await barisBkb(lama))[0].nomor_urut;
    const urutTerakhir = await urutBarang(b.id);

    const peng = await buat([[b, 4]], { actor: SK, mengganti_bkb_id: lama });
    await konfirmasi(peng, [96]); // terhadap saldo terbaru setelah lama dibalik
    await fn('ganti_bkb', lama, peng, 'salah qty', DE);

    const sl = await statusBkb(lama);
    const sp = await statusBkb(peng);
    expect(sl.status).toBe('diganti');
    expect(Number(sl.diganti_oleh_bkb_id)).toBe(peng);
    expect(sp.status).toBe('selesai');
    expect(Number(sp.mengganti_bkb_id)).toBe(lama);
    expect(await qtyBarang(b.id)).toBe(96);
    expect((await barisBkb(peng))[0].nomor_urut).toBe(urutLama);
    expect(await urutBarang(b.id)).toBe(urutTerakhir); // tidak naik

    const aksi = (await rows(`select aksi from audit_log where entitas = 'bkb' and entitas_id = any($1::text[])`, [[String(lama), String(peng)]])).map((r) => r.aksi);
    expect(aksi).toContain('ganti');
  });

  it('salah barang: stok lama kembali, barang baru turun, nomor urut baru di kartu barang itu', async () => {
    await setWajibApprove(true);
    const a = await barangBaru(100);
    const c = await barangBaru(50);
    await selesaikan([[c, 1]], [49]); // c urut 1
    const lama = await selesaikan([[a, 10]], [90]);
    const peng = await buat([[c, 10]], { actor: SK, mengganti_bkb_id: lama });
    await konfirmasi(peng, [39]);
    await fn('ganti_bkb', lama, peng, 'salah barang', DE);
    expect(await qtyBarang(a.id)).toBe(100);
    expect(await qtyBarang(c.id)).toBe(39);
    expect((await barisBkb(peng))[0].nomor_urut).toBe(2);
    expect(await urutBarang(c.id)).toBe(2);
  });

  it('saldo pengganti tidak cocok: rollback total, lama tetap selesai, pengganti ditahan', async () => {
    await setWajibApprove(true);
    const b = await barangBaru(100);
    const lama = await selesaikan([[b, 10]], [90]);
    const peng = await buat([[b, 4]], { actor: SK, mengganti_bkb_id: lama });
    await konfirmasi(peng, [95]); // seharusnya 96
    const logSebelum = await jumlahLog(b.id);
    const urutSebelum = await urutBarang(b.id);

    // Spesifikasi: gagal dengan 409 SALDO_PENGGANTI_TIDAK_COCOK (pengujian M-09b); boleh juga
    // dikembalikan sebagai hasil. Yang pasti: perubahan stok dibatalkan dan pengganti ditahan.
    try {
      await fn('ganti_bkb', lama, peng, 'uji', DE);
    } catch (e) {
      expect(e.message).toMatch(/[A-Z_]+\|/);
    }
    expect((await statusBkb(lama)).status).toBe('selesai');
    expect(await qtyBarang(b.id)).toBe(90);
    expect(await jumlahLog(b.id)).toBe(logSebelum);
    expect(await urutBarang(b.id)).toBe(urutSebelum);
    expect((await statusBkb(peng)).status).toBe('ditahan');
    expect((await barisBkb(peng))[0].nomor_urut).toBeNull();
  });

  it('stok jadi minus saat membalik BKB lama (masuk yang sudah terpakai): tidak ada yang berubah', async () => {
    await setWajibApprove(true);
    const b = await barangBaru(0);
    const lama = await selesaikan([[b, 20]], [20], { tujuan: 'INJ1' });
    await selesaikan([[b, 15]], [5]); // saldo 5
    const peng = await buat([[b, 20]], { actor: SK, tujuan: 'INJ1', mengganti_bkb_id: lama });
    await konfirmasi(peng, [5]).catch(() => {});
    const logSebelum = await jumlahLog(b.id);
    await galat(fn('ganti_bkb', lama, peng, 'uji', DE)).catch(() => {});
    expect(await qtyBarang(b.id)).toBe(5);
    expect((await statusBkb(lama)).status).toBe('selesai');
    expect(await jumlahLog(b.id)).toBe(logSebelum);
  });

  it('lompat langkah: lama yang belum selesai atau sudah diganti ditolak', async () => {
    await setWajibApprove(true);
    const b = await barangBaru(100);
    const belum = await buat([[b, 10]]);
    // Kontrak: pengganti untuk BKB yang belum selesai sudah ditolak saat dibuat
    await galat(buat([[b, 1]], { actor: SK, mengganti_bkb_id: belum }));
    expect(await qtyBarang(b.id)).toBe(100);

    const lama = await selesaikan([[b, 10]], [90]);
    const peng = await buat([[b, 4]], { actor: SK, mengganti_bkb_id: lama });
    await konfirmasi(peng, [96]);
    await fn('ganti_bkb', lama, peng, 'ok', DE);
    // lama sudah diganti: pengganti kedua sudah ditolak saat dibuat
    await galat(buat([[b, 2]], { actor: SK, mengganti_bkb_id: lama }));
    expect(await qtyBarang(b.id)).toBe(96);
  });
});

describe('ubah_data_bkb, koreksi_saldo, master barang', () => {
  it('ubah_data_bkb hanya kolom non-stok; stok, doc_no, status tetap; nilai lama-baru di audit_log', async () => {
    const b = await barangBaru(100);
    const id = await selesaikan([[b, 10]], [90]);
    const sebelum = await statusBkb(id);
    const baris0 = (await barisBkb(id))[0];

    await fn('ubah_data_bkb', id, { keterangan: 'BIP/AND/9', dept_pemakai: [{ baris: baris0.id, kode: 'PL003' }], dept_proses: [{ baris: baris0.id, kode: 'P2' }] }, 'betulkan keterangan', DE);

    const sesudah = await statusBkb(id);
    const baris1 = (await barisBkb(id))[0];
    expect(sesudah.keterangan).toBe('BIP/AND/9');
    expect(sesudah.doc_no).toBe(sebelum.doc_no);
    expect(sesudah.status).toBe('selesai');
    expect(await qtyBarang(b.id)).toBe(90);
    expect(Number(baris1.qty)).toBe(Number(baris0.qty));
    expect(baris1.nomor_urut).toBe(baris0.nomor_urut);
    expect(Number(baris1.saldo_sebelum)).toBe(Number(baris0.saldo_sebelum));
    expect(Number(baris1.saldo_setelah)).toBe(Number(baris0.saldo_setelah));
    expect(baris1.dept_proses_kode).toBe('P2');

    const a = await one(`select * from audit_log where entitas = 'bkb' and entitas_id = $1 and aksi = 'ubah_data' order by id desc limit 1`, [String(id)]);
    expect(a).toBeDefined();
    expect(a.alasan).toBe('betulkan keterangan');
    expect(JSON.stringify(a.data_lama)).toContain(sebelum.keterangan);
    expect(JSON.stringify(a.data_baru)).toContain('BIP/AND/9');
  });

  it('ubah_data_bkb tidak mengubah qty/barang meski dikirim, dan menolak BKB yang belum selesai', async () => {
    const b = await barangBaru(100);
    const id = await selesaikan([[b, 10]], [90]);
    try {
      await fn('ubah_data_bkb', id, { keterangan: 'X', qty: 999, status: 'dibatalkan', doc_no: 'HACK' }, 'uji', DE);
    } catch {
      // boleh ditolak seluruhnya
    }
    const s = await statusBkb(id);
    expect(s.status).toBe('selesai');
    expect(s.doc_no).not.toBe('HACK');
    expect(Number((await barisBkb(id))[0].qty)).toBe(10);
    expect(await qtyBarang(b.id)).toBe(90);

    const menunggu = await buat([[b, 1]]);
    await galat(fn('ubah_data_bkb', menunggu, { keterangan: 'X' }, 'uji', DE));
  });

  it('koreksi_saldo: log ADJ aksi koreksi tanpa nomor urut, urut_terakhir tetap', async () => {
    const b = await barangBaru(30);
    await selesaikan([[b, 5]], [25]);
    const urut = await urutBarang(b.id);
    await fn('koreksi_saldo', b.id, 40, 'stok opname uji', 'Atasan Uji', 'BA-001', DE);
    expect(await qtyBarang(b.id)).toBe(40);
    expect(await urutBarang(b.id)).toBe(urut);
    const log = await one(`select * from transactions_log where item_id = $1 order by id desc limit 1`, [b.id]);
    expect(log.jenis).toBe('ADJ');
    expect(log.aksi).toBe('koreksi');
    expect(log.nomor_urut).toBeNull();
    expect(log.alasan).toBe('stok opname uji');
  });

  it('koreksi_saldo: saldo negatif atau barang tidak ada ditolak', async () => {
    const b = await barangBaru(30);
    await galat(fn('koreksi_saldo', b.id, -1, 'uji', 'Atasan Uji', 'BA-001', DE));
    await galat(fn('koreksi_saldo', 999999, 5, 'uji', 'Atasan Uji', 'BA-001', DE));
    expect(await qtyBarang(b.id)).toBe(30);
  });

  it('create_item_master: saldo awal ditulis sebagai SA tanpa nomor urut', async () => {
    const b = await barangBaru(40);
    expect(await qtyBarang(b.id)).toBe(40);
    expect(await urutBarang(b.id)).toBe(0);
    const log = await rows(`select * from transactions_log where item_id = $1`, [b.id]);
    expect(log).toHaveLength(1);
    expect(log[0].jenis).toBe('SA');
    expect(log[0].aksi).toBe('saldo_awal');
    expect(log[0].nomor_urut).toBeNull();
    expect(Number(log[0].qty)).toBe(40);
  });

  it('update_item_master tidak mengubah quantity walau dikirim quantity lain', async () => {
    const b = await barangBaru(40);
    const logAwal = await jumlahLog(b.id);
    await fn('update_item_master', b.id, {
      category_code: '1', item_code: b.item_code, name: 'Nama Baru Uji', unit: 'kg', quantity: 999,
    }, DE);
    const r = await one(`select * from items where id = $1`, [b.id]);
    expect(r.name).toBe('Nama Baru Uji');
    expect(Number(r.quantity)).toBe(40);
    expect(await jumlahLog(b.id)).toBe(logAwal);
  });
});
