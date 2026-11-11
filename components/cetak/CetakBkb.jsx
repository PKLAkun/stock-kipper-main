'use client';

// Pratinjau dan lembar cetak BKB (docs/ui/08-cetak-bkb.md). A5 lanskap, hitam putih.
// Shell aplikasi disembunyikan saat cetak oleh kelas print: di AppShell.

import { useState } from 'react';
import Link from 'next/link';
import { mutate } from 'swr';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import {
  RANGKAP, normalisasiBkb, bagiHalaman, daftarRangkap, pilihanRangkapValid, alasanTidakBisaCetak,
} from './bkb-cetak';

const KODE_FORM = 'FO-2300-6501';

const CSS = `
@media print {
  @page { size: A5 landscape; margin: 8mm; }
  html, body { background: #fff !important; }
  .bkb-area-layar { display: none !important; }
  .bkb-pratinjau { overflow: visible !important; border: 0 !important; padding: 0 !important; background: #fff !important; }
  .bkb-lembar { break-after: page; page-break-after: always; box-shadow: none !important; margin: 0 !important; }
  .bkb-lembar:last-child { break-after: auto; page-break-after: auto; }
}
.bkb-lembar { width: 194mm; height: 132mm; box-sizing: border-box; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.25; display: flex; flex-direction: column; overflow: hidden; }
.bkb-lembar * { color: #000; border-color: #000; }
.bkb-kepala { display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; }
.bkb-logo { width: 22mm; height: 12mm; }
.bkb-judul { border: 0.5pt solid #000; padding: 1.5mm 4mm; font-weight: 700; font-size: 11pt; letter-spacing: .03em; margin: 0; }
.bkb-meta td { padding: 0 1mm; vertical-align: top; }
.bkb-baris-info { margin-top: 1.5mm; }
.bkb-tabel { width: 100%; border-collapse: collapse; margin-top: 1.5mm; table-layout: fixed; }
.bkb-tabel th, .bkb-tabel td { border: 0.5pt solid #000; padding: 0 1.5mm; height: 5.5mm; text-align: left; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bkb-tabel th { font-weight: 700; }
.bkb-tabel td.r, .bkb-tabel th.r { text-align: right; }
.bkb-ttd { display: flex; margin-top: 2mm; border: 0.5pt solid #000; }
.bkb-ttd > div { flex: 1; padding: 1mm 2mm; border-right: 0.5pt solid #000; height: 25mm; display: flex; flex-direction: column; justify-content: space-between; }
.bkb-ttd > div:last-child { border-right: 0; }
.bkb-kaki { margin-top: auto; padding-top: 1.5mm; display: flex; justify-content: space-between; font-size: 8pt; }
.bkb-tebal { font-weight: 700; text-decoration: underline; }
`;

