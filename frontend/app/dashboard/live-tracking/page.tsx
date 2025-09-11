'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { Loading } from '@/components/ui/loading';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { DeliveryTrackingDashboard } from '@/components/delivery/delivery-tracking-dashboard';

export default function LiveTrackingPage() {
  const { isLoading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <DashboardLayout>
        <Loading message="Loading delivery tracking..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <DeliveryTrackingDashboard />
    </DashboardLayout>
  );
}
