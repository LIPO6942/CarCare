import { ProtectedRoute } from '@/components/protected-route';
import { DashboardClient } from '@/components/dashboard-client';

export default async function DashboardPage() {
  // Data fetching is now moved to the client component to be user-specific
  return (
    <ProtectedRoute>
      <DashboardClient />
    </ProtectedRoute>
  );
}
