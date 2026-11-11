// FILE: lib/db/opname.js
// Repository Cek Stok / opname (T-24, K-31). Stok hanya berubah lewat fungsi SQL (rpc):
// simpan_opname, ajukan_opname, approve_opname, tolak_opname, batal_opname. Selebihnya query baca.
// Disambungkan ke getRepository() di lib/db/index.js: createOpnameRepository(getClient()).

import { DomainError, pesanErrorSql } from './koreksi.js';

const num = (v) => (v == null ? null : Number(v));
const LIST_SELECT = 'id, nomor, tanggal, alasan_jenis, status, catatan, dibuat_oleh_id, dibuat_oleh_nama, diajukan_at, '
  + 'disetujui_oleh_nama, disetujui_at, ditolak_oleh_nama, ditolak_at, dibatalkan_at, created_at, updated_at, opname_items(count)';
const DETAIL_SELECT = '*, opname_items(*, items(item_code, name, unit, quantity))';

function actorOf(user) {
  return { id: user?.id ?? null, name: user?.name ?? null, role: user?.role ?? null };
}

// Error fungsi SQL berformat 'KODE|pesan'. Pesan setelah '|' ditulis kita sendiri, aman ditampilkan.
// Error lain (jaringan, bug) dilempar apa adanya; handleApiError menjadikannya 500 generik.
export function translateOpnameError(err) {
  const msg = String(err?.message || '');
  const m = msg.match(/^([A-Z][A-Z0-9_]+)\|(.*)$/s);
  if (!m) throw err;
  const { code, pesan } = pesanErrorSql(msg);
  let status = 409;
  if (code === 'DILARANG' || code === 'TIDAK_BOLEH_SENDIRI') status = 403;
  else if (code.endsWith('_TIDAK_ADA')) status = 404;
  else if (code === 'DATA_TIDAK_VALID' || code === 'ANALISA_WAJIB') status = 400;
  throw new DomainError(pesan, status, { code });
}

function mapLine(l) {
  const it = l.items || {};
  const saldoSistemSaatHitung = num(l.saldo_sistem_saat_hitung);
  const saldoSekarang = it.quantity != null ? Number(it.quantity) : null;
  return {
    id: Number(l.id),
    itemId: Number(l.item_id),
    itemCode: l.item_code ?? it.item_code ?? null,
    itemName: l.item_name ?? it.name ?? null,
    unit: l.unit ?? it.unit ?? null,
    saldoSistemSaatHitung,
    saldoSekarang, // hanya dari getOpname; null dari hasil fungsi SQL
    saldoBerubah: saldoSekarang != null && saldoSistemSaatHitung != null && saldoSekarang !== saldoSistemSaatHitung,
    qtyFisik: num(l.qty_fisik),
    qty: num(l.qty),
    selisih: num(l.selisih),
    analisa: l.analisa ?? null,
    saldoSebelum: num(l.saldo_sebelum),
    saldoSetelah: num(l.saldo_setelah),
  };
}

// Baris opname (atau jsonb hasil fungsi SQL) => objek camelCase.
export function mapOpname(row) {
  if (!row) return null;
  const lines = (row.items || row.opname_items || []).map(mapLine);
  return {
    id: Number(row.id),
    nomor: row.nomor,
    tanggal: row.tanggal,
    alasanJenis: row.alasan_jenis,
    status: row.status,
    catatan: row.catatan ?? null,
    dibuatOlehId: row.dibuat_oleh_id ?? null,
    dibuatOlehNama: row.dibuat_oleh_nama ?? null,
    diajukanAt: row.diajukan_at ?? null,
    disetujuiOlehNama: row.disetujui_oleh_nama ?? null,
    disetujuiAt: row.disetujui_at ?? null,
    namaAtasan: row.nama_atasan ?? null,
    nomorBa: row.nomor_ba ?? null,
    ditolakOlehNama: row.ditolak_oleh_nama ?? null,
    catatanTolak: row.catatan_tolak ?? null,
    ditolakAt: row.ditolak_at ?? null,
    alasanBatal: row.alasan_batal ?? null,
    dibatalkanOlehNama: row.dibatalkan_oleh_nama ?? null,
    dibatalkanAt: row.dibatalkan_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: lines.sort((a, b) => a.id - b.id),
  };
}

function mapSummary(row) {
  return {
    id: Number(row.id),
    nomor: row.nomor,
    tanggal: row.tanggal,
    alasanJenis: row.alasan_jenis,
    status: row.status,
    catatan: row.catatan ?? null,
    dibuatOlehId: row.dibuat_oleh_id ?? null,
    dibuatOlehNama: row.dibuat_oleh_nama ?? null,
    diajukanAt: row.diajukan_at ?? null,
    disetujuiOlehNama: row.disetujui_oleh_nama ?? null,
    disetujuiAt: row.disetujui_at ?? null,
    ditolakOlehNama: row.ditolak_oleh_nama ?? null,
    ditolakAt: row.ditolak_at ?? null,
    dibatalkanAt: row.dibatalkan_at ?? null,
    jumlahBaris: Number(row.opname_items?.[0]?.count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// camelCase hasil Zod => kunci p (snake_case sesuai docs/database.md "Tahap 2")
export function toOpnamePayload(d, id) {
  const p = {
    alasan_jenis: d.alasanJenis,
    items: d.items.map((r) => {
      const line = { item_id: r.itemId, analisa: r.analisa ?? null };
      if (d.alasanJenis === 'opname') line.qty_fisik = r.qtyFisik;
      else line.qty = r.qty;
      return line;
    }),
  };
  if (id != null) p.id = id;
  else if (d.idempotencyKey) p.idempotency_key = d.idempotencyKey;
  if (d.tanggal) p.tanggal = d.tanggal;
  if (d.catatan !== undefined) p.catatan = d.catatan;
  return p;
}

export function createOpnameRepository(client) {
  const rpc = async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) return translateOpnameError(error);
    return mapOpname(data);
  };

  return {
    async listOpname({ status, page = 1, limit = 20 } = {}) {
      let q = client.from('opname').select(LIST_SELECT, { count: 'exact' });
      if (status) q = q.eq('status', status);
      const from = (page - 1) * limit;
      const { data, error, count } = await q
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + limit - 1);
      if (error) throw new Error(error.message);
      return { items: (data || []).map(mapSummary), total: Number(count || 0) };
    },

    // null bila tidak ada. Tiap baris membawa saldoSekarang untuk peringatan "saldo sudah berubah".
    async getOpname(id) {
      const { data, error } = await client.from('opname').select(DETAIL_SELECT).eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return mapOpname(data);
    },

    // id kosong = buat draf baru; id terisi = ubah draf atau yang ditolak
    simpanOpname(input, actor, id) {
      return rpc('simpan_opname', { p: toOpnamePayload(input, id), p_actor: actorOf(actor) });
    },
    ajukanOpname(id, actor) {
      return rpc('ajukan_opname', { p_id: id, p_actor: actorOf(actor) });
    },
    approveOpname(id, { namaAtasan, nomorBa }, actor) {
      return rpc('approve_opname', { p_id: id, p_nama_atasan: namaAtasan, p_nomor_ba: nomorBa, p_actor: actorOf(actor) });
    },
    tolakOpname(id, catatan, actor) {
      return rpc('tolak_opname', { p_id: id, p_catatan: catatan, p_actor: actorOf(actor) });
    },
    batalOpname(id, alasan, actor) {
      return rpc('batal_opname', { p_id: id, p_alasan: alasan, p_actor: actorOf(actor) });
    },
  };
}
