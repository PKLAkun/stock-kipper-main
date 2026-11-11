import { describe, it, expect } from 'vitest';
import { createFakeSupabase } from '../../test/fake-supabase.js';
import { createUsersRepository } from './users.js';

const baris = (o) => ({ id: 1, name: 'Rina', email: 'r@x.com', password_hash: 'h', pin_hash: null, role: 'staff', active: true, password_version: 3, ...o });
const actor = { id: 9, name: 'SA' };

function setup(rows) {
  const client = createFakeSupabase({ users: rows, audit_log: [] });
  return { client, repo: createUsersRepository(client) };
}

describe('createUsersRepository.updateUser', () => {
  it('menaikkan password_version saat role berubah', async () => {
    const { client, repo } = setup([baris()]);
    const u = await repo.updateUser(1, { name: 'Rina', role: 'admin', active: true }, actor);
    expect(u.passwordVersion).toBe(4);
    expect(client.db.audit_log[0].aksi).toBe('ubah');
  });

  it('menaikkan password_version saat dinonaktifkan dan mencatat aksi nonaktifkan', async () => {
    const { client, repo } = setup([baris()]);
    const u = await repo.updateUser(1, { name: 'Rina', role: 'staff', active: false }, actor);
    expect(u.passwordVersion).toBe(4);
    expect(u.active).toBe(false);
    expect(client.db.audit_log[0].aksi).toBe('nonaktifkan');
  });

  it('tidak menaikkan password_version bila hanya nama berubah', async () => {
    const { repo } = setup([baris()]);
    const u = await repo.updateUser(1, { name: 'Rina B', role: 'staff', active: true }, actor);
    expect(u.passwordVersion).toBe(3);
  });

  it('mengembalikan null bila user tidak ada', async () => {
    const { repo } = setup([]);
    expect(await repo.updateUser(5, { name: 'x', role: 'staff', active: true }, actor)).toBeNull();
  });
});

describe('createUsersRepository lainnya', () => {
  it('setPin menulis pin_hash (bukan kolom pin) dan menaikkan versi', async () => {
    const { client, repo } = setup([baris({ role: 'operator', email: null, password_hash: null })]);
    await repo.setPin(1, 'HASH', actor);
    const row = client.db.users[0];
    expect(row.pin_hash).toBe('HASH');
    expect('pin' in row).toBe(false);
    expect(row.password_version).toBe(4);
    expect(JSON.stringify(client.db.audit_log)).not.toContain('HASH');
  });

  it('resetPassword menaikkan versi tanpa mencatat hash di audit', async () => {
    const { client, repo } = setup([baris()]);
    await repo.resetPassword(1, 'HASHBARU', actor);
    expect(client.db.users[0].password_version).toBe(4);
    expect(JSON.stringify(client.db.audit_log)).not.toContain('HASHBARU');
  });

  it('countByRole dengan activeOnly', async () => {
    const { repo } = setup([baris({ id: 1, role: 'superadmin' }), baris({ id: 2, role: 'superadmin', active: false })]);
    expect(await repo.countByRole('superadmin')).toBe(2);
    expect(await repo.countByRole('superadmin', { activeOnly: true })).toBe(1);
  });

  it('createUser operator menyimpan pin_hash tanpa email', async () => {
    const { client, repo } = setup([]);
    const u = await repo.createUser({ name: 'Budi', role: 'operator', pinHash: 'P' }, actor);
    expect(u.role).toBe('operator');
    expect(client.db.users[0]).toMatchObject({ pin_hash: 'P', email: null, password_hash: null, password_version: 1 });
  });
});

describe('createUsersRepository: inisial, tim, keterangan (T-22)', () => {
  it('mapUser memetakan kolom baru ke camelCase', async () => {
    const { repo } = setup([baris({ role: 'operator', inisial: 'OPS', tim_kode: 'TARIK', tujuan_kode: 'INJ2' })]);
    const u = await repo.findById(1);
    expect(u).toMatchObject({ inisial: 'OPS', timKode: 'TARIK', tujuanKode: 'INJ2' });
  });

  it('createUser operator menyimpan inisial, tim, tujuan; role lain memaksa tim dan tujuan null', async () => {
    const { client, repo } = setup([]);
    await repo.createUser({ name: 'Op', role: 'operator', pinHash: 'H', inisial: 'OP', timKode: 'TARIK', tujuanKode: 'INJ2' }, actor);
    await repo.createUser({ name: 'SK', role: 'staff', email: 's@x.com', passwordHash: 'H', inisial: 'SK', timKode: 'TARIK', tujuanKode: 'INJ2' }, actor);
    expect(client.db.users[0]).toMatchObject({ inisial: 'OP', tim_kode: 'TARIK', tujuan_kode: 'INJ2' });
    expect(client.db.users[1]).toMatchObject({ inisial: 'SK', tim_kode: null, tujuan_kode: null });
  });

  it('updateUser: tidak dikirim = dipertahankan; dikirim null = dikosongkan', async () => {
    const { client, repo } = setup([baris({ role: 'operator', inisial: 'OPS', tim_kode: 'TARIK', tujuan_kode: 'INJ2' })]);
    await repo.updateUser(1, { name: 'Rina', role: 'operator', active: true }, actor);
    expect(client.db.users[0]).toMatchObject({ inisial: 'OPS', tim_kode: 'TARIK', tujuan_kode: 'INJ2' });
    await repo.updateUser(1, { name: 'Rina', role: 'operator', active: true, inisial: null, timKode: 'SUPLAI' }, actor);
    expect(client.db.users[0]).toMatchObject({ inisial: null, tim_kode: 'SUPLAI', tujuan_kode: 'INJ2' });
  });

  it('updateUser: role non-operator mengosongkan tim dan tujuan', async () => {
    const { client, repo } = setup([baris({ role: 'operator', email: null, tim_kode: 'TARIK', tujuan_kode: 'INJ2' })]);
    await repo.updateUser(1, { name: 'Rina', role: 'staff', active: true, timKode: 'TARIK', tujuanKode: 'INJ2' }, actor);
    expect(client.db.users[0]).toMatchObject({ tim_kode: null, tujuan_kode: null });
  });
});
