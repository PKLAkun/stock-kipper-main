/** @type {import('next').NextConfig} */

// Keamanan: header HTTP yang dikirim ke semua respons.
// CSP membatasi sumber script/style/gambar sehingga XSS lebih sulit dieksploitasi.
function securityHeaders() {
  return [
    {
      key: 'Content-Security-Policy',
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        // izinkan akses ke Supabase (realtime + auth) dari browser
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co ws:",
        "font-src 'self' data:",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // mencegah website kita ditampilkan di iframe milik orang lain (clickjacking)
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  ];
}

const nextConfig = {
  reactStrictMode: true,
  // pastikan akar proyek benar (ada lockfile lain di folder home)
  outputFileTracingRoot: new URL('.', import.meta.url).pathname,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders() }];
  },
};

export default nextConfig;