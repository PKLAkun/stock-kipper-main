// FILE: app/layout.js
// Layout root: memuat font/global style + penyedia Toast.

import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata = {
  title: {
    default: 'Stok Hub - Manajemen Stok Realtime',
    template: '%s | Stok Hub',
  },
  description: 'Website manajemen stok barang realtime dengan sistem login berbasis role.',
};

// script kecil: pasang tema gelap SEBELUM halaman dirender agar tidak kedip
const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="min-h-screen font-sans text-slate-900 antialiased dark:text-slate-100">
        {/* script tema harus muncul sebelum konten dirender */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}