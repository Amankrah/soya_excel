'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { Loading } from '@/components/ui/loading';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { RouteManagement } from '@/components/routes/route-management';

export default function RoutesPage() {
  const { isLoading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <DashboardLayout>
        <Loading message="Loading route management..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <RouteManagement />
    </DashboardLayout>
  );
} 