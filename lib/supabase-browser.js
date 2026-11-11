// FILE: lib/supabase-browser.js
// Klien Supabase untuk BROWSER. Hanya memakai key PUBLIK (anon) dan HANYA untuk
// mendengarkan sinyal Realtime Broadcast. Semua data tetap diambil lewat API server.

let browserClient = null;

export async function loadBrowserSupabase() {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const { createClient } = await import('@supabase/supabase-js');
  browserClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return browserClient;
}
