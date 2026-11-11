import { describe, it, expect, vi } from 'vitest';
import { createKoreksiRepository, translateKoreksiError, selisihBesar } from './koreksi.js';

// client palsu: from(tabel) -> query yang bisa di-await; rpc dicatat
function fakeClient({ tables = {}, rpc } = {}) {
  const from = (name) => {
    const q = {
      _rows: tables[name] || [],
      select() { return q; }, eq() { return q; }, in() { return q; }, order() { return q; },
      gte() { return q; }, lt() { return q; },
      range() { return q; },
      maybeSingle: async () => ({ data: Array.isArray(q._rows) ? q._rows[0] ?? null : q._rows, error: null }),
      then: (res, rej) => Promise.resolve({ data: q._rows, error: null, count: q._rows.length }).then(res, rej),
    };
    return q;
  };
  return { from, rpc: rpc || vi.fn(async () => ({ data: null, error: null })) };
}

describe('translateKoreksiError', () => {
  it('KODE|pesan -> DomainError dengan status menurut kode', () => {
    expect(() => translateKoreksiError(new Error('SALDO_PENGGANTI_TIDAK_COCOK|Saldo tidak cocok'))).toThrow(expect.objectContaining({ name: 'DomainError', status: 409, message: 'Saldo tidak cocok' }));
    expect(() => translateKoreksiError(new Error('BKB_TIDAK_ADA|Tidak ada'))).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => translateKoreksiError(new Error('SALDO_NEGATIF|Negatif'))).toThrow(expect.objectContaining({ status: 400 }));
  });
  it('error lain dilempar apa adanya', () => {
    expect(() => translateKoreksiError(new Error('connection reset'))).toThrow('connection reset');
  });
});

describe('koreksiSaldo & ubahDataBkb', () => {
  it('koreksiSaldo memanggil rpc dengan p_actor dan memetakan hasil', async () => {
    const rpc = vi.fn(async () => ({ data: { balance_before: '10', balance_after: '7.5' }, error: null }));
    const repo = createKoreksiRepository(fakeClient({ rpc }));
    const r = await repo.koreksiSaldo(4, { saldoBaru: 7.5, alasan: 'opname', namaAtasan: 'Pak Budi', nomorBa: 'BA-1' }, { id: 1, name: 'DE', role: 'admin', passwordHash: 'x' });
    expect(r).toEqual({ saldoSebelum: 10, saldoSesudah: 7.5 });
    expect(rpc).toHaveBeenCalledWith('koreksi_saldo', { p_item_id: 4, p_saldo_baru: 7.5, p_alasan: 'opname', p_nama_atasan: 'Pak Budi', p_nomor_ba: 'BA-1', p_actor: { id: 1, name: 'DE', role: 'admin' }, p_bkb_id: null });
  });
  it('koreksiSaldo meneruskan bkbId', async () => {
    const rpc = vi.fn(async () => ({ data: { balance_before: 1, balance_after: 2 }, error: null }));
    await createKoreksiRepository(fakeClient({ rpc })).koreksiSaldo(4, { saldoBaru: 2, alasan: 'opname', namaAtasan: 'X', nomorBa: 'Y', bkbId: 77 }, {});
    expect(rpc.mock.calls[0][1].p_bkb_id).toBe(77);
  });
  it('ubahDataBkb memakai kunci snake_case', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 1 }, error: null }));
    const repo = createKoreksiRepository(fakeClient({ rpc }));
    await repo.ubahDataBkb(1, { machine: null, keteranganExtra: 'AND/2', alasan: 'koreksi' }, { id: 1, name: 'DE', role: 'admin' });
    expect(rpc.mock.calls[0][1].p).toEqual({ machine: null, keterangan_extra: 'AND/2' });
  });
  it('error rpc diterjemahkan', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'STATUS_TIDAK_SESUAI|BKB belum selesai' } }));
    const repo = createKoreksiRepository(fakeClient({ rpc }));
    await expect(repo.ubahDataBkb(1, { machine: 'M' , alasan: 'x'}, {})).rejects.toMatchObject({ status: 409, message: 'BKB belum selesai' });
  });
});

