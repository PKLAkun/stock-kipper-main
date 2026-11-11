'use client';

// Halaman cetak laporan: pratinjau di layar + lembar cetak hitam putih (window.print, "Simpan sebagai PDF").
// Filter dibaca dari query halaman (sama dengan filter di layar Laporan).

import Link from 'next/link';
import { mutate } from 'swr';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import { KATEGORI_LABEL, periodeTeks, tanggalJamWib } from '@/lib/laporan/format';
import LaporanTabel, { KartuKop } from './LaporanTabel';
import LaporanRingkasan from './LaporanRingkasan';
import { TABS, hitungRingkasan, queryDariFilterCetak, kekuranganFilter } from './laporan-query';

const MAKS_CETAK = 50000;

const CSS = `
.lap-lembar { background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.3; padding: 6mm; }
.lap-lembar * { color: #000; border-color: #000; }
.lap-judul { font-size: 13pt; font-weight: 700; margin: 0; }
.lap-sub { margin: 1mm 0 3mm; }
.lap-kop { display: grid; gap: 0.5mm; margin: 0 0 3mm; }
.lap-kop > div { display: flex; gap: 2mm; }
.lap-kop-l { width: 28mm; flex-shrink: 0; }
.lap-kop-v { margin: 0; font-weight: 700; }
.lap-ringkasan { display: flex; flex-wrap: wrap; gap: 6mm; margin: 0 0 3mm; }
.lap-ringkasan dt { font-size: 8pt; }
.lap-ringkasan-nilai { margin: 0; font-weight: 700; }
.lap-tabel { width: 100%; border-collapse: collapse; }
.lap-tabel th, .lap-tabel td { border: 0.5pt solid #000; padding: 0.8mm 1.5mm; vertical-align: top; }
.lap-tabel th { font-weight: 700; background: #e5e5e5; }
.lap-tabel thead { display: table-header-group; }
.lap-tabel tr { break-inside: avoid; page-break-inside: avoid; }
.lap-tabel .text-right { text-align: right; }
.lap-tabel .text-center { text-align: center; }
.lap-tabel .text-left { text-align: left; }
.lap-tabel .whitespace-nowrap { white-space: nowrap; }
.lap-tabel .font-semibold { font-weight: 700; }
.lap-bawah td { font-weight: 700; }
.lap-fisik { min-width: 28mm; height: 8mm; }
.lap-kosong { text-align: center; padding: 6mm; }
@media print {
  @page { size: A4 LANDSCAPE; margin: 8mm; }
  html, body { background: #fff !important; }
  .lap-area-layar { display: none !important; }
  .lap-pratinjau { overflow: visible !important; border: 0 !important; padding: 0 !important; background: #fff !important; }
  .lap-lembar { padding: 0 !important; box-shadow: none !important; width: auto !important; }
}
`;

export default function LaporanCetak({ tab, filter }) {
  const info = TABS.find((t) => t.id === tab) || TABS[0];
  const kurang = kekuranganFilter(tab, { ...filter, item: filter.itemId ? { id: filter.itemId } : null });
  const url = kurang ? null : `/api/laporan/${tab}?${queryDariFilterCetak(tab, filter, tab === 'mutasi' ? { limit: MAKS_CETAK } : {})}`;
  const { data: resp, error, isLoading } = useRealtimeSWR(url, swrFetcher, { subscribeTables: ['items', 'transactions_log'], pollInterval: 0 });
  const data = resp?.data ?? null;

  const kembali = (
    <Link href={`/laporan?tab=${tab}`} className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
      Kembali ke Laporan
    </Link>
  );

  const periode = tab === 'stok' ? `Per tanggal ${tanggalJamWib(new Date().toISOString())}` : periodeTeks(filter.dari, filter.sampai);
  const sebagian = tab === 'mutasi' && data && data.total > data.rows.length;

  let isi;
  if (kurang) isi = <EmptyState title={kurang} action={<div className="mt-4">{kembali}</div>} />;
  else if (error && !data) {
    isi = (
      <EmptyState
        title="Laporan tidak bisa dimuat." description={error.message}
        action={<button type="button" onClick={() => mutate(url)} className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Coba lagi</button>}
      />
    );
  } else if (isLoading && !data) isi = <Skeleton className="h-64 w-full" />;
  else if (data) {
    isi = (
      <div className="lap-pratinjau overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100 p-3 dark:border-slate-700 dark:bg-slate-800">
        <section className="lap-lembar mx-auto min-w-[720px] max-w-[297mm]" aria-label={info.judul}>
          <h1 className="lap-judul">{info.judul}</h1>
          <p className="lap-sub">
            {tab === 'kartu' ? null : `Periode: ${periode}`}
            {tab !== 'kartu' && filter.kategori ? ` | Kategori: ${KATEGORI_LABEL[filter.kategori]}` : ''}
          </p>
          {tab === 'kartu' && <KartuKop kartu={data} cetak />}
          <LaporanRingkasan items={hitungRingkasan(tab, data)} cetak />
          <LaporanTabel tab={tab} data={data} cetak />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <style>{CSS}</style>
      <div className="lap-area-layar space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Cetak {info.judul}</h2>
          <p className="mt-1 text-sm text-slate-500">Pratinjau. Tombol Cetak / PDF membuka dialog cetak browser (A4 lanskap); pilih &quot;Simpan sebagai PDF&quot; untuk berkas PDF.</p>
        </div>
        {sebagian && (
          <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
            Hanya {data.rows.length.toLocaleString('id-ID')} dari {data.total.toLocaleString('id-ID')} baris yang dicetak. Persempit filter agar semua baris ikut.
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-3">
          {kembali}
          <button
            type="button" disabled={!data} onClick={() => window.print()}
            className="min-h-[44px] rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cetak / PDF
          </button>
        </div>
      </div>
      {isi && (data ? isi : <div className="lap-area-layar">{isi}</div>)}
    </div>
  );
}
