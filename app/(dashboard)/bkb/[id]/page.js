// Detail BKB: semua role (Operator hanya miliknya, ditegakkan API).
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import BkbDetail from '@/components/bkb/BkbDetail';

export const metadata = { title: 'Detail BKB' };

export default async function BkbDetailRoute({ params }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const { id } = await params;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <BkbDetail id={id} user={{ id: user.id, name: user.name, role: user.role }} />
    </div>
  );
}
