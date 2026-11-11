import { describe, it, expect } from 'vitest';
import { menuUntukRole } from './AppShell.jsx';

const hrefs = (role) => menuUntukRole(role).map((m) => m.href);

describe('menuUntukRole', () => {
  it('operator: Buat BKB dan BKB Saya saja', () => {
    expect(hrefs('operator')).toEqual(['/buat-bkb', '/ruang-tunggu']);
    expect(menuUntukRole('operator')[1].label).toBe('BKB Saya');
  });
  it('operator tanpa izin membuat BKB (Pengaturan): hanya BKB Saya', () => {
    expect(menuUntukRole('operator', ['staff']).map((m) => m.href)).toEqual(['/ruang-tunggu']);
  });
  it('SK dan DE tidak punya Parameter, Pengaturan, Pengguna', () => {
    for (const r of ['staff', 'admin']) {
      expect(hrefs(r)).toEqual(['/', '/stok', '/aktivitas', '/ruang-tunggu', '/cek-stok', '/laporan']);
    }
  });
  it('superadmin punya semua menu kecuali Buat BKB, dan tidak ada Master Mesin', () => {
    expect(hrefs('superadmin')).toEqual(['/', '/stok', '/aktivitas', '/ruang-tunggu', '/cek-stok', '/laporan', '/parameter', '/pengaturan', '/user']);
    expect(hrefs('superadmin')).not.toContain('/mesin');
  });
  // [Tahap 2, 11-11-2026] Cek Stok dan Laporan tidak untuk operator
  it('operator tidak punya Cek Stok dan Laporan', () => {
    expect(hrefs('operator')).not.toContain('/cek-stok');
    expect(hrefs('operator')).not.toContain('/laporan');
  });
});
