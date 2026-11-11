'use client';

import { useEffect, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';

// Jumlah label yang dicetak sekaligus (bisa diubah user)
const DEFAULT_COPIES = 1;

export default function BarcodeModal({ open, onClose, item }) {
  const svgRef    = useRef(null);
  const [copies, setCopies]   = useState(DEFAULT_COPIES);
  const [error,  setError]    = useState('');
  const [ready,  setReady]    = useState(false);

  const barcodeValue = item?.barcode || item?.itemCode || '';

  // Generate barcode SVG setiap kali modal dibuka atau item berubah
  useEffect(() => {
    if (!open || !svgRef.current || !barcodeValue) return;
    setError('');
    setReady(false);

    import('jsbarcode').then(({ default: JsBarcode }) => {
      try {
        JsBarcode(svgRef.current, barcodeValue, {
          format:       'CODE128',
          width:        2.2,
          height:       70,
          displayValue: true,
          fontSize:     14,
          font:         'monospace',
          textMargin:   4,
          margin:       12,
          background:   '#ffffff',
          lineColor:    '#000000',
        });
        setReady(true);
      } catch (e) {
        setError(`Tidak bisa membuat barcode: ${e.message}`);
      }
    });
  }, [open, barcodeValue]);

  function handlePrint() {
    if (!svgRef.current || !ready) return;

    // Ambil SVG sebagai string
    const svgHtml = svgRef.current.outerHTML;

    // Bangun halaman cetak dengan N salinan label
    const labels = Array.from({ length: copies })
      .map(() => `
        <div class="label">
          ${svgHtml}
          <p class="item-name">${item.name}</p>
          <p class="item-code">${item.itemCode} · ${item.unit}</p>
        </div>`)
      .join('');

    const win = window.open('', '_blank', 'width=800,height=600');
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Label Barcode — ${item.itemCode}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: monospace; background: #fff; }
    .grid {
      display: flex; flex-wrap: wrap; gap: 6px; padding: 8px;
    }
    .label {
      border: 1px dashed #bbb;
      border-radius: 4px;
      padding: 6px 8px;
      text-align: center;
      width: fit-content;
      page-break-inside: avoid;
    }
    .label svg { display: block; margin: 0 auto; }
    .item-name {
      font-size: 11px; font-weight: bold;
      max-width: 220px; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
      margin-top: 2px;
    }
    .item-code { font-size: 10px; color: #555; margin-top: 1px; }
    @media print {
      body { margin: 0; }
      .grid { padding: 4px; gap: 4px; }
    }
  </style>
</head>
<body>
  <div class="grid">${labels}</div>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
</body>
</html>`);
    win.document.close();
  }

  if (!item) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Label Barcode — ${item.itemCode}`}>
      <div className="space-y-5">

        {/* Info barang */}
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800">
          <p className="font-semibold text-slate-800 dark:text-slate-100">{item.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Kode: <span className="font-mono">{item.itemCode}</span>
            {item.barcode && item.barcode !== item.itemCode && (
              <> · Barcode: <span className="font-mono">{item.barcode}</span></>
            )}
          </p>
          {!item.barcode && (
            <p className="mt-1 text-xs text-amber-600">
              ⚠ Barcode belum diisi di master — menggunakan Kode Barang sebagai nilai barcode.
              Edit master barang untuk mengisi barcode fisik.
            </p>
          )}
        </div>

        {/* Preview barcode */}
        <div className="flex justify-center rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          {error
            ? <p className="text-sm text-rose-600">{error}</p>
            : <svg ref={svgRef} className="max-w-full" />
          }
        </div>

        {/* Jumlah label */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Jumlah label:
          </label>
          <div className="flex items-center gap-2">
            <button type="button"
              onClick={() => setCopies((n) => Math.max(1, n - 1))}
              className="h-8 w-8 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300">
              −
            </button>
            <input
              type="number" min="1" max="100" value={copies}
              onChange={(e) => setCopies(Math.max(1, Math.min(100, parseInt(e.target.value,10)||1)))}
              className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <button type="button"
              onClick={() => setCopies((n) => Math.min(100, n + 1))}
              className="h-8 w-8 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300">
              +
            </button>
            <span className="text-sm text-slate-400">label</span>
          </div>
        </div>

        {/* Tombol aksi */}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            Tutup
          </button>
          <button type="button" onClick={handlePrint} disabled={!ready || Boolean(error)}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M9 16h6v6H9v-6z"/>
            </svg>
            Cetak {copies} Label
          </button>
        </div>
      </div>
    </Modal>
  );
}
