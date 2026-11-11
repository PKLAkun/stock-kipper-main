// FILE: app/not-found.js
// Halaman 404 yang ramah (jangan tampilkan detail teknis).

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 dark:bg-slate-950">
      <p className="text-6xl font-bold text-brand-600">404</p>
      <p className="text-slate-600 dark:text-slate-300">Halaman yang Anda cari tidak ditemukan.</p>
      <Link
        href="/"
        className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
      >
        Kembali ke Dashboard
      </Link>
    </div>
  );
}