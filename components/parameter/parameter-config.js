// Konfigurasi 5 tab halaman Parameter (docs/ui/07-superadmin.md bagian A).
// Fungsi di sini murni (tanpa React) supaya mudah dites.

export const TABS = [
  { id: 'tujuan', label: 'Tujuan', singular: 'Tujuan', api: 'tujuan', table: 'param_tujuan' },
  { id: 'dept-pemakai', label: 'Dept Pemakai', singular: 'Dept Pemakai', api: 'dept-pemakai', table: 'param_dept_pemakai' },
  // [Tahap 2, 11-11-2026, T-22] Dinonaktifkan: Dept Proses dihapus dari form BKB (K-30).
  // { id: 'dept-proses', label: 'Dept Proses', singular: 'Dept Proses', api: 'dept-proses', table: 'param_dept_proses' },
  { id: 'mesin', label: 'Mesin', singular: 'Mesin', api: null, table: 'machines' },
  { id: 'jenis', label: 'Jenis Transaksi', singular: 'Jenis', api: 'jenis', table: 'param_jenis' },
  { id: 'tim', label: 'Tim', singular: 'Tim', api: 'tim', table: 'param_tim' },
];

export const TAB_IDS = TABS.map((t) => t.id);

export function tabValid(id) {
  return TAB_IDS.includes(id) ? id : 'tujuan';
}

function pick(r, ...keys) {
  for (const k of keys) {
    if (r && r[k] !== undefined && r[k] !== null) return r[k];
  }
  return null;
}

// Samakan bentuk baris dari API (camelCase atau snake_case) dan dari /api/machines.
export function normalisasiBaris(tabId, r) {
  if (tabId === 'mesin') {
    return {
      id: r.id,
      kode: r.code,
      nama: r.name,
      aktif: r.active !== false,
      terkunci: Boolean(r.terkunci),
    };
  }
  const arah = pick(r, 'arah');
  return {
    kode: r.kode,
    nama: r.nama,
    aktif: pick(r, 'aktif') !== false,
    terkunci: Boolean(r.terkunci),
    jenisKode: pick(r, 'jenisKode', 'jenis_kode'),
    deptPemakaiKode: pick(r, 'deptPemakaiKode', 'dept_pemakai_kode'),
    wajibMesin: Boolean(pick(r, 'wajibMesin', 'wajib_mesin')),
    arah: arah === 'masuk' ? 'in' : arah === 'keluar' ? 'out' : arah,
  };
}

export function labelArah(arah) {
  return arah === 'in' ? 'Masuk' : arah === 'out' ? 'Keluar' : '-';
}

// Body untuk POST (baru) atau PUT (ubah). Untuk PUT, kode/arah dibuang bila terkunci
// atau tidak berubah (server menolak kode/arah pada parameter terkunci).
export function susunBody(tabId, form, baris) {
  const kode = String(form.kode || '').trim().toUpperCase();
  const nama = String(form.nama || '').trim();
  if (tabId === 'mesin') {
    return { code: kode, name: nama, ...(baris ? { active: form.aktif } : {}) };
  }
  const body = { kode, nama };
  if (tabId === 'tujuan') {
    body.jenisKode = form.jenisKode;
    body.deptPemakaiKode = form.deptPemakaiKode || null;
    body.wajibMesin = Boolean(form.wajibMesin);
  }
  if (tabId === 'jenis') body.arah = form.arah;
  if (baris) {
    body.aktif = form.aktif;
    if (baris.terkunci || kode === baris.kode) delete body.kode;
    if (tabId === 'jenis' && (baris.terkunci || form.arah === baris.arah)) delete body.arah;
  }
  return body;
}

// Validasi isian; mengembalikan { kode?, nama?, jenisKode?, arah? } berisi pesan error.
export function validasi(tabId, form, baris) {
  const e = {};
  const kode = String(form.kode || '').trim();
  const nama = String(form.nama || '').trim();
  if (!baris || !baris.terkunci) {
    if (!kode) e.kode = 'Kode wajib diisi.';
    else if (kode.length > 20) e.kode = 'Kode maksimal 20 karakter.';
    else if (!/^[A-Za-z0-9-]+$/.test(kode)) e.kode = 'Kode hanya huruf, angka, dan strip.';
  }
  if (!nama) e.nama = 'Nama wajib diisi.';
  else if (nama.length < 2 || nama.length > 60) e.nama = 'Nama 2 sampai 60 karakter.';
  if (tabId === 'tujuan' && !form.jenisKode) e.jenisKode = 'Pilih jenis.';
  if (tabId === 'jenis' && !form.arah) e.arah = 'Pilih arah.';
  return e;
}

// Perubahan pada tujuan terkunci yang berdampak (Jenis, Dept bawaan, Wajib mesin).
export function perubahanBerdampak(form, baris, label) {
  if (!baris || !baris.terkunci) return [];
  const out = [];
  if ((form.jenisKode || null) !== (baris.jenisKode || null)) {
    out.push({ label: 'Jenis', sebelum: label.jenis(baris.jenisKode), sesudah: label.jenis(form.jenisKode) });
  }
  if ((form.deptPemakaiKode || null) !== (baris.deptPemakaiKode || null)) {
    out.push({ label: 'Dept pemakai bawaan', sebelum: label.dept(baris.deptPemakaiKode), sesudah: label.dept(form.deptPemakaiKode) });
  }
  if (Boolean(form.wajibMesin) !== Boolean(baris.wajibMesin)) {
    out.push({ label: 'Wajib mesin', sebelum: baris.wajibMesin ? 'Ya' : 'Tidak', sesudah: form.wajibMesin ? 'Ya' : 'Tidak' });
  }
  return out;
}
