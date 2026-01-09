'use client';

import { AnalyticsDashboard } from '@/components/route/analytics-dashboard';
import DashboardLayout from '@/components/layout/dashboard-layout';

export default function AnalyticsPage() {
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Route Analytics</h1>
        <p className="text-gray-600 mt-2">
          Performance metrics, driver rankings, and optimization insights
        </p>
      </div>
      <AnalyticsDashboard />
    </DashboardLayout>
  );
}
