import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import BkbForm from '@/components/bkb/BkbForm';
import { getRepository } from '@/lib/db';
import { bolehBuatBkb } from '@/lib/constants/izin-bkb';

export const metadata = { title: 'Buat BKB - Stok Hub' };

export default async function BuatBkbPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  // hak membuat BKB diatur Superadmin (Pengaturan). Selain operator, form ada di tab Input BKB /stok
  const { peranBuatBkb } = await getRepository().getPengaturan();
  if (!bolehBuatBkb(user.role, peranBuatBkb)) redirect('/ruang-tunggu');
  if (user.role !== 'operator') redirect('/stok?tab=input');

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Buat BKB</h1>
        <p className="mt-1 text-sm text-slate-500">BKB yang dikirim masuk ke Ruang Tunggu untuk dicek Stock Keeper.</p>
      </div>
      {/* [Tahap 2, 11-11-2026, T-23] user membawa inisial, keterangan (tujuan), dan shift sesi untuk isian read-only */}
      <BkbForm user={{
        id: user.id, name: user.name, role: user.role,
        inisial: user.inisial ?? null, timKode: user.timKode ?? null, tujuanKode: user.tujuanKode ?? null,
        sesiShift: user.sesiShift ?? null,
      }} />
    </div>
  );
}
