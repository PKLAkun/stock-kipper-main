'use client';

// Detail dan form Cek Stok (docs/ui/09-cek-stok.md). id = 'baru' untuk membuat draf.
// SK/Superadmin: Simpan draf, Ajukan, Batalkan (selama draf atau ditolak).
// DE/Superadmin: Setujui (nama atasan, nomor BA, password) dan Tolak (catatan) saat diajukan.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher, apiFetch } from '@/lib/api-client';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Spinner from '@/components/ui/Spinner';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { Field, inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime, formatNumber } from '@/lib/utils';
import OpnameForm from './OpnameForm';
import {
  ALASAN_LABEL, STATUS_META, barisKosong, bodyDariForm, bolehBuat, bolehUbah, bolehSetujuiIni, dampakSetujui,
  formDariOpname, pembuatSendiri, peringatanSaldoBerubah, validasiForm,
} from './opnameLogic';

const hariIni = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'.replace(/[0-9a-f]/g, () => ((Math.random() * 16) | 0).toString(16)));
const fmtS = (s) => `${s > 0 ? '+' : ''}${formatNumber(s)}`;
// 403 membawa pesan penting (mis. tidak boleh menyetujui buatan sendiri)
const mapError403 = (err) => (err?.status === 403 && err.message ? err.message : null);

function formBaru() {
  return { alasanJenis: 'opname', tanggal: hariIni(), catatan: '', lines: [barisKosong('n0')] };
}

function Riwayat({ o }) {
  const baris = [
    [o.createdAt, `Dibuat oleh ${o.dibuatOlehNama || '-'}`],
    [o.diajukanAt, 'Diajukan'],
    [o.ditolakAt, `Ditolak oleh ${o.ditolakOlehNama || '-'}${o.catatanTolak ? `: ${o.catatanTolak}` : ''}`],
    [o.disetujuiAt, `Disetujui oleh ${o.disetujuiOlehNama || '-'}. Atasan: ${o.namaAtasan || '-'}, BA: ${o.nomorBa || '-'}`],
    [o.dibatalkanAt, `Dibatalkan oleh ${o.dibatalkanOlehNama || '-'}${o.alasanBatal ? `: ${o.alasanBatal}` : ''}`],
  ].filter(([t]) => t);
  return (
    <section aria-label="Riwayat" className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Riwayat</h2>
      <ol className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
        {baris.map(([t, teks]) => <li key={teks}><span className="text-xs text-slate-400">{formatDateTime(t)}</span> · {teks}</li>)}
      </ol>
    </section>
  );
}

