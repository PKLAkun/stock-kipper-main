// FILE: lib/db/koreksi.js
// Repository dampak, ganti BKB, ubah data BKB, koreksi saldo, kartu stok, dan riwayat aksi.
// Perubahan stok hanya lewat fungsi SQL (rpc); selebihnya query baca.
// Disambungkan ke getRepository() oleh supabase.js: createKoreksiRepository(getClient()).

import { startOfDayWib, endExclusiveWib } from './helpers.js';

// Sama bentuknya dengan DomainError di supabase.js (handleApiError mengenali lewat name).
export class DomainError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
    this.extra = extra;
  }
}

const num = (v) => (v == null ? null : Number(v));
const sameTime = (a, b) => new Date(a).getTime() === new Date(b).getTime();
// Selisih besar (P-11): |selisih| lebih dari QTY baris; tepat sama bukan besar. Satu tempat untuk diubah.
export const selisihBesar = (selisih, qty) => Math.abs(Number(selisih)) > Number(qty) + 1e-9;
const CHUNK = 200;
const HARI_7_MS = 7 * 24 * 3600 * 1000;

function actorOf(user) {
  return { id: user?.id ?? null, name: user?.name ?? null, role: user?.role ?? null };
}

// Pesan ramah untuk error SQL berformat 'KODE|...'. STOK_MINUS/STOK_KURANG membawa kode|nama|saldo|qty.
export function pesanErrorSql(msg) {
  const [code, ...rest] = String(msg || '').split('|');
  if ((code === 'STOK_MINUS' || code === 'STOK_KURANG') && rest.length >= 4) {
    const [kode, nama, saldo, qty] = rest;
    return { code, pesan: `Stok tidak cukup untuk ${kode} (${nama}). Saldo ${Number(saldo)}, diminta ${Number(qty)}.` };
  }
  return { code, pesan: rest[0] || 'Permintaan tidak dapat diproses.' };
}

// Error fungsi SQL berformat 'KODE|pesan'. Pesan setelah '|' aman ditampilkan (ditulis kita sendiri).
export function translateKoreksiError(err) {
  const msg = String(err?.message || '');
  const m = msg.match(/^([A-Z][A-Z0-9_]+)\|(.*)$/s);
  if (!m) throw err;
  const { code, pesan } = pesanErrorSql(msg);
  let status = 409;
  if (code === 'DILARANG') status = 403;
  else if (code.endsWith('_TIDAK_ADA')) status = 404;
  else if (code.endsWith('_TIDAK_VALID') || code === 'SALDO_NEGATIF') status = 400;
  throw new DomainError(pesan, status, { code });
}

