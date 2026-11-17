import { ProtectedRoute } from '@/components/protected-route';
import { AppLayout } from '@/components/app-layout';
import { DashboardHeader } from '@/components/dashboard-header';
import { VisiteTechniqueChecklistClient } from '@/components/visite-technique-checklist-client';
import { Suspense } from 'react';

export default function VisiteTechniqueChecklistPage() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <DashboardHeader
          title="Checklist Visite Technique"
          description="Vérifications essentielles à réaliser avant votre passage au contrôle technique."
        />
        <main className="flex-1 p-2.5 sm:p-6 lg:p-8 pt-0">
          <Suspense fallback={null}>
            <VisiteTechniqueChecklistClient />
          </Suspense>
        </main>
      </AppLayout>
    </ProtectedRoute>
  );
}
