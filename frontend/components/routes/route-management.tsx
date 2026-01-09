'use client';

import { useState, useEffect, useCallback } from 'react';
import { routeAPI } from '@/lib/api';
import { AxiosError } from 'axios';
import { toast } from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UnifiedRouteMap } from '@/components/maps/unified-route-map';
import {
  Truck,
  Calendar,
  Route as RouteIcon,
  Zap,
  Play,
  CheckCircle,
  Users,
  MapPin,
  TrendingUp,
  Clock,
  X,
  Loader2,
  Map,
  Edit,
  Trash2,
  UserPlus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { DriverAssignmentDialog } from '@/components/route/driver-assignment-dialog';

// Type for the DriverAssignmentDialog component
type DriverAssignmentRoute = {
  id: string;
  name: string;
  date: string;
  total_distance?: number;
  estimated_duration?: number;
  stops: {
    id: number;
    address: string;
    latitude?: number;
    longitude?: number;
    sequence_order: number;
  }[];
};

// Transform route for driver assignment dialog
const transformRouteForAssignment = (route: Route | null): DriverAssignmentRoute | null => {
  if (!route) return null;
  
  return {
    id: route.id,
    name: route.name,
    date: route.date,
    total_distance: route.total_distance,
    estimated_duration: route.estimated_duration,
    stops: route.stops.map((stop, index) => ({
      id: parseInt(stop.id) || index + 1,
      address: stop.client.address,
      latitude: stop.client.latitude || undefined,
      longitude: stop.client.longitude || undefined,
      sequence_order: stop.sequence_number
    }))
  };
};

interface Client {
  id: number;
  name: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  has_coordinates: boolean;
  predicted_next_order_date: string | null;
  days_until_predicted_order: number | null;
  priority: string | null;
  is_urgent: boolean;
}

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
    client: {
      name: string;
      address: string;
      city?: string;
      country?: string;
      has_coordinates: boolean;
      latitude: number | null;
      longitude: number | null;
    };
    order: {
      id: number;
      client_order_number: string;
      quantity_ordered: number;
      quantity_delivered: number;
      status: string;
    } | null;
    sequence_number: number;
    is_completed: boolean;
  }>;
  driver_name?: string;
}

interface DistributionPlanRoute {
  cluster_id: number;
  clients: number[];
  client_count: number;
  total_distance_km: number;
  estimated_duration_minutes: number;
  waypoint_order: number[];
}

interface DistributionPlan {
  success: boolean;
  routes_count: number;
  total_clients: number;
  routes: DistributionPlanRoute[];
  error?: string;
}

