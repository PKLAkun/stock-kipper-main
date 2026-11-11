// FILE: lib/laporan/excel.js
// Pembuat berkas Excel (.xlsx) untuk laporan (T-26). Dibuat di server dengan exceljs.
// Setiap fungsi mengembalikan Buffer. Kop di atas, header tebal, lebar kolom, angka 3 desimal.

import ExcelJS from 'exceljs';
import { jenisLabel, tanggalJamWib, periodeTeks, KATEGORI_LABEL } from './format.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FORMAT_ANGKA = '#,##0.000';

// laporan-<jenis>-<tanggal>.xlsx
export const namaFileLaporan = (jenis, tanggal) => `laporan-${jenis}-${tanggal}.xlsx`;

// kolom: [{ header, key, width, angka?, tengah? }]
function lembar({ judul, kop = [], kolom, baris, dibuat }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Stok Hub';
  wb.created = dibuat || new Date();
  const ws = wb.addWorksheet(judul.slice(0, 31));
  const lebar = kolom.length;

  const judulRow = ws.addRow([judul]);
  judulRow.font = { bold: true, size: 14 };
  ws.mergeCells(judulRow.number, 1, judulRow.number, Math.max(lebar, 1));
  for (const teks of kop) ws.addRow([teks]);
  ws.addRow([]);

  const header = ws.addRow(kolom.map((k) => k.header));
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  kolom.forEach((k, i) => { ws.getColumn(i + 1).width = k.width || 14; });
  for (const b of baris) {
    const row = ws.addRow(kolom.map((k) => (b[k.key] == null ? null : b[k.key])));
    kolom.forEach((k, i) => {
      const c = row.getCell(i + 1);
      if (k.angka) c.numFmt = FORMAT_ANGKA;
      if (k.tengah) c.alignment = { horizontal: 'center' };
    });
  }
  ws.views = [{ state: 'frozen', ySplit: header.number }];
  return { wb, ws, header };
}

