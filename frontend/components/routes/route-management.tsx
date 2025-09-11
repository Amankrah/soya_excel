'use client';

import { useState, useEffect, useCallback } from 'react';
import { routeAPI, clientAPI, driverAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Plus, 
  Truck, 
  Calendar,
  Route as RouteIcon,
  Zap,
  Play,
  CheckCircle,
  Edit,
  Settings
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
    order: {
      order_number: string;
      quantity: number;
    };
    sequence_number: number;
    is_completed: boolean;
  }>;
  driver_name?: string;
}

interface Farmer {
  id: string;
  name: string;
  address: string;
  province: string;
  client_type: string;
}

interface Driver {
  id: string;
  full_name: string;
  assigned_vehicle?: {
    vehicle_number: string;
    vehicle_type: string;
  };
}

export function RouteManagement() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // These variables are loaded but not used in current implementation
  // Keeping them for future features
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [drivers, setDrivers] = useState<Driver[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);

  // Load data function
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [routesData, farmersData, driversData] = await Promise.all([
        routeAPI.getRoutes(),
        clientAPI.getFarmers(),
        driverAPI.getDrivers()
      ]);
      
      // Filter routes by selected date with null safety
      const filteredRoutes = (routesData || []).filter((route: Route) => 
        route && route.date === selectedDate
      );
      
      setRoutes(filteredRoutes);
      setFarmers(farmersData || []);
      setDrivers(driversData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load route data');
      // Set empty arrays on error to prevent crashes
      setRoutes([]);
      setFarmers([]);
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // Load data on mount and when selectedDate changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Route actions
  const handleOptimizeRoute = async (routeId: string) => {
    try {
      await routeAPI.optimizeRoute(parseInt(routeId), 'balanced');
      toast.success('Route optimized successfully');
      loadData();
    } catch (error) {
      console.error('Error optimizing route:', error);
      toast.error('Failed to optimize route');
    }
  };

  const handleActivateRoute = async (routeId: string) => {
    try {
      await routeAPI.activateRoute(routeId);
      toast.success('Route activated');
      loadData();
    } catch (error) {
      console.error('Error activating route:', error);
      toast.error('Failed to activate route');
    }
  };

  const handleCompleteRoute = async (routeId: string) => {
    try {
      await routeAPI.completeRoute(routeId);
      toast.success('Route completed');
      loadData();
    } catch (error) {
      console.error('Error completing route:', error);
      toast.error('Failed to complete route');
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'planned': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  // Get progress percentage
  const getProgress = (route: Route) => {
    if (route.stops.length === 0) return 0;
    return (route.stops.filter(stop => stop.is_completed).length / route.stops.length) * 100;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Route Management</h1>
          <p className="mt-2 text-gray-600">
            Plan, optimize, and manage soybean meal delivery routes
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Route
        </Button>
      </div>

      {/* Date Selector and Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Route Date</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="mb-4"
            />
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Total Routes</span>
                <span className="font-semibold">{routes.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Active</span>
                <span className="font-semibold text-green-600">
                  {routes.filter(r => r.status === 'active').length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Planned</span>
                <span className="font-semibold text-blue-600">
                  {routes.filter(r => r.status === 'planned').length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Completed</span>
                <span className="font-semibold text-gray-600">
                  {routes.filter(r => r.status === 'completed').length}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Routes Grid */}
        <div className="lg:col-span-3">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500">Loading routes...</div>
            </div>
          ) : routes.length === 0 ? (
            <Card className="h-64">
              <CardContent className="flex items-center justify-center h-full">
                <div className="text-center">
                  <RouteIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No routes for {new Date(selectedDate).toLocaleDateString()}
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Create a new route to start planning deliveries for this date.
                  </p>
                  <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Route
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {routes.map((route) => (
                <Card key={route.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{route.name}</CardTitle>
                      <Badge className={getStatusColor(route.status)}>
                        {route.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Truck className="h-4 w-4" />
                        {route.driver_name || 'No driver assigned'}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {new Date(route.date).toLocaleDateString()}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    {/* Route Stats */}
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-lg font-semibold text-gray-900">
                          {route.stops.length}
                        </div>
                        <div className="text-xs text-gray-600">Stops</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-gray-900">
                          {route.total_distance ? `${route.total_distance}km` : 'N/A'}
                        </div>
                        <div className="text-xs text-gray-600">Distance</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-gray-900">
                          {route.estimated_duration ? `${Math.round(route.estimated_duration / 60)}h` : 'N/A'}
                        </div>
                        <div className="text-xs text-gray-600">Duration</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {route.status === 'active' && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Progress</span>
                          <span className="font-medium">{Math.round(getProgress(route))}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${getProgress(route)}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {/* Route Type and Details */}
                    <div className="flex items-center justify-between text-sm">
                      <Badge variant="outline" className="text-xs">
                        {route.route_type ? route.route_type.replace('_', ' ') : 'Mixed Route'}
                      </Badge>
                      <div className="text-gray-600">
                        {route.stops.filter(s => s.is_completed).length} / {route.stops.length} delivered
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2 border-t">
                      {route.status === 'draft' && (
                        <>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleOptimizeRoute(route.id)}
                          >
                            <Zap className="h-3 w-3 mr-1" />
                            Optimize
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setEditingRoute(route)}
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                        </>
                      )}
                      
                      {route.status === 'planned' && (
                        <>
                          <Button 
                            variant="default" 
                            size="sm"
                            onClick={() => handleActivateRoute(route.id)}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Activate
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleOptimizeRoute(route.id)}
                          >
                            <Zap className="h-3 w-3 mr-1" />
                            Optimize
                          </Button>
                        </>
                      )}
                      
                      {route.status === 'active' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleCompleteRoute(route.id)}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Complete
                        </Button>
                      )}

                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {/* Navigate to route details */}}
                      >
                        <Settings className="h-3 w-3 mr-1" />
                        Details
                      </Button>
                    </div>

                    {/* Quick Stop Preview */}
                    {route.stops.length > 0 && (
                      <div className="pt-2 border-t">
                        <div className="text-xs text-gray-600 mb-2">
                          Next stops:
                        </div>
                        <div className="space-y-1">
                          {route.stops
                            .filter(stop => !stop.is_completed)
                            .slice(0, 2)
                            .map((stop) => (
                            <div key={stop.id} className="flex items-center gap-2 text-xs">
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold ${
                                stop.is_completed ? 'bg-green-600 text-white' : 'bg-gray-400 text-white'
                              }`}>
                                {stop.sequence_number}
                              </div>
                              <div className="flex-1 truncate">
                                <div className="font-medium">{stop.farmer.name}</div>
                                <div className="text-gray-500">{stop.order.quantity}tm - {stop.order.order_number}</div>
                              </div>
                            </div>
                          ))}
                          {route.stops.filter(stop => !stop.is_completed).length > 2 && (
                            <div className="text-xs text-gray-500 pl-6">
                              +{route.stops.filter(stop => !stop.is_completed).length - 2} more stops
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Route Modal - This would be a separate component in a real app */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
            <CardHeader>
              <CardTitle>Create New Route</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Route Name</label>
                  <Input placeholder="Enter route name" />
                </div>
                <div>
                  <label className="text-sm font-medium">Route Type</label>
                  <select 
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    title="Select route type"
                    aria-label="Route type selection"
                  >
                    <option value="mixed">Mixed Route</option>
                    <option value="contract">Contract Deliveries</option>
                    <option value="on_demand">On-Demand Deliveries</option>
                    <option value="emergency">Emergency Refills</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Date</label>
                  <Input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => {
                      toast.success('Route creation feature coming soon!');
                      setShowCreateModal(false);
                    }}
                    className="flex-1"
                  >
                    Create Route
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}