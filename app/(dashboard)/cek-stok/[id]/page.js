// FILE: app/(dashboard)/cek-stok/[id]/page.js
// Detail dan form Cek Stok. id 'baru' = buat draf. Operator dialihkan.
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import CekStokDetail from '@/components/opname/CekStokDetail';

export const metadata = { title: 'Detail Cek Stok — Stok Hub' };

export default async function CekStokDetailRoute({ params }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role === 'operator') redirect('/ruang-tunggu');
  const { id } = await params;
  if (id !== 'baru' && !/^\d+$/.test(id)) redirect('/cek-stok');
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <CekStokDetail id={id} user={{ id: user.id, name: user.name, role: user.role }} />
    </div>
  );
}
