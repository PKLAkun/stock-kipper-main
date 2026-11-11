'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api-client';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import { Field, inputClass } from '@/components/ui/Field';
import { ROLE_OPTIONS } from './RoleBadge';

const KOSONG = { name: '', email: '', role: 'staff', password: '', confirmPassword: '', pin: '', confirmPin: '', inisial: '', timKode: '', tujuanKode: '' };

export default function UserFormModal({ open, onClose, existing, currentUserId, onSave }) {
  const isEdit = Boolean(existing);
  const isSelf = existing?.id === currentUserId;

  const [form, setForm] = useState(KOSONG);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [pinTampil, setPinTampil] = useState(false);

  // Pilihan Tim dan Keterangan (hanya yang aktif), dimuat saat modal terbuka
  const { data: timData } = useSWR(open ? '/api/parameter/tim?aktif=1' : null, swrFetcher);
  const { data: tujuanData } = useSWR(open ? '/api/parameter/tujuan?aktif=1' : null, swrFetcher);
  const timList = timData?.data || [];
  const tujuanList = tujuanData?.data || [];

  useEffect(() => {
    if (!open) return;
    setForm(existing
      ? {
        ...KOSONG, name: existing.name, email: existing.email || '', role: existing.role,
        inisial: existing.inisial || '', timKode: existing.timKode || '', tujuanKode: existing.tujuanKode || '',
      }
      : KOSONG);
    setErrors({});
    setPinTampil(false);
  }, [open, existing]);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const isOperator = form.role === 'operator';
  // operator tidak bisa diubah ke role lain (dan sebaliknya): kolom login berbeda
  const roleTerkunci = (role) => isEdit && (isSelf || (existing.role === 'operator') !== (role === 'operator'));

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};
    const email = form.email.trim().toLowerCase();
    if (!form.name.trim()) nextErrors.name = 'Nama wajib diisi.';
    const inisial = form.inisial.trim().toUpperCase();
    if (inisial && !/^[A-Z]{2,6}$/.test(inisial)) nextErrors.inisial = 'Inisial 2 sampai 6 huruf (A-Z).';
    if (!isEdit && isOperator && !form.tujuanKode) nextErrors.tujuanKode = 'Keterangan wajib dipilih untuk operator.';
    if (!isEdit) {
      if (isOperator) {
        if (!/^\d{4}$/.test(form.pin)) nextErrors.pin = 'PIN harus tepat 4 digit.';
        else if (form.pin !== form.confirmPin) nextErrors.confirmPin = 'Ulangi PIN harus sama.';
      } else {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Format email tidak valid.';
        if (form.password.length < 8) nextErrors.password = 'Password minimal 8 karakter.';
        else if (form.password !== form.confirmPassword) nextErrors.confirmPassword = 'Ulangi password harus sama.';
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      // inisial kosong dikirim null (dikosongkan); tim dan keterangan hanya untuk operator
      const tambahan = {
        inisial: inisial || null,
        ...(isOperator ? { timKode: form.timKode || null, tujuanKode: form.tujuanKode || null } : {}),
      };
      if (isEdit) {
        await onSave({ name: form.name.trim(), role: isSelf ? existing.role : form.role, active: existing.active, ...tambahan });
      } else if (isOperator) {
        await onSave({ name: form.name.trim(), role: 'operator', pin: form.pin, ...tambahan });
      } else {
        await onSave({ name: form.name.trim(), email, role: form.role, password: form.password, ...tambahan });
      }
      onClose();
    } catch (err) {
      setErrors({ form: err.message || 'Gagal menyimpan user.' });
    } finally {
      setBusy(false);
    }
  }

  const pinType = pinTampil ? 'text' : 'password';

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit User' : 'Tambah User'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nama" error={errors.name}>
          <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)}
            placeholder="Nama lengkap" className={inputClass(errors.name)} />
        </Field>

        {!isOperator && (
          <Field label="Email" error={errors.email} hint={isEdit ? 'Email tidak bisa diubah.' : undefined}>
            <input type="email" value={form.email} disabled={isEdit} onChange={(e) => setField('email', e.target.value)}
              placeholder="nama@perusahaan.com" className={inputClass(errors.email)} />
          </Field>
        )}

        <Field label="Role" error={errors.role} hint={isSelf ? 'Role akun sendiri tidak bisa diubah.' : undefined}>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {ROLE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={form.role === value}
                disabled={roleTerkunci(value)}
                onClick={() => setField('role', value)}
                className={
                  (form.role === value
                    ? 'rounded-xl border-2 border-brand-600 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 dark:bg-brand-900/30 '
                    : 'rounded-xl border-2 border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 ') +
                  'disabled:cursor-not-allowed disabled:opacity-50'
                }
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Inisial" error={errors.inisial} hint="2 sampai 6 huruf (A-Z). Tampil di BKB. Boleh dikosongkan.">
          <input type="text" value={form.inisial} maxLength={6} autoComplete="off" aria-label="Inisial"
            onChange={(e) => setField('inisial', e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6))}
            placeholder="Contoh: AND" className={`${inputClass(errors.inisial)} font-mono`} />
        </Field>

        {isOperator && (
          <>
            <Field label="Tim" error={errors.timKode}>
              <select value={form.timKode} aria-label="Tim" onChange={(e) => setField('timKode', e.target.value)} className={inputClass(errors.timKode)}>
                <option value="">Tanpa tim</option>
                {timList.filter((t) => t.aktif || t.kode === form.timKode).map((t) => (
                  <option key={t.kode} value={t.kode}>{t.nama}</option>
                ))}
              </select>
            </Field>
            <Field label={isEdit ? 'Keterangan' : 'Keterangan *'} error={errors.tujuanKode} hint="Keterangan tetap yang dipakai operator ini saat membuat BKB.">
              <select value={form.tujuanKode} aria-label="Keterangan" onChange={(e) => setField('tujuanKode', e.target.value)} className={inputClass(errors.tujuanKode)}>
                <option value="">Pilih keterangan</option>
                {tujuanList.filter((t) => t.aktif || t.kode === form.tujuanKode).map((t) => (
                  <option key={t.kode} value={t.kode}>{t.kode} - {t.nama}</option>
                ))}
              </select>
            </Field>
          </>
        )}

        {isOperator && (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
            Operator login dengan nama dan PIN 4 digit, tanpa email dan password.
            {isEdit && ' Untuk mengganti PIN, pakai tombol Set PIN di daftar pengguna.'}
          </div>
        )}

        {!isEdit && isOperator && (
          <>
            <Field label="PIN (4 digit)" error={errors.pin}>
              <input type={pinType} inputMode="numeric" maxLength={4} autoComplete="off" value={form.pin}
                onChange={(e) => setField('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                className={inputClass(errors.pin)} />
            </Field>
            <Field label="Ulangi PIN" error={errors.confirmPin}>
              <input type={pinType} inputMode="numeric" maxLength={4} autoComplete="off" value={form.confirmPin}
                onChange={(e) => setField('confirmPin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                className={inputClass(errors.confirmPin)} />
            </Field>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" checked={pinTampil} onChange={(e) => setPinTampil(e.target.checked)} /> Tampilkan PIN
            </label>
          </>
        )}

        {!isEdit && !isOperator && (
          <>
            <Field label="Password Awal" error={errors.password} hint="Minimal 8 karakter">
              <input type="password" autoComplete="new-password" value={form.password}
                onChange={(e) => setField('password', e.target.value)} className={inputClass(errors.password)} />
            </Field>
            <Field label="Ulangi Password" error={errors.confirmPassword}>
              <input type="password" autoComplete="new-password" value={form.confirmPassword}
                onChange={(e) => setField('confirmPassword', e.target.value)} className={inputClass(errors.confirmPassword)} />
            </Field>
          </>
        )}

        {errors.form && <p role="alert" className="text-sm text-rose-600">{errors.form}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            Batal
          </button>
          <button type="submit" disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">
            {busy && <Spinner className="h-4 w-4" />}
            {busy ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Buat User'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
