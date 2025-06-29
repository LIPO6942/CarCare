'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * This page is no longer in use due to anonymous authentication.
 * It redirects any users who land here to the homepage.
 */
export default function SignupPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);

  return null; // Render nothing while redirecting
}
