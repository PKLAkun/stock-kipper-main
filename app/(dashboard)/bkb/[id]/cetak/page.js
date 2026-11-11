// Tampilan cetak BKB: SK, DE, dan Superadmin (Operator tidak mencetak).
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import CetakBkb from '@/components/cetak/CetakBkb';

export const metadata = { title: 'Cetak BKB' };

export default async function CetakBkbRoute({ params, searchParams }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!['staff', 'admin', 'superadmin'].includes(user.role)) redirect('/');

  const { id } = await params;
  const sp = await searchParams;
  return <CetakBkb id={id} initialRangkap={typeof sp?.rangkap === 'string' ? sp.rangkap : 'semua'} />;
}
