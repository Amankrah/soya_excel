'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Truck,
  Package,
  AlertTriangle,
  TrendingUp,
  Globe,
  Zap,
  BarChart3,
  Calendar,
} from 'lucide-react';
import { io } from 'socket.io-client';
import { clientAPI, managerAPI } from '@/lib/api';
import { useDashboardStore } from '@/lib/store';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { useAuth } from '@/lib/hooks/useAuth';

// Types for Soya Excel
interface StatsCardProps {
  title: string;
  value: number | string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: string;
  alertLevel?: 'normal' | 'warning' | 'emergency';
}

interface SiloStorageItem {
  id: string;
  farmer_name: string;
  address: string;
  province: string;
  client_type: string;
  current_quantity: number;
  capacity: number;
  percentage_remaining: number;
  is_low_stock: boolean;
  is_emergency_level: boolean;
  sensor_type: string;
  is_connected: boolean;
  last_reported: string;
}

interface SoybeanMealOrder {
  id: string;
  order_number: string;
  expedition_number: string;
  farmer_name: string;
  province: string;
  quantity: number;
  delivery_method: string;
  order_type: string;
  status: string;
  order_date: string;
  expected_delivery_date?: string;
}

interface SoybeanInventoryItem {
  id: string;
  product_name: string;
  product_type: string;
  current_stock: number;
  minimum_stock: number;
  is_low_stock: boolean;
  silo_number: string;
  quality_grade: string;
}

interface KPIMetric {
  metric_type: string;
  metric_value: number;
  target_value: number;
  trend_direction: string;
  period_end: string;
}

interface SoyaExcelDashboardData {
  total_farmers: number;
  available_drivers: number;
  pending_orders: number;
  low_stock_alerts: number;
  emergency_alerts: number;
  inventory_status: SoybeanInventoryItem[];
  active_routes: number;
  monthly_deliveries: number;
}

