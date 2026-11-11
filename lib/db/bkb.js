// FILE: lib/db/bkb.js
// Repository BKB (T-06). Semua perubahan lewat fungsi SQL (supabase.rpc);
// JavaScript tidak menyentuh items.quantity. Dipasang oleh lib/db/supabase.js:
//   Object.assign(repo, createBkbRepository(getClient()))
//
// Kontrak SQL: buat_bkb(p, p_actor), betulkan_bkb(p_id, p, p_actor),
// konfirmasi_bkb(p_id, p_lines, p_actor), approve_bkb(p_id, p_actor),
// batal_bkb(p_id, p_alasan, p_actor), kembalikan_bkb(p_id, p_alasan, p_actor).

import { safeSearch } from './helpers.js';
import { pesanErrorSql } from './koreksi.js';

// Sengaja dibuat lokal (nama 'DomainError' yang dibaca handleApiError) supaya
// modul ini tidak impor supabase.js (hindari impor melingkar).
export class DomainError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
    this.extra = extra;
  }
}

const CODE_STATUS = {
  STATUS_TIDAK_SESUAI: 409,
  STOK_MINUS: 409,
  SALDO_PENGGANTI_TIDAK_COCOK: 409,
  BKB_TIDAK_ADA: 404,
  TIDAK_DITEMUKAN: 404,
  VERSI_BERUBAH: 409,
  DILARANG: 403,
  BARANG_TIDAK_ADA: 400,
  DATA_TIDAK_VALID: 400,
  AKUN_BELUM_DIATUR: 409,
};

// 'KODE|pesan' dari RAISE EXCEPTION => DomainError. Error lain dilempar apa adanya.
export function translateBkbRpcError(err) {
  const msg = String(err?.message || '');
  if (err?.code === '23505') {
    if (msg.includes('bkb_doc_no_uq')) throw new DomainError('No Dokumen sudah pernah diinput. Periksa kembali BKB fisiknya.', 409);
    throw new DomainError('Data duplikat.', 409);
  }
  if (err?.code === '23514') throw new DomainError('Data melanggar aturan validasi.', 400);
  if (msg.startsWith('STOK_KURANG|') || msg.startsWith('STOK_MINUS|')) {
    const [, code, name, saldo, qty] = msg.split('|');
    throw new DomainError(
      `Stok tidak cukup untuk ${code} (${name}). Saldo KS ${Number(saldo)}, diminta ${Number(qty)}.`,
      409,
      { itemCode: code, saldo: Number(saldo), qty: Number(qty) },
    );
  }
  const [code, ...rest] = msg.split('|');
  if (code === 'AKUN_BELUM_DIATUR') {
    throw new DomainError('Akun Anda belum diatur. Hubungi Superadmin.', 409, { code });
  }
  if (rest.length && CODE_STATUS[code]) {
    throw new DomainError(rest.join('|'), CODE_STATUS[code], { code });
  }
  throw err;
}

const num = (v) => (v == null ? null : Number(v));
const actorOf = (u) => ({ id: u?.id ?? null, name: u?.name ?? null, role: u?.role ?? null });

function mapLine(l) {
  return {
    id: Number(l.id),
    itemId: Number(l.item_id),
    itemCode: l.items?.item_code ?? null,
    itemName: l.items?.name ?? null,
    unit: l.items?.unit ?? null,
    qty: num(l.qty),
    deptPemakaiKode: l.dept_pemakai_kode ?? null,
    deptProsesKode: l.dept_proses_kode ?? null,
    saldoSk: num(l.saldo_sk),
    saldoSkPertama: num(l.saldo_sk_pertama),
    saldoSistemKonfirmasi: num(l.saldo_sistem_konfirmasi),
    cocok: l.cocok ?? null,
    nomorUrut: l.nomor_urut ?? null,
    saldoSebelum: num(l.saldo_sebelum),
    saldoSetelah: num(l.saldo_setelah),
  };
}

