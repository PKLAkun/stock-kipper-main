// FILE: app/(dashboard)/laporan/page.js
// Menu Laporan (T-26, K-33). SK, DE, dan Superadmin; operator dialihkan.

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import LaporanPage from '@/components/laporan/LaporanPage';

export const metadata = { title: 'Laporan' };

export default async function LaporanRoute({ searchParams }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!['staff', 'admin', 'superadmin'].includes(user.role)) redirect('/ruang-tunggu');

  const sp = (await searchParams) || {};
  return <LaporanPage initialTab={typeof sp.tab === 'string' ? sp.tab : 'mutasi'} />;
}
