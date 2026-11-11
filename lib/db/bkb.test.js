import { describe, it, expect, vi } from 'vitest';
import { createBkbRepository, mapBkb, toBkbPayload, translateBkbRpcError } from './bkb.js';

const row = (o = {}) => ({
  id: 1, doc_no: 'PB410-26K00001', status: 'ditahan', updated_at: 'T1',
  items: [
    { id: 2, item_id: 6, qty: '1', saldo_sk: '3', saldo_sistem_konfirmasi: '4', cocok: false },
    { id: 1, item_id: 5, qty: '2.5', saldo_sk: '1', saldo_sistem_konfirmasi: '1', cocok: true },
  ],
  ...o,
});

describe('mapBkb', () => {
  it('menyembunyikan saldo sistem selama status menunggu', () => {
    const b = mapBkb(row({ status: 'menunggu' }));
    expect(b.items.every((l) => l.saldoSistemKonfirmasi === null && l.cocok === null)).toBe(true);
  });
  it('membuka saldo sistem saat ditahan, baris terurut, versi = updated_at', () => {
    const b = mapBkb(row());
    expect(b.items.map((l) => l.itemId)).toEqual([5, 6]);
    expect(b.items[1].saldoSistemKonfirmasi).toBe(4);
    expect(b.versi).toBe('T1');
  });
});

describe('toBkbPayload', () => {
  it('memetakan ke snake_case', () => {
    const p = toBkbPayload({
      idempotencyKey: 'k', bkbKategori: '1', bkbDate: '2026-11-05', reference: '', tujuanKode: 'BIP',
      inisial: 'AND', nomorUrut: 3, machine: '', sumber: 'operator',
      items: [{ itemId: 5, qty: 2, deptPemakaiKode: 'PR' }],
    });
    expect(p).toMatchObject({
      idempotency_key: 'k', tujuan_kode: 'BIP', keterangan_extra: 'AND/3', reference: null, machine: null,
      items: [{ item_id: 5, qty: 2, dept_pemakai_kode: 'PR', dept_proses_kode: null }],
    });
  });
});

describe('translateBkbRpcError', () => {
  it('kode SQL menjadi DomainError dengan status', () => {
    try { translateBkbRpcError({ message: 'STATUS_TIDAK_SESUAI|BKB sudah selesai' }); } catch (e) {
      expect(e.name).toBe('DomainError'); expect(e.status).toBe(409); expect(e.message).toBe('BKB sudah selesai'); return;
    }
    throw new Error('harus melempar');
  });
  it('AKUN_BELUM_DIATUR => 409 dengan pesan ramah (pesan SQL tidak dipakai)', () => {
    expect(() => translateBkbRpcError({ message: 'AKUN_BELUM_DIATUR|detail internal' })).toThrow(
      expect.objectContaining({ name: 'DomainError', status: 409, message: 'Akun Anda belum diatur. Hubungi Superadmin.' }),
    );
  });
  it.each([['VERSI_BERUBAH', 409], ['DILARANG', 403], ['DATA_TIDAK_VALID', 400]])('%s => %i', (kode, status) => {
    expect(() => translateBkbRpcError({ message: `${kode}|pesan` })).toThrow(expect.objectContaining({ name: 'DomainError', status }));
  });
  it('STOK_KURANG membawa extra', () => {
    expect(() => translateBkbRpcError({ message: 'STOK_KURANG|A1|Baut|2|5' })).toThrow(/Stok tidak cukup/);
  });
  it('error tak dikenal dilempar apa adanya', () => {
    const e = new Error('boom');
    expect(() => translateBkbRpcError(e)).toThrow(e);
  });
});

function fakeClient({ rpcResult, rpcError, lines } = {}) {
  const calls = { rpc: [], update: [] };
  const chain = (data) => {
    const c = {
      select: () => c, eq: () => c,
      then: (res) => res({ data, error: null }),
    };
    return c;
  };
  return {
    calls,
    rpc: vi.fn(async (name, args) => { calls.rpc.push([name, args]); return { data: rpcResult, error: rpcError || null }; }),
    from: vi.fn((t) => (t === 'bkb_items' ? chain(lines) : { update: (p) => { calls.update.push(p); return chain(null); } })),
  };
}

