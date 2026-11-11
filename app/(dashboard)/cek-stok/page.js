// FILE: app/(dashboard)/cek-stok/page.js
// Daftar Cek Stok (K-31). SK, DE, Superadmin. Operator dialihkan.
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSessionUser } from '@/lib/auth/session';
import CekStokList from '@/components/opname/CekStokList';

export const metadata = { title: 'Cek Stok — Stok Hub' };

export default async function CekStokPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role === 'operator') redirect('/ruang-tunggu');
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Cek Stok</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user.role === 'staff'
            ? 'Catat hasil hitung fisik, barang rusak, atau hilang, lalu ajukan ke DE.'
            : user.role === 'admin'
            ? 'Cocokkan dengan kartu stok manual, lalu setujui atau tolak.'
            : 'Buat, ajukan, setujui, atau tolak Cek Stok.'}
        </p>
      </div>
      <Suspense fallback={null}>
        <CekStokList user={{ id: user.id, name: user.name, role: user.role }} />
      </Suspense>
    </div>
  );
}
