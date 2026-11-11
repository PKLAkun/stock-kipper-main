import { describe, it, expect, vi } from 'vitest';
import { createLaporanRepository, hariWib } from './laporan.js';

// klien palsu: tabel -> baris; filter eq/in dicatat; rpc dicatat
function fakeClient({ tables = {}, rpc } = {}) {
  const calls = [];
  const from = (name) => {
    const q = {
      _rows: tables[name] || [],
      select() { return q; },
      eq(k, v) { calls.push([name, 'eq', k, v]); q._rows = q._rows.filter((r) => String(r[k]) === String(v)); return q; },
      in() { return q; }, order() { return q; },
      range(a, b) { q._rows = q._rows.slice(a, b + 1); return q; },
      maybeSingle: async () => ({ data: q._rows[0] ?? null, error: null }),
      then: (res, rej) => Promise.resolve({ data: q._rows, error: null }).then(res, rej),
    };
    return q;
  };
  return { from, calls, rpc: rpc || vi.fn(async () => ({ data: null, error: null })) };
}

describe('laporanMutasi', () => {
  it('meneruskan filter ke rpc dan memetakan baris', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        total: 2,
        rows: [
          { id: '1', created_at: '2026-11-10T01:00:00Z', bkb_id: 5, doc_no: 'PB410-1', nomor_urut: 3, item_id: 7, item_code: 'PP1', item_name: 'Biji', jenis: 'PB', aksi: 'simpan', keterangan: 'BIP/AND/1', tujuan_kode: 'BIP', direction: 'out', qty: '2.5', balance_after: '7.5', actor_name: 'Sari', shift: null, bkb_shift: '2' },
          { id: '2', created_at: '2026-11-10T02:00:00Z', bkb_id: null, item_id: 7, item_code: 'PP1', item_name: 'Biji', jenis: 'ADJ', aksi: 'koreksi', direction: 'in', qty: 1, balance_after: 8.5, shift: '1' },
        ],
      },
      error: null,
    }));
    const repo = createLaporanRepository(fakeClient({ rpc }));
    const r = await repo.laporanMutasi({ dari: '2026-11-01', sampai: '2026-11-11', itemId: 7, jenis: 'PB', shift: 2, limit: 50 });
    expect(rpc).toHaveBeenCalledWith('laporan_mutasi', { p: { dari: '2026-11-01', sampai: '2026-11-11', item_id: 7, jenis: 'PB', shift: '2', limit: 50, offset: 0 } });
    expect(r.total).toBe(2);
    expect(r.rows[0]).toMatchObject({ id: 1, docNo: 'PB410-1', keluar: 2.5, masuk: null, saldo: 7.5, shift: '2', petugas: 'Sari', tujuanKode: 'BIP' });
    expect(r.rows[1]).toMatchObject({ masuk: 1, keluar: null, shift: '1', docNo: null });
    expect(JSON.stringify(r)).not.toMatch(/dept_proses|deptProses/);
  });
  it('bawaan limit 1000 dan error SQL diterjemahkan', async () => {
    const rpc = vi.fn(async () => ({ data: { rows: [], total: 0 }, error: null }));
    await createLaporanRepository(fakeClient({ rpc })).laporanMutasi({});
    expect(rpc.mock.calls[0][1].p).toEqual({ limit: 1000, offset: 0 });
    const gagal = vi.fn(async () => ({ data: null, error: { message: 'DATA_TIDAK_VALID|Filter tidak valid' } }));
    await expect(createLaporanRepository(fakeClient({ rpc: gagal })).laporanMutasi({})).rejects.toMatchObject({ name: 'DomainError', status: 400 });
  });
});

describe('laporanRekap', () => {
  it('memanggil rpc dan memetakan angka', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ item_id: 3, category_code: '1', item_code: 'A', name: 'Alfa', unit: 'kg', stok_minimum: '10', saldo_awal: '5', masuk: '10', keluar: '2', koreksi: '-1', saldo_akhir: '12', di_bawah_minimum: false },
             { item_id: 4, category_code: '1', item_code: 'B', name: 'Beta', unit: 'kg', stok_minimum: null, saldo_awal: 0, masuk: 0, keluar: 0, koreksi: 0, saldo_akhir: 0, di_bawah_minimum: false }],
      error: null,
    }));
    const r = await createLaporanRepository(fakeClient({ rpc })).laporanRekap({ dari: '2026-11-01', sampai: '2026-11-11' });
    expect(rpc).toHaveBeenCalledWith('laporan_rekap', { p_dari: '2026-11-01', p_sampai: '2026-11-11', p_kategori: null });
    expect(r[0]).toMatchObject({ kode: 'A', stokMinimum: 10, saldoAwal: 5, masuk: 10, keluar: 2, koreksi: -1, saldoAkhir: 12 });
    expect(r[1].stokMinimum).toBeNull();
  });
  it('hasil bukan array -> []', async () => {
    expect(await createLaporanRepository(fakeClient()).laporanRekap({ dari: 'a', sampai: 'b', kategori: '4' })).toEqual([]);
  });
});

