'use client';

// Pilihan cari-ketik generik (tujuan, dept pemakai, dept proses). Navigasi keyboard
// seperti form lama: ArrowDown/PageDown, ArrowUp/PageUp, Enter memilih, Esc menutup.

import { useMemo, useState } from 'react';
import { inputClass } from '@/components/ui/Field';

// options: [{ code, name }]
export default function SearchSelect({
  id, value, onChange, options, placeholder = 'Pilih', hasError, locked, onEnter,
  dataRow, dataField, label, describedBy,
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.find((o) => o.code === value);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    return q ? options.filter((o) => o.code.toLowerCase().includes(q) || (o.name || '').toLowerCase().includes(q)) : options;
  }, [text, options]);

  function pick(o) {
    onChange(o.code);
    setText('');
    setOpen(false);
    onEnter?.();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault(); setOpen(true);
      setActive((i) => Math.min(i + (e.key === 'PageDown' ? 3 : 1), Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault(); setOpen(true);
      setActive((i) => Math.max(i - (e.key === 'PageUp' ? 3 : 1), 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[active]) pick(filtered[active]); else onEnter?.();
    } else if (e.key === 'Escape') setOpen(false);
  }

  const shown = open ? text : (selected ? `${selected.code} - ${selected.name}` : '');

  return (
    <div className="relative">
      <input
        id={id}
        data-row={dataRow}
        data-field={dataField}
        role="combobox"
        aria-expanded={open}
        aria-controls={id ? `${id}-list` : undefined}
        aria-label={label}
        aria-describedby={describedBy}
        aria-required="true"
        type="text"
        autoComplete="off"
        readOnly={locked}
        value={shown}
        placeholder={placeholder}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => { if (!locked) { setOpen(true); setText(''); setActive(0); } }}
        onBlur={() => setTimeout(() => setOpen(false), 130)}
        onKeyDown={locked ? (e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); } } : onKeyDown}
        className={`${inputClass(hasError, true)} ${locked ? 'bg-slate-50 dark:bg-slate-800/60' : ''}`}
      />
      {open && !locked && (
        <ul id={id ? `${id}-list` : undefined} role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">Tidak ada pilihan.</li>}
          {filtered.map((o, i) => (
            <li key={o.code} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer border-b border-slate-100 px-3 py-2 text-sm last:border-0 dark:border-slate-800 ${i === active ? 'bg-brand-50 dark:bg-slate-800' : ''}`}>
              <span className="font-mono font-semibold">{o.code}</span>
              <span className="ml-2 text-xs text-slate-500">{o.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
