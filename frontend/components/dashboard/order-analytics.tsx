'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Package,
  MapPin,
  Calendar,
  Clock,
  AlertCircle,
  BarChart3,
  Globe,
  Zap,
  Activity,
} from 'lucide-react';
import { clientAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface AnalyticsData {
  period: {
    start_date: string;
    end_date: string;
    days: number;
  };
  overview: {
    total_orders: number;
    total_volume_tm: number;
    total_ordered_tm: number;
    avg_order_size_tm: number;
    fulfillment_rate: number;
    unique_clients: number;
    orders_per_day: number;
  };
  monthly_trends: Array<{
    month: string;
    order_count: number;
    total_volume: number;
    avg_order_size: number;
    unique_clients: number;
  }>;
  client_segmentation: {
    total_clients: number;
    one_time_clients: number;
    repeat_clients: number;
    repeat_rate: number;
    top_by_volume: Array<{
      client_id: string;
      client_name: string;
      city: string;
      country: string;
      order_count: number;
      total_volume: number;
      avg_order_size: number;
      last_order_date: string | null;
    }>;
    top_by_frequency: Array<{
      client_id: string;
      client_name: string;
      city: string;
      country: string;
      order_count: number;
      total_volume: number;
      avg_order_size: number;
    }>;
  };
  product_performance: Array<{
    product_name: string;
    order_count: number;
    total_volume: number;
    avg_order_size: number;
    unique_clients: number;
    market_share: number;
  }>;
  delivery_performance: {
    avg_delivery_days: number;
    min_delivery_days: number;
    max_delivery_days: number;
    total_delivered: number;
    on_time_rate: number;
    on_time_count: number;
    late_count: number;
    unknown_count: number;
  };
  geographical_distribution: {
    by_country: Array<{
      country: string;
      order_count: number;
      total_volume: number;
      unique_clients: number;
    }>;
    by_city: Array<{
      city: string;
      country: string;
      order_count: number;
      total_volume: number;
      unique_clients: number;
    }>;
  };
  seasonal_patterns: Array<{
    month: number;
    month_name: string;
    order_count: number;
    total_volume: number;
    avg_order_size: number;
  }>;
  order_size_distribution: {
    small_orders: { count: number; percentage: number; description: string };
    medium_orders: { count: number; percentage: number; description: string };
    large_orders: { count: number; percentage: number; description: string };
  };
  growth_metrics: {
    volume_growth: number;
    first_half_volume: number;
    second_half_volume: number;
    first_half_orders: number;
    second_half_orders: number;
  };
  recent_activity: {
    last_7_days: { order_count: number; total_volume: number };
    last_30_days: { order_count: number; total_volume: number };
  };
}

// Custom chart colors matching SoyaFlow brand
const chartColors = {
  primary: '#2D5016',
  secondary: '#FFD700',
  accent: '#4A7C59',
  muted: '#6b9b74',
};

export function OrderAnalytics() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const data = await clientAPI.getAdvancedAnalytics();
      setAnalyticsData(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center soya-fade-in">
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center mx-auto shadow-xl">
              <BarChart3 className="h-8 w-8 text-yellow-400 animate-pulse" />
            </div>
          </div>
          <p className="text-gray-600 text-lg font-medium">Loading analytics...</p>
          <p className="text-gray-400 text-sm mt-1">Crunching the numbers</p>
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="text-center py-12 soya-fade-in">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-4">
          <AlertCircle className="h-8 w-8 text-gray-400" />
        </div>
        <p className="font-semibold text-gray-900">Failed to load analytics</p>
        <p className="text-sm text-gray-500 mt-1">Please try again later</p>
      </div>
    );
  }

  const { overview, client_segmentation, delivery_performance, growth_metrics } = analyticsData;

  return (
    <div className="space-y-6">
      {/* Key Metrics Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 soya-fade-in">
        <Card className="soya-card border-0 overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/5 rounded-full -mr-10 -mt-10"></div>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Orders</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{overview.total_orders.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">{overview.orders_per_day.toFixed(1)} per day avg</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-green-600 to-green-700 rounded-xl shadow-lg shadow-green-600/20">
                <Package className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="soya-card border-0 overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-yellow-500/5 rounded-full -mr-10 -mt-10"></div>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Volume</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {overview.total_volume_tm.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  <span className="text-lg font-medium text-gray-500 ml-1">tm</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">{overview.avg_order_size_tm.toFixed(1)} tm avg size</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl shadow-lg shadow-yellow-500/20">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="soya-card border-0 overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/5 rounded-full -mr-10 -mt-10"></div>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Fulfillment Rate</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{overview.fulfillment_rate.toFixed(1)}%</p>
                <p className="text-xs text-gray-400 mt-1">Order completion rate</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
                <Clock className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="soya-card border-0 overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 rounded-full -mr-10 -mt-10"></div>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Active Clients</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{overview.unique_clients.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">{client_segmentation.repeat_rate.toFixed(1)}% repeat rate</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg shadow-purple-500/20">
                <Users className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Growth & Performance Indicators */}
      <div className="grid gap-4 sm:grid-cols-3 soya-fade-in soya-stagger-1">
        <Card className="soya-card border-0 overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500">Volume Growth</p>
              {growth_metrics.volume_growth >= 0 ? (
                <div className="p-1.5 bg-green-100 rounded-lg">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
              ) : (
                <div className="p-1.5 bg-red-100 rounded-lg">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                </div>
              )}
            </div>
            <p className={`text-3xl font-bold ${growth_metrics.volume_growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {growth_metrics.volume_growth > 0 ? '+' : ''}{growth_metrics.volume_growth.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-400 mt-1">Period over period</p>
          </CardContent>
        </Card>

        <Card className="soya-card border-0 overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500">On-Time Delivery</p>
              <div className="p-1.5 bg-blue-100 rounded-lg">
                <Clock className="h-4 w-4 text-blue-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{delivery_performance.on_time_rate.toFixed(1)}%</p>
            <p className="text-xs text-gray-400 mt-1">
              {delivery_performance.on_time_count} of {delivery_performance.total_delivered} delivered
            </p>
          </CardContent>
        </Card>

        <Card className="soya-card border-0 overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500">Avg Delivery Time</p>
              <div className="p-1.5 bg-orange-100 rounded-lg">
                <Calendar className="h-4 w-4 text-orange-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{delivery_performance.avg_delivery_days.toFixed(1)} days</p>
            <p className="text-xs text-gray-400 mt-1">
              Range: {delivery_performance.min_delivery_days}-{delivery_performance.max_delivery_days} days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics Tabs */}
      <Card className="soya-card border-0 shadow-lg soya-fade-in soya-stagger-2">
        <Tabs defaultValue="trends" className="w-full">
          <CardHeader className="border-b border-gray-100 pb-0">
            <TabsList className="grid w-full max-w-2xl grid-cols-5 bg-gray-100/80 p-1 rounded-xl h-11">
              <TabsTrigger value="trends" className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg text-sm font-medium">
                <Activity className="h-4 w-4 mr-1.5" />
                Trends
              </TabsTrigger>
              <TabsTrigger value="clients" className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg text-sm font-medium">
                <Users className="h-4 w-4 mr-1.5" />
                Clients
              </TabsTrigger>
              <TabsTrigger value="products" className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg text-sm font-medium">
                <Package className="h-4 w-4 mr-1.5" />
                Products
              </TabsTrigger>
              <TabsTrigger value="geography" className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg text-sm font-medium">
                <Globe className="h-4 w-4 mr-1.5" />
                Geography
              </TabsTrigger>
              <TabsTrigger value="seasonal" className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg text-sm font-medium">
                <Calendar className="h-4 w-4 mr-1.5" />
                Seasonal
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent className="pt-6">
            {/* Monthly Trends Tab */}
            <TabsContent value="trends" className="space-y-6 mt-0">
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Monthly Order Trends</h3>
                <p className="text-sm text-gray-500 mb-4">Order volume and count over time</p>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={analyticsData.monthly_trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="month"
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                      stroke="#9ca3af"
                      fontSize={12}
                    />
                    <YAxis yAxisId="left" stroke="#9ca3af" fontSize={12} />
                    <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" fontSize={12} />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }}
                    />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="total_volume" stroke={chartColors.primary} strokeWidth={2} name="Volume (tm)" dot={{ fill: chartColors.primary, strokeWidth: 2 }} />
                    <Line yAxisId="right" type="monotone" dataKey="order_count" stroke={chartColors.secondary} strokeWidth={2} name="Order Count" dot={{ fill: chartColors.secondary, strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Order Size Distribution</h3>
                  <p className="text-sm text-gray-500 mb-4">Orders by size category</p>
                  <div className="space-y-5">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Small ({analyticsData.order_size_distribution.small_orders.description})</span>
                        <span className="text-sm font-semibold text-green-600">{analyticsData.order_size_distribution.small_orders.percentage.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-green-500 to-green-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${analyticsData.order_size_distribution.small_orders.percentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{analyticsData.order_size_distribution.small_orders.count.toLocaleString()} orders</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Medium ({analyticsData.order_size_distribution.medium_orders.description})</span>
                        <span className="text-sm font-semibold text-yellow-600">{analyticsData.order_size_distribution.medium_orders.percentage.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-yellow-400 to-yellow-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${analyticsData.order_size_distribution.medium_orders.percentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{analyticsData.order_size_distribution.medium_orders.count.toLocaleString()} orders</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Large ({analyticsData.order_size_distribution.large_orders.description})</span>
                        <span className="text-sm font-semibold text-gray-700">{analyticsData.order_size_distribution.large_orders.percentage.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-gray-600 to-gray-700 h-full rounded-full transition-all duration-500"
                          style={{ width: `${analyticsData.order_size_distribution.large_orders.percentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{analyticsData.order_size_distribution.large_orders.count.toLocaleString()} orders</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Recent Activity</h3>
                  <p className="text-sm text-gray-500 mb-4">Last 7 and 30 days</p>
                  <div className="space-y-4">
                    <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-green-900">Last 7 Days</span>
                        <div className="p-1.5 bg-green-200 rounded-lg">
                          <Zap className="h-4 w-4 text-green-700" />
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-green-700">
                        {analyticsData.recent_activity.last_7_days.order_count} orders
                      </p>
                      <p className="text-sm text-green-600 mt-1">
                        {analyticsData.recent_activity.last_7_days.total_volume.toFixed(1)} tm delivered
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 border border-yellow-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-yellow-900">Last 30 Days</span>
                        <div className="p-1.5 bg-yellow-200 rounded-lg">
                          <Package className="h-4 w-4 text-yellow-700" />
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-yellow-700">
                        {analyticsData.recent_activity.last_30_days.order_count} orders
                      </p>
                      <p className="text-sm text-yellow-600 mt-1">
                        {analyticsData.recent_activity.last_30_days.total_volume.toFixed(1)} tm delivered
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Top Clients Tab */}
            <TabsContent value="clients" className="space-y-6 mt-0">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Top Clients by Volume</h3>
                  <p className="text-sm text-gray-500 mb-4">Highest total volume delivered</p>
                  <div className="space-y-3">
                    {client_segmentation.top_by_volume.slice(0, 5).map((client, index) => (
                      <div key={client.client_id} className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-white rounded-xl border border-green-100 hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-600 to-green-700 text-white flex items-center justify-center font-bold text-sm shadow-md">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{client.client_name}</p>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {client.city}, {client.country}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-700">{client.total_volume.toFixed(1)} tm</p>
                          <p className="text-xs text-gray-500">{client.order_count} orders</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Top Clients by Frequency</h3>
                  <p className="text-sm text-gray-500 mb-4">Most frequent orders</p>
                  <div className="space-y-3">
                    {client_segmentation.top_by_frequency.slice(0, 5).map((client, index) => (
                      <div key={client.client_id} className="flex items-center justify-between p-3 bg-gradient-to-r from-yellow-50 to-white rounded-xl border border-yellow-100 hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-500 to-yellow-600 text-white flex items-center justify-center font-bold text-sm shadow-md">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{client.client_name}</p>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {client.city}, {client.country}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-yellow-700">{client.order_count} orders</p>
                          <p className="text-xs text-gray-500">{client.total_volume.toFixed(1)} tm</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Client Segmentation</h3>
                <p className="text-sm text-gray-500 mb-4">One-time vs repeat customers</p>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-600">Total Clients</p>
                      <Users className="h-4 w-4 text-gray-500" />
                    </div>
                    <p className="text-4xl font-bold text-gray-900">{client_segmentation.total_clients.toLocaleString()}</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-5 border border-green-200">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-green-700">Repeat Clients</p>
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    </div>
                    <p className="text-4xl font-bold text-green-700">{client_segmentation.repeat_clients.toLocaleString()}</p>
                    <p className="text-xs text-green-600 mt-1">{client_segmentation.repeat_rate.toFixed(1)}% of total</p>
                  </div>
                  <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-5 border border-yellow-200">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-yellow-700">One-Time Clients</p>
                      <Users className="h-4 w-4 text-yellow-600" />
                    </div>
                    <p className="text-4xl font-bold text-yellow-700">{client_segmentation.one_time_clients.toLocaleString()}</p>
                    <p className="text-xs text-yellow-600 mt-1">{((client_segmentation.one_time_clients / client_segmentation.total_clients) * 100).toFixed(1)}% of total</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Product Performance Tab */}
            <TabsContent value="products" className="mt-0">
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Product Performance</h3>
                <p className="text-sm text-gray-500 mb-4">Sales by product type</p>
                <div className="space-y-4">
                  {analyticsData.product_performance.map((product, index) => (
                    <div key={index} className="bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-lg text-gray-900">{product.product_name}</h4>
                        <Badge className="soya-badge-success">{product.market_share.toFixed(1)}% Product Market Share</Badge>
                      </div>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="bg-green-50 rounded-lg p-3 text-center">
                          <p className="text-xs font-medium text-green-600 uppercase tracking-wider">Orders</p>
                          <p className="text-2xl font-bold text-green-700 mt-1">{product.order_count.toLocaleString()}</p>
                        </div>
                        <div className="bg-yellow-50 rounded-lg p-3 text-center">
                          <p className="text-xs font-medium text-yellow-600 uppercase tracking-wider">Volume</p>
                          <p className="text-2xl font-bold text-yellow-700 mt-1">{product.total_volume.toFixed(1)} tm</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3 text-center">
                          <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">Avg Size</p>
                          <p className="text-2xl font-bold text-blue-700 mt-1">{product.avg_order_size.toFixed(1)} tm</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-3 text-center">
                          <p className="text-xs font-medium text-purple-600 uppercase tracking-wider">Clients</p>
                          <p className="text-2xl font-bold text-purple-700 mt-1">{product.unique_clients.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Geography Tab */}
            <TabsContent value="geography" className="space-y-6 mt-0">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Orders by Country</h3>
                  <p className="text-sm text-gray-500 mb-4">Distribution across countries</p>
                  <div className="space-y-3">
                    {analyticsData.geographical_distribution.by_country.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-100 hover:shadow-md transition-shadow">
                        <div>
                          <p className="font-semibold text-gray-900">{item.country}</p>
                          <p className="text-xs text-gray-500">{item.unique_clients} clients</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-700">{item.total_volume.toFixed(1)} tm</p>
                          <p className="text-xs text-gray-500">{item.order_count.toLocaleString()} orders</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Top Cities</h3>
                  <p className="text-sm text-gray-500 mb-4">Highest volume cities</p>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {analyticsData.geographical_distribution.by_city.slice(0, 10).map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gradient-to-r from-yellow-50 to-white rounded-xl border border-yellow-100 hover:shadow-md transition-shadow">
                        <div>
                          <p className="font-semibold text-gray-900">{item.city}</p>
                          <p className="text-xs text-gray-500">{item.country} • {item.unique_clients} clients</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-yellow-700">{item.total_volume.toFixed(1)} tm</p>
                          <p className="text-xs text-gray-500">{item.order_count.toLocaleString()} orders</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Seasonal Patterns Tab */}
            <TabsContent value="seasonal" className="mt-0">
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Seasonal Order Patterns</h3>
                <p className="text-sm text-gray-500 mb-4">Order activity by month</p>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={analyticsData.seasonal_patterns}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month_name" stroke="#9ca3af" fontSize={12} />
                    <YAxis yAxisId="left" stroke="#9ca3af" fontSize={12} />
                    <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" fontSize={12} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="total_volume" fill={chartColors.primary} name="Volume (tm)" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="order_count" fill={chartColors.secondary} name="Order Count" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
