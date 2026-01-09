'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { Loading } from '@/components/ui/loading';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { OrderManagement } from '@/components/orders/order-management';

export default function OrdersPage() {
  const { isLoading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <DashboardLayout>
        <Loading message="Loading order management..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <OrderManagement />
    </DashboardLayout>
  );
}
