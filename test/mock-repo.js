// Repository palsu untuk tes: menyimpan user di memori, tanpa Supabase.
import { vi } from 'vitest';

export function makeUser(overrides = {}) {
  return {
    id: 1,
    name: 'Tes',
    email: 'tes@example.com',
    passwordHash: null,
    pinHash: null,
    role: 'operator',
    active: true,
    passwordVersion: 1,
    ...overrides,
  };
}

export function createMockRepo(users = []) {
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    findById: vi.fn(async (id) => byId.get(Number(id)) || null),
    findByEmail: vi.fn(async (email) => users.find((u) => u.email === email) || null),
  };
}
