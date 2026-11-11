'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import Modal from '@/components/ui/Modal';
import { Field, inputClass } from '@/components/ui/Field';
import { swrFetcher } from '@/lib/api-client';
import { UbahDataDialog } from './BkbAksiDialogs';

const opsi = (rows) => (rows || []).map((r) => ({ kode: r.kode, nama: r.nama }));

// Modal Ubah data (K-16): keterangan, mesin, dept pemakai/proses per baris. Barang dan QTY tidak bisa diubah.
export default function BkbUbahDataModal({ open, onClose, bkb, onDone }) {
  const [form, setForm] = useState({ keterangan: '', machine: '', dp: {}, dpr: {} });
  const [konfirmasi, setKonfirmasi] = useState(false);
  const wajibMesin = Boolean(bkb.machine);

  const pem = useSWR(open ? '/api/parameter/dept-pemakai?aktif=1' : null, swrFetcher);
  // [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak dipakai lagi (K-30).
  // const pro = useSWR(open ? '/api/parameter/dept-proses?aktif=1' : null, swrFetcher);
  const mes = useSWR(open && wajibMesin ? '/api/machines' : null, swrFetcher);

  useEffect(() => {
    if (!open) return;
    setKonfirmasi(false);
    setForm({
      keterangan: bkb.keteranganExtra || '',
      machine: bkb.machine || '',
      dp: Object.fromEntries(bkb.items.map((l) => [l.id, l.deptPemakaiKode || ''])),
      // [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak dipakai lagi (K-30).
      // dpr: Object.fromEntries(bkb.items.map((l) => [l.id, l.deptProsesKode || ''])),
    });
  }, [open, bkb]);

  const { payload, changes } = useMemo(() => {
    const payload = {};
    const changes = [];
    if (form.keterangan.trim() !== (bkb.keteranganExtra || '')) {
      payload.keteranganExtra = form.keterangan.trim();
      changes.push({ label: 'Keterangan', sebelum: bkb.keteranganExtra || '-', sesudah: form.keterangan.trim() || '-' });
    }
    if (wajibMesin && form.machine !== bkb.machine) {
      payload.machine = form.machine;
      changes.push({ label: 'Mesin', sebelum: bkb.machine, sesudah: form.machine || '-' });
    }
    const dp = []; // const dpr = []; (T-23: Dept proses dinonaktifkan)
    for (const l of bkb.items) {
      if (form.dp[l.id] && form.dp[l.id] !== (l.deptPemakaiKode || '')) {
        dp.push({ baris: l.id, kode: form.dp[l.id] });
        changes.push({ label: `Dept pemakai ${l.itemCode}`, sebelum: l.deptPemakaiKode || '-', sesudah: form.dp[l.id] });
      }
      // [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak dipakai lagi (K-30).
      // if (form.dpr[l.id] && form.dpr[l.id] !== (l.deptProsesKode || '')) {
      //   dpr.push({ baris: l.id, kode: form.dpr[l.id] });
      //   changes.push({ label: `Dept proses ${l.itemCode}`, sebelum: l.deptProsesKode || '-', sesudah: form.dpr[l.id] });
      // }
    }
    if (dp.length) payload.deptPemakai = dp;
    // [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak dipakai lagi (K-30).
    // if (dpr.length) payload.deptProses = dpr;
    return { payload, changes };
  }, [form, bkb, wajibMesin]);

  const adaPerubahan = changes.length > 0;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setBaris = (k, id, v) => setForm((f) => ({ ...f, [k]: { ...f[k], [id]: v } }));
  const dept = (rows, nilai) => {
    const list = opsi(rows);
    if (nilai && !list.some((o) => o.kode === nilai)) list.unshift({ kode: nilai, nama: '' });
    return list;
  };

  return (
    <>
      <Modal open={open && !konfirmasi} onClose={onClose} title={`Ubah data BKB ${bkb.docNo}`} wide>
        <p className="mb-4 text-sm text-slate-500">Barang, QTY, dan saldo tidak bisa diubah di sini. Untuk itu pakai Ganti BKB.</p>
        <div className="space-y-4">
          <Field label="Keterangan (INISIAL/NOMOR)">
            <input type="text" maxLength={100} value={form.keterangan} onChange={(e) => set('keterangan', e.target.value)} className={inputClass(false)} />
          </Field>
          {wajibMesin ? (
            <Field label="Mesin">
              <select value={form.machine} onChange={(e) => set('machine', e.target.value)} className={inputClass(false)}>
                {(mes.data?.data || []).filter((m) => m.active || m.code === bkb.machine).map((m) => <option key={m.code} value={m.code}>{m.code} — {m.name}</option>)}
                {!(mes.data?.data || []).some((m) => m.code === bkb.machine) && <option value={bkb.machine}>{bkb.machine}</option>}
              </select>
            </Field>
          ) : (
            <p className="text-sm text-slate-500">Mesin: tidak berlaku untuk keterangan {bkb.tujuanKode}.</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-xs text-slate-400"><th scope="col" className="pb-2 font-medium">Barang</th><th scope="col" className="pb-2 font-medium">Dept Pemakai</th>{/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak dipakai lagi (K-30). <th scope="col" className="pb-2 font-medium">Dept Proses</th> */}</tr></thead>
              <tbody>
                {bkb.items.map((l) => (
                  <tr key={l.id}>
                    <td className="py-1 pr-2 font-mono font-semibold">{l.itemCode}</td>
                    <td className="py-1 pr-2">
                      <select aria-label={`Dept pemakai ${l.itemCode}`} value={form.dp[l.id] || ''} onChange={(e) => setBaris('dp', l.id, e.target.value)} className={inputClass(false, true)}>
                        {dept(pem.data?.data, l.deptPemakaiKode).map((o) => <option key={o.kode} value={o.kode}>{o.kode} {o.nama}</option>)}
                      </select>
                    </td>
                    {/* [Tahap 2, 11-11-2026, T-23] Dinonaktifkan: Dept proses tidak ditampilkan lagi (K-30). */}
                    {/* <td className="py-1">
                      <select aria-label={`Dept proses ${l.itemCode}`} value={form.dpr[l.id] || ''} onChange={(e) => setBaris('dpr', l.id, e.target.value)} className={inputClass(false, true)}>
                        {dept(pro.data?.data, l.deptProsesKode).map((o) => <option key={o.kode} value={o.kode}>{o.kode} {o.nama}</option>)}
                      </select>
                    </td> */}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-3 pt-1">
            {!adaPerubahan && <span className="text-xs text-slate-500">Belum ada perubahan.</span>}
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Kembali</button>
            <button type="button" disabled={!adaPerubahan} onClick={() => setKonfirmasi(true)} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">Lanjut ke konfirmasi</button>
          </div>
        </div>
      </Modal>
      <UbahDataDialog
        open={open && konfirmasi}
        onClose={() => setKonfirmasi(false)}
        bkb={bkb}
        changes={changes}
        payload={payload}
        onDone={(msg) => { onDone(msg); onClose(); }}
      />
    </>
  );
}
