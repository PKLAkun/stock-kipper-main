// FILE: app/(dashboard)/user/page.js
// Halaman PENGELOLAAN USER — hanya bisa dibuka oleh Superadmin.
// Dicek dua lapis: middleware (dari JWT) + di sini dari database.

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import UserPage from '@/components/users/UserPage';

export const metadata = { title: 'Pengguna' };

export default async function UserPageRoute() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  // bukan superadmin? langsung ke beranda (bukan sekadar sembunyikan menu)
  if (user.role !== 'superadmin') redirect('/');

  return <UserPage currentUser={user} />;
}