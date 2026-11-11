'use client';

import { useState } from 'react';
import BkbForm from '@/components/bkb/BkbForm';
import BkbListPanel from '@/components/bkb/BkbListPanel';
import MasterPanel from './MasterPanel';
import { cx } from '@/lib/utils';
import { usePeranBuatBkb } from '@/hooks/usePeranBuatBkb';
import { bolehBuatBkb } from '@/lib/constants/izin-bkb';

// Tab Input BKB hanya untuk role yang boleh membuat BKB (Pengaturan Superadmin; bawaan: SK).
const TABS = [
  { id: 'input',  label: 'Input BKB', buat: true },
  { id: 'daftar', label: 'Daftar BKB' },
  { id: 'master', label: 'Master & Saldo Stok' },
];

export default function StockPage({ user, deptProsesOptions, initialTab = 'input', initialStatus = '', initialRiwayatId = null }) {
  const isAdmin = user.role === 'admin' || user.role === 'superadmin';
  const bolehInput = bolehBuatBkb(user.role, usePeranBuatBkb());
  const tabs = TABS.filter((t) => !t.buat || bolehInput);
  const [pilihan, setTab] = useState(initialTab);
  const tab = tabs.some((t) => t.id === pilihan) ? pilihan : tabs[0].id;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Stok & BKB</h1>
        <p className="mt-1 text-sm text-slate-500">
          {bolehInput ? 'Input BKB, ' : ''}{isAdmin
            ? 'daftar BKB, kelola master barang, dan pantau saldo secara realtime.'
            : 'daftar BKB, dan pantau saldo stok (master barang hanya-lihat).'}
        </p>
      </div>

      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              'whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition',
              tab === t.id
                ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'input' && bolehInput && <BkbForm user={user} onSaved={() => {}} deptProsesOptions={deptProsesOptions} />}
      {tab === 'daftar' && <BkbListPanel role={user.role} />}
      {tab === 'master' && <MasterPanel isAdmin={isAdmin} initialStatus={initialStatus} initialRiwayatId={initialRiwayatId} />}
    </div>
  );
}