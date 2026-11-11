// FILE: lib/db/users.js
// Repository pengguna (tabel users). Dipasang di getRepository() oleh lib/db/index.js.
// Jangan pernah mencatat password, PIN, atau hash ke log atau audit.

import { DomainError } from './supabase.js';
import { auditSafe } from './parameter.js';

export function mapUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    pinHash: row.pin_hash || null,
    role: row.role,
    active: !!row.active,
    passwordVersion: Number(row.password_version),
    inisial: row.inisial || null,
    timKode: row.tim_kode || null,
    tujuanKode: row.tujuan_kode || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Galat unik: indeks users_inisial_uq (inisial dobel) dibedakan dari email dobel.
function galatUnik(error) {
  const teks = `${error.message || ''} ${error.details || ''} ${error.constraint || ''}`.toLowerCase();
  return teks.includes('inisial') ? 'Inisial sudah dipakai pengguna lain.' : 'Email sudah dipakai.';
}

export function createUsersRepository(client) {
  const fail = (error) => {
    const err = new Error(error.message);
    err.code = error.code;
    return err;
  };

  async function findByEmail(email) {
    const { data, error } = await client.from('users').select('*').eq('email', email).maybeSingle();
    if (error) throw fail(error);
    return mapUser(data);
  }

  async function findById(id) {
    const { data, error } = await client.from('users').select('*').eq('id', id).maybeSingle();
    if (error) throw fail(error);
    return mapUser(data);
  }

  async function listUsers() {
    const { data, error } = await client.from('users').select('*').order('created_at', { ascending: true });
    if (error) throw fail(error);
    return (data || []).map(mapUser);
  }

  // data: { name, role, email?, passwordHash?, pinHash?, inisial?, timKode?, tujuanKode? }. Operator: pinHash saja. Role lain: email + passwordHash.
  async function createUser(data, actor) {
    const ts = new Date().toISOString();
    const { data: row, error } = await client.from('users')
      .insert({
        name: data.name,
        email: data.email ?? null,
        password_hash: data.passwordHash ?? null,
        pin_hash: data.pinHash ?? null,
        role: data.role,
        inisial: data.inisial ?? null,
        tim_kode: data.role === 'operator' ? (data.timKode ?? null) : null,
        tujuan_kode: data.role === 'operator' ? (data.tujuanKode ?? null) : null,
        active: true,
        password_version: 1,
        created_at: ts,
        updated_at: ts,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') throw new DomainError(galatUnik(error), 409);
      if (error.code === '23503') throw new DomainError('Tim atau keterangan tidak ditemukan.', 400);
      throw fail(error);
    }
    const user = mapUser(row);
    await auditSafe(client, {
      entitas: 'users', entitasId: user.id, aksi: 'buat', actor,
      dataBaru: { name: user.name, role: user.role, active: user.active, inisial: user.inisial, timKode: user.timKode, tujuanKode: user.tujuanKode },
    });
    return user;
  }

  // Perubahan role atau penonaktifan menaikkan password_version supaya sesi lama tidak berlaku lagi.
  async function updateUser(id, data, actor) {
    const existing = await findById(id);
    if (!existing) return null;
    const roleChanged = data.role !== existing.role;
    const deactivated = existing.active && !data.active;
    const patch = { name: data.name, role: data.role, active: data.active, updated_at: new Date().toISOString() };
    if (roleChanged || deactivated) patch.password_version = existing.passwordVersion + 1;
    // Isian baru: undefined = biarkan nilai lama; null = kosongkan. Non-operator selalu tanpa tim dan keterangan.
    if (data.inisial !== undefined) patch.inisial = data.inisial;
    if (data.role !== 'operator') {
      patch.tim_kode = null;
      patch.tujuan_kode = null;
    } else {
      if (data.timKode !== undefined) patch.tim_kode = data.timKode;
      if (data.tujuanKode !== undefined) patch.tujuan_kode = data.tujuanKode;
    }
    const { error } = await client.from('users').update(patch).eq('id', id);
    if (error) {
      if (error.code === '23505') throw new DomainError(galatUnik(error), 409);
      if (error.code === '23503') throw new DomainError('Tim atau keterangan tidak ditemukan.', 400);
      throw fail(error);
    }
    const baru = await findById(id);

    let aksi = 'ubah';
    if (deactivated) aksi = 'nonaktifkan';
    else if (!existing.active && data.active) aksi = 'aktifkan';
    await auditSafe(client, {
      entitas: 'users', entitasId: id, aksi, actor,
      dataLama: { name: existing.name, role: existing.role, active: existing.active, inisial: existing.inisial, timKode: existing.timKode, tujuanKode: existing.tujuanKode },
      dataBaru: { name: data.name, role: data.role, active: data.active, inisial: baru.inisial, timKode: baru.timKode, tujuanKode: baru.tujuanKode },
    });
    return baru;
  }

  async function resetPassword(id, passwordHash, actor) {
    const existing = await findById(id);
    if (!existing) return null;
    const { error } = await client.from('users')
      .update({ password_hash: passwordHash, password_version: existing.passwordVersion + 1, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw fail(error);
    await auditSafe(client, { entitas: 'users', entitasId: id, aksi: 'ubah', actor, dataBaru: { perubahan: 'reset_password' } });
    return findById(id);
  }

  // Set PIN operator (kolom pin_hash). Menaikkan password_version supaya sesi dengan PIN lama berakhir.
  async function setPin(id, pinHash, actor) {
    const existing = await findById(id);
    if (!existing) return null;
    const { error } = await client.from('users')
      .update({ pin_hash: pinHash, password_version: existing.passwordVersion + 1, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw fail(error);
    await auditSafe(client, { entitas: 'users', entitasId: id, aksi: 'ubah', actor, dataBaru: { perubahan: 'set_pin' } });
    return findById(id);
  }

  async function deleteUser(id, actor) {
    const existing = await findById(id);
    const { error } = await client.from('users').delete().eq('id', id);
    if (error) {
      // masih dirujuk BKB atau riwayat lain: riwayat harus utuh
      if (error.code === '23503') throw new DomainError('Pengguna ini punya riwayat BKB. Nonaktifkan saja.', 409);
      throw fail(error);
    }
    if (existing) {
      await auditSafe(client, {
        entitas: 'users', entitasId: id, aksi: 'ubah', actor,
        dataLama: { name: existing.name, role: existing.role, active: existing.active },
        dataBaru: { dihapus: true },
      });
    }
    return true;
  }

  // activeOnly: hanya hitung akun aktif (pengaman superadmin terakhir)
  async function countByRole(role, { activeOnly = false } = {}) {
    let q = client.from('users').select('id', { count: 'exact', head: true }).eq('role', role);
    if (activeOnly) q = q.eq('active', true);
    const { count, error } = await q;
    if (error) throw fail(error);
    return Number(count || 0);
  }

  return { findByEmail, findById, listUsers, createUser, updateUser, resetPassword, setPin, deleteUser, countByRole };
}
