// FILE: lib/db/local-pglite.js
// KHUSUS RUN LOKAL (LOCAL_PGLITE=1). Tidak dipakai di Supabase/produksi.
// Meniru subset klien supabase-js (query builder PostgREST + rpc) di atas PGlite,
// supaya kode repository tidak perlu diubah. Data disimpan di folder .local-db/.
// Saat pertama dijalankan: membuat skema dari supabase/schema.sql lalu mengisi user tes dan barang contoh.

import path from 'node:path';
import { readFileSync, mkdirSync } from 'node:fs';

const G = globalThis;
G.__stokhubLocal ||= { db: null, ready: null, fk: null, fnArgs: new Map() };
const S = G.__stokhubLocal;

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

// [pre, role, nama, email, password, inisial] (Tahap 2, T-22: setiap akun punya inisial)
const DEFAULT_USERS = [
  ['ADMIN', 'superadmin', 'Superadmin Satu', 'superadmin1@stokhub.test', 'Super1-Tes2026', 'SAS'],
  ['SEED_SUPERADMIN2', 'superadmin', 'Superadmin Dua', 'superadmin2@stokhub.test', 'Super2-Tes2026', 'SAD'],
  ['SEED_DE', 'admin', 'Data Entry', 'de@stokhub.test', 'DataEntry-Tes2026', 'DEN'],
  ['SEED_SK1', 'staff', 'Stock Keeper Satu', 'sk1@stokhub.test', 'Keeper1-Tes2026', 'SKS'],
  ['SEED_SK2', 'staff', 'Stock Keeper Dua', 'sk2@stokhub.test', 'Keeper2-Tes2026', 'SKD'],
];
// [pre, nama, pin, inisial, tim_kode, tujuan_kode]: operator 1 tim TARIK (INJ2), operator 2 tim SUPLAI (BIP)
const DEFAULT_OPERATORS = [
  ['SEED_OPERATOR1', 'Operator Satu', '1111', 'OPS', 'TARIK', 'INJ2'],
  ['SEED_OPERATOR2', 'Operator Dua', '2222', 'OPD', 'SUPLAI', 'BIP'],
];
const DEFAULT_ITEMS = [
  { category_code: '1', item_code: 'RM-001', name: 'Biji Plastik PP', unit: 'KG', quantity: 500, stok_minimum: 100 },
  { category_code: '1', item_code: 'RM-002', name: 'Pewarna Merah', unit: 'KG', quantity: 40, stok_minimum: 50 },
  { category_code: '1', item_code: 'RM-003', name: 'Biji Plastik PE', unit: 'KG', quantity: 0 },
  { category_code: '4', item_code: 'BO-001', name: 'Tutup Botol 28mm', unit: 'PCS', quantity: 2000, stok_minimum: 500 },
  { category_code: '4', item_code: 'BO-002', name: 'Gelas Plastik 220ml', unit: 'PCS', quantity: 1200 },
];

async function init() {
  const { PGlite } = await import(/* webpackIgnore: true */ '@electric-sql/pglite');
  const dir = path.resolve(process.cwd(), '.local-db');
  mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.waitReady;
  const ada = await db.query(`select to_regclass('public.bkb') is not null as ada`);
  if (!ada.rows[0].ada) {
    console.log('[local-pglite] Membuat skema dari supabase/schema.sql ...');
    // Satu transaksi: kalau seed gagal, skema ikut batal dan dicoba lagi pada start berikutnya
    await db.exec('begin');
    try {
      await db.exec(SUPABASE_STUB);
      await db.exec(readFileSync(path.resolve(process.cwd(), 'supabase/schema.sql'), 'utf8'));
      await seed(db);
      await db.exec('commit');
    } catch (e) {
      await db.exec('rollback');
      throw e;
    }
    console.log('[local-pglite] Skema dan data tes siap di .local-db/');
  }
  S.db = db;
  return db;
}

