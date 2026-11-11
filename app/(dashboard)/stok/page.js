// FILE: app/(dashboard)/stok/page.js
// Halaman STOK BARANG — server component tipis, isi utamanya StockPage (client).

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { DEPT_PROSES_OPTIONS } from '@/lib/constants/bkb';
import StockPage from '@/components/items/StockPage';

export const metadata = { title: 'Stok & BKB' };

export default async function StockPageRoute({ searchParams }) {
  const sp = (await searchParams) || {};
  const user = await getSessionUser();
  if (!user) redirect('/login');
  // Operator tidak bisa akses halaman ini langsung
  if (user.role === 'operator') redirect('/ruang-tunggu');

  // Ambil dept proses dari DB (fallback ke constants kalau gagal)
  let deptProsesOptions = DEPT_PROSES_OPTIONS;
  try {
    const repo = getRepository();
    const dbOpts = await repo.listDeptProses();
    if (dbOpts && dbOpts.length > 0) {
      deptProsesOptions = dbOpts.map((d) => ({ code: d.code, name: d.name }));
    }
  } catch { /* pakai default */ }

  return (<StockPage user={{ id: user.id, name: user.name, role: user.role }} deptProsesOptions={deptProsesOptions}
      initialTab={sp.riwayat || sp.status ? 'master' : sp.tab}
      initialStatus={typeof sp.status === 'string' ? sp.status : ''}
      initialRiwayatId={/^\d+$/.test(String(sp.riwayat || '')) ? Number(sp.riwayat) : null}
    />);
}