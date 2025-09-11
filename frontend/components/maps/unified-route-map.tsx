'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
// Removed GoogleMap component - using direct initialization instead
import { routeAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { 
  createDriverInfoWindowContent, 
  createStopInfoWindowContent,
  getRouteColor,
  decodePolyline
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
  Route as RouteIcon,
  MapPin,
  Play,
  Pause,
  Zap
} from 'lucide-react';

interface VehicleLocation {
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
  heading?: number; // Direction in degrees
  speed?: number; // Speed in km/h
}

interface RouteStop {
  id: string;
  farmer: {
    id: string;
    name: string;
    address: string;
  };
  order: {
    id: string;
    order_number: string;
    quantity: number;
  };
  sequence_number: number;
  location_latitude?: number;
  location_longitude?: number;
  estimated_arrival_time?: string;
  is_completed: boolean;
  actual_arrival_time?: string;
  delivery_notes?: string;
}

interface Route {
  id: string;
  name: string;
  date: string;
  status: 'draft' | 'planned' | 'active' | 'completed' | 'cancelled';
  route_type: string;
  total_distance?: number;
  estimated_duration?: number;
  stops: RouteStop[];
  waypoints?: Array<{ lat: number; lng: number; stop_id: string }>;
  driver_name?: string;
}

interface UnifiedRouteMapProps {
  routeId?: string;
  showLiveTracking?: boolean;
  showDirections?: boolean;
  height?: string;
  refreshInterval?: number; // in seconds
  className?: string;
  onRouteOptimized?: () => void;
}

export function UnifiedRouteMap({
  routeId,
  showLiveTracking = true,
  showDirections = true,
  refreshInterval = 30,
  className = '',
  onRouteOptimized
}: UnifiedRouteMapProps) {
  
  const mapRef = useRef<google.maps.Map | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [route, setRoute] = useState<Route | null>(null);
  const [vehicles, setVehicles] = useState<VehicleLocation[]>([]);
  const [directions, setDirections] = useState<{ overview_polyline: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDirections, setLoadingDirections] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [liveTrackingActive, setLiveTrackingActive] = useState(showLiveTracking);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Map state - use regular Markers for better compatibility
  const stopMarkersRef = useRef<google.maps.Marker[]>([]);
  const vehicleMarkersRef = useRef<google.maps.Marker[]>([]);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const [infoWindow, setInfoWindow] = useState<google.maps.InfoWindow | null>(null);
  
  // Refs to prevent infinite loops
  const loadingDataRef = useRef(false);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentRouteIdRef = useRef<string | null>(null);
  
  // Load route data
  const loadRouteData = useCallback(async (showLoadingState = true) => {
    if (loadingDataRef.current || !routeId) return;
    
    try {
      loadingDataRef.current = true;
      if (showLoadingState) setLoading(true);
      
      // Load route details
      const routeData = await routeAPI.getRoute(routeId);
      setRoute(routeData);
      
      // If live tracking is active, get real vehicle locations
      if (liveTrackingActive && routeData.status === 'active') {
        const liveVehicles = await getLiveVehicleLocations([routeData.id]);
        setVehicles(liveVehicles);
      } else {
        setVehicles([]);
      }
      
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading route data:', error);
      toast.error('Failed to load route data');
    } finally {
      loadingDataRef.current = false;
      if (showLoadingState) setLoading(false);
    }
  }, [routeId, liveTrackingActive]);
  
  // Get live vehicle locations from API
  const getLiveVehicleLocations = async (routeIds?: string[]): Promise<VehicleLocation[]> => {
    try {
      const response = await routeAPI.getLiveTracking(routeIds);
      return response.vehicles || [];
    } catch (error) {
      console.error('Error fetching live vehicle locations:', error);
      return [];
    }
  };
  
  // Load directions for the route
  const loadDirections = useCallback(async () => {
    if (!route || !showDirections || route.stops.length < 2) return;
    
    try {
      setLoadingDirections(true);
      const directionsData = await routeAPI.getRouteDirections(route.id);
      setDirections(directionsData.directions);
    } catch (error) {
      console.error('Error loading directions:', error);
      toast.error('Failed to load route directions');
    } finally {
      setLoadingDirections(false);
    }
  }, [route, showDirections]);
  
  // Optimize route
  const optimizeRoute = async () => {
    if (!route) return;
    
    try {
      setOptimizing(true);
      await routeAPI.optimizeRoute(parseInt(route.id), 'balanced');
      toast.success('Route optimized successfully');
      onRouteOptimized?.();
      
      // Reload route data
      await loadRouteData(false);
      
      // Reload directions after optimization
      if (showDirections) {
        await loadDirections();
      }
    } catch (error) {
      console.error('Error optimizing route:', error);
      toast.error('Failed to optimize route');
    } finally {
      setOptimizing(false);
    }
  };
  
  // Create stop markers
  const createStopMarkers = useCallback((map: google.maps.Map) => {
    if (!route) return;
    
    // Clear existing markers
    stopMarkersRef.current.forEach(marker => marker.setMap(null));
    
    const newMarkers: google.maps.Marker[] = [];
    const currentInfoWindow = infoWindow || new google.maps.InfoWindow();
    
    if (!infoWindow) {
      setInfoWindow(currentInfoWindow);
    }
    
    route.stops
      .filter(stop => stop.location_latitude && stop.location_longitude)
      .forEach((stop) => {
        const lat = typeof stop.location_latitude === 'number' 
          ? stop.location_latitude 
          : parseFloat((stop.location_latitude as unknown) as string);
        const lng = typeof stop.location_longitude === 'number' 
          ? stop.location_longitude 
          : parseFloat((stop.location_longitude as unknown) as string);
          
        // Skip markers with invalid coordinates
        if (isNaN(lat) || isNaN(lng)) {
          console.warn(`Invalid coordinates for stop ${stop.sequence_number}:`, {lat: stop.location_latitude, lng: stop.location_longitude});
          return;
        }
        
        const marker = new google.maps.Marker({
          position: { lat, lng },
          map,
          title: `Stop ${stop.sequence_number}: ${stop.farmer.name}`,
          label: {
            text: stop.sequence_number.toString(),
            color: 'white',
            fontWeight: 'bold',
            fontSize: '12px'
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: stop.is_completed ? '#16a34a' : '#2563eb',
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 2
          }
        });
        
        marker.addListener('click', () => {
          currentInfoWindow.setContent(createStopInfoWindowContent(stop));
          currentInfoWindow.open(map, marker);
        });
        
        newMarkers.push(marker);
      });
    
    stopMarkersRef.current = newMarkers;
  }, [route, infoWindow]);
  
  // Create vehicle markers
  const createVehicleMarkers = useCallback((map: google.maps.Map) => {
    if (!liveTrackingActive) return;
    
    // Clear existing vehicle markers
    vehicleMarkersRef.current.forEach(marker => marker.setMap(null));
    
    const newMarkers: google.maps.Marker[] = [];
    const currentInfoWindow = infoWindow || new google.maps.InfoWindow();
    
    vehicles.forEach(vehicle => {
      const lat = typeof vehicle.latitude === 'number' 
        ? vehicle.latitude 
        : parseFloat((vehicle.latitude as unknown) as string);
      const lng = typeof vehicle.longitude === 'number' 
        ? vehicle.longitude 
        : parseFloat((vehicle.longitude as unknown) as string);
        
      // Skip markers with invalid coordinates
      if (isNaN(lat) || isNaN(lng)) {
        console.warn(`Invalid coordinates for vehicle ${vehicle.name}:`, {lat: vehicle.latitude, lng: vehicle.longitude});
        return;
      }
      
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map,
        title: `Vehicle: ${vehicle.name}`,
        icon: {
          path: 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z',
          fillColor: '#dc2626',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2,
          scale: 1
        },
        label: {
          text: '🚚',
          fontSize: '16px'
        },
        zIndex: 1000
      });
      
      marker.addListener('click', () => {
        currentInfoWindow.setContent(createDriverInfoWindowContent(vehicle));
        currentInfoWindow.open(map, marker);
      });
      
      newMarkers.push(marker);
    });
    
    vehicleMarkersRef.current = newMarkers;
  }, [vehicles, liveTrackingActive, infoWindow]);
  
  // Create route polyline
  const createRoutePolyline = useCallback((map: google.maps.Map) => {
    // Clear existing polyline
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }
    
    if (directions && directions.overview_polyline) {
      // Use directions polyline
      const path = decodePolyline(directions.overview_polyline);
      
      const polyline = new google.maps.Polyline({
        path: path
          .map(point => ({
            lat: typeof point.lat === 'number' ? point.lat : parseFloat((point.lat as unknown) as string),
            lng: typeof point.lng === 'number' ? point.lng : parseFloat((point.lng as unknown) as string)
          }))
          .filter(point => !isNaN(point.lat) && !isNaN(point.lng)),
        geodesic: true,
        strokeColor: getRouteColor(route?.status || 'planned'),
        strokeOpacity: 0.8,
        strokeWeight: 4,
      });
      
      polyline.setMap(map);
      routePolylineRef.current = polyline;
    } else if (route && route.stops.length > 1) {
      // Create simple polyline connecting stops
      const path = route.stops
        .filter(stop => stop.location_latitude && stop.location_longitude)
        .sort((a, b) => a.sequence_number - b.sequence_number)
        .map(stop => {
          const lat = typeof stop.location_latitude === 'number' 
            ? stop.location_latitude 
            : parseFloat((stop.location_latitude as unknown) as string);
          const lng = typeof stop.location_longitude === 'number' 
            ? stop.location_longitude 
            : parseFloat((stop.location_longitude as unknown) as string);
          return { lat, lng };
        })
        .filter(point => !isNaN(point.lat) && !isNaN(point.lng));
      
      if (path.length > 1) {
        const polyline = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: getRouteColor(route.status),
          strokeOpacity: 0.6,
          strokeWeight: 3,
        });
        
        polyline.setMap(map);
        routePolylineRef.current = polyline;
      }
    }
  }, [directions, route]);
  
  
  // Simple Google Maps initialization
  useEffect(() => {
    const initializeMap = async () => {
      try {
        const mapContainer = document.getElementById('google-map-container');
        if (!mapContainer) return;

        const { loadGoogleMaps } = await import('@/lib/google-maps');
        const googleMaps = await loadGoogleMaps();
        
        // Ensure Google Maps API is fully loaded
        if (!googleMaps?.maps?.Map) {
          throw new Error('Google Maps API not fully loaded');
        }
        
        // Use default center for initialization, will be updated when route loads
        const map = new googleMaps.maps.Map(mapContainer, {
          center: { lat: 45.5017, lng: -73.5673 }, // Montreal default
          zoom: 8,
          mapTypeId: googleMaps.maps.MapTypeId.ROADMAP,
        });

        // Store map reference for other functions to use
        mapRef.current = map;
        setMapInitialized(true);
        
      } catch (error) {
        console.error('Map initialization failed:', error);
      }
    };

    initializeMap();
  }, []);

  // Initial data load when routeId changes
  useEffect(() => {
    if (routeId && currentRouteIdRef.current !== routeId) {
      currentRouteIdRef.current = routeId;
      loadRouteData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);
  
  // Update map when data changes - Simplified to prevent infinite loops
  useEffect(() => {
    const map = mapRef.current;
    if (map && !loading && route) {
      createStopMarkers(map);
      createVehicleMarkers(map);
      createRoutePolyline(map);
      
      // Fit bounds to show all markers
      const bounds = new google.maps.LatLngBounds();
      let hasPoints = false;
      
      // Add stop positions to bounds
      route.stops
        .filter(stop => stop.location_latitude && stop.location_longitude)
        .forEach(stop => {
          const lat = typeof stop.location_latitude === 'number' 
            ? stop.location_latitude 
            : parseFloat((stop.location_latitude as unknown) as string);
          const lng = typeof stop.location_longitude === 'number' 
            ? stop.location_longitude 
            : parseFloat((stop.location_longitude as unknown) as string);
          
          if (!isNaN(lat) && !isNaN(lng)) {
            bounds.extend({ lat, lng });
            hasPoints = true;
          }
        });
      
      // Add vehicle positions to bounds
      vehicles.forEach(vehicle => {
        const lat = typeof vehicle.latitude === 'number' 
          ? vehicle.latitude 
          : parseFloat((vehicle.latitude as unknown) as string);
        const lng = typeof vehicle.longitude === 'number' 
          ? vehicle.longitude 
          : parseFloat((vehicle.longitude as unknown) as string);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          bounds.extend({ lat, lng });
          hasPoints = true;
        }
      });
      
      if (hasPoints && !bounds.isEmpty()) {
        map.fitBounds(bounds, 50);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.id, vehicles.length, loading]);
  
  // Smart auto-refresh for live tracking
  useEffect(() => {
    if (!liveTrackingActive || !routeId || !route) {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      return;
    }
    
    // Only poll active routes
    if (route.status === 'active') {
      refreshIntervalRef.current = setInterval(() => {
        if (!loadingDataRef.current) {
          loadRouteData(false);
        }
      }, Math.max(refreshInterval * 1000, 30000)); // Minimum 30 seconds
    }
    
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps  
  }, [liveTrackingActive, routeId, route?.status, refreshInterval]);
  
  // Load directions when route is loaded
  useEffect(() => {
    if (route && showDirections && route.stops.length >= 2) {
      loadDirections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.id, showDirections]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear intervals
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      
      // Clear markers
      stopMarkersRef.current.forEach(marker => {
        marker.setMap(null);
        google.maps.event.clearInstanceListeners(marker);
      });
      vehicleMarkersRef.current.forEach(marker => {
        marker.setMap(null);
        google.maps.event.clearInstanceListeners(marker);
      });
      
      // Clear polyline
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }
      
      // Clear info window
      if (infoWindow) {
        infoWindow.close();
      }
    };
  }, [infoWindow]);
  
  
  if (!routeId) {
    return (
      <div className={`space-y-4 ${className}`}>
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center">
              <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No route selected</h3>
              <p className="text-sm text-gray-600">
                Select a route to view it on the map with live tracking.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const completedStops = route?.stops.filter(stop => stop.is_completed).length || 0;
  const totalStops = route?.stops.length || 0;
  const progress = totalStops > 0 ? (completedStops / totalStops) * 100 : 0;
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Route Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RouteIcon className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">
                {route?.name || 'Loading...'}
              </CardTitle>
              {route?.status && (
                <Badge variant={route.status === 'active' ? 'default' : 'secondary'}>
                  {route.status}
                </Badge>
              )}
              {liveTrackingActive && route?.status === 'active' && (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                  Live Tracking
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              {showLiveTracking && route?.status === 'active' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLiveTrackingActive(!liveTrackingActive)}
                >
                  {liveTrackingActive ? (
                    <><Pause className="h-4 w-4 mr-2" />Pause Live</>
                  ) : (
                    <><Play className="h-4 w-4 mr-2" />Start Live</>
                  )}
                </Button>
              )}
              {showDirections && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadDirections}
                  disabled={loadingDirections || !route || route.stops.length < 2}
                >
                  {loadingDirections ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Navigation2 className="h-4 w-4" />
                  )}
                  Directions
                </Button>
              )}
              {route?.status === 'planned' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={optimizeRoute}
                  disabled={optimizing || !route || route.stops.length < 2}
                >
                  {optimizing ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Optimize
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadRouteData(true)}
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
              <MapPin className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">
                {totalStops} stops
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">
                {completedStops} completed
              </span>
            </div>
            {route?.total_distance && (
              <div className="flex items-center gap-2">
                <RouteIcon className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">
                  {route.total_distance} km
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">
                {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : 'Never updated'}
              </span>
            </div>
          </div>
          
          {/* Progress bar */}
          {route?.status === 'active' && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span>Route Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                ></div>
              </div>
            </div>
          )}
          
          {/* Status indicators */}
          <div className="mt-3 flex gap-2">
            {loadingDirections && (
              <Badge variant="outline" className="text-xs">
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Loading directions...
              </Badge>
            )}
            {directions && (
              <Badge variant="outline" className="text-xs text-green-600">
                <CheckCircle className="h-3 w-3 mr-1" />
                Directions loaded
              </Badge>
            )}
            {optimizing && (
              <Badge variant="outline" className="text-xs">
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Optimizing route...
              </Badge>
            )}
            {vehicles.length > 0 && (
              <Badge variant="outline" className="text-xs text-blue-600">
                <Truck className="h-3 w-3 mr-1" />
                {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} tracked
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Map */}
      <Card>
        <CardContent className="p-0">
          <div className="w-full h-[600px] bg-gray-100 relative rounded-lg overflow-hidden">
            {!mapInitialized ? (
              /* Loading state that actually works */
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <div className="text-gray-600 text-sm">Loading Google Maps...</div>
                  <div className="text-xs text-gray-500 mt-2">
                    Connecting to backend services...
                  </div>
                </div>
              </div>
            ) : null}
            
            {/* The actual map div */}
            <div 
              id="google-map-container"
              className="w-full h-full"
            />
          </div>
        </CardContent>
      </Card>
      
      {/* No route data warning */}
      {!loading && !route && (
        <Card className="border-gray-200 bg-gray-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Route not found
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  The requested route could not be loaded. It may have been deleted or you may not have permission to view it.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}