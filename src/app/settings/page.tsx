import { ProtectedRoute } from '@/components/protected-route';
import { AppLayout } from '@/components/app-layout';
import { DashboardHeader } from '@/components/dashboard-header';
import { SettingsClient } from '@/components/settings-client';

export default function SettingsPage() {
  return (
    <ProtectedRoute>
        <AppLayout>
        <DashboardHeader
            title="Paramètres"
            description="Gérez les valeurs par défaut de l'application."
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pt-0">
            <div className="space-y-6">
                <SettingsClient />
            </div>
        </main>
        </AppLayout>
    </ProtectedRoute>
  );
}
