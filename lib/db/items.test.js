import { describe, it, expect, vi } from 'vitest';
import { createItemsRepository } from './items.js';

function client({ rows = [], rpc } = {}) {
  const q = {
    select: () => q, or: () => q, eq: () => q, order: () => q, range: () => q,
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (res, rej) => Promise.resolve({ data: rows, error: null, count: rows.length }).then(res, rej),
  };
  return { from: () => q, rpc: rpc || vi.fn(async () => ({ data: null, error: null })) };
}
const row = (id, qty, min) => ({ id, category_code: '1', location_code: '100', item_code: `K${id}`, name: `N${id}`, quantity: qty, unit: 'kg', stok_minimum: min });
const actor = { id: 1, name: 'DE', role: 'admin', passwordHash: 'x' };

describe('createItemsRepository', () => {
  it('createItem: kirim kunci snake_case + quantity, tanpa data sensitif', async () => {
    const rpc = vi.fn(async () => ({ data: row(1, 5, 10), error: null }));
    const item = await createItemsRepository(client({ rpc })).createItem({ categoryCode: '1', itemCode: 'K1', barcode: '', name: 'N', unit: 'kg', stokMinimum: 10, quantity: 5 }, actor);
    expect(rpc).toHaveBeenCalledWith('create_item_master', { p: { category_code: '1', item_code: 'K1', barcode: null, name: 'N', unit: 'kg', stok_minimum: 10, quantity: 5 }, p_actor: { id: 1, name: 'DE', role: 'admin' } });
    expect(item).toMatchObject({ id: 1, stokMinimum: 10, saldoProtect: 10 });
  });
  it('updateItem: tidak mengirim quantity; null bila tidak ada', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const r = await createItemsRepository(client({ rpc })).updateItem(3, { categoryCode: '1', itemCode: 'K', name: 'N', unit: 'kg', stokMinimum: null, quantity: 99 }, actor);
    expect(r).toBeNull();
    const args = rpc.mock.calls[0];
    expect(args[0]).toBe('update_item_master');
    expect(args[1].p_id).toBe(3);
    expect('quantity' in args[1].p).toBe(false);
  });
  it('kode duplikat -> 409', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: '23505', message: 'duplicate key items_item_code_uq' } }));
    await expect(createItemsRepository(client({ rpc })).createItem({}, actor)).rejects.toMatchObject({ status: 409 });
  });
  it('listItems statusStok=bawah_minimum: tanpa habis, urut kekurangan terbesar', async () => {
    const rows = [row(1, 80, 100), row(2, 0, 50), row(3, 12, 50), row(4, 500, 100), row(5, 5, null)];
    const r = await createItemsRepository(client({ rows })).listItems({ statusStok: 'bawah_minimum', sortBy: 'kekurangan' });
    expect(r.items.map((i) => i.id)).toEqual([3, 1]);
    expect(r.total).toBe(2);
    const h = await createItemsRepository(client({ rows })).listItems({ statusStok: 'habis' });
    expect(h.items.map((i) => i.id)).toEqual([2]);
  });
});