function Lembar({ data, halaman, totalHalaman, barisHalaman, rangkap, terakhir }) {
  return (
    <section className="bkb-lembar" aria-label={`Lembar BKB ${data.docNo}, ${rangkap.label}`}>
      <div className="bkb-kepala">
        <div className="bkb-logo" aria-hidden="true" />
        <h1 className="bkb-judul">BUKTI KELUAR BARANG</h1>
        <table className="bkb-meta">
          <tbody>
            <tr><td>No. BKB</td><td>: {data.docNo}</td></tr>
            <tr><td>No. Ref</td><td>: {data.reference}</td></tr>
            <tr><td>Tanggal</td><td>: {data.tanggal}</td></tr>
            {totalHalaman > 1 && <tr><td>Hal</td><td>: {halaman}/{totalHalaman}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="bkb-baris-info">Jenis : {data.jenis}</div>
      <div>Catatan : {data.catatan}</div>

      <table className="bkb-tabel">
        <colgroup>
          <col style={{ width: '22mm' }} /><col /><col style={{ width: '22mm' }} /><col style={{ width: '14mm' }} /><col style={{ width: '48mm' }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Kode</th><th scope="col">Nama Barang</th><th scope="col" className="r">QTY</th><th scope="col">Unit</th><th scope="col">Keterangan</th>
          </tr>
        </thead>
        <tbody>
          {barisHalaman.map((r, i) => (
            <tr key={i}>
              <td>{r.kode}</td><td>{r.nama}</td><td className="r">{r.qty}</td><td>{r.unit}</td><td>{r.keterangan}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {terakhir && (
        <>
          <div className="bkb-ttd">
            <div><span>Diserahkan Oleh,</span><span>( {data.diserahkan} )<br />Tanggal : ...........</span></div>
            <div><span>Diterima Oleh,</span><span>( {data.diterima} )<br />Tanggal : ...........</span></div>
            <div><span>Accounting,</span><span>(                    )<br />Tanggal : ...........</span></div>
          </div>
          <div className="bkb-kaki">
            <span>
              {RANGKAP.map((r, i) => {
                const teks = { asli: 'Asli : Accounting', copy1: 'Copy 1 : Yang Menerima', copy2: 'Copy 2 : Yang Menyerahkan' }[r.id];
                return <span key={r.id} className={r.id === rangkap.id ? 'bkb-tebal' : undefined}>{teks}{i < 2 ? '   ' : ''}</span>;
              })}
            </span>
            <span>{KODE_FORM}</span>
          </div>
        </>
      )}
    </section>
  );
}

export default function CetakBkb({ id, initialRangkap = 'semua' }) {
  const [rangkap, setRangkap] = useState(pilihanRangkapValid(initialRangkap));
  const url = `/api/bkb/${id}`;
  const { data: resp, error, isLoading } = useRealtimeSWR(url, swrFetcher, { subscribeTables: ['bkb'] });

  function ubahRangkap(v) {
    setRangkap(v);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('rangkap', v);
      window.history.replaceState(null, '', u);
    } catch { /* abaikan */ }
  }

  const kembali = (
    <Link href={`/bkb/${id}`} className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
      Kembali ke BKB
    </Link>
  );

  const data = resp?.data ? normalisasiBkb(resp.data) : null;
  const blokir = data ? alasanTidakBisaCetak(data.status) : null;
  const bisa = data && !blokir;

  let isi;
  if (isLoading) {
    isi = <Skeleton className="h-64 w-full" />;
  } else if (error?.status === 404 || error?.status === 403) {
    isi = <EmptyState title="BKB tidak ditemukan." action={<div className="mt-4">{kembali}</div>} />;
  } else if (error) {
    isi = (
      <EmptyState
        title="BKB tidak bisa dimuat."
        description="Periksa sambungan, lalu coba lagi."
        action={<button type="button" onClick={() => mutate(url)} className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Coba lagi</button>}
      />
    );
  } else if (blokir) {
    isi = <EmptyState title={blokir} action={<div className="mt-4">{kembali}</div>} />;
  } else if (data) {
    const halaman = bagiHalaman(data.baris);
    const lembarRangkap = daftarRangkap(rangkap);
    isi = (
      <div className="bkb-pratinjau overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100 p-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto flex w-max flex-col gap-4 print:gap-0">
          {lembarRangkap.flatMap((rg) =>
            halaman.map((barisHal, i) => (
              <Lembar
                key={`${rg.id}-${i}`} data={data} rangkap={rg}
                halaman={i + 1} totalHalaman={halaman.length}
                barisHalaman={barisHal} terakhir={i === halaman.length - 1}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <style>{CSS}</style>
      <div className="bkb-area-layar space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Cetak BKB {data?.docNo || ''}</h2>
          <p className="mt-1 text-sm text-slate-500">Pratinjau lembar BKB. Tombol Cetak membuka dialog cetak browser (A5 lanskap).</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Rangkap
            <select
              value={rangkap} onChange={(e) => ubahRangkap(e.target.value)}
              className="mt-1.5 block w-56 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="semua">Semua (3 lembar)</option>
              <option value="asli">Asli</option>
              <option value="copy1">Copy 1</option>
              <option value="copy2">Copy 2</option>
            </select>
          </label>
          <div className="flex gap-2">
            {kembali}
            <button
              type="button" disabled={!bisa} onClick={() => window.print()}
              className="min-h-[44px] rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cetak
            </button>
          </div>
        </div>
      </div>
      {isi && (blokir || !data ? <div className="bkb-area-layar">{isi}</div> : isi)}
    </div>
  );
}
