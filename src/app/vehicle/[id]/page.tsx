import { ProtectedRoute } from '@/components/protected-route';
import { AppLayout } from '@/components/app-layout';
import VehicleDetailClient from '@/components/vehicle-detail-client';

export default function VehicleDetailPage({ params }: { params: { id: string } }) {
  return (
    <ProtectedRoute>
      <AppLayout>
        <VehicleDetailClient vehicleId={params.id} />
      </AppLayout>
    </ProtectedRoute>
  );
}
