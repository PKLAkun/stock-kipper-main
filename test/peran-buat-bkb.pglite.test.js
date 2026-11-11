// Pengaturan peran_buat_bkb dicek di fungsi SQL buat_bkb.
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
const OP = { id: 1, name: 'Op', role: 'operator' };
const SK = { id: 2, name: 'SK', role: 'staff' };
const DE = { id: 3, name: 'DE', role: 'admin' };
let db;
let itemId;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(SCHEMA);
  const r = await db.query(`select create_item_master($1::jsonb,$2::jsonb) r`,
    [JSON.stringify({ category_code: '1', item_code: 'RM1', name: 'Resin', quantity: 100 }), JSON.stringify(DE)]);
  itemId = r.rows[0].r.id;
}, 60_000);
afterAll(async () => { await db?.close(); });

const atur = (nilai, key = 'peran_buat_bkb') => db.query(`update app_settings set value = $1::jsonb where key = $2`, [JSON.stringify(nilai), key]);
// [Tahap 2, 11-11-2026, T-20] Operator memakai tujuan dari akunnya (BIP).
const buat = async (actor, extra = {}) => {
  if (actor.role === 'operator') {
    await db.query(`insert into users (id, name, role, pin_hash, tujuan_kode) values ($1,$2,'operator','x','BIP')
      on conflict (id) do update set tujuan_kode = 'BIP'`, [actor.id, actor.name]);
  }
  return buatSql(actor, extra);
};
const buatSql = (actor, extra = {}) => db.query(`select buat_bkb($1::jsonb,$2::jsonb) r`, [JSON.stringify({
  bkb_kategori: '1', tujuan_kode: 'BIP', bkb_date: '2026-11-08', items: [{ item_id: itemId, qty: 1 }],
  ...(actor.role === 'operator' ? {} : { pihak_nama: 'Pihak' }), ...extra,
}), JSON.stringify(actor)]);

describe('peran_buat_bkb di buat_bkb', () => {
  it('bawaan: operator dan SK boleh, DE ditolak', async () => {
    await expect(buat(OP)).resolves.toBeTruthy();
    await expect(buat(SK)).resolves.toBeTruthy();
    await expect(buat(DE)).rejects.toThrow(/DILARANG/);
  });

  it('diubah ke DE saja: SK dan operator ditolak, DE boleh', async () => {
    await atur(['admin']);
    await expect(buat(SK)).rejects.toThrow(/DILARANG/);
    await expect(buat(OP)).rejects.toThrow(/DILARANG/);
    await expect(buat(DE)).resolves.toBeTruthy();
  });

  it('nilai kosong atau rusak kembali ke bawaan', async () => {
    await atur([]);
    await expect(buat(SK)).resolves.toBeTruthy();
    await expect(buat(DE)).rejects.toThrow(/DILARANG/);
  });

  it('BKB pengganti memakai pengaturan sendiri: bawaan SK, operator selalu ditolak', async () => {
    await atur(['operator', 'staff']);
    await expect(buat(OP, { mengganti_bkb_id: 1 })).rejects.toThrow(/tidak boleh membuat BKB pengganti/);
    await expect(buat(DE, { mengganti_bkb_id: 1 })).rejects.toThrow(/tidak boleh membuat BKB pengganti/);
    // SK lolos cek role; ditolak karena BKB lama belum selesai, bukan karena role
    await expect(buat(SK, { mengganti_bkb_id: 1 })).rejects.toThrow(/STATUS_TIDAK_SESUAI/);
    await atur(['operator', 'staff'], 'peran_buat_pengganti');
    await expect(buat(OP, { mengganti_bkb_id: 1 })).rejects.toThrow(/tidak boleh membuat BKB pengganti/);
  });

  it('pengganti tidak ikut pengaturan BKB biasa', async () => {
    await atur(['operator']);
    await atur(['staff'], 'peran_buat_pengganti');
    await expect(buat(SK)).rejects.toThrow(/tidak boleh membuat BKB/);
    await expect(buat(SK, { mengganti_bkb_id: 1 })).rejects.toThrow(/STATUS_TIDAK_SESUAI/);
  });
});
