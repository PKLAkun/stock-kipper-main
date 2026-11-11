// FILE: lib/db/parameter.js
// Repository parameter, pengaturan, dan riwayat aksi (audit_log).
// createParameterRepository(client) dipasang oleh lib/db/index.js.

import { normalPeranBuatBkb, normalPeranBuatPengganti } from '../constants/izin-bkb.js';
import { DomainError } from './supabase.js';

// Catat satu baris audit_log. Kegagalan mencatat tidak membatalkan perubahan yang sudah
// tersimpan (PostgREST tidak punya transaksi lintas tabel), hanya dicatat ke log server.
// JANGAN pernah mengisi data dengan password, PIN, atau hash.
export async function auditSafe(client, entry) {
  try {
    const { error } = await client.from('audit_log').insert({
      entitas: entry.entitas,
      entitas_id: entry.entitasId == null ? null : String(entry.entitasId),
      aksi: entry.aksi,
      data_lama: entry.dataLama ?? null,
      data_baru: entry.dataBaru ?? null,
      alasan: entry.alasan ?? null,
      actor_id: entry.actor?.id ?? null,
      actor_name: entry.actor?.name ?? null,
    });
    if (error) console.error('[audit]', error.message);
  } catch (err) {
    console.error('[audit]', err?.message || err);
  }
}

// ============================================================
//  Repository parameter, mesin, dan pengaturan
// ============================================================

export const PARAM_TABEL = {
  tujuan: { tabel: 'param_tujuan', entitas: 'param_tujuan', pakai: [['bkb', 'tujuan_kode'], ['users', 'tujuan_kode']] },
  // [Tahap 2, 11-11-2026, T-22] Tim operator (K-27), dikelola Superadmin
  tim: { tabel: 'param_tim', entitas: 'param_tim', pakai: [['users', 'tim_kode']] },
  'dept-pemakai': { tabel: 'param_dept_pemakai', entitas: 'param_dept_pemakai', pakai: [['bkb_items', 'dept_pemakai_kode']] },
  'dept-proses': { tabel: 'param_dept_proses', entitas: 'param_dept_proses', pakai: [['bkb_items', 'dept_proses_kode']] },
  jenis: { tabel: 'param_jenis', entitas: 'param_jenis', pakai: [['bkb', 'jenis_kode']] },
};

export function mapParameter(nama, row) {
  const base = {
    kode: row.kode,
    nama: row.nama,
    aktif: !!row.aktif,
    urutan: row.urutan == null ? null : Number(row.urutan),
  };
  if (nama === 'tujuan') {
    return { ...base, jenisKode: row.jenis_kode, deptPemakaiKode: row.dept_pemakai_kode || null, wajibMesin: !!row.wajib_mesin };
  }
  if (nama === 'dept-proses') return { ...base, bawaan: !!row.bawaan };
  if (nama === 'jenis') return { ...base, arah: row.arah };
  return base;
}

// camelCase -> kolom tabel (hanya kolom yang dikirim)
export function parameterKeKolom(nama, data) {
  const row = {};
  if (data.kode !== undefined) row.kode = data.kode;
  if (data.nama !== undefined) row.nama = data.nama;
  if (data.aktif !== undefined) row.aktif = data.aktif;
  if (data.urutan !== undefined) row.urutan = data.urutan;
  if (nama === 'tujuan') {
    if (data.jenisKode !== undefined) row.jenis_kode = data.jenisKode;
    if (data.deptPemakaiKode !== undefined) row.dept_pemakai_kode = data.deptPemakaiKode || null;
    if (data.wajibMesin !== undefined) row.wajib_mesin = data.wajibMesin;
  }
  if (nama === 'dept-proses' && data.bawaan !== undefined) row.bawaan = data.bawaan;
  if (nama === 'jenis' && data.arah !== undefined) row.arah = data.arah;
  return row;
}

function aksiUbah(lama, baru) {
  if (lama.aktif && baru.aktif === false) return 'nonaktifkan';
  if (!lama.aktif && baru.aktif === true) return 'aktifkan';
  return 'ubah';
}

