'use client';

// Menu Laporan (docs/ui/10-laporan.md): empat tab, filter, tabel, ringkasan, Cetak / PDF, Unduh Excel.

import { useState } from 'react';
import Link from 'next/link';
import { mutate } from 'swr';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import EmptyState from '@/components/ui/EmptyState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import Pagination from '@/components/ui/Pagination';
import { cx } from '@/lib/utils';
import LaporanFilter from './LaporanFilter';
import LaporanTabel, { KartuKop } from './LaporanTabel';
import LaporanRingkasan from './LaporanRingkasan';
import { TABS, tabValid, filterBawaan, buatQuery, kekuranganFilter, hitungRingkasan } from './laporan-query';

const PER_HALAMAN = 200;
const TABEL_REALTIME = ['items', 'transactions_log'];

function namaBerkas(res, tab) {
  const m = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '');
  return m ? m[1] : `laporan-${tab}.xlsx`;
}

export default function LaporanPage({ initialTab = 'mutasi' }) {
  const toast = useToast();
  const [tab, setTabState] = useState(tabValid(initialTab));
  const [draf, setDraf] = useState(() => Object.fromEntries(TABS.map((t) => [t.id, filterBawaan(t.id)])));
  const [terapan, setTerapan] = useState(() => Object.fromEntries(TABS.map((t) => [t.id, filterBawaan(t.id)])));
  const [halaman, setHalaman] = useState(1);
  const [pesan, setPesan] = useState('');
  const [mengunduh, setMengunduh] = useState(false);

  const filter = terapan[tab];
  const kurang = kekuranganFilter(tab, filter);
  const extra = tab === 'mutasi' ? { limit: PER_HALAMAN, offset: (halaman - 1) * PER_HALAMAN } : {};
  const url = kurang ? null : `/api/laporan/${tab}?${buatQuery(tab, filter, extra)}`;
  const { data: resp, error, isLoading } = useRealtimeSWR(url, swrFetcher, { subscribeTables: TABEL_REALTIME });
  const data = resp?.data ?? null;

  function pilihTab(id) {
    setTabState(id);
    setPesan('');
    setHalaman(1);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('tab', id);
      window.history.replaceState(null, '', u);
    } catch { /* abaikan */ }
  }

  function tampilkan() {
    const msg = kekuranganFilter(tab, draf[tab]);
    setPesan(msg || '');
    if (msg) return;
    setHalaman(1);
    setTerapan((s) => ({ ...s, [tab]: draf[tab] }));
  }

  async function unduhExcel() {
    if (kurang || mengunduh) return;
    setMengunduh(true);
    try {
      const res = await fetch(`/api/laporan/${tab}?${buatQuery(tab, filter, { format: 'xlsx' })}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || 'Gagal mengunduh Excel.');
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = namaBerkas(res, tab);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      toast.error('Gagal mengunduh Excel. Periksa sambungan, lalu coba lagi.');
    } finally {
      setMengunduh(false);
    }
  }

  const adaData = data && !kurang;
  const totalHalaman = tab === 'mutasi' && data?.total ? Math.ceil(data.total / PER_HALAMAN) : 1;
  const tombol = 'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800';

  let isi;
  if (kurang) {
    isi = <EmptyState title={kurang} />;
  } else if (error && !data) {
    isi = (
      <EmptyState
        title="Laporan tidak bisa dimuat."
        description={error.message}
        action={<button type="button" onClick={() => mutate(url)} className={cx(tombol, 'mt-4')}>Coba lagi</button>}
      />
    );
  } else if (isLoading && !data) {
    isi = <SkeletonTable rows={6} />;
  } else if (adaData) {
    isi = (
      <div className="space-y-4">
        {tab === 'kartu' && <KartuKop kartu={data} />}
        <LaporanRingkasan items={hitungRingkasan(tab, data)} />
        <LaporanTabel tab={tab} data={data} />
        {tab === 'mutasi' && <Pagination page={halaman} totalPages={totalHalaman} onChange={setHalaman} />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Laporan</h1>
        <p className="mt-1 text-sm text-slate-500">Mutasi, rekap stok, kartu stok, dan stok saat ini. Bisa dicetak atau diunduh sebagai Excel.</p>
      </div>

      <div role="tablist" aria-label="Jenis laporan" className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => pilihTab(t.id)}
            className={cx(
              'whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition',
              tab === t.id ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <LaporanFilter key={tab} tab={tab} filter={draf[tab]} onChange={(f) => setDraf((s) => ({ ...s, [tab]: f }))} onSubmit={tampilkan} pesan={pesan} />

      <div className="flex flex-wrap gap-2">
        <Link
          href={kurang ? '#' : `/laporan/cetak?tab=${tab}&${buatQuery(tab, filter)}`}
          aria-disabled={Boolean(kurang)} tabIndex={kurang ? -1 : undefined}
          className={tombol}
        >
          Cetak / PDF
        </Link>
        <button type="button" onClick={unduhExcel} disabled={Boolean(kurang) || mengunduh} className={tombol}>
          {mengunduh ? 'Menyiapkan Excel...' : 'Unduh Excel'}
        </button>
      </div>

      {isi}
    </div>
  );
}
