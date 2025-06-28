import { AppLayout } from '@/components/app-layout';
import { DashboardHeader } from '@/components/dashboard-header';
import { getAllRepairs, getAllFuelLogs } from '@/lib/data';
import { ReportsClient } from '@/components/reports-client';

export default async function ReportsPage() {
  const repairs = await getAllRepairs();
  const fuelLogs = await getAllFuelLogs();

  return (
    <AppLayout>
      <DashboardHeader
        title="Rapports et Analyses"
        description="Visualisez les dépenses et les statistiques de vos véhicules."
      />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 pt-0">
        <ReportsClient repairs={repairs} fuelLogs={fuelLogs} />
      </main>
    </AppLayout>
  );
}