export function RouteManagement() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showDistributionPlanner, setShowDistributionPlanner] = useState(false);
  const [datesWithRoutes, setDatesWithRoutes] = useState<Set<string>>(new Set());
  const [showDatesList, setShowDatesList] = useState(true);

  // Distribution planning state
  const [availableClients, setAvailableClients] = useState<Client[]>([]);
  const [selectedClients, setSelectedClients] = useState<Set<number>>(new Set());
  const [distributionPlan, setDistributionPlan] = useState<DistributionPlan | null>(null);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [clusteringMethod, setClusteringMethod] = useState<'dbscan' | 'kmeans'>('dbscan');
  const [maxStopsPerRoute, setMaxStopsPerRoute] = useState(10);
  const [maxDistanceKm, setMaxDistanceKm] = useState(300);

  // Route details map modal state
  const [showRouteMap, setShowRouteMap] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  // Edit route modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [editSelectedClients, setEditSelectedClients] = useState<Set<number>>(new Set());
  const [editClusteringMethod, setEditClusteringMethod] = useState<'dbscan' | 'kmeans'>('dbscan');
  const [editMaxStopsPerRoute, setEditMaxStopsPerRoute] = useState(10);
  const [editMaxDistanceKm, setEditMaxDistanceKm] = useState(300);
  const [editClientSearchTerm, setEditClientSearchTerm] = useState('');
  const [editClientPriorityFilter, setEditClientPriorityFilter] = useState<string>('all');
  const [editPlanningLoading, setEditPlanningLoading] = useState(false);

  // Client filtering state (for Distribution Planner)
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [clientPriorityFilter, setClientPriorityFilter] = useState<string>('all');

  // Driver assignment dialog state
  const [showDriverAssignmentDialog, setShowDriverAssignmentDialog] = useState(false);
  const [selectedRouteForAssignment, setSelectedRouteForAssignment] = useState<Route | null>(null);

  // Load data function
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch routes and available clients in parallel
      const [routesData, clientsResponse] = await Promise.all([
        routeAPI.getRoutes(),
        // Use the custom available_clients endpoint that returns all geocoded clients without pagination
        fetch('http://localhost:8000/api/routes/routes/available_clients/', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      const clientsData = await clientsResponse.json();

      // Filter routes by selected date with null safety
      const filteredRoutes = (routesData || []).filter((route: Route) =>
        route && route.date === selectedDate
      );

      setRoutes(filteredRoutes);

      // Extract clients from response
      const clients = clientsData.results || [];

      console.log('Total clients from API:', clientsData.count || clients.length);
      console.log('Clients with coordinates:', clients.length);

      setAvailableClients(clients);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load route data');
      setRoutes([]);
      setAvailableClients([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // Load data on mount and when selectedDate changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fetch dates with routes on mount
  useEffect(() => {
    const fetchDatesWithRoutes = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/routes/routes/dates_with_routes/', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json',
          },
        });
        const data = await response.json();
        setDatesWithRoutes(new Set(data.dates || []));
      } catch (error) {
        console.error('Error fetching dates with routes:', error);
      }
    };

    fetchDatesWithRoutes();
  }, []);

  // Route actions
  const handleOptimizeRoute = async (routeId: string) => {
    try {
      const result = await routeAPI.optimizeRoute(parseInt(routeId));
      toast.success(`Route optimized: ${result.message || 'Success'}`);
      loadData();
    } catch (error: unknown) {
      console.error('Error optimizing route:', error);
      const errorMessage = error instanceof Error && 'response' in error
        ? (error as AxiosError<{ error: string }>).response?.data?.error || 'Failed to optimize route'
        : 'Failed to optimize route';
      toast.error(errorMessage);
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

  const handleEditRoute = (route: Route) => {
    setEditingRoute(route);

    // Extract client IDs from route stops
    const clientIds = new Set<number>();
    route.stops.forEach(stop => {
      // Handle both object and string formats for client
      const clientId = typeof stop.client === 'object' && stop.client !== null && 'id' in stop.client
        ? (stop.client as { id: number }).id
        : typeof stop.client === 'string' ? parseInt(stop.client) : 0;
      if (!isNaN(clientId) && clientId > 0) {
        clientIds.add(clientId);
      }
    });

    setEditSelectedClients(clientIds);
    setEditClusteringMethod('dbscan');
    setEditMaxStopsPerRoute(10);
    setEditMaxDistanceKm(300);
    setEditClientSearchTerm('');
    setEditClientPriorityFilter('all');
    setShowEditModal(true);
  };

  const handleUpdateRoute = async () => {
    if (!editingRoute) return;

    if (editSelectedClients.size === 0) {
      toast.error('Please select at least one client');
      return;
    }

    try {
      setEditPlanningLoading(true);

      // For active routes, we modify stops in-place instead of recreating
      if (editingRoute.status === 'active') {
        // Get current stop client IDs
        const currentClientIds = new Set(
          editingRoute.stops.map(stop =>
            typeof stop.client === 'object' && stop.client !== null && 'id' in stop.client
              ? (stop.client as { id: number }).id
              : 0
          ).filter(id => id > 0)
        );

        // Find stops to remove
        const clientsToRemove = Array.from(currentClientIds).filter(
          id => !editSelectedClients.has(id)
        );

        // Find stops to add
        const clientsToAdd = Array.from(editSelectedClients).filter(
          id => !currentClientIds.has(id)
        );

        // Remove stops
        for (const clientId of clientsToRemove) {
          const stopToRemove = editingRoute.stops.find(stop => {
            const stopClientId = typeof stop.client === 'object' && stop.client !== null && 'id' in stop.client
              ? (stop.client as { id: number }).id
              : 0;
            return stopClientId === clientId;
          });

          if (stopToRemove) {
            try {
              await fetch(`http://localhost:8000/api/routes/routes/${editingRoute.id}/remove_stop/`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  stop_id: parseInt(stopToRemove.id),
                  reoptimize: false // We'll optimize once at the end
                })
              });
            } catch (err) {
              console.error(`Failed to remove stop for client ${clientId}:`, err);
            }
          }
        }

        // Add stops
        for (const clientId of clientsToAdd) {
          try {
            await fetch(`http://localhost:8000/api/routes/routes/${editingRoute.id}/insert_stop/`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                client_id: clientId,
                optimize: false // We'll optimize once at the end
              })
            });
          } catch (err) {
            console.error(`Failed to add stop for client ${clientId}:`, err);
          }
        }

        // Reoptimize route after all changes
        if (clientsToAdd.length > 0 || clientsToRemove.length > 0) {
          await routeAPI.optimizeRoute(parseInt(editingRoute.id));
        }

        toast.success(`Active route updated: ${clientsToAdd.length} stops added, ${clientsToRemove.length} removed`);
        setShowEditModal(false);
        setEditingRoute(null);
        setEditSelectedClients(new Set());
        setEditClientSearchTerm('');
        setEditClientPriorityFilter('all');
        loadData();
      } else {
        // For draft/planned routes, use the original delete + recreate approach
        // First, delete the existing route
        await routeAPI.deleteRoute(editingRoute.id);

        // Then create a new route with the updated clients and planning options
        const result = await routeAPI.createDistributionPlan({
          client_ids: Array.from(editSelectedClients),
          date: editingRoute.date,
          max_stops_per_route: editMaxStopsPerRoute,
          max_distance_km: editMaxDistanceKm,
          clustering_method: editClusteringMethod,
          use_async: false,
          create_routes: true
        });

        if (result.success) {
          toast.success(`Route updated: Created ${result.created_routes.length} optimized routes`);
          setShowEditModal(false);
          setEditingRoute(null);
          setEditSelectedClients(new Set());
          setEditClientSearchTerm('');
          setEditClientPriorityFilter('all');
          loadData();
        } else {
          toast.error(result.error || 'Failed to update route');
        }
      }
    } catch (error: unknown) {
      console.error('Error updating route:', error);
      const errorMessage = error instanceof Error && 'response' in error
        ? (error as AxiosError<{ error: string }>).response?.data?.error || 'Failed to update route'
        : 'Failed to update route';
      toast.error(errorMessage);
    } finally {
      setEditPlanningLoading(false);
    }
  };

  const handleDeleteRoute = async (routeId: string, routeName: string) => {
    if (!confirm(`Are you sure you want to delete route "${routeName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await routeAPI.deleteRoute(routeId);
      toast.success('Route deleted successfully');
      loadData();
    } catch (error: unknown) {
      console.error('Error deleting route:', error);
      const errorMessage = error instanceof Error && 'response' in error
        ? (error as AxiosError<{ error: string }>).response?.data?.error || 'Failed to delete route'
        : 'Failed to delete route';
      toast.error(errorMessage);
    }
  };


  // Distribution planning actions
  const handleCreateDistributionPlan = async () => {
    if (selectedClients.size === 0) {
      toast.error('Please select at least one client');
      return;
    }

    try {
      setPlanningLoading(true);
      const result = await routeAPI.createDistributionPlan({
        client_ids: Array.from(selectedClients),
        date: selectedDate,
        max_stops_per_route: maxStopsPerRoute,
        max_distance_km: maxDistanceKm,
        clustering_method: clusteringMethod,
        use_async: false,
        create_routes: false  // Preview first
      });

      if (result.success) {
        setDistributionPlan(result);
        toast.success(`Distribution plan created: ${result.routes_count} routes`);
      } else {
        toast.error(result.error || 'Failed to create distribution plan');
      }
    } catch (error: unknown) {
      console.error('Error creating distribution plan:', error);
      const errorMessage = error instanceof Error && 'response' in error
        ? (error as AxiosError<{ error: string }>).response?.data?.error || 'Failed to create distribution plan'
        : 'Failed to create distribution plan';
      toast.error(errorMessage);
    } finally {
      setPlanningLoading(false);
    }
  };

  const handleConfirmDistributionPlan = async () => {
    if (!distributionPlan) return;

    try {
      setPlanningLoading(true);
      const result = await routeAPI.createDistributionPlan({
        client_ids: Array.from(selectedClients),
        date: selectedDate,
        max_stops_per_route: maxStopsPerRoute,
        max_distance_km: maxDistanceKm,
        clustering_method: clusteringMethod,
        use_async: false,
        create_routes: true  // Actually create routes
      });

      if (result.success) {
        toast.success(`Created ${result.created_routes.length} routes`);
        setShowDistributionPlanner(false);
        setDistributionPlan(null);
        setSelectedClients(new Set());
        loadData();
      } else {
        toast.error(result.error || 'Failed to create routes');
      }
    } catch (error: unknown) {
      console.error('Error confirming distribution plan:', error);
      const errorMessage = error instanceof Error && 'response' in error
        ? (error as AxiosError<{ error: string }>).response?.data?.error || 'Failed to create routes'
        : 'Failed to create routes';
      toast.error(errorMessage);
    } finally {
      setPlanningLoading(false);
    }
  };

  const toggleClientSelection = (clientId: number) => {
    setSelectedClients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clientId)) {
        newSet.delete(clientId);
      } else {
        newSet.add(clientId);
      }
      return newSet;
    });
  };

  const toggleEditClientSelection = (clientId: number) => {
    setEditSelectedClients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clientId)) {
        newSet.delete(clientId);
      } else {
        newSet.add(clientId);
      }
      return newSet;
    });
  };

  const clearEditSelection = () => {
    setEditSelectedClients(new Set());
  };

  // Filter clients based on search and priority (for Distribution Planner)
  const filteredClients = availableClients.filter(client => {
    // Search filter
    const matchesSearch = clientSearchTerm === '' ||
      client.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
      client.city.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
      client.country.toLowerCase().includes(clientSearchTerm.toLowerCase());

    // Priority filter
    let matchesPriority = true;
    if (clientPriorityFilter !== 'all') {
      const days = client.days_until_predicted_order;

      if (clientPriorityFilter === 'overdue') {
        matchesPriority = days !== null && days < 0;
      } else if (clientPriorityFilter === 'urgent') {
        matchesPriority = days !== null && days >= 0 && days <= 3;
      } else if (clientPriorityFilter === 'high') {
        matchesPriority = days !== null && days > 3 && days <= 7;
      } else if (clientPriorityFilter === 'medium') {
        matchesPriority = days !== null && days > 7 && days <= 14;
      } else if (clientPriorityFilter === 'low') {
        matchesPriority = days !== null && days > 14;
      } else if (clientPriorityFilter === 'no_prediction') {
        matchesPriority = days === null;
      }
    }

    return matchesSearch && matchesPriority;
  });

  // Filter clients for Edit Route modal
  const editFilteredClients = availableClients.filter(client => {
    // Search filter
    const matchesSearch = editClientSearchTerm === '' ||
      client.name.toLowerCase().includes(editClientSearchTerm.toLowerCase()) ||
      client.city.toLowerCase().includes(editClientSearchTerm.toLowerCase()) ||
      client.country.toLowerCase().includes(editClientSearchTerm.toLowerCase());

    // Priority filter
    let matchesPriority = true;
    if (editClientPriorityFilter !== 'all') {
      const days = client.days_until_predicted_order;

      if (editClientPriorityFilter === 'overdue') {
        matchesPriority = days !== null && days < 0;
      } else if (editClientPriorityFilter === 'urgent') {
        matchesPriority = days !== null && days >= 0 && days <= 3;
      } else if (editClientPriorityFilter === 'high') {
        matchesPriority = days !== null && days > 3 && days <= 7;
      } else if (editClientPriorityFilter === 'medium') {
        matchesPriority = days !== null && days > 7 && days <= 14;
      } else if (editClientPriorityFilter === 'low') {
        matchesPriority = days !== null && days > 14;
      } else if (editClientPriorityFilter === 'no_prediction') {
        matchesPriority = days === null;
      }
    }

    return matchesSearch && matchesPriority;
  });

  const clearSelection = () => {
    setSelectedClients(new Set());
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
        <Button
          variant="outline"
          onClick={() => setShowDistributionPlanner(true)}
        >
          <Users className="h-4 w-4 mr-2" />
          Distribution Planner
        </Button>
      </div>

      {/* Date Selector and Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Route Date</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative mb-4">
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className={datesWithRoutes.has(selectedDate) ? "border-blue-500 border-2" : ""}
              />
              {datesWithRoutes.has(selectedDate) && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white"></div>
              )}
            </div>
            {datesWithRoutes.size > 0 && (
              <div className="mb-4 text-xs bg-blue-50 border border-blue-200 rounded overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowDatesList(!showDatesList)}
                  className="w-full flex items-center justify-between p-3 hover:bg-blue-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="font-medium text-blue-900">
                      {datesWithRoutes.size} date{datesWithRoutes.size !== 1 ? 's' : ''} with routes
                    </span>
                  </div>
                  {showDatesList ? (
                    <ChevronUp className="h-4 w-4 text-blue-700" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-blue-700" />
                  )}
                </button>
                {showDatesList && (
                  <div className="max-h-48 overflow-y-auto px-3 pb-3 space-y-1">
                    {Array.from(datesWithRoutes)
                      .sort()
                      .reverse()
                      .map(date => (
                        <button
                          type="button"
                          key={date}
                          onClick={() => setSelectedDate(date)}
                          className={`block w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                            selectedDate === date
                              ? 'bg-blue-500 text-white font-medium'
                              : 'text-blue-700 hover:bg-blue-100'
                          }`}
                        >
                          {new Date(date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
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
                    Use the distribution planner to create optimized delivery routes.
                  </p>
                  <Button
                    onClick={() => setShowDistributionPlanner(true)}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Distribution Planner
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
                            style={{ width: `${Math.min(100, Math.max(0, getProgress(route)))}%` }}
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
                    <div className="flex gap-2 pt-2 border-t flex-wrap">
                      {(route.status === 'draft' || route.status === 'planned' || route.status === 'active') && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOptimizeRoute(route.id)}
                            title={route.status === 'active' ? 'Reoptimize active route' : 'Optimize route'}
                          >
                            <Zap className="h-3 w-3 mr-1" />
                            {route.status === 'active' ? 'Reoptimize' : 'Optimize'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditRoute(route)}
                            title={route.status === 'active' ? 'Edit stops (add/remove)' : 'Edit route'}
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            {route.status === 'active' ? 'Edit Stops' : 'Edit'}
                          </Button>
                        </>
                      )}

                      {route.status === 'planned' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedRouteForAssignment(route);
                              setShowDriverAssignmentDialog(true);
                            }}
                          >
                            <UserPlus className="h-3 w-3 mr-1" />
                            Assign Driver
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleActivateRoute(route.id)}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Activate
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
                        onClick={() => {
                          setSelectedRouteId(route.id);
                          setShowRouteMap(true);
                        }}
                      >
                        <Map className="h-3 w-3 mr-1" />
                        View Map
                      </Button>

                      {(route.status === 'draft' || route.status === 'planned' || route.status === 'cancelled') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRoute(route.id, route.name)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      )}
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
                                <div className="font-medium">{stop.client.name}</div>
                                <div className="text-gray-500">
                                  {stop.order
                                    ? `${stop.order.quantity_ordered}tm - ${stop.order.client_order_number}`
                                    : `${stop.client.city}, ${stop.client.country}`
                                  }
                                </div>
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

      {/* Distribution Planner Modal */}
      {showDistributionPlanner && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">Distribution Planner</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    Select clients and create optimized delivery routes
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowDistributionPlanner(false);
                    setDistributionPlan(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Client Selection */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Select Clients ({filteredClients.length})</h3>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedClients(new Set(filteredClients.map(c => c.id)))}
                      >
                        Select All Filtered
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearSelection}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Input
                      placeholder="Search by name, city, or country..."
                      value={clientSearchTerm}
                      onChange={(e) => setClientSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  </div>

                  {/* Priority Filter Buttons */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={clientPriorityFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setClientPriorityFilter('all')}
                    >
                      All
                    </Button>
                    <Button
                      variant={clientPriorityFilter === 'overdue' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setClientPriorityFilter('overdue')}
                      className={clientPriorityFilter === 'overdue' ? 'bg-orange-600 hover:bg-orange-700' : ''}
                    >
                      Overdue
                    </Button>
                    <Button
                      variant={clientPriorityFilter === 'urgent' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setClientPriorityFilter('urgent')}
                    >
                      Urgent (≤3d)
                    </Button>
                    <Button
                      variant={clientPriorityFilter === 'high' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setClientPriorityFilter('high')}
                    >
                      High (4-7d)
                    </Button>
                    <Button
                      variant={clientPriorityFilter === 'medium' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setClientPriorityFilter('medium')}
                    >
                      Medium (8-14d)
                    </Button>
                    <Button
                      variant={clientPriorityFilter === 'low' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setClientPriorityFilter('low')}
                    >
                      Low (&gt;14d)
                    </Button>
                  </div>

                  <div className="border rounded-lg p-2 max-h-96 overflow-y-auto">
                    {filteredClients.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <MapPin className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                        <p>No clients match your filters</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredClients.map((client) => (
                          <div
                            key={client.id}
                            className="flex items-center gap-3 p-3 rounded-md hover:bg-gray-50 cursor-pointer"
                            onClick={() => toggleClientSelection(client.id)}
                          >
                            <input
                              type="checkbox"
                              checked={selectedClients.has(client.id)}
                              onChange={() => toggleClientSelection(client.id)}
                              className="h-4 w-4 rounded border-gray-300"
                              aria-label={`Select ${client.name}`}
                            />
                            <div className="flex-1">
                              <div className="font-medium">{client.name}</div>
                              <div className="text-xs text-gray-500">
                                {client.city}, {client.country}
                              </div>
                              {client.days_until_predicted_order !== null && (
                                <div className={`text-xs mt-1 ${
                                  client.days_until_predicted_order < 0 ? 'text-orange-600 font-semibold' :
                                  client.days_until_predicted_order <= 3 ? 'text-red-600 font-semibold' :
                                  'text-blue-600'
                                }`}>
                                  {client.days_until_predicted_order < 0
                                    ? `Overdue by ${Math.abs(client.days_until_predicted_order)} days`
                                    : `Order in ${client.days_until_predicted_order} days`
                                  }
                                </div>
                              )}
                            </div>
                            <MapPin className="h-4 w-4 text-green-600" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-sm text-gray-600">
                    Selected: {selectedClients.size} / {availableClients.length} clients
                  </div>
                </div>

                {/* Planning Options and Results */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Planning Options</h3>

                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">Clustering Method</label>
                      <select
                        value={clusteringMethod}
                        onChange={(e) => setClusteringMethod(e.target.value as 'dbscan' | 'kmeans')}
                        className="w-full mt-1 border rounded-md px-3 py-2"
                        title="Select clustering algorithm"
                        aria-label="Clustering method selection"
                      >
                        <option value="dbscan">DBSCAN (Density-based)</option>
                        <option value="kmeans">K-Means (Balanced)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        {clusteringMethod === 'dbscan'
                          ? 'Automatically finds optimal cluster count based on density'
                          : 'Creates balanced groups based on estimated route count'}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Max Stops per Route</label>
                      <Input
                        type="number"
                        value={maxStopsPerRoute}
                        onChange={(e) => setMaxStopsPerRoute(parseInt(e.target.value) || 10)}
                        min={2}
                        max={20}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">Max Distance (km)</label>
                      <Input
                        type="number"
                        value={maxDistanceKm}
                        onChange={(e) => setMaxDistanceKm(parseInt(e.target.value) || 300)}
                        min={50}
                        max={1000}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  {/* Distribution Plan Results */}
                  {distributionPlan && (
                    <div className="border rounded-lg p-4 bg-blue-50 space-y-3">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-blue-600" />
                        <h4 className="font-semibold text-blue-900">Plan Summary</h4>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-gray-600">Routes Created</div>
                          <div className="text-lg font-bold text-blue-900">
                            {distributionPlan.routes_count}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-600">Total Clients</div>
                          <div className="text-lg font-bold text-blue-900">
                            {distributionPlan.total_clients}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 mt-4">
                        <div className="text-sm font-medium">Route Details:</div>
                        {distributionPlan.routes.map((route: DistributionPlanRoute, idx: number) => (
                          <div key={idx} className="bg-white p-3 rounded border text-sm">
                            <div className="font-medium mb-1">Route {idx + 1}</div>
                            <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                              <div>
                                <Users className="h-3 w-3 inline mr-1" />
                                {route.client_count} stops
                              </div>
                              <div>
                                <RouteIcon className="h-3 w-3 inline mr-1" />
                                {route.total_distance_km.toFixed(1)} km
                              </div>
                              <div>
                                <Clock className="h-3 w-3 inline mr-1" />
                                {Math.round(route.estimated_duration_minutes)} min
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-4 border-t">
                    {!distributionPlan ? (
                      <Button
                        onClick={handleCreateDistributionPlan}
                        disabled={selectedClients.size === 0 || planningLoading}
                        className="flex-1"
                      >
                        {planningLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Planning...
                          </>
                        ) : (
                          <>
                            <Zap className="h-4 w-4 mr-2" />
                            Create Plan
                          </>
                        )}
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => setDistributionPlan(null)}
                          className="flex-1"
                        >
                          Modify
                        </Button>
                        <Button
                          onClick={handleConfirmDistributionPlan}
                          disabled={planningLoading}
                          className="flex-1"
                        >
                          {planningLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Confirm & Create Routes
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Route Modal */}
      {showEditModal && editingRoute && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">
                    {editingRoute.status === 'active' ? 'Edit Active Route Stops' : `Edit Route: ${editingRoute.name}`}
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    {editingRoute.status === 'active'
                      ? 'Add or remove stops from active route. Changes will be applied immediately.'
                      : 'Modify clients and planning options for this route'
                    }
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingRoute(null);
                    setEditSelectedClients(new Set());
                    setEditClientSearchTerm('');
                    setEditClientPriorityFilter('all');
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Client Selection */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Select Clients ({editFilteredClients.length})</h3>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditSelectedClients(new Set(editFilteredClients.map(c => c.id)))}
                      >
                        Select All Filtered
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearEditSelection}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Input
                      placeholder="Search by name, city, or country..."
                      value={editClientSearchTerm}
                      onChange={(e) => setEditClientSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  </div>

                  {/* Priority Filter Buttons */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={editClientPriorityFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setEditClientPriorityFilter('all')}
                    >
                      All
                    </Button>
                    <Button
                      variant={editClientPriorityFilter === 'overdue' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setEditClientPriorityFilter('overdue')}
                      className={editClientPriorityFilter === 'overdue' ? 'bg-orange-600 hover:bg-orange-700' : ''}
                    >
                      Overdue
                    </Button>
                    <Button
                      variant={editClientPriorityFilter === 'urgent' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setEditClientPriorityFilter('urgent')}
                    >
                      Urgent (≤3d)
                    </Button>
                    <Button
                      variant={editClientPriorityFilter === 'high' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setEditClientPriorityFilter('high')}
                    >
                      High (4-7d)
                    </Button>
                    <Button
                      variant={editClientPriorityFilter === 'medium' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setEditClientPriorityFilter('medium')}
                    >
                      Medium (8-14d)
                    </Button>
                    <Button
                      variant={editClientPriorityFilter === 'low' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setEditClientPriorityFilter('low')}
                    >
                      Low (&gt;14d)
                    </Button>
                  </div>

                  <div className="border rounded-lg p-2 max-h-96 overflow-y-auto">
                    {editFilteredClients.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <MapPin className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                        <p>No clients match your filters</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {editFilteredClients.map((client) => (
                          <div
                            key={client.id}
                            className="flex items-center gap-3 p-3 rounded-md hover:bg-gray-50 cursor-pointer"
                            onClick={() => toggleEditClientSelection(client.id)}
                          >
                            <input
                              type="checkbox"
                              checked={editSelectedClients.has(client.id)}
                              onChange={() => toggleEditClientSelection(client.id)}
                              className="h-4 w-4 rounded border-gray-300"
                              aria-label={`Select ${client.name}`}
                            />
                            <div className="flex-1">
                              <div className="font-medium">{client.name}</div>
                              <div className="text-xs text-gray-500">
                                {client.city}, {client.country}
                              </div>
                              {client.days_until_predicted_order !== null && (
                                <div className={`text-xs mt-1 ${
                                  client.days_until_predicted_order < 0 ? 'text-orange-600 font-semibold' :
                                  client.days_until_predicted_order <= 3 ? 'text-red-600 font-semibold' :
                                  'text-blue-600'
                                }`}>
                                  {client.days_until_predicted_order < 0
                                    ? `Overdue by ${Math.abs(client.days_until_predicted_order)} days`
                                    : `Order in ${client.days_until_predicted_order} days`
                                  }
                                </div>
                              )}
                            </div>
                            <MapPin className="h-4 w-4 text-green-600" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-sm text-gray-600">
                    Selected: {editSelectedClients.size} / {availableClients.length} clients
                  </div>
                </div>

                {/* Planning Options */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Planning Options</h3>

                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">Clustering Method</label>
                      <select
                        value={editClusteringMethod}
                        onChange={(e) => setEditClusteringMethod(e.target.value as 'dbscan' | 'kmeans')}
                        className="w-full mt-1 border rounded-md px-3 py-2"
                        title="Select clustering algorithm"
                        aria-label="Clustering method selection"
                      >
                        <option value="dbscan">DBSCAN (Density-based)</option>
                        <option value="kmeans">K-Means (Balanced)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        {editClusteringMethod === 'dbscan'
                          ? 'Automatically finds optimal cluster count based on density'
                          : 'Creates balanced groups based on estimated route count'}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Max Stops per Route</label>
                      <Input
                        type="number"
                        value={editMaxStopsPerRoute}
                        onChange={(e) => setEditMaxStopsPerRoute(parseInt(e.target.value) || 10)}
                        min={2}
                        max={20}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">Max Distance (km)</label>
                      <Input
                        type="number"
                        value={editMaxDistanceKm}
                        onChange={(e) => setEditMaxDistanceKm(parseInt(e.target.value) || 300)}
                        min={50}
                        max={1000}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  {/* Info Box */}
                  <div className={`border rounded-lg p-4 space-y-2 ${
                    editingRoute.status === 'active' ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      <TrendingUp className={`h-5 w-5 ${editingRoute.status === 'active' ? 'text-orange-600' : 'text-blue-600'}`} />
                      <h4 className={`font-semibold ${editingRoute.status === 'active' ? 'text-orange-900' : 'text-blue-900'}`}>
                        {editingRoute.status === 'active' ? 'Active Route Editing' : 'Route Update Process'}
                      </h4>
                    </div>
                    <div className={`text-sm space-y-1 ${editingRoute.status === 'active' ? 'text-orange-800' : 'text-blue-800'}`}>
                      {editingRoute.status === 'active' ? (
                        <>
                          <p>• <strong>Live Route:</strong> Changes affect ongoing delivery</p>
                          <p>• Adding stops: New stops added to route immediately</p>
                          <p>• Removing stops: Stops removed but not marked as completed</p>
                          <p>• Reoptimization: Route will be recalculated with new stops</p>
                          <p>• <strong>Note:</strong> Communicate changes to driver</p>
                        </>
                      ) : (
                        <>
                          <p>• Current route will be deleted</p>
                          <p>• New optimized routes will be created with selected clients</p>
                          <p>• Multiple routes may be created based on clustering</p>
                          <p>• Route date: {new Date(editingRoute.date).toLocaleDateString()}</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowEditModal(false);
                        setEditingRoute(null);
                        setEditSelectedClients(new Set());
                        setEditClientSearchTerm('');
                        setEditClientPriorityFilter('all');
                      }}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUpdateRoute}
                      disabled={editSelectedClients.size === 0 || editPlanningLoading}
                      className="flex-1"
                    >
                      {editPlanningLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          {editingRoute.status === 'active' ? 'Update Stops' : 'Update Route'}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Route Map Modal */}
      {showRouteMap && selectedRouteId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-7xl max-h-[95vh] overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
              <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                <Map className="h-5 w-5 text-blue-600" />
                Route Map & Details
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowRouteMap(false);
                  setSelectedRouteId(null);
                }}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Modal Content - Map */}
            <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(95vh - 80px)' }}>
              <UnifiedRouteMap
                routeId={selectedRouteId}
                showLiveTracking={true}
                showDirections={true}
                onRouteOptimized={() => {
                  loadData();
                  toast.success('Route optimized! Reloading data...');
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Driver Assignment Dialog */}
      <DriverAssignmentDialog
        route={transformRouteForAssignment(selectedRouteForAssignment)}
        open={showDriverAssignmentDialog}
        onOpenChange={setShowDriverAssignmentDialog}
        onAssignmentComplete={() => {
          loadData(); // Refresh routes to show updated assignment status
          toast.success('Driver assigned successfully!');
        }}
      />
    </div>
  );
}
