'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleMap, GoogleMapRef } from '@/components/ui/google-map';
import { routeAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { 
  createMarkerIcons, 
  createDriverInfoWindowContent, 
  createStopInfoWindowContent,
  getRouteColor
} from '@/lib/google-maps';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Truck, 
  Clock, 
  RefreshCw, 
  Navigation2,
  AlertCircle,
  CheckCircle,
  Route as RouteIcon
} from 'lucide-react';

interface DriverLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  vehicle?: {
    id: string;
    license_plate: string;
    vehicle_type: string;
  };
  current_route?: {
    id: string;
    name: string;
    stops_completed: number;
    total_stops: number;
    status: string;
  };
  last_update: string;
  is_active: boolean;
}

interface ActiveRoute {
  id: string;
  name: string;
  driver_name?: string;
  status: 'active' | 'planned' | 'completed';
  stops: Array<{
    id: string;
    sequence_number: number;
    farmer: { name: string; address: string };
    order: { order_number: string; quantity: number };
    location_latitude?: number;
    location_longitude?: number;
    is_completed: boolean;
    estimated_arrival_time?: string;
  }>;
  total_distance?: number;
  estimated_duration?: number;
}

interface LiveTrackingMapProps {
  height?: string;
  refreshInterval?: number; // in seconds
  showAllRoutes?: boolean;
  focusedRouteId?: string;
  className?: string;
}