async function seed(db) {
  const bcrypt = (await import('bcryptjs')).default;
  const env = process.env;
  for (const [pre, role, nama, email, pass, inisial] of DEFAULT_USERS) {
    await db.query(
      `insert into public.users (name, email, role, password_hash, inisial) values ($1, lower($2), $3, $4, $5)`,
      [env[`${pre}_NAME`] || nama, env[`${pre}_EMAIL`] || email, role, bcrypt.hashSync(env[`${pre}_PASSWORD`] || pass, 10), inisial],
    );
  }
  for (const [pre, nama, pin, inisial, tim, tujuan] of DEFAULT_OPERATORS) {
    await db.query(
      `insert into public.users (name, role, pin_hash, inisial, tim_kode, tujuan_kode) values ($1, 'operator', $2, $3, $4, $5)`,
      [env[`${pre}_NAME`] || nama, bcrypt.hashSync(env[`${pre}_PIN`] || pin, 10), inisial, tim, tujuan],
    );
  }
  const sa = (await db.query(`select id, name from public.users where role = 'superadmin' order by id limit 1`)).rows[0];
  const actor = JSON.stringify({ id: Number(sa.id), name: sa.name, role: 'superadmin' });
  for (const it of DEFAULT_ITEMS) {
    await db.query(`select public.create_item_master($1::jsonb, $2::jsonb)`, [JSON.stringify(it), actor]);
  }
}

function ready() {
  S.ready ||= init().catch((e) => { S.ready = null; throw e; });
  return S.ready;
}

// ---------- metadata ----------
async function fkMeta(db) {
  if (S.fk) return S.fk;
  const r = await db.query(`
    select tc.relname as child, a.attname as child_col, tp.relname as parent, ap.attname as parent_col
    from pg_constraint c
    join pg_class tc on tc.oid = c.conrelid join pg_namespace n on n.oid = tc.relnamespace and n.nspname = 'public'
    join pg_class tp on tp.oid = c.confrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute ap on ap.attrelid = c.confrelid and ap.attnum = c.confkey[1]
    where c.contype = 'f'`);
  S.fk = r.rows;
  return S.fk;
}

async function fnArgs(db, fn, keys) {
  const cacheKey = `${fn}|${[...keys].sort().join(',')}`;
  if (S.fnArgs.has(cacheKey)) return S.fnArgs.get(cacheKey);
  const r = await db.query(`
    select p.proargnames as names, array(select format_type(t, null) from unnest(p.proargtypes) t) as types, p.pronargdefaults as ndef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname = $1`, [fn]);
  const want = new Set(keys);
  const cocok = r.rows.find((row) => {
    const names = row.names || [];
    const wajib = names.slice(0, names.length - row.ndef);
    return [...want].every((k) => names.includes(k)) && wajib.every((k) => want.has(k));
  });
  const map = cocok ? Object.fromEntries(cocok.names.map((nm, i) => [nm, cocok.types[i]])) : null;
  S.fnArgs.set(cacheKey, map);
  return map;
}

// ---------- SQL builder ----------
const qi = (s) => `"${String(s).replace(/"/g, '""')}"`;

