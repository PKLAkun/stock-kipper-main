// FILE: lib/db/items.js
// Repository master barang: daftar (dengan stok minimum dan filter status stok), detail,
// tambah, dan ubah. Saldo tidak pernah diubah dari sini: saldo awal lewat create_item_master,
// selebihnya lewat BKB atau koreksi_saldo.
// Disambungkan ke getRepository() oleh supabase.js: createItemsRepository(getClient()).

import { safeSearch } from './helpers.js';
import { DomainError, translateKoreksiError } from './koreksi.js';

const SORT = { itemCode: 'item_code', name: 'name', quantity: 'quantity', updatedAt: 'updated_at' };

export function mapItemRow(row) {
  if (!row || row.id == null) return null;
  const stokMinimum = row.stok_minimum == null ? null : Number(row.stok_minimum);
  return {
    id: Number(row.id),
    categoryCode: row.category_code,
    locationCode: row.location_code,
    itemCode: row.item_code,
    barcode: row.barcode || null,
    name: row.name,
    quantity: Number(row.quantity),
    unit: row.unit,
    stokMinimum,
    saldoProtect: stokMinimum ?? 0, // kompatibilitas dengan kode lama
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const kurang = (it) => (it.stokMinimum && it.quantity < it.stokMinimum ? it.stokMinimum - it.quantity : 0);

function matchStatus(it, status) {
  if (status === 'habis') return it.quantity <= 0;
  if (status === 'bawah_minimum') return it.quantity > 0 && kurang(it) > 0;
  return true;
}

function toPayload(data, withQuantity) {
  const p = {
    category_code: data.categoryCode,
    item_code: data.itemCode,
    barcode: data.barcode || null,
    name: data.name,
    unit: data.unit,
    stok_minimum: data.stokMinimum ?? null,
  };
  if (withQuantity) p.quantity = data.quantity ?? 0;
  return p;
}

export function createItemsRepository(client) {
  const actorOf = (u) => ({ id: u?.id ?? null, name: u?.name ?? null, role: u?.role ?? null });

  function translate(err) {
    const msg = String(err?.message || '');
    if (err?.code === '23505' || /duplicate key|items_item_code/i.test(msg)) {
      throw new DomainError('Kode/Tipe barang sudah digunakan.', 409);
    }
    return translateKoreksiError(err);
  }

  async function listItems({ search = '', categoryCode = '', sortBy = 'itemCode', sortOrder = 'asc', statusStok, page = 1, limit = 15 } = {}) {
    const s = safeSearch(search);
    const base = () => {
      let q = client.from('items').select('*', { count: 'exact' });
      if (s) q = q.or(`item_code.ilike.%${s}%,name.ilike.%${s}%`);
      if (categoryCode) q = q.eq('category_code', categoryCode);
      return q;
    };

    // filter status / urut kekurangan membandingkan dua kolom: dikerjakan di memori
    if (statusStok || sortBy === 'kekurangan') {
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await base().order('id', { ascending: true }).range(from, from + 999);
        if (error) throw new Error(error.message);
        all.push(...(data || []).map(mapItemRow));
        if (!data || data.length < 1000) break;
      }
      const rows = all.filter((it) => matchStatus(it, statusStok));
      const dir = sortOrder === 'desc' ? -1 : 1;
      rows.sort((a, b) => {
        if (sortBy === 'kekurangan') return kurang(b) - kurang(a) || a.itemCode.localeCompare(b.itemCode);
        const key = sortBy in SORT ? sortBy : 'itemCode';
        const av = a[key], bv = b[key];
        return (av < bv ? -1 : av > bv ? 1 : 0) * dir || a.id - b.id;
      });
      return { items: rows.slice((page - 1) * limit, page * limit), total: rows.length };
    }

    const { data, error, count } = await base()
      .order(SORT[sortBy] || 'item_code', { ascending: sortOrder === 'asc' })
      .order('id', { ascending: true })
      .range((page - 1) * limit, page * limit - 1);
    if (error) throw new Error(error.message);
    return { items: (data || []).map(mapItemRow), total: Number(count || 0) };
  }

  async function findItemById(id) {
    const { data, error } = await client.from('items').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return mapItemRow(data);
  }

  async function createItem(data, actor) {
    const { data: row, error } = await client.rpc('create_item_master', { p: toPayload(data, true), p_actor: actorOf(actor) });
    if (error) return translate(error);
    return mapItemRow(row);
  }

  async function updateItem(id, data, actor) {
    const { data: row, error } = await client.rpc('update_item_master', { p_id: id, p: toPayload(data, false), p_actor: actorOf(actor) });
    if (error) return translate(error);
    return mapItemRow(row); // null bila barang tidak ada
  }

  return { listItems, findItemById, createItem, updateItem };
}