export function LiveTrackingMap({
  height = '600px',
  refreshInterval = 30,
  showAllRoutes = true,
  focusedRouteId,
  className = ''
}: LiveTrackingMapProps) {
  const mapRef = useRef<GoogleMapRef>(null);
  const [drivers, setDrivers] = useState<DriverLocation[]>([]);
  const [activeRoutes, setActiveRoutes] = useState<ActiveRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Map state - Using refs to prevent infinite loops
  const driverMarkersRef = useRef<google.maps.Marker[]>([]);
  const routeMarkersRef = useRef<google.maps.Marker[]>([]);
  const routePathsRef = useRef<google.maps.Polyline[]>([]);
  const [infoWindow, setInfoWindow] = useState<google.maps.InfoWindow | null>(null);

  // Add refs to prevent multiple simultaneous loads and store current props
  const loadingDataRef = useRef(false);
  const showAllRoutesRef = useRef(showAllRoutes);
  const focusedRouteIdRef = useRef(focusedRouteId);
  
  // Update refs when props change
  showAllRoutesRef.current = showAllRoutes;
  focusedRouteIdRef.current = focusedRouteId;

  // Load live data
  const loadLiveData = useCallback(async (showLoadingState = true) => {
    // Prevent multiple simultaneous loads
    if (loadingDataRef.current) return;
    
    try {
      loadingDataRef.current = true;
      if (showLoadingState) setLoading(true);

      // Load active routes using current ref values
      const routesData = showAllRoutesRef.current 
        ? await routeAPI.getActiveRoutes()
        : focusedRouteIdRef.current 
          ? [await routeAPI.getRoute(focusedRouteIdRef.current)]
          : [];

      // For demo purposes, simulate driver locations
      // In a real implementation, this would come from GPS tracking
      const simulatedDrivers: DriverLocation[] = routesData
        .filter((route: ActiveRoute) => route.status === 'active')
        .map((route: ActiveRoute, index: number) => {
          // Find a random stop that's not completed yet
          const activeStops = route.stops.filter(stop => 
            !stop.is_completed && stop.location_latitude && stop.location_longitude
          );
          
          const currentStop = activeStops[0] || route.stops.find(stop => 
            stop.location_latitude && stop.location_longitude
          );

          if (currentStop) {
            // Add some random offset to simulate movement
            const latOffset = (Math.random() - 0.5) * 0.001; // ~100m random offset
            const lngOffset = (Math.random() - 0.5) * 0.001;

            return {
              id: `driver_${route.id}`,
              name: route.driver_name || `Driver ${index + 1}`,
              latitude: currentStop.location_latitude! + latOffset,
              longitude: currentStop.location_longitude! + lngOffset,
              vehicle: {
                id: `vehicle_${route.id}`,
                license_plate: `QC${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
                vehicle_type: 'Truck'
              },
              current_route: {
                id: route.id,
                name: route.name,
                stops_completed: route.stops.filter(s => s.is_completed).length,
                total_stops: route.stops.length,
                status: route.status
              },
              last_update: new Date().toISOString(),
              is_active: true
            };
          }
          return null;
        })
        .filter(Boolean) as DriverLocation[];

      setActiveRoutes(routesData);
      setDrivers(simulatedDrivers);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading live data:', error);
      toast.error('Failed to load live tracking data');
    } finally {
      loadingDataRef.current = false;
      if (showLoadingState) setLoading(false);
    }
  }, []); // Remove dependencies to prevent infinite loop

  // Create driver markers - Memoized to prevent infinite loop
  const createDriverMarkers = useCallback((map: google.maps.Map) => {
    // Clear existing driver markers
    driverMarkersRef.current.forEach(marker => marker.setMap(null));

    if (!infoWindow) {
      setInfoWindow(new google.maps.InfoWindow());
    }

    const newMarkers: google.maps.Marker[] = [];
    const markerIcons = createMarkerIcons();

    drivers.forEach(driver => {
      const marker = new google.maps.Marker({
        position: { lat: driver.latitude, lng: driver.longitude },
        map,
        title: `Driver: ${driver.name}`,
        icon: markerIcons.driver,
        zIndex: 1000 // Ensure drivers appear above other markers
      });

      // Add click listener
      marker.addListener('click', () => {
        if (infoWindow) {
          infoWindow.setContent(createDriverInfoWindowContent(driver));
          infoWindow.open(map, marker);
        }
      });

      newMarkers.push(marker);
    });

    driverMarkersRef.current = newMarkers;
  }, [drivers, infoWindow]);

  // Create route stop markers - Memoized to prevent infinite loop
  const createRouteMarkers = useCallback((map: google.maps.Map) => {
    // Clear existing route markers
    routeMarkersRef.current.forEach(marker => marker.setMap(null));

    const newMarkers: google.maps.Marker[] = [];
    const markerIcons = createMarkerIcons();

    activeRoutes.forEach(route => {
      route.stops
        .filter(stop => stop.location_latitude && stop.location_longitude)
        .forEach(stop => {
          const marker = new google.maps.Marker({
            position: {
              lat: stop.location_latitude!,
              lng: stop.location_longitude!
            },
            map,
            title: `${route.name} - Stop ${stop.sequence_number}`,
            icon: stop.is_completed ? markerIcons.completed : markerIcons.farmer,
            label: {
              text: stop.sequence_number.toString(),
              color: 'white',
              fontWeight: 'bold',
              fontSize: '10px'
            }
          });

          // Add click listener
          marker.addListener('click', () => {
            if (infoWindow) {
              infoWindow.setContent(createStopInfoWindowContent(stop));
              infoWindow.open(map, marker);
            }
          });

          newMarkers.push(marker);
        });
    });

    routeMarkersRef.current = newMarkers;
  }, [activeRoutes, infoWindow]);

  // Create route paths - Memoized to prevent infinite loop
  const createRoutePaths = useCallback((map: google.maps.Map) => {
    // Clear existing paths
    routePathsRef.current.forEach(path => path.setMap(null));

    const newPaths: google.maps.Polyline[] = [];

    activeRoutes.forEach(route => {
      const routePoints = route.stops
        .filter(stop => stop.location_latitude && stop.location_longitude)
        .sort((a, b) => a.sequence_number - b.sequence_number)
        .map(stop => ({
          lat: stop.location_latitude!,
          lng: stop.location_longitude!
        }));

      if (routePoints.length > 1) {
        const routePath = new google.maps.Polyline({
          path: routePoints,
          geodesic: true,
          strokeColor: getRouteColor(route.status),
          strokeOpacity: 0.6,
          strokeWeight: 3,
        });

        routePath.setMap(map);
        newPaths.push(routePath);
      }
    });

    routePathsRef.current = newPaths;
  }, [activeRoutes]);

  // Handle map load - Memoized to prevent infinite loop
  const handleMapLoad = useCallback(() => {
    loadLiveData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- Intentionally removed loadLiveData to prevent infinite loop

  // Update map when data changes
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map && !loading) {
      createDriverMarkers(map);
      createRouteMarkers(map);
      createRoutePaths(map);

      // Fit bounds to show all drivers and routes
      if (drivers.length > 0 || activeRoutes.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        
        // Add driver positions to bounds
        drivers.forEach(driver => {
          bounds.extend({ lat: driver.latitude, lng: driver.longitude });
        });

        // Add route stops to bounds
        activeRoutes.forEach(route => {
          route.stops
            .filter(stop => stop.location_latitude && stop.location_longitude)
            .forEach(stop => {
              bounds.extend({
                lat: stop.location_latitude!,
                lng: stop.location_longitude!
              });
            });
        });

        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, 50);
        }
      }
    }
  }, [drivers, activeRoutes, loading, createDriverMarkers, createRouteMarkers, createRoutePaths]);

  // Auto-refresh effect - use stable reference to prevent constant restarts
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadLiveData(false); // Don't show loading state for auto-refresh
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]); // eslint-disable-line react-hooks/exhaustive-deps -- Intentionally removed loadLiveData to prevent infinite loop

  // Cleanup effect on unmount
  useEffect(() => {
    return () => {
      // Cleanup markers and paths on unmount
      driverMarkersRef.current.forEach(marker => {
        marker.setMap(null);
        google.maps.event.clearInstanceListeners(marker);
      });
      driverMarkersRef.current = [];
      
      routeMarkersRef.current.forEach(marker => {
        marker.setMap(null);
        google.maps.event.clearInstanceListeners(marker);
      });
      routeMarkersRef.current = [];
      
      routePathsRef.current.forEach(path => path.setMap(null));
      routePathsRef.current = [];
      
      if (infoWindow) {
        infoWindow.close();
      }
    };
  }, [infoWindow]);

  // Calculate stats
  const totalDrivers = drivers.length;
  const activeDrivers = drivers.filter(d => d.is_active).length;
  const totalStops = activeRoutes.reduce((sum, route) => sum + route.stops.length, 0);
  const completedStops = activeRoutes.reduce((sum, route) => 
    sum + route.stops.filter(stop => stop.is_completed).length, 0
  );

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Live Tracking Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Navigation2 className="h-5 w-5 text-green-600" />
              <CardTitle className="text-lg">Live Tracking</CardTitle>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                Live
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                {autoRefresh ? 'Pause Auto-refresh' : 'Resume Auto-refresh'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadLiveData(true)}
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
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">
                {activeDrivers}/{totalDrivers} drivers active
              </span>
            </div>
            <div className="flex items-center gap-2">
              <RouteIcon className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">
                {activeRoutes.length} active routes
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">
                {completedStops}/{totalStops} stops completed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">
                {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : 'Never updated'}
              </span>
            </div>
          </div>

          {/* Active Routes Summary */}
          {activeRoutes.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Active Routes</h4>
              <div className="grid gap-2">
                {activeRoutes.map(route => {
                  const progress = route.stops.length > 0 
                    ? (route.stops.filter(s => s.is_completed).length / route.stops.length) * 100 
                    : 0;

                  return (
                    <div key={route.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {route.name}
                        </Badge>
                        {route.driver_name && (
                          <span className="text-xs text-gray-600">
                            {route.driver_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-600 min-w-0">
                          {Math.round(progress)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Map */}
      <Card>
        <CardContent className="p-0">
          <GoogleMap
            ref={mapRef}
            center={{ lat: 45.5017, lng: -73.5673 }} // Montreal default
            zoom={10}
            height={height}
            onMapLoad={handleMapLoad}
            className="rounded-lg overflow-hidden"
          />
        </CardContent>
      </Card>

      {/* No Active Routes Warning */}
      {!loading && activeRoutes.length === 0 && (
        <Card className="border-gray-200 bg-gray-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="text-gray-400 mt-0.5">
                <AlertCircle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  No active routes found
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  There are currently no active delivery routes to track. 
                  Routes will appear here once they are activated.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
