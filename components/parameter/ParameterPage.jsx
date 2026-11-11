'use client';

// Halaman Parameter (Superadmin): tab Tujuan, Dept Pemakai, Mesin, Jenis, Tim (Dept Proses dinonaktifkan, T-22); tanpa tombol hapus (docs/ui/07-superadmin.md bagian A).

import { useState } from 'react';
import { mutate } from 'swr';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher, apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { Field, inputClass } from '@/components/ui/Field';
import { cx } from '@/lib/utils';
import {
  TABS, tabValid, normalisasiBaris, labelArah, susunBody, validasi, perubahanBerdampak,
} from './parameter-config';

const urlList = (tab) => (tab.id === 'mesin' ? '/api/machines' : `/api/parameter/${tab.api}`);

function refreshSemua() {
  mutate((k) => typeof k === 'string' && (k.startsWith('/api/parameter') || k.startsWith('/api/machines')));
}

function useDaftar(tab, aktif = true) {
  const { data, error, isLoading } = useRealtimeSWR(
    aktif ? urlList(tab) : null,
    swrFetcher,
    { subscribeTables: [tab.table] },
  );
  const rows = (data?.data || []).map((r) => normalisasiBaris(tab.id, r));
  return { rows, error, isLoading };
}

function Gembok() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500" title="Terkunci: sudah dipakai di BKB">
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 118 0v3" />
      </svg>
      <span className="sr-only">Terkunci</span>
    </span>
  );
}

