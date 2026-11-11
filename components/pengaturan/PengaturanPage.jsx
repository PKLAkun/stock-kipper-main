'use client';

// Halaman Pengaturan (Superadmin): saklar "Wajib approve DE", role yang boleh membuat BKB, dan role yang boleh membuat BKB pengganti, lewat dialog dengan password
// (docs/ui/07-superadmin.md bagian B). Saklar hanya menampilkan keadaan.

import { useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher, apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { cx } from '@/lib/utils';
import { PERAN_BUAT_BKB_PILIHAN, PERAN_BUAT_PENGGANTI_PILIHAN } from '@/lib/constants/izin-bkb';

const LABEL_PERAN = { operator: 'Operator', staff: 'Stock keeper (SK)', admin: 'Data entry (DE)', superadmin: 'Superadmin' };
const daftarPeran = (arr) => (arr || []).map((r) => LABEL_PERAN[r] || r).join(', ') || '-';

export default function PengaturanPage() {
  const toast = useToast();
  const [dialog, setDialog] = useState(false);
  const [spanduk, setSpanduk] = useState(false);
  const nilaiRef = useRef(null);
  const sendiriRef = useRef(false);

  const { data, error, isLoading } = useRealtimeSWR('/api/pengaturan', swrFetcher, { subscribeTables: ['app_settings'] });
  const { data: antrean } = useRealtimeSWR(
    '/api/bkb?status=menunggu_de&limit=1', swrFetcher, { subscribeTables: ['bkb'] },
  );
  const aktif = data?.data?.wajibApproveDe;
  const jumlahMenunggu = Number(antrean?.meta?.total) || 0;

  // perubahan dari Superadmin lain: tampilkan spanduk
  useEffect(() => {
    if (typeof aktif !== 'boolean') return;
    if (nilaiRef.current !== null && nilaiRef.current !== aktif && !sendiriRef.current) setSpanduk(true);
    nilaiRef.current = aktif;
    sendiriRef.current = false;
  }, [aktif]);

  const siap = typeof aktif === 'boolean';
  const target = !aktif;
  const labelAksi = aktif ? 'Matikan wajib approve' : 'Aktifkan wajib approve';

  async function simpan({ alasan, password }) {
    await apiFetch('/api/pengaturan', { method: 'PUT', body: { wajibApproveDe: target, password, alasan } });
    sendiriRef.current = true;
    toast(`Wajib approve DE ${target ? 'diaktifkan' : 'dimatikan'}.`);
    setDialog(false);
    mutate('/api/pengaturan');
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Pengaturan</h1>
        <p className="mt-1 text-sm text-slate-500">Hanya Superadmin yang bisa mengubah. Perubahan wajib password.</p>
      </div>

      {spanduk && (
        <p role="status" className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <span>Pengaturan baru saja diubah oleh Superadmin lain.</span>
          <button type="button" onClick={() => setSpanduk(false)} className="text-xs font-semibold underline">Tutup</button>
        </p>
      )}

      {isLoading && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {!isLoading && error && (
        <EmptyState
          title="Pengaturan tidak bisa dimuat."
          description="Periksa sambungan, lalu coba lagi."
          action={<button type="button" onClick={() => mutate('/api/pengaturan')} className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Coba lagi</button>}
        />
      )}

      {siap && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <h2 id="judul-wajib-approve" className="text-base font-semibold text-slate-900 dark:text-white">Wajib approve DE</h2>
            <div className="flex items-center gap-2">
              <button
                type="button" role="switch" aria-checked={aktif} aria-labelledby="judul-wajib-approve" disabled
                className={cx('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full', aktif ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700')}
              >
                <span className={cx('inline-block h-5 w-5 rounded-full bg-white transition', aktif ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{aktif ? 'Aktif' : 'Nonaktif'}</span>
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Aktif: setelah saldo cocok, BKB menunggu approve DE sebelum tersimpan.
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Nonaktif: setelah saldo cocok, BKB langsung tersimpan.
          </p>
          {jumlahMenunggu > 0 && (
            <p className="mt-2 text-sm text-slate-500">Ada {jumlahMenunggu} BKB menunggu approve DE saat ini.</p>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="button" onClick={() => setDialog(true)}
              className="min-h-[44px] rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {labelAksi}
            </button>
          </div>
        </section>
      )}

      {siap && (
        <KartuPeran
          id="peran-buat-bkb" kunci="peranBuatBkb" judul="Boleh membuat BKB"
          keterangan="Role yang dicentang bisa membuat BKB baru. Minimal satu role."
          pilihan={PERAN_BUAT_BKB_PILIHAN} sekarang={data.data.peranBuatBkb || []}
          onSaved={() => { sendiriRef.current = true; }}
        />
      )}

      {siap && (
        <KartuPeran
          id="peran-buat-pengganti" kunci="peranBuatPengganti" judul="Boleh membuat BKB pengganti"
          keterangan="Role yang dicentang bisa membuat BKB pengganti untuk BKB yang sudah tersimpan. Operator tidak membuat BKB pengganti. Minimal satu role."
          pilihan={PERAN_BUAT_PENGGANTI_PILIHAN} sekarang={data.data.peranBuatPengganti || []}
          onSaved={() => { sendiriRef.current = true; }}
        />
      )}

      <p className="text-xs text-slate-500">Riwayat perubahan ada di halaman Aktivitas.</p>


      <ConfirmActionDialog
        open={dialog && siap}
        onClose={() => setDialog(false)}
        onConfirm={simpan}
        title={`${aktif ? 'Matikan' : 'Aktifkan'} "Wajib approve DE"`}
        summary={aktif
          ? 'Setelah dimatikan, BKB yang saldonya cocok langsung tersimpan tanpa approve DE.'
          : 'Setelah diaktifkan, BKB yang saldonya cocok menunggu approve DE sebelum tersimpan.'}
        changes={[{ label: 'Wajib approve DE', sebelum: aktif ? 'Aktif' : 'Nonaktif', sesudah: target ? 'Aktif' : 'Nonaktif' }]}
        infos={aktif && jumlahMenunggu > 0
          ? [`Ada ${jumlahMenunggu} BKB menunggu approve DE. BKB itu tetap bisa di-approve DE atau SK.`]
          : []}
        needPassword
        confirmLabel={labelAksi}
        mapError={(e) => (e.status === 401 || e.status === 429 || e.status === 403 ? null : 'Pengaturan belum berubah. Coba lagi.')}
      />
    </div>
  );
}

// Kartu kotak centang role untuk satu pengaturan (peranBuatBkb atau peranBuatPengganti).
function KartuPeran({ id, kunci, judul, keterangan, pilihan, sekarang, onSaved }) {
  const toast = useToast();
  const [draft, setDraft] = useState(null);
  const [dialog, setDialog] = useState(false);
  const dipilih = draft ?? sekarang;
  const berubah = draft !== null && [...draft].sort().join(',') !== [...sekarang].sort().join(',');

  function toggle(role) {
    const baru = dipilih.includes(role) ? dipilih.filter((r) => r !== role) : [...dipilih, role];
    setDraft(pilihan.filter((r) => baru.includes(r)));
  }

  async function simpan({ alasan, password }) {
    await apiFetch('/api/pengaturan', { method: 'PUT', body: { [kunci]: draft, password, alasan } });
    onSaved?.();
    toast(`Pengaturan "${judul}" diperbarui.`);
    setDialog(false);
    setDraft(null);
    mutate('/api/pengaturan');
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 id={`judul-${id}`} className="text-base font-semibold text-slate-900 dark:text-white">{judul}</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{keterangan}</p>
      <fieldset aria-labelledby={`judul-${id}`} className="mt-3 grid gap-2 sm:grid-cols-2">
        {pilihan.map((role) => {
          const dicentang = dipilih.includes(role);
          const terakhir = dicentang && dipilih.length === 1;
          return (
            <label key={role} className={cx('flex min-h-[44px] items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700', terakhir && 'opacity-70')}>
              <input type="checkbox" checked={dicentang} disabled={terakhir} onChange={() => toggle(role)} className="h-4 w-4 rounded border-slate-300" />
              <span className="text-slate-700 dark:text-slate-200">{LABEL_PERAN[role]}</span>
            </label>
          );
        })}
      </fieldset>
      {dipilih.length === 1 && <p className="mt-2 text-xs text-slate-500">Satu role terakhir tidak bisa dimatikan.</p>}
      <div className="mt-4 flex justify-end gap-2">
        {berubah && (
          <button type="button" onClick={() => setDraft(null)}
            className="min-h-[44px] rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
            Batal
          </button>
        )}
        <button type="button" disabled={!berubah} onClick={() => setDialog(true)}
          className="min-h-[44px] rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
          Simpan perubahan
        </button>
      </div>
      <ConfirmActionDialog
        open={dialog && berubah}
        onClose={() => setDialog(false)}
        onConfirm={simpan}
        title={`Ubah "${judul}"`}
        summary="BKB yang sudah dibuat tidak berubah. Perubahan berlaku untuk BKB baru."
        changes={[{ label: judul, sebelum: daftarPeran(sekarang), sesudah: daftarPeran(draft) }]}
        needPassword
        confirmLabel="Simpan perubahan"
        mapError={(e) => (e.status === 401 || e.status === 429 || e.status === 403 ? null : 'Pengaturan belum berubah. Coba lagi.')}
      />
    </section>
  );
}
