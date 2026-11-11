'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { bersihkanDrafSesi, pindahDenganMuatUlang, tujuanAman } from '@/lib/sesi-browser';
import { apiFetch } from '@/lib/api-client';
import Spinner from './ui/Spinner';

export default function LoginForm() {
  const searchParams  = useSearchParams();

  const [mode,     setMode]     = useState('staff'); // 'staff' | 'operator'
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Operator login
  const [operators,   setOperators]   = useState([]);
  const [operatorId,  setOperatorId]  = useState('');
  const [pin,         setPin]         = useState('');

  const [error, setError] = useState('');
  const [busy,  setBusy]  = useState(false);

  // Load daftar operator
  useEffect(() => {
    if (mode === 'operator') {
      fetch('/api/operators').then((r) => r.json()).then((d) => setOperators(d.operators || [])).catch(() => {});
    }
  }, [mode]);

  // PIN input: hanya angka, max 4. Disamarkan oleh type="password" (bukan mengganti nilai dengan ●,
  // karena nilai samaran ikut terbaca saat mengetik digit berikutnya dan PIN tidak pernah lebih dari 1 digit).
  function handlePinChange(e) {
    setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    setBusy(true);
    try {
      if (mode === 'operator') {
        if (!operatorId) { setError('Pilih nama operator.'); setBusy(false); return; }
        if (pin.length !== 4) { setError('PIN harus 4 digit.'); setBusy(false); return; }
        await apiFetch('/api/operator-login', { body: { operatorId: Number(operatorId), pin } });
      } else {
        if (!email.trim() || !password) { setError('Email dan password wajib diisi.'); setBusy(false); return; }
        await apiFetch('/api/login', { body: { email, password } });
      }
      // muat ulang penuh: draf dan cache data akun sebelumnya tidak terbawa
      bersihkanDrafSesi();
      pindahDenganMuatUlang(tujuanAman(searchParams.get('next')));
    } catch (err) {
      setError(err.message || 'Login gagal. Periksa kembali data Anda.');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-600 via-brand-600 to-violet-700 px-4 py-10">
      <div className="w-full max-w-md">
        {/* logo */}
        <div className="mb-6 flex flex-col items-center gap-3 text-white">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold">Stok Hub</h1>
            <p className="text-sm text-indigo-100">Manajemen stok barang realtime</p>
          </div>
        </div>

        {/* kartu */}
        <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8 dark:bg-slate-900">
          {/* Tab mode login */}
          <div className="mb-5 flex rounded-xl border border-slate-200 p-1 dark:border-slate-700">
            <button
              type="button"
              onClick={() => { setMode('staff'); setError(''); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                mode === 'staff'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              Staff / Admin
            </button>
            <button
              type="button"
              onClick={() => { setMode('operator'); setError(''); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                mode === 'operator'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              Operator (PIN)
            </button>
          </div>

          {/* pesan tetap untuk ?alasan=shift; teks dari URL tidak pernah ditampilkan */}
          {searchParams.get('alasan') === 'shift' && !error && (
            <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              Shift Anda sudah selesai.
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'staff' ? (
              <>
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@perusahaan.com"
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPass ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-11 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showPass
                        ? <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                        : <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      }
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="operator-select" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Nama Operator
                  </label>
                  <select
                    id="operator-select"
                    value={operatorId}
                    onChange={(e) => setOperatorId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">— pilih nama —</option>
                    {operators.map((op) => (
                      <option key={op.id} value={op.id}>{op.name}</option>
                    ))}
                  </select>
                  {operators.length === 0 && (
                    <p className="mt-1 text-xs text-slate-400">Belum ada operator terdaftar. Hubungi admin.</p>
                  )}
                </div>
                <div>
                  <label htmlFor="pin-input" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    PIN (4 digit)
                  </label>
                  <input
                    id="pin-input"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={pin}
                    onChange={handlePinChange}
                    placeholder="••••"
                    autoComplete="off"
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-center text-2xl tracking-[0.5em] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <p className="mt-1 text-center text-xs text-slate-400">{pin.length}/4 digit</p>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && <Spinner className="h-4 w-4" />}
              {busy ? 'Memproses...' : 'Masuk'}
            </button>
          </form>

          {mode === 'operator' && (
            <p className="mt-4 text-center text-xs text-slate-400">
              PIN operator diatur oleh administrator. Hubungi admin jika lupa PIN.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}