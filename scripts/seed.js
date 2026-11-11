// FILE: scripts/seed.js
// Data awal Stok Hub (dijalankan Andre setelah schema.sql): npm run seed
//   2 superadmin, 1 DE (admin), 2 SK (staff), 2 operator, dan contoh barang kategori 1 dan 4.
//   Setiap akun punya inisial; operator 1 tim TARIK (keterangan INJ2), operator 2 tim SUPLAI (keterangan BIP).
// Email, password, dan PIN dibaca dari .env.local (nama variabel: lihat .env.example).
// Aman dijalankan ulang: akun dan barang yang sudah ada dilewati.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { validateEnv } from '../lib/env.js';
import { hashPassword } from '../lib/auth/password.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnvLocal() {
  const envPath = path.join(projectRoot, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const need = (name) => {
  const v = (process.env[name] || '').trim();
  if (!v) throw new Error(`${name} wajib diisi di .env.local`);
  return v;
};

// Akun berkredensial email + password
function akunEmail(role, prefix, namaBawaan, inisial) {
  return {
    inisial,
    role,
    name: (process.env[`${prefix}_NAME`] || namaBawaan).trim(),
    email: need(`${prefix}_EMAIL`).toLowerCase(),
    password: need(`${prefix}_PASSWORD`),
  };
}

function akunOperator(prefix, namaBawaan, inisial, timKode, tujuanKode) {
  const pin = need(`${prefix}_PIN`);
  if (!/^\d{4,8}$/.test(pin)) throw new Error(`${prefix}_PIN harus 4 sampai 8 angka`);
  return { role: 'operator', name: (process.env[`${prefix}_NAME`] || namaBawaan).trim(), pin, inisial, timKode, tujuanKode };
}

// Contoh barang. stokMinimum boleh kosong.
const BARANG_CONTOH = [
  { category_code: '1', item_code: 'RM-PP001', name: 'Biji Plastik PP Contoh', unit: 'kg', quantity: 5000, stok_minimum: 500 },
  { category_code: '1', item_code: 'RM-PE002', name: 'Biji Plastik PE Contoh', unit: 'kg', quantity: 3000, stok_minimum: 300 },
  { category_code: '1', item_code: 'RM-MB003', name: 'Masterbatch Hitam Contoh', unit: 'kg', quantity: 200 },
  { category_code: '4', item_code: 'BO-BTL01', name: 'Botol Olahan Contoh', unit: 'pcs', quantity: 1200, stok_minimum: 200 },
  { category_code: '4', item_code: 'BO-TTP02', name: 'Tutup Olahan Contoh', unit: 'pcs', quantity: 2500 },
];

async function main() {
  loadDotEnvLocal();
  const env = validateEnv();
  console.log(`\n[seed] Supabase: ${env.supabaseUrl}`);
  const db = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Superadmin pertama memakai ADMIN_*, sisanya SEED_*
  process.env.SEED_SUPERADMIN1_NAME ||= env.adminName;
  process.env.SEED_SUPERADMIN1_EMAIL ||= env.adminEmail;
  process.env.SEED_SUPERADMIN1_PASSWORD ||= env.adminPassword;

  const akun = [
    akunEmail('superadmin', 'SEED_SUPERADMIN1', 'Superadmin 1', 'SAS'),
    akunEmail('superadmin', 'SEED_SUPERADMIN2', 'Superadmin 2', 'SAD'),
    akunEmail('admin', 'SEED_DE', 'Data Entry', 'DEN'),
    akunEmail('staff', 'SEED_SK1', 'Stock Keeper 1', 'SKS'),
    akunEmail('staff', 'SEED_SK2', 'Stock Keeper 2', 'SKD'),
    akunOperator('SEED_OPERATOR1', 'Operator 1', 'OPS', 'TARIK', 'INJ2'),
    akunOperator('SEED_OPERATOR2', 'Operator 2', 'OPD', 'SUPLAI', 'BIP'),
  ];
  const emailSet = new Set();
  for (const a of akun) {
    if (!a.email) continue;
    if (emailSet.has(a.email)) throw new Error(`Email dobel di .env.local: ${a.email}`);
    emailSet.add(a.email);
  }

  for (const a of akun) {
    let ada;
    if (a.role === 'operator') {
      ({ data: ada } = await db.from('users').select('id, inisial, tim_kode, tujuan_kode').eq('role', 'operator').eq('name', a.name).maybeSingle());
    } else {
      ({ data: ada } = await db.from('users').select('id, inisial').eq('email', a.email).maybeSingle());
    }
    if (ada) {
      // Akun lama: isi inisial/tim/keterangan hanya bila masih kosong (tidak menimpa pilihan Superadmin).
      const isi = {};
      if (!ada.inisial) isi.inisial = a.inisial;
      if (a.role === 'operator') {
        if (!ada.tim_kode) isi.tim_kode = a.timKode;
        if (!ada.tujuan_kode) isi.tujuan_kode = a.tujuanKode;
      }
      if (Object.keys(isi).length) {
        const { error: errIsi } = await db.from('users').update(isi).eq('id', ada.id);
        if (errIsi) console.log(`[seed] Peringatan: gagal mengisi ${Object.keys(isi).join(', ')} untuk ${a.email || a.name}: ${errIsi.message}`);
        else console.log(`[seed] ${a.role} ${a.email || a.name} sudah ada, dilengkapi: ${Object.keys(isi).join(', ')}.`);
      } else {
        console.log(`[seed] ${a.role} ${a.email || a.name} sudah ada, dilewati.`);
      }
      continue;
    }
    const baris = a.role === 'operator'
      ? { name: a.name, role: 'operator', pin_hash: await hashPassword(a.pin), inisial: a.inisial, tim_kode: a.timKode, tujuan_kode: a.tujuanKode }
      : { name: a.name, role: a.role, email: a.email, password_hash: await hashPassword(a.password), inisial: a.inisial };
    const { error } = await db.from('users').insert(baris);
    if (error) throw new Error(`Gagal membuat ${a.role} ${a.email || a.name}: ${error.message}`);
    console.log(`[seed] ${a.role} dibuat: ${a.email || a.name}`);
  }

  // Barang lewat create_item_master supaya saldo awal tercatat sebagai SA
  const aktor = { id: 0, name: 'seed', role: 'superadmin' };
  for (const item of BARANG_CONTOH) {
    const { data: ada } = await db.from('items').select('id').ilike('item_code', item.item_code).maybeSingle();
    if (ada) {
      console.log(`[seed] Barang ${item.item_code} sudah ada, dilewati.`);
      continue;
    }
    const { error } = await db.rpc('create_item_master', { p: item, p_actor: aktor });
    if (error) throw new Error(`Gagal membuat barang ${item.item_code}: ${error.message}`);
    console.log(`[seed] Barang dibuat: ${item.item_code}`);
  }
  console.log('[seed] Selesai.\n');
}

main().catch((e) => {
  console.error('\n[seed] GAGAL:', e.message);
  process.exit(1);
});
