'use client';

// Role yang boleh membuat BKB dan BKB pengganti (Pengaturan Superadmin), ikut berubah realtime.
// Saat data belum termuat, dipakai nilai bawaan; server tetap menjadi penentu akhir.
import { useRealtimeSWR } from '@/hooks/useRealtimeSWR';
import { swrFetcher } from '@/lib/api-client';
import { normalPeranBuatBkb, normalPeranBuatPengganti } from '@/lib/constants/izin-bkb';

function usePengaturan() {
  const { data } = useRealtimeSWR('/api/pengaturan', swrFetcher, { subscribeTables: ['app_settings'] });
  return data?.data;
}

export function usePeranBuatBkb() {
  return normalPeranBuatBkb(usePengaturan()?.peranBuatBkb);
}

export function usePeranBuatPengganti() {
  return normalPeranBuatPengganti(usePengaturan()?.peranBuatPengganti);
}
