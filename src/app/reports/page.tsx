import { ProtectedRoute } from '@/components/protected-route';
import { AppLayout } from '@/components/app-layout';
import { DashboardHeader } from '@/components/dashboard-header';
import { ReportsClient } from '@/components/reports-client';

export default async function ReportsPage() {

  return (
    <ProtectedRoute>
        <AppLayout>
        <DashboardHeader
            title="Rapports et Analyses"
            description="Visualisez les dépenses et les statistiques de vos véhicules."
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pt-0">
            <ReportsClient />
        </main>
        </AppLayout>
    </ProtectedRoute>
  );
}
