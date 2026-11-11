'use client';

import { useEffect, useRef, useState } from 'react';
import { swrFetcher } from '@/lib/api-client';
import { inputClass } from '@/components/ui/Field';

export default function MachineAutocomplete({ value, onChange, hasError, onEnter }) {
  const [text,    setText]    = useState(value || '');
  const [options, setOptions] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [active,  setActive]  = useState(0);
  const timer   = useRef(null);
  const reqId   = useRef(0);
  const navigated = useRef(false);
  const inputRef  = useRef(null);

  // Sync external value
  useEffect(() => { setText(value || ''); }, [value]);

  // Autocomplete saat ketik
  useEffect(() => {
    clearTimeout(timer.current);
    const q = text.trim();
    if (!q || q.length < 1) { setOptions([]); return; }
    timer.current = setTimeout(async () => {
      const id = ++reqId.current;
      try {
        const res = await swrFetcher(`/api/machines?q=${encodeURIComponent(q)}`);
        if (id !== reqId.current) return;
        setOptions(res.data || []);
        setActive(0);
        navigated.current = false;
        setOpen(true);
      } catch { if (id === reqId.current) setOptions([]); }
    }, 150);
    return () => clearTimeout(timer.current);
  }, [text]);

  function pick(machine) {
    reqId.current += 1;
    clearTimeout(timer.current);
    setText(machine.name);
    setOptions([]);
    setOpen(false);
    onChange(machine.name);
    onEnter?.();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault(); navigated.current = true; setOpen(true);
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp' && options.length) {
      e.preventDefault(); navigated.current = true;
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'PageDown' && options.length) {
      e.preventDefault(); navigated.current = true; setOpen(true);
      setActive((i) => Math.min(i + 3, options.length - 1));
    } else if (e.key === 'PageUp' && options.length) {
      e.preventDefault(); navigated.current = true;
      setActive((i) => Math.max(i - 3, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && options.length > 0 && navigated.current) {
        pick(options[active]);
      } else {
        onChange(text);
        onEnter?.();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => options.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 130)}
        placeholder="Ketik kode mesin, mis. 200"
        className={inputClass(hasError)}
      />

      {open && options.length > 0 && (
        <ul
          className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {options.map((m, index) => (
            <li
              key={m.id}
              onMouseDown={(e) => { e.preventDefault(); pick(m); }}
              onMouseEnter={() => { navigated.current = true; setActive(index); }}
              className={`cursor-pointer px-3 py-2 text-sm border-b border-slate-100 last:border-0 dark:border-slate-800 ${
                index === active ? 'bg-brand-50 dark:bg-slate-800' : ''
              }`}
            >
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{m.code}</span>
              <span className="ml-2 text-slate-500">{m.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}