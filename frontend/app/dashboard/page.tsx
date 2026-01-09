'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  Brain,
  Users,
  BarChart3,
  Navigation,
  Clock,
} from 'lucide-react';
import { clientAPI, managerAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { useAuth } from '@/lib/hooks/useAuth';
import Link from 'next/link';

// Import modular components
import { OrderAnalytics } from '@/components/dashboard/order-analytics';
import { RouteOptimization } from '@/components/dashboard/route-optimization';
import { PredictionUpdateModal } from '@/components/ui/prediction-update-modal';
import { Button } from '@/components/ui/button';

interface DashboardData {
  total_clients: number;
  active_routes: number;
  available_drivers: number;
  pending_orders: number;
  monthly_deliveries: number;
}

interface ClientStatistics {
  urgentCount: number;
  overdueCount: number;
  highCount: number;
  totalClients: number;
}

interface StatsCardProps {
  title: string;
  value: number | string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  alertLevel?: 'normal' | 'warning' | 'urgent';
  linkTo?: string;
}

// Stats Card Component
function StatsCard({ title, value, description, icon: Icon, alertLevel = 'normal', linkTo }: StatsCardProps) {
  const getCardStyle = () => {
    switch (alertLevel) {
      case 'urgent':
        return 'border-red-200 bg-gradient-to-br from-red-50 to-red-100';
      case 'warning':
        return 'border-yellow-200 bg-gradient-to-br from-yellow-50 to-yellow-100';
      default:
        return 'border-gray-200 bg-gradient-to-br from-white to-gray-50';
    }
  };

  const getIconColor = () => {
    switch (alertLevel) {
      case 'urgent': return 'text-red-600 bg-red-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-green-600 bg-green-100';
    }
  };

  const content = (
    <Card className={`border-2 ${getCardStyle()} hover:shadow-lg transition-all duration-300 ${linkTo ? 'cursor-pointer hover:scale-105' : ''}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold text-gray-700">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${getIconColor()}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${alertLevel === 'urgent' ? 'text-red-700' : alertLevel === 'warning' ? 'text-yellow-700' : 'text-gray-800'}`}>
          {value}
        </div>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
      </CardContent>
    </Card>
  );

  if (linkTo) {
    return <Link href={linkTo}>{content}</Link>;
  }

  return content;
}

export default function DashboardPage() {
  const { isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [statistics, setStatistics] = useState<ClientStatistics>({
    urgentCount: 0,
    overdueCount: 0,
    highCount: 0,
    totalClients: 0,
  });
  const [showPredictionModal, setShowPredictionModal] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch dashboard summary and client statistics in parallel
      const [dashboardSummary, clientStats] = await Promise.all([
        managerAPI.getDashboard(),
        clientAPI.getClientStatistics(),
      ]);

      setDashboardData(dashboardSummary);
      setStatistics({
        urgentCount: clientStats.predictions?.urgent || 0,
        overdueCount: clientStats.predictions?.overdue || 0,
        highCount: clientStats.predictions?.high || 0,
        totalClients: clientStats.total_clients || 0,
      });

    } catch (error) {
      toast.error('Failed to load dashboard data');
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg font-medium">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center relative">
          <div className="absolute right-0 top-0">
            <Button
              onClick={() => setShowPredictionModal(true)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Brain className="h-4 w-4 mr-2" />
              Update Predictions
            </Button>
          </div>
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
            <div className="w-2 h-2 bg-black rounded-full"></div>
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-gray-800 mb-3">
            Distribution Dashboard
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            AI-powered distribution management with reorder predictions for small/medium order clients
          </p>
        </div>

        {/* Stats Overview - 4 Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Clients"
            value={statistics.totalClients}
            description="Active clients"
            icon={Users}
            linkTo="/dashboard/clients"
          />
          <StatsCard
            title="Urgent Orders"
            value={statistics.urgentCount}
            description="Ordering within 3 days"
            icon={AlertTriangle}
            alertLevel={statistics.urgentCount > 0 ? 'urgent' : 'normal'}
            linkTo="/dashboard/clients"
          />
          <StatsCard
            title="Overdue"
            value={statistics.overdueCount}
            description="Past predicted date"
            icon={Clock}
            alertLevel={statistics.overdueCount > 0 ? 'urgent' : 'normal'}
            linkTo="/dashboard/clients"
          />
          <StatsCard
            title="High Priority"
            value={statistics.highCount}
            description="Ordering in 4-7 days"
            icon={Brain}
            linkTo="/dashboard/clients"
          />
        </div>

        {/* Main Tabs - 2 Core Features */}
        <Tabs defaultValue="analytics" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 bg-gray-100 p-1 rounded-lg h-12">
            <TabsTrigger
              value="analytics"
              className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              <span>Order Analytics</span>
            </TabsTrigger>
            <TabsTrigger
              value="routes"
              className="data-[state=active]:bg-white data-[state=active]:text-green-600 data-[state=active]:shadow-sm rounded-md flex items-center gap-2"
            >
              <Navigation className="h-4 w-4" />
              <span>Route Optimization</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Order Analytics */}
          <TabsContent value="analytics">
            <OrderAnalytics />
          </TabsContent>

          {/* Tab 2: Route Optimization */}
          <TabsContent value="routes">
            <RouteOptimization
              activeRoutes={dashboardData?.active_routes || 0}
              availableDrivers={dashboardData?.available_drivers || 0}
              totalClients={statistics.totalClients}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Prediction Update Modal */}
      {showPredictionModal && (
        <PredictionUpdateModal
          onClose={() => setShowPredictionModal(false)}
          onSuccess={() => {
            setShowPredictionModal(false);
            fetchDashboardData(); // Refresh data after update
          }}
        />
      )}
    </DashboardLayout>
  );
}
