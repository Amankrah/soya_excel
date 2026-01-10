'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  Brain,
  Users,
  BarChart3,
  Navigation,
  Clock,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Zap,
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
  trend?: string;
  index?: number;
}

// Premium Stats Card Component
function StatsCard({ title, value, description, icon: Icon, alertLevel = 'normal', linkTo, trend, index = 0 }: StatsCardProps) {
  const getCardStyle = () => {
    switch (alertLevel) {
      case 'urgent':
        return 'border-red-200 bg-gradient-to-br from-red-50 via-white to-red-50';
      case 'warning':
        return 'border-yellow-200 bg-gradient-to-br from-yellow-50 via-white to-yellow-50';
      default:
        return 'border-gray-100 bg-white';
    }
  };

  const getIconStyle = () => {
    switch (alertLevel) {
      case 'urgent': 
        return 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30';
      case 'warning': 
        return 'bg-gradient-to-br from-yellow-400 to-yellow-500 text-gray-900 shadow-lg shadow-yellow-500/30';
      default: 
        return 'bg-gradient-to-br from-green-600 to-green-700 text-white shadow-lg shadow-green-600/30';
    }
  };

  const content = (
    <Card 
      className={`group relative border ${getCardStyle()} hover:shadow-xl transition-all duration-300 overflow-hidden ${linkTo ? 'cursor-pointer' : ''}`}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-24 h-24 opacity-5">
        <Icon className="w-full h-full" />
      </div>
      
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className={`p-3 rounded-xl ${getIconStyle()}`}>
          <Icon className="h-5 w-5" />
        </div>
        {linkTo && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowRight className="h-5 w-5 text-gray-400" />
          </div>
        )}
      </CardHeader>
      
      <CardContent className="pt-2">
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <div className="flex items-end gap-2">
          <span className={`text-4xl font-bold ${
            alertLevel === 'urgent' ? 'text-red-700' : 
            alertLevel === 'warning' ? 'text-yellow-700' : 
            'text-gray-900'
          }`}>
            {value}
          </span>
          {trend && (
            <span className="flex items-center text-sm font-medium text-green-600 mb-1">
              <TrendingUp className="h-3 w-3 mr-0.5" />
              {trend}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-2">{description}</p>
      </CardContent>
      
      {/* Hover effect bar */}
      <div className={`absolute bottom-0 left-0 right-0 h-1 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 ${
        alertLevel === 'urgent' ? 'bg-red-500' :
        alertLevel === 'warning' ? 'bg-yellow-500' :
        'bg-green-600'
      }`} />
    </Card>
  );

  if (linkTo) {
    return <Link href={linkTo} className="soya-fade-in" style={{ animationDelay: `${index * 100}ms` }}>{content}</Link>;
  }

  return <div className="soya-fade-in" style={{ animationDelay: `${index * 100}ms` }}>{content}</div>;
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
          <div className="text-center soya-fade-in">
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center mx-auto shadow-xl">
                <Zap className="h-8 w-8 text-yellow-400 animate-pulse" />
              </div>
            </div>
            <p className="text-gray-600 text-lg font-medium">Loading dashboard...</p>
            <p className="text-gray-400 text-sm mt-1">Fetching your latest data</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header Section */}
        <div className="relative">
          {/* Background card */}
          <div className="absolute inset-0 soya-gradient rounded-2xl opacity-95"></div>
          
          <div className="relative px-8 py-10 rounded-2xl overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-green-500/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="soya-fade-in">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <span className="text-sm font-medium text-yellow-400">AI-Powered</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-green-500 rounded-full shadow-sm shadow-green-500/50"></div>
                    <div className="w-2 h-2 bg-yellow-400 rounded-full shadow-sm shadow-yellow-400/50"></div>
                    <div className="w-2 h-2 bg-white/80 rounded-full"></div>
                  </div>
                </div>
                <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2">
                  Welcome to SoyaFlow
                </h1>
                <p className="text-lg text-gray-300 max-w-xl">
                  Smart distribution management with AI predictions and route optimization
                </p>
              </div>
              
              <div className="soya-fade-in soya-stagger-2">
                <Button
                  onClick={() => setShowPredictionModal(true)}
                  className="soya-button-secondary group"
                >
                  <Brain className="h-5 w-5 mr-2 transition-transform group-hover:scale-110" />
                  Update AI Predictions
                  <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Overview - 4 Cards */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Clients"
            value={statistics.totalClients}
            description="Active clients in system"
            icon={Users}
            linkTo="/dashboard/clients"
            index={0}
          />
          <StatsCard
            title="Urgent Orders"
            value={statistics.urgentCount}
            description="Ordering within 3 days"
            icon={AlertTriangle}
            alertLevel={statistics.urgentCount > 0 ? 'urgent' : 'normal'}
            linkTo="/dashboard/clients"
            index={1}
          />
          <StatsCard
            title="Overdue"
            value={statistics.overdueCount}
            description="Past predicted date"
            icon={Clock}
            alertLevel={statistics.overdueCount > 0 ? 'urgent' : 'normal'}
            linkTo="/dashboard/clients"
            index={2}
          />
          <StatsCard
            title="High Priority"
            value={statistics.highCount}
            description="Ordering in 4-7 days"
            icon={Brain}
            alertLevel={statistics.highCount > 5 ? 'warning' : 'normal'}
            linkTo="/dashboard/clients"
            index={3}
          />
        </div>

        {/* Main Tabs */}
        <Card className="soya-card border-0 shadow-lg soya-fade-in soya-stagger-3">
          <Tabs defaultValue="analytics" className="w-full">
            <CardHeader className="border-b border-gray-100 pb-0">
              <TabsList className="grid w-full max-w-md grid-cols-2 bg-gray-100/80 p-1 rounded-xl h-12">
                <TabsTrigger
                  value="analytics"
                  className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg flex items-center gap-2 font-medium transition-all"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>Order Analytics</span>
                </TabsTrigger>
                <TabsTrigger
                  value="routes"
                  className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg flex items-center gap-2 font-medium transition-all"
                >
                  <Navigation className="h-4 w-4" />
                  <span>Route Planning</span>
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="p-6">
              {/* Tab 1: Order Analytics */}
              <TabsContent value="analytics" className="mt-0">
                <OrderAnalytics />
              </TabsContent>

              {/* Tab 2: Route Optimization */}
              <TabsContent value="routes" className="mt-0">
                <RouteOptimization
                  activeRoutes={dashboardData?.active_routes || 0}
                  availableDrivers={dashboardData?.available_drivers || 0}
                  totalClients={statistics.totalClients}
                />
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>

      {/* Prediction Update Modal */}
      {showPredictionModal && (
        <PredictionUpdateModal
          onClose={() => setShowPredictionModal(false)}
          onSuccess={() => {
            setShowPredictionModal(false);
            fetchDashboardData();
          }}
        />
      )}
    </DashboardLayout>
  );
}
