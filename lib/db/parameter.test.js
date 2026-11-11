import { describe, it, expect } from 'vitest';
import { createFakeSupabase } from '../../test/fake-supabase.js';
import { createParameterRepository } from './parameter.js';

const actor = { id: 1, name: 'SA' };
function setup(extra = {}) {
  const client = createFakeSupabase({
    param_tujuan: [{ kode: 'BIP', nama: 'BIP', jenis_kode: 'PB', dept_pemakai_kode: null, wajib_mesin: false, aktif: true }],
    param_dept_proses: [
      { kode: 'A', nama: 'A', aktif: true, bawaan: true },
      { kode: 'B', nama: 'B', aktif: true, bawaan: false },
    ],
    bkb: [], bkb_items: [], machines: [], app_settings: [], audit_log: [],
    ...extra,
  });
  return { client, repo: createParameterRepository(client) };
}

describe('parameter tim (T-22)', () => {
  it('tim terkunci bila dipakai akun; tujuan terkunci bila dipakai akun operator', async () => {
    const { repo } = setup({
      param_tim: [{ kode: 'TARIK', nama: 'Tim Tarik', aktif: true }, { kode: 'SUPLAI', nama: 'Tim Suplai', aktif: true }],
      users: [{ id: 1, tim_kode: 'TARIK', tujuan_kode: 'BIP' }],
    });
    const tim = await repo.listParameter('tim');
    expect(tim.find((t) => t.kode === 'TARIK').terkunci).toBe(true);
    expect(tim.find((t) => t.kode === 'SUPLAI').terkunci).toBe(false);
    expect((await repo.getParameter('tujuan', 'BIP')).terkunci).toBe(true);
  });

  it('buat tim baru tercatat di audit', async () => {
    const { repo, client } = setup({ param_tim: [] });
    const t = await repo.createParameter('tim', { kode: 'TEMPEL', nama: 'Tim Tempel' }, actor);
    expect(t).toMatchObject({ kode: 'TEMPEL', nama: 'Tim Tempel', aktif: true });
    expect(client.db.audit_log[0]).toMatchObject({ entitas: 'param_tim', aksi: 'buat' });
  });
});

describe('parameter', () => {
  it('daftar membawa terkunci bila dipakai BKB', async () => {
    const { repo } = setup({ bkb: [{ id: 1, tujuan_kode: 'BIP' }] });
    const [r] = await repo.listParameter('tujuan');
    expect(r).toMatchObject({ kode: 'BIP', jenisKode: 'PB', terkunci: true });
  });

  it('kode terkunci ditolak 409, nama tetap boleh diubah', async () => {
    const { repo } = setup({ bkb: [{ id: 1, tujuan_kode: 'BIP' }] });
    await expect(repo.updateParameter('tujuan', 'BIP', { kode: 'BIP2' }, actor)).rejects.toMatchObject({ status: 409 });
    const r = await repo.updateParameter('tujuan', 'BIP', { nama: 'BIP baru' }, actor);
    expect(r.nama).toBe('BIP baru');
  });

  it('kode boleh diubah bila belum dipakai; nonaktif dicatat sebagai audit nonaktifkan', async () => {
    const { client, repo } = setup();
    await repo.updateParameter('tujuan', 'BIP', { kode: 'BIX' }, actor);
    expect(client.db.param_tujuan[0].kode).toBe('BIX');
    await repo.updateParameter('tujuan', 'BIX', { aktif: false }, actor);
    expect(client.db.audit_log.map((a) => a.aksi)).toEqual(['ubah', 'nonaktifkan']);
    expect(client.db.audit_log[1]).toMatchObject({ entitas: 'param_tujuan', actor_id: 1 });
  });

  it('arah jenis terkunci setelah dipakai', async () => {
    const { repo } = setup({ param_jenis: [{ kode: 'PB', nama: 'P', arah: 'out', aktif: true }], bkb: [{ id: 1, jenis_kode: 'PB' }] });
    await expect(repo.updateParameter('jenis', 'PB', { arah: 'in' }, actor)).rejects.toMatchObject({ status: 409 });
  });

  it('dept proses bawaan hanya satu', async () => {
    const { client, repo } = setup();
    await repo.updateParameter('dept-proses', 'B', { bawaan: true }, actor);
    expect(client.db.param_dept_proses.filter((r) => r.bawaan).map((r) => r.kode)).toEqual(['B']);
  });

  it('parameter tidak ada -> null', async () => {
    const { repo } = setup();
    expect(await repo.updateParameter('tujuan', 'NOPE', { nama: 'xx' }, actor)).toBeNull();
  });
});

describe('mesin', () => {
  it('kode terkunci bila dipakai BKB; nonaktif menggantikan hapus', async () => {
    const { client, repo } = setup({ machines: [{ id: 5, code: 'INJ-1', name: 'Inj', active: true }], bkb: [{ id: 1, machine: 'INJ-1' }] });
    await expect(repo.updateMachine(5, { code: 'INJ-2', name: 'Inj', active: true }, actor)).rejects.toMatchObject({ status: 409 });
    const m = await repo.updateMachine(5, { code: 'INJ-1', name: 'Inj', active: false }, actor);
    expect(m.active).toBe(false);
    expect(client.db.audit_log[0].aksi).toBe('nonaktifkan');
    expect(repo.deleteMachine).toBeUndefined();
  });
});

describe('pengaturan', () => {
  it('bawaan aktif; set mencatat nilai lama, baru, dan alasan di audit', async () => {
    const { client, repo } = setup();
    expect((await repo.getPengaturan()).wajibApproveDe).toBe(true);
    const r = await repo.setPengaturan({ wajibApproveDe: false, alasan: 'uji coba' }, actor);
    expect(r.wajibApproveDe).toBe(false);
    expect(client.db.audit_log[0]).toMatchObject({
      entitas: 'app_settings', alasan: 'uji coba', data_lama: { wajibApproveDe: true }, data_baru: { wajibApproveDe: false },
    });
  });
});
