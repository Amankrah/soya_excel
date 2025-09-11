'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleMap, GoogleMapRef } from '@/components/ui/google-map';
import { routeAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { 
  createMarkerIcons, 
  createStopInfoWindowContent, 
  decodePolyline,
  getRouteColor,
  formatDistance,
  formatDuration 
} from '@/lib/google-maps';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Navigation, 
  MapPin, 
  Clock, 
  Truck, 
  RefreshCw,
  Zap,
  CheckCircle,
  Route as RouteIcon
} from 'lucide-react';

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
}

interface Route {
  id: string;
  name: string;
  date: string;
  status: 'draft' | 'planned' | 'active' | 'completed' | 'cancelled';
  total_distance?: number;
  estimated_duration?: number;
  stops: RouteStop[];
  waypoints?: Array<{ lat: number; lng: number; stop_id: string }>;
  optimized_sequence?: string[];
}

interface RouteDirections {
  legs: Array<{
    leg_index: number;
    start_address: string;
    end_address: string;
    distance: string;
    duration: string;
    steps: Array<{
      instruction: string;
      distance: string;
      duration: string;
      start_location: { lat: number; lng: number };
      end_location: { lat: number; lng: number };
    }>;
  }>;
  overview_polyline: string;
  summary: string;
  waypoint_order: number[];
}

interface RouteMapProps {
  route: Route;
  showDirections?: boolean;
  showOptimizeButton?: boolean;
  onRouteOptimized?: () => void;
  height?: string;
  className?: string;
}