describe('gantiBkb', () => {
  const lama = { id: 5, status: 'selesai', updated_at: '2026-11-08T01:00:00+00:00' };
  it('versi berubah -> 409 tanpa memanggil rpc', async () => {
    const c = fakeClient({ tables: { bkb: [lama] } });
    const repo = createKoreksiRepository(c);
    await expect(repo.gantiBkb(5, { versi: '2026-11-08T02:00:00Z', penggantiId: 9, alasan: 'x' }, {})).rejects.toMatchObject({ status: 409 });
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it('versi sama (format waktu beda) -> rpc ganti_bkb', async () => {
    const c = fakeClient({ tables: { bkb: [lama] } });
    const repo = createKoreksiRepository(c);
    const r = await repo.gantiBkb(5, { versi: '2026-11-08T01:00:00Z', penggantiId: 9, alasan: 'salah' }, { id: 1, name: 'DE', role: 'admin' });
    expect(r.lama.status).toBe('diganti');
    expect(c.rpc).toHaveBeenCalledWith('ganti_bkb', expect.objectContaining({ p_id_lama: 5, p_id_pengganti: 9, p_versi: '2026-11-08T01:00:00Z' }));
  });
});

describe('getKartuStok', () => {
  it('urut menurut nomor urut, koreksi disisipkan menurut waktu, saldo dihitung ulang tanpa baris tak berlaku', async () => {
    const tables = {
      items: [{ id: 1 }],
      transactions_log: [
        { id: 1, bkb_id: null, jenis: 'SA', aksi: 'saldo_awal', nomor_urut: null, doc_no: null, qty: 100, direction: 'in', created_at: '2026-11-01T00:00:00Z' },
        { id: 2, bkb_id: 10, jenis: 'PB', aksi: 'simpan', nomor_urut: 1, doc_no: 'PB1', qty: 30, direction: 'out', created_at: '2026-11-02T00:00:00Z' },
        { id: 3, bkb_id: 10, jenis: 'PB', aksi: 'batal', nomor_urut: null, doc_no: 'PB1', qty: 30, direction: 'in', created_at: '2026-11-03T00:00:00Z' },
        { id: 4, bkb_id: 11, jenis: 'PB', aksi: 'simpan', nomor_urut: 2, doc_no: 'PB2', qty: 10, direction: 'out', created_at: '2026-11-04T00:00:00Z' },
        { id: 5, bkb_id: null, jenis: 'ADJ', aksi: 'koreksi', nomor_urut: null, doc_no: null, qty: 5, direction: 'in', created_at: '2026-11-05T00:00:00Z' },
      ],
      bkb: [{ id: 10, status: 'dibatalkan' }, { id: 11, status: 'selesai' }],
      bkb_items: [{ bkb_id: 10, saldo_sk: 70 }, { bkb_id: 11, saldo_sk: 90 }],
    };
    const k = await createKoreksiRepository(fakeClient({ tables })).getKartuStok(1);
    expect(k.map((r) => r.aksi)).toEqual(['saldo_awal', 'simpan', 'batal', 'simpan', 'koreksi']);
    expect(k.map((r) => r.berlaku)).toEqual([true, false, false, true, true]);
    expect(k.map((r) => r.saldoSistem)).toEqual([100, 100, 100, 90, 95]);
    expect(k[3]).toMatchObject({ nomorUrut: 2, docNo: 'PB2', saldoSk: 90 });
  });
  it('barang tidak ada -> null', async () => {
    expect(await createKoreksiRepository(fakeClient({ tables: { items: [] } })).getKartuStok(9)).toBeNull();
  });
});

describe('selisihBesar', () => {
  it('besar hanya bila |selisih| > qty', () => {
    expect(selisihBesar(5, 5)).toBe(false);
    expect(selisihBesar(-5.001, 5)).toBe(true);
    expect(selisihBesar(0, 5)).toBe(false);
  });
});

describe('getDampakBkb', () => {
  const tables = {
    bkb: [{ id: 5, status: 'selesai', updated_at: 'v1', disimpan_at: '2020-01-01T00:00:00Z', mengganti_bkb_id: null, param_jenis: { arah: 'out' } }],
    bkb_items: [{ item_id: 1, qty: 4, saldo_sk: null, items: { item_code: 'A', name: 'Aa', quantity: 10 } }],
  };
  it('batal: BKB keluar mengembalikan stok, peringatan >7 hari', async () => {
    const d = await createKoreksiRepository(fakeClient({ tables })).getDampakBkb(5, { aksi: 'batal' });
    expect(d.versi).toBe('v1');
    expect(d.baris).toEqual([{ itemCode: 'A', itemName: 'Aa', saldoSekarang: 10, saldoSesudah: 14 }]);
    expect(d.peringatan).toEqual(['lebih_7_hari']);
  });
  it('BKB masuk dibatalkan melebihi saldo -> minus', async () => {
    const t = { ...tables, bkb: [{ ...tables.bkb[0], param_jenis: { arah: 'in' }, disimpan_at: new Date().toISOString() }] };
    const d = await createKoreksiRepository(fakeClient({ tables: t })).getDampakBkb(5, { aksi: 'batal' });
    expect(d.baris[0].saldoSesudah).toBe(6);
    const t2 = { ...t, bkb_items: [{ ...tables.bkb_items[0], qty: 12 }] };
    const d2 = await createKoreksiRepository(fakeClient({ tables: t2 })).getDampakBkb(5, { aksi: 'batal' });
    expect(d2.peringatan).toEqual(['minus']);
  });
  it('status bukan selesai -> 409; tidak ada -> null', async () => {
    const t = { ...tables, bkb: [{ ...tables.bkb[0], status: 'menunggu' }] };
    await expect(createKoreksiRepository(fakeClient({ tables: t })).getDampakBkb(5, { aksi: 'batal' })).rejects.toMatchObject({ status: 409 });
    expect(await createKoreksiRepository(fakeClient({ tables: { bkb: [] } })).getDampakBkb(5, { aksi: 'batal' })).toBeNull();
  });
});
