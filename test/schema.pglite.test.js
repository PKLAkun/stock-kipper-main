// Menjalankan supabase/schema.sql di PGlite (PostgreSQL di dalam Node) untuk
// memastikan tidak ada error sintaks dan objek utama terbentuk.
// Fitur khusus Supabase (role anon/authenticated/service_role dan realtime.send)
// dibuat tiruannya di sini. Tes ini tidak terhubung ke Supabase.

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

let db;

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

describe('schema.sql di PGlite', () => {
  it('membuat tabel utama', async () => {
    const tabel = (await rows(
      `select table_name from information_schema.tables where table_schema = 'public'`
    )).map((r) => r.table_name);
    for (const t of [
      'users', 'app_settings', 'param_jenis', 'param_dept_pemakai', 'param_dept_proses',
      'param_tujuan', 'machines', 'items', 'bkb', 'bkb_items', 'transactions_log', 'audit_log',
    ]) {
      expect(tabel, `tabel ${t}`).toContain(t);
    }
    expect(tabel).not.toContain('bkb_requests');
  });

  it('membuat fungsi utama', async () => {
    const fungsi = (await rows(
      `select routine_name from information_schema.routines where routine_schema = 'public'`
    )).map((r) => r.routine_name);
    for (const f of [
      'buat_bkb', 'betulkan_bkb', 'konfirmasi_bkb', 'approve_bkb', 'kembalikan_bkb',
      'batal_bkb', 'ganti_bkb', 'ubah_data_bkb', 'koreksi_saldo',
      'create_item_master', 'update_item_master',
    ]) {
      expect(fungsi, `fungsi ${f}`).toContain(f);
    }
  });

  it('mengisi parameter awal', async () => {
    const jenis = await rows(`select kode, arah from param_jenis order by kode`);
    expect(jenis.map((r) => `${r.kode}:${r.arah}`)).toEqual(
      ['BTL:out', 'PB:out', 'PR:in', 'RP:in', 'TRM:in']
    );
    const tujuan = await rows(`select kode, jenis_kode, aktif from param_tujuan`);
    const byKode = Object.fromEntries(tujuan.map((r) => [r.kode, r]));
    expect(byKode.BIP2?.jenis_kode).toBe('PB');
    expect(byKode.INJ1?.jenis_kode).toBe('PR');
    expect(byKode.DISTRIBUSI?.jenis_kode).toBe('BTL');
    expect(byKode.HASIL?.aktif).toBe(false);
    const setting = await rows(`select value from app_settings where key = 'wajib_approve_de'`);
    expect(setting[0]?.value).toBe(true);
  });

  it('bisa dijalankan dua kali (membangun ulang dari nol)', async () => {
    await expect(db.exec(SCHEMA)).resolves.toBeDefined();
  }, 60_000);
});