function splitTop(str) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function selectList(db, table, cols, alias) {
  const parts = splitTop(cols || '*');
  const out = [];
  for (const p of parts) {
    const m = p.match(/^([a-zA-Z_][\w]*)\s*\(([\s\S]*)\)$/);
    if (!m) { out.push(p === '*' ? `${alias}.*` : `${alias}.${qi(p)}`); continue; }
    const rel = m[1]; const inner = m[2];
    const fks = await fkMeta(db);
    const sub = `${alias}_${rel}`;
    const innerList = inner.trim() === 'count' ? '' : await selectList(db, rel, inner, sub);
    const toOne = fks.find((f) => f.child === table && f.parent === rel);
    const toMany = fks.find((f) => f.child === rel && f.parent === table);
    if (toOne) {
      out.push(`(select to_jsonb(x) from (select ${innerList} from public.${qi(rel)} ${sub}
        where ${sub}.${qi(toOne.parent_col)} = ${alias}.${qi(toOne.child_col)}) x) as ${qi(rel)}`);
    } else if (toMany && inner.trim() === 'count') {
      // PostgREST: rel(count) -> [{ count: n }]
      out.push(`jsonb_build_array(jsonb_build_object('count', (select count(*) from public.${qi(rel)} ${sub}
        where ${sub}.${qi(toMany.child_col)} = ${alias}.${qi(toMany.parent_col)}))) as ${qi(rel)}`);
    } else if (toMany) {
      out.push(`(select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select ${innerList} from public.${qi(rel)} ${sub}
        where ${sub}.${qi(toMany.child_col)} = ${alias}.${qi(toMany.parent_col)} order by ${sub}.id) x) as ${qi(rel)}`);
    } else {
      throw new Error(`local-pglite: relasi ${table} -> ${rel} tidak ditemukan`);
    }
  }
  return out.join(', ');
}

function serialize(v) {
  if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) return JSON.stringify(v);
  return v;
}