// Baris jsonb/tabel bkb => objek camelCase.
// Saldo sistem disembunyikan selama status `menunggu` (SK sedang mengetik).
export function mapBkb(row) {
  if (!row) return null;
  const hide = row.status === 'menunggu';
  const lines = (row.items || row.bkb_items || [])
    .slice().sort((a, b) => Number(a.id) - Number(b.id)).map(mapLine);
  return {
    id: Number(row.id),
    docNo: row.doc_no,
    jenisKode: row.jenis_kode,
    bkbKategori: row.bkb_kategori,
    bkbDate: row.bkb_date,
    reference: row.reference ?? '',
    tujuanKode: row.tujuan_kode,
    keteranganExtra: row.keterangan_extra,
    keterangan: row.keterangan,
    machine: row.machine ?? '',
    sumber: row.sumber,
    pihakNama: row.pihak_nama ?? null,
    pihakDept: row.pihak_dept ?? null,
    status: row.status,
    ditahanKarena: row.ditahan_karena ?? null,
    menggantiBkbId: row.mengganti_bkb_id ?? null,
    digantiOlehBkbId: row.diganti_oleh_bkb_id ?? null,
    catatanSk: row.catatan_sk ?? null,
    alasan: row.alasan ?? null,
    dibuatOlehId: row.dibuat_oleh_id ?? null,
    dibuatOlehNama: row.dibuat_oleh_nama ?? null,
    dikonfirmasiOlehNama: row.dikonfirmasi_oleh_nama ?? null,
    dikonfirmasiAt: row.dikonfirmasi_at ?? null,
    disimpanOlehNama: row.disimpan_oleh_nama ?? null,
    disimpanAt: row.disimpan_at ?? null,
    modeApprove: row.mode_approve ?? null,
    dibatalkanOlehNama: row.dibatalkan_oleh_nama ?? null,
    dibatalkanAt: row.dibatalkan_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    versi: row.updated_at, // dipakai dialog dampak
    items: lines.map((l) => (hide ? { ...l, saldoSistemKonfirmasi: null, cocok: null } : l)),
  };
}

