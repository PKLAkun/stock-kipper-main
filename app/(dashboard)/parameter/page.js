// Halaman Parameter: hanya Superadmin (dicek di middleware dan di sini).
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import ParameterPage from '@/components/parameter/ParameterPage';

export const metadata = { title: 'Parameter' };

export default async function ParameterRoute({ searchParams }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'superadmin') redirect('/');

  const sp = await searchParams;
  return <ParameterPage initialTab={typeof sp?.tab === 'string' ? sp.tab : 'tujuan'} />;
}
