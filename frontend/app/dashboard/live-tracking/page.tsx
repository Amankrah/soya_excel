'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { Loading } from '@/components/ui/loading';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { LiveTrackingMap } from '@/components/maps/live-tracking-map';
import { routeAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Navigation2, 
  Truck,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle,
  Users,
  Route as RouteIcon,
  RefreshCw
} from 'lucide-react';

interface ActiveRoute {
  id: string;
  name: string;
  status: string;
  driver_name?: string;
  stops: Array<{
    id: string;
    sequence_number: number;
    farmer: { name: string; address: string };
    is_completed: boolean;
    estimated_arrival_time?: string;
  }>;
  total_distance?: number;
  estimated_duration?: number;
}

interface RouteProgress {
  route: ActiveRoute;
  progress: number;
  completedStops: number;
  totalStops: number;
  estimatedCompletion?: string;
  isOnTime: boolean;
}

export default function LiveTrackingPage() {
  const { isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeRoutes, setActiveRoutes] = useState<ActiveRoute[]>([]);
  const [routeProgress, setRouteProgress] = useState<RouteProgress[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Load active routes data
  const loadActiveRoutes = async (showLoadingState = true) => {
    try {
      if (showLoadingState) setLoading(true);

      const routes = await routeAPI.getActiveRoutes();
      setActiveRoutes(routes);

      // Calculate progress for each route
      const progress: RouteProgress[] = routes.map((route: ActiveRoute) => {
        const completedStops = route.stops.filter(stop => stop.is_completed).length;
        const totalStops = route.stops.length;
        const progressPercentage = totalStops > 0 ? (completedStops / totalStops) * 100 : 0;

        // Estimate completion time (simplified calculation)
        let estimatedCompletion;
        if (route.estimated_duration && completedStops < totalStops) {
          const remainingStops = totalStops - completedStops;
          const avgTimePerStop = route.estimated_duration / totalStops;
          const remainingTime = remainingStops * avgTimePerStop;
          estimatedCompletion = new Date(Date.now() + remainingTime * 60000).toLocaleTimeString();
        }

        // Check if route is on time (simplified - would use real ETA data)
        const isOnTime = progressPercentage >= 80 || completedStops === totalStops;

        return {
          route,
          progress: progressPercentage,
          completedStops,
          totalStops,
          estimatedCompletion,
          isOnTime
        };
      });

      setRouteProgress(progress);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading active routes:', error);
      toast.error('Failed to load active routes');
    } finally {
      if (showLoadingState) setLoading(false);
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    loadActiveRoutes();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadActiveRoutes(false);
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Calculate summary stats
  const totalActiveRoutes = activeRoutes.length;
  const totalActiveDrivers = activeRoutes.filter(route => route.driver_name).length;
  const totalStops = routeProgress.reduce((sum, rp) => sum + rp.totalStops, 0);
  const completedStops = routeProgress.reduce((sum, rp) => sum + rp.completedStops, 0);
  const onTimeRoutes = routeProgress.filter(rp => rp.isOnTime).length;
  const delayedRoutes = routeProgress.filter(rp => !rp.isOnTime && rp.completedStops < rp.totalStops).length;

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <Loading message="Loading live tracking..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Navigation2 className="h-8 w-8 text-green-600" />
              Live Tracking
            </h2>
            <p className="text-muted-foreground">
              Monitor all active deliveries in real-time
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
              Live Updates
            </Badge>
            <Button
              variant="outline"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? 'Pause Auto-refresh' : 'Resume Auto-refresh'}
            </Button>
            <Button
              variant="outline"
              onClick={() => loadActiveRoutes(true)}
              disabled={loading}
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Routes</CardTitle>
              <RouteIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalActiveRoutes}</div>
              <p className="text-xs text-muted-foreground">
                Currently in progress
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Drivers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalActiveDrivers}</div>
              <p className="text-xs text-muted-foreground">
                Out for delivery
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivery Progress</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {completedStops}/{totalStops}
              </div>
              <p className="text-xs text-muted-foreground">
                Stops completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">On-Time Performance</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalActiveRoutes > 0 ? Math.round((onTimeRoutes / totalActiveRoutes) * 100) : 0}%
              </div>
              <p className="text-xs text-muted-foreground">
                Routes on schedule
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Live Map */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Live Delivery Map
                </CardTitle>
                <CardDescription>
                  Real-time positions of all active deliveries
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <LiveTrackingMap
                  height="600px"
                  refreshInterval={30}
                  showAllRoutes={true}
                />
              </CardContent>
            </Card>
          </div>

          {/* Route Status Panel */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Route Status
                </CardTitle>
                <CardDescription>
                  Progress of all active deliveries
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {routeProgress.length > 0 ? (
                  routeProgress.map((rp) => (
                    <div key={rp.route.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{rp.route.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {rp.route.driver_name || 'No driver assigned'}
                          </p>
                        </div>
                        <Badge 
                          variant={rp.isOnTime ? "default" : "destructive"}
                          className="text-xs"
                        >
                          {rp.isOnTime ? 'On Time' : 'Delayed'}
                        </Badge>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>Progress</span>
                          <span>{rp.completedStops}/{rp.totalStops} stops</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all duration-300 ${
                              rp.isOnTime ? 'bg-green-600' : 'bg-red-500'
                            }`}
                            style={{ width: `${rp.progress}%` }}
                          ></div>
                        </div>
                      </div>

                      {rp.estimatedCompletion && (
                        <p className="text-xs text-muted-foreground">
                          Est. completion: {rp.estimatedCompletion}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Truck className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No active routes found
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Routes will appear here once activated
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Alerts Card */}
            {delayedRoutes > 0 && (
              <Card className="border-orange-200 bg-orange-50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2 text-orange-800">
                    <AlertTriangle className="h-4 w-4" />
                    Delivery Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-orange-700">
                      Delayed routes
                    </span>
                    <Badge variant="outline" className="text-orange-700 border-orange-300">
                      {delayedRoutes}
                    </Badge>
                  </div>
                  <p className="text-xs text-orange-600">
                    Some routes are running behind schedule. Consider contacting drivers or rescheduling stops.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Last Update Info */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    Last updated: {lastUpdate?.toLocaleTimeString() || 'Never'}
                  </span>
                </div>
                <p className="text-center text-xs text-muted-foreground mt-1">
                  Auto-refresh: {autoRefresh ? 'On' : 'Off'}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
