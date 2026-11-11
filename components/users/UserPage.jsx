'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher, apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import RoleBadge from './RoleBadge';
import Badge from '@/components/ui/Badge';
import { SkeletonTable } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import UserFormModal from './UserFormModal';
import ResetPasswordModal from './ResetPasswordModal';
import { formatDateTime, formatNumber } from '@/lib/utils';

export default function UserPage({ currentUser }) {
  const toast = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [resettingUser, setResettingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [setPinUser, setSetPinUser] = useState(null);
  const [pinValue, setPinValue] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinTampil, setPinTampil] = useState(false);

  const { data, isLoading, error } = useRealtimeSWR('/api/users', swrFetcher, {
    subscribeTables: ['users'],
    fallbackData: {},
  });

  const users = data?.data || [];
  // Nama tim dan keterangan untuk kolom daftar (semua parameter, termasuk nonaktif)
  const { data: timData } = useSWR('/api/parameter/tim', swrFetcher);
  const { data: tujuanData } = useSWR('/api/parameter/tujuan', swrFetcher);
  const namaTim = (kode) => (timData?.data || []).find((t) => t.kode === kode)?.nama || kode;
  const namaTujuan = (kode) => (tujuanData?.data || []).find((t) => t.kode === kode)?.kode || kode;
  const superadminAktif = users.filter((u) => u.role === 'superadmin' && u.active).length;

  function refresh() {
    mutate('/api/users');
  }

  // ----- POST / PUT -----
  // error dilempar ulang supaya tampil di dalam modal (isian dipertahankan)
  async function handleSaveUser(payload) {
    if (editingUser) {
      await apiFetch(`/api/users/${editingUser.id}`, { method: 'PUT', body: payload });
      toast('Data user berhasil diubah.');
    } else {
      const result = await apiFetch('/api/users', { body: payload });
      toast(`User ${result.data.name} berhasil dibuat.`);
    }
    setEditingUser(null);
    refresh();
  }

  // ----- reset password -----
  async function handleResetPassword({ password }) {
    await apiFetch(`/api/users/${resettingUser.id}/reset-password`, { body: { password } });
    toast('Password berhasil direset. Sesi lama user tersebut ditutup.');
    refresh();
  }

  // ----- toggle aktif / nonaktif -----
  async function handleToggleActive(user) {
    try {
      await apiFetch(`/api/users/${user.id}`, {
        method: 'PUT',
        body: { name: user.name, role: user.role, active: !user.active },
      });
      toast(`${user.name} ${user.active ? 'dinonaktifkan' : 'diaktifkan'}.`);
      refresh();
    } catch (err) {
      toast.error(err.message || 'Gagal mengubah status.');
    }
  }

  // ----- set PIN operator -----
  async function handleSetPin() {
    const pin = pinValue.replace(/\D/g, '');
    if (pin.length !== 4) { setPinError('PIN harus tepat 4 digit.'); return; }
    setPinError('');
    setPinBusy(true);
    try {
      await apiFetch(`/api/users/${setPinUser.id}/set-pin`, { body: { pin } });
      toast(`PIN untuk ${setPinUser.name} berhasil diset.`);
      setSetPinUser(null);
      setPinValue('');
    } catch (err) {
      setPinError(err.message || 'Gagal set PIN.');
    } finally {
      setPinBusy(false);
    }
  }

  // ----- hapus -----
  async function handleDelete() {
    if (!deletingUser) return;
    setDeleteBusy(true);
    try {
      await apiFetch(`/api/users/${deletingUser.id}`, { method: 'DELETE' });
      toast('User berhasil dihapus.');
      setDeletingUser(null);
      refresh();
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus user.');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Pengguna</h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola akun yang bisa masuk: {formatNumber(users.length)} pengguna.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingUser(null);
            setFormOpen(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
          Tambah User
        </button>
      </div>

      {superadminAktif === 1 && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          Hanya ada 1 Superadmin aktif. Tambahkan satu lagi supaya pengelolaan pengguna tidak terkunci bila akun ini bermasalah.
        </div>
      )}

      {error ? (
        <EmptyState title="Gagal memuat data" description={error.message} action={<button onClick={refresh} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Coba lagi</button>} />
      ) : isLoading ? (
        <SkeletonTable rows={5} />
      ) : users.length === 0 ? (
        <EmptyState title="Belum ada user" description="Tambahkan user pertama lewat tombol di atas." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Inisial</th>
                <th className="px-4 py-3 font-medium">Tim</th>
                <th className="px-4 py-3 font-medium">Keterangan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Dibuat</th>
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {users.map((user) => {
                const isSelf = user.id === currentUser.id;
                return (
                  <tr key={user.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-100">
                            {user.name}
                            {isSelf && <span className="ml-2 text-xs font-normal text-slate-400">(Anda)</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.role === 'operator' ? 'Login dengan PIN' : user.email}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">{user.inisial || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.role === 'operator' && user.timKode ? namaTim(user.timKode) : '-'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.role === 'operator' && user.tujuanKode ? namaTujuan(user.tujuanKode) : '-'}</td>
                    <td className="px-4 py-3">
                      {user.active ? <Badge tone="green">Aktif</Badge> : <Badge tone="red">Nonaktif</Badge>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDateTime(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ActionButton
                          title="Edit"
                          disabled={isSelf}
                          onClick={() => {
                            setEditingUser(user);
                            setFormOpen(true);
                          }}
                          className="hover:bg-amber-100 hover:text-amber-600 disabled:opacity-30 disabled:hover:bg-transparent"
                          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.4-9.4a2.1 2.1 0 113 3L11 15l-4 1 1-4 8.6-8.4z" />}
                        />
                        <ActionButton
                          title="Reset password"
                          onClick={() => setResettingUser(user)}
                          disabled={!user.active}
                          className="hover:bg-sky-100 hover:text-sky-600 disabled:opacity-30 disabled:hover:bg-transparent"
                          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />}
                        />
                        <ActionButton
                          title={user.active ? 'Nonaktifkan' : 'Aktifkan'}
                          disabled={isSelf}
                          onClick={() => handleToggleActive(user)}
                          className="hover:bg-violet-100 hover:text-violet-600 disabled:opacity-30 disabled:hover:bg-transparent"
                          icon={
                            user.active ? (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636M13.364 10.636a2 2 0 01-2.728 2.728" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M13.732 13.732A3 3 0 018.2 10.2M7.5 7.5A9.86 9.86 0 003 12c2.3 3.6 6.1 6 10 6 1.4 0 2.7-.2 4-.7M16.6 16.6A9.86 9.86 0 0121 12c-2.3-3.6-6.1-6-10-6-1.4 0-2.7.2-4 .7" />
                            )
                          }
                        />
                        {user.role === 'operator' && (
                          <ActionButton
                            title="Set PIN"
                            onClick={() => { setSetPinUser(user); setPinValue(''); setPinError(''); setPinTampil(false); }}
                            className="hover:bg-indigo-100 hover:text-indigo-600"
                            icon={<path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />}
                          />
                        )}
                        <ActionButton
                          title="Hapus"
                          disabled={isSelf}
                          onClick={() => setDeletingUser(user)}
                          className="hover:bg-rose-100 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent"
                          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.14A2 2 0 0116.14 21H7.86a2 2 0 01-1.993-1.86L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* modal form tambah/edit */}
      <UserFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingUser(null);
        }}
        existing={editingUser}
        currentUserId={currentUser.id}
        onSave={handleSaveUser}
      />

      {/* modal reset password */}
      <ResetPasswordModal
        open={Boolean(resettingUser)}
        onClose={() => setResettingUser(null)}
        user={resettingUser}
        onSave={handleResetPassword}
      />

      {/* modal set PIN operator */}
      {setPinUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Set PIN Operator</h2>
            <p className="mb-4 text-sm text-slate-500">{setPinUser.name}</p>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">PIN Baru (4 digit)</label>
            <input
              type={pinTampil ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="off" aria-label="PIN baru" 
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="0000"
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-center text-2xl tracking-[0.5em] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              autoFocus
            />
            <label className="mb-3 flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" checked={pinTampil} onChange={(e) => setPinTampil(e.target.checked)} /> Tampilkan PIN
            </label>
            {pinError && <p role="alert" className="mb-3 text-xs text-rose-600">{pinError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setSetPinUser(null); setPinValue(''); }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                Batal
              </button>
              <button type="button" onClick={handleSetPin} disabled={pinBusy || pinValue.length !== 4}
                className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                {pinBusy && <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                Simpan PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* dialog konfirmasi hapus */}
      <ConfirmDialog
        open={Boolean(deletingUser)}
        onClose={() => setDeletingUser(null)}
        onConfirm={handleDelete}
        busy={deleteBusy}
        title="Hapus User"
        message={`Yakin ingin menghapus "${deletingUser?.name}"? Tindakan ini tidak bisa dibatalkan. Bila pengguna sudah punya riwayat BKB, nonaktifkan saja.`}
      />
    </div>
  );
}

function ActionButton({ title, onClick, icon, className = '', disabled = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition disabled:cursor-not-allowed dark:text-slate-400 ${className}`}
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        {icon}
      </svg>
    </button>
  );
}