import { ProtectedRoute } from '@/components/protected-route';
import { AppLayout } from '@/components/app-layout';
import { DashboardHeader } from '@/components/dashboard-header';
import { DocumentsClient } from '@/components/documents-client';

export default function DocumentsPage() {
  return (
    <ProtectedRoute>
        <AppLayout>
        <DashboardHeader
            title="Documents"
            description="Gérez tous les documents importants de vos véhicules."
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pt-0">
            <DocumentsClient />
        </main>
        </AppLayout>
    </ProtectedRoute>
  );
}
