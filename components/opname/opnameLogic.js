// FILE: components/opname/opnameLogic.js
// Logika murni Cek Stok (T-24): label, hak akses, selisih, validasi form, bentuk body API.
// Aturan: docs/rancangan-tahap-2.md bagian 1.3 dan 4.4.

export const ALASAN_LABEL = { opname: 'Stok opname', rusak: 'Barang rusak', hilang: 'Barang hilang' };
export const ANALISA_MIN = 10;

export const STATUS_META = {
  draf: { label: 'Draf', tone: 'slate' },
  diajukan: { label: 'Diajukan', tone: 'amber' },
  disetujui: { label: 'Disetujui', tone: 'green' },
  ditolak: { label: 'Ditolak', tone: 'red' },
  dibatalkan: { label: 'Dibatalkan', tone: 'slate' },
};
export const STATUS_FILTERS = ['', 'draf', 'diajukan', 'ditolak', 'disetujui', 'dibatalkan'];

// SK dan Superadmin membuat/mengajukan/membatalkan (P-52). DE dan Superadmin menyetujui/menolak.
export const bolehBuat = (role) => role === 'staff' || role === 'superadmin';
export const bolehSetuju = (role) => role === 'admin' || role === 'superadmin';
export const bolehLihat = (role) => role === 'staff' || role === 'admin' || role === 'superadmin';
export const statusBisaDiubah = (status) => status === 'draf' || status === 'ditolak';
export const bolehUbah = (opname, user) => Boolean(opname && user && bolehBuat(user.role) && statusBisaDiubah(opname.status));
export const bolehSetujuiIni = (opname, user) =>
  Boolean(opname && user && bolehSetuju(user.role) && opname.status === 'diajukan' && Number(opname.dibuatOlehId) !== Number(user.id));
export const pembuatSendiri = (opname, user) =>
  Boolean(opname && user && opname.status === 'diajukan' && Number(opname.dibuatOlehId) === Number(user.id));

const toNum = (s) => {
  if (s === '' || s == null) return null;
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const round3 = (n) => Math.round(n * 1000) / 1000;

// Selisih satu baris. opname: fisik - saldo sistem. rusak/hilang: -jumlah. null bila jumlah belum valid.
export function hitungSelisih(alasanJenis, saldo, jumlah) {
  const j = typeof jumlah === 'number' ? jumlah : toNum(jumlah);
  if (j == null) return null;
  if (alasanJenis === 'opname') return round3(j - Number(saldo || 0));
  return round3(-j);
}

export function barisKosong(key) {
  return { key, item: null, jumlah: '', analisa: '' };
}

// Opname dari API => state form
export function formDariOpname(o) {
  return {
    alasanJenis: o.alasanJenis,
    tanggal: o.tanggal,
    catatan: o.catatan || '',
    lines: o.items.map((l, i) => ({
      key: `l${l.id ?? i}`,
      item: { id: l.itemId, itemCode: l.itemCode, name: l.itemName, unit: l.unit, quantity: l.saldoSekarang ?? l.saldoSistemSaatHitung },
      jumlah: String(o.alasanJenis === 'opname' ? l.qtyFisik ?? '' : l.qty ?? ''),
      analisa: l.analisa || '',
    })),
  };
}

// Validasi form. mode 'draf': minimal barang dan jumlah; 'ajukan': ditambah analisa wajib bila selisih != 0.
// Balikan { errors: { umum?, [key]: { item?, jumlah?, analisa? } }, count }.
export function validasiForm(form, mode = 'draf') {
  const errors = {};
  let count = 0;
  const set = (key, field, msg) => { errors[key] = { ...errors[key], [field]: msg }; count += 1; };
  const terisi = form.lines.filter((l) => l.item || l.jumlah !== '' || l.analisa);
  if (terisi.length === 0) { errors.umum = 'Tambahkan minimal satu barang.'; count += 1; }
  const seen = new Set();
  for (const l of terisi) {
    if (!l.item) { set(l.key, 'item', 'Pilih barang.'); continue; }
    if (seen.has(l.item.id)) set(l.key, 'item', 'Barang ini sudah ada di baris lain.');
    seen.add(l.item.id);
    const j = toNum(l.jumlah);
    const label = form.alasanJenis === 'opname' ? 'Jumlah fisik' : `Jumlah ${form.alasanJenis}`;
    if (j == null) set(l.key, 'jumlah', `${label} wajib diisi.`);
    else if (j < 0) set(l.key, 'jumlah', `${label} tidak boleh minus.`);
    else if (form.alasanJenis !== 'opname' && j === 0) set(l.key, 'jumlah', 'Jumlah harus lebih dari 0.');
    else if (Math.abs(j * 1000 - Math.round(j * 1000)) > 1e-6) set(l.key, 'jumlah', 'Maksimal 3 angka di belakang koma.');
    else if (mode === 'ajukan') {
      const sel = hitungSelisih(form.alasanJenis, l.item.quantity, j);
      if (sel !== 0 && l.analisa.trim().length < ANALISA_MIN) set(l.key, 'analisa', `Analisa wajib diisi, minimal ${ANALISA_MIN} karakter, karena ada selisih.`);
    }
  }
  return { errors, count };
}

// State form => body untuk POST/PUT /api/opname. Baris kosong dibuang. Kunci idempotensi hanya untuk buat baru.
export function bodyDariForm(form, idempotencyKey) {
  const body = {
    alasanJenis: form.alasanJenis,
    tanggal: form.tanggal || undefined,
    catatan: form.catatan.trim(),
    items: form.lines.filter((l) => l.item).map((l) => {
      const j = toNum(l.jumlah);
      const row = { itemId: l.item.id };
      if (form.alasanJenis === 'opname') row.qtyFisik = j; else row.qty = j;
      if (l.analisa.trim()) row.analisa = l.analisa.trim();
      return row;
    }),
  };
  if (idempotencyKey) body.idempotencyKey = idempotencyKey;
  return body;
}

// Peringatan untuk dialog Setujui: saldo sistem sekarang beda dari saat dihitung.
export function peringatanSaldoBerubah(opname) {
  return opname.items
    .filter((l) => l.saldoBerubah)
    .map((l) => `Saldo ${l.itemCode} sekarang ${l.saldoSekarang} ${l.unit}, saat dihitung ${l.saldoSistemSaatHitung}. Yang diterapkan adalah selisih (${l.selisih > 0 ? '+' : ''}${l.selisih}), bukan jumlah fisik.`);
}

// Perkiraan dampak Setujui per barang, dan daftar barang yang akan minus.
export function dampakSetujui(opname) {
  const rows = opname.items.filter((l) => l.selisih !== 0).map((l) => {
    const sebelum = l.saldoSekarang ?? l.saldoSistemSaatHitung;
    return { kode: l.itemCode, nama: l.itemName, unit: l.unit, selisih: l.selisih, sebelum, sesudah: Math.round((sebelum + l.selisih) * 1000) / 1000 };
  });
  return { rows, minus: rows.filter((r) => r.sesudah < 0) };
}
