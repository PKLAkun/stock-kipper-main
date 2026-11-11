// FILE: lib/env.js
// Environment variable (server side). Aplikasi sekarang SUPABASE-ONLY.

export function getEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    authSecret: process.env.AUTH_SECRET || '',
    sessionHours: Number(process.env.AUTH_SESSION_HOURS || 8),
    sessionIdleMinutes: Number(process.env.AUTH_SESSION_IDLE_MINUTES || 45),
    adminEmail: process.env.ADMIN_EMAIL || '',
    adminPassword: process.env.ADMIN_PASSWORD || '',
    adminName: process.env.ADMIN_NAME || 'Administrator',
  };
}

export function validateEnv() {
  const env = getEnv();
  if (env.authSecret.length < 32) {
    throw new Error('AUTH_SECRET minimal 32 karakter. Generate: openssl rand -base64 32');
  }
  // LOCAL_PGLITE=1: run lokal dengan PGlite, kunci Supabase tidak dipakai
  if (process.env.LOCAL_PGLITE !== '1' && (!env.supabaseUrl || !env.supabaseAnonKey || !env.supabaseServiceRoleKey)) {
    throw new Error(
      'Wajib mengisi NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_ROLE_KEY'
    );
  }
  return env;
}
