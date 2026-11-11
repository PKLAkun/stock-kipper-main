'use client';

import Modal from './Modal';
import { cx } from '@/lib/utils';

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmText = 'Hapus', busy = false }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Batal
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className={cx(
            'rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition',
            'hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60'
          )}
        >
          {busy ? 'Memproses...' : confirmText}
        </button>
      </div>
    </Modal>
  );
}