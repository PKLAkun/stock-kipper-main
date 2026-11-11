'use client';

// Daftar Cek Stok (docs/ui/09-cek-stok.md). Filter status disimpan di URL (?status=&page=).
// Data hidup lewat useRealtimeSWR (tabel opname, opname_items, items).

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher } from '@/lib/api-client';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Pagination from '@/components/ui/Pagination';
import { formatDateTime } from '@/lib/utils';
import { ALASAN_LABEL, STATUS_META, STATUS_FILTERS, bolehBuat } from './opnameLogic';

const LIMIT = 20;

export default function CekStokList({ user }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const statusParam = sp.get('status') || '';
  const status = STATUS_FILTERS.includes(statusParam) ? statusParam : '';
  const page = Math.max(1, Number(sp.get('page')) || 1);

  const { data, error, isLoading, mutate } = useRealtimeSWR(
    `/api/opname?limit=${LIMIT}&page=${page}${status ? `&status=${status}` : ''}`,
    swrFetcher,
    { subscribeTables: ['opname', 'opname_items', 'items'] },
  );
  const list = data?.data || [];
  const meta = data?.meta;

  function ubah(next) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, String(v)); else p.delete(k);
    }
    router.replace(`${pathname}${p.toString() ? `?${p}` : ''}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Filter status" className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s || 'semua'} type="button" role="radio" aria-checked={status === s}
              onClick={() => ubah({ status: s, page: '' })}
              className={`min-h-[40px] rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                status === s ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {s ? STATUS_META[s].label : 'Semua'}
            </button>
          ))}
        </div>
        {bolehBuat(user.role) && (
          <Link href="/cek-stok/baru" className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Buat Cek Stok
          </Link>
        )}
      </div>

      <div aria-live="polite" className="space-y-3">
        {isLoading && !data && [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}

        {error && !data && (
          <div role="alert" className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            <span>Daftar Cek Stok tidak bisa dimuat.</span>
            <button type="button" onClick={() => mutate()} className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-semibold">Coba lagi</button>
          </div>
        )}

        {data && list.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500 dark:border-slate-700">
            {status ? `Tidak ada Cek Stok berstatus "${STATUS_META[status].label}".` : 'Belum ada Cek Stok.'}
          </div>
        )}

        {list.map((o) => (
          <Link
            key={o.id} href={`/cek-stok/${o.id}`}
            className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-400 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{o.nomor}</span>
              <Badge tone={STATUS_META[o.status]?.tone}>{STATUS_META[o.status]?.label || o.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {ALASAN_LABEL[o.alasanJenis]} · {o.jumlahBaris} barang · tanggal {o.tanggal}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Dibuat oleh {o.dibuatOlehNama || '-'}, {formatDateTime(o.createdAt)}
              {o.status === 'diajukan' && o.diajukanAt ? ` · diajukan ${formatDateTime(o.diajukanAt)}` : ''}
            </p>
          </Link>
        ))}
      </div>

      {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onChange={(p) => ubah({ page: p > 1 ? p : '' })} />}
    </div>
  );
}
