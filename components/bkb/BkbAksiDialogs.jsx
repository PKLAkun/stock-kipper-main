'use client';

import { useCallback, useEffect, useState } from 'react';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { apiFetch, swrFetcher } from '@/lib/api-client';
import { dampakKeDialog } from './bkbAksi';

// Muat dampak dari server saat dialog dibuka (snapshot, bukan realtime: angka harus tetap selama dialog terbuka).
function useDampak(open, url) {
  const [state, setState] = useState({ loading: true, error: false, data: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open) return undefined;
    let batal = false;
    setState({ loading: true, error: false, data: null });
    swrFetcher(url)
      .then((r) => !batal && setState({ loading: false, error: false, data: r.data }))
      .catch(() => !batal && setState({ loading: false, error: true, data: null }));
    return () => { batal = true; };
  }, [open, url, tick]);
  const retry = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, retry };
}

// Batalkan BKB selesai: stok dibalik. DE/SA, alasan + password.
export function BatalBkbDialog({ open, onClose, bkb, onDone }) {
  const dampak = useDampak(open, `/api/bkb/${bkb.id}/dampak?aksi=batal`);
  const { stockRows, warnings, blockers } = dampakKeDialog(dampak.data, 'batal');
  return (
    <ConfirmActionDialog
      open={open}
      onClose={onClose}
      tone="danger"
      title={`Batalkan BKB ${bkb.docNo}`}
      summary="Saldo dikembalikan seperti sebelum BKB ini disimpan. Status BKB menjadi Dibatalkan dan tidak bisa dihapus."
      confirmLabel="Batalkan BKB"
      needAlasan
      needPassword
      stockRows={stockRows}
      warnings={warnings}
      blockers={blockers}
      loading={dampak.loading}
      loadError={dampak.error}
      onRetry={dampak.retry}
      onConfirm={async ({ alasan, password }) => {
        await apiFetch(`/api/bkb/${bkb.id}/batal`, { body: { versi: dampak.data.versi, alasan, password } });
        onDone('BKB dibatalkan. Saldo dikembalikan.');
        onClose();
      }}
    />
  );
}

// Ganti BKB: BKB lama dibalik, pengganti disimpan dalam satu transaksi.
export function GantiBkbDialog({ open, onClose, bkb, pengganti, onDone }) {
  const dampak = useDampak(open, `/api/bkb/${bkb.id}/dampak?aksi=ganti&penggantiId=${pengganti.id}`);
  const { stockRows, warnings, blockers } = dampakKeDialog(dampak.data, 'ganti');
  return (
    <ConfirmActionDialog
      open={open}
      onClose={onClose}
      title={`Ganti BKB ${bkb.docNo}`}
      summary={`BKB ini diganti oleh ${pengganti.docNo}. Saldo dihitung ulang dalam satu langkah; bila saldo SK pada pengganti tidak cocok, pengganti kembali ke SK dan tidak ada yang berubah.`}
      confirmLabel="Ganti BKB"
      needAlasan
      needPassword
      stockRows={stockRows}
      warnings={warnings}
      blockers={blockers}
      loading={dampak.loading}
      loadError={dampak.error}
      onRetry={dampak.retry}
      onConfirm={async ({ alasan, password }) => {
        await apiFetch(`/api/bkb/${bkb.id}/ganti`, { body: { versi: dampak.data.versi, penggantiId: pengganti.id, alasan, password } });
        onDone(`BKB diganti oleh ${pengganti.docNo}.`);
        onClose();
      }}
    />
  );
}

// Ubah data BKB (kolom non-stok): dipanggil dari modal Ubah data setelah ada perubahan.
export function UbahDataDialog({ open, onClose, bkb, changes, payload, onDone }) {
  return (
    <ConfirmActionDialog
      open={open}
      onClose={onClose}
      title={`Ubah data BKB ${bkb.docNo}`}
      summary="Hanya data yang tidak memengaruhi stok. Nilai lama dan baru dicatat di riwayat."
      confirmLabel="Simpan perubahan"
      needAlasan
      needPassword
      changes={changes}
      onConfirm={async ({ alasan, password }) => {
        await apiFetch(`/api/bkb/${bkb.id}/data`, { method: 'PATCH', body: { ...payload, alasan, password } });
        onDone('Data BKB diubah.');
        onClose();
      }}
    />
  );
}
