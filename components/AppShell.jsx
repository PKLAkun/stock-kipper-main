'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import DarkModeToggle from './ui/DarkModeToggle';
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher } from '@/lib/api-client';
import { cx } from '@/lib/utils';
import { bersihkanDrafSesi, pindahDenganMuatUlang } from '@/lib/sesi-browser';
import { usePeranBuatBkb } from '@/hooks/usePeranBuatBkb';
import { bolehBuatBkb } from '@/lib/constants/izin-bkb';
import { useSesiBerakhir } from '@/hooks/useSesiBerakhir';

const ICONS = {
  // [Tahap 2, 11-11-2026] Ikon menu Cek Stok dan Laporan
  opname: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v14l-3-2-2 2-2-2-2 2-2-2-3 2V6a2 2 0 012-2z" />
    </svg>
  ),
  laporan: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  dashboard: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  stock: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10m8-14l-8 4-8-4" />
    </svg>
  ),
  activities: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  users: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  queue: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  create: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  ),
  parameter: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" />
    </svg>
  ),
  setting: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <rect x="2" y="7" width="20" height="10" rx="5" /><circle cx="16" cy="12" r="3" />
    </svg>
  ),
  menu: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  machine: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

const ROLE_LABEL = {
  superadmin: 'Superadmin',
  admin: 'Data entry',
  staff: 'Stock keeper',
  operator: 'Operator',
};

// daftar menu per role (docs/ui/01-navigasi.md). Superadmin memegang semua hak DE.
// Mesin dikelola Superadmin lewat tab di halaman Parameter, jadi tidak ada menu Master Mesin.
// Menu Buat BKB hanya untuk operator yang diizinkan di Pengaturan; role lain memakai tab Input BKB di /stok.
export function menuUntukRole(role, peranBuatBkb) {
  const operatorBuat = bolehBuatBkb('operator', peranBuatBkb);
  const semua = [
    { href: '/', label: 'Dashboard', icon: ICONS.dashboard, roles: ['staff', 'admin', 'superadmin'] },
    { href: '/buat-bkb', label: 'Buat BKB', icon: ICONS.create, roles: operatorBuat ? ['operator'] : [] },
    { href: '/stok', label: 'Stok & BKB', icon: ICONS.stock, roles: ['staff', 'admin', 'superadmin'] },
    { href: '/aktivitas', label: 'Aktivitas', icon: ICONS.activities, roles: ['staff', 'admin', 'superadmin'] },
    { href: '/ruang-tunggu', label: role === 'operator' ? 'BKB Saya' : 'Ruang Tunggu', icon: ICONS.queue, badge: true, roles: ['operator', 'staff', 'admin', 'superadmin'] },
    // [Tahap 2, 11-11-2026, T-24/T-26] Menu baru Cek Stok dan Laporan
    { href: '/cek-stok', label: 'Cek Stok', icon: ICONS.opname, badgeOpname: true, roles: ['staff', 'admin', 'superadmin'] },
    { href: '/laporan', label: 'Laporan', icon: ICONS.laporan, roles: ['staff', 'admin', 'superadmin'] },
    { href: '/parameter', label: 'Parameter', icon: ICONS.parameter, roles: ['superadmin'] },
    { href: '/pengaturan', label: 'Pengaturan', icon: ICONS.setting, roles: ['superadmin'] },
    { href: '/user', label: 'Pengguna', icon: ICONS.users, roles: ['superadmin'] },
  ];
  return semua.filter((l) => l.roles.includes(role));
}

function isActive(pathname, href) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

// jumlah BKB yang perlu tindakan (lencana menu Ruang Tunggu, U1-1)
function useLencana(role) {
  const kunciA = {
    operator: '/api/bkb?status=ditahan&limit=1',
    staff: '/api/bkb?status=menunggu&limit=1',
    admin: '/api/bkb?status=menunggu_de&limit=1',
    superadmin: '/api/bkb?status=menunggu_de&limit=1',
  }[role] || null;
  const kunciB = role === 'staff' ? '/api/bkb?status=ditahan&limit=1' : null;
  const kunciC = role === 'admin' || role === 'superadmin' ? '/api/bkb?status=ditahan&limit=100' : null;
  const opsi = { subscribeTables: ['bkb'] };
  const a = useRealtimeSWR(kunciA, swrFetcher, opsi);
  const b = useRealtimeSWR(kunciB, swrFetcher, opsi);
  const c = useRealtimeSWR(kunciC, swrFetcher, opsi);
  const total = (r) => Number(r.data?.meta?.total) || 0;
  let jumlah = total(a) + total(b);
  if (kunciC) {
    // DE hanya menghitung BKB ditahan yang menunggu koreksi saldo
    const rows = c.data?.data || [];
    jumlah += rows.filter((x) => (x.ditahanKarena ?? x.ditahan_karena) === 'menunggu_koreksi').length;
  }
  return jumlah;
}

// [Tahap 2, 11-11-2026, T-24] Lencana Cek Stok untuk DE/Superadmin: jumlah yang menunggu disetujui
function useLencanaOpname(role) {
  const kunci = role === 'admin' || role === 'superadmin' ? '/api/opname?status=diajukan&limit=1' : null;
  const r = useRealtimeSWR(kunci, swrFetcher, { subscribeTables: ['opname'] });
  return Number(r.data?.meta?.total) || 0;
}

function Lencana({ jumlah }) {
  if (!jumlah) return null;
  return (
    <span className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold leading-5 text-white">
      <span aria-hidden="true">{jumlah > 99 ? '99+' : jumlah}</span>
      <span className="sr-only">{jumlah} perlu tindakan</span>
    </span>
  );
}

