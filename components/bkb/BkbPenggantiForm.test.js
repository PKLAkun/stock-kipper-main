import { describe, it, expect } from 'vitest';
import { perubahanBaris } from './BkbPenggantiForm.jsx';

describe('perubahanBaris', () => {
  const lama = { itemId: 5, qty: 25 };
  it('tanpa perubahan => null', () => expect(perubahanBaris(lama, 5, '25')).toBeNull());
  it('QTY saja', () => expect(perubahanBaris(lama, 5, '52,5')).toBe('Diubah: QTY'));
  it('barang dan QTY', () => expect(perubahanBaris(lama, 6, '1')).toBe('Diubah: barang (nomor urut baru) dan QTY'));
});
