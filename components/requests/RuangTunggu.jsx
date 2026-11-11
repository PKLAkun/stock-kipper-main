'use client';

// Ruang Tunggu BKB (docs/ui/03). Daftar kartu per status; filter status disimpan di URL (?status=).
// Deep link ?bkb=<id> membuka kartu itu otomatis.
// DE/Superadmin: tampilan awal "Perlu tindakan saya" (approve + koreksi saldo), sama dengan lencana menu.

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher } from '@/lib/api-client';
import Skeleton from '@/components/ui/Skeleton';
import BkbCard from './BkbCard';
import {
  STATUS_FILTERS, STATUS_META, FILTER_PERLU, FILTER_SEMUA, LABEL_PERLU, filterDariUrl, isDE, perluTindakanDe,
} from './bkbStatus';

export default function RuangTunggu({ user }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const de = isDE(user.role);
  const statusFilter = filterDariUrl(sp.get('status') || '', user.role);
  const perlu = statusFilter === FILTER_PERLU;
  const openId = Number(sp.get('bkb')) || null;
  const opsi = { subscribeTables: ['bkb', 'bkb_items'] };

  const biasa = useRealtimeSWR(
    perlu ? null : `/api/bkb?limit=50${statusFilter ? `&status=${statusFilter}` : ''}`, swrFetcher, opsi,
  );
  // "Perlu tindakan saya" (DE): gabungan Menunggu approve DE dan Ditahan menunggu koreksi saldo
  const approve = useRealtimeSWR(perlu ? '/api/bkb?status=menunggu_de&limit=100' : null, swrFetcher, opsi);
  const ditahan = useRealtimeSWR(perlu ? '/api/bkb?status=ditahan&limit=100' : null, swrFetcher, opsi);

  const data = perlu ? (approve.data && ditahan.data ? true : undefined) : biasa.data;
  const error = perlu ? approve.error || ditahan.error : biasa.error;
  const isLoading = perlu ? approve.isLoading || ditahan.isLoading : biasa.isLoading;
  const refresh = () => (perlu ? Promise.all([approve.mutate(), ditahan.mutate()]) : biasa.mutate());
  // pengaturan dibutuhkan SK untuk tahu boleh approve atau tidak
  const { data: setting } = useRealtimeSWR('/api/pengaturan', swrFetcher, { subscribeTables: ['app_settings'] });
  const wajibApproveDe = setting?.data?.wajibApproveDe;

  const list = perlu ? perluTindakanDe(approve.data?.data, ditahan.data?.data) : biasa.data?.data || [];

  function pick(s) {
    const p = new URLSearchParams(sp.toString());
    if (s) p.set('status', s);
    else if (de) p.set('status', FILTER_SEMUA); // tanpa ?status= DE kembali ke "Perlu tindakan saya"
    else p.delete('status');
    router.replace(`${pathname}${p.toString() ? `?${p}` : ''}`);
  }

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Filter status" className="flex flex-wrap gap-2">
        {(de ? [FILTER_PERLU, ...STATUS_FILTERS] : STATUS_FILTERS).map((s) => (
          <button
            key={s || 'semua'}
            type="button"
            role="radio"
            aria-checked={statusFilter === s}
            onClick={() => pick(s)}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
              statusFilter === s
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {s === FILTER_PERLU ? LABEL_PERLU : s === '' ? 'Semua' : STATUS_META[s].label}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="space-y-3">
        {isLoading && !data && [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}

        {error && !data && (
          <div role="alert" className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            <span>Ruang Tunggu tidak bisa dimuat.</span>
            <button type="button" onClick={() => refresh()} className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-semibold">Coba lagi</button>
          </div>
        )}

        {data && list.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 py-12 text-center text-slate-500 dark:border-slate-700">
            <p className="text-sm">
              {perlu
                ? 'Tidak ada BKB yang perlu tindakan Anda.'
                : statusFilter ? `Tidak ada BKB dengan status "${STATUS_META[statusFilter].label}".` : 'Tidak ada BKB.'}
            </p>
            {user.role === 'operator' && (
              <Link href="/buat-bkb" className="mt-3 inline-block rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Buat BKB</Link>
            )}
          </div>
        )}

        {list.map((b) => (
          <BkbCard key={b.id} summary={b} user={user} defaultOpen={openId === b.id} wajibApproveDe={wajibApproveDe} />
        ))}
      </div>
    </div>
  );
}
