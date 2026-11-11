import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buatExcelMutasi, buatExcelRekap, buatExcelKartu, buatExcelStok, namaFileLaporan, XLSX_MIME } from './excel.js';

async function baca(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets[0];
}
const teksBaris = (ws, n) => ws.getRow(n).values.slice(1);
// baris header = baris pertama dengan sel A berhuruf tebal setelah kop
function cariHeader(ws) {
  let hasil = null;
  ws.eachRow((row, n) => { if (!hasil && n > 1 && row.getCell(1).font?.bold) hasil = n; });
  return hasil;
}

describe('excel laporan', () => {
  it('mutasi: buffer .xlsx asli, header tebal, angka 3 desimal', async () => {
    const buf = await buatExcelMutasi({
      filter: { dari: '2026-11-01', sampai: '2026-11-11' },
      rows: [{ tanggal: '2026-11-10T01:00:00Z', docNo: 'PB1', nomorUrut: 1, itemCode: 'A', itemName: 'Alfa', jenis: 'PB', keterangan: 'BIP/AND/1', masuk: null, keluar: 2.5, saldo: 7.5, petugas: 'Sari', shift: '2' }],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    const ws = await baca(buf);
    expect(ws.getCell('A1').value).toBe('Laporan Mutasi Stok');
    const h = cariHeader(ws);
    expect(teksBaris(ws, h)).toEqual(['Tanggal', 'No. BKB', 'No. Urut', 'Kode Barang', 'Nama Barang', 'Jenis', 'Keterangan', 'Masuk', 'Keluar', 'Saldo', 'Petugas', 'Shift']);
    const r = ws.getRow(h + 1);
    expect(r.getCell(1).value).toBe('10/11/2026 08:00');
    expect(r.getCell(6).value).toBe('Pemakaian');
    expect(r.getCell(9).value).toBe(2.5);
    expect(r.getCell(9).numFmt).toBe('#,##0.000');
    expect(r.getCell(8).value).toBeNull();
  });
  it('rekap: baris di bawah minimum ditandai', async () => {
    const ws = await baca(await buatExcelRekap({
      filter: { dari: '2026-11-01', sampai: '2026-11-11', kategori: '1' },
      rows: [{ kode: 'A', nama: 'Alfa', unit: 'kg', saldoAwal: 5, masuk: 1, keluar: 2, koreksi: 0, saldoAkhir: 4, stokMinimum: 10, diBawahMinimum: true }],
    }));
    const h = cariHeader(ws);
    expect(teksBaris(ws, h)[9]).toBe('Di Bawah Minimum');
    expect(ws.getRow(h + 1).getCell(10).value).toBe('DI BAWAH MINIMUM');
    expect(JSON.stringify(ws.getRow(3).values)).toContain('Raw Material');
  });
  it('kartu: kop memuat nama, kode barang, periode', async () => {
    const ws = await baca(await buatExcelKartu({
      kartu: { item: { nama: 'Alfa', kode: 'A-1' }, dari: '2026-11-01', sampai: '2026-11-11', saldoAwal: 10, saldoAkhir: 6,
        rows: [{ tanggal: '2026-11-03T03:00:00Z', jenis: 'PB', kodeKeterangan: 'BIP/AND/1', docNo: 'PB1', masuk: null, keluar: 4, saldoAkhir: 6 }] },
    }));
    expect(ws.getCell('A2').value).toBe('Nama barang: Alfa');
    expect(ws.getCell('A3').value).toBe('Kode barang: A-1');
    expect(ws.getCell('A4').value).toContain('01/11/2026 s/d 11/11/2026');
    const h = cariHeader(ws);
    expect(teksBaris(ws, h)).toEqual(['Tanggal', 'Kode Input', 'Kode Keterangan', 'No. BKB', 'Masuk', 'Keluar', 'Saldo Akhir']);
    expect(ws.getRow(h + 1).getCell(3).value).toBe('BIP/AND/1');
  });
  it('stok: ada kolom Fisik kosong', async () => {
    const ws = await baca(await buatExcelStok({
      dibuat: new Date('2026-11-11T03:00:00Z'),
      rows: [{ kode: 'A', nama: 'Alfa', unit: 'kg', saldo: 3, stokMinimum: null, diBawahMinimum: false }],
    }));
    const h = cariHeader(ws);
    expect(teksBaris(ws, h).at(-1)).toBe('Fisik');
    expect(ws.getRow(h + 1).getCell(7).value).toBeNull();
    expect(ws.getCell('A2').value).toBe('Per tanggal: 11/11/2026 10:00');
  });
  it('tanpa baris tetap menghasilkan berkas', async () => {
    expect((await buatExcelMutasi({ rows: [] })).length).toBeGreaterThan(100);
  });
  it('nama file dan mime', () => {
    expect(namaFileLaporan('rekap', '2026-11-11')).toBe('laporan-rekap-2026-11-11.xlsx');
    expect(XLSX_MIME).toContain('spreadsheetml');
  });
});
