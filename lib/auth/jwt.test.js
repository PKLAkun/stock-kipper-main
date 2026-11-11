import { describe, it, expect } from 'vitest';
import { signSessionToken, renewSessionToken, verifySessionToken, hitungExpSesi } from './jwt.js';

const now = () => Math.floor(Date.now() / 1000);

describe('hitungExpSesi', () => {
  it('operator: shift habis lebih cepat dari jam sesi -> exp = shiftHabis', () => {
    expect(hitungExpSesi({ role: 'operator', shiftHabis: 5000 }, 8, 1000)).toBe(5000);
  });
  it('operator: shift habis lebih lama dari jam sesi -> exp = jam sesi', () => {
    expect(hitungExpSesi({ role: 'operator', shiftHabis: 1000 + 20 * 3600 }, 8, 1000)).toBe(1000 + 8 * 3600);
  });
  it('role lain: shiftHabis tidak membatasi exp', () => {
    for (const role of ['staff', 'admin', 'superadmin']) {
      expect(hitungExpSesi({ role, shiftHabis: 1500 }, 8, 1000)).toBe(1000 + 8 * 3600);
    }
  });
  it('operator tanpa shiftHabis -> jam sesi biasa', () => {
    expect(hitungExpSesi({ role: 'operator' }, 8, 1000)).toBe(1000 + 8 * 3600);
  });
});

describe('signSessionToken dan renewSessionToken', () => {
  it('operator: exp token = shiftHabis dan klaim shift terisi', async () => {
    const habis = now() + 1800;
    const p = await verifySessionToken(await signSessionToken({ sub: 1, role: 'operator', pv: 1, shift: '2', shiftHabis: habis }, 8));
    expect(p).toMatchObject({ role: 'operator', shift: '2', shiftHabis: habis, exp: habis });
  });
  it('staff: klaim shift terisi tapi exp tetap jam sesi biasa', async () => {
    const habis = now() + 1800;
    const p = await verifySessionToken(await signSessionToken({ sub: 2, role: 'staff', pv: 1, shift: '3', shiftHabis: habis }, 8));
    expect(p.shift).toBe('3');
    expect(p.exp).toBeGreaterThan(now() + 7 * 3600);
  });
  it('token tanpa shift (lama) tetap valid dan tidak membawa klaim shift', async () => {
    const p = await verifySessionToken(await signSessionToken({ sub: 2, role: 'staff', pv: 1 }, 8));
    expect(p.shift).toBeUndefined();
  });
  it('renew membawa shift dan shiftHabis, exp tetap', async () => {
    const habis = now() + 1800;
    const awal = await verifySessionToken(await signSessionToken({ sub: 1, role: 'operator', pv: 1, shift: '1', shiftHabis: habis }, 8));
    const baru = await verifySessionToken(await renewSessionToken(awal, awal.exp));
    expect(baru).toMatchObject({ shift: '1', shiftHabis: habis, exp: awal.exp });
  });
});
