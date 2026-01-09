'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  AlertCircle
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
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg font-medium">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="font-medium">Failed to load analytics</p>
      </div>
    );
  }

  const { overview, client_segmentation, delivery_performance, growth_metrics } = analyticsData;

  return (
    <div className="space-y-6">
      {/* Key Metrics Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.total_orders}</div>
            <p className="text-xs text-muted-foreground">
              {overview.orders_per_day.toFixed(1)} per day avg
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.total_volume_tm.toLocaleString('en-US', { maximumFractionDigits: 1 })} tm</div>
            <p className="text-xs text-muted-foreground">
              {overview.avg_order_size_tm.toFixed(1)} tm avg size
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fulfillment Rate</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.fulfillment_rate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              Order completion rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
            <Users className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.unique_clients}</div>
            <p className="text-xs text-muted-foreground">
              {client_segmentation.repeat_rate.toFixed(1)}% repeat rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Growth & Performance Indicators */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Volume Growth</CardTitle>
            {growth_metrics.volume_growth >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${growth_metrics.volume_growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {growth_metrics.volume_growth > 0 ? '+' : ''}{growth_metrics.volume_growth.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Period over period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On-Time Delivery</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{delivery_performance.on_time_rate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {delivery_performance.on_time_count} of {delivery_performance.total_delivered} delivered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Delivery Time</CardTitle>
            <Calendar className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{delivery_performance.avg_delivery_days.toFixed(1)} days</div>
            <p className="text-xs text-muted-foreground">
              Range: {delivery_performance.min_delivery_days}-{delivery_performance.max_delivery_days} days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics Tabs */}
      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="geography">Geography</TabsTrigger>
          <TabsTrigger value="seasonal">Seasonal</TabsTrigger>
        </TabsList>

        {/* Monthly Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Order Trends</CardTitle>
              <CardDescription>Order volume and count over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={analyticsData.monthly_trends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                  />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip
                    labelFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="total_volume" stroke="#8884d8" name="Volume (tm)" />
                  <Line yAxisId="right" type="monotone" dataKey="order_count" stroke="#82ca9d" name="Order Count" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Order Size Distribution</CardTitle>
                <CardDescription>Orders by size category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Small ({analyticsData.order_size_distribution.small_orders.description})</span>
                      <span className="text-sm text-gray-600">{analyticsData.order_size_distribution.small_orders.percentage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${analyticsData.order_size_distribution.small_orders.percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{analyticsData.order_size_distribution.small_orders.count} orders</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Medium ({analyticsData.order_size_distribution.medium_orders.description})</span>
                      <span className="text-sm text-gray-600">{analyticsData.order_size_distribution.medium_orders.percentage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${analyticsData.order_size_distribution.medium_orders.percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{analyticsData.order_size_distribution.medium_orders.count} orders</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Large ({analyticsData.order_size_distribution.large_orders.description})</span>
                      <span className="text-sm text-gray-600">{analyticsData.order_size_distribution.large_orders.percentage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-purple-500 h-2 rounded-full"
                        style={{ width: `${analyticsData.order_size_distribution.large_orders.percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{analyticsData.order_size_distribution.large_orders.count} orders</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Last 7 and 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-900">Last 7 Days</span>
                      <Package className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="text-2xl font-bold text-blue-700">
                      {analyticsData.recent_activity.last_7_days.order_count} orders
                    </div>
                    <p className="text-sm text-blue-600">
                      {analyticsData.recent_activity.last_7_days.total_volume.toFixed(1)} tm delivered
                    </p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-green-900">Last 30 Days</span>
                      <Package className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="text-2xl font-bold text-green-700">
                      {analyticsData.recent_activity.last_30_days.order_count} orders
                    </div>
                    <p className="text-sm text-green-600">
                      {analyticsData.recent_activity.last_30_days.total_volume.toFixed(1)} tm delivered
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Top Clients Tab */}
        <TabsContent value="clients" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top Clients by Volume</CardTitle>
                <CardDescription>Highest total volume delivered</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {client_segmentation.top_by_volume.slice(0, 5).map((client, index) => (
                    <div key={client.client_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium">{client.client_name}</p>
                          <p className="text-xs text-gray-500">
                            <MapPin className="h-3 w-3 inline mr-1" />
                            {client.city}, {client.country}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-blue-600">{client.total_volume.toFixed(1)} tm</p>
                        <p className="text-xs text-gray-500">{client.order_count} orders</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Clients by Frequency</CardTitle>
                <CardDescription>Most frequent orders</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {client_segmentation.top_by_frequency.slice(0, 5).map((client, index) => (
                    <div key={client.client_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium">{client.client_name}</p>
                          <p className="text-xs text-gray-500">
                            <MapPin className="h-3 w-3 inline mr-1" />
                            {client.city}, {client.country}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">{client.order_count} orders</p>
                        <p className="text-xs text-gray-500">{client.total_volume.toFixed(1)} tm</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Client Segmentation</CardTitle>
              <CardDescription>One-time vs repeat customers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 bg-purple-50 rounded-lg">
                  <p className="text-sm text-purple-600 mb-1">Total Clients</p>
                  <p className="text-3xl font-bold text-purple-700">{client_segmentation.total_clients}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-600 mb-1">Repeat Clients</p>
                  <p className="text-3xl font-bold text-blue-700">{client_segmentation.repeat_clients}</p>
                  <p className="text-xs text-blue-600">{client_segmentation.repeat_rate.toFixed(1)}% of total</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">One-Time Clients</p>
                  <p className="text-3xl font-bold text-gray-700">{client_segmentation.one_time_clients}</p>
                  <p className="text-xs text-gray-600">{((client_segmentation.one_time_clients / client_segmentation.total_clients) * 100).toFixed(1)}% of total</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Product Performance Tab */}
        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Product Performance</CardTitle>
              <CardDescription>Sales by product type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analyticsData.product_performance.map((product, index) => (
                  <div key={index} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-lg">{product.product_name}</h4>
                      <Badge variant="outline">{product.market_share.toFixed(1)}% Market Share</Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Orders</p>
                        <p className="font-bold text-lg">{product.order_count}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Volume</p>
                        <p className="font-bold text-lg">{product.total_volume.toFixed(1)} tm</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Avg Size</p>
                        <p className="font-bold text-lg">{product.avg_order_size.toFixed(1)} tm</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Clients</p>
                        <p className="font-bold text-lg">{product.unique_clients}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Geography Tab */}
        <TabsContent value="geography" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Orders by Country</CardTitle>
                <CardDescription>Distribution across countries</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analyticsData.geographical_distribution.by_country.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">{item.country}</p>
                        <p className="text-xs text-gray-500">{item.unique_clients} clients</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{item.total_volume.toFixed(1)} tm</p>
                        <p className="text-xs text-gray-500">{item.order_count} orders</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Cities</CardTitle>
                <CardDescription>Highest volume cities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analyticsData.geographical_distribution.by_city.slice(0, 10).map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">{item.city}</p>
                        <p className="text-xs text-gray-500">{item.country} • {item.unique_clients} clients</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{item.total_volume.toFixed(1)} tm</p>
                        <p className="text-xs text-gray-500">{item.order_count} orders</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Seasonal Patterns Tab */}
        <TabsContent value="seasonal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Seasonal Order Patterns</CardTitle>
              <CardDescription>Order activity by month</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={analyticsData.seasonal_patterns}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month_name" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="total_volume" fill="#8884d8" name="Volume (tm)" />
                  <Bar yAxisId="right" dataKey="order_count" fill="#82ca9d" name="Order Count" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
