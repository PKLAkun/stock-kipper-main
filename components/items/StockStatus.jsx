import Badge from '@/components/ui/Badge';

// Habis (saldo 0), Di bawah minimum (0 < saldo < stok minimum), selain itu Tersedia.
export function stockStatus(quantity, stokMinimum) {
  if (Number(quantity) <= 0) return 'habis';
  if (stokMinimum && Number(quantity) < Number(stokMinimum)) return 'bawah_minimum';
  return 'tersedia';
}

export default function StockStatus({ quantity, stokMinimum }) {
  const s = stockStatus(quantity, stokMinimum);
  if (s === 'habis') return <Badge tone="red">Habis</Badge>;
  if (s === 'bawah_minimum') return <Badge tone="amber">Di bawah minimum</Badge>;
  return <Badge tone="green">Tersedia</Badge>;
}
