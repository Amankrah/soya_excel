'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
// Removed GoogleMap component - using direct initialization instead
import { routeAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';
import {
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
  Route as RouteIcon,
  MapPin,
  Play,
  Pause,
  Zap,
  Share2,
  Copy,
  Check
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
  client: {
    id: number;
    name: string;
    full_address: string;
    city?: string | null;
    country?: string | null;
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
  location_latitude?: number | null;
  location_longitude?: number | null;
  estimated_arrival_time?: string | null;
  is_completed: boolean;
  actual_arrival_time?: string | null;
  delivery_notes?: string | null;
}

interface Warehouse {
  id: number;
  name: string;
  code: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  has_coordinates: boolean;
  full_address: string;
  is_primary: boolean;
  is_active: boolean;
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
  origin_warehouse?: Warehouse | null;
  destination_warehouse?: Warehouse | null;
  return_to_warehouse: boolean;
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
  const [directions, setDirections] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDirections, setLoadingDirections] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [liveTrackingActive, setLiveTrackingActive] = useState(showLiveTracking);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Map state - use regular Markers for better compatibility
  const stopMarkersRef = useRef<google.maps.Marker[]>([]);
  const vehicleMarkersRef = useRef<google.maps.Marker[]>([]);
  const warehouseMarkersRef = useRef<google.maps.Marker[]>([]);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
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
  
  // Optimization menu state
  const [showOptimizeMenu, setShowOptimizeMenu] = useState(false);

  // Generate shareable Google Maps link
  const generateShareableLink = useCallback(() => {
    if (!route || route.stops.length === 0) return null;

    // Get warehouse coordinates
    const warehouse = route.origin_warehouse;
    if (!warehouse?.has_coordinates) return null;

    // Build waypoints array: warehouse -> stops (-> warehouse if return)
    const waypoints: string[] = [];

    // Start at warehouse
    const origin = `${warehouse.latitude},${warehouse.longitude}`;

    // Add all stops as waypoints
    route.stops.forEach((stop) => {
      const lat = stop.location_latitude ?? stop.client.latitude;
      const lng = stop.location_longitude ?? stop.client.longitude;
      if (lat && lng) {
        waypoints.push(`${lat},${lng}`);
      }
    });

    // Determine destination
    let destination: string;
    if (route.return_to_warehouse) {
      const destWarehouse = route.destination_warehouse || warehouse;
      destination = `${destWarehouse.latitude},${destWarehouse.longitude}`;
    } else {
      // Last stop is destination
      destination = waypoints.pop() || origin;
    }

    // Build Google Maps URL
    // Format: https://www.google.com/maps/dir/?api=1&origin=LAT,LNG&destination=LAT,LNG&waypoints=LAT1,LNG1|LAT2,LNG2&travelmode=driving
    const baseUrl = 'https://www.google.com/maps/dir/';
    const params = new URLSearchParams({
      api: '1',
      origin,
      destination,
      travelmode: 'driving'
    });

    if (waypoints.length > 0) {
      params.append('waypoints', waypoints.join('|'));
    }

    return `${baseUrl}?${params.toString()}`;
  }, [route]);

  // Copy shareable link to clipboard
  const copyShareableLink = useCallback(async () => {
    const link = generateShareableLink();
    if (!link) {
      toast.error('Cannot generate link - route has no valid coordinates');
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      toast.success('Google Maps link copied to clipboard!');

      // Reset after 3 seconds
      setTimeout(() => {
        setLinkCopied(false);
      }, 3000);
    } catch (error) {
      console.error('Failed to copy link:', error);
      toast.error('Failed to copy link to clipboard');
    }
  }, [generateShareableLink]);

  // Optimize route
  const optimizeRoute = async (type: 'balanced' | 'distance' | 'duration' | 'fuel_cost' | 'co2_emissions' = 'balanced') => {
    if (!route) return;

    try {
      setOptimizing(true);
      await routeAPI.optimizeRoute(parseInt(route.id), type);
      toast.success(`Route optimized using ${type} strategy`);
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
      setShowOptimizeMenu(false);
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
    
    route.stops.forEach((stop) => {
        // Prioritize stop coordinates, fall back to client coordinates
        const rawLat = stop.location_latitude ?? stop.client.latitude;
        const rawLng = stop.location_longitude ?? stop.client.longitude;

        // Skip if no coordinates available
        if (rawLat == null || rawLng == null) {
          console.warn(`No coordinates available for stop ${stop.sequence_number} (${stop.client.name})`);
          return;
        }

        const lat = typeof rawLat === 'number' ? rawLat : parseFloat(String(rawLat));
        const lng = typeof rawLng === 'number' ? rawLng : parseFloat(String(rawLng));

        // Skip markers with invalid coordinates
        if (isNaN(lat) || isNaN(lng)) {
          console.warn(`Invalid coordinates for stop ${stop.sequence_number}:`, {
            stop_coords: {lat: stop.location_latitude, lng: stop.location_longitude},
            client_coords: {lat: stop.client.latitude, lng: stop.client.longitude}
          });
          return;
        }
        
        const marker = new google.maps.Marker({
          position: { lat, lng },
          map,
          title: `Stop ${stop.sequence_number}: ${stop.client.name}`,
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
  
  // Create warehouse markers
  const createWarehouseMarkers = useCallback((map: google.maps.Map) => {
    if (!route) return;

    // Clear existing warehouse markers
    warehouseMarkersRef.current.forEach(marker => marker.setMap(null));

    const newMarkers: google.maps.Marker[] = [];
    const currentInfoWindow = infoWindow || new google.maps.InfoWindow();

    // Add origin warehouse marker
    if (route.origin_warehouse && route.origin_warehouse.has_coordinates) {
      const warehouse = route.origin_warehouse;
      const lat = typeof warehouse.latitude === 'number'
        ? warehouse.latitude
        : parseFloat(String(warehouse.latitude));
      const lng = typeof warehouse.longitude === 'number'
        ? warehouse.longitude
        : parseFloat(String(warehouse.longitude));

      if (!isNaN(lat) && !isNaN(lng)) {
        const marker = new google.maps.Marker({
          position: { lat, lng },
          map,
          title: `Warehouse: ${warehouse.name}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 15,
            fillColor: '#16a34a',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3
          },
          label: {
            text: '🏭',
            fontSize: '20px',
            color: '#ffffff'
          },
          zIndex: 2000
        });

        marker.addListener('click', () => {
          currentInfoWindow.setContent(`
            <div style="padding: 8px; min-width: 200px;">
              <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">
                🏭 ${warehouse.name}
              </h3>
              <div style="font-size: 12px; color: #666;">
                <p style="margin: 4px 0;"><strong>Code:</strong> ${warehouse.code}</p>
                <p style="margin: 4px 0;"><strong>Address:</strong><br/>${warehouse.full_address}</p>
                <p style="margin: 4px 0;"><strong>Type:</strong> Origin Point</p>
              </div>
            </div>
          `);
          currentInfoWindow.open(map, marker);
        });

        newMarkers.push(marker);
      }
    }

    // Add destination warehouse marker if different from origin
    if (route.return_to_warehouse && route.destination_warehouse &&
        route.destination_warehouse.id !== route.origin_warehouse?.id) {
      const warehouse = route.destination_warehouse;
      const lat = typeof warehouse.latitude === 'number'
        ? warehouse.latitude
        : parseFloat(String(warehouse.latitude));
      const lng = typeof warehouse.longitude === 'number'
        ? warehouse.longitude
        : parseFloat(String(warehouse.longitude));

      if (!isNaN(lat) && !isNaN(lng)) {
        const marker = new google.maps.Marker({
          position: { lat, lng },
          map,
          title: `Warehouse: ${warehouse.name}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 15,
            fillColor: '#ea580c',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3
          },
          label: {
            text: '🏭',
            fontSize: '20px',
            color: '#ffffff'
          },
          zIndex: 2000
        });

        marker.addListener('click', () => {
          currentInfoWindow.setContent(`
            <div style="padding: 8px; min-width: 200px;">
              <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">
                🏭 ${warehouse.name}
              </h3>
              <div style="font-size: 12px; color: #666;">
                <p style="margin: 4px 0;"><strong>Code:</strong> ${warehouse.code}</p>
                <p style="margin: 4px 0;"><strong>Address:</strong><br/>${warehouse.full_address}</p>
                <p style="margin: 4px 0;"><strong>Type:</strong> Destination Point</p>
              </div>
            </div>
          `);
          currentInfoWindow.open(map, marker);
        });

        newMarkers.push(marker);
      }
    }

    warehouseMarkersRef.current = newMarkers;
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
  
  // Create route polyline using Google DirectionsService for road-following routes
  const createRoutePolyline = useCallback(async (map: google.maps.Map) => {
    // Clear existing polyline and directions renderer
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null);
      directionsRendererRef.current = null;
    }

    if (!route || route.stops.length === 0) return;

    // Get warehouse coordinates
    const warehouse = route.origin_warehouse;
    if (!warehouse?.has_coordinates) return;

    // Build waypoints array
    const waypoints: google.maps.DirectionsWaypoint[] = [];
    const stops = [...route.stops].sort((a, b) => a.sequence_number - b.sequence_number);

    stops.forEach((stop) => {
      const lat = stop.location_latitude ?? stop.client.latitude;
      const lng = stop.location_longitude ?? stop.client.longitude;
      if (lat && lng) {
        waypoints.push({
          location: new google.maps.LatLng(lat, lng),
          stopover: true
        });
      }
    });

    if (waypoints.length === 0) return;

    // Determine origin and destination
    const origin = new google.maps.LatLng(warehouse.latitude!, warehouse.longitude!);
    let destination: google.maps.LatLng;

    if (route.return_to_warehouse) {
      const destWarehouse = route.destination_warehouse || warehouse;
      destination = new google.maps.LatLng(destWarehouse.latitude!, destWarehouse.longitude!);
    } else {
      // Last stop is destination, remove from waypoints
      const lastWaypoint = waypoints.pop();
      destination = lastWaypoint!.location as google.maps.LatLng;
    }

    // Use Google DirectionsService to get route along roads
    const directionsService = new google.maps.DirectionsService();

    try {
      const result = await directionsService.route({
        origin,
        destination,
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false, // Keep our sequence
        region: 'ca'
      });

      // Create DirectionsRenderer to display the route
      const directionsRenderer = new google.maps.DirectionsRenderer({
        map,
        directions: result,
        suppressMarkers: true, // We're using our own markers
        polylineOptions: {
          strokeColor: getRouteColor(route.status),
          strokeOpacity: 0.8,
          strokeWeight: 4
        }
      });

      directionsRendererRef.current = directionsRenderer;
    } catch (error) {
      console.error('Error rendering route directions:', error);
      // Fallback to simple polyline if DirectionsService fails
      const path = waypoints.map(wp => wp.location as google.maps.LatLng);
      const polyline = new google.maps.Polyline({
        path: [origin, ...path, destination],
        geodesic: true,
        strokeColor: getRouteColor(route.status),
        strokeOpacity: 0.6,
        strokeWeight: 3,
      });
      polyline.setMap(map);
      routePolylineRef.current = polyline;
    }
  }, [route]);
  
  
  // Simple Google Maps initialization with retry logic
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;

    const initializeMap = async () => {
      try {
        const mapContainer = document.getElementById('google-map-container');
        if (!mapContainer) {
          console.warn('Map container not found, retrying...');
          if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(initializeMap, 500);
          }
          return;
        }

        const { loadGoogleMaps } = await import('@/lib/google-maps');
        const googleMaps = await loadGoogleMaps();

        // Ensure Google Maps API is fully loaded with all required libraries
        if (!googleMaps?.maps?.Map || !googleMaps?.maps?.Marker || !googleMaps?.maps?.Polyline) {
          throw new Error('Google Maps API not fully loaded');
        }

        // Extra safety: wait a bit to ensure libraries are ready
        await new Promise(resolve => setTimeout(resolve, 100));

        // Use default center for initialization, will be updated when route loads
        const map = new googleMaps.maps.Map(mapContainer, {
          center: { lat: 45.5017, lng: -73.5673 }, // Montreal default
          zoom: 8,
          mapTypeId: googleMaps.maps.MapTypeId.ROADMAP,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
        });

        // Store map reference for other functions to use
        mapRef.current = map;
        setMapInitialized(true);

      } catch (error) {
        console.error('Map initialization failed:', error);
        // Retry logic
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying map initialization (${retryCount}/${maxRetries})...`);
          setTimeout(initializeMap, 1000 * retryCount); // Exponential backoff
        } else {
          toast.error('Failed to load Google Maps. Please refresh the page.');
        }
      }
    };

    // Small initial delay to ensure DOM is ready
    const initTimer = setTimeout(initializeMap, 100);

    return () => clearTimeout(initTimer);
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
      createWarehouseMarkers(map);
      createStopMarkers(map);
      createVehicleMarkers(map);
      createRoutePolyline(map);

      // Fit bounds to show all markers using same coordinate fallback
      const bounds = new google.maps.LatLngBounds();
      let hasPoints = false;

      // Add warehouse positions to bounds
      if (route.origin_warehouse && route.origin_warehouse.has_coordinates) {
        const warehouse = route.origin_warehouse;
        const lat = typeof warehouse.latitude === 'number'
          ? warehouse.latitude
          : parseFloat(String(warehouse.latitude));
        const lng = typeof warehouse.longitude === 'number'
          ? warehouse.longitude
          : parseFloat(String(warehouse.longitude));

        if (!isNaN(lat) && !isNaN(lng)) {
          bounds.extend({ lat, lng });
          hasPoints = true;
        }
      }

      // Add stop positions to bounds
      route.stops.forEach(stop => {
          // Use same fallback logic: stop coords -> client coords
          const rawLat = stop.location_latitude ?? stop.client.latitude;
          const rawLng = stop.location_longitude ?? stop.client.longitude;

          if (rawLat == null || rawLng == null) return;

          const lat = typeof rawLat === 'number' ? rawLat : parseFloat(String(rawLat));
          const lng = typeof rawLng === 'number' ? rawLng : parseFloat(String(rawLng));

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
      warehouseMarkersRef.current.forEach(marker => {
        marker.setMap(null);
        google.maps.event.clearInstanceListeners(marker);
      });

      // Clear polyline
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }

      // Clear directions renderer
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
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
              {route && route.stops.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyShareableLink}
                  disabled={!route.origin_warehouse?.has_coordinates}
                  className="gap-2"
                >
                  {linkCopied ? (
                    <>
                      <Check className="h-4 w-4 text-green-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4" />
                      Share Route
                    </>
                  )}
                </Button>
              )}
              {route?.status === 'planned' && (
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOptimizeMenu(!showOptimizeMenu)}
                    disabled={optimizing || !route || route.stops.length < 2}
                  >
                    {optimizing ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    Optimize
                  </Button>
                  {showOptimizeMenu && !optimizing && (
                    <div className="absolute right-0 mt-1 w-48 bg-white border rounded-md shadow-lg z-10">
                      <div className="py-1">
                        <button
                          type="button"
                          onClick={() => optimizeRoute('balanced')}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                        >
                          ⚖️ Balanced
                        </button>
                        <button
                          type="button"
                          onClick={() => optimizeRoute('distance')}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                        >
                          📏 Shortest Distance
                        </button>
                        <button
                          type="button"
                          onClick={() => optimizeRoute('duration')}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                        >
                          ⏱️ Fastest Time
                        </button>
                        <button
                          type="button"
                          onClick={() => optimizeRoute('fuel_cost')}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                        >
                          ⛽ Fuel Efficient
                        </button>
                        <button
                          type="button"
                          onClick={() => optimizeRoute('co2_emissions')}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                        >
                          🌱 Low Emissions
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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

      {/* Turn-by-turn Directions */}
      {directions && directions.legs && directions.legs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Navigation2 className="h-5 w-5 text-blue-600" />
              Turn-by-Turn Directions
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[500px] overflow-y-auto">
            <div className="space-y-6">
              {directions.legs.map((leg: any, legIndex: number) => (
                <div key={legIndex} className="space-y-3">
                  {/* Leg header */}
                  <div className="flex items-start gap-3 pb-3 border-b">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-blue-600">{legIndex + 1}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{leg.start_address}</p>
                      <p className="text-xs text-gray-500 mt-0.5">to {leg.end_address}</p>
                      <div className="flex gap-3 mt-2 text-xs text-gray-600">
                        <span className="flex items-center gap-1">
                          <RouteIcon className="h-3 w-3" />
                          {leg.distance}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {leg.duration}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Steps */}
                  <div className="space-y-2 ml-4 pl-4 border-l-2 border-gray-200">
                    {leg.steps?.map((step: any, stepIndex: number) => (
                      <div key={stepIndex} className="flex gap-3 py-2">
                        <div className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-gray-600">{stepIndex + 1}</span>
                        </div>
                        <div className="flex-1">
                          <div
                            className="text-sm text-gray-700"
                            dangerouslySetInnerHTML={{ __html: step.instruction }}
                          />
                          <div className="flex gap-3 mt-1 text-xs text-gray-500">
                            <span>{step.distance}</span>
                            <span>•</span>
                            <span>{step.duration}</span>
                            {step.maneuver && (
                              <>
                                <span>•</span>
                                <span className="capitalize">{step.maneuver.replace(/-/g, ' ')}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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