'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { STATUS_META } from '@/components/requests/bkbStatus';
import { formatDateTime, formatNumber } from '@/lib/utils';
import { BatalBkbDialog, GantiBkbDialog } from './BkbAksiDialogs';
import BkbUbahDataModal from './BkbUbahDataModal';
import { usePeranBuatPengganti } from '@/hooks/usePeranBuatBkb';
import { aksiTersedia, isDE, labelAksiRiwayat, ringkasPerubahan, STATUS_PENJELASAN_OPERATOR } from './bkbAksi';

const fmtTgl = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
const btn = 'inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
const btnSecondary = `${btn} border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800`;

// BKB pengganti yang menunggu Ganti oleh DE: pengganti selalu berstatus menunggu_de setelah SK mengisi saldo.
async function cariPengganti(idLama) {
  const list = await swrFetcher('/api/bkb?status=menunggu_de&limit=50');
  const rows = list.data || [];
  const cocok = rows.find((r) => Number(r.menggantiBkbId) === idLama);
  if (cocok) return cocok;
  if (rows.some((r) => r.menggantiBkbId !== undefined)) return null;
  // ringkasan daftar belum membawa menggantiBkbId: cek detail
  for (const r of rows) {
    const d = (await swrFetcher(`/api/bkb/${r.id}`)).data;
    if (Number(d.menggantiBkbId) === idLama) return { id: d.id, docNo: d.docNo };
  }
  return null;
}