function FormModal({ tab, baris, jenisList, deptList, onClose }) {
  const toast = useToast();
  const edit = Boolean(baris);
  const [form, setForm] = useState({
    kode: baris?.kode || '',
    nama: baris?.nama || '',
    jenisKode: baris?.jenisKode || '',
    deptPemakaiKode: baris?.deptPemakaiKode || '',
    wajibMesin: baris?.wajibMesin || false,
    arah: baris?.arah || '',
    aktif: baris?.aktif ?? true,
  });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(null); // perubahan berdampak menunggu persetujuan
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const kunci = edit && baris.terkunci;

  const labelJenis = (k) => { const j = jenisList.find((x) => x.kode === k); return j ? `${j.kode} - ${j.nama}` : (k || '-'); };
  const labelDept = (k) => { const d = deptList.find((x) => x.kode === k); return d ? `${d.kode} - ${d.nama}` : (k || 'Pilih manual'); };

  async function simpan() {
    setBusy(true); setErr('');
    const body = susunBody(tab.id, form, baris);
    try {
      if (tab.id === 'mesin') {
        if (edit) await apiFetch(`/api/machines/${baris.id}`, { method: 'PUT', body });
        else await apiFetch('/api/machines', { method: 'POST', body });
      } else if (edit) {
        await apiFetch(`/api/parameter/${tab.api}/${encodeURIComponent(baris.kode)}`, { method: 'PUT', body });
      } else {
        await apiFetch(`/api/parameter/${tab.api}`, { method: 'POST', body });
      }
      toast(`${tab.singular} ${body.kode || body.code || baris.kode} ${edit ? 'diperbarui' : 'ditambahkan'}.`);
      refreshSemua();
      onClose();
    } catch (e) {
      const kodeTampil = form.kode.trim().toUpperCase();
      setErr(e.status === 409 && !edit ? `Kode ${kodeTampil} sudah dipakai.` : (e.message || 'Gagal menyimpan.'));
      setKonfirmasi(null);
    } finally {
      setBusy(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    const v = validasi(tab.id, form, baris);
    setErrs(v);
    if (Object.keys(v).length) return;
    if (tab.id === 'tujuan') {
      const beda = perubahanBerdampak(form, baris, { jenis: labelJenis, dept: labelDept });
      if (beda.length) { setKonfirmasi(beda); return; }
    }
    simpan();
  }

  return (
    <>
      <Modal open={!konfirmasi} onClose={busy ? () => {} : onClose} title={`${edit ? 'Edit' : 'Tambah'} ${tab.singular}`}>
        {err && (
          <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{err}</p>
        )}
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Kode *" error={errs.kode} hint={kunci ? undefined : 'Huruf kapital, angka, dan strip, maksimal 20.'}>
            <div className="flex items-center gap-2">
              <input
                type="text" value={form.kode} maxLength={20} disabled={kunci}
                aria-label="Kode" aria-invalid={Boolean(errs.kode)}
                onChange={(e) => set('kode', e.target.value.toUpperCase())}
                className={cx(inputClass(Boolean(errs.kode)), 'font-mono')}
              />
              {kunci && <Gembok />}
            </div>
            {kunci && <p className="mt-1 text-xs text-slate-500">Terkunci: sudah dipakai di BKB.</p>}
          </Field>

          <Field label="Nama *" error={errs.nama}>
            <input type="text" value={form.nama} maxLength={60} aria-label="Nama" aria-invalid={Boolean(errs.nama)}
              onChange={(e) => set('nama', e.target.value)} className={inputClass(Boolean(errs.nama))} />
          </Field>

          {tab.id === 'tujuan' && (
            <>
              <Field label="Jenis Transaksi *" error={errs.jenisKode}>
                <select value={form.jenisKode} aria-label="Jenis Transaksi" onChange={(e) => set('jenisKode', e.target.value)} className={inputClass(Boolean(errs.jenisKode))}>
                  <option value="">Pilih jenis</option>
                  {jenisList.filter((j) => j.aktif || j.kode === form.jenisKode).map((j) => (
                    <option key={j.kode} value={j.kode}>{j.kode} - {j.nama}</option>
                  ))}
                </select>
              </Field>
              <Field label="Dept pemakai bawaan" hint="Kosongkan bila dept dipilih manual saat BKB.">
                <select value={form.deptPemakaiKode} aria-label="Dept pemakai bawaan" onChange={(e) => set('deptPemakaiKode', e.target.value)} className={inputClass(false)}>
                  <option value="">Pilih manual</option>
                  {deptList.filter((d) => d.aktif || d.kode === form.deptPemakaiKode).map((d) => (
                    <option key={d.kode} value={d.kode}>{d.kode} - {d.nama}</option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={form.wajibMesin} onChange={(e) => set('wajibMesin', e.target.checked)} className="h-4 w-4 rounded" />
                Wajib mesin (BKB harus memilih mesin)
              </label>
            </>
          )}

          {tab.id === 'jenis' && (
            <Field label="Arah *" error={errs.arah}>
              <div className="flex items-center gap-2">
                <select value={form.arah} disabled={kunci} aria-label="Arah" onChange={(e) => set('arah', e.target.value)} className={inputClass(Boolean(errs.arah))}>
                  <option value="">Pilih arah</option>
                  <option value="in">Masuk</option>
                  <option value="out">Keluar</option>
                </select>
                {kunci && <Gembok />}
              </div>
              {kunci && <p className="mt-1 text-xs text-slate-500">Terkunci: sudah dipakai.</p>}
            </Field>
          )}

          {edit && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={form.aktif} onChange={(e) => set('aktif', e.target.checked)} className="h-4 w-4 rounded" />
              Aktif (muncul di form BKB)
            </label>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={busy}
              className="min-h-[44px] rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              Kembali
            </button>
            <button type="submit" disabled={busy}
              className="flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy && <Spinner className="h-4 w-4" />}
              {busy ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmActionDialog
        open={Boolean(konfirmasi)}
        onClose={() => setKonfirmasi(null)}
        onConfirm={simpan}
        title={`Ubah ${tab.singular} ${baris?.kode || ''}`}
        summary="Berlaku untuk BKB baru. BKB yang sudah ada tidak berubah."
        changes={konfirmasi || []}
        needAlasan={false}
        confirmLabel="Simpan perubahan"
      />
    </>
  );
}

function Panel({ tab }) {
  const toast = useToast();
  const [form, setForm] = useState(null); // { baris | null }
  const [nonaktif, setNonaktif] = useState(null);
  const { rows, error, isLoading } = useDaftar(tab);
  const tujuan = tab.id === 'tujuan';
  const jenisTab = TABS.find((t) => t.id === 'jenis');
  const deptTab = TABS.find((t) => t.id === 'dept-pemakai');
  const tujuanTab = TABS[0];
  const jenisList = useDaftar(jenisTab, tujuan).rows;
  const deptList = useDaftar(deptTab, tujuan || tab.id === 'dept-pemakai').rows;
  const tujuanList = useDaftar(tujuanTab, tab.id === 'dept-pemakai').rows;

  const labelJenis = (k) => { const j = jenisList.find((x) => x.kode === k); return j ? j.kode : (k || '-'); };
  const labelDept = (k) => { const d = deptList.find((x) => x.kode === k); return d ? d.kode : null; };

  async function setAktif(baris, aktif) {
    const body = susunBody(tab.id, {
      kode: baris.kode, nama: baris.nama, jenisKode: baris.jenisKode, deptPemakaiKode: baris.deptPemakaiKode,
      wajibMesin: baris.wajibMesin, arah: baris.arah, aktif,
    }, baris);
    if (tab.id === 'mesin') await apiFetch(`/api/machines/${baris.id}`, { method: 'PUT', body });
    else await apiFetch(`/api/parameter/${tab.api}/${encodeURIComponent(baris.kode)}`, { method: 'PUT', body });
    toast(`${tab.singular} ${baris.kode} ${aktif ? 'diaktifkan' : 'dinonaktifkan'}.`);
    refreshSemua();
  }

  async function aktifkan(baris) {
    try { await setAktif(baris, true); } catch (e) { toast.error(e.message || 'Gagal mengubah status.'); }
  }

  const infoNonaktif = [];
  if (nonaktif && tab.id === 'dept-pemakai') {
    const dipakai = tujuanList.filter((t) => t.aktif && t.deptPemakaiKode === nonaktif.kode).map((t) => t.kode);
    if (dipakai.length) {
      infoNonaktif.push(`Dept ${nonaktif.kode} masih menjadi bawaan tujuan ${dipakai.join(', ')}. Tujuan itu akan meminta dept dipilih manual.`);
    }
  }

  const kolom = {
    tujuan: ['Kode', 'Nama', 'Jenis', 'Dept bawaan', 'Wajib mesin', 'Status'],
    jenis: ['Kode', 'Nama', 'Arah', 'Status'],
  }[tab.id] || ['Kode', 'Nama', 'Status'];

  return (
    <div className="space-y-4">
      {form && (
        <FormModal tab={tab} baris={form.baris} jenisList={jenisList} deptList={deptList} onClose={() => setForm(null)} />
      )}

      <div className="flex justify-end">
        <button type="button" onClick={() => setForm({ baris: null })}
          className="min-h-[44px] rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          + Tambah {tab.singular}
        </button>
      </div>

      {isLoading && <SkeletonTable />}

      {!isLoading && error && (
        <EmptyState
          title="Parameter tidak bisa dimuat."
          description="Periksa sambungan, lalu coba lagi."
          action={<button type="button" onClick={() => mutate(urlList(tab))} className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Coba lagi</button>}
        />
      )}

      {!isLoading && !error && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500 dark:border-slate-700">
          Belum ada {tab.label.toLowerCase()}. Klik Tambah {tab.singular} untuk menambahkan.
        </div>
      )}

      {!error && rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                {kolom.map((k) => (
                  <th key={k} scope="col" className={cx('px-4 py-3 text-left whitespace-nowrap', k === 'Status' && 'text-center')}>{k}</th>
                ))}
                <th scope="col" className="px-4 py-3"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id ?? r.kode} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-slate-800 dark:text-slate-100">
                    <span className="inline-flex items-center gap-1.5">{r.terkunci && <Gembok />}{r.kode}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.nama}</td>
                  {tujuan && (
                    <>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{labelJenis(r.jenisKode)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{labelDept(r.deptPemakaiKode) || 'Pilih manual'}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.wajibMesin ? 'Ya' : 'Tidak'}</td>
                    </>
                  )}
                  {tab.id === 'jenis' && <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{labelArah(r.arah)}</td>}
                  <td className="px-4 py-3 text-center">
                    <Badge tone={r.aktif ? 'green' : 'slate'}>{r.aktif ? 'Aktif' : 'Nonaktif'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button type="button" onClick={() => setForm({ baris: r })}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
                      Edit
                    </button>
                    {r.aktif ? (
                      <button type="button" onClick={() => setNonaktif(r)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30">
                        Nonaktifkan
                      </button>
                    ) : (
                      <button type="button" onClick={() => aktifkan(r)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:text-indigo-300 dark:hover:bg-slate-700">
                        Aktifkan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.some((r) => r.terkunci) && (
        <p className="text-xs text-slate-500">Gembok = kode terkunci karena sudah dipakai BKB.</p>
      )}

      <ConfirmActionDialog
        open={Boolean(nonaktif)}
        onClose={() => setNonaktif(null)}
        title={`Nonaktifkan ${tab.singular} ${nonaktif?.kode || ''}`}
        summary={`${tab.singular} ${nonaktif?.kode || ''} tidak akan muncul lagi di form BKB. BKB yang sudah ada tidak berubah.`}
        infos={infoNonaktif}
        needAlasan={false}
        confirmLabel="Nonaktifkan"
        tone="danger"
        onConfirm={async () => { await setAktif(nonaktif, false); setNonaktif(null); }}
      />
    </div>
  );
}

export default function ParameterPage({ initialTab = 'tujuan' }) {
  const [tabId, setTabId] = useState(tabValid(initialTab));
  const tab = TABS.find((t) => t.id === tabId);

  function pilih(id) {
    setTabId(id);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('tab', id);
      window.history.replaceState(null, '', u);
    } catch { /* abaikan */ }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Parameter</h1>
        <p className="mt-1 text-sm text-slate-500">
          Daftar pilihan yang dipakai form BKB. Tidak ada yang dihapus; nonaktifkan bila tidak dipakai lagi.
        </p>
      </div>

      <div role="tablist" aria-label="Jenis parameter" className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id} role="tab" type="button" aria-selected={tabId === t.id}
            onClick={() => pilih(t.id)}
            className={cx(
              'whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition',
              tabId === t.id
                ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel"><Panel key={tab.id} tab={tab} /></div>
    </div>
  );
}
