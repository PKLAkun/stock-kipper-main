import { getSessionUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import RuangTunggu from '@/components/requests/RuangTunggu';

export const metadata = { title: 'Ruang Tunggu — Stok Hub' };

export default async function RuangTungguPage() {
    const user = await getSessionUser();
    if (!user) redirect('/login');

    return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{user.role === 'operator' ? 'BKB Saya' : 'Ruang Tunggu'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user.role === 'staff'
            ? 'Cek barang, ketik saldo akhir, lalu periksa saldo.'
            : user.role === 'operator'
            ? 'Status BKB Anda, diperbarui otomatis.'
            : 'Approve BKB yang saldonya sudah cocok.'}
        </p>
      </div>
      <Suspense fallback={null}>
        <RuangTunggu user={user} />
      </Suspense>
    </div>
  );
}