function NavLinks({ user, peranBuatBkb, lencana, lencanaOpname = 0, onNavigate }) {
  const pathname = usePathname();
  const links = menuUntukRole(user.role, peranBuatBkb);

  return (
    <>
      {links.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
              active
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            )}
          >
            {link.icon}
            {link.label}
            {link.badge && <Lencana jumlah={lencana} />}
            {link.badgeOpname && <Lencana jumlah={lencanaOpname} />}
          </Link>
        );
      })}
    </>
  );
}

// bilah tab bawah di HP, hanya Operator dan SK (U1-2)
function TabBawah({ user, peranBuatBkb, lencana, onMenu }) {
  const pathname = usePathname();
  const hrefs = user.role === 'operator'
    ? ['/buat-bkb', '/ruang-tunggu']
    : user.role === 'staff'
    ? ['/ruang-tunggu', '/stok', '/']
    : [];
  if (hrefs.length === 0) return null;
  const menu = menuUntukRole(user.role, peranBuatBkb);
  const tabs = hrefs.map((h) => menu.find((m) => m.href === h)).filter(Boolean);
  const itemClass = (active) =>
    cx(
      'relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 border-t-2 text-[11px]',
      active
        ? 'border-brand-600 font-bold text-brand-700 dark:border-brand-500 dark:text-white'
        : 'border-transparent font-medium text-slate-500 dark:text-slate-400'
    );
  return (
    <nav
      aria-label="Menu cepat"
      className="fixed inset-x-0 bottom-0 z-40 flex h-14 border-t border-slate-200 bg-white lg:hidden print:hidden dark:border-slate-800 dark:bg-slate-900"
    >
      {tabs.map((t) => {
        const active = isActive(pathname, t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
            {t.icon}
            <span>{t.label}</span>
            {t.badge && lencana > 0 && (
              <span className="absolute right-1/4 top-1">
                <Lencana jumlah={lencana} />
              </span>
            )}
          </Link>
        );
      })}
      <button type="button" onClick={onMenu} className={itemClass(false)}>
        {ICONS.menu}
        <span>Menu</span>
      </button>
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-bold text-slate-900 dark:text-white">Stok Hub</p>
        <p className="text-[11px] text-slate-400">Digitalisasi BKB Realtime</p>
      </div>
    </div>
  );
}

export default function AppShell({ user, idleMinutes = 45, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const lencana = useLencana(user.role);
  const lencanaOpname = useLencanaOpname(user.role);
  const peranBuatBkb = usePeranBuatBkb();
  const adaTabBawah = user.role === 'operator' || user.role === 'staff';
  const sesi = useSesiBerakhir(user.role, user.sesiBerakhir);

  useEffect(() => {
    const timeoutMs = Math.max(1, Number(idleMinutes) || 45) * 60 * 1000;
    let timer;

    const logout = () => {
      fetch('/api/logout', { method: 'POST', keepalive: true })
        .catch(() => {})
        .finally(() => {
          bersihkanDrafSesi();
          pindahDenganMuatUlang('/login');
        });
    };

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(logout, timeoutMs);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [idleMinutes]);

  // drawer: Esc menutup
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {
      // tetap ke halaman login walau request gagal
    }
    // muat ulang penuh dan hapus draf, supaya data akun ini tidak terlihat oleh akun berikutnya
    bersihkanDrafSesi();
    pindahDenganMuatUlang('/login');
  }

  const sidebar = (
    <div className="flex h-full flex-col px-4 py-5">
      <Brand />
      <nav aria-label="Menu utama" className="mt-6 flex flex-col gap-1">
        <NavLinks lencanaOpname={lencanaOpname} user={user} peranBuatBkb={peranBuatBkb} lencana={lencana} onNavigate={() => setMobileOpen(false)} />
      </nav>

      <div className="mt-auto space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{user.name}</p>
              <p className="text-xs text-slate-400">{ROLE_LABEL[user.role] || user.role}</p>
            </div>
          </div>
          <DarkModeToggle />
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {loggingOut ? 'Keluar...' : 'Keluar'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <a
        href="#isi-halaman"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Lewati ke isi halaman
      </a>
      {/* sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r print:hidden border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
        {sidebar}
      </aside>

      {/* sidebar mobile (slide dari kiri) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-2xl dark:bg-slate-900">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64 print:pl-0">
        {/* pita peringatan shift hampir habis (operator) */}
        {sesi.tampilPeringatan && (
          <div
            role="alert"
            className="border-b lg:sticky lg:top-0 lg:z-[45] border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900 print:hidden dark:border-amber-700 dark:bg-amber-900 dark:text-amber-50"
          >
            Shift Anda selesai pukul {sesi.jamBerakhir}. Kirim BKB yang sedang diisi sebelum waktu itu.
          </div>
        )}
        {/* topbar mobile */}
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:hidden print:hidden dark:border-slate-800 dark:bg-slate-950/80">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu"
            className="rounded-lg border border-slate-200 p-2 text-slate-500 dark:border-slate-700 dark:text-slate-300"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <p className="text-sm font-bold text-slate-800 dark:text-white">Stok Hub</p>
          <DarkModeToggle />
        </header>

        <main
          id="isi-halaman"
          className={cx('mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:p-0', adaTabBawah && 'pb-20 lg:pb-6')}
        >
          {children}
        </main>
      </div>
      <TabBawah user={user} peranBuatBkb={peranBuatBkb} lencana={lencana} onMenu={() => setMobileOpen(true)} />
    </div>
  );
}