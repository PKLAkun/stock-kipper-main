import { describe, it, expect, vi } from 'vitest';
import { createOpnameRepository, translateOpnameError, toOpnamePayload, mapOpname } from './opname.js';

function fakeClient({ rows = [], count, rpc, error = null } = {}) {
  const calls = [];
  const q = {
    select(...a) { calls.push(['select', ...a]); return q; },
    eq(...a) { calls.push(['eq', ...a]); return q; },
    order(...a) { calls.push(['order', ...a]); return q; },
    range(...a) { calls.push(['range', ...a]); return q; },
    maybeSingle: async () => ({ data: rows[0] ?? null, error }),
    then: (res, rej) => Promise.resolve({ data: rows, error, count: count ?? rows.length }).then(res, rej),
  };
  return { calls, from: (t) => { calls.push(['from', t]); return q; }, rpc: rpc || vi.fn(async () => ({ data: null, error: null })) };
}

const actor = { id: 3, name: 'SK', role: 'staff', passwordHash: 'x' };
const sqlRow = {
  id: 7, nomor: 'OPN-2611-00001', tanggal: '2026-11-11', alasan_jenis: 'opname', status: 'draf',
  items: [{ id: 2, item_id: 5, item_code: 'PP-1', item_name: 'Biji PP', unit: 'kg', saldo_sistem_saat_hitung: '10.000', qty_fisik: '8', qty: null, selisih: '-2', analisa: null }],
};

describe('translateOpnameError', () => {
  const kode = (msg) => { try { translateOpnameError(new Error(msg)); } catch (e) { return e; } return null; };
  it('memetakan kode ke status HTTP', () => {
    expect(kode('STOK_MINUS|PP-1|Biji PP|3|5')).toMatchObject({ name: 'DomainError', status: 409, message: 'Stok tidak cukup untuk PP-1 (Biji PP). Saldo 3, diminta 5.' });
    expect(kode('ANALISA_WAJIB|Analisa minimal 10 karakter')).toMatchObject({ status: 400 });
    expect(kode('DATA_TIDAK_VALID|x')).toMatchObject({ status: 400 });
    expect(kode('TIDAK_BOLEH_SENDIRI|Cek Stok buatan sendiri')).toMatchObject({ status: 403, extra: { code: 'TIDAK_BOLEH_SENDIRI' } });
    expect(kode('DILARANG|Role operator')).toMatchObject({ status: 403 });
    expect(kode('OPNAME_TIDAK_ADA|Tidak ada')).toMatchObject({ status: 404 });
    expect(kode('STATUS_TIDAK_SESUAI|Berstatus disetujui')).toMatchObject({ status: 409 });
  });
  it('error tak dikenal dilempar apa adanya (tidak jadi DomainError)', () => {
    const e = kode('connection reset');
    expect(e.name).not.toBe('DomainError');
    expect(e.message).toBe('connection reset');
  });
});

