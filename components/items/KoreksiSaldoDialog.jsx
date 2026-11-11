'use client';

import { useEffect, useState } from 'react';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { Field, inputClass } from '@/components/ui/Field';
import { apiFetch } from '@/lib/api-client';
import { formatNumber } from '@/lib/utils';

// Koreksi saldo barang (K-17): saldo baru + alasan + password, lewat POST /api/items/[id]/koreksi.
export default function KoreksiSaldoDialog({ open, onClose, item, onDone }) {
  const [saldoBaru, setSaldoBaru] = useState('');
  // [Tahap 2, 11-11-2026, T-25] Isian baru wajib: nama atasan dan nomor Berita Acara (K-32).
  const [namaAtasan, setNamaAtasan] = useState('');
  const [nomorBa, setNomorBa] = useState('');

  useEffect(() => {
    if (open) { setSaldoBaru(''); setNamaAtasan(''); setNomorBa(''); }
  }, [open, item?.id]);

  if (!item) return null;

  const angka = saldoBaru === '' ? null : Number(saldoBaru);
  const valid = angka != null && Number.isFinite(angka) && angka >= 0;
  const blockers = [];
  if (saldoBaru === '') blockers.push('Isi saldo baru.');
  else if (!valid) blockers.push('Saldo baru harus angka dan tidak boleh negatif.');
  else if (angka === Number(item.quantity)) blockers.push('Saldo baru sama dengan saldo sekarang.');

  if (!namaAtasan.trim()) blockers.push('Isi nama atasan.');
  if (!nomorBa.trim()) blockers.push('Isi nomor Berita Acara.');

  const selisih = valid ? angka - Number(item.quantity) : null;

  return (
    <ConfirmActionDialog
      open={open}
      onClose={onClose}
      title={`Koreksi saldo ${item.itemCode}`}
      summary={`${item.name}. Saldo sistem diganti sesuai hitungan fisik. Koreksi dicatat di kartu stok tanpa nomor urut.`}
      confirmLabel="Simpan koreksi"
      needAlasan
      needPassword
      blockers={blockers}
      changes={valid ? [{
        label: `Saldo (${item.unit})`,
        sebelum: formatNumber(item.quantity),
        sesudah: `${formatNumber(angka)} (${selisih > 0 ? '+' : ''}${formatNumber(selisih)})`,
      }] : undefined}
      onConfirm={async ({ alasan, password }) => {
        // [Tahap 2, 11-11-2026, T-25] Dinonaktifkan: body tanpa namaAtasan dan nomorBa.
        // const res = await apiFetch(`/api/items/${item.id}/koreksi`, {
        //   body: { saldoBaru: angka, alasan, password },
        // });
        const res = await apiFetch(`/api/items/${item.id}/koreksi`, {
          body: { saldoBaru: angka, alasan, namaAtasan: namaAtasan.trim(), nomorBa: nomorBa.trim(), password },
        });
        onDone?.(res.data);
        onClose();
      }}
    >
      <Field label={`Saldo baru (${item.unit})`} hint={`Saldo sekarang ${formatNumber(item.quantity)} ${item.unit}`}>
        <input
          type="number" min="0" step="any" inputMode="decimal" autoFocus
          value={saldoBaru} onChange={(e) => setSaldoBaru(e.target.value)}
          className={inputClass(false)}
        />
      </Field>
      <Field label="Nama atasan *" hint="Atasan yang menyetujui koreksi ini (maks. 100 karakter).">
        <input
          type="text" maxLength={100} autoComplete="off"
          value={namaAtasan} onChange={(e) => setNamaAtasan(e.target.value)}
          className={inputClass(false)}
        />
      </Field>
      <Field label="Nomor Berita Acara *" hint="Nomor BA yang ditandatangani atasan (maks. 100 karakter).">
        <input
          type="text" maxLength={100} autoComplete="off"
          value={nomorBa} onChange={(e) => setNomorBa(e.target.value)}
          className={inputClass(false)}
        />
      </Field>
    </ConfirmActionDialog>
  );
}