function mapMachine(row, terkunci = false) {
  if (!row) return null;
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    active: !!row.active,
    terkunci,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function translate(err, pesanDuplikat) {
  if (err?.code === '23505') throw new DomainError(pesanDuplikat, 409);
  if (err?.code === '23503') throw new DomainError('Data yang dirujuk tidak ditemukan atau masih dipakai.', 409);
  if (/terkunci/i.test(String(err?.message || ''))) {
    throw new DomainError('Kode sudah dipakai di BKB dan tidak bisa diubah.', 409);
  }
  const e = new Error(err?.message || 'Kesalahan database');
  e.code = err?.code;
  throw e;
}

export function createParameterRepository(client) {
  async function dipakai(tabelPakai, kolom, nilai) {
    const { count, error } = await client.from(tabelPakai).select('*', { count: 'exact', head: true }).eq(kolom, nilai);
    if (error) return false;
    return Number(count || 0) > 0;
  }

  async function terkunciParameter(nama, kode) {
    const cfg = PARAM_TABEL[nama];
    for (const [tabel, kolom] of cfg.pakai) {
      if (await dipakai(tabel, kolom, kode)) return true;
    }
    return false;
  }

  async function listParameter(nama, { aktifSaja = false } = {}) {
    const cfg = PARAM_TABEL[nama];
    let q = client.from(cfg.tabel).select('*');
    if (aktifSaja) q = q.eq('aktif', true);
    const { data, error } = await q.order('urutan', { ascending: true, nullsFirst: false }).order('kode', { ascending: true });
    if (error) translate(error, 'Data duplikat.');
    const rows = (data || []).map((r) => mapParameter(nama, r));
    return Promise.all(rows.map(async (r) => ({ ...r, terkunci: await terkunciParameter(nama, r.kode) })));
  }

  async function getParameter(nama, kode) {
    const cfg = PARAM_TABEL[nama];
    const { data, error } = await client.from(cfg.tabel).select('*').eq('kode', kode).maybeSingle();
    if (error) translate(error, 'Data duplikat.');
    if (!data) return null;
    return { ...mapParameter(nama, data), terkunci: await terkunciParameter(nama, kode) };
  }

  async function bersihkanBawaan(exceptKode) {
    const { error } = await client.from('param_dept_proses').update({ bawaan: false }).eq('bawaan', true).neq('kode', exceptKode);
    if (error) translate(error, 'Data duplikat.');
  }

  async function createParameter(nama, data, actor) {
    const cfg = PARAM_TABEL[nama];
    const ts = new Date().toISOString();
    const row = { ...parameterKeKolom(nama, { aktif: true, ...data }), created_at: ts, updated_at: ts };
    if (nama === 'dept-proses' && data.bawaan) await bersihkanBawaan(data.kode);
    const { data: saved, error } = await client.from(cfg.tabel).insert(row).select().single();
    if (error) translate(error, `Kode ${data.kode} sudah dipakai.`);
    const hasil = { ...mapParameter(nama, saved), terkunci: false };
    await auditSafe(client, { entitas: cfg.entitas, entitasId: hasil.kode, aksi: 'buat', actor, dataBaru: mapParameter(nama, saved) });
    return hasil;
  }

  // Kode (dan arah untuk jenis) tidak bisa diubah kalau terkunci. Tanpa hapus: nonaktif lewat aktif:false.
  async function updateParameter(nama, kode, data, actor) {
    const cfg = PARAM_TABEL[nama];
    const lama = await getParameter(nama, kode);
    if (!lama) return null;
    if (lama.terkunci) {
      if (data.kode !== undefined && data.kode !== kode) {
        throw new DomainError('Kode terkunci: sudah dipakai di BKB.', 409);
      }
      if (nama === 'jenis' && data.arah !== undefined && data.arah !== lama.arah) {
        throw new DomainError('Arah terkunci: jenis sudah dipakai di BKB.', 409);
      }
    }
    const patch = { ...parameterKeKolom(nama, data), updated_at: new Date().toISOString() };
    const kodeBaru = patch.kode ?? kode;
    if (nama === 'dept-proses' && data.bawaan) await bersihkanBawaan(kodeBaru);
    const { data: saved, error } = await client.from(cfg.tabel).update(patch).eq('kode', kode).select().single();
    if (error) translate(error, `Kode ${data.kode} sudah dipakai.`);
    const baru = mapParameter(nama, saved);
    await auditSafe(client, {
      entitas: cfg.entitas, entitasId: kodeBaru, actor,
      aksi: aksiUbah(lama, baru),
      dataLama: (({ terkunci, ...r }) => r)(lama), dataBaru: baru,
    });
    return { ...baru, terkunci: lama.terkunci };
  }

  // ---- Mesin (tabel machines). Tidak ada hapus: nonaktif lewat active:false. ----
  async function mesinTerkunci(code) {
    return dipakai('bkb', 'machine', code);
  }

  async function listMachines() {
    const { data, error } = await client.from('machines').select('*').order('name', { ascending: true });
    if (error) translate(error, 'Kode mesin sudah ada.');
    return Promise.all((data || []).map(async (r) => mapMachine(r, await mesinTerkunci(r.code))));
  }

  async function searchMachines(q, activeOnly = true) {
    const s = String(q || '').replace(/[,()%*\\:"']/g, ' ').trim();
    let query = client.from('machines').select('*');
    if (activeOnly) query = query.eq('active', true);
    if (s) query = query.or(`code.ilike.%${s}%,name.ilike.%${s}%`);
    const { data, error } = await query.order('name', { ascending: true }).limit(20);
    if (error) translate(error, 'Kode mesin sudah ada.');
    return (data || []).map((r) => mapMachine(r));
  }

  async function getMachine(id) {
    const { data, error } = await client.from('machines').select('*').eq('id', id).maybeSingle();
    if (error) translate(error, 'Kode mesin sudah ada.');
    return data ? mapMachine(data, await mesinTerkunci(data.code)) : null;
  }

  async function createMachine(data, actor) {
    const { data: row, error } = await client.from('machines')
      .insert({ code: data.code, name: data.name, active: true })
      .select().single();
    if (error) translate(error, 'Kode mesin sudah ada.');
    const m = mapMachine(row);
    await auditSafe(client, { entitas: 'machines', entitasId: m.id, aksi: 'buat', actor, dataBaru: { code: m.code, name: m.name, active: m.active } });
    return m;
  }

  async function updateMachine(id, data, actor) {
    const lama = await getMachine(id);
    if (!lama) return null;
    if (lama.terkunci && data.code !== lama.code) {
      throw new DomainError('Kode mesin terkunci: sudah dipakai di BKB.', 409);
    }
    const { data: row, error } = await client.from('machines')
      .update({ code: data.code, name: data.name, active: data.active, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) translate(error, 'Kode mesin sudah ada.');
    const baru = mapMachine(row, lama.terkunci);
    await auditSafe(client, {
      entitas: 'machines', entitasId: id, actor,
      aksi: aksiUbah({ aktif: lama.active }, { aktif: baru.active }),
      dataLama: { code: lama.code, name: lama.name, active: lama.active },
      dataBaru: { code: baru.code, name: baru.name, active: baru.active },
    });
    return baru;
  }

  // ---- Pengaturan (app_settings) ----
  async function getPengaturan() {
    const { data, error } = await client.from('app_settings').select('key, value, updated_by_name, updated_at');
    if (error) translate(error, 'Data duplikat.');
    const byKey = Object.fromEntries((data || []).map((r) => [r.key, r]));
    const w = byKey.wajib_approve_de;
    const pb = byKey.peran_buat_bkb;
    const pp = byKey.peran_buat_pengganti;
    return {
      wajibApproveDe: w ? w.value !== false : true,
      diubahOleh: w?.updated_by_name || null,
      diubahPada: w?.updated_at || null,
      peranBuatBkb: normalPeranBuatBkb(pb?.value),
      peranBuatBkbDiubahOleh: pb?.updated_by_name || null,
      peranBuatBkbDiubahPada: pb?.updated_at || null,
      peranBuatPengganti: normalPeranBuatPengganti(pp?.value),
      peranBuatPenggantiDiubahOleh: pp?.updated_by_name || null,
      peranBuatPenggantiDiubahPada: pp?.updated_at || null,
    };
  }

  // input: { wajibApproveDe?, peranBuatBkb?, peranBuatPengganti?, alasan } (minimal satu nilai, sudah divalidasi Zod)
  async function setPengaturan({ wajibApproveDe, peranBuatBkb, peranBuatPengganti, alasan }, actor) {
    const lama = await getPengaturan();
    const ubah = [];
    if (typeof wajibApproveDe === 'boolean') ubah.push(['wajib_approve_de', wajibApproveDe, 'wajibApproveDe']);
    if (Array.isArray(peranBuatBkb)) ubah.push(['peran_buat_bkb', normalPeranBuatBkb(peranBuatBkb), 'peranBuatBkb']);
    if (Array.isArray(peranBuatPengganti)) {
      ubah.push(['peran_buat_pengganti', normalPeranBuatPengganti(peranBuatPengganti), 'peranBuatPengganti']);
    }
    for (const [key, value, nama] of ubah) {
      const { error } = await client.from('app_settings').upsert({
        key,
        value,
        updated_by_id: actor?.id ?? null,
        updated_by_name: actor?.name ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) translate(error, 'Data duplikat.');
      await auditSafe(client, {
        entitas: 'app_settings', entitasId: key, aksi: 'ubah', actor, alasan,
        dataLama: { [nama]: lama[nama] }, dataBaru: { [nama]: value },
      });
    }
    return getPengaturan();
  }

  return {
    listParameter, getParameter, createParameter, updateParameter,
    listMachines, searchMachines, getMachine, createMachine, updateMachine,
    getPengaturan, setPengaturan,
  };
}
