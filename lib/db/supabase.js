// FILE: lib/db/supabase.js
// Adapter database (SATU-SATUNYA) — Supabase PostgreSQL lewat PostgREST + fungsi RPC.
// Memakai SERVICE_ROLE key: HANYA di server, tidak pernah dikirim ke browser.
// Skema ada di supabase/schema.sql. Operasi yang mengubah saldo selalu lewat RPC
// (create_bkb, create_item_master, update_item_master) agar atomik & aman dari race condition.

import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../env.js';
import { endExclusiveWib, safeSearch, startOfDayWib, todayWib } from './helpers.js';

import { createLocalPgliteClient } from './local-pglite.js';

let serverSupabase = null;

export function getClient() {
  if (serverSupabase) return serverSupabase;
  // Run lokal tanpa Supabase (lihat lib/db/local-pglite.js). Tidak aktif kecuali LOCAL_PGLITE=1.
  if (process.env.LOCAL_PGLITE === '1') {
    serverSupabase = createLocalPgliteClient();
    return serverSupabase;
  }
  const env = getEnv();
  serverSupabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serverSupabase;
}

// Error domain yang aman ditampilkan ke pengguna (status HTTP ikut dibawa)
export class DomainError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
    this.extra = extra;
  }
}

const num = (v) => (v == null ? null : Number(v));

