import { ProtectedRoute } from '@/components/protected-route';
import { DashboardClient } from '@/components/dashboard-client';
import { Suspense } from 'react';

export default async function DashboardPage() {
  // Data fetching is now moved to the client component to be user-specific
  return (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <DashboardClient />
      </Suspense>
    </ProtectedRoute>
  );
}