async function keBuffer(wb) {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- mutasi ----------
export const KOLOM_MUTASI = [
  { header: 'Tanggal', key: 'tanggal', width: 17 },
  { header: 'No. BKB', key: 'docNo', width: 18 },
  { header: 'No. Urut', key: 'nomorUrut', width: 9, tengah: true },
  { header: 'Kode Barang', key: 'itemCode', width: 16 },
  { header: 'Nama Barang', key: 'itemName', width: 32 },
  { header: 'Jenis', key: 'jenis', width: 22 },
  { header: 'Keterangan', key: 'keterangan', width: 20 },
  { header: 'Masuk', key: 'masuk', width: 14, angka: true },
  { header: 'Keluar', key: 'keluar', width: 14, angka: true },
  { header: 'Saldo', key: 'saldo', width: 14, angka: true },
  { header: 'Petugas', key: 'petugas', width: 18 },
  { header: 'Shift', key: 'shift', width: 7, tengah: true },
];

export async function buatExcelMutasi({ rows, filter = {}, dibuat }) {
  const kop = [`Periode: ${periodeTeks(filter.dari, filter.sampai)}`, `Jumlah baris: ${rows.length}`];
  const baris = rows.map((r) => ({ ...r, tanggal: tanggalJamWib(r.tanggal), jenis: jenisLabel(r.jenis) }));
  const { wb } = lembar({ judul: 'Laporan Mutasi Stok', kop, kolom: KOLOM_MUTASI, baris, dibuat });
  return keBuffer(wb);
}

// ---------- rekap ----------
export const KOLOM_REKAP = [
  { header: 'Kode Barang', key: 'kode', width: 16 },
  { header: 'Nama Barang', key: 'nama', width: 32 },
  { header: 'Unit', key: 'unit', width: 8, tengah: true },
  { header: 'Saldo Awal', key: 'saldoAwal', width: 14, angka: true },
  { header: 'Masuk', key: 'masuk', width: 14, angka: true },
  { header: 'Keluar', key: 'keluar', width: 14, angka: true },
  { header: 'Koreksi / Cek Stok', key: 'koreksi', width: 16, angka: true },
  { header: 'Saldo Akhir', key: 'saldoAkhir', width: 14, angka: true },
  { header: 'Stok Minimum', key: 'stokMinimum', width: 14, angka: true },
  { header: 'Di Bawah Minimum', key: 'tanda', width: 18, tengah: true },
];

export async function buatExcelRekap({ rows, filter = {}, dibuat }) {
  const kop = [
    `Periode: ${periodeTeks(filter.dari, filter.sampai)}`,
    `Kategori: ${KATEGORI_LABEL[filter.kategori] || 'Semua'}`,
  ];
  const baris = rows.map((r) => ({ ...r, tanda: r.diBawahMinimum ? 'DI BAWAH MINIMUM' : '' }));
  const { ws } = lembar({ judul: 'Laporan Rekap Stok', kop, kolom: KOLOM_REKAP, baris, dibuat });
  // tandai baris di bawah minimum
  ws.eachRow((row) => {
    if (row.getCell(10).value === 'DI BAWAH MINIMUM') {
      row.font = { bold: true, color: { argb: 'FFB91C1C' } };
    }
  });
  return Buffer.from(await ws.workbook.xlsx.writeBuffer());
}

// ---------- kartu stok ----------
export const KOLOM_KARTU = [
  { header: 'Tanggal', key: 'tanggal', width: 17 },
  { header: 'Kode Input', key: 'jenis', width: 22 },
  { header: 'Kode Keterangan', key: 'kodeKeterangan', width: 20 },
  { header: 'No. BKB', key: 'docNo', width: 18 },
  { header: 'Masuk', key: 'masuk', width: 14, angka: true },
  { header: 'Keluar', key: 'keluar', width: 14, angka: true },
  { header: 'Saldo Akhir', key: 'saldoAkhir', width: 14, angka: true },
];

export async function buatExcelKartu({ kartu, dibuat }) {
  const kop = [
    `Nama barang: ${kartu.item.nama}`,
    `Kode barang: ${kartu.item.kode}`,
    `Periode: ${periodeTeks(kartu.dari, kartu.sampai)}`,
    `Saldo awal periode: ${kartu.saldoAwal}`,
  ];
  const baris = kartu.rows.map((r) => ({ ...r, tanggal: tanggalJamWib(r.tanggal) }));
  const { wb } = lembar({ judul: 'Kartu Stok', kop, kolom: KOLOM_KARTU, baris, dibuat });
  return keBuffer(wb);
}

// ---------- stok saat ini ----------
export const KOLOM_STOK = [
  { header: 'Kode Barang', key: 'kode', width: 16 },
  { header: 'Nama Barang', key: 'nama', width: 32 },
  { header: 'Unit', key: 'unit', width: 8, tengah: true },
  { header: 'Saldo Sistem', key: 'saldo', width: 14, angka: true },
  { header: 'Stok Minimum', key: 'stokMinimum', width: 14, angka: true },
  { header: 'Di Bawah Minimum', key: 'tanda', width: 18, tengah: true },
  { header: 'Fisik', key: 'fisik', width: 16 },
];

export async function buatExcelStok({ rows, filter = {}, dibuat }) {
  const d = dibuat || new Date();
  const kop = [
    `Per tanggal: ${tanggalJamWib(d.toISOString())}`,
    `Kategori: ${KATEGORI_LABEL[filter.kategori] || 'Semua'}`,
  ];
  const baris = rows.map((r) => ({ ...r, tanda: r.diBawahMinimum ? 'DI BAWAH MINIMUM' : '', fisik: null }));
  const { wb } = lembar({ judul: 'Stok Saat Ini', kop, kolom: KOLOM_STOK, baris, dibuat: d });
  return keBuffer(wb);
}