class Query {
  constructor(table) {
    this.table = table; this.op = 'select'; this.cols = '*'; this.opts = {};
    this.where = []; this.params = []; this.orders = []; this.lim = null; this.off = null;
    this.single = null; this.returning = false; this.payload = null; this.onConflict = null;
  }
  p(v) { this.params.push(serialize(v)); return `$${this.params.length}`; }
  select(cols = '*', opts = {}) {
    if (this.op === 'select') { this.cols = cols; this.opts = opts; } else { this.returning = true; this.cols = cols; }
    return this;
  }
  cond(col, op, v) { this.where.push(`t.${qi(col)} ${op} ${this.p(v)}`); return this; }
  eq(c, v) { if (v === null) { this.where.push(`t.${qi(c)} is null`); return this; } return this.cond(c, '=', v); }
  neq(c, v) { return this.cond(c, '<>', v); }
  gt(c, v) { return this.cond(c, '>', v); }
  gte(c, v) { return this.cond(c, '>=', v); }
  lt(c, v) { return this.cond(c, '<', v); }
  lte(c, v) { return this.cond(c, '<=', v); }
  like(c, v) { this.where.push(`t.${qi(c)}::text like ${this.p(v)}`); return this; }
  ilike(c, v) { this.where.push(`t.${qi(c)}::text ilike ${this.p(v)}`); return this; }
  is(c, v) { this.where.push(`t.${qi(c)} is ${v === null ? 'null' : v ? 'true' : 'false'}`); return this; }
  in(c, arr) {
    if (!arr || arr.length === 0) { this.where.push('false'); return this; }
    this.where.push(`t.${qi(c)}::text = any(${this.p(arr.map(String))}::text[])`); return this;
  }
  or(expr) {
    const parts = splitTop(expr).map((s) => {
      const [col, op, ...rest] = s.split('.');
      const val = rest.join('.');
      const ops = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
      if (op === 'ilike' || op === 'like') return `t.${qi(col)}::text ${op} ${this.p(val.replace(/\*/g, '%'))}`;
      if (op === 'is') return `t.${qi(col)} is ${val}`;
      if (ops[op]) return `t.${qi(col)}::text ${ops[op]} ${this.p(val)}`;
      throw new Error(`local-pglite: operator or() tidak didukung: ${op}`);
    });
    this.where.push(`(${parts.join(' or ')})`);
    return this;
  }
  order(col, { ascending = true, nullsFirst } = {}) {
    let s = `t.${qi(col)} ${ascending ? 'asc' : 'desc'}`;
    if (nullsFirst !== undefined) s += nullsFirst ? ' nulls first' : ' nulls last';
    this.orders.push(s); return this;
  }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.off = a; this.lim = b - a + 1; return this; }
  maybeSingle() { this.single = 'maybe'; return this; }
  single() { this.single = 'one'; return this; }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows, { onConflict } = {}) { this.op = 'upsert'; this.payload = rows; this.onConflict = onConflict; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }

  async run() {
    const db = await ready();
    const T = `public.${qi(this.table)}`;
    const whereSql = this.where.length ? `where ${this.where.join(' and ')}` : '';
    let rows; let count = null;

    if (this.op === 'select') {
      const list = await selectList(db, this.table, this.cols, 't');
      if (this.opts.count) {
        const c = await db.query(`select count(*)::int as n from ${T} t ${whereSql}`, this.params);
        count = c.rows[0].n;
      }
      if (this.opts.head) return { data: null, error: null, count };
      const sql = `select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as r from (select ${list} from ${T} t ${whereSql}
        ${this.orders.length ? `order by ${this.orders.join(', ')}` : ''}
        ${this.lim != null ? `limit ${Number(this.lim)}` : ''} ${this.off != null ? `offset ${Number(this.off)}` : ''}) x`;
      rows = (await db.query(sql, this.params)).rows[0].r;
    } else {
      const ret = `returning *`;
      let sql;
      if (this.op === 'insert' || this.op === 'upsert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload];
        const cols = [...new Set(list.flatMap((r) => Object.keys(r)))];
        const values = list.map((r) => `(${cols.map((c) => (c in r ? this.p(r[c]) : 'default')).join(', ')})`).join(', ');
        sql = `insert into ${T} (${cols.map(qi).join(', ')}) values ${values}`;
        if (this.op === 'upsert') {
          const key = this.onConflict || (await db.query(`select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid
            and a.attnum = any(i.indkey) where i.indrelid = $1::regclass and i.indisprimary`, [`public.${this.table}`])).rows.map((r) => r.attname).join(',');
          const upd = cols.filter((c) => !key.split(',').includes(c)).map((c) => `${qi(c)} = excluded.${qi(c)}`);
          sql += ` on conflict (${key.split(',').map((k) => qi(k.trim())).join(', ')}) do ${upd.length ? `update set ${upd.join(', ')}` : 'nothing'}`;
        }
        sql += ` ${ret}`;
      } else if (this.op === 'update') {
        const sets = Object.entries(this.payload).map(([c, v]) => `${qi(c)} = ${this.p(v)}`);
        sql = `update ${T} t set ${sets.join(', ')} ${whereSql} ${ret}`;
      } else {
        sql = `delete from ${T} t ${whereSql} ${ret}`;
      }
      const res = await db.query(`with r as (${sql}) select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) as r from r`, this.params);
      rows = res.rows[0].r;
      if (!this.returning && !this.single) return { data: null, error: null, count };
    }

    if (this.single) {
      if (rows.length > 1 || (this.single === 'one' && rows.length === 0)) {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, count };
      }
      return { data: rows[0] ?? null, error: null, count };
    }
    return { data: rows, error: null, count };
  }
  then(resolve, reject) {
    return this.run()
      .catch((e) => ({ data: null, error: { message: e.message, code: e.code, details: e.detail ?? null }, count: null }))
      .then(resolve, reject);
  }
}

async function rpc(fn, args = {}) {
  try {
    const db = await ready();
    const keys = Object.keys(args);
    const types = await fnArgs(db, fn, keys);
    if (!types) throw new Error(`local-pglite: fungsi ${fn}(${keys.join(', ')}) tidak ditemukan`);
    const params = []; const named = [];
    for (const k of keys) {
      params.push(serialize(args[k]));
      named.push(`${qi(k)} => $${params.length}::${types[k]}`);
    }
    const r = await db.query(`select to_jsonb(public.${qi(fn)}(${named.join(', ')})) as r`, params);
    return { data: r.rows[0].r, error: null };
  } catch (e) {
    return { data: null, error: { message: e.message, code: e.code, details: e.detail ?? null } };
  }
}

export function createLocalPgliteClient() {
  return { from: (table) => new Query(table), rpc };
}
