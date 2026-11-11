// FILE: app/(dashboard)/aktivitas/page.js
// Halaman "Aktivitas": log siapa melakukan apa terhadap stok, bisa disaring
// berdasarkan user dan rentang tanggal. Layout induk sudah menangani login.

import ActivitiesPage from '@/components/activities/ActivitiesPage';

export const metadata = {
  title: 'Aktivitas Stok',
};

export default function AktivitasPage() {
  return <ActivitiesPage />;
}