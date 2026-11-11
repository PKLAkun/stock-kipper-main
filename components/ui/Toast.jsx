'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { cx } from '@/lib/utils';

const ToastContext = createContext(null);

const TYPES = {
  success: {
    dot: 'bg-emerald-500',
    border: 'border-emerald-200 dark:border-emerald-900',
    label: 'Berhasil',
  },
  error: {
    dot: 'bg-rose-500',
    border: 'border-rose-200 dark:border-rose-900',
    label: 'Gagal',
  },
  info: {
    dot: 'bg-sky-500',
    border: 'border-sky-200 dark:border-sky-900',
    label: 'Info',
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const push = useCallback((message, type = 'success') => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
    // hilangkan otomatis setelah beberapa detik
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const toastApi = useCallback(
    (message) => push(message, 'success'),
    [push]
  );
  toastApi.error = useCallback((message) => push(message, 'error'), [push]);
  toastApi.info = useCallback((message) => push(message, 'info'), [push]);

  return (
    <ToastContext.Provider value={toastApi}>
      {children}
      {/* daftar notifikasi (fixed di kanan bawah) */}
      <div className="fixed bottom-4 right-4 z-[120] flex w-full max-w-sm flex-col gap-2 px-4">
        {toasts.map((toast) => {
          const style = TYPES[toast.type] || TYPES.info;
          return (
            <div
              key={toast.id}
              className={cx(
                'pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3 shadow-lg dark:bg-slate-900',
                style.border
              )}
              role="status"
            >
              <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', style.dot)} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500">{style.label}</p>
                <p className="mt-0.5 break-words text-sm font-medium text-slate-800 dark:text-slate-100">
                  {toast.message}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast harus dipakai di dalam <ToastProvider>');
  }
  return context;
}