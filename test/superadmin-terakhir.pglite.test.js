// Trigger pengaman superadmin terakhir di schema.sql (review akhir).
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
let db;
beforeAll(async () => { db = new PGlite(); await db.exec(STUB); await db.exec(SCHEMA); }, 60_000);
afterAll(async () => { await db?.close(); });

describe('pengaman superadmin terakhir', () => {
  it('menolak menonaktifkan superadmin aktif terakhir, mengizinkan bila masih ada yang lain', async () => {
    async function tambah(n) {
      const r = await db.query(
        `insert into public.users (name, email, role, password_hash) values ($1, $2, 'superadmin', 'x') returning id`,
        [`SA${n}`, `sa${n}@x.id`],
      );
      return r.rows[0].id;
    }
    const a = await tambah(1);
    const b = await tambah(2);
    await db.query('update public.users set active = false where id = $1', [a]);
    await expect(db.query('update public.users set active = false where id = $1', [b])).rejects.toThrow(/SUPERADMIN_TERAKHIR/);
    await expect(db.query(`update public.users set role = 'admin' where id = $1`, [b])).rejects.toThrow(/SUPERADMIN_TERAKHIR/);
  });
});
