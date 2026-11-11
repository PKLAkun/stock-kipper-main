// FILE: app/(dashboard)/layout.js
// Layout untuk semua halaman yang butuh login (dashboard, stok, user).
// Server component: cek sesi langsung dari database, lalu bungkus dengan AppShell.

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { publicUser } from '@/lib/auth/guards';
import AppShell from '@/components/AppShell';
import { getEnv} from '@/lib/env'

export default async function DashboardLayout({ children }) {
  // sesi dicek dua lapis: middleware (cepat) + di sini pakai data terbaru dari DB
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }

  const idleMinutes = getEnv().sessionIdleMinutes;

  return <AppShell user={publicUser(user)} idleMinutes={idleMinutes}>
    {children}
  </AppShell>;
}