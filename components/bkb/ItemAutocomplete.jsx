'use client';

import { useEffect, useRef, useState } from 'react';
import { swrFetcher } from '@/lib/api-client';
import { CATEGORIES } from '@/lib/constants/bkb';
import { formatNumber } from '@/lib/utils';
import { inputClass } from '@/components/ui/Field';
import CameraScanner from '@/components/ui/CameraScanner';

// categoryCode: '1' atau '4' — untuk filter barang RM/BO
export default function ItemAutocomplete({
  rowKey, selected, onSelect, onClear, onPicked, hasError, autoFocus, categoryCode,
}) {
  const [text,      setText]      = useState('');
  const [options,   setOptions]   = useState([]);
  const [open,      setOpen]      = useState(false);
  const [active,    setActive]    = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [notice,    setNotice]    = useState('');
  const [camOpen,   setCamOpen]   = useState(false);
  const reqId    = useRef(0);
  const timer    = useRef(null);
  const navigated = useRef(false);
  const inputRef  = useRef(null);
  const comboboxId = `item-autocomplete-${rowKey ?? 'new'}`;

  // Autocomplete saat ketik (debounce 180ms)
  useEffect(() => {
    clearTimeout(timer.current);
    const q = text.trim();
    if (selected || q.length < 1) { setOptions([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      const id = ++reqId.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({ q });
        if (categoryCode) params.set('categoryCode', categoryCode);
        const res = await swrFetcher(`/api/items/search?${params}`);
        if (id !== reqId.current) return;
        const found = res.data || [];
        setOptions(found);
        setActive(0);
        navigated.current = false;
        if (found.length > 0) setOpen(true);
        else if (q.length >= 2) setNotice(`Tidak ada barang ${categoryCode === '1' ? 'RM' : categoryCode === '4' ? 'BO' : ''} yang cocok dengan "${q}".`);
      } catch { if (id === reqId.current) setOptions([]); }
      finally { if (id === reqId.current) setLoading(false); }
    }, 180);
    return () => clearTimeout(timer.current);
  }, [text, selected, categoryCode]);

  function pick(item) {
    // Validasi kategori
    if (categoryCode && item.categoryCode !== categoryCode) {
      const got  = CATEGORIES[item.categoryCode]?.label || item.categoryCode;
      const want = CATEGORIES[categoryCode]?.label || categoryCode;
      setNotice(`Barang ini adalah ${got}, tapi form ini untuk ${want}.`);
      return;
    }
    reqId.current += 1;
    clearTimeout(timer.current);
    setLoading(false);
    setText(''); setOptions([]); setOpen(false); setNotice('');
    onSelect(item);
    onPicked?.(item);
  }

  async function handleEnter() {
    const code = text.trim();
    if (!code) return;
    clearTimeout(timer.current);

    if (open && options.length > 0 && navigated.current) {
      pick(options[active]); return;
    }

    const id = ++reqId.current;
    setLoading(true); setNotice('');
    try {
      const params = new URLSearchParams({ code });
      if (categoryCode) params.set('categoryCode', categoryCode);
      const exact = await swrFetcher(`/api/items/search?${params}`);
      if (id !== reqId.current) return;
      if (exact.data) {
        // Cek kategori
        if (categoryCode && exact.data.categoryCode !== categoryCode) {
          const got  = CATEGORIES[exact.data.categoryCode]?.label || exact.data.categoryCode;
          const want = CATEGORIES[categoryCode]?.label || categoryCode;
          setNotice(`Barang "${code}" adalah ${got}, tapi form ini hanya menerima ${want}.`);
          return;
        }
        pick(exact.data); return;
      }
      const qParams = new URLSearchParams({ q: code });
      if (categoryCode) qParams.set('categoryCode', categoryCode);
      const list = await swrFetcher(`/api/items/search?${qParams}`);
      if (id !== reqId.current) return;
      const found = list.data || [];
      if (found.length === 1) { pick(found[0]); }
      else if (found.length > 1) { setOptions(found); setActive(0); setOpen(true); setNotice('Beberapa barang cocok — pilih salah satu.'); }
      else { setNotice(`"${code}" tidak ada di master barang${categoryCode ? ` untuk kategori ${CATEGORIES[categoryCode]?.label}` : ''}.`); }
    } catch (err) {
      if (id === reqId.current) setNotice(err.message || 'Gagal mencari barang.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  async function handleCamDetected(value) {
    setCamOpen(false);
    setText(value);
    const id = ++reqId.current;
    setLoading(true); setNotice('');
    try {
      const params = new URLSearchParams({ code: value });
      if (categoryCode) params.set('categoryCode', categoryCode);
      const exact = await swrFetcher(`/api/items/search?${params}`);
      if (id !== reqId.current) return;
      if (exact.data) { pick(exact.data); return; }
      const qParams = new URLSearchParams({ q: value });
      if (categoryCode) qParams.set('categoryCode', categoryCode);
      const list = await swrFetcher(`/api/items/search?${qParams}`);
      if (id !== reqId.current) return;
      const found = list.data || [];
      if (found.length === 1) { pick(found[0]); }
      else if (found.length > 1) { setOptions(found); setActive(0); setOpen(true); setNotice('Beberapa barang cocok — pilih salah satu.'); }
      else { setNotice(`Barcode "${value}" tidak ditemukan.`); }
    } catch (err) {
      if (id === reqId.current) setNotice(err.message || 'Gagal mencari barang.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selected) { onPicked?.(selected); return; }
      handleEnter();
    } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      if (!options.length) return;
      e.preventDefault(); navigated.current = true; setOpen(true);
      setActive((i) => Math.min(i + (e.key === 'PageDown' ? 3 : 1), options.length - 1));
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      if (!options.length) return;
      e.preventDefault(); navigated.current = true;
      setActive((i) => Math.max(i - (e.key === 'PageUp' ? 3 : 1), 0));
    } else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <>
      <CameraScanner open={camOpen} onDetected={handleCamDetected} onClose={() => setCamOpen(false)} />

      <div className="relative flex gap-1">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            data-row={rowKey}
            data-field="item"
            autoComplete="off"
            spellCheck={false}
            autoFocus={autoFocus}
            value={selected ? selected.itemCode : text}
            onChange={(e) => {
              if (selected) onClear();
              setNotice('');
              setText(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => options.length && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 130)}
            placeholder="Ketik kode / nama, atau scan"
            role="combobox"
            aria-controls={open ? `${comboboxId}-list` : undefined}
            aria-expanded={open}
            aria-autocomplete="list"
            className={`${inputClass(hasError || Boolean(notice), true)} font-mono ${selected ? 'font-semibold pr-6' : ''} w-full`}
          />
          {/* Spinner — tampil hanya saat loading, tidak looping */}
          {loading && !selected && (
            <span className="absolute right-2 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500 pointer-events-none" />
          )}
          {selected && (
            <button type="button" tabIndex={-1}
              onClick={() => { onClear(); setText(''); setTimeout(() => inputRef.current?.focus(), 30); }}
              title="Hapus pilihan"
              className="absolute right-1.5 top-1.5 rounded p-0.5 text-slate-400 hover:text-rose-500">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCamOpen(true)}
          title="Scan barcode via kamera"
          className="flex-shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 text-slate-500 transition hover:border-brand-500 hover:bg-brand-50 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M3 9V6a1 1 0 011-1h3M3 15v3a1 1 0 001 1h3m11-4v3a1 1 0 01-1 1h-3m4-11h-3a1 1 0 00-1 1v3"/>
            <rect x="8" y="8" width="8" height="8" rx="1" strokeWidth="1.8"/>
          </svg>
        </button>
      </div>

      {notice && <p className="mt-1 text-xs text-rose-600">{notice}</p>}

      {/* Dropdown — max width mengikuti parent, tidak fullscreen */}
      {open && options.length > 0 && (
        <ul id={`${comboboxId}-list`} role="listbox"
          className="absolute left-0 right-0 z-40 mt-1 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
          style={{ minWidth: 0 }}
        >
          {options.map((item, index) => (
            <li key={item.id} role="option" aria-selected={index === active}
              onMouseDown={(e) => { e.preventDefault(); pick(item); }}
              onMouseEnter={() => { navigated.current = true; setActive(index); }}
              className={`cursor-pointer border-b border-slate-100 px-3 py-2 last:border-0 dark:border-slate-800 ${index === active ? 'bg-brand-50 dark:bg-slate-800' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">{item.itemCode}</span>
                <span className="shrink-0 text-xs text-slate-400">Saldo {formatNumber(item.quantity)} {item.unit}</span>
              </div>
              <p className="truncate text-xs text-slate-500">
                {item.name} · {CATEGORIES[item.categoryCode]?.label}
                {item.barcode && <span className="ml-1 text-slate-400">· BC: {item.barcode}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
