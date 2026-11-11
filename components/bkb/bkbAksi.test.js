import { describe, it, expect } from 'vitest';
import { aksiTersedia, dampakKeDialog, labelAksiRiwayat, ringkasPerubahan } from './bkbAksi.js';

const selesai = { status: 'selesai' };

describe('aksiTersedia', () => {
  it('operator tidak punya aksi', () => {
    expect(Object.values(aksiTersedia('operator', selesai)).some((v) => v === true)).toBe(false);
  });
  it('SK: cetak dan buat pengganti untuk BKB selesai, tanpa ubah/batal/ganti', () => {
    expect(aksiTersedia('staff', selesai)).toMatchObject({ cetak: true, buatPengganti: true, ubahData: false, batal: false, ganti: false });
  });
  it('SK: BKB belum tersimpan -> buka di Ruang Tunggu', () => {
    expect(aksiTersedia('staff', { status: 'ditahan' })).toMatchObject({ bukaRuangTunggu: true, cetak: false, buatPengganti: false });
    // BKB pengganti mengikuti Pengaturan peran_buat_bkb
    expect(aksiTersedia('staff', selesai, null, ['admin'])).toMatchObject({ buatPengganti: false });
    expect(aksiTersedia('admin', selesai, null, ['admin'])).toMatchObject({ buatPengganti: true, ubahData: true });
  });
  it('DE dan SA: ubah, batal; ganti hanya bila ada pengganti', () => {
    for (const role of ['admin', 'superadmin']) {
      expect(aksiTersedia(role, selesai)).toMatchObject({ ubahData: true, batal: true, ganti: false });
    }
    expect(aksiTersedia('admin', selesai).gantiNonaktifAlasan).toMatch(/SK membuat BKB pengganti/);
    expect(aksiTersedia('admin', selesai, { id: 9 }).ganti).toBe(true);
  });
  it('BKB diganti/dibatalkan: tanpa aksi', () => {
    for (const status of ['diganti', 'dibatalkan']) {
      const a = aksiTersedia('admin', { status });
      expect(a.ubahData || a.batal || a.cetak || a.ganti).toBe(false);
    }
  });
});

describe('dampakKeDialog', () => {
  it('minus menjadi blocker; selisih besar dan >7 hari menjadi peringatan', () => {
    const r = dampakKeDialog({ baris: [{ itemCode: 'A', itemName: 'a', saldoSekarang: 10, saldoSesudah: -2 }], peringatan: ['minus', 'selisih_besar', 'lebih_7_hari'] }, 'batal');
    expect(r.blockers).toHaveLength(1);
    expect(r.warnings).toHaveLength(2);
    expect(r.stockRows[0]).toMatchObject({ kode: 'A', perubahan: '-12', sebelum: '10', sesudah: '-2' });
  });
  it('null aman', () => {
    expect(dampakKeDialog(null, 'batal').blockers).toEqual([]);
  });
});

describe('riwayat', () => {
  it('label dan ringkasan perubahan', () => {
    expect(labelAksiRiwayat('ubah_data')).toBe('Data diubah');
    expect(labelAksiRiwayat('aneh_baru')).toBe('aneh baru');
    expect(ringkasPerubahan({ machine: 'M1' }, { machine: 'M2', items: [] })).toBe('Mesin M1 menjadi M2');
  });
});
