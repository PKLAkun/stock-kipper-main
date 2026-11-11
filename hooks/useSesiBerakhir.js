'use client';

// Peringatan dan keluar otomatis saat shift operator habis.
// Timer di browser hanya untuk tampilan; penegakan sesungguhnya ada di exp token (server).

import { useEffect, useState } from 'react';
import { hitungStatusSesi } from '@/lib/sesi-berakhir';
import { bersihkanDrafSesi, pindahDenganMuatUlang } from '@/lib/sesi-browser';

const CEK_MS = 15 * 1000;

// Balikan: { tampilPeringatan, jamBerakhir }. Hanya aktif untuk role operator.
export function useSesiBerakhir(role, sesiBerakhir) {
  const aktif = role === 'operator' && Boolean(sesiBerakhir);
  const [status, setStatus] = useState(() => hitungStatusSesi(aktif ? sesiBerakhir : null));

  useEffect(() => {
    if (!aktif) return undefined;
    let selesai = false;

    const cek = () => {
      const s = hitungStatusSesi(sesiBerakhir);
      setStatus(s);
      if (s.habis && !selesai) {
        selesai = true;
        fetch('/api/logout', { method: 'POST', keepalive: true })
          .catch(() => {})
          .finally(() => {
            bersihkanDrafSesi();
            // alasan=shift: halaman login menampilkan pesan tetap (bukan teks dari URL)
            pindahDenganMuatUlang('/login?alasan=shift');
          });
      }
    };

    cek();
    const timer = setInterval(cek, CEK_MS);
    return () => clearInterval(timer);
  }, [aktif, sesiBerakhir]);

  return { tampilPeringatan: aktif && status.tampilPeringatan, jamBerakhir: status.jamBerakhir };
}