function mapSummary(row) {
  return {
    id: Number(row.id),
    docNo: row.doc_no,
    jenisKode: row.jenis_kode,
    bkbDate: row.bkb_date,
    tujuanKode: row.tujuan_kode,
    keterangan: row.keterangan,
    status: row.status,
    ditahanKarena: row.ditahan_karena ?? null,
    sumber: row.sumber,
    dibuatOlehId: row.dibuat_oleh_id ?? null,
    dibuatOlehNama: row.dibuat_oleh_nama ?? null,
    jumlahBaris: Number(row.bkb_items?.[0]?.count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// camelCase hasil Zod => kunci p (snake_case sesuai docs/database.md)
export function toBkbPayload(d) {
  return {
    idempotency_key: d.idempotencyKey ?? null,
    bkb_kategori: d.bkbKategori,
    bkb_date: d.bkbDate,
    reference: d.reference || null,
    tujuan_kode: d.tujuanKode,
    keterangan_extra: `${d.inisial}/${d.nomorUrut}`,
    inisial: d.inisial,
    nomor_urut: d.nomorUrut,
    machine: d.machine || null,
    sumber: d.sumber ?? null,
    pihak_nama: d.pihakNama ?? null,
    pihak_dept: d.pihakDept ?? null,
    mengganti_bkb_id: d.menggantiBkbId ?? null,
    items: d.items.map((r) => ({
      item_id: r.itemId,
      qty: r.qty,
      dept_pemakai_kode: r.deptPemakaiKode ?? null,
      dept_proses_kode: r.deptProsesKode ?? null,
    })),
  };
}

export function createBkbRepository(client) {
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) {
      const e = new Error(error.message);
      e.code = error.code;
      translateBkbRpcError(e); // melempar DomainError, atau error asli bila tak dikenal
      throw e;
    }
    // Stok kurang saat simpan tidak dilempar SQL (supaya status `ditahan` tersimpan),
    // tetapi dikembalikan sebagai error_kode. Lihat docs/database.md "Kontrak fungsi SQL".
    if (data && data.error_kode) {
      throw new DomainError(pesanErrorSql(data.error_pesan).pesan, 409, { code: data.error_kode });
    }
    return data;
  }

  async function selectOne(id) {
    const { data, error } = await client
      .from('bkb')
      .select('*, bkb_items(*, items(item_code, name, unit))')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  return {
    // opts.ownerId: batasi ke BKB milik user itu (dipakai untuk operator)
    async listBkb({ status, search, tujuan, startDate, endDate, page = 1, limit = 15, ownerId } = {}) {
      let q = client
        .from('bkb')
        .select(
          'id, doc_no, jenis_kode, bkb_date, tujuan_kode, keterangan, status, ditahan_karena, sumber, '
          + 'dibuat_oleh_id, dibuat_oleh_nama, created_at, updated_at, bkb_items(count)',
          { count: 'exact' },
        );
      if (ownerId != null) q = q.eq('dibuat_oleh_id', ownerId);
      if (status) q = q.eq('status', status);
      if (tujuan) q = q.eq('tujuan_kode', tujuan);
      if (startDate) q = q.gte('bkb_date', startDate);
      if (endDate) q = q.lte('bkb_date', endDate);
      const s = safeSearch(search);
      if (s) q = q.or(`doc_no.ilike.%${s}%,keterangan.ilike.%${s}%,pihak_nama.ilike.%${s}%`);
      const from = (page - 1) * limit;
      const { data, error, count } = await q
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + limit - 1);
      if (error) throw new Error(error.message);
      return { items: (data || []).map(mapSummary), total: Number(count || 0) };
    },

    // null bila tidak ada, atau bila ownerId diberikan dan BKB milik orang lain
    async getBkb(id, { ownerId } = {}) {
      const row = await selectOne(id);
      if (!row) return null;
      if (ownerId != null && Number(row.dibuat_oleh_id) !== Number(ownerId)) return null;
      const bkb = mapBkb(row);
      // riwayat berisi dataLama/dataBaru/actorId: tidak untuk operator (ownerId terisi)
      if (ownerId != null) return bkb;
      const { data: log, error } = await client
        .from('audit_log')
        .select('id, aksi, data_lama, data_baru, alasan, actor_id, actor_name, created_at')
        .eq('entitas', 'bkb')
        .eq('entitas_id', String(id))
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw new Error(error.message);
      bkb.riwayat = (log || []).map((r) => ({
        id: Number(r.id), aksi: r.aksi, dataLama: r.data_lama, dataBaru: r.data_baru,
        alasan: r.alasan, actorId: r.actor_id, actorName: r.actor_name, createdAt: r.created_at,
      }));
      return bkb;
    },

    async createBkb(input, actor) {
      return mapBkb(await rpc('buat_bkb', { p: toBkbPayload(input), p_actor: actorOf(actor) }));
    },

    async updateBkb(id, input, actor) {
      return mapBkb(await rpc('betulkan_bkb', { p_id: id, p: toBkbPayload(input), p_actor: actorOf(actor) }));
    },

    // input: { baris: [{ itemId, saldoSk }], catatan? }
    async konfirmasiBkb(id, { baris, catatan }, actor) {
      const { data: lines, error } = await client.from('bkb_items').select('id, item_id').eq('bkb_id', id);
      if (error) throw new Error(error.message);
      if (!lines?.length) throw new DomainError('BKB tidak ditemukan.', 404);
      const byItem = new Map(lines.map((l) => [Number(l.item_id), Number(l.id)]));
      if (baris.length !== byItem.size || baris.some((b) => !byItem.has(b.itemId))) {
        throw new DomainError('Semua baris wajib diisi.', 400);
      }
      const pLines = baris.map((b) => ({ bkb_item_id: byItem.get(b.itemId), saldo_sk: b.saldoSk }));
      return mapBkb(await rpc('konfirmasi_bkb', {
        p_id: id, p_lines: pLines, p_catatan: catatan ?? null, p_actor: actorOf(actor),
      }));
    },

    async approveBkb(id, actor) {
      return mapBkb(await rpc('approve_bkb', { p_id: id, p_actor: actorOf(actor) }));
    },

    // versi (updated_at) dibandingkan SQL setelah FOR UPDATE; null = tanpa cek
    async batalBkb(id, alasan, actor, versi = null) {
      return mapBkb(await rpc('batal_bkb', {
        p_id: id, p_alasan: alasan, p_versi: versi ?? null, p_actor: actorOf(actor),
      }));
    },

    async kembalikanBkb(id, alasan, actor) {
      return mapBkb(await rpc('kembalikan_bkb', { p_id: id, p_alasan: alasan, p_actor: actorOf(actor) }));
    },

    async yangSalahBkb(id, { pilihan, catatan }, actor) {
      const r = await rpc('yang_salah_bkb', {
        p_id: id, p_pilihan: pilihan, p_catatan: catatan ?? null, p_actor: actorOf(actor),
      });
      const b = mapBkb(r);
      return { status: b.status, ditahanKarena: b.ditahanKarena };
    },
  };
}
