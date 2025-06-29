import { ProtectedRoute } from '@/components/protected-route';
import { AppLayout } from '@/components/app-layout';
import { DashboardHeader } from '@/components/dashboard-header';
import AiAssistantClient from '@/components/ai-assistant-client';

export default function AiAssistantPage() {
  return (
    <ProtectedRoute>
        <AppLayout>
        <DashboardHeader
            title="Assistant de Réparation IA"
            description="Décrivez un problème avec votre véhicule et obtenez des suggestions de réparation."
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pt-0">
            <AiAssistantClient />
        </main>
        </AppLayout>
    </ProtectedRoute>
  );
}
