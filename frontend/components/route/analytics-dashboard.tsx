'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Loader2, 
  TrendingUp, 
  DollarSign, 
  Target, 
  Calendar,
  BarChart3,
  Users,
  Truck,
  Zap,
  Award,
  Star,
  Fuel,
  Leaf,
  Clock,
  Route,
  CheckCircle,
  Info,
} from 'lucide-react';
import { routeAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';

interface WeeklyPerformance {
  week_start: string;
  week_end: string;
  total_routes: number;
  completed_routes: number;
  completion_rate: number;
  total_planned_distance_km: number;
  total_actual_distance_km: number;
  total_quantity_tonnes: number;
  km_per_tonne: number | null;
  on_time_delivery_rate: number | null;
  planning_accuracy: number | null;
}

interface DriverRanking {
  rank: number;
  driver_id: number;
  driver_name: string;
  total_routes: number;
  total_deliveries: number;
  on_time_rate: number;
  km_per_tonne: number;
  efficiency_score: number;
  average_rating: number;
  total_distance_km: number;
  total_quantity_tonnes: number;
}

interface VehicleEfficiency {
  vehicle_id: number;
  vehicle_name: string;
  vehicle_type: string | null;
  total_routes: number;
  total_distance_km: number;
  total_fuel_liters: number;
  fuel_efficiency_km_per_liter: number;
  km_per_tonne: number;
  total_co2_emissions_kg: number;
  utilization_rate: number;
  days_used: number;
  total_days: number;
}

interface OptimizationSavings {
  total_optimizations: number;
  total_distance_saved_km: number;
  total_time_saved_hours: number;
  estimated_fuel_cost_savings: number;
  estimated_driver_cost_savings: number;
  total_estimated_savings: number;
}

export function AnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [timeRange, setTimeRange] = useState<string>('4'); // weeks
  const [rankingMetric, setRankingMetric] = useState<'on_time_rate' | 'efficiency' | 'total_deliveries'>('on_time_rate');
  const [loading, setLoading] = useState(false);

  // Data states
  const [weeklyData, setWeeklyData] = useState<WeeklyPerformance[]>([]);
  const [driverRankings, setDriverRankings] = useState<DriverRanking[]>([]);
  const [vehicleEfficiency, setVehicleEfficiency] = useState<VehicleEfficiency[]>([]);
  const [optimizationSavings, setOptimizationSavings] = useState<OptimizationSavings | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [timeRange, rankingMetric]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [weekly, drivers, vehicles, savings] = await Promise.all([
        routeAPI.getWeeklyPerformance({ weeks: parseInt(timeRange) }),
        routeAPI.getDriverRankings({ metric: rankingMetric }),
        routeAPI.getVehicleEfficiency({}),
        routeAPI.getOptimizationSavings({})
      ]);

      setWeeklyData(weekly.weeks || []);
      setDriverRankings(drivers.drivers || []);
      setVehicleEfficiency(vehicles.vehicles || []);
      setOptimizationSavings(savings.summary || null);
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const latestWeek = weeklyData[0];
  const averageKmPerTonne = weeklyData.length > 0
    ? weeklyData.reduce((acc, w) => acc + (w.km_per_tonne || 0), 0) / weeklyData.filter(w => w.km_per_tonne).length
    : 0;

  const getRankBadgeColor = (rank: number) => {
    if (rank === 1) return 'from-yellow-400 to-yellow-500 text-yellow-900 shadow-yellow-500/30';
    if (rank === 2) return 'from-gray-300 to-gray-400 text-gray-700 shadow-gray-400/30';
    if (rank === 3) return 'from-orange-400 to-orange-500 text-orange-900 shadow-orange-500/30';
    return 'from-green-600 to-green-700 text-white shadow-green-600/30';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 soya-fade-in">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-green-600 to-green-700 shadow-lg shadow-green-600/20">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div className="flex items-center gap-2 bg-yellow-100 rounded-full px-3 py-1">
              <TrendingUp className="h-3.5 w-3.5 text-yellow-600" />
              <span className="text-xs font-semibold text-yellow-700">Performance Insights</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Route Analytics</h1>
          <p className="mt-1 text-gray-500">Performance metrics, driver rankings, and optimization insights</p>
        </div>

        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px] bg-white border-gray-200 rounded-xl shadow-sm">
            <Calendar className="h-4 w-4 mr-2 text-gray-500" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="4">Last 4 weeks</SelectItem>
            <SelectItem value="8">Last 8 weeks</SelectItem>
            <SelectItem value="12">Last 12 weeks</SelectItem>
            <SelectItem value="24">Last 24 weeks</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
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
      )}

      {!loading && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 soya-fade-in soya-stagger-1">
            <Card className="soya-card border-0 overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/5 rounded-full -mr-10 -mt-10"></div>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Total Routes</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      {weeklyData.reduce((acc, w) => acc + w.total_routes, 0)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {latestWeek?.completion_rate?.toFixed(1) || 0}% completion rate
                    </p>
                  </div>
                  <div className="p-3 bg-gradient-to-br from-green-600 to-green-700 rounded-xl shadow-lg shadow-green-600/20">
                    <Route className="h-6 w-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="soya-card border-0 overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-yellow-500/5 rounded-full -mr-10 -mt-10"></div>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Avg KM/Tonne</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      {averageKmPerTonne.toFixed(2)}
                    </p>
                    <p className="text-xs mt-1">
                      {averageKmPerTonne < 10 ? (
                        <span className="text-green-600 font-medium">🎯 Excellent efficiency</span>
                      ) : (
                        <span className="text-gray-400">Target: &lt; 10 km/tonne</span>
                      )}
                    </p>
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
                    <p className="text-sm font-medium text-gray-500">On-Time Rate</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      {latestWeek?.on_time_delivery_rate?.toFixed(1) || 0}%
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Last week deliveries</p>
                  </div>
                  <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
                    <Target className="h-6 w-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="soya-card border-0 overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full -mr-10 -mt-10"></div>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Cost Savings</p>
                    <p className="text-3xl font-bold text-emerald-600 mt-1">
                      ${optimizationSavings?.total_estimated_savings?.toLocaleString() || 0}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">From route optimization</p>
                  </div>
                  <div className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-lg shadow-emerald-500/20">
                    <DollarSign className="h-6 w-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Card className="soya-card border-0 shadow-lg soya-fade-in soya-stagger-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <CardHeader className="border-b border-gray-100 pb-0">
                <TabsList className="grid w-full max-w-2xl grid-cols-4 bg-gray-100/80 p-1 rounded-xl h-11">
                  <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg text-sm font-medium">
                    <BarChart3 className="h-4 w-4 mr-1.5" />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="drivers" className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg text-sm font-medium">
                    <Users className="h-4 w-4 mr-1.5" />
                    Drivers
                  </TabsTrigger>
                  <TabsTrigger value="vehicles" className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg text-sm font-medium">
                    <Truck className="h-4 w-4 mr-1.5" />
                    Vehicles
                  </TabsTrigger>
                  <TabsTrigger value="savings" className="data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm rounded-lg text-sm font-medium">
                    <Zap className="h-4 w-4 mr-1.5" />
                    Savings
                  </TabsTrigger>
                </TabsList>
              </CardHeader>

              <CardContent className="pt-6">
                {/* Overview Tab */}
                <TabsContent value="overview" className="mt-0 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Weekly Performance Trend</h3>
                      <p className="text-sm text-gray-500">Route completion and efficiency metrics</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {weeklyData.map((week, index) => (
                      <div 
                        key={index} 
                        className="bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow"
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center text-white font-bold shadow-md">
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">Week {index + 1}</p>
                              <p className="text-xs text-gray-500">
                                {new Date(week.week_start).toLocaleDateString()} - {new Date(week.week_end).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">{week.completed_routes}/{week.total_routes} routes</p>
                            <p className="text-xs text-gray-500">{week.completion_rate.toFixed(1)}% complete</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100">
                            <p className="text-xs font-medium text-green-600 uppercase tracking-wider">Distance</p>
                            <p className="text-xl font-bold text-green-700 mt-1">{week.total_actual_distance_km.toFixed(0)} km</p>
                          </div>
                          <div className="bg-yellow-50 rounded-lg p-3 text-center border border-yellow-100">
                            <p className="text-xs font-medium text-yellow-600 uppercase tracking-wider">KM/Tonne</p>
                            <p className="text-xl font-bold text-yellow-700 mt-1">{week.km_per_tonne?.toFixed(2) || 'N/A'}</p>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
                            <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">On-Time</p>
                            <p className="text-xl font-bold text-blue-700 mt-1">{week.on_time_delivery_rate?.toFixed(0) || 'N/A'}%</p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-4">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-medium text-gray-600">Planning Accuracy</span>
                            <span className={`font-semibold ${(week.planning_accuracy || 0) >= 90 ? 'text-green-600' : 'text-yellow-600'}`}>
                              {week.planning_accuracy?.toFixed(1) || 'N/A'}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                (week.planning_accuracy || 0) >= 90 
                                  ? 'bg-gradient-to-r from-green-500 to-green-600' 
                                  : 'bg-gradient-to-r from-yellow-400 to-yellow-500'
                              }`}
                              style={{ width: `${week.planning_accuracy || 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    {weeklyData.length === 0 && (
                      <div className="text-center py-12">
                        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-4">
                          <BarChart3 className="h-8 w-8 text-gray-400" />
                        </div>
                        <p className="font-semibold text-gray-900">No weekly data available</p>
                        <p className="text-sm text-gray-500 mt-1">Complete some routes to see performance metrics</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Driver Rankings Tab */}
                <TabsContent value="drivers" className="mt-0 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Driver Performance Rankings</h3>
                      <p className="text-sm text-gray-500">Top performing drivers by selected metric</p>
                    </div>
                    <Select value={rankingMetric} onValueChange={(v: 'on_time_rate' | 'efficiency' | 'total_deliveries') => setRankingMetric(v)}>
                      <SelectTrigger className="w-[180px] bg-white border-gray-200 rounded-xl shadow-sm">
                        <Award className="h-4 w-4 mr-2 text-gray-500" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="on_time_rate">On-Time Rate</SelectItem>
                        <SelectItem value="efficiency">Efficiency Score</SelectItem>
                        <SelectItem value="total_deliveries">Total Deliveries</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    {driverRankings.map((driver, index) => (
                      <div 
                        key={driver.driver_id} 
                        className="flex items-center gap-4 p-4 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-100 hover:shadow-md transition-all"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className={`flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${getRankBadgeColor(driver.rank)} font-bold text-lg shadow-lg`}>
                          {driver.rank <= 3 ? (
                            driver.rank === 1 ? '🥇' : driver.rank === 2 ? '🥈' : '🥉'
                          ) : (
                            driver.rank
                          )}
                        </div>

                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{driver.driver_name}</p>
                          <div className="flex gap-4 text-xs text-gray-500 mt-1">
                            <span className="flex items-center gap-1">
                              <Route className="h-3 w-3" />
                              {driver.total_routes} routes
                            </span>
                            <span className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              {driver.total_deliveries} deliveries
                            </span>
                            <span className="flex items-center gap-1 text-yellow-600">
                              <Star className="h-3 w-3 fill-yellow-400" />
                              {driver.average_rating.toFixed(1)}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          {rankingMetric === 'on_time_rate' && (
                            <div className="bg-green-50 rounded-lg px-4 py-2 border border-green-100">
                              <p className="text-2xl font-bold text-green-700">{driver.on_time_rate.toFixed(1)}%</p>
                              <p className="text-xs text-green-600">On-time rate</p>
                            </div>
                          )}
                          {rankingMetric === 'efficiency' && (
                            <div className="bg-yellow-50 rounded-lg px-4 py-2 border border-yellow-100">
                              <p className="text-2xl font-bold text-yellow-700">{driver.efficiency_score.toFixed(1)}</p>
                              <p className="text-xs text-yellow-600">Efficiency</p>
                            </div>
                          )}
                          {rankingMetric === 'total_deliveries' && (
                            <div className="bg-blue-50 rounded-lg px-4 py-2 border border-blue-100">
                              <p className="text-2xl font-bold text-blue-700">{driver.total_deliveries}</p>
                              <p className="text-xs text-blue-600">Deliveries</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {driverRankings.length === 0 && (
                      <div className="text-center py-12">
                        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-4">
                          <Users className="h-8 w-8 text-gray-400" />
                        </div>
                        <p className="font-semibold text-gray-900">No driver data available</p>
                        <p className="text-sm text-gray-500 mt-1">Assign drivers to routes to see rankings</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Vehicle Efficiency Tab */}
                <TabsContent value="vehicles" className="mt-0 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Vehicle Efficiency Metrics</h3>
                      <p className="text-sm text-gray-500">Fleet performance and utilization</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {vehicleEfficiency.map((vehicle, index) => (
                      <div 
                        key={vehicle.vehicle_id} 
                        className="bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow"
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="p-3 rounded-xl bg-gradient-to-br from-gray-700 to-gray-800 shadow-md">
                              <Truck className="h-6 w-6 text-yellow-400" />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{vehicle.vehicle_name}</p>
                              <p className="text-sm text-gray-500">{vehicle.vehicle_type || 'Standard Truck'}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">{vehicle.total_routes} routes</p>
                            <div className="flex items-center gap-1 justify-end mt-1">
                              <div className={`w-2 h-2 rounded-full ${vehicle.utilization_rate >= 70 ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                              <p className="text-xs text-gray-500">{vehicle.utilization_rate.toFixed(1)}% utilized</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-3">
                          <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100">
                            <p className="text-xs font-medium text-green-600 uppercase tracking-wider">Distance</p>
                            <p className="text-xl font-bold text-green-700 mt-1">{vehicle.total_distance_km.toFixed(0)}</p>
                            <p className="text-xs text-green-600">km</p>
                          </div>
                          <div className="bg-yellow-50 rounded-lg p-3 text-center border border-yellow-100">
                            <div className="flex items-center justify-center gap-1 mb-1">
                              <Fuel className="h-3 w-3 text-yellow-600" />
                              <p className="text-xs font-medium text-yellow-600 uppercase tracking-wider">Fuel Eff.</p>
                            </div>
                            <p className="text-xl font-bold text-yellow-700">{vehicle.fuel_efficiency_km_per_liter.toFixed(1)}</p>
                            <p className="text-xs text-yellow-600">km/L</p>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
                            <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">KM/Tonne</p>
                            <p className="text-xl font-bold text-blue-700 mt-1">{vehicle.km_per_tonne.toFixed(2)}</p>
                            <p className="text-xs text-blue-600">efficiency</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                            <div className="flex items-center justify-center gap-1 mb-1">
                              <Leaf className="h-3 w-3 text-gray-500" />
                              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">CO2</p>
                            </div>
                            <p className="text-xl font-bold text-gray-700">{vehicle.total_co2_emissions_kg.toFixed(0)}</p>
                            <p className="text-xs text-gray-500">kg</p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {vehicleEfficiency.length === 0 && (
                      <div className="text-center py-12">
                        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-4">
                          <Truck className="h-8 w-8 text-gray-400" />
                        </div>
                        <p className="font-semibold text-gray-900">No vehicle data available</p>
                        <p className="text-sm text-gray-500 mt-1">Assign vehicles to routes to see efficiency metrics</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Optimization Savings Tab */}
                <TabsContent value="savings" className="mt-0 space-y-6">
                  {optimizationSavings && (
                    <>
                      {/* Zero Savings Explanation */}
                      {optimizationSavings.total_distance_saved_km === 0 && optimizationSavings.total_optimizations > 0 && (
                        <div className="bg-gradient-to-br from-green-50 to-yellow-50 border border-green-200 rounded-xl p-5">
                          <div className="flex items-start gap-4">
                            <div className="p-3 bg-green-100 rounded-xl">
                              <Target className="h-6 w-6 text-green-600" />
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-green-900 mb-2 text-lg">
                                🎯 Excellent Route Planning!
                              </p>
                              <p className="text-sm text-green-800 leading-relaxed">
                                Your routes are already efficiently ordered. Zero savings indicates that your
                                current route planning is optimal for the geographic patterns and highway network.
                                Optimization provides the most benefit when routes have obvious inefficiencies,
                                backtracking, or cover multiple distinct regions.
                              </p>
                              <div className="mt-4 pt-4 border-t border-green-200">
                                <p className="text-xs text-green-700 flex items-start gap-2">
                                  <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                  <span><strong>When optimization helps most:</strong> Routes with 10+ stops across wide
                                  geographic areas, crossing multiple highway corridors, or with obvious zig-zag patterns.</span>
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Positive Savings Celebration */}
                      {optimizationSavings.total_distance_saved_km > 0 && (
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5">
                          <div className="flex items-start gap-4">
                            <div className="p-3 bg-green-100 rounded-xl">
                              <Zap className="h-6 w-6 text-green-600" />
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-green-900 mb-1 text-lg">
                                ✨ Optimization Working Great!
                              </p>
                              <p className="text-sm text-green-800">
                                Route optimization has identified and corrected inefficiencies, saving
                                {' '}<strong>{optimizationSavings.total_distance_saved_km.toFixed(1)} km</strong> and
                                {' '}<strong>${optimizationSavings.total_estimated_savings.toLocaleString()}</strong> in costs.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 p-5">
                          <div className="flex items-center gap-2 mb-2">
                            <BarChart3 className="h-4 w-4 text-gray-500" />
                            <p className="text-sm font-medium text-gray-500">Total Optimizations</p>
                          </div>
                          <p className="text-4xl font-bold text-gray-900">{optimizationSavings.total_optimizations}</p>
                          <p className="text-xs text-gray-500 mt-1">Routes analyzed</p>
                        </div>
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200 p-5">
                          <div className="flex items-center gap-2 mb-2">
                            <DollarSign className="h-4 w-4 text-green-500" />
                            <p className="text-sm font-medium text-green-600">Total Savings</p>
                          </div>
                          <p className={`text-4xl font-bold ${
                            optimizationSavings.total_estimated_savings > 0 ? 'text-green-700' : 'text-gray-400'
                          }`}>
                            ${optimizationSavings.total_estimated_savings.toLocaleString()}
                          </p>
                          <p className="text-xs text-green-600 mt-1">
                            {optimizationSavings.total_estimated_savings > 0 ? 'Cost reduction' : 'Already optimized'}
                          </p>
                        </div>
                      </div>

                      {/* Detailed Metrics */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-white rounded-xl border border-blue-100">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                              <Route className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">Distance Saved</p>
                              <p className="text-sm text-gray-500">Reduced kilometers traveled</p>
                            </div>
                          </div>
                          <p className={`text-3xl font-bold ${
                            optimizationSavings.total_distance_saved_km > 0 ? 'text-blue-700' : 'text-gray-400'
                          }`}>
                            {optimizationSavings.total_distance_saved_km.toFixed(1)} km
                          </p>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-white rounded-xl border border-purple-100">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg">
                              <Clock className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">Time Saved</p>
                              <p className="text-sm text-gray-500">Reduced travel time</p>
                            </div>
                          </div>
                          <p className={`text-3xl font-bold ${
                            optimizationSavings.total_time_saved_hours > 0 ? 'text-purple-700' : 'text-gray-400'
                          }`}>
                            {optimizationSavings.total_time_saved_hours.toFixed(1)} hours
                          </p>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-white rounded-xl border border-green-100">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                              <Fuel className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">Fuel Cost Savings</p>
                              <p className="text-sm text-gray-500">Quebec rate: $0.70/km</p>
                            </div>
                          </div>
                          <p className={`text-3xl font-bold ${
                            optimizationSavings.estimated_fuel_cost_savings > 0 ? 'text-green-700' : 'text-gray-400'
                          }`}>
                            ${optimizationSavings.estimated_fuel_cost_savings.toLocaleString()}
                          </p>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-50 to-white rounded-xl border border-yellow-100">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-yellow-100 rounded-lg">
                              <Users className="h-5 w-5 text-yellow-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">Driver Cost Savings</p>
                              <p className="text-sm text-gray-500">Quebec rate: $35/hour</p>
                            </div>
                          </div>
                          <p className={`text-3xl font-bold ${
                            optimizationSavings.estimated_driver_cost_savings > 0 ? 'text-yellow-700' : 'text-gray-400'
                          }`}>
                            ${optimizationSavings.estimated_driver_cost_savings.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {/* Additional Context */}
                      <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                        <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <Info className="h-4 w-4 text-gray-500" />
                          Understanding Optimization Results
                        </p>
                        <ul className="text-sm text-gray-600 space-y-2">
                          <li className="flex items-start gap-3">
                            <span className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0"></span>
                            <span><strong>Zero savings</strong> means routes are already efficiently planned for the geographic area and road network.</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <span className="w-2 h-2 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0"></span>
                            <span><strong>Positive savings</strong> indicate the optimizer found a better stop sequence than the initial planning.</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <span className="w-2 h-2 rounded-full bg-gray-400 mt-1.5 flex-shrink-0"></span>
                            <span><strong>Best practice:</strong> Use optimization during route planning (before finalizing) rather than after routes are created.</span>
                          </li>
                        </ul>
                      </div>
                    </>
                  )}

                  {!optimizationSavings && (
                    <div className="text-center py-12">
                      <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-4">
                        <Zap className="h-8 w-8 text-gray-400" />
                      </div>
                      <p className="font-semibold text-gray-900">No optimization data available</p>
                      <p className="text-sm text-gray-500 mt-1">Optimize some routes to see savings data</p>
                    </div>
                  )}
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </>
      )}
    </div>
  );
}
