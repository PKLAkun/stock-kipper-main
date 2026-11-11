// FILE: app/login/page.js
// Halaman login — SERVER component tipis, formnya ada di LoginForm (client).
// LoginForm memakai useSearchParams, jadi dibungkus Suspense (syarat Next.js build).

import { Suspense } from 'react';
import LoginForm from '@/components/LoginForm';

export const metadata = { title: 'Masuk' };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}