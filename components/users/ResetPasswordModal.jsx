'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';

export default function ResetPasswordModal({ open, onClose, user, onSave }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setConfirmPassword('');
    setErrors({});
  }, [open]);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});

    if (password.length < 8) {
      setErrors({ password: 'Password minimal 8 karakter.' });
      return;
    }
    if (password !== confirmPassword) {
      setErrors({ confirmPassword: 'Ulangi password harus sama.' });
      return;
    }

    setBusy(true);
    try {
      await onSave({ password });
      onClose();
    } catch (err) {
      setErrors({ form: err.message || 'Gagal mereset password.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Reset Password">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Buat password baru untuk <span className="font-semibold">{user?.name}</span> ({user?.email}).
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <Field label="Password Baru" error={errors.password}>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="********"
            className={inputClass(errors.password)}
          />
        </Field>
        <Field label="Ulangi Password Baru" error={errors.confirmPassword}>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="********"
            className={inputClass(errors.confirmPassword)}
          />
        </Field>
        {errors.form && <p role="alert" className="text-sm text-rose-600">{errors.form}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Spinner className="h-4 w-4" />}
            {busy ? 'Menyimpan...' : 'Simpan Password Baru'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function inputClass(hasError) {
  return (
    'w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 ' +
    'dark:border-slate-700 dark:bg-slate-800 dark:text-white ' +
    (hasError ? 'border-rose-400 focus:border-rose-400' : '')
  );
}