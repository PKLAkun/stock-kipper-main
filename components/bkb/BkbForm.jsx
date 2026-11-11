'use client';

// Form Buat BKB (docs/ui/02, bagian A). Varian Operator (rute /buat-bkb) dan SK (tab Input BKB).
// Jenis dan dept pemakai mengikuti keterangan; nomor dokumen dibuat server. Saldo tidak ditampilkan.
// Tahap 2 (T-23): Keterangan (operator), inisial, dan shift terisi dari akun/sesi; server tidak mempercayai nilai dari browser.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import useSWR from 'swr';
import { swrFetcher, apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import Spinner from '@/components/ui/Spinner';
import Skeleton from '@/components/ui/Skeleton';
import { Field, inputClass } from '@/components/ui/Field';
import ItemAutocomplete from './ItemAutocomplete';
import MachineAutocomplete from './MachineAutocomplete';
import SearchSelect from './SearchSelect';
import { BKB_KATEGORI_OPTIONS, SIFT_OPTIONS, nameToInitial, buildKeteranganExtra, tanggalWib, PESAN_AKUN_BELUM_DIATUR } from '@/lib/constants/bkb';
import { hitungShift } from '@/lib/auth/shift';
import { buildBkbBody, validateBkbForm, newIdempotencyKey, countErrors } from './bkbFormLogic';

// [Tahap 2, 11-11-2026, T-23] Diganti tanggalWib dari lib/constants/bkb (sama hasilnya, bisa dites).
// const todayWib = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
const todayWib = () => tanggalWib(new Date());
const cx = (...c) => c.filter(Boolean).join(' ');
const DRAFT_KEY = (role) => `buat-bkb-draft-${role}`;

function useParam(nama) {
  return useSWR(`/api/parameter/${nama}?aktif=1`, swrFetcher, { revalidateOnFocus: false });
}

export default function BkbForm({ user, onSaved }) {
  const toast = useToast();
  const router = useRouter();
  // isSK = form bukan operator (pihak wajib diisi). Dipakai SK dan role lain yang diizinkan membuat BKB.
  const isSK = Boolean(user?.role) && user.role !== 'operator';
  const keyRef = useRef(0);
  // [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: baris tidak lagi membawa Dept proses (K-30).
  // const newLine = (deptProsesKode = '') => ({
  //   key: `r${++keyRef.current}`, item: null, qty: '', deptPemakaiKode: '', deptProsesKode,
  // });
  const newLine = () => ({ key: `r${++keyRef.current}`, item: null, qty: '', deptPemakaiKode: '' });

  // data akun (inisial, keterangan operator, shift sesi): dari prop, dilengkapi /api/me bila prop belum membawanya
  const meQ = useSWR('/api/me', swrFetcher, { revalidateOnFocus: false });
  const akun = { ...user, ...(meQ.data?.user || {}) };
  const akunMemuat = meQ.isLoading && user?.inisial === undefined;

  const tujuanQ = useParam('tujuan');
  const jenisQ = useParam('jenis');
  const pemakaiQ = useParam('dept-pemakai');
  // [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak dipakai lagi (K-30).
  // const prosesQ = useParam('dept-proses');
  const loadingParam = [tujuanQ, jenisQ, pemakaiQ].some((q) => q.isLoading);
  const errorParam = [tujuanQ, jenisQ, pemakaiQ].some((q) => q.error);
  const tujuanList = useMemo(() => tujuanQ.data?.data || [], [tujuanQ.data]);
  const jenisList = jenisQ.data?.data || [];
  const pemakaiOpts = useMemo(() => (pemakaiQ.data?.data || []).map((d) => ({ code: d.kode, name: d.nama })), [pemakaiQ.data]);
  // [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak dipakai lagi (K-30).
  // const prosesList = useMemo(() => prosesQ.data?.data || [], [prosesQ.data]);
  // const prosesOpts = useMemo(() => prosesList.map((d) => ({ code: d.kode, name: d.nama })), [prosesList]);
  // const defaultProses = prosesList.find((d) => d.bawaan)?.kode || '';

  const [header, setHeader] = useState({
    bkbKategori: '4', bkbDate: todayWib(), reference: '', tujuanKode: '',
    inisial: nameToInitial(user?.name || ''), nomorUrut: 1, machine: '', pihakNama: '', pihakDept: '',
  });
  const [lines, setLines] = useState(() => [newLine()]);
  const [errors, setErrors] = useState({});
  const [summary, setSummary] = useState('');
  const [serverError, setServerError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentLink, setSentLink] = useState(null);
  const [seqLoading, setSeqLoading] = useState(false);
  const idemRef = useRef(null);
  const restored = useRef(false);

  // jam sekarang, diperbarui tiap menit (untuk shift otomatis)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const today = tanggalWib(now);

  // nilai efektif: operator memakai keterangan akun; inisial dari akun (cadangan: dari nama)
  const operatorBelumDiatur = !isSK && !akunMemuat && !akun.tujuanKode;
  const hdr = {
    ...header,
    tujuanKode: isSK ? header.tujuanKode : (akun.tujuanKode || ''),
    inisial: akun.inisial || nameToInitial(user?.name || ''),
  };
  const bkbMundur = hdr.bkbDate < today;
  const shiftOtomatis = (!isSK && akun.sesiShift) || hitungShift(now).shift;

  const tujuan = tujuanList.find((t) => t.kode === hdr.tujuanKode) || null;
  const jenis = jenisList.find((j) => j.kode === tujuan?.jenisKode);
  const preview = hdr.tujuanKode ? buildKeteranganExtra(hdr.tujuanKode, hdr.inisial, hdr.nomorUrut) : '-';

  // operator tidak memilih keterangan, jadi dept pemakai bawaan keterangan diisi di sini
  const deptBawaan = tujuan?.deptPemakaiKode || '';
  useEffect(() => {
    if (isSK || !deptBawaan) return;
    setLines((p) => (p.some((l) => l.deptPemakaiKode !== deptBawaan) ? p.map((l) => ({ ...l, deptPemakaiKode: deptBawaan })) : p));
  }, [isSK, deptBawaan]);

  // pulihkan draf sekali; kunci idempotensi dibuat sekali per pengisian
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    idemRef.current = newIdempotencyKey();
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY(user?.role));
      if (raw) {
        const d = JSON.parse(raw);
        if (d?.header) {
          setHeader((h) => ({ ...h, ...d.header }));
          if (d.lines?.length) { setLines(d.lines); keyRef.current = Math.max(keyRef.current, d.lines.length + 100); }
          if (d.idem) idemRef.current = d.idem;
          setNotice('Draf dipulihkan.');
        }
      }
    } catch { /* draf opsional */ }
  }, [user?.role]);

  useEffect(() => {
    if (!restored.current) return;
    try {
      sessionStorage.setItem(DRAFT_KEY(user?.role), JSON.stringify({ header, lines, idem: idemRef.current }));
    } catch { /* draf opsional */ }
  }, [header, lines, user?.role]);

  // [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses bawaan tidak diisi lagi (K-30).
  // useEffect(() => {
  //   if (!defaultProses) return;
  //   setLines((p) => (p.some((l) => !l.deptProsesKode) ? p.map((l) => (l.deptProsesKode ? l : { ...l, deptProsesKode: defaultProses })) : p));
  // }, [defaultProses]);

  // nomor di keterangan otomatis, bisa diubah
  useEffect(() => {
    if (!hdr.tujuanKode || !hdr.inisial) return undefined;
    let cancel = false;
    setSeqLoading(true);
    swrFetcher(`/api/bkb/next-seq?tujuan=${encodeURIComponent(hdr.tujuanKode)}&inisial=${encodeURIComponent(hdr.inisial)}`)
      .then((r) => { if (!cancel) setHeader((p) => ({ ...p, nomorUrut: r.next ?? 1 })); })
      .catch(() => { /* biarkan isi manual */ })
      .finally(() => { if (!cancel) setSeqLoading(false); });
    return () => { cancel = true; };
  }, [hdr.tujuanKode, hdr.inisial]);

  const setH = (field, value) => {
    setHeader((p) => ({ ...p, [field]: value }));
    setErrors((p) => ({ ...p, [field]: undefined }));
    setServerError('');
  };

  function pickTujuan(kode) {
    const t = tujuanList.find((x) => x.kode === kode);
    const hadManual = header.machine || lines.some((l) => l.deptPemakaiKode);
    setHeader((p) => ({ ...p, tujuanKode: kode, machine: '' }));
    setLines((p) => p.map((l) => ({ ...l, deptPemakaiKode: t?.deptPemakaiKode || '' })));
    setErrors((p) => ({ ...p, tujuanKode: undefined, machine: undefined }));
    setNotice(hadManual ? 'Mesin dan dept dikosongkan karena keterangan berubah.' : '');
  }

  const setLine = (key, patch) => { setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l))); setServerError(''); };
  const focusCell = (rowKey, field) =>
    setTimeout(() => document.querySelector(`[data-row="${rowKey}"][data-field="${field}"]`)?.focus(), 30);

  function addLine(focus = true) {
    const l = newLine();
    l.deptPemakaiKode = tujuan?.deptPemakaiKode || '';
    setLines((p) => [...p, l]);
    if (focus) focusCell(l.key, 'item');
  }
  const removeLine = (key) => setLines((p) => (p.length === 1 ? [{ ...newLine(), deptPemakaiKode: tujuan?.deptPemakaiKode || '' }] : p.filter((l) => l.key !== key)));

  function pickItem(line, item) {
    const dupe = lines.find((l) => l.key !== line.key && l.item?.id === item.id);
    if (dupe) {
      setLine(line.key, { item: null });
      setErrors((p) => ({ ...p, [`items.${line.key}.itemId`]: `${item.itemCode} sudah ada di daftar. Ubah QTY di baris itu.` }));
      focusCell(dupe.key, 'qty');
      return;
    }
    setLine(line.key, { item });
    setErrors((p) => ({ ...p, [`items.${line.key}.itemId`]: undefined }));
  }

  function onCellKey(e, line, index, next) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (next) return focusCell(line.key, next);
    if (index === lines.length - 1) addLine(); else focusCell(lines[index + 1].key, 'item');
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    if (busy || loadingParam || errorParam || operatorBelumDiatur || akunMemuat) return;
    const hariIni = todayWib();
    const perluShift = hdr.bkbDate < hariIni;
    const errs = validateBkbForm({ header: hdr, lines, tujuan, isSK, today: hariIni, perluShift });
    setErrors(errs);
    const n = countErrors(errs);
    if (n) {
      setSummary(`Ada ${n} isian yang perlu diperbaiki.`);
      const first = Object.keys(errs).find((k) => errs[k]);
      const id = first.startsWith('items.') ? null : `field-${first}`;
      if (id) document.getElementById(id)?.focus();
      return;
    }
    setSummary('');
    setBusy(true);
    setServerError('');
    try {
      // tanggal hari ini: shift ditentukan server (dari sesi atau jam server), nilai dari form tidak dikirim
      const body = buildBkbBody({ header: { ...hdr, reference: perluShift ? hdr.reference : '' }, lines, tujuan, isSK, idempotencyKey: idemRef.current });
      const res = await apiFetch('/api/bkb', { body });
      toast(`BKB ${res.data.docNo} terkirim. Status: Menunggu.`);
      try { sessionStorage.removeItem(DRAFT_KEY(user?.role)); } catch { /* opsional */ }
      mutate((k) => typeof k === 'string' && k.startsWith('/api/bkb'));
      onSaved?.(res.data);
      if (isSK) {
        idemRef.current = newIdempotencyKey();
        setHeader((p) => ({ ...p, tujuanKode: '', machine: '', pihakNama: '', pihakDept: '', nomorUrut: 1 }));
        setLines([newLine()]);
        setErrors({});
        setNotice('');
        setSentLink(res.data);
      } else {
        router.push('/ruang-tunggu');
      }
    } catch (err) {
      setServerError(err.message || 'BKB belum terkirim. Periksa isian, lalu coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  if (errorParam) {
    return (
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Pilihan keterangan dan dept tidak bisa dimuat.{' '}
        <button type="button" className="font-semibold underline"
          onClick={() => [tujuanQ, jenisQ, pemakaiQ].forEach((q) => q.mutate())}>Coba lagi</button>
      </div>
    );
  }

  const noTujuan = isSK && !loadingParam && tujuanList.length === 0;

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit(e); }}
      className="space-y-5"
    >
      {sentLink && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          BKB {sentLink.docNo} terkirim.{' '}
          <Link href={`/ruang-tunggu?bkb=${sentLink.id}`} className="font-semibold underline">Lihat di Ruang Tunggu</Link>
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">Header BKB</h2>
        {notice && <p role="status" className="mb-3 text-xs text-slate-500">{notice}</p>}
        {noTujuan && <p role="alert" className="mb-3 text-sm text-amber-700">Belum ada keterangan aktif. Hubungi Superadmin.</p>}
        {operatorBelumDiatur && <p role="alert" className="mb-3 text-sm text-amber-700">{PESAN_AKUN_BELUM_DIATUR}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: label "Tujuan" diganti "Keterangan"; operator read-only dari akun (K-27).
          <Field label="Tujuan *" error={errors.tujuanKode}> ... </Field> */}
          <Field label={isSK ? 'Keterangan *' : 'Keterangan'} error={errors.tujuanKode} hint={isSK ? undefined : 'Dari akun Anda'}>
            {loadingParam || akunMemuat ? <Skeleton className="h-10 w-full" /> : isSK ? (
              <SearchSelect
                id="field-tujuanKode" label="Keterangan" value={header.tujuanKode} hasError={Boolean(errors.tujuanKode)}
                options={tujuanList.map((t) => ({ code: t.kode, name: t.nama }))}
                placeholder="Pilih keterangan" onChange={pickTujuan}
              />
            ) : (
              <input id="field-tujuanKode" readOnly value={tujuan ? `${tujuan.kode} - ${tujuan.nama}` : (hdr.tujuanKode || '')}
                placeholder="Belum diatur" aria-label="Keterangan"
                className={cx(inputClass(Boolean(errors.tujuanKode)), 'bg-slate-50 dark:bg-slate-800/60')} />
            )}
          </Field>

          <Field label="Jenis Transaksi" hint="Mengikuti keterangan">
            <input readOnly value={jenis ? `${jenis.kode} - ${jenis.nama}` : ''} placeholder="Pilih keterangan dulu"
              className={cx(inputClass(false), 'bg-slate-50 dark:bg-slate-800/60')} />
          </Field>

          <Field label="Kategori Barang *" error={errors.bkbKategori}>
            <select value={header.bkbKategori} onChange={(e) => setH('bkbKategori', e.target.value)} className={inputClass(false)}>
              {BKB_KATEGORI_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </Field>

          <Field label="No Dokumen" hint="Dibuat otomatis saat dikirim">
            <input readOnly value="" placeholder="Dibuat otomatis saat dikirim"
              className={cx(inputClass(false), 'bg-slate-50 font-mono dark:bg-slate-800/60')} />
          </Field>

          <Field label="Tanggal BKB *" error={errors.bkbDate}>
            <input id="field-bkbDate" type="date" max={today} value={header.bkbDate}
              onChange={(e) => setH('bkbDate', e.target.value)} className={inputClass(Boolean(errors.bkbDate))} />
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: "Referensi (Sift)" dropdown diganti "Shift" otomatis; dropdown hanya untuk tanggal mundur (K-28, P-39).
          <Field label="Referensi (Sift)"> <select> ... SIFT_OPTIONS ... </select> </Field> */}
          <Field label={bkbMundur ? 'Shift *' : 'Shift'} error={errors.reference} hint={bkbMundur ? 'Tanggal sudah lewat: pilih shift' : undefined}>
            {bkbMundur ? (
              <select id="field-reference" value={header.reference} onChange={(e) => setH('reference', e.target.value)} className={inputClass(Boolean(errors.reference))}>
                <option value="">- pilih shift -</option>
                {SIFT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label.replace('Sift', 'Shift')}</option>)}
              </select>
            ) : (
              <input id="field-reference" readOnly value={`Shift ${shiftOtomatis} (otomatis)`}
                className={cx(inputClass(false), 'bg-slate-50 dark:bg-slate-800/60')} />
            )}
          </Field>

          {/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Inisial tidak bisa diubah; diambil dari akun (K-27).
          <Field label="Inisial *"> <input onChange=... /> </Field> */}
          <Field label="Inisial" hint="Dari akun Anda">
            <input id="field-inisial" readOnly value={hdr.inisial}
              className={cx(inputClass(false), 'bg-slate-50 font-mono uppercase dark:bg-slate-800/60')} />
          </Field>

          <Field label="Nomor di kode keterangan *" error={errors.nomorUrut} hint={seqLoading ? 'Mengambil...' : 'Auto, bisa diubah'}>
            <input id="field-nomorUrut" inputMode="numeric" value={header.nomorUrut}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setH('nomorUrut', v === '' ? '' : parseInt(v, 10)); }}
              onBlur={() => { if (!(Number(header.nomorUrut) >= 1)) setH('nomorUrut', 1); }}
              className={inputClass(Boolean(errors.nomorUrut))} />
          </Field>

          <Field label="Kode keterangan" className="lg:col-span-2">
            <div className={cx(inputClass(false), 'bg-slate-50 font-mono font-semibold text-brand-700 dark:bg-slate-800 dark:text-brand-300')}>{preview}</div>
            <p className="mt-1 text-xs text-slate-400">Keterangan / Inisial / Nomor</p>
          </Field>
        </div>

        {isSK && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nama Pihak *" error={errors.pihakNama}>
              <input id="field-pihakNama" value={header.pihakNama} maxLength={60} aria-required="true"
                onChange={(e) => setH('pihakNama', e.target.value)} className={inputClass(Boolean(errors.pihakNama))} />
            </Field>
            <Field label="Departemen Pihak *" error={errors.pihakDept}>
              <input id="field-pihakDept" value={header.pihakDept} maxLength={60} aria-required="true"
                onChange={(e) => setH('pihakDept', e.target.value)} className={inputClass(Boolean(errors.pihakDept))} />
            </Field>
          </div>
        )}

        {tujuan?.wajibMesin && (
          <div className="mt-4 max-w-xs">
            <Field label={`Mesin * (wajib untuk ${tujuan.kode})`} error={errors.machine} hint="Ketik kode mesin untuk cari">
              <MachineAutocomplete value={header.machine} onChange={(v) => setH('machine', v)} hasError={Boolean(errors.machine)} />
            </Field>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Detail Barang</h2>
          <p className="hidden text-xs text-slate-400 sm:block">
            <kbd className="rounded border px-1">Enter</kbd> pilih dan pindah · <kbd className="rounded border px-1">Ctrl+Enter</kbd> kirim
          </p>
        </div>

        <div className="hidden gap-2 px-1 pb-2 text-xs uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-[1.5rem_14rem_1fr_7rem_14rem_2rem]">
          <span>#</span><span>Kode / Tipe Barang</span><span>Nama Barang</span><span>QTY</span><span>Dept Pemakai</span>{/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses (K-30). <span>Dept Proses</span> */}<span />
        </div>

        <div className="space-y-3 pb-24">
          {lines.map((line, index) => {
            const eItem = errors[`items.${line.key}.itemId`];
            const eQty = errors[`items.${line.key}.qty`];
            const eDept = errors[`items.${line.key}.deptPemakaiKode`];
            const locked = Boolean(tujuan?.deptPemakaiKode);
            return (
              <div key={line.key} role="group" aria-label={`Baris ${index + 1}`}
                className="grid gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800 lg:grid-cols-[1.5rem_14rem_1fr_7rem_14rem_2rem] lg:items-start lg:border-0 lg:p-0">
                <span className="hidden pt-3 text-xs text-slate-400 lg:block">{index + 1}</span>
                <div>
                  <ItemAutocomplete
                    rowKey={line.key} selected={line.item} hasError={Boolean(eItem)} categoryCode={header.bkbKategori}
                    onSelect={(item) => pickItem(line, item)}
                    onClear={() => setLine(line.key, { item: null })}
                    onPicked={() => focusCell(line.key, 'qty')}
                  />
                  {eItem && <p role="alert" className="mt-1 text-xs text-rose-600">{eItem}</p>}
                </div>
                <input readOnly tabIndex={-1} aria-label="Nama barang" value={line.item?.name || ''} placeholder="Terisi otomatis"
                  className={cx(inputClass(false, true), 'bg-slate-50 dark:bg-slate-800/60')} />
                <div>
                  <input data-row={line.key} data-field="qty" aria-label={`QTY baris ${index + 1}`} inputMode="decimal"
                    placeholder="QTY" value={line.qty}
                    onChange={(e) => { setLine(line.key, { qty: e.target.value }); setErrors((p) => ({ ...p, [`items.${line.key}.qty`]: undefined })); }}
                    onKeyDown={(e) => onCellKey(e, line, index, 'dept')}
                    className={inputClass(Boolean(eQty), true)} />
                  {eQty && <p className="mt-1 text-xs text-rose-600">{eQty}</p>}
                </div>
                <div>
                  <SearchSelect
                    label={`Dept pemakai baris ${index + 1}`} value={line.deptPemakaiKode} options={pemakaiOpts}
                    locked={locked} hasError={Boolean(eDept)} dataRow={line.key} dataField="dept"
                    placeholder={locked ? '' : 'Dept pemakai'}
                    onChange={(v) => { setLine(line.key, { deptPemakaiKode: v }); setErrors((p) => ({ ...p, [`items.${line.key}.deptPemakaiKode`]: undefined })); }}
                    onEnter={() => onCellKey({ key: 'Enter', preventDefault() {} }, line, index, null)}
                  />
                  {locked && <p className="mt-0.5 text-xs text-slate-400">Mengikuti keterangan</p>}
                  {eDept && <p className="mt-1 text-xs text-rose-600">{eDept}</p>}
                </div>
                {/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses per baris (K-30).
                <SearchSelect
                  label={`Dept proses baris ${index + 1}`} value={line.deptProsesKode} options={prosesOpts}
                  dataRow={line.key} dataField="proses" placeholder="Dept proses"
                  onChange={(v) => setLine(line.key, { deptProsesKode: v })}
                  onEnter={() => onCellKey({ key: 'Enter', preventDefault() {} }, line, index, null)}
                /> */}
                <button type="button" onClick={() => removeLine(line.key)} aria-label={`Hapus baris ${index + 1}`}
                  className="justify-self-end rounded-lg p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600 lg:mt-1">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
          <button type="button" onClick={() => addLine()}
            className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 hover:border-brand-500 hover:text-brand-600 dark:border-slate-700">
            + Tambah Baris
          </button>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-1 space-y-2 bg-white/90 px-1 py-3 backdrop-blur dark:bg-slate-950/90 sm:static sm:bg-transparent sm:py-0">
        <div role="alert" aria-live="polite">
          {summary && <p className="text-sm text-rose-600">{summary}</p>}
          {serverError && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{serverError}</p>}
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={busy || loadingParam || noTujuan || operatorBelumDiatur || akunMemuat}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
            {busy && <Spinner className="h-4 w-4" />}
            {busy ? 'Mengirim...' : 'Kirim BKB'}
          </button>
        </div>
      </div>
    </form>
  );
}