describe('createBkbRepository', () => {
  const actor = { id: 4, name: 'Sari', role: 'staff', passwordHash: 'x' };

  it('createBkb memanggil buat_bkb dengan p_actor tanpa field sensitif', async () => {
    const c = fakeClient({ rpcResult: row({ status: 'menunggu' }) });
    const r = await createBkbRepository(c).createBkb({
      idempotencyKey: 'k', bkbKategori: '1', bkbDate: '2026-11-05', tujuanKode: 'BIP', inisial: 'A', nomorUrut: 1,
      items: [{ itemId: 5, qty: 1 }],
    }, actor);
    expect(c.calls.rpc[0][0]).toBe('buat_bkb');
    expect(c.calls.rpc[0][1].p_actor).toEqual({ id: 4, name: 'Sari', role: 'staff' });
    expect(r.docNo).toBe('PB410-26K00001');
  });

  it('batalBkb mengirim p_versi ke batal_bkb', async () => {
    const c = fakeClient({ rpcResult: row({ status: 'dibatalkan' }) });
    await createBkbRepository(c).batalBkb(1, 'alasan ok', actor, '2026-11-07T08:00:00Z');
    expect(c.calls.rpc[0]).toEqual(['batal_bkb', {
      p_id: 1, p_alasan: 'alasan ok', p_versi: '2026-11-07T08:00:00Z', p_actor: { id: 4, name: 'Sari', role: 'staff' },
    }]);
  });

  it('getBkb untuk operator (ownerId) tidak memuat riwayat', async () => {
    const c = {
      from: vi.fn((t) => {
        if (t === 'audit_log') throw new Error('audit_log tidak boleh dibaca');
        const ch = { select: () => ch, eq: () => ch, maybeSingle: async () => ({ data: { ...row(), dibuat_oleh_id: 4, bkb_items: [] }, error: null }) };
        return ch;
      }),
    };
    const b = await createBkbRepository(c).getBkb(1, { ownerId: 4 });
    expect(b.riwayat).toBeUndefined();
    expect(await createBkbRepository(c).getBkb(1, { ownerId: 99 })).toBeNull();
  });

  it('error RPC diterjemahkan', async () => {
    const c = fakeClient({ rpcError: { message: 'STATUS_TIDAK_SESUAI|Salah status' } });
    await expect(createBkbRepository(c).approveBkb(1, actor)).rejects.toMatchObject({ name: 'DomainError', status: 409 });
  });

  it('konfirmasiBkb memetakan itemId ke bkb_item_id', async () => {
    const c = fakeClient({ rpcResult: row(), lines: [{ id: 11, item_id: 5 }, { id: 12, item_id: 6 }] });
    await createBkbRepository(c).konfirmasiBkb(1, { baris: [{ itemId: 6, saldoSk: 3 }, { itemId: 5, saldoSk: 1 }] }, actor);
    expect(c.calls.rpc[0]).toEqual(['konfirmasi_bkb', {
      p_id: 1,
      p_lines: [{ bkb_item_id: 12, saldo_sk: 3 }, { bkb_item_id: 11, saldo_sk: 1 }],
      p_catatan: null,
      p_actor: { id: 4, name: 'Sari', role: 'staff' },
    }]);
  });

  it('yangSalahBkb memanggil yang_salah_bkb', async () => {
    const c = fakeClient({ rpcResult: row({ ditahan_karena: 'menunggu_koreksi' }) });
    const r = await createBkbRepository(c).yangSalahBkb(1, { pilihan: 'saldo', catatan: 'x' }, actor);
    expect(c.calls.rpc[0]).toEqual(['yang_salah_bkb', {
      p_id: 1, p_pilihan: 'saldo', p_catatan: 'x', p_actor: { id: 4, name: 'Sari', role: 'staff' },
    }]);
    expect(r).toEqual({ status: 'ditahan', ditahanKarena: 'menunggu_koreksi' });
  });

  it('konfirmasiBkb menolak baris kurang atau barang asing (400)', async () => {
    const c = fakeClient({ rpcResult: row(), lines: [{ id: 11, item_id: 5 }, { id: 12, item_id: 6 }] });
    const repo = createBkbRepository(c);
    await expect(repo.konfirmasiBkb(1, { baris: [{ itemId: 5, saldoSk: 1 }] }, actor)).rejects.toMatchObject({ status: 400 });
    await expect(repo.konfirmasiBkb(1, { baris: [{ itemId: 5, saldoSk: 1 }, { itemId: 9, saldoSk: 1 }] }, actor)).rejects.toMatchObject({ status: 400 });
    expect(c.rpc).not.toHaveBeenCalled();
  });
});