describe('logika fungsi SQL', () => {
  const DE = { id: 1, name: 'DE', role: 'admin' };
  const SK = { id: 2, name: 'SK', role: 'staff' };
  const OP = { id: 3, name: 'Op', role: 'operator' };
  const call = async (sql, ...params) => (await db.query(sql, params)).rows[0]?.r;
  const err = async (fn) => { try { await fn(); } catch (e) { return String(e.message); } return null; };
  let item;

  beforeAll(async () => {
    await db.exec(SCHEMA);
    item = await call(`select create_item_master($1::jsonb,$2::jsonb) r`,
      JSON.stringify({ category_code: '1', item_code: 'RM1', name: 'Resin', quantity: 100 }), JSON.stringify(DE));
  });

  // [Tahap 2, 11-11-2026, T-20] Tujuan operator diambil dari akunnya, jadi akun diatur ke tujuan yang dipakai tes.
  const buat = async (qty, extra = {}) => {
    if (!extra.mengganti_bkb_id) {
      await db.query(`insert into users (id, name, role, pin_hash, tujuan_kode) values ($1,'Op','operator','x',$2)
        on conflict (id) do update set tujuan_kode = excluded.tujuan_kode`, [OP.id, extra.tujuan_kode || 'BIP']);
    }
    return call(`select buat_bkb($1::jsonb,$2::jsonb) r`,
    JSON.stringify({ bkb_kategori: '1', tujuan_kode: 'BIP', bkb_date: '2026-11-08',
      items: [{ item_id: item.id, qty }], ...extra }),
    // BKB pengganti hanya dari role bukan operator (sesuai Pengaturan peran_buat_bkb)
    JSON.stringify(extra.mengganti_bkb_id ? SK : OP));
  };
  const konf = (b, saldo) => call(`select konfirmasi_bkb($1,$2::jsonb,$3::jsonb) r`, b.id,
    JSON.stringify([{ bkb_item_id: b.items[0].id, saldo_sk: saldo }]), JSON.stringify(SK));
  const saldo = async () => Number((await rows(`select quantity from items where id=$1`, [item.id]))[0].quantity);

  it('buat, konfirmasi cocok, approve: stok turun, nomor urut naik', async () => {
    const b = await buat(10);
    expect(b.doc_no).toBe('PB110-26K00001');
    expect(b.status).toBe('menunggu');
    const k = await konf(b, 90);
    expect(k.status).toBe('menunggu_de');
    const a = await call(`select approve_bkb($1,$2::jsonb) r`, b.id, JSON.stringify(DE));
    expect(a.status).toBe('selesai');
    expect(a.items[0].nomor_urut).toBe(1);
    expect(await saldo()).toBe(90);
  });

  it('idempotency_key mengembalikan BKB yang sama', async () => {
    const key = '11111111-1111-1111-1111-111111111111';
    const a = await buat(1, { idempotency_key: key });
    const b = await buat(1, { idempotency_key: key });
    expect(b.id).toBe(a.id);
  });

  it('saldo tidak cocok menahan BKB, dan mesin wajib untuk INJ', async () => {
    const b = await buat(5);
    const k = await konf(b, 1);
    expect(k.status).toBe('ditahan');
    expect(k.items[0].selisih).not.toBe(0);
    const e = await err(() => buat(1, { tujuan_kode: 'INJ1' }));
    expect(e).toMatch(/DATA_TIDAK_VALID/);
  });

  it('batal BKB selesai mengembalikan saldo, stok tidak boleh minus', async () => {
    const b = await buat(10);
    await konf(b, 80);
    await call(`select approve_bkb($1,$2::jsonb) r`, b.id, JSON.stringify(DE));
    expect(await saldo()).toBe(80);
    expect(await err(() => call(`select batal_bkb($1,'salah',$2::jsonb) r`, b.id, JSON.stringify(SK)))).toMatch(/DILARANG/);
    const x = await call(`select batal_bkb($1,'salah',$2::jsonb) r`, b.id, JSON.stringify(DE));
    expect(x.status).toBe('dibatalkan');
    expect(await saldo()).toBe(90);
  });

  it('koreksi saldo menulis ADJ tanpa nomor urut; DELETE bkb ditolak', async () => {
    const l = await call(`select koreksi_saldo($1,95,'opname','Atasan','BA-1',$2::jsonb) r`, item.id, JSON.stringify(DE));
    expect(l.jenis).toBe('ADJ');
    expect(l.nomor_urut).toBeNull();
    expect(await err(() => db.exec('delete from bkb'))).toMatch(/TIDAK_BOLEH_HAPUS/);
  });

  it('ganti BKB: barang sama memakai nomor urut lama', async () => {
    const lama = await buat(10);
    await konf(lama, 85);
    const sel = await call(`select approve_bkb($1,$2::jsonb) r`, lama.id, JSON.stringify(DE));
    const peng = await buat(20, { mengganti_bkb_id: lama.id, pihak_nama: 'SK' });
    // saldo terbaru 85; balik lama => 95; pengganti keluar 20 => 75
    const k = await konf(peng, 75);
    expect(k.status).toBe('menunggu_de');
    const g = await call(`select ganti_bkb($1,$2,'qty salah',$3::jsonb) r`, lama.id, peng.id, JSON.stringify(DE));
    expect(g.ganti_berhasil).toBe(true);
    expect(g.status).toBe('selesai');
    expect(g.items[0].nomor_urut).toBe(sel.items[0].nomor_urut);
    expect(await saldo()).toBe(75);
  });
});
