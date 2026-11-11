'use client';

// Kartu BKB di Ruang Tunggu (docs/ui/03). Detail dimuat saat kartu dibuka dan
// diperbarui realtime. Semua langkah SK dan DE berlangsung di dalam kartu.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { mutate } from 'swr';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher, apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { formatNumber } from '@/lib/utils';
import KonfirmasiSaldo from './KonfirmasiSaldo';
import HasilSaldo from './HasilSaldo';
import BetulkanBkb from './BetulkanBkb';
import { STATUS_META, ditahanKeterangan, isDE, bisaBatalSebelumTersimpan } from './bkbStatus';

const tgl = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const refreshAll = () => mutate((k) => typeof k === 'string' && k.startsWith('/api/bkb'));
const btnGhost = 'rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800';

export default function BkbCard({ summary, user, defaultOpen, wajibApproveDe }) {
  const toast = useToast();
  const cardRef = useRef(null);
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [mode, setMode] = useState('');          // '', 'betulkan', 'hasil'
  const [baseVersi, setBaseVersi] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState('');      // '', 'batal', 'kembalikan'

  const { data, error, isLoading } = useRealtimeSWR(
    open ? `/api/bkb/${summary.id}` : null,
    swrFetcher,
    { subscribeTables: ['bkb', 'bkb_items'] },
  );
  const bkb = data?.data;

  useEffect(() => { if (defaultOpen) cardRef.current?.scrollIntoView({ block: 'start' }); }, [defaultOpen]);
  // versi saat kartu pertama dimuat: bila berubah oleh pihak lain, kartu dikunci
  useEffect(() => { if (bkb && baseVersi === null) setBaseVersi(bkb.versi); }, [bkb, baseVersi]);

  const stale = Boolean(bkb && baseVersi && bkb.versi !== baseVersi);
  const status = bkb?.status || summary.status;
  const meta = STATUS_META[status] || { label: status, tone: 'slate' };
  const role = user.role;
  const isSK = role === 'staff';
  const canApprove = status === 'menunggu_de' && (isDE(role) || (isSK && wajibApproveDe === false));
  const canKembalikan = status === 'menunggu_de' && isDE(role);
  const canBatal = bisaBatalSebelumTersimpan(role, status);
  const showSaldo = role !== 'operator';

  async function afterAction() {
    setBaseVersi(null);
    setMode('');
    await refreshAll();
  }

  async function approve() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/bkb/${summary.id}/approve`, { body: {} });
      toast(`BKB ${summary.docNo} tersimpan. Status: ${STATUS_META[res.data.status]?.label || res.data.status}.`);
      await afterAction();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan BKB.');
      await afterAction();
    } finally {
      setBusy(false);
    }
  }

  const bodyTable = bkb && (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="sr-only">Barang dalam BKB</caption>
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="pb-2 text-left">Barang</th>
            <th scope="col" className="pb-2 text-right">QTY</th>
            <th scope="col" className="pb-2 pl-3 text-left">Dept Pemakai</th>
            {/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak ditampilkan lagi (K-30). */}
            {/* <th scope="col" className="pb-2 text-left">Dept Proses</th> */}
            {isDE(role) && bkb.items.some((l) => l.saldoSk != null) && (
              <>
                <th scope="col" className="pb-2 text-right">Saldo akhir SK</th>
                <th scope="col" className="pb-2 text-right">Saldo sistem</th>
              </>
            )}
            {showSaldo && bkb.status === 'selesai' && <th scope="col" className="pb-2 text-right">Nomor urut</th>}
          </tr>
        </thead>
        <tbody>
          {bkb.items.map((l) => (
            <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-1.5">
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{l.itemCode}</span>
                <span className="ml-2 text-xs text-slate-500">{l.itemName}</span>
              </td>
              <td className="py-1.5 text-right font-semibold tabular-nums">{formatNumber(l.qty)} {l.unit}</td>
              <td className="py-1.5 pl-3 text-xs">{l.deptPemakaiKode || '-'}</td>
              {/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak ditampilkan lagi (K-30). */}
              {/* <td className="py-1.5 text-xs">{l.deptProsesKode || '-'}</td> */}
              {isDE(role) && bkb.items.some((x) => x.saldoSk != null) && (
                <>
                  <td className="py-1.5 text-right tabular-nums">{l.saldoSk == null ? '-' : formatNumber(l.saldoSk)}</td>
                  <td className="py-1.5 text-right tabular-nums">{l.saldoSistemKonfirmasi == null ? '-' : formatNumber(l.saldoSistemKonfirmasi)}</td>
                </>
              )}
              {showSaldo && bkb.status === 'selesai' && <td className="py-1.5 text-right tabular-nums">{l.nomorUrut ?? '-'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const detailLink = (
    <Link href={`/bkb/${summary.id}`} className={btnGhost}>Buka detail</Link>
  );

  function actions() {
    if (!bkb || mode === 'betulkan') return null;
    if (status === 'menunggu' && isSK && mode === '') {
      return (
        <KonfirmasiSaldo
          bkb={bkb}
          disabled={stale}
          onDetail={() => { window.location.href = `/bkb/${summary.id}`; }}
          onBetulkan={() => setMode('betulkan')}
          onDone={async () => { setMode('hasil'); await afterAction(); setMode('hasil'); }}
        />
      );
    }
    return null;
  }

  const showHasil = bkb && mode === 'hasil' && bkb.items.some((l) => l.saldoSk != null);
  const canLihatHasil = bkb && isSK && status === 'ditahan' && bkb.items.some((l) => l.saldoSk != null);
  const pilihanBelum = status === 'ditahan' && ['tidak_cocok', 'stok_kurang', 'dikoreksi'].includes(bkb?.ditahanKarena);

  return (
    <div ref={cardRef} className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-start justify-between gap-3 p-4 text-left"
      >
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100">{summary.docNo}</span>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          {status === 'ditahan' && (
            <p className="mt-1 text-xs text-slate-500">{ditahanKeterangan(bkb?.ditahanKarena ?? summary.ditahanKarena)}</p>
          )}
          {bkb?.menggantiBkbId && <p className="mt-1 text-xs text-slate-500">BKB pengganti</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>{tgl(summary.bkbDate)}</span>
          <span>{summary.jenisKode} · {summary.keterangan}</span>
          <span>oleh {summary.dibuatOlehNama || '-'}</span>
          <svg className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-4 dark:border-slate-800">
          {isLoading && !bkb && <div className="flex justify-center py-6"><Spinner className="h-5 w-5" /></div>}
          {error && !bkb && <p role="alert" className="text-sm text-rose-600">BKB tidak bisa dimuat.</p>}

          {bkb && (
            <>
              {stale && (
                <div role="alert" className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <span>BKB ini baru saja berubah. Muat ulang.</span>
                  <button type="button" onClick={() => { setBaseVersi(null); setMode(''); }} className="rounded-lg border border-amber-400 px-3 py-1 text-xs font-semibold">Muat ulang</button>
                </div>
              )}
              {bkb.machine && <p className="mb-2 text-xs text-slate-500">Mesin: <span className="font-semibold">{bkb.machine}</span></p>}
              {bkb.catatanSk && (
                <p className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Catatan SK: {bkb.catatanSk}</p>
              )}
              {status === 'menunggu_de' && isSK && wajibApproveDe === false && (
                <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                  Wajib approve DE sedang nonaktif. BKB ini menunggu dari saat mode aktif dan boleh Anda approve.
                </p>
              )}

              {mode !== 'betulkan' && bodyTable}

              {mode === 'betulkan' && (
                <BetulkanBkb
                  bkb={bkb}
                  onCancel={() => setMode('')}
                  onSaved={async () => { toast('BKB diperbaiki. Ketik saldo akhir lagi.'); await afterAction(); }}
                />
              )}

              {showHasil && (
                <HasilSaldo
                  bkb={bkb}
                  canChoose={isSK && status === 'ditahan' && !stale}
                  disabled={stale}
                  onClose={() => setMode('')}
                  onBetulkan={() => setMode('betulkan')}
                  onChosen={async (p) => {
                    if (p === 'saldo') toast('Permintaan dikirim ke DE.');
                    await refreshAll();
                    if (p === 'saldo') setMode('');
                  }}
                />
              )}

              {!showHasil && actions()}

              {/* aksi per status */}
              {mode !== 'betulkan' && !(status === 'menunggu' && isSK && !showHasil) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {detailLink}
                  {canLihatHasil && !showHasil && (
                    <button type="button" className={btnGhost} onClick={() => setMode('hasil')}>Lihat hasil saldo</button>
                  )}
                  {isSK && status === 'ditahan' && bkb.ditahanKarena !== 'menunggu_koreksi' && (
                    <button type="button" disabled={stale} className={btnGhost} onClick={() => setMode('betulkan')}>Betulkan BKB</button>
                  )}
                  {canBatal && (
                    <button type="button" disabled={stale || busy} className={`${btnGhost} text-rose-700 dark:text-rose-300`} onClick={() => setDialog('batal')}>
                      Batalkan BKB
                    </button>
                  )}
                  {canKembalikan && (
                    <button type="button" disabled={stale || busy} className={btnGhost} onClick={() => setDialog('kembalikan')}>Kembalikan ke SK</button>
                  )}
                  {canApprove && (
                    <button type="button" disabled={stale || busy} onClick={approve}
                      className="ml-auto flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                      {busy && <Spinner className="h-4 w-4" />}
                      {busy ? 'Menyimpan...' : 'Approve dan simpan'}
                    </button>
                  )}
                </div>
              )}
              {pilihanBelum && !isSK && null}
              {/* menunggu + SK: tombol batal juga perlu tersedia di bawah form saldo */}
              {status === 'menunggu' && isSK && !showHasil && mode === '' && canBatal && (
                <div className="mt-2">
                  <button type="button" disabled={stale} className={`${btnGhost} text-rose-700 dark:text-rose-300`} onClick={() => setDialog('batal')}>
                    Batalkan BKB
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmActionDialog
        open={dialog === 'batal'}
        onClose={() => setDialog('')}
        title={`Batalkan BKB ${summary.docNo}`}
        summary="BKB belum tersimpan, jadi stok tidak berubah. Status BKB menjadi Dibatalkan dan tidak bisa dibuka lagi."
        confirmLabel="Batalkan BKB"
        tone="danger"
        onConfirm={async ({ alasan }) => {
          await apiFetch(`/api/bkb/${summary.id}/batal`, { body: { alasan } });
          toast(`BKB ${summary.docNo} dibatalkan.`);
          setDialog('');
          await afterAction();
        }}
      />
      <ConfirmActionDialog
        open={dialog === 'kembalikan'}
        onClose={() => setDialog('')}
        title={`Kembalikan BKB ${summary.docNo} ke SK`}
        summary="SK akan membetulkan BKB lalu mengonfirmasi saldo lagi."
        confirmLabel="Kembalikan ke SK"
        alasanMin={1}
        onConfirm={async ({ alasan }) => {
          await apiFetch(`/api/bkb/${summary.id}/kembalikan`, { body: { alasan } });
          toast('BKB dikembalikan ke SK.');
          setDialog('');
          await afterAction();
        }}
      />
    </div>
  );
}
