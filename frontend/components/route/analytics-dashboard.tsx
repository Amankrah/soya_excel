'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, TrendingUp, DollarSign, Target, Calendar } from 'lucide-react';
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Route Analytics</h2>
          <p className="text-gray-500">Performance metrics and insights</p>
        </div>

        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="4">Last 4 weeks</SelectItem>
            <SelectItem value="8">Last 8 weeks</SelectItem>
            <SelectItem value="12">Last 12 weeks</SelectItem>
            <SelectItem value="24">Last 24 weeks</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      )}

      {!loading && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Routes</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {weeklyData.reduce((acc, w) => acc + w.total_routes, 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {latestWeek?.completion_rate?.toFixed(1)}% completion rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg KM/Tonne</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {averageKmPerTonne.toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {averageKmPerTonne < 10 ? '🎯 Excellent efficiency' : 'Target: < 10 km/tonne'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">On-Time Rate</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {latestWeek?.on_time_delivery_rate?.toFixed(1) || 0}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Last week deliveries
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cost Savings</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${optimizationSavings?.total_estimated_savings?.toLocaleString() || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  From route optimization
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="drivers">Driver Rankings</TabsTrigger>
              <TabsTrigger value="vehicles">Vehicle Efficiency</TabsTrigger>
              <TabsTrigger value="savings">Optimization Savings</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Weekly Performance Trend</CardTitle>
                  <CardDescription>Route completion and efficiency metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {weeklyData.map((week, index) => (
                      <div key={index} className="border-b pb-4 last:border-0">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-medium">Week {index + 1}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(week.week_start).toLocaleDateString()} - {new Date(week.week_end).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">{week.completed_routes}/{week.total_routes} routes</p>
                            <p className="text-xs text-gray-500">{week.completion_rate.toFixed(1)}% complete</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">Distance</p>
                            <p className="font-medium">{week.total_actual_distance_km.toFixed(1)} km</p>
                          </div>
                          <div>
                            <p className="text-gray-500">KM/Tonne</p>
                            <p className="font-medium">{week.km_per_tonne?.toFixed(2) || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">On-Time Rate</p>
                            <p className="font-medium">{week.on_time_delivery_rate?.toFixed(1) || 'N/A'}%</p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-3">
                          <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                            <span>Planning Accuracy</span>
                            <span className="ml-auto">{week.planning_accuracy?.toFixed(1) || 'N/A'}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                (week.planning_accuracy || 0) >= 90 ? 'bg-green-500' : 'bg-yellow-500'
                              }`}
                              style={{ width: `${week.planning_accuracy || 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Driver Rankings Tab */}
            <TabsContent value="drivers" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Driver Performance Rankings</CardTitle>
                      <CardDescription>Top performing drivers by selected metric</CardDescription>
                    </div>
                    <Select value={rankingMetric} onValueChange={(v: 'on_time_rate' | 'efficiency' | 'total_deliveries') => setRankingMetric(v)}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="on_time_rate">On-Time Rate</SelectItem>
                        <SelectItem value="efficiency">Efficiency Score</SelectItem>
                        <SelectItem value="total_deliveries">Total Deliveries</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {driverRankings.map((driver) => (
                      <div key={driver.driver_id} className="flex items-center gap-4 p-3 border rounded-lg">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold">
                          {driver.rank}
                        </div>

                        <div className="flex-1">
                          <p className="font-medium">{driver.driver_name}</p>
                          <div className="flex gap-4 text-xs text-gray-500 mt-1">
                            <span>{driver.total_routes} routes</span>
                            <span>{driver.total_deliveries} deliveries</span>
                            <span>⭐ {driver.average_rating.toFixed(1)}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          {rankingMetric === 'on_time_rate' && (
                            <>
                              <p className="text-lg font-bold">{driver.on_time_rate.toFixed(1)}%</p>
                              <p className="text-xs text-gray-500">On-time rate</p>
                            </>
                          )}
                          {rankingMetric === 'efficiency' && (
                            <>
                              <p className="text-lg font-bold">{driver.efficiency_score.toFixed(1)}</p>
                              <p className="text-xs text-gray-500">Efficiency</p>
                            </>
                          )}
                          {rankingMetric === 'total_deliveries' && (
                            <>
                              <p className="text-lg font-bold">{driver.total_deliveries}</p>
                              <p className="text-xs text-gray-500">Deliveries</p>
                            </>
                          )}
                        </div>
                      </div>
                    ))}

                    {driverRankings.length === 0 && (
                      <p className="text-center text-gray-500 py-8">No driver data available</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Vehicle Efficiency Tab */}
            <TabsContent value="vehicles" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Vehicle Efficiency Metrics</CardTitle>
                  <CardDescription>Fleet performance and utilization</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {vehicleEfficiency.map((vehicle) => (
                      <div key={vehicle.vehicle_id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-medium">{vehicle.vehicle_name}</p>
                            <p className="text-sm text-gray-500">{vehicle.vehicle_type}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">{vehicle.total_routes} routes</p>
                            <p className="text-xs text-gray-500">{vehicle.utilization_rate.toFixed(1)}% utilized</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">Distance</p>
                            <p className="font-medium">{vehicle.total_distance_km.toFixed(0)} km</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Fuel Eff.</p>
                            <p className="font-medium">{vehicle.fuel_efficiency_km_per_liter.toFixed(1)} km/L</p>
                          </div>
                          <div>
                            <p className="text-gray-500">KM/Tonne</p>
                            <p className="font-medium">{vehicle.km_per_tonne.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">CO2</p>
                            <p className="font-medium">{vehicle.total_co2_emissions_kg.toFixed(0)} kg</p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {vehicleEfficiency.length === 0 && (
                      <p className="text-center text-gray-500 py-8">No vehicle data available</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Optimization Savings Tab */}
            <TabsContent value="savings" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Route Optimization Savings</CardTitle>
                  <CardDescription>Cost and time savings from route optimization</CardDescription>
                </CardHeader>
                <CardContent>
                  {optimizationSavings && (
                    <div className="space-y-6">
                      {/* Zero Savings Explanation */}
                      {optimizationSavings.total_distance_saved_km === 0 && optimizationSavings.total_optimizations > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <div className="text-2xl">🎯</div>
                            <div className="flex-1">
                              <p className="font-semibold text-blue-900 mb-2">
                                Excellent Route Planning!
                              </p>
                              <p className="text-sm text-blue-800 leading-relaxed">
                                Your routes are already efficiently ordered. Zero savings indicates that your
                                current route planning is optimal for the geographic patterns and highway network.
                                Optimization provides the most benefit when routes have obvious inefficiencies,
                                backtracking, or cover multiple distinct regions.
                              </p>
                              <div className="mt-3 pt-3 border-t border-blue-200">
                                <p className="text-xs text-blue-700">
                                  <strong>When optimization helps most:</strong> Routes with 10+ stops across wide
                                  geographic areas, crossing multiple highway corridors, or with obvious zig-zag patterns.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Positive Savings Celebration */}
                      {optimizationSavings.total_distance_saved_km > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <div className="text-2xl">✨</div>
                            <div className="flex-1">
                              <p className="font-semibold text-green-900 mb-1">
                                Optimization Working Great!
                              </p>
                              <p className="text-sm text-green-800">
                                Route optimization has identified and corrected inefficiencies, saving
                                {' '}{optimizationSavings.total_distance_saved_km.toFixed(1)} km and
                                ${optimizationSavings.total_estimated_savings.toLocaleString()} in costs.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="border rounded-lg p-4">
                          <p className="text-sm text-gray-500 mb-1">Total Optimizations</p>
                          <p className="text-3xl font-bold">{optimizationSavings.total_optimizations}</p>
                          <p className="text-xs text-gray-500 mt-1">Routes analyzed</p>
                        </div>
                        <div className="border rounded-lg p-4">
                          <p className="text-sm text-gray-500 mb-1">Total Savings</p>
                          <p className={`text-3xl font-bold ${
                            optimizationSavings.total_estimated_savings > 0 ? 'text-green-600' : 'text-gray-400'
                          }`}>
                            ${optimizationSavings.total_estimated_savings.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {optimizationSavings.total_estimated_savings > 0 ? 'Cost reduction' : 'Already optimized'}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                          <div>
                            <p className="font-medium">Distance Saved</p>
                            <p className="text-sm text-gray-600">Reduced kilometers traveled</p>
                          </div>
                          <p className={`text-2xl font-bold ${
                            optimizationSavings.total_distance_saved_km > 0 ? 'text-blue-700' : 'text-gray-400'
                          }`}>
                            {optimizationSavings.total_distance_saved_km.toFixed(1)} km
                          </p>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                          <div>
                            <p className="font-medium">Time Saved</p>
                            <p className="text-sm text-gray-600">Reduced travel time</p>
                          </div>
                          <p className={`text-2xl font-bold ${
                            optimizationSavings.total_time_saved_hours > 0 ? 'text-purple-700' : 'text-gray-400'
                          }`}>
                            {optimizationSavings.total_time_saved_hours.toFixed(1)} hours
                          </p>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                          <div>
                            <p className="font-medium">Fuel Cost Savings</p>
                            <p className="text-sm text-gray-600">Estimated at $1.50/km</p>
                          </div>
                          <p className={`text-2xl font-bold ${
                            optimizationSavings.estimated_fuel_cost_savings > 0 ? 'text-green-700' : 'text-gray-400'
                          }`}>
                            ${optimizationSavings.estimated_fuel_cost_savings.toLocaleString()}
                          </p>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                          <div>
                            <p className="font-medium">Driver Cost Savings</p>
                            <p className="text-sm text-gray-600">Estimated at $50/hour</p>
                          </div>
                          <p className={`text-2xl font-bold ${
                            optimizationSavings.estimated_driver_cost_savings > 0 ? 'text-yellow-700' : 'text-gray-400'
                          }`}>
                            ${optimizationSavings.estimated_driver_cost_savings.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {/* Additional Context */}
                      <div className="border-t pt-4 mt-4">
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-sm font-medium text-gray-900 mb-2">Understanding Optimization Results</p>
                          <ul className="text-xs text-gray-600 space-y-1.5">
                            <li className="flex items-start gap-2">
                              <span className="text-blue-600 mt-0.5">•</span>
                              <span><strong>Zero savings</strong> means routes are already efficiently planned for the geographic area and road network.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-600 mt-0.5">•</span>
                              <span><strong>Positive savings</strong> indicate the optimizer found a better stop sequence than the initial planning.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-600 mt-0.5">•</span>
                              <span><strong>Best practice:</strong> Use optimization during route planning (before finalizing) rather than after routes are created.</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {!optimizationSavings && (
                    <p className="text-center text-gray-500 py-8">No optimization data available</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