// Enhanced Stats Card for Soya Excel
function StatsCard({ title, value, description, icon: Icon, trend, alertLevel = 'normal' }: StatsCardProps) {
  const getCardStyle = () => {
    switch (alertLevel) {
      case 'emergency': 
        return 'border-red-200 bg-gradient-to-br from-red-50 to-red-100 shadow-red-100';
      case 'warning': 
        return 'border-yellow-200 bg-gradient-to-br from-yellow-50 to-yellow-100 shadow-yellow-100';
      default: 
        return 'border-gray-200 bg-gradient-to-br from-white to-gray-50 shadow-gray-100';
    }
  };

  const getIconColor = () => {
    switch (alertLevel) {
      case 'emergency': return 'text-red-600';
      case 'warning': return 'text-yellow-600';
      default: return 'text-green-600';
    }
  };

  return (
    <Card className={`soya-card border-2 ${getCardStyle()} hover:shadow-lg transition-all duration-300`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold text-gray-700">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${alertLevel === 'emergency' ? 'bg-red-100' : alertLevel === 'warning' ? 'bg-yellow-100' : 'bg-green-100'}`}>
          <Icon className={`h-5 w-5 ${getIconColor()}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${alertLevel === 'emergency' ? 'text-red-700' : alertLevel === 'warning' ? 'text-yellow-700' : 'text-gray-800'}`}>
          {value}
        </div>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
        {trend && (
          <div className="flex items-center pt-2">
            <TrendingUp className="h-4 w-4 text-green-600 mr-2" />
            <span className="text-sm text-green-600 font-medium">{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Silo Storage Monitor for BinConnect sensors
interface SiloStorageMonitorProps {
  siloData: SiloStorageItem[];
  showEmergencyOnly?: boolean;
}

function SiloStorageMonitor({ siloData, showEmergencyOnly = false }: SiloStorageMonitorProps) {
  const filteredData = showEmergencyOnly 
    ? siloData.filter(item => item.is_emergency_level)
    : siloData;

  const getStatusColor = (item: SiloStorageItem) => {
    if (item.is_emergency_level) return 'bg-red-500';
    if (item.is_low_stock) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getProvinceFlag = (province: string) => {
    const flags: Record<string, string> = {
      'QC': '🇨🇦 QC',
      'ON': '🇨🇦 ON',
      'NB': '🇨🇦 NB',
      'BC': '🇨🇦 BC',
      'USD': '🇺🇸 US',
      'SPAIN': '🇪🇸 ES',
    };
    return flags[province] || province;
  };

  return (
    <Card className="soya-card border-0 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-t-xl">
        <CardTitle className="flex items-center gap-2 text-white">
          <Zap className="h-6 w-6" />
          {showEmergencyOnly ? 'Emergency Silo Alerts' : 'BinConnect Silo Monitor'}
        </CardTitle>
        <CardDescription className="text-green-100">
          {showEmergencyOnly 
            ? 'Silos requiring immediate attention (< 1 tm or 10%)'
            : 'Real-time soybean meal levels from BinConnect sensors'
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {filteredData?.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-200">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-semibold text-gray-800">{item.farmer_name}</p>
                  <Badge variant="outline" className="text-xs border-green-200 text-green-700 bg-green-50">
                    {getProvinceFlag(item.province)}
                  </Badge>
                  <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-700">
                    {item.client_type.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
                <p className="text-xs text-gray-600 mb-2">{item.address}</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${item.is_connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {item.sensor_type.toUpperCase()} {item.is_connected ? 'Connected' : 'Offline'}
                  </span>
                  <span className="text-xs text-gray-500">
                    Last: {format(new Date(item.last_reported), 'MMM dd, HH:mm')}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-800">{Number(item.current_quantity).toFixed(1)} tm</p>
                  <p className="text-xs text-gray-500">of {Number(item.capacity)} tm</p>
                </div>
                <div className="w-32">
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getStatusColor(item)} transition-all duration-300`}
                      style={{ width: `${Math.max(0, Math.min(100, Number(item.percentage_remaining)))}%` }}
                    />
                  </div>
                  <p className="text-xs text-center mt-1 font-medium">{Number(item.percentage_remaining).toFixed(1)}%</p>
                </div>
                <div className="flex flex-col gap-1">
                  {item.is_emergency_level && (
                    <Badge variant="destructive" className="text-xs bg-red-100 text-red-700 border-red-200">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Emergency
                    </Badge>
                  )}
                  {item.is_low_stock && !item.is_emergency_level && (
                    <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-700 bg-yellow-50">
                      Low Stock
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filteredData?.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="h-8 w-8 text-gray-400" />
              </div>
              <p className="text-lg font-medium">{showEmergencyOnly ? 'No emergency alerts' : 'No silo data available'}</p>
              <p className="text-sm text-gray-400 mt-1">All systems are running normally</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Soybean Meal Inventory Status
interface SoybeanInventoryStatusProps {
  inventoryData: SoybeanInventoryItem[];
}

function SoybeanInventoryStatus({ inventoryData }: SoybeanInventoryStatusProps) {
  return (
    <Card className="soya-card border-0 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-black rounded-t-xl">
        <CardTitle className="flex items-center gap-2 text-black">
          <Package className="h-6 w-6" />
          Soybean Meal Inventory
        </CardTitle>
        <CardDescription className="text-yellow-800">
          Current stock levels by silo
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {inventoryData?.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-200">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800">{item.product_name}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-xs border-green-200 text-green-700 bg-green-50">
                    {item.silo_number}
                  </Badge>
                  <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                    Grade {item.quality_grade}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Min. stock: {Number(item.minimum_stock).toFixed(1)} tm
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-800">{Number(item.current_stock).toFixed(1)} tm</p>
                  <p className="text-xs text-gray-500">Current Stock</p>
                </div>
                {item.is_low_stock && (
                  <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200">
                    Low Stock
                  </Badge>
                )}
              </div>
            </div>
          ))}
          {inventoryData?.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Package className="h-8 w-8 text-gray-400" />
              </div>
              <p className="text-lg font-medium">No inventory data available</p>
              <p className="text-sm text-gray-400 mt-1">Inventory information will appear here</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// KPI Dashboard for Soya Excel's priority metrics
interface KPIDashboardProps {
  kpiData: KPIMetric[];
}

function KPIDashboard({ kpiData }: KPIDashboardProps) {
  const getKPIColor = (actual: number, target: number) => {
    const percentage = (actual / target) * 100;
    if (percentage <= 100) return 'text-green-600';
    if (percentage <= 110) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card className="soya-card border-0 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-t-xl">
        <CardTitle className="flex items-center gap-2 text-white">
          <BarChart3 className="h-6 w-6" />
          Key Performance Indicators
        </CardTitle>
        <CardDescription className="text-gray-300">
          KM/TM efficiency by product type (weekly)
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid gap-4 md:grid-cols-3">
          {Array.isArray(kpiData) && kpiData.length > 0 ? (
            kpiData.map((kpi) => (
              <div key={kpi.metric_type} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-700">
                    {kpi.metric_type.replace('km_per_tonne_', '').replace('_', ' ').toUpperCase()}
                  </p>
                  <TrendingUp className={`h-4 w-4 ${kpi.trend_direction === 'improving' ? 'text-green-500' : 'text-red-500'}`} />
                </div>
                <div className="mt-2">
                  <p className={`text-xl font-bold ${getKPIColor(Number(kpi.metric_value), Number(kpi.target_value))}`}>
                    {Number(kpi.metric_value).toFixed(2)} KM/TM
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Target: {Number(kpi.target_value).toFixed(2)} KM/TM
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-3 text-center py-12 text-gray-500">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="h-10 w-10 text-gray-400" />
              </div>
              <p className="text-lg font-medium">No KPI data available</p>
              <p className="text-sm text-gray-400 mt-1">KPI metrics will appear here once data is available</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<SoyaExcelDashboardData | null>(null);
  const [recentOrders, setRecentOrders] = useState<SoybeanMealOrder[]>([]);
  const [siloStorageData, setSiloStorageData] = useState<SiloStorageItem[]>([]);
  const [kpiData, setKpiData] = useState<KPIMetric[]>([]);
  
  const updateFeedStorage = useDashboardStore((state) => state.updateFeedStorage);

  useEffect(() => {
    fetchDashboardData();
    
    // Setup WebSocket for BinConnect real-time updates
    const socket = io('http://localhost:8001', {
      transports: ['websocket'],
    });

    socket.on('binconnect-update', (data) => {
      updateFeedStorage(data);
      if (data.is_emergency_level) {
        toast.error(`🚨 Emergency: ${data.farmer_name} silo below 1 tm`, {
          duration: 10000,
        });
      } else if (data.is_low_stock) {
        toast.error(`⚠️ Low stock alert: ${data.farmer_name}`, {
          duration: 5000,
        });
      }
    });

    socket.on('connect_error', () => {
      console.log('BinConnect WebSocket connection error - running without real-time updates');
    });

    return () => {
      socket.disconnect();
    };
  }, [updateFeedStorage]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch dashboard summary
      const dashboardSummary = await managerAPI.getDashboard();
      setDashboardData(dashboardSummary);

      // Fetch additional Soya Excel data
      const [orders, siloStorage, kpiMetrics] = await Promise.all([
        clientAPI.getOrders(),
        clientAPI.getFeedStorage(),
        managerAPI.getKPIMetrics('weekly').catch(() => []),
      ]);

      setRecentOrders(orders.slice(0, 10));
      setSiloStorageData(siloStorage);
      setKpiData(Array.isArray(kpiMetrics) ? kpiMetrics : []);
      
    } catch (error) {
      toast.error('Failed to load dashboard data');
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline" | null> = {
      pending: 'secondary',
      confirmed: 'default',
      planned: 'outline',
      in_transit: 'default',
      delivered: 'default',
      cancelled: 'destructive',
    };
    return <Badge variant={variants[status] || 'default'}>{status.replace('_', ' ')}</Badge>;
  };

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg font-medium">Loading Soya Excel dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const emergencyCount = dashboardData?.emergency_alerts || 0;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header Section */}
        <div className="text-center">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
            <div className="w-2 h-2 bg-black rounded-full"></div>
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-gray-800 mb-3">Soya Excel Dashboard</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Soybean meal distribution management across Canada, USA & Spain
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Active Clients"
            value={dashboardData?.total_farmers || 0}
            description="Across 6 regions"
            icon={Globe}
          />
          <StatsCard
            title="Available Drivers"
            value={dashboardData?.available_drivers || 0}
            description="Fleet ready for delivery"
            icon={Truck}
          />
          <StatsCard
            title="Pending Orders"
            value={dashboardData?.pending_orders || 0}
            description="Awaiting processing"
            icon={Package}
          />
          <StatsCard
            title="Emergency Alerts"
            value={emergencyCount}
            description="Silos < 1 tm or 10%"
            icon={AlertTriangle}
            alertLevel={emergencyCount > 0 ? 'emergency' : 'normal'}
          />
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="emergency-alerts" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-gray-100 p-1 rounded-lg">
            <TabsTrigger 
              value="emergency-alerts" 
              className="data-[state=active]:bg-white data-[state=active]:text-red-600 data-[state=active]:shadow-sm rounded-md"
            >
              Emergency {emergencyCount > 0 && `(${emergencyCount})`}
            </TabsTrigger>
            <TabsTrigger 
              value="silo-monitor"
              className="data-[state=active]:bg-white data-[state=active]:text-green-600 data-[state=active]:shadow-sm rounded-md"
            >
              Silo Monitor
            </TabsTrigger>
            <TabsTrigger 
              value="kpi-dashboard"
              className="data-[state=active]:bg-white data-[state=active]:text-gray-700 data-[state=active]:shadow-sm rounded-md"
            >
              KPI Dashboard
            </TabsTrigger>
            <TabsTrigger 
              value="inventory"
              className="data-[state=active]:bg-white data-[state=active]:text-yellow-600 data-[state=active]:shadow-sm rounded-md"
            >
              Inventory
            </TabsTrigger>
            <TabsTrigger 
              value="recent-orders"
              className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md"
            >
              Recent Orders
            </TabsTrigger>
          </TabsList>

          <TabsContent value="emergency-alerts">
            <SiloStorageMonitor siloData={siloStorageData} showEmergencyOnly={true} />
          </TabsContent>

          <TabsContent value="silo-monitor">
            <SiloStorageMonitor siloData={siloStorageData} />
          </TabsContent>

          <TabsContent value="kpi-dashboard">
            <KPIDashboard kpiData={kpiData} />
          </TabsContent>

          <TabsContent value="inventory">
            <SoybeanInventoryStatus inventoryData={dashboardData?.inventory_status || []} />
          </TabsContent>

          <TabsContent value="recent-orders">
            <Card className="soya-card border-0 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-xl">
                <CardTitle className="flex items-center gap-2 text-white">
                  <Calendar className="h-6 w-6" />
                  Recent Orders
                </CardTitle>
                <CardDescription className="text-blue-100">
                  Latest soybean meal orders
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-200">
                      <TableHead className="text-gray-700 font-semibold">Order #</TableHead>
                      <TableHead className="text-gray-700 font-semibold">Expedition #</TableHead>
                      <TableHead className="text-gray-700 font-semibold">Client</TableHead>
                      <TableHead className="text-gray-700 font-semibold">Province</TableHead>
                      <TableHead className="text-gray-700 font-semibold">Quantity</TableHead>
                      <TableHead className="text-gray-700 font-semibold">Method</TableHead>
                      <TableHead className="text-gray-700 font-semibold">Type</TableHead>
                      <TableHead className="text-gray-700 font-semibold">Status</TableHead>
                      <TableHead className="text-gray-700 font-semibold">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOrders.map((order) => (
                      <TableRow key={order.id} className="hover:bg-gray-50 transition-colors duration-200">
                        <TableCell className="font-semibold text-gray-800">{order.order_number}</TableCell>
                        <TableCell className="text-xs text-gray-500">{order.expedition_number}</TableCell>
                        <TableCell className="font-medium text-gray-800">{order.farmer_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs border-green-200 text-green-700 bg-green-50">
                            {order.province}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-gray-800">{Number(order.quantity).toFixed(1)} tm</TableCell>
                        <TableCell className="text-xs text-gray-600">{order.delivery_method?.replace('_', ' ')}</TableCell>
                        <TableCell className="text-xs text-gray-600">{order.order_type?.replace('_', ' ')}</TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell className="text-sm text-gray-600">{format(new Date(order.order_date), 'MMM dd')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
} 