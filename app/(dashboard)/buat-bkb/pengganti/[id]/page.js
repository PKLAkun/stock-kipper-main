import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import BkbPenggantiForm from '@/components/bkb/BkbPenggantiForm';
import { getRepository } from '@/lib/db';
import { bolehBuatPengganti } from '@/lib/constants/izin-bkb';

export const metadata = { title: 'Buat BKB Pengganti - Stok Hub' };

export default async function PenggantiPage({ params }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect('/login');
  // BKB pengganti mengikuti Pengaturan "boleh membuat BKB pengganti"; peran lain kembali ke detail
  const { peranBuatPengganti } = await getRepository().getPengaturan();
  if (!bolehBuatPengganti(user.role, peranBuatPengganti) || !/^\d+$/.test(id)) redirect(/^\d+$/.test(id) ? `/bkb/${id}` : '/ruang-tunggu');

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Buat BKB pengganti</h1>
        <p className="mt-1 text-sm text-slate-500">DE akan menjalankan Ganti BKB setelah saldo Anda cocok.</p>
      </div>
      <BkbPenggantiForm lamaId={Number(id)} />
    </div>
  );
}
