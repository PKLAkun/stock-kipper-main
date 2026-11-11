// FILE: middleware.js
// Proteksi halaman & API di level router (berjalan di Edge, tanpa database).
// Lapisan pertama keamanan. Api routes tetap melakukan cek otorisasi sendiri
// (requireAuth/requireRole) sebagai lapisan kedua yang paling penting.

import { NextResponse } from 'next/server';
import { renewSessionToken, sessionCookieOptions, verifySessionToken } from '@/lib/auth/jwt';
import { getEnv } from '@/lib/env.js';

// Path yang bisa diakses TANPA login
const PUBLIC_PATHS = ['/login', '/api/login', '/api/operator-login', '/api/operators'];

function isPublicPath(pathname) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// cocok bila path persis sama atau berada di bawahnya (batas segmen, bukan sekadar awalan teks)
function inPath(pathname, base) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function homePath(role) {
  return role === 'operator' ? '/buat-bkb' : '/';
}

const OPERATOR_PAGES = ['/buat-bkb', '/ruang-tunggu', '/bkb'];
const OPERATOR_API_ANY = ['/api/bkb', '/api/items/search', '/api/me', '/api/logout'];
const OPERATOR_API_GET = ['/api/machines', '/api/parameter', '/api/pengaturan'];

function operatorAllowed(pathname, method) {
  if (pathname === '/') return true;
  if (OPERATOR_PAGES.some((p) => inPath(pathname, p))) return true;
  if (OPERATOR_API_ANY.some((p) => inPath(pathname, p))) return true;
  if ((method === 'GET' || method === 'HEAD') && OPERATOR_API_GET.some((p) => inPath(pathname, p))) return true;
  return false;
}

export default async function middleware(request) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('session')?.value;
  const payload = await verifySessionToken(token);
  const isApi = pathname.startsWith('/api');
  const idleMs = (getEnv().sessionIdleMinutes || 45) * 60 * 1000;
  const now = Date.now();
  let response = null;

  // Sesi menganggur terlalu lama -> paksa login ulang.
  if (payload && !isPublicPath(pathname) && now - Number(payload.iat || 0) * 1000 > idleMs) {
    const expired = isApi
      ? NextResponse.json(
          { ok: false, error: 'Sesi berakhir karena tidak ada aktivitas.' },
          { status: 401 }
        )
      : NextResponse.redirect(new URL('/login', request.url));
    expired.cookies.delete('session');
    return expired;
  }

  // Perpanjang iat tiap 5 menit; exp absolut tetap dari AUTH_SESSION_HOURS.
  if (payload && !isPublicPath(pathname) && now - Number(payload.iat || 0) * 1000 > 5 * 60 * 1000) {
    const renewed = await renewSessionToken(payload, payload.exp);
    response = NextResponse.next();
    response.cookies.set('session', renewed, sessionCookieOptions());
  }

  // 1) Wajib login: halaman & API selain yang publik
  if (!isPublicPath(pathname) && !payload) {
    if (isApi) {
      return NextResponse.json({ ok: false, error: 'Tidak terautentikasi.' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2) Sudah login tapi membuka halaman login -> kembali ke halaman awal sesuai role
  if (pathname === '/login' && payload) {
    return NextResponse.redirect(new URL(homePath(payload.role), request.url));
  }

  // 3) Halaman/API khusus superadmin (cek role dari token; API juga dicek lagi di handler)
  const method = request.method;
  const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  const superadminOnly =
    inPath(pathname, '/user') ||
    inPath(pathname, '/parameter') ||
    inPath(pathname, '/pengaturan') ||
    inPath(pathname, '/api/users') ||
    (isWrite && (
      inPath(pathname, '/api/parameter') ||
      inPath(pathname, '/api/pengaturan') ||
      inPath(pathname, '/api/machines')
    ));
  if (payload && superadminOnly && payload.role !== 'superadmin') {
    if (isApi) {
      return NextResponse.json({ ok: false, error: 'Anda tidak memiliki akses ke fitur ini.' }, { status: 403 });
    }
    return NextResponse.redirect(new URL(homePath(payload.role), request.url));
  }

  // 4) Operator hanya boleh membuat BKB dan melihat BKB miliknya (kepemilikan dicek di API)
  if (payload?.role === 'operator' && !isPublicPath(pathname)) {
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/buat-bkb', request.url));
    }
    if (!operatorAllowed(pathname, method)) {
      if (isApi) {
        return NextResponse.json({ ok: false, error: 'Anda tidak memiliki akses ke fitur ini.' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/buat-bkb', request.url));
    }
  }

  return response || NextResponse.next();
}

export const config = {
  // jangan proses aset statis (gambar, font) agar middleware tidak perlu jalan untuk itu
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js)$).*)',
  ],
};