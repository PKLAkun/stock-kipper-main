// FILE: lib/db/index.js
// Pintu utama database. Adapter Supabase (PostgreSQL), digabung dari repository per area.
// Urutan penggabungan penting: repository area yang lebih baru menimpa method lama dengan nama sama
// (misalnya createBkb, listBkb, listItems, createItem, updateItem).
import { validateEnv } from '../env.js';
import { getSupabaseRepository, getClient } from './supabase.js';
import { createItemsRepository } from './items.js';
import { createUsersRepository } from './users.js';
import { createParameterRepository } from './parameter.js';
import { createBkbRepository } from './bkb.js';
import { createKoreksiRepository } from './koreksi.js';
// [Tahap 2, 11-11-2026, T-24/T-26] Repository baru: Cek Stok dan Laporan
import { createOpnameRepository } from './opname.js';
import { createLaporanRepository } from './laporan.js';

let repositoryCache = null;

export function getRepository() {
  if (repositoryCache) return repositoryCache;
  validateEnv();
  const client = getClient();
  repositoryCache = {
    ...getSupabaseRepository(),
    ...createItemsRepository(client),
    ...createUsersRepository(client),
    ...createParameterRepository(client),
    ...createBkbRepository(client),
    ...createKoreksiRepository(client),
    ...createOpnameRepository(client),
    ...createLaporanRepository(client),
  };
  return repositoryCache;
}