function mapItem(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    categoryCode: row.category_code,
    locationCode: row.location_code,
    itemCode: row.item_code,
    barcode: row.barcode || null,
    name: row.name,
    quantity: Number(row.quantity),
    unit: row.unit,
    saldoProtect: Number(row.saldo_protect || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    pinHash: row.pin_hash || null,
    role: row.role,
    active: !!row.active,
    passwordVersion: Number(row.password_version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLog(row) {
  return {
    id: Number(row.id),
    bkbId: num(row.bkb_id),
    jenis: row.jenis,
    docNo: row.doc_no,
    keterangan: row.keterangan,
    machine: row.machine,
    itemId: num(row.item_id),
    itemCode: row.item_code,
    barcode: row.barcode || null,
    itemName: row.item_name,
    qty: Number(row.qty),
    direction: row.direction,
    balanceBefore: Number(row.balance_before),
    balanceAfter: Number(row.balance_after),
    deptPemakai: row.dept_pemakai,
    deptProses: row.dept_proses,
    actorId: num(row.actor_id),
    actorName: row.actor_name,
    createdAt: row.created_at,
  };
}


function unwrap(result) {
  if (result.error) {
    const err = new Error(result.error.message);
    err.code = result.error.code;
    throw err;
  }
  return result.data;
}

export function isUniqueViolation(err) {
  return err?.code === '23505';
}

// Terjemahkan error dari fungsi SQL (RAISE EXCEPTION 'KODE|pesan...') menjadi DomainError
function translateRpcError(err) {
  const msg = String(err?.message || '');
  if (err?.code === '23505') {
    if (msg.includes('bkb_doc_no_uq')) throw new DomainError('No Dokumen sudah pernah diinput. Periksa kembali BKB fisiknya.', 409);
    if (msg.includes('items_item_code_uq')) throw new DomainError('Kode/Tipe barang sudah digunakan.', 409);
    throw new DomainError('Data duplikat.', 409);
  }
  if (err?.code === '23514') {
    if (msg.includes('bkb_machine_only_for_inj')) throw new DomainError('Mesin hanya boleh diisi jika Keterangan INJ.', 400);
    throw new DomainError('Data melanggar aturan validasi.', 400);
  }
  if (msg.startsWith('STOK_KURANG|')) {
    const [, code, name, saldo, qty] = msg.split('|');
    throw new DomainError(
      `Stok tidak cukup untuk ${code} (${name}). Saldo KS ${Number(saldo)}, diminta ${Number(qty)}.`,
      409,
      { itemCode: code, saldo: Number(saldo), qty: Number(qty) }
    );
  }
  if (msg.startsWith('BARANG_TIDAK_ADA|') || msg.startsWith('DATA_TIDAK_VALID|')) {
    throw new DomainError(msg.split('|')[1], 400);
  }
  throw err;
}

// ============================================================
//  MASTER BARANG
// ============================================================

const ITEM_SORT = { name: 'name', itemCode: 'item_code', quantity: 'quantity', updatedAt: 'updated_at' };

async function listItems({ search = '', categoryCode = '', sortBy = 'itemCode', sortOrder = 'asc', page = 1, limit = 15 } = {}) {
  let query = getClient().from('items').select('*', { count: 'exact' });
  const s = safeSearch(search);
  if (s) query = query.or(`item_code.ilike.%${s}%,name.ilike.%${s}%`);
  if (categoryCode) query = query.eq('category_code', categoryCode);

  query = query
    .order(ITEM_SORT[sortBy] || 'item_code', { ascending: sortOrder === 'asc' })
    .order('id', { ascending: true })
    .range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { items: (data || []).map(mapItem), total: Number(count || 0) };
}

// Autocomplete: kode diawali dulu, lalu yang mengandung; maksimal `limit` hasil.
async function searchItems(q, limit = 8) {
  const s = safeSearch(q);
  if (!s) return [];
  const { data, error } = await getClient()
    .from('items')
    .select('*')
    .or(`item_code.ilike.%${s}%,name.ilike.%${s}%,barcode.ilike.%${s}%`)
    .order('item_code', { ascending: true })
    .limit(30);
  if (error) throw new Error(error.message);

  const lower = s.toLowerCase();
  const rank = (it) => {
    const c = it.item_code.toLowerCase();
    if (c === lower) return 0;
    if (c.startsWith(lower)) return 1;
    if (it.name.toLowerCase().startsWith(lower)) return 2;
    return 3;
  };
  return (data || []).sort((a, b) => rank(a) - rank(b)).slice(0, limit).map(mapItem);
}

// Pencocokan PERSIS kode (tidak peka huruf besar/kecil) — dipakai input Barcode Scanner.
async function findItemByCode(code) {
  const c = String(code).trim();
  if (!c) return null;
  // 1) cek barcode exact match (hasil scan)
  const { data: bd } = await getClient().from('items').select('*').eq('barcode', c).maybeSingle();
  if (bd) return mapItem(bd);
  // 2) fallback: item_code ilike
  const escaped = c.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const { data, error } = await getClient().from('items').select('*').ilike('item_code', escaped).limit(1);
  if (error) throw new Error(error.message);
  return mapItem(data?.[0]);
}

async function findItemsByIds(ids) {
  const { data, error } = await getClient().from('items').select('*').in('id', ids);
  if (error) throw new Error(error.message);
  return (data || []).map(mapItem);
}

async function findItemById(id) {
  const { data, error } = await getClient().from('items').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return mapItem(data);
}

async function createItem(data, actor) {
  // Tangani saldo_protect yang tidak ada di RPC lama — update setelah insert
  try {
    const row = unwrap(await getClient().rpc('create_item_master', { p: data, p_actor_id: actor?.id ?? null, p_actor_name: actor?.name ?? null }));
    const item = mapItem(row);
    // Set saldo_protect bila ada di payload
    if (data.saldoProtect != null && Number(data.saldoProtect) > 0) {
      await getClient().from('items').update({ saldo_protect: Number(data.saldoProtect) }).eq('id', item.id);
      item.saldoProtect = Number(data.saldoProtect);
    }
    return item;
  } catch (err) {
    return translateRpcError(err);
  }
}

async function updateItem(id, data, actor) {
  try {
    const row = unwrap(await getClient().rpc('update_item_master', { p_id: id, p: data, p_actor_id: actor?.id ?? null, p_actor_name: actor?.name ?? null }));
    if (!row || row.id == null) return null;
    // Update saldo_protect (tidak ada di fungsi RPC lama)
    if (data.saldoProtect != null) {
      await getClient().from('items').update({ saldo_protect: Number(data.saldoProtect) }).eq('id', id);
    }
    return findItemById(id);
  } catch (err) {
    return translateRpcError(err);
  }
}

async function deleteItem(id) {
  const { error, count } = await getClient().from('items').delete({ count: 'exact' }).eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new DomainError('Barang sudah dipakai di BKB sehingga tidak bisa dihapus (riwayat harus utuh).', 409);
    }
    throw new Error(error.message);
  }
  return Number(count || 0) > 0;
}

async function itemHistory(id, limit = 50) {
  const { data, error } = await getClient()
    .from('transactions_log')
    .select('*')
    .eq('item_id', id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).map(mapLog);
}

// ============================================================
//  RIWAYAT MUTASI (transactions_log)
// ============================================================


// Nomor urut berikutnya: hitung dari keterangan_extra "INISIAL/NOMOR"
// Filter: tujuan_kode = tujuan (dan opsional inisial kalau diisi)
async function nextBkbSeq(tujuan, inisial) {
  let query = getClient()
    .from('bkb')
    .select('keterangan_extra')
    .eq('tujuan_kode', tujuan);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let max = 0;
  for (const row of data || []) {
    // format: INISIAL/NOMOR atau langsung NOMOR
    const parts = (row.keterangan_extra || '').split('/');
    const last = parts[parts.length - 1];
    const n = parseInt(last, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max + 1;
}


async function recentActivity(limit = 8) {
  const { data, error } = await getClient()
    .from('transactions_log')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).map(mapLog);
}

async function listActivities({ userId = '', jenis = '', startDate = '', endDate = '', search = '', page = 1, limit = 20 } = {}) {
  let query = getClient().from('transactions_log').select('*', { count: 'exact' });

  if (userId) query = query.eq('actor_id', Number(userId));
  if (jenis) query = query.eq('jenis', jenis);
  if (startDate) query = query.gte('created_at', startOfDayWib(startDate));
  if (endDate) query = query.lt('created_at', endExclusiveWib(endDate));
  const s = safeSearch(search);
  if (s) query = query.or(`doc_no.ilike.%${s}%,item_code.ilike.%${s}%,item_name.ilike.%${s}%,actor_name.ilike.%${s}%,machine.ilike.%${s}%`);

  query = query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const usersRes = await getClient().from('users').select('id, name, email').order('name');
  if (usersRes.error) throw new Error(usersRes.error.message);
  const users = (usersRes.data || []).map((u) => ({ id: Number(u.id), name: u.name, email: u.email }));

  return { items: (data || []).map(mapLog), total: Number(count || 0), users };
}

// ============================================================
//  DASHBOARD
// ============================================================

async function head(table, apply) {
  let q = getClient().from(table).select('id', { count: 'exact', head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return Number(count || 0);
}

async function dashboardCounts() {
  const [totalItems, rawCount, finishedCount, emptyCount, bkbToday] = await Promise.all([
    head('items'),
    head('items', (q) => q.eq('category_code', '1')),
    head('items', (q) => q.eq('category_code', '4')),
    head('items', (q) => q.eq('quantity', 0)),
    head('bkb', (q) => q.eq('bkb_date', todayWib())),
  ]);
  return { totalItems, rawCount, finishedCount, emptyCount, bkbToday };
}

// barang dengan saldo habis / terendah
async function lowestBalanceItems(limit = 6) {
  const { data, error } = await getClient()
    .from('items')
    .select('*')
    .order('quantity', { ascending: true })
    .order('item_code', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).map(mapItem);
}

export function getSupabaseRepository() {
  return {
    listItems, searchItems, findItemByCode, findItemsByIds, findItemById,
    createItem, updateItem, deleteItem, itemHistory,
    nextBkbSeq,
    recentActivity, listActivities, dashboardCounts, lowestBalanceItems,
    isUniqueViolation,
    // Mesin
    // Dept Proses
    listDeptProses,
    // Operator login
    findOperatorByNameAndPin, listOperators,
  };
}

// ============================================================
//  DEPT PROSES (dari DB)
// ============================================================

async function listDeptProses() {
  const { data, error } = await getClient()
    .from('param_dept_proses').select('kode, nama').eq('aktif', true).order('urutan', { ascending: true });
  if (error) return null; // fallback ke constants kalau tabel belum ada
  return (data || []).map((d) => ({ code: d.kode, name: d.nama }));
}

// Login Operator: cari operator by name + verifikasi PIN
async function findOperatorByNameAndPin(name, pin) {
  const bcrypt = await import('bcryptjs');
  const { data, error } = await getClient()
    .from('users')
    .select('*')
    .eq('role', 'operator')
    .eq('active', true)
    .ilike('name', name.trim())
    .limit(5);
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    if (!row.pin_hash) continue;
    const match = await bcrypt.default.compare(String(pin), row.pin_hash);
    if (match) return mapUser(row);
  }
  return null;
}

async function listOperators() {
  const { data, error } = await getClient()
    .from('users')
    .select('id, name, role')
    .eq('role', 'operator')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({ id: Number(r.id), name: r.name, role: r.role }));
}

