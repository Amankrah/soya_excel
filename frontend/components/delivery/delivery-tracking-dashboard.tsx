'use client';

import { useState, useEffect, useCallback } from 'react';
import { UnifiedRouteMap } from '@/components/maps/unified-route-map';
import { routeAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Truck, 
  Clock, 
  MapPin, 
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Navigation,
  Timer,
  TrendingUp
} from 'lucide-react';

interface Route {
  id: string;
  name: string;
  date: string;
  status: 'draft' | 'planned' | 'active' | 'completed' | 'cancelled';
  route_type: string;
  total_distance?: number;
  estimated_duration?: number;
  stops: Array<{
    id: string;
    farmer: {
      name: string;
      address: string;
    };
    sequence_number: number;
    is_completed: boolean;
    estimated_arrival_time?: string;
  }>;
  driver_name?: string;
}

interface DeliveryStats {
  totalRoutes: number;
  activeRoutes: number;
  completedStops: number;
  totalStops: number;
  onTimeDeliveries: number;
  delayedDeliveries: number;
}

export function DeliveryTrackingDashboard() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stats, setStats] = useState<DeliveryStats>({
    totalRoutes: 0,
    activeRoutes: 0,
    completedStops: 0,
    totalStops: 0,
    onTimeDeliveries: 0,
    delayedDeliveries: 0
  });
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Load routes and calculate stats
  const loadRoutes = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get all routes for the current week
      const allRoutes = await routeAPI.getRoutes() || [];
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const todayRoutes = await routeAPI.getTodayRoutes() || [];
      const activeRoutes = await routeAPI.getActiveRoutes() || [];
      
      // Filter routes to show recent ones (last 7 days)
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 7);
      
      const filteredRoutes = allRoutes.filter((route: Route) => 
        route && route.date && new Date(route.date) >= recentDate
      );
      
      setRoutes(filteredRoutes);
      
      // Calculate stats with null safety
      const totalStops = filteredRoutes.reduce((sum: number, route: Route) => {
        const stops = route.stops || [];
        return sum + stops.length;
      }, 0);
      
      const completedStops = filteredRoutes.reduce((sum: number, route: Route) => {
        const stops = route.stops || [];
        return sum + stops.filter((stop) => stop && stop.is_completed).length;
      }, 0);
      
      setStats({
        totalRoutes: filteredRoutes.length,
        activeRoutes: activeRoutes.length,
        completedStops,
        totalStops,
        onTimeDeliveries: Math.floor(completedStops * 0.85), // Mock calculation
        delayedDeliveries: Math.floor(completedStops * 0.15) // Mock calculation
      });
      
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading routes:', error);
      toast.error('Failed to load delivery routes');
      // Set safe defaults on error
      setRoutes([]);
      setStats({
        totalRoutes: 0,
        activeRoutes: 0,
        completedStops: 0,
        totalStops: 0,
        onTimeDeliveries: 0,
        delayedDeliveries: 0
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Load routes and set up smart auto-refresh
  useEffect(() => {
    loadRoutes();
    
    // Only auto-refresh if no route is selected (to avoid double polling)
    if (!selectedRoute) {
      const interval = setInterval(loadRoutes, 60000);
      return () => clearInterval(interval);
    }
  }, [loadRoutes, selectedRoute]);

  // Filter routes based on search and status
  const filteredRoutes = (routes || []).filter(route => {
    if (!route) return false;
    
    const routeName = route.name || '';
    const driverName = route.driver_name || '';
    const stops = route.stops || [];
    
    const matchesSearch = routeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         driverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         stops.some(stop => 
                           stop && stop.farmer && stop.farmer.name && 
                           stop.farmer.name.toLowerCase().includes(searchTerm.toLowerCase())
                         );
    const matchesStatus = statusFilter === 'all' || route.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 border-green-200';
      case 'planned': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  // Calculate route progress
  const getRouteProgress = (route: Route) => {
    if (!route || !route.stops || route.stops.length === 0) return 0;
    const completedStops = route.stops.filter(stop => stop && stop.is_completed).length;
    return (completedStops / route.stops.length) * 100;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Delivery Tracking</h1>
          <p className="mt-2 text-gray-600">
            Real-time tracking of soybean meal deliveries across Canada
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => loadRoutes()} 
            disabled={loading} 
            variant="outline"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
          {lastUpdate && (
            <span className="text-sm text-gray-500">
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-600">Total Routes</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {stats.totalRoutes}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-gray-600">Active Routes</span>
            </div>
            <div className="text-2xl font-bold text-green-600 mt-1">
              {stats.activeRoutes}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium text-gray-600">Stops Progress</span>
            </div>
            <div className="text-2xl font-bold text-purple-600 mt-1">
              {stats.completedStops}/{stats.totalStops}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-gray-600">On Time</span>
            </div>
            <div className="text-2xl font-bold text-green-600 mt-1">
              {stats.onTimeDeliveries}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium text-gray-600">Delayed</span>
            </div>
            <div className="text-2xl font-bold text-orange-600 mt-1">
              {stats.delayedDeliveries}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-600">Efficiency</span>
            </div>
            <div className="text-2xl font-bold text-blue-600 mt-1">
              {stats.totalStops > 0 ? Math.round((stats.onTimeDeliveries / stats.totalStops) * 100) : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search routes, drivers, or farmers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                title="Filter routes by status"
                aria-label="Status filter"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="planned">Planned</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Routes List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Recent Routes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-gray-500">
                  Loading routes...
                </div>
              ) : filteredRoutes.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No routes found matching your criteria
                </div>
              ) : (
                <div className="divide-y">
                  {filteredRoutes.map((route) => {
                    const progress = getRouteProgress(route);
                    const isSelected = selectedRoute === route.id;
                    
                    return (
                      <div
                        key={route.id}
                        className={`p-4 cursor-pointer hover:bg-gray-50 ${
                          isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                        }`}
                        onClick={() => setSelectedRoute(route.id)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium text-sm">{route.name}</h3>
                          <Badge className={`text-xs ${getStatusColor(route.status)}`}>
                            {route.status}
                          </Badge>
                        </div>
                        
                        <div className="space-y-2">
                          {route.driver_name && (
                            <div className="flex items-center gap-2 text-xs text-gray-600">
                              <Truck className="h-3 w-3" />
                              {route.driver_name}
                            </div>
                          )}
                          
                          <div className="flex items-center gap-2 text-xs text-gray-600">
                            <Clock className="h-3 w-3" />
                            {new Date(route.date).toLocaleDateString()}
                          </div>
                          
                          <div className="flex items-center gap-2 text-xs text-gray-600">
                            <MapPin className="h-3 w-3" />
                            {route.stops.length} stops
                          </div>
                          
                          {route.status === 'active' && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs text-gray-600">
                                <span>Progress</span>
                                <span>{Math.round(progress)}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div 
                                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                  style={{ width: `${progress}%` }}
                                ></div>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="mt-2 flex justify-between items-center">
                          <span className="text-xs text-gray-500">
                            {route.route_type ? route.route_type.replace('_', ' ') : 'Mixed Route'}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRoute(route.id);
                            }}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Map View */}
        <div className="lg:col-span-2">
          {selectedRoute ? (
            <UnifiedRouteMap
              key={selectedRoute}
              routeId={selectedRoute}
              showLiveTracking={true}
              showDirections={true}
              height="600px"
              refreshInterval={30}
              className="w-full"
              onRouteOptimized={loadRoutes}
            />
          ) : (
            <Card className="h-[600px]">
              <CardContent className="flex items-center justify-center h-full">
                <div className="text-center">
                  <MapPin className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Select a Route
                  </h3>
                  <p className="text-gray-600 max-w-sm">
                    Choose a route from the list to view its real-time tracking, 
                    delivery progress, and stop details on the map.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Route Details */}
      {selectedRoute && (
        <Card>
          <CardHeader>
            <CardTitle>Route Details</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const route = routes.find(r => r.id === selectedRoute);
              if (!route) return <div>Route not found</div>;
              
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Route Name</span>
                      <div className="text-lg font-semibold">{route.name}</div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Status</span>
                      <div>
                        <Badge className={getStatusColor(route.status)}>
                          {route.status}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Driver</span>
                      <div className="font-medium">{route.driver_name || 'Not assigned'}</div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Date</span>
                      <div className="font-medium">{new Date(route.date).toLocaleDateString()}</div>
                    </div>
                  </div>
                  
                  {route.total_distance && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                      <div>
                        <span className="text-sm font-medium text-gray-500">Total Distance</span>
                        <div className="text-lg font-semibold">{route.total_distance} km</div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-500">Estimated Duration</span>
                        <div className="text-lg font-semibold">
                          {route.estimated_duration ? `${Math.round(route.estimated_duration / 60)} hours` : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-500">Progress</span>
                        <div className="text-lg font-semibold">{Math.round(getRouteProgress(route))}%</div>
                      </div>
                    </div>
                  )}
                  
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Delivery Stops</h4>
                    <div className="grid gap-2">
                      {route.stops.map((stop) => (
                        <div 
                          key={stop.id} 
                          className={`p-3 rounded-lg border ${
                            stop.is_completed 
                              ? 'bg-green-50 border-green-200' 
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                stop.is_completed 
                                  ? 'bg-green-600 text-white' 
                                  : 'bg-gray-400 text-white'
                              }`}>
                                {stop.sequence_number}
                              </div>
                              <div>
                                <div className="font-medium text-sm">{stop.farmer.name}</div>
                                <div className="text-xs text-gray-600">{stop.farmer.address}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {stop.estimated_arrival_time && (
                                <div className="text-xs text-gray-500">
                                  ETA: {new Date(stop.estimated_arrival_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </div>
                              )}
                              {stop.is_completed ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ) : (
                                <Timer className="h-4 w-4 text-gray-400" />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}