describe('laporanStok', () => {
  it('memetakan saldo dan menandai di bawah minimum; filter kategori', async () => {
    const tables = { items: [
      { id: 1, category_code: '1', item_code: 'A', name: 'Alfa', unit: 'kg', quantity: '3', stok_minimum: '5' },
      { id: 2, category_code: '4', item_code: 'B', name: 'Beta', unit: 'pcs', quantity: '9', stok_minimum: null },
    ] };
    const c = fakeClient({ tables });
    const semua = await createLaporanRepository(c).laporanStok();
    expect(semua).toHaveLength(2);
    expect(semua[0]).toMatchObject({ kode: 'A', saldo: 3, stokMinimum: 5, diBawahMinimum: true });
    expect(semua[1].diBawahMinimum).toBe(false);
    const bo = await createLaporanRepository(c).laporanStok({ kategori: '4' });
    expect(bo.map((x) => x.kode)).toEqual(['B']);
  });
});

describe('laporanKartu', () => {
  const tables = {
    items: [{ id: 1, category_code: '1', item_code: 'A', name: 'Alfa', unit: 'kg', quantity: 8 }],
    transactions_log: [
      { id: 1, item_id: 1, bkb_id: null, jenis: 'SA', aksi: 'saldo_awal', nomor_urut: null, doc_no: null, qty: 10, direction: 'in', created_at: '2026-10-01T03:00:00Z' },
      { id: 2, item_id: 1, bkb_id: 5, jenis: 'PB', aksi: 'simpan', nomor_urut: 1, doc_no: 'PB1', qty: 4, direction: 'out', created_at: '2026-11-03T03:00:00Z' },
      { id: 3, item_id: 1, bkb_id: 6, jenis: 'PR', aksi: 'simpan', nomor_urut: 2, doc_no: 'PR1', qty: 2, direction: 'in', created_at: '2026-11-20T03:00:00Z' },
    ],
    bkb: [{ id: 5, status: 'selesai', keterangan: 'BIP/AND/1' }, { id: 6, status: 'selesai', keterangan: 'PROSES' }],
    bkb_items: [{ bkb_id: 5, item_id: 1, saldo_sk: 6 }, { bkb_id: 6, saldo_sk: 8 }],
  };
  it('menyaring periode, menghitung saldo awal/akhir, membawa kode keterangan', async () => {
    const k = await createLaporanRepository(fakeClient({ tables })).laporanKartu(1, { dari: '2026-11-01', sampai: '2026-11-10' });
    expect(k.item).toMatchObject({ kode: 'A', nama: 'Alfa' });
    expect(k.saldoAwal).toBe(10);
    expect(k.rows).toHaveLength(1);
    expect(k.rows[0]).toMatchObject({ jenis: 'PB', kodeKeterangan: 'BIP/AND/1', keluar: 4, masuk: null, saldoAkhir: 6, saldoSk: 6 });
    expect(k.saldoAkhir).toBe(6);
  });
  it('tanpa tanggal: seluruh riwayat; saldo awal 0', async () => {
    const k = await createLaporanRepository(fakeClient({ tables })).laporanKartu(1);
    expect(k.rows).toHaveLength(3);
    expect(k.saldoAwal).toBe(0);
    expect(k.saldoAkhir).toBe(8);
    expect(k.rows[0].kodeKeterangan).toBeNull();
  });
  it('periode kosong memakai saldo sebelum periode', async () => {
    const k = await createLaporanRepository(fakeClient({ tables })).laporanKartu(1, { dari: '2026-11-05', sampai: '2026-11-10' });
    expect(k.rows).toEqual([]);
    expect(k.saldoAwal).toBe(6);
    expect(k.saldoAkhir).toBe(6);
  });
  it('barang tidak ada -> null', async () => {
    expect(await createLaporanRepository(fakeClient({ tables: { items: [] } })).laporanKartu(9)).toBeNull();
  });
});

describe('hariWib', () => {
  it('menggeser ke hari WIB', () => {
    expect(hariWib('2026-11-10T20:00:00Z')).toBe('2026-11-11');
    expect(hariWib('2026-11-10T16:59:00Z')).toBe('2026-11-10');
  });
});
