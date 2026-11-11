// FILE: app/(dashboard)/page.js
// Halaman DASHBOARD — server component yang memastikan sesi + menyiapkan data user.

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import DashboardView from '@/components/dashboard/DashboardView';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  // Operator langsung ke Buat BKB (halaman awal Operator)
  if (user.role === 'operator') redirect('/buat-bkb');

  return <DashboardView isAdmin={user.role === 'admin' || user.role === 'superadmin'} />;
}