describe('rpc opname', () => {
  it('simpanOpname (baru) mengirim payload snake_case dengan idempotency_key dan memetakan hasil', async () => {
    const rpc = vi.fn(async () => ({ data: sqlRow, error: null }));
    const repo = createOpnameRepository(fakeClient({ rpc }));
    const r = await repo.simpanOpname({
      idempotencyKey: 'k', tanggal: '2026-11-11', alasanJenis: 'opname', catatan: 'rak A',
      items: [{ itemId: 5, qtyFisik: 8, analisa: 'salah hitung kemarin' }],
    }, actor);
    expect(rpc).toHaveBeenCalledWith('simpan_opname', {
      p: { alasan_jenis: 'opname', idempotency_key: 'k', tanggal: '2026-11-11', catatan: 'rak A', items: [{ item_id: 5, analisa: 'salah hitung kemarin', qty_fisik: 8 }] },
      p_actor: { id: 3, name: 'SK', role: 'staff' },
    });
    expect(r).toMatchObject({ id: 7, nomor: 'OPN-2611-00001', alasanJenis: 'opname' });
    expect(r.items[0]).toMatchObject({ itemCode: 'PP-1', itemName: 'Biji PP', saldoSistemSaatHitung: 10, qtyFisik: 8, selisih: -2 });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('passwordHash');
  });
  it('simpanOpname (ubah) memakai id dan tidak mengirim idempotency_key; rusak memakai qty', () => {
    const p = toOpnamePayload({ idempotencyKey: 'k', alasanJenis: 'rusak', items: [{ itemId: 1, qty: 2 }] }, 9);
    expect(p).toEqual({ id: 9, alasan_jenis: 'rusak', items: [{ item_id: 1, analisa: null, qty: 2 }] });
  });
  it('ajukan, approve, tolak, batal memanggil fungsi SQL dengan argumen persis', async () => {
    const rpc = vi.fn(async () => ({ data: sqlRow, error: null }));
    const repo = createOpnameRepository(fakeClient({ rpc }));
    const a = { id: 3, name: 'SK', role: 'staff' };
    await repo.ajukanOpname(7, actor);
    await repo.approveOpname(7, { namaAtasan: 'Pak Budi', nomorBa: 'BA-1' }, actor);
    await repo.tolakOpname(7, 'hitung ulang', actor);
    await repo.batalOpname(7, 'salah buat', actor);
    expect(rpc.mock.calls).toEqual([
      ['ajukan_opname', { p_id: 7, p_actor: a }],
      ['approve_opname', { p_id: 7, p_nama_atasan: 'Pak Budi', p_nomor_ba: 'BA-1', p_actor: a }],
      ['tolak_opname', { p_id: 7, p_catatan: 'hitung ulang', p_actor: a }],
      ['batal_opname', { p_id: 7, p_alasan: 'salah buat', p_actor: a }],
    ]);
  });
  it('error rpc diterjemahkan, error asing tidak membocorkan pesan mentah sebagai DomainError', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'TIDAK_BOLEH_SENDIRI|Cek Stok buatan sendiri tidak boleh disetujui sendiri' } }));
    await expect(createOpnameRepository(fakeClient({ rpc })).approveOpname(1, { namaAtasan: 'a', nomorBa: 'b' }, actor))
      .rejects.toMatchObject({ name: 'DomainError', status: 403 });
    const rpc2 = vi.fn(async () => ({ data: null, error: { message: 'relation "x" does not exist' } }));
    await expect(createOpnameRepository(fakeClient({ rpc: rpc2 })).ajukanOpname(1, actor))
      .rejects.toThrow(expect.not.objectContaining({ name: 'DomainError' }));
  });
});

describe('baca', () => {
  it('listOpname: filter status, paging, peta ringkasan', async () => {
    const rows = [{ id: 1, nomor: 'OPN-2611-00001', tanggal: '2026-11-11', alasan_jenis: 'rusak', status: 'diajukan', opname_items: [{ count: 3 }], created_at: 'c', updated_at: 'u' }];
    const c = fakeClient({ rows, count: 41 });
    const r = await createOpnameRepository(c).listOpname({ status: 'diajukan', page: 2, limit: 20 });
    expect(c.calls).toContainEqual(['eq', 'status', 'diajukan']);
    expect(c.calls).toContainEqual(['range', 20, 39]);
    expect(r.total).toBe(41);
    expect(r.items[0]).toMatchObject({ id: 1, status: 'diajukan', jumlahBaris: 3, alasanJenis: 'rusak' });
  });
  it('listOpname tanpa status tidak memfilter', async () => {
    const c = fakeClient({ rows: [] });
    await createOpnameRepository(c).listOpname();
    expect(c.calls.some((x) => x[0] === 'eq')).toBe(false);
  });
  it('getOpname: saldoSekarang dan saldoBerubah; null bila tidak ada', async () => {
    const row = { id: 1, nomor: 'N', status: 'diajukan', opname_items: [
      { id: 2, item_id: 5, saldo_sistem_saat_hitung: '10', qty_fisik: '8', selisih: '-2', items: { item_code: 'A', name: 'a', unit: 'kg', quantity: '12' } },
      { id: 1, item_id: 6, saldo_sistem_saat_hitung: '4', qty_fisik: '4', selisih: '0', items: { item_code: 'B', name: 'b', unit: 'pcs', quantity: '4' } },
    ] };
    const o = await createOpnameRepository(fakeClient({ rows: [row] })).getOpname(1);
    expect(o.items.map((l) => l.itemCode)).toEqual(['B', 'A']);
    expect(o.items[1]).toMatchObject({ saldoSekarang: 12, saldoBerubah: true });
    expect(o.items[0].saldoBerubah).toBe(false);
    expect(await createOpnameRepository(fakeClient({ rows: [] })).getOpname(9)).toBeNull();
    expect(mapOpname(null)).toBeNull();
  });
  it('error baca dilempar', async () => {
    await expect(createOpnameRepository(fakeClient({ error: { message: 'boom' } })).listOpname()).rejects.toThrow('boom');
  });
});
