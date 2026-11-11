// FILE: lib/db/laporan.js
// Repository laporan (T-26, K-33): mutasi, rekap stok, kartu stok, stok saat ini. Hanya baca.
// Disambungkan ke getRepository() di lib/db/index.js: createLaporanRepository(client).
// Nama fungsi diawali "laporan" supaya tidak bentrok dengan repository lain yang digabung datar.

import { DomainError, translateKoreksiError, createKoreksiRepository } from './koreksi.js';

const num = (v) => (v == null ? null : Number(v));
const CHUNK = 200;
const HALAMAN = 1000;

// Tanggal hari WIB (YYYY-MM-DD) dari stempel waktu
export const hariWib = (ts) => new Date(new Date(ts).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

export function createLaporanRepository(client) {
  const koreksi = createKoreksiRepository(client);

  async function rpc(fn, args) {
    const { data, error } = await client.rpc(fn, args);
    if (error) return translateKoreksiError(error);
    return data;
  }

  async function fetchAll(buildQuery) {
    const out = [];
    for (let from = 0; ; from += HALAMAN) {
      const { data, error } = await buildQuery().range(from, from + HALAMAN - 1);
      if (error) throw new Error(error.message);
      out.push(...(data || []));
      if (!data || data.length < HALAMAN) break;
    }
    return out;
  }

  // ---------- mutasi ----------
  // f: { dari, sampai, itemId, jenis, tujuan, keterangan, shift, limit, offset }
  async function laporanMutasi(f = {}) {
    const p = {};
    if (f.dari) p.dari = f.dari;
    if (f.sampai) p.sampai = f.sampai;
    if (f.itemId != null) p.item_id = f.itemId;
    if (f.jenis) p.jenis = f.jenis;
    if (f.tujuan) p.tujuan = f.tujuan;
    if (f.keterangan) p.keterangan = f.keterangan;
    if (f.shift) p.shift = String(f.shift);
    p.limit = f.limit ?? 1000;
    p.offset = f.offset ?? 0;
    const data = await rpc('laporan_mutasi', { p });
    const rows = (data?.rows || []).map((r) => ({
      id: Number(r.id),
      tanggal: r.created_at,
      bkbId: num(r.bkb_id),
      docNo: r.doc_no || null,
      nomorUrut: num(r.nomor_urut),
      itemId: num(r.item_id),
      itemCode: r.item_code,
      itemName: r.item_name,
      jenis: r.jenis,
      aksi: r.aksi,
      keterangan: r.keterangan || null,
      tujuanKode: r.tujuan_kode || null,
      masuk: r.direction === 'in' ? Number(r.qty) : null,
      keluar: r.direction === 'out' ? Number(r.qty) : null,
      saldo: num(r.balance_after),
      petugas: r.actor_name || null,
      shift: r.shift || r.bkb_shift || null,
      alasan: r.alasan || null,
    }));
    return { rows, total: Number(data?.total || 0), limit: p.limit, offset: p.offset };
  }

  // ---------- rekap ----------
  async function laporanRekap({ dari, sampai, kategori } = {}) {
    const data = await rpc('laporan_rekap', { p_dari: dari, p_sampai: sampai, p_kategori: kategori || null });
    return (Array.isArray(data) ? data : []).map((r) => ({
      itemId: Number(r.item_id),
      kategori: r.category_code,
      kode: r.item_code,
      nama: r.name,
      unit: r.unit,
      stokMinimum: num(r.stok_minimum),
      saldoAwal: Number(r.saldo_awal),
      masuk: Number(r.masuk),
      keluar: Number(r.keluar),
      koreksi: Number(r.koreksi),
      saldoAkhir: Number(r.saldo_akhir),
      diBawahMinimum: Boolean(r.di_bawah_minimum),
    }));
  }

  // ---------- kartu stok ----------
  // Memakai ulang getKartuStok (urutan nomor urut, baris tidak berlaku ditandai). Hanya baris berlaku
  // yang ditampilkan. Kode keterangan (mis. BIP/AND/1) diambil dari BKB.
  // Mengembalikan null bila barang tidak ada.
  async function laporanKartu(itemId, { dari, sampai } = {}) {
    const { data: item, error } = await client
      .from('items')
      .select('id, category_code, item_code, name, unit, quantity')
      .eq('id', itemId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!item) return null;
    const semua = await koreksi.getKartuStok(itemId);
    if (!semua) return null;

    const berlaku = semua.filter((r) => r.berlaku).map((r) => ({ ...r, hari: hariWib(r.tanggal) }));
    const sebelum = dari ? berlaku.filter((r) => r.hari < dari) : [];
    const dalam = berlaku.filter((r) => (!dari || r.hari >= dari) && (!sampai || r.hari <= sampai));

    const bkbIds = [...new Set(dalam.map((r) => r.bkbId).filter((v) => v != null))];
    const ket = new Map();
    for (let i = 0; i < bkbIds.length; i += CHUNK) {
      const { data, error: e2 } = await client.from('bkb').select('id, keterangan').in('id', bkbIds.slice(i, i + CHUNK));
      if (e2) throw new Error(e2.message);
      for (const b of data || []) ket.set(Number(b.id), b.keterangan || null);
    }

    const saldoAwal = sebelum.length ? sebelum[sebelum.length - 1].saldoSistem : 0;
    const rows = dalam.map((r) => ({
      tanggal: r.tanggal,
      docNo: r.docNo,
      nomorUrut: r.nomorUrut,
      jenis: r.jenis,
      kodeKeterangan: r.bkbId != null ? ket.get(r.bkbId) ?? null : null,
      masuk: r.arah === 'in' ? r.qty : null,
      keluar: r.arah === 'out' ? r.qty : null,
      saldoAkhir: r.saldoSistem,
      saldoSk: r.saldoSk,
    }));
    return {
      item: { id: Number(item.id), kategori: item.category_code, kode: item.item_code, nama: item.name, unit: item.unit },
      dari: dari || null,
      sampai: sampai || null,
      saldoAwal,
      saldoAkhir: rows.length ? rows[rows.length - 1].saldoAkhir : saldoAwal,
      rows,
    };
  }

  // ---------- stok saat ini ----------
  async function laporanStok({ kategori } = {}) {
    const data = await fetchAll(() => {
      let q = client.from('items').select('id, category_code, item_code, name, unit, quantity, stok_minimum');
      if (kategori) q = q.eq('category_code', kategori);
      return q.order('item_code', { ascending: true }).order('id', { ascending: true });
    });
    return data.map((r) => {
      const saldo = Number(r.quantity);
      const min = num(r.stok_minimum);
      return {
        itemId: Number(r.id),
        kategori: r.category_code,
        kode: r.item_code,
        nama: r.name,
        unit: r.unit,
        saldo,
        stokMinimum: min,
        diBawahMinimum: min != null && saldo < min,
      };
    });
  }

  return { laporanMutasi, laporanRekap, laporanKartu, laporanStok };
}

export { DomainError };
