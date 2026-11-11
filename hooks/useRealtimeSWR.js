// FILE: hooks/useRealtimeSWR.js
// SATU pintu data untuk semua daftar yang harus HIDUP OTOMATIS (Dashboard, Stok, BKB, Aktivitas).
//
// Cara kerja (Supabase Realtime Broadcast):
//   1. Trigger di database (lihat supabase/schema.sql, bagian 9) mengirim sinyal ringan
//      "tabel X berubah" ke kanal 'stok-hub' setiap kali items / bkb / transactions_log berubah.
//   2. Browser subscribe SEKALI ke kanal itu. Begitu sinyal datang, semua SWR key yang
//      mendaftar untuk tabel tersebut di-revalidate -> saldo di semua layar berubah tanpa refresh.
//   3. Sinyal tidak membawa data stok; data tetap diambil lewat API yang terotentikasi.
//
// Jaring pengaman: revalidate saat tab kembali aktif, setelah koneksi realtime tersambung ulang,
// dan polling lambat (30 detik) kalau koneksi websocket sedang bermasalah.
//
//   const { data } = useRealtimeSWR(key, swrFetcher, { subscribeTables: ['items', 'transactions_log'] });

'use client';

import { useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { loadBrowserSupabase } from '@/lib/supabase-browser';

const CHANNEL_TOPIC = 'stok-hub';
const FALLBACK_POLL_MS = 30000;

const tableHandlers = new Map(); // nama tabel -> Set<fungsi refresh>
let listenerStarted = false;

function fire(table) {
  const handlers = tableHandlers.get(table);
  if (handlers) for (const handler of [...handlers]) handler();
}

function fireAll() {
  for (const table of tableHandlers.keys()) fire(table);
}

function startRealtimeListener() {
  if (listenerStarted) return;
  listenerStarted = true;

  loadBrowserSupabase().then((sb) => {
    if (!sb) {
      listenerStarted = false;
      return;
    }
    // debounce per tabel: satu transaksi bisa memicu beberapa sinyal beruntun
    const timers = new Map();
    sb.channel(CHANNEL_TOPIC)
      .on('broadcast', { event: 'changed' }, ({ payload }) => {
        const table = payload?.table;
        if (!table) return;
        clearTimeout(timers.get(table));
        timers.set(table, setTimeout(() => fire(table), 120));
      })
      .subscribe((status) => {
        // setelah (re)connect, muat ulang semuanya supaya tidak ada perubahan yang terlewat
        if (status === 'SUBSCRIBED') fireAll();
      });
  });
}

export function useRealtimeSWR(key, fetcher, options = {}) {
  const { subscribeTables = [], pollInterval, ...swrOptions } = options || {};

  const swr = useSWR(key, fetcher, {
    refreshInterval: pollInterval ?? FALLBACK_POLL_MS,
    revalidateOnFocus: true,
    keepPreviousData: true,
    ...swrOptions,
  });

  const subscribeKey = subscribeTables.join(',');

  useEffect(() => {
    startRealtimeListener();
  }, []);

  useEffect(() => {
    if (!key || subscribeKey === '') return undefined;
    const handler = () => mutate(key);
    const tables = subscribeKey.split(',');
    for (const table of tables) {
      if (!tableHandlers.has(table)) tableHandlers.set(table, new Set());
      tableHandlers.get(table).add(handler);
    }
    return () => {
      for (const table of tables) tableHandlers.get(table)?.delete(handler);
    };
  }, [key, subscribeKey]);

  return swr;
}