function TabelBaca({ o }) {
  const opname = o.alasanJenis === 'opname';
  const tampilSekarang = o.status === 'diajukan';
  const selesai = o.status === 'disetujui';
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
            <th scope="col" className="px-3 py-2 text-left">Barang</th>
            <th scope="col" className="px-3 py-2 text-right">Saldo saat hitung</th>
            {tampilSekarang && <th scope="col" className="px-3 py-2 text-right">Saldo sekarang</th>}
            <th scope="col" className="px-3 py-2 text-right">{opname ? 'Jumlah fisik' : `Jumlah ${o.alasanJenis}`}</th>
            <th scope="col" className="px-3 py-2 text-right">Selisih</th>
            {selesai && <th scope="col" className="px-3 py-2 text-right">Saldo sebelum / sesudah</th>}
            <th scope="col" className="px-3 py-2 text-left">Analisa</th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((l) => (
            <tr key={l.id} className="border-b border-slate-100 align-top last:border-0 dark:border-slate-800">
              <td className="px-3 py-2"><span className="font-mono font-semibold">{l.itemCode}</span><span className="block text-xs text-slate-500">{l.itemName}</span></td>
              <td className="px-3 py-2 text-right tabular-nums">{formatNumber(l.saldoSistemSaatHitung)} {l.unit}</td>
              {tampilSekarang && (
                <td className={`px-3 py-2 text-right tabular-nums ${l.saldoBerubah ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}`}>
                  {formatNumber(l.saldoSekarang)} {l.unit}{l.saldoBerubah && <span className="block text-xs">berubah</span>}
                </td>
              )}
              <td className="px-3 py-2 text-right tabular-nums">{formatNumber(opname ? l.qtyFisik : l.qty)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtS(l.selisih)}</td>
              {selesai && <td className="px-3 py-2 text-right tabular-nums">{formatNumber(l.saldoSebelum)} → {formatNumber(l.saldoSetelah)}</td>}
              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{l.analisa || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CekStokDetail({ id, user }) {
  const router = useRouter();
  const toast = useToast();
  const baru = id === 'baru';
  const { data, error, isLoading, mutate } = useRealtimeSWR(
    baru ? null : `/api/opname/${id}`, swrFetcher, { subscribeTables: ['opname', 'opname_items', 'items'] },
  );
  const o = data?.data || null;

  const [form, setForm] = useState(baru ? formBaru : null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');
  const [pesan, setPesan] = useState('');
  const [dialog, setDialog] = useState('');
  const kunci = useRef(null);
  const editing = baru ? bolehBuat(user.role) : bolehUbah(o, user);

  // isi form sekali dari data server; pembaruan realtime tidak menimpa ketikan
  useEffect(() => {
    if (!baru && o && form === null && bolehUbah(o, user)) setForm(formDariOpname(o));
  }, [baru, o, form, user]);
  useEffect(() => { if (baru && !kunci.current) kunci.current = uuid(); }, [baru]);

  async function simpan() {
    const body = bodyDariForm(form, baru ? kunci.current : undefined);
    const res = await apiFetch(baru ? '/api/opname' : `/api/opname/${id}`, { method: baru ? 'POST' : 'PUT', body });
    return res.data;
  }

  async function aksiSimpan(mode) {
    setPesan('');
    const v = validasiForm(form, mode);
    setErrors(v.errors);
    if (v.count > 0) { setPesan(mode === 'ajukan' ? 'Lengkapi isian yang ditandai sebelum mengajukan.' : 'Periksa isian yang ditandai.'); return; }
    setBusy(mode);
    try {
      const saved = await simpan();
      if (mode === 'ajukan') {
        await apiFetch(`/api/opname/${saved.id}/ajukan`, { body: {} });
        toast(`Cek Stok ${saved.nomor} diajukan.`);
        router.replace(`/cek-stok/${saved.id}`);
        if (!baru) { setForm(null); await mutate(); }
        return;
      }
      toast(`Draf ${saved.nomor} disimpan.`);
      if (baru) router.replace(`/cek-stok/${saved.id}`);
      else { setForm(formDariOpname(saved)); await mutate(); }
    } catch (err) {
      setPesan(err.message || 'Belum berhasil. Tidak ada yang berubah. Coba lagi.');
    } finally {
      setBusy('');
    }
  }

  if (!baru && isLoading && !o) return <div className="space-y-3"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-40 w-full rounded-2xl" /></div>;
  if (!baru && !o) {
    return (
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
        {error?.status === 404 ? 'Cek Stok tidak ditemukan.' : 'Cek Stok tidak bisa dimuat.'}{' '}
        <Link href="/cek-stok" className="font-semibold underline">Kembali ke daftar</Link>
      </div>
    );
  }
  if (baru && !bolehBuat(user.role)) {
    return <p role="alert" className="text-sm text-rose-600">Hanya SK dan Superadmin yang bisa membuat Cek Stok. <Link href="/cek-stok" className="underline">Kembali</Link></p>;
  }

  const meta = o ? STATUS_META[o.status] : null;
  const dampak = o ? dampakSetujui(o) : null;
  const warnings = o ? peringatanSaldoBerubah(o) : [];
  const nonaktif = Boolean(busy);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/cek-stok" className="text-sm text-brand-600 hover:underline">← Daftar Cek Stok</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{baru ? 'Cek Stok baru' : o.nomor}</h1>
          {meta && <Badge tone={meta.tone}>{meta.label}</Badge>}
        </div>
        {o && <p className="mt-1 text-sm text-slate-500">{ALASAN_LABEL[o.alasanJenis]} · tanggal {o.tanggal}{o.catatan ? ` · ${o.catatan}` : ''}</p>}
      </div>

      {o?.status === 'ditolak' && o.catatanTolak && (
        <p role="status" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          Ditolak oleh {o.ditolakOlehNama}: {o.catatanTolak}. Perbaiki lalu ajukan lagi.
        </p>
      )}
      {o?.status === 'diajukan' && pembuatSendiri(o, user) && (
        <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          Cek Stok buatan Anda sendiri tidak bisa Anda setujui. Minta DE atau Superadmin lain.
        </p>
      )}

      {editing && form ? (
        <>
          <OpnameForm form={form} setForm={setForm} errors={errors} disabled={nonaktif} alasanTerkunci={!baru} />
          {pesan && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{pesan}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {!baru && (
              <button type="button" disabled={nonaktif} onClick={() => setDialog('batal')}
                className="min-h-[44px] rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300">
                Batalkan
              </button>
            )}
            <button type="button" disabled={nonaktif} onClick={() => aksiSimpan('draf')}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              {busy === 'draf' && <Spinner className="h-4 w-4" />}Simpan draf
            </button>
            <button type="button" disabled={nonaktif} onClick={() => aksiSimpan('ajukan')}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy === 'ajukan' && <Spinner className="h-4 w-4" />}Ajukan
            </button>
          </div>
        </>
      ) : o && (
        <TabelBaca o={o} />
      )}

      {o && <Riwayat o={o} />}

      {o && bolehSetujuiIni(o, user) && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setDialog('tolak')}
            className="min-h-[44px] rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300">
            Tolak
          </button>
          <button type="button" onClick={() => setDialog('setujui')}
            className="min-h-[44px] rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Setujui
          </button>
        </div>
      )}

      {o && <SetujuiDialog open={dialog === 'setujui'} onClose={() => setDialog('')} o={o} dampak={dampak} warnings={warnings}
        onDone={async () => { toast(`Cek Stok ${o.nomor} disetujui. Saldo diperbarui.`); await mutate(); }} />}

      {o && (
        <ConfirmActionDialog
          open={dialog === 'tolak'} onClose={() => setDialog('')} title={`Tolak Cek Stok ${o.nomor}`}
          summary="Cek Stok kembali ke SK (status Ditolak) dan bisa diubah lalu diajukan lagi. Saldo tidak berubah."
          confirmLabel="Tolak Cek Stok" tone="danger" needAlasan alasanMin={5} mapError={mapError403}
          onConfirm={async ({ alasan }) => {
            await apiFetch(`/api/opname/${o.id}/tolak`, { body: { catatan: alasan } });
            toast(`Cek Stok ${o.nomor} ditolak.`); setDialog(''); await mutate();
          }}
        >
          <p className="text-xs text-slate-500">Isian di bawah adalah catatan penolakan yang dibaca SK.</p>
        </ConfirmActionDialog>
      )}

      {o && (
        <ConfirmActionDialog
          open={dialog === 'batal'} onClose={() => setDialog('')} title={`Batalkan Cek Stok ${o.nomor}`}
          summary="Cek Stok menjadi Dibatalkan dan tidak bisa diubah lagi. Data tetap tersimpan, saldo tidak berubah."
          confirmLabel="Batalkan Cek Stok" tone="danger" needAlasan alasanMin={5} mapError={mapError403}
          onConfirm={async ({ alasan }) => {
            await apiFetch(`/api/opname/${o.id}/batal`, { body: { alasan } });
            toast(`Cek Stok ${o.nomor} dibatalkan.`); setDialog(''); router.replace('/cek-stok');
          }}
        />
      )}
    </div>
  );
}

function SetujuiDialog({ open, onClose, o, dampak, warnings, onDone }) {
  const [namaAtasan, setNamaAtasan] = useState('');
  const [nomorBa, setNomorBa] = useState('');
  useEffect(() => { if (open) { setNamaAtasan(''); setNomorBa(''); } }, [open]);

  const blockers = [];
  if (!namaAtasan.trim()) blockers.push('Isi nama atasan.');
  if (!nomorBa.trim()) blockers.push('Isi nomor Berita Acara.');
  for (const r of dampak.minus) blockers.push(`Saldo ${r.kode} menjadi ${formatNumber(r.sesudah)} (minus).`);

  return (
    <ConfirmActionDialog
      open={open} onClose={onClose} title={`Setujui Cek Stok ${o.nomor}`}
      summary="Selisih diterapkan ke saldo semua barang dalam satu transaksi, setelah atasan menyetujui Berita Acara di kertas."
      confirmLabel="Setujui" needAlasan={false} needPassword
      stockRows={dampak.rows.map((r) => ({ kode: r.kode, nama: r.nama, perubahan: `${fmtS(r.selisih)} ${r.unit}`, sebelum: formatNumber(r.sebelum), sesudah: formatNumber(r.sesudah) }))}
      warnings={warnings} blockers={blockers} mapError={mapError403}
      onConfirm={async ({ password }) => {
        await apiFetch(`/api/opname/${o.id}/setujui`, { body: { namaAtasan: namaAtasan.trim(), nomorBa: nomorBa.trim(), password } });
        onClose();
        await onDone();
      }}
    >
      <Field label="Nama atasan *" hint="Atasan yang menandatangani Berita Acara.">
        <input type="text" maxLength={100} autoComplete="off" autoFocus value={namaAtasan} onChange={(e) => setNamaAtasan(e.target.value)} className={inputClass(false)} />
      </Field>
      <Field label="Nomor Berita Acara *">
        <input type="text" maxLength={100} autoComplete="off" value={nomorBa} onChange={(e) => setNomorBa(e.target.value)} className={inputClass(false)} />
      </Field>
    </ConfirmActionDialog>
  );
}
