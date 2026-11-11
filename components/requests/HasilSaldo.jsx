'use client';

// Hasil konfirmasi saldo (docs/ui/03 bagian C). Sumber data: detail BKB dari server,
// jadi hasil tetap sama setelah refresh.

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { formatNumber } from '@/lib/utils';
import Spinner from '@/components/ui/Spinner';
import { formatSelisih } from './bkbStatus';

export default function HasilSaldo({ bkb, canChoose, disabled, onClose, onBetulkan, onChosen }) {
  const [pilihan, setPilihan] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const adaBeda = bkb.items.some((l) => l.cocok === false);

  async function lanjutkan() {
    if (!pilihan || busy) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/bkb/${bkb.id}/yang-salah`, { body: { pilihan } });
      onChosen(pilihan);
      if (pilihan === 'bkb') onBetulkan();
    } catch (err) {
      setError(err.message || 'Pilihan belum tersimpan. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3" role="status">
      {!adaBeda ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p className="font-semibold">Saldo cocok</p>
          <p>Semua saldo akhir yang Anda ketik sama dengan saldo sistem.</p>
          {bkb.status === 'menunggu_de' && <p className="mt-1">BKB diteruskan ke DE. Status: Menunggu approve DE.</p>}
          {bkb.status === 'selesai' && (
            <p className="mt-1">BKB tersimpan. Nomor urut: {bkb.items.map((l) => `${l.itemCode} = ${l.nomorUrut ?? '-'}`).join(', ')}. Status: Selesai.</p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          Saldo tidak cocok. BKB ditahan, stok belum berubah.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <caption className="sr-only">Hasil pemeriksaan saldo</caption>
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="pb-2 text-left">Barang</th>
              <th scope="col" className="pb-2 text-right">QTY</th>
              <th scope="col" className="pb-2 text-right">Saldo sistem</th>
              <th scope="col" className="pb-2 text-right">Angka Anda</th>
              <th scope="col" className="pb-2 text-right">Selisih</th>
              <th scope="col" className="pb-2 pl-3 text-left">Hasil</th>
            </tr>
          </thead>
          <tbody>
            {bkb.items.map((l) => (
              <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5"><span className="font-mono font-semibold">{l.itemCode}</span></td>
                <td className="py-1.5 text-right tabular-nums">{formatNumber(l.qty)} {l.unit}</td>
                <td className="py-1.5 text-right tabular-nums">{l.saldoSistemKonfirmasi == null ? '-' : formatNumber(l.saldoSistemKonfirmasi)}</td>
                <td className="py-1.5 text-right tabular-nums">{l.saldoSk == null ? '-' : formatNumber(l.saldoSk)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {l.saldoSk == null || l.saldoSistemKonfirmasi == null ? '-' : formatSelisih(l.saldoSk, l.saldoSistemKonfirmasi)}
                </td>
                <td className="py-1.5 pl-3 text-xs">
                  {l.cocok === false ? (
                    <span className="font-semibold text-rose-700 dark:text-rose-300">
                      Beda{l.saldoSistemKonfirmasi != null && Number(l.saldoSistemKonfirmasi) < 0 ? ' · Stok tidak cukup' : ''}
                    </span>
                  ) : (
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">Cocok</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adaBeda && canChoose && (
        <fieldset className="space-y-2" disabled={busy || disabled}>
          <legend className="text-sm font-semibold text-slate-800 dark:text-slate-100">Yang salah?</legend>
          {[
            ['bkb', 'BKB', 'Barang atau QTY di BKB keliru. Anda betulkan BKB, lalu ketik saldo lagi.'],
            ['saldo', 'Saldo', 'Saldo di sistem yang keliru. DE akan mengoreksi saldo, lalu sistem memeriksa lagi.'],
          ].map(([v, t, d]) => (
            <label key={v} className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
              <input type="radio" name={`yang-salah-${bkb.id}`} value={v} checked={pilihan === v}
                onChange={() => setPilihan(v)} className="mt-1" />
              <span><strong>{t}</strong> <span className="text-slate-500">{d}</span></span>
            </label>
          ))}
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              Pilih nanti
            </button>
            <button type="button" onClick={lanjutkan} disabled={!pilihan || busy || disabled}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy && <Spinner className="h-4 w-4" />}
              {pilihan === 'bkb' ? 'Betulkan BKB' : pilihan === 'saldo' ? 'Minta DE koreksi saldo' : 'Lanjutkan'}
            </button>
          </div>
        </fieldset>
      )}

      {!(adaBeda && canChoose) && (
        <div className="flex justify-end">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
            Tutup
          </button>
        </div>
      )}
    </div>
  );
}