export function RouteMap({ 
  route, 
  showDirections = true, 
  showOptimizeButton = false,
  onRouteOptimized,
  height = '500px',
  className = ''
}: RouteMapProps) {
  const mapRef = useRef<GoogleMapRef>(null);
  const [directions, setDirections] = useState<RouteDirections | null>(null);
  const [loadingDirections, setLoadingDirections] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [routePolyline, setRoutePolyline] = useState<google.maps.Polyline | null>(null);
  const [infoWindow, setInfoWindow] = useState<google.maps.InfoWindow | null>(null);
  const [hasLoadedDirections, setHasLoadedDirections] = useState(false);

  // Reset directions loading flag when route changes
  useEffect(() => {
    setHasLoadedDirections(false);
    setDirections(null);
  }, [route.id]);

  // Calculate map center from route stops
  const getMapCenter = () => {
    const stopsWithCoords = route.stops.filter(stop => 
      stop.location_latitude && stop.location_longitude
    );
    
    if (stopsWithCoords.length === 0) {
      return { lat: 45.5017, lng: -73.5673 }; // Default to Montreal
    }

    if (stopsWithCoords.length === 1) {
      return {
        lat: stopsWithCoords[0].location_latitude!,
        lng: stopsWithCoords[0].location_longitude!
      };
    }

    // Calculate center of all stops
    const totalLat = stopsWithCoords.reduce((sum, stop) => sum + stop.location_latitude!, 0);
    const totalLng = stopsWithCoords.reduce((sum, stop) => sum + stop.location_longitude!, 0);

    return {
      lat: totalLat / stopsWithCoords.length,
      lng: totalLng / stopsWithCoords.length
    };
  };

  // Add refs to prevent multiple simultaneous direction loads and track state
  const loadingDirectionsRef = useRef(false);
  const hasLoadedDirectionsRef = useRef(hasLoadedDirections);
  const loadingDirectionsStateRef = useRef(loadingDirections);
  const routeIdRef = useRef(route.id);
  const routeStopsLengthRef = useRef(route.stops.length);
  const showDirectionsRef = useRef(showDirections);
  
  // Update refs when values change
  hasLoadedDirectionsRef.current = hasLoadedDirections;
  loadingDirectionsStateRef.current = loadingDirections;
  routeIdRef.current = route.id;
  routeStopsLengthRef.current = route.stops.length;
  showDirectionsRef.current = showDirections;

  // Load directions for the route - Memoized to prevent infinite loop
  const loadDirections = useCallback(async () => {
    if (routeStopsLengthRef.current < 2) {
      toast.error('Route must have at least 2 stops to show directions');
      return;
    }
    
    if (hasLoadedDirectionsRef.current || loadingDirectionsStateRef.current || loadingDirectionsRef.current) {
      return; // Prevent multiple loads
    }

    try {
      loadingDirectionsRef.current = true;
      setLoadingDirections(true);
      setHasLoadedDirections(true);
      const directionsData = await routeAPI.getRouteDirections(routeIdRef.current);
      setDirections(directionsData.directions);
    } catch (error) {
      console.error('Error loading directions:', error);
      toast.error('Failed to load route directions');
      setHasLoadedDirections(false); // Allow retry on error
    } finally {
      loadingDirectionsRef.current = false;
      setLoadingDirections(false);
    }
  }, []); // Intentionally removed dependencies to prevent infinite loop

  // Optimize the route
  const optimizeRoute = async () => {
    try {
      setOptimizing(true);
      await routeAPI.optimizeRoute(parseInt(route.id), 'balanced');
      toast.success('Route optimized successfully');
      onRouteOptimized?.();
      
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

  // Create markers for route stops - Memoized to prevent infinite loop
  const createMarkers = useCallback((map: google.maps.Map) => {
    // Clear existing markers first
    markersRef.current.forEach(marker => {
      marker.setMap(null);
      google.maps.event.clearInstanceListeners(marker);
    });

    const newMarkers: google.maps.Marker[] = [];
    const markerIcons = createMarkerIcons();
    const currentInfoWindow = infoWindow || new google.maps.InfoWindow();
    
    if (!infoWindow) {
      setInfoWindow(currentInfoWindow);
    }

    const stopsWithCoords = route.stops.filter(stop => 
      stop.location_latitude && stop.location_longitude
    );

    stopsWithCoords.forEach((stop) => {
      const position = {
        lat: stop.location_latitude!,
        lng: stop.location_longitude!
      };

      const marker = new google.maps.Marker({
        position,
        map,
        title: `Stop ${stop.sequence_number}: ${stop.farmer.name}`,
        icon: stop.is_completed ? markerIcons.completed : markerIcons.pending,
        label: {
          text: stop.sequence_number.toString(),
          color: 'white',
          fontWeight: 'bold',
          fontSize: '12px'
        }
      });

      // Add click listener for info window
      marker.addListener('click', () => {
        currentInfoWindow.setContent(createStopInfoWindowContent(stop));
        currentInfoWindow.open(map, marker);
      });

      newMarkers.push(marker);
    });

    // Update markers ref
    markersRef.current = newMarkers;

    // Fit map to show all markers
    if (newMarkers.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      newMarkers.forEach(marker => {
        const position = marker.getPosition();
        if (position) {
          bounds.extend(position);
        }
      });
      
      // Add some padding to bounds
      map.fitBounds(bounds, 50);
    }
  }, [route.stops, infoWindow]);


  // Handle map load - Memoized to prevent infinite loop
  const handleMapLoad = useCallback((map: google.maps.Map) => {
    createMarkers(map);
    
    if (showDirectionsRef.current && !hasLoadedDirectionsRef.current && !loadingDirectionsStateRef.current && !loadingDirectionsRef.current && routeStopsLengthRef.current >= 2) {
      loadDirections();
    }
  }, [createMarkers]); // eslint-disable-line react-hooks/exhaustive-deps -- Intentionally removed dependencies to prevent infinite loop

  // Effect to display directions when they're loaded
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map && directions && directions.overview_polyline) {
      // Clear existing polyline
      if (routePolyline) {
        routePolyline.setMap(null);
        setRoutePolyline(null);
      }

      // Decode the polyline and create a path
      const path = decodePolyline(directions.overview_polyline);
      
      const newPolyline = new google.maps.Polyline({
        path: path.map(point => ({ lat: point.lat, lng: point.lng })),
        geodesic: true,
        strokeColor: getRouteColor(route.status),
        strokeOpacity: 0.8,
        strokeWeight: 4,
      });

      newPolyline.setMap(map);
      setRoutePolyline(newPolyline);
    }
  }, [directions, route.status]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: routePolyline intentionally excluded to prevent infinite loop

  // Cleanup effect on unmount
  useEffect(() => {
    return () => {
      // Cleanup markers on unmount
      markersRef.current.forEach(marker => {
        marker.setMap(null);
        google.maps.event.clearInstanceListeners(marker);
      });
      markersRef.current = [];
      
      // Cleanup polyline
      if (routePolyline) {
        routePolyline.setMap(null);
      }
      
      // Cleanup info window
      if (infoWindow) {
        infoWindow.close();
      }
    };
  }, [routePolyline, infoWindow]);

  const stopsWithCoords = route.stops.filter(stop => 
    stop.location_latitude && stop.location_longitude
  );

  // Check if route has valid stops
  if (route.stops.length === 0) {
    return (
      <div className={`space-y-4 ${className}`}>
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center">
              <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No stops in route</h3>
              <p className="text-sm text-gray-600">
                This route doesn&apos;t have any stops yet. Add stops to view the route on the map.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Route Info Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RouteIcon className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">{route.name}</CardTitle>
              <Badge variant={route.status === 'active' ? 'default' : 'secondary'}>
                {route.status}
              </Badge>
            </div>
            <div className="flex gap-2">
              {showDirections && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadDirections}
                  disabled={loadingDirections || stopsWithCoords.length < 2}
                  title={stopsWithCoords.length < 2 ? 'Need at least 2 stops with coordinates' : ''}
                >
                  {loadingDirections ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Navigation className="h-4 w-4" />
                  )}
                  {loadingDirections ? 'Loading...' : 'Get Directions'}
                </Button>
              )}
              {showOptimizeButton && route.status === 'planned' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={optimizeRoute}
                  disabled={optimizing || stopsWithCoords.length < 2}
                  title={stopsWithCoords.length < 2 ? 'Need at least 2 stops with coordinates' : ''}
                >
                  {optimizing ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  {optimizing ? 'Optimizing...' : 'Optimize Route'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">
                {route.stops.length} stops
                {stopsWithCoords.length !== route.stops.length && (
                  <span className="text-orange-500 ml-1">
                    ({stopsWithCoords.length} mapped)
                  </span>
                )}
              </span>
            </div>
            {route.total_distance && (
              <div className="flex items-center gap-2">
                <RouteIcon className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">
                  {formatDistance(route.total_distance)}
                </span>
              </div>
            )}
            {route.estimated_duration && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">
                  {formatDuration(route.estimated_duration)}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">
                {new Date(route.date).toLocaleDateString()}
              </span>
            </div>
          </div>
          
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
          </div>
          
          {directions && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Route Summary:</strong> {directions.summary}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Map */}
      <Card>
        <CardContent className="p-0">
          <GoogleMap
            ref={mapRef}
            center={getMapCenter()}
            zoom={12}
            height={height}
            onMapLoad={handleMapLoad}
            className="rounded-lg overflow-hidden"
          />
        </CardContent>
      </Card>

      {/* Warning for missing coordinates */}
      {stopsWithCoords.length !== route.stops.length && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="text-orange-600 mt-0.5">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-orange-800">
                  Some stops are missing coordinates
                </p>
                <p className="text-xs text-orange-600 mt-1">
                  {route.stops.length - stopsWithCoords.length} out of {route.stops.length} stops 
                  don&apos;t have valid coordinates. These stops won&apos;t appear on the map.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
