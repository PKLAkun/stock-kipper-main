'use client';

// Dialog konfirmasi bersama untuk aksi berisiko (docs/ui/05-dialog-dan-koreksi-saldo.md).
// Dipakai untuk: batal, ganti, ubah data, koreksi saldo, dan pengaturan.
//
// Cara pakai:
//   <ConfirmActionDialog
//     open={open}
//     onClose={() => setOpen(false)}
//     title="Batalkan BKB 2611-0030"
//     summary="Saldo dikembalikan, status BKB menjadi Dibatalkan."
//     confirmLabel="Batalkan BKB"            // wajib, bertuliskan aksinya
//     tone="danger"                           // 'danger' (rose) atau 'brand' (indigo, bawaan)
//     stockRows={[{ kode, nama, perubahan: '+25 kg', sebelum: '500', sesudah: '525', dibawahMinimum: 50 }]}
//     changes={[{ label: 'Dept pemakai', sebelum: 'PL003', sesudah: '45' }]}   // tabel sebelum/sesudah
//     warnings={['BKB ini disimpan 12 hari lalu.']}   // wajib dicentang bila ada
//     blockers={['Saldo PP-HI10 menjadi -15.']}      // tombol aksi nonaktif
//     infos={['Ada 2 BKB menunggu approve DE.']}      // informasi, tidak wajib dicentang
//     needAlasan                                      // bawaan true (5 sampai 300 karakter)
//     needPassword                                    // bawaan false
//     loading={false} loadError={false} onRetry={fn}  // untuk memuat dampak dari server
//     onConfirm={async ({ alasan, password }) => { await apiFetch(...); toast('...'); }}
//   >
//     (children = slot isi tambahan, tampil setelah ringkasan)
//   </ConfirmActionDialog>
//
// onConfirm harus async dan melempar error bila gagal: dialog tetap terbuka, menampilkan
// pesan di dalamnya (role="alert"), mengosongkan password, dan mempertahankan alasan.
// Bila sukses, pemanggil menutup dialog (mis. lewat onClose di dalam onConfirm).
// Prop `mapError(err)` boleh mengembalikan pesan khusus (string) atau null untuk pesan bawaan.

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Spinner from './Spinner';
import Skeleton from './Skeleton';
import { Field, inputClass } from './Field';
import { cx } from '@/lib/utils';

const ALASAN_MAX = 300;

export function pesanErrorBawaan(err) {
  const status = err?.status;
  if (status === 401) return 'Password salah. Periksa lalu coba lagi.';
  if (status === 429) return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.';
  if (status === 403) return 'Anda tidak berhak melakukan aksi ini.';
  if (status === 409) return err?.message || 'Data berubah sejak dialog dibuka. Tutup dan buka lagi untuk melihat angka terbaru.';
  if (status === 400 && err?.message) return err.message;
  return 'Aksi belum berhasil. Tidak ada yang berubah. Coba lagi.';
}

function WarnIcon() {
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    </svg>
  );
}

function StockTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <caption className="sr-only">Dampak pada stok</caption>
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
            <th scope="col" className="px-3 py-2 text-left">Barang</th>
            <th scope="col" className="px-3 py-2 text-right">Perubahan</th>
            <th scope="col" className="px-3 py-2 text-right">Saldo sebelum</th>
            <th scope="col" className="px-3 py-2 text-right">Saldo sesudah</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.kode || i} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
              <td className="px-3 py-2 text-slate-800 dark:text-slate-100">
                <span className="font-mono font-semibold">{r.kode}</span>
                {r.nama && <span className="ml-2 text-slate-500">{r.nama}</span>}
                {r.dibawahMinimum != null && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                    <WarnIcon /> Di bawah minimum ({r.dibawahMinimum})
                  </p>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.perubahan}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.sebelum}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.sesudah}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChangesTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <caption className="sr-only">Nilai sebelum dan sesudah</caption>
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
            <th scope="col" className="px-3 py-2 text-left">Data</th>
            <th scope="col" className="px-3 py-2 text-left">Sebelum</th>
            <th scope="col" className="px-3 py-2 text-left">Sesudah</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label || i} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
              <td className="px-3 py-2 text-slate-500">{r.label}</td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{r.sebelum}</td>
              <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">{r.sesudah}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ConfirmActionDialog({
  open,
  onClose,
  onConfirm,
  title,
  summary,
  confirmLabel,
  tone = 'brand',
  stockRows,
  changes,
  warnings = [],
  blockers = [],
  infos = [],
  needAlasan = true,
  needPassword = false,
  alasanMin = 5,
  alasanDefault = '',
  loading = false,
  loadError = false,
  onRetry,
  mapError,
  children,
}) {
  const uid = useId();
  const titleId = `${uid}-judul`;
  const descId = `${uid}-ringkasan`;
  const [alasan, setAlasan] = useState('');
  const [password, setPassword] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useRef(null);
  const firstFieldRef = useRef(null);
  const triggerRef = useRef(null);
  const busyRef = useRef(false);
  busyRef.current = busy;

  // reset isian setiap kali dialog dibuka; fokus awal ke isian pertama, fokus kembali ke pemicu saat tutup
  useEffect(() => {
    if (!open) return undefined;
    triggerRef.current = document.activeElement;
    setAlasan(alasanDefault || '');
    setPassword('');
    setAck(false);
    setBusy(false);
    setError('');
    const t = setTimeout(() => firstFieldRef.current?.focus(), 30);
    return () => {
      clearTimeout(t);
      const el = triggerRef.current;
      if (el && typeof el.focus === 'function') el.focus();
    };
  }, [open, alasanDefault]);

  // Esc menutup (kecuali saat proses), Tab terjebak di dalam dialog, scroll halaman dikunci
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const alasanTrim = alasan.trim();
  const blocked = blockers.length > 0;
  const needAck = warnings.length > 0;
  const siap =
    !loading && !loadError && !blocked && !busy &&
    (!needAlasan || alasanTrim.length >= alasanMin) &&
    (!needPassword || password.length > 0) &&
    (!needAck || ack);

  async function handleConfirm() {
    if (!siap) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm({ alasan: alasanTrim, password });
    } catch (err) {
      setError((mapError && mapError(err)) || pesanErrorBawaan(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  const aksiClass = tone === 'danger'
    ? 'bg-rose-600 hover:bg-rose-700'
    : 'bg-brand-600 hover:bg-brand-700';

  const refFor = (kind) => (kind === 'first' ? firstFieldRef : undefined);
  const firstIsAlasan = needAlasan;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={summary ? descId : undefined}
        className="relative z-10 flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h3 id={titleId} className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Tutup"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {summary && <p id={descId} className="text-sm text-slate-600 dark:text-slate-300">{summary}</p>}

          {children}

          {loading && (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {loadError && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              <span>Dampak ke stok belum bisa dihitung.</span>
              {onRetry && (
                <button type="button" onClick={onRetry} className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-semibold hover:bg-rose-100 dark:border-rose-800">
                  Coba lagi
                </button>
              )}
            </div>
          )}

          {!loading && !loadError && stockRows && stockRows.length > 0 && <StockTable rows={stockRows} />}
          {!loading && !loadError && changes && changes.length > 0 && <ChangesTable rows={changes} />}

          {infos.map((t, i) => (
            <p key={i} role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
              {t}
            </p>
          ))}

          {warnings.length > 0 && (
            <div role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {warnings.map((t, i) => (
                <p key={i} className="flex gap-2"><WarnIcon /><span><strong>Peringatan:</strong> {t}</span></p>
              ))}
              <label className="flex items-center gap-2 pt-1 font-medium">
                <input type="checkbox" checked={ack} disabled={busy} onChange={(e) => setAck(e.target.checked)} className="h-4 w-4 rounded" />
                Saya sudah membaca peringatan di atas
              </label>
            </div>
          )}

          {blocked && (
            <div role="alert" className="space-y-1 rounded-xl border border-rose-300 bg-rose-50 px-3 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {blockers.map((t, i) => (
                <p key={i} className="flex gap-2"><WarnIcon /><span><strong>Tidak bisa dilanjutkan:</strong> {t}</span></p>
              ))}
            </div>
          )}

          {needAlasan && (
            <Field label="Alasan *" hint={`Minimal ${alasanMin} karakter`}>
              <textarea
                ref={refFor('first')}
                rows={3}
                value={alasan}
                maxLength={ALASAN_MAX}
                disabled={busy}
                aria-label="Alasan"
                aria-required="true"
                onChange={(e) => setAlasan(e.target.value)}
                className={cx(inputClass(false), 'text-base sm:text-sm')}
              />
              <p className="mt-1 text-right text-xs text-slate-400">{alasan.length} / {ALASAN_MAX}</p>
            </Field>
          )}

          {needPassword && (
            <Field label="Password Anda *" hint="Konfirmasi dengan password akun Anda sendiri.">
              <input
                ref={firstIsAlasan ? undefined : firstFieldRef}
                type="password"
                value={password}
                disabled={busy}
                autoComplete="current-password"
                aria-label="Password Anda"
                aria-required="true"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); } }}
                className={cx(inputClass(false), 'text-base sm:text-sm')}
              />
            </Field>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>

        {/* footer tetap: tidak ikut bergulir */}
        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Kembali
          </button>
          {!blocked && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!siap}
              className={cx(
                'flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50',
                aksiClass
              )}
            >
              {busy && <Spinner className="h-4 w-4" />}
              {busy ? 'Memproses...' : confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