export default function BkbDetail({ id, user }) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState(null); // 'batal' | 'ganti' | 'ubah'
  const role = user.role;
  const operator = role === 'operator';

  const { data, error, isLoading, mutate: reload } = useRealtimeSWR(`/api/bkb/${id}`, swrFetcher, {
    subscribeTables: ['bkb', 'bkb_items', 'transactions_log'],
  });
  const bkb = data?.data;

  const perluPengganti = isDE(role) && bkb?.status === 'selesai';
  const { data: pengganti } = useRealtimeSWR(perluPengganti ? `pengganti:${id}` : null, () => cariPengganti(Number(id)), {
    subscribeTables: ['bkb'],
  });

  const kembali = (
    <button type="button" onClick={() => router.back()} className="text-sm font-medium text-brand-600 hover:underline">&lsaquo; Kembali</button>
  );

  const peranBuatPengganti = usePeranBuatPengganti();
  if (isLoading && !bkb) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  }
  if (error?.status === 404 || error?.status === 403) {
    return <EmptyState title="BKB tidak ditemukan." action={<div className="mt-4">{kembali}</div>} />;
  }
  if (error && !bkb) {
    return <EmptyState title="Detail BKB tidak bisa dimuat." description={error.message} action={<button type="button" onClick={() => reload()} className={`${btnSecondary} mt-4`}>Coba lagi</button>} />;
  }
  if (!bkb) return null;

  const meta = STATUS_META[bkb.status] || { label: bkb.status, tone: 'slate' };
  const aksi = aksiTersedia(role, bkb, pengganti, peranBuatPengganti);
  const selesaiAksi = (pesan) => {
    toast(pesan);
    reload();
    mutate((k) => typeof k === 'string' && k.startsWith('/api/'));
  };
  const riwayat = [...(bkb.riwayat || [])].reverse();

  return (
    <div className="space-y-5">
      {kembali}
      <div>
        <h1 className="flex flex-wrap items-center gap-3 text-xl font-bold text-slate-900 dark:text-white">
          <span>BKB {bkb.docNo}</span> <Badge tone={meta.tone}>{meta.label}</Badge>
        </h1>
        {operator && <p className="mt-1 text-sm text-slate-500">{STATUS_PENJELASAN_OPERATOR[bkb.status]}</p>}
      </div>

      {(aksi.cetak || aksi.bukaRuangTunggu || aksi.buatPengganti || aksi.ubahData || aksi.batal || isDE(role) && bkb.status === 'selesai') && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {aksi.bukaRuangTunggu && <Link href={`/ruang-tunggu?status=${bkb.status}&bkb=${bkb.id}`} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>Buka di Ruang Tunggu</Link>}
          {aksi.cetak && <Link href={`/bkb/${bkb.id}/cetak`} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>Cetak</Link>}
          {aksi.buatPengganti && <Link href={`/buat-bkb/pengganti/${bkb.id}`} className={btnSecondary}>Buat BKB pengganti</Link>}
          {aksi.ubahData && <button type="button" onClick={() => setDialog('ubah')} className={btnSecondary}>Ubah data</button>}
          {isDE(role) && bkb.status === 'selesai' && (
            <button type="button" disabled={!aksi.ganti} onClick={() => setDialog('ganti')} className={btnSecondary}>Ganti BKB</button>
          )}
          {aksi.batal && <button type="button" onClick={() => setDialog('batal')} className={`${btn} border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-slate-800`}>Batalkan BKB</button>}
        </div>
      )}
      {aksi.gantiNonaktifAlasan && <p className="-mt-3 text-xs text-slate-500">Ganti BKB: {aksi.gantiNonaktifAlasan}</p>}

      {pengganti && isDE(role) && bkb.status === 'selesai' && (
        <Banner>Pengganti {pengganti.docNo} menunggu Ganti BKB oleh DE. <Link href={`/bkb/${pengganti.id}`} className="font-semibold underline">Lihat</Link></Banner>
      )}
      {bkb.status === 'diganti' && bkb.digantiOlehBkbId && (
        <Banner>Diganti oleh BKB <Link href={`/bkb/${bkb.digantiOlehBkbId}`} className="font-semibold underline">#{bkb.digantiOlehBkbId}</Link>. Tidak ada aksi lagi.</Banner>
      )}
      {bkb.menggantiBkbId && (
        <Banner>Mengganti BKB <Link href={`/bkb/${bkb.menggantiBkbId}`} className="font-semibold underline">#{bkb.menggantiBkbId}</Link></Banner>
      )}
      {bkb.status === 'dibatalkan' && !operator && (
        <Banner>Dibatalkan oleh {bkb.dibatalkanOlehNama || '-'}{bkb.dibatalkanAt ? `, ${formatDateTime(bkb.dibatalkanAt)}` : ''}.{bkb.alasan ? ` Alasan: ${bkb.alasan}` : ''}</Banner>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <InfoBox label="Keterangan" value={bkb.tujuanKode} />
        <InfoBox label="Jenis" value={bkb.jenisKode} />
        <InfoBox label="Tanggal" value={fmtTgl(bkb.bkbDate)} />
        <InfoBox label="Pemohon" value={operator ? (bkb.sumber === 'operator' ? 'Operator' : 'Stock keeper') : `${bkb.pihakNama || bkb.dibuatOlehNama || '-'}${bkb.sumber === 'operator' ? ' (Operator)' : ''}`} />
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        <Row k="Shift" v={bkb.reference || '-'} />
        <Row k="Kode keterangan" v={bkb.keterangan || '-'} />
        <Row k="Mesin" v={bkb.machine || 'Tidak berlaku'} />
        {!operator && bkb.dikonfirmasiOlehNama && <Row k="Dicek SK" v={`${bkb.dikonfirmasiOlehNama}${bkb.dikonfirmasiAt ? `, ${formatDateTime(bkb.dikonfirmasiAt)}` : ''}`} />}
        {!operator && bkb.disimpanOlehNama && <Row k="Disimpan oleh" v={`${bkb.disimpanOlehNama}${bkb.modeApprove === 'de' ? ' (approve DE)' : ''}`} />}
      </dl>

      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <h2 className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-800 dark:border-slate-800 dark:text-slate-100">Barang</h2>
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="text-xs text-slate-400">
                {!operator && <th scope="col" className="px-3 py-2 font-medium">No. urut</th>}
                <th scope="col" className="px-3 py-2 font-medium">Kode</th>
                <th scope="col" className="px-3 py-2 font-medium">Nama Barang</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">QTY</th>
                <th scope="col" className="px-3 py-2 font-medium">Dept pemakai</th>
                {/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak ditampilkan lagi (K-30). */}
                {/* <th scope="col" className="px-3 py-2 font-medium">Dept proses</th> */}
                {!operator && <th scope="col" className="px-3 py-2 text-right font-medium">Saldo SK</th>}
                {!operator && <th scope="col" className="px-3 py-2 text-right font-medium">Saldo sistem</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {bkb.items.map((l) => (
                <tr key={l.id} className="text-slate-700 dark:text-slate-200">
                  {!operator && <td className="px-3 py-2 font-mono">{l.nomorUrut ?? '-'}</td>}
                  <td className="px-3 py-2 font-mono font-semibold">{l.itemCode}</td>
                  <td className="px-3 py-2">{l.itemName}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNumber(l.qty)} <span className="font-normal text-slate-400">{l.unit}</span></td>
                  <td className="px-3 py-2">{l.deptPemakaiKode || '-'}</td>
                  {/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak ditampilkan lagi (K-30). */}
                  {/* <td className="px-3 py-2">{l.deptProsesKode || '-'}</td> */}
                  {!operator && <td className="px-3 py-2 text-right tabular-nums">{l.saldoSk != null ? formatNumber(l.saldoSk) : '-'}</td>}
                  {!operator && <td className="px-3 py-2 text-right tabular-nums">{l.saldoSetelah != null ? formatNumber(l.saldoSetelah) : '-'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!operator && (
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <h2 className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-800 dark:border-slate-800 dark:text-slate-100">Riwayat BKB</h2>
          {riwayat.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-400">Belum ada riwayat.</p>
          ) : (
            <ol className="divide-y divide-slate-100 dark:divide-slate-800">
              {riwayat.map((r) => {
                const ringkas = r.aksi === 'ubah_data' ? ringkasPerubahan(r.dataLama, r.dataBaru) : '';
                return (
                  <li key={r.id} className="px-5 py-3 text-sm text-slate-700 dark:text-slate-200">
                    <time dateTime={r.createdAt} className="mr-2 text-xs text-slate-400">{formatDateTime(r.createdAt)}</time>
                    <span className="font-medium">{labelAksiRiwayat(r.aksi)}</span>
                    {r.actorName && <span className="text-slate-500"> ({r.actorName})</span>}
                    {ringkas && <p className="text-xs text-slate-500">{ringkas}</p>}
                    {r.alasan && <p className="text-xs text-slate-500">Alasan: {r.alasan}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      {aksi.batal && <BatalBkbDialog open={dialog === 'batal'} onClose={() => setDialog(null)} bkb={bkb} onDone={selesaiAksi} />}
      {aksi.ganti && pengganti && <GantiBkbDialog open={dialog === 'ganti'} onClose={() => setDialog(null)} bkb={bkb} pengganti={pengganti} onDone={selesaiAksi} />}
      {aksi.ubahData && <BkbUbahDataModal open={dialog === 'ubah'} onClose={() => setDialog(null)} bkb={bkb} onDone={selesaiAksi} />}
    </div>
  );
}

function Banner({ children }) {
  return <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">{children}</div>;
}
function Row({ k, v }) {
  return <div className="flex gap-2"><dt className="text-slate-400">{k}</dt><dd className="font-medium text-slate-800 dark:text-slate-100">{v}</dd></div>;
}
function InfoBox({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}
