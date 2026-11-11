// Halaman Pengaturan: hanya Superadmin (dicek di middleware dan di sini).
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import PengaturanPage from '@/components/pengaturan/PengaturanPage';

export const metadata = { title: 'Pengaturan' };

export default async function PengaturanRoute() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'superadmin') redirect('/');

  return <PengaturanPage />;
}