export function createKoreksiRepository(client) {
  const rpc = async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) return translateKoreksiError(error);
    // ganti_bkb gagal cocok: SQL tidak melempar (status `ditahan` harus tersimpan), tapi mengembalikan error_kode.
    if (data && data.error_kode) {
      throw new DomainError(pesanErrorSql(data.error_pesan).pesan, 409, { code: data.error_kode });
    }
    return data;
  };

  async function fetchBkbItems(bkbId) {
    const { data, error } = await client
      .from('bkb_items')
      .select('item_id, qty, saldo_sk, items(item_code, name, quantity)')
      .eq('bkb_id', bkbId)
      .order('id', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function fetchBkb(id) {
    const { data, error } = await client
      .from('bkb')
      .select('id, status, updated_at, disimpan_at, mengganti_bkb_id, param_jenis(arah)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  // arah jenis BKB: out mengurangi stok, in menambah
  const arahOf = (bkb) => {
    const j = Array.isArray(bkb?.param_jenis) ? bkb.param_jenis[0] : bkb?.param_jenis;
    return j?.arah === 'in' ? 'in' : 'out';
  };
  const efek = (arah, qty) => (arah === 'in' ? Number(qty) : -Number(qty));

  // ---------- dampak ----------
  async function getDampakBkb(id, { aksi, penggantiId }) {
    const lama = await fetchBkb(id);
    if (!lama) return null;
    if (lama.status !== 'selesai') {
      throw new DomainError('Hanya BKB yang sudah tersimpan yang punya dampak ke stok.', 409);
    }
    const peringatan = [];
    const rowsLama = await fetchBkbItems(id);

    // saldo per barang: mulai dari saldo sekarang, balik BKB lama
    const baris = new Map();
    for (const r of rowsLama) {
      const saldo = Number(r.items?.quantity ?? 0);
      baris.set(Number(r.item_id), {
        itemCode: r.items?.item_code ?? null,
        itemName: r.items?.name ?? null,
        saldoSekarang: saldo,
        saldoSesudah: saldo - efek(arahOf(lama), r.qty),
      });
    }

    if (aksi === 'ganti') {
      const peng = await fetchBkb(penggantiId);
      if (!peng || Number(peng.mengganti_bkb_id) !== Number(id)) {
        throw new DomainError('BKB pengganti tidak ditemukan atau bukan pengganti BKB ini.', 404);
      }
      // Pengganti yang sudah dikonfirmasi SK selalu berstatus menunggu_de (schema.sql konfirmasi_bkb / ganti_bkb)
      if (peng.status !== 'menunggu_de') {
        throw new DomainError('BKB pengganti harus sudah dikonfirmasi SK (menunggu DE).', 409);
      }
      const arahPeng = arahOf(peng);
      for (const r of await fetchBkbItems(penggantiId)) {
        const key = Number(r.item_id);
        const cur = baris.get(key) || {
          itemCode: r.items?.item_code ?? null,
          itemName: r.items?.name ?? null,
          saldoSekarang: Number(r.items?.quantity ?? 0),
          saldoSesudah: Number(r.items?.quantity ?? 0),
        };
        cur.saldoSesudah += efek(arahPeng, r.qty);
        baris.set(key, cur);
        // peringatan hanya bila selisih saldo SK dan saldo sistem melebihi QTY baris pengganti
        if (r.saldo_sk != null && selisihBesar(Number(r.saldo_sk) - cur.saldoSesudah, r.qty)) {
          if (!peringatan.includes('selisih_besar')) peringatan.push('selisih_besar');
        }
      }
    }

    const hasil = [...baris.values()];
    if (hasil.some((b) => b.saldoSesudah < 0)) peringatan.unshift('minus');
    if (lama.disimpan_at && Date.now() - new Date(lama.disimpan_at).getTime() > HARI_7_MS) {
      peringatan.push('lebih_7_hari');
    }
    return { versi: lama.updated_at, baris: hasil, peringatan };
  }

  // ---------- ganti ----------
  async function gantiBkb(idLama, { versi, penggantiId, alasan }, actor) {
    const lama = await fetchBkb(idLama);
    if (!lama) throw new DomainError('BKB tidak ditemukan.', 404);
    if (!sameTime(lama.updated_at, versi)) {
      throw new DomainError('BKB sudah berubah sejak dialog dibuka. Buka ulang dialog konfirmasi.', 409, { code: 'VERSI_BERUBAH' });
    }
    await rpc('ganti_bkb', {
      p_id_lama: idLama,
      p_id_pengganti: penggantiId,
      p_alasan: alasan,
      p_actor: actorOf(actor),
      p_versi: versi,
    });
    return { lama: { status: 'diganti' }, pengganti: { status: 'selesai' } };
  }

  // ---------- ubah data ----------
  async function ubahDataBkb(id, data, actor) {
    const p = {};
    if (data.deptPemakai !== undefined) p.dept_pemakai = data.deptPemakai;
    if (data.deptProses !== undefined) p.dept_proses = data.deptProses;
    if (data.machine !== undefined) p.machine = data.machine;
    if (data.keteranganExtra !== undefined) p.keterangan_extra = data.keteranganExtra;
    return rpc('ubah_data_bkb', { p_id: id, p, p_alasan: data.alasan, p_actor: actorOf(actor) });
  }

  // ---------- koreksi saldo ----------
  // [Tahap 2, 11-11-2026, T-25] Dinonaktifkan: koreksi_saldo tanpa nama atasan dan nomor BA (K-32).
  // async function koreksiSaldo(itemId, { saldoBaru, alasan, bkbId }, actor) {
  //   const row = await rpc('koreksi_saldo', {
  //     p_item_id: itemId,
  //     p_saldo_baru: saldoBaru,
  //     p_alasan: alasan,
  //     p_actor: actorOf(actor),
  //     p_bkb_id: bkbId ?? null,
  //   });
  //   return { saldoSebelum: num(row?.balance_before), saldoSesudah: num(row?.balance_after) };
  // }
  // [Tahap 2, 11-11-2026, T-25] namaAtasan dan nomorBa wajib, diteruskan ke fungsi SQL.
  async function koreksiSaldo(itemId, { saldoBaru, alasan, namaAtasan, nomorBa, bkbId }, actor) {
    const row = await rpc('koreksi_saldo', {
      p_item_id: itemId,
      p_saldo_baru: saldoBaru,
      p_alasan: alasan,
      p_nama_atasan: namaAtasan,
      p_nomor_ba: nomorBa,
      p_actor: actorOf(actor),
      p_bkb_id: bkbId ?? null,
    });
    return { saldoSebelum: num(row?.balance_before), saldoSesudah: num(row?.balance_after) };
  }

  // ---------- kartu stok ----------
  async function fetchAll(buildQuery) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await buildQuery().range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  async function getKartuStok(itemId) {
    const { data: item, error: e1 } = await client.from('items').select('id').eq('id', itemId).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!item) return null;

    const logs = await fetchAll(() =>
      client
        .from('transactions_log')
        .select('id, bkb_id, jenis, aksi, nomor_urut, doc_no, qty, direction, created_at')
        .eq('item_id', itemId)
        .order('id', { ascending: true })
    );
    const bkbIds = [...new Set(logs.map((l) => l.bkb_id).filter((v) => v != null))];
    const status = new Map();
    const saldoSk = new Map();
    if (bkbIds.length) {
      for (let i = 0; i < bkbIds.length; i += CHUNK) {
        const ids = bkbIds.slice(i, i + CHUNK);
        const { data: bs, error: e2 } = await client.from('bkb').select('id, status').in('id', ids);
        if (e2) throw new Error(e2.message);
        for (const b of bs || []) status.set(Number(b.id), b.status);
        const { data: bi, error: e3 } = await client.from('bkb_items').select('bkb_id, saldo_sk').eq('item_id', itemId).in('bkb_id', ids);
        if (e3) throw new Error(e3.message);
        for (const r of bi || []) saldoSk.set(Number(r.bkb_id), num(r.saldo_sk));
      }
    }

    // berlaku: simpan hanya bila BKB masih selesai; pembatalan/penggantian (aksi batal) menetralkan
    // simpan asalnya, jadi keduanya tidak ikut hitungan ulang.
    const rows = logs.map((l) => {
      const aksi = l.aksi || (l.jenis === 'SA' ? 'saldo_awal' : l.jenis === 'ADJ' ? 'koreksi' : 'simpan');
      const st = status.get(Number(l.bkb_id));
      let berlaku = true;
      if (aksi === 'simpan') berlaku = st === 'selesai';
      else if (aksi === 'batal') berlaku = false;
      return {
        _id: Number(l.id),
        bkbId: num(l.bkb_id),
        nomorUrut: num(l.nomor_urut),
        tanggal: l.created_at,
        docNo: l.doc_no || null,
        jenis: l.jenis,
        aksi,
        qty: Number(l.qty),
        arah: l.direction,
        saldoSk: aksi === 'simpan' ? saldoSk.get(Number(l.bkb_id)) ?? null : null,
        berlaku,
        _delta: l.direction === 'in' ? Number(l.qty) : -Number(l.qty),
      };
    });

    // urut: baris bernomor urut menurut nomor urut; baris tanpa nomor disisipkan menurut waktu
    const bernomor = rows.filter((r) => r.nomorUrut != null).sort((a, b) => a.nomorUrut - b.nomorUrut || a._id - b._id);
    const tanpa = rows.filter((r) => r.nomorUrut == null).sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal) || a._id - b._id);
    const urut = [];
    let ti = 0;
    for (const b of bernomor) {
      while (ti < tanpa.length && new Date(tanpa[ti].tanggal) <= new Date(b.tanggal)) urut.push(tanpa[ti++]);
      urut.push(b);
    }
    while (ti < tanpa.length) urut.push(tanpa[ti++]);

    let saldo = 0;
    return urut.map(({ _id, _delta, ...r }) => {
      if (r.berlaku) saldo += _delta;
      return { ...r, saldoSistem: Math.round(saldo * 1000) / 1000 };
    });
  }

  // ---------- riwayat aksi ----------
  async function listAudit({ entitas, entitasId, startDate, endDate, page = 1, limit = 20 }) {
    let q = client.from('audit_log').select('*', { count: 'exact' });
    if (entitas) q = q.eq('entitas', entitas);
    if (entitasId) q = q.eq('entitas_id', String(entitasId));
    if (startDate) q = q.gte('created_at', startOfDayWib(startDate));
    if (endDate) q = q.lt('created_at', endExclusiveWib(endDate));
    const from = (page - 1) * limit;
    const { data, error, count } = await q
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + limit - 1);
    if (error) throw new Error(error.message);
    const rows = (data || []).map((r) => ({
      id: Number(r.id),
      entitas: r.entitas,
      entitasId: r.entitas_id,
      aksi: r.aksi,
      dataLama: r.data_lama ?? null,
      dataBaru: r.data_baru ?? null,
      alasan: r.alasan ?? null,
      actorId: num(r.actor_id),
      actorName: r.actor_name ?? null,
      createdAt: r.created_at,
    }));
    return { rows, total: Number(count || 0) };
  }

  return { getDampakBkb, gantiBkb, ubahDataBkb, koreksiSaldo, getKartuStok, listAudit };
}
