'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redirect no cliente para que o HTML de `/` inclua o `<head>` do layout
 * (necessário p/ verificação de domínio do Facebook na homepage).
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return null;
}
