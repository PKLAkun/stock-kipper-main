// FILE: app/(dashboard)/laporan/cetak/page.js
// Halaman cetak laporan (T-26). Filter dari query yang sama dengan layar Laporan.

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import LaporanCetak from '@/components/laporan/LaporanCetak';
import { tabValid, filterDariQuery } from '@/components/laporan/laporan-query';

export const metadata = { title: 'Cetak Laporan' };

export default async function CetakLaporanRoute({ searchParams }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!['staff', 'admin', 'superadmin'].includes(user.role)) redirect('/ruang-tunggu');

  const sp = (await searchParams) || {};
  const tab = tabValid(typeof sp.tab === 'string' ? sp.tab : 'mutasi');
  return <LaporanCetak tab={tab} filter={filterDariQuery(tab, sp)} />;
}
