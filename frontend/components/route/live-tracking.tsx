'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Truck, MapPin, Clock, Navigation2, RefreshCw, Play, Pause, AlertCircle } from 'lucide-react';
import { routeAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { loadGoogleMaps, createDriverInfoWindowContent } from '@/lib/google-maps';

interface VehicleData {
  id: number;
  vehicle_id: number;
  vehicle_name: string;
  driver_id: number | null;
  driver_name: string | null;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  is_moving: boolean;
  timestamp: string;
  battery_level: number | null;
  route?: {
    id: string;
    name: string;
    status: string;
    total_stops: number;
    completed_stops: number;
  };
  next_stop?: {
    id: number;
    sequence: number;
    client_name: string;
    eta: string | null;
  };
}

interface LiveTrackingData {
  vehicles: VehicleData[];
  count: number;
  timestamp: string;
}

interface LiveTrackingProps {
  routeIds?: string[];
  autoRefresh?: boolean;
  refreshInterval?: number; // in seconds
  showMap?: boolean;
}

export function LiveTracking({
  routeIds = [],
  autoRefresh = true,
  refreshInterval = 180,
  showMap = true,
}: LiveTrackingProps) {
  const [loading, setLoading] = useState(true);
  const [trackingData, setTrackingData] = useState<LiveTrackingData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Google Maps
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<number, google.maps.Marker>>(new Map());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update map markers (defined first to avoid dependency issues)
  const updateMapMarkersRef = useRef<((vehicles: VehicleData[]) => void) | undefined>(undefined);

  useEffect(() => {
    updateMapMarkersRef.current = (vehicles: VehicleData[]) => {
      if (!mapRef.current) return;

      const map = mapRef.current;
      const bounds = new google.maps.LatLngBounds();

      // Clear old markers that are no longer in the data
      const currentVehicleIds = new Set(vehicles.map(v => v.vehicle_id));
      markersRef.current.forEach((marker, vehicleId) => {
        if (!currentVehicleIds.has(vehicleId)) {
          marker.setMap(null);
          markersRef.current.delete(vehicleId);
        }
      });

      // Update or create markers
      vehicles.forEach((vehicle) => {
        const position = { lat: vehicle.latitude, lng: vehicle.longitude };
        bounds.extend(position);

        let marker = markersRef.current.get(vehicle.vehicle_id);

        if (marker) {
          // Update existing marker
          marker.setPosition(position);

          // Animate marker rotation based on heading
          if (vehicle.heading && marker.getIcon()) {
            const icon = marker.getIcon() as google.maps.Icon;
            marker.setIcon({
              ...icon,
              rotation: vehicle.heading,
            });
          }
        } else {
          // Create new marker
          marker = new google.maps.Marker({
            position,
            map,
            title: vehicle.driver_name || vehicle.vehicle_name,
            icon: {
              path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 6,
              fillColor: vehicle.is_moving ? '#22c55e' : '#ef4444',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              rotation: vehicle.heading || 0,
            },
            animation: google.maps.Animation.DROP,
          });

          // Add info window
          const infoWindow = new google.maps.InfoWindow({
            content: createDriverInfoWindowContent({
              name: vehicle.driver_name || 'Unknown Driver',
              vehicle: vehicle.vehicle_name ? {
                license_plate: vehicle.vehicle_name,
                vehicle_type: 'Truck',
              } : undefined,
              current_route: vehicle.route ? {
                name: vehicle.route.name,
                stops_completed: vehicle.route.completed_stops,
                total_stops: vehicle.route.total_stops,
              } : undefined,
              last_update: vehicle.timestamp,
            }),
          });

          marker.addListener('click', () => {
            infoWindow.open(map, marker);
          });

          markersRef.current.set(vehicle.vehicle_id, marker);
        }
      });

      // Fit map to show all vehicles
      if (vehicles.length > 0 && vehicles.length <= 10) {
        // Only auto-fit if there are a reasonable number of vehicles
        map.fitBounds(bounds);
      }
    };
  }, []);

  // Load tracking data
  const loadTrackingData = useCallback(async (showLoader = false) => {
    if (isPaused) return;

    try {
      if (showLoader) setLoading(true);
      else setIsRefreshing(true);

      const data = await routeAPI.getLiveTracking(routeIds.length > 0 ? routeIds : undefined);
      setTrackingData(data);
      setLastUpdate(new Date());

      // Update map markers
      if (mapRef.current && data.vehicles && updateMapMarkersRef.current) {
        updateMapMarkersRef.current(data.vehicles);
      }
    } catch (error) {
      console.error('Error loading tracking data:', error);
      if (showLoader) {
        toast.error('Failed to load tracking data');
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [routeIds, isPaused]);

  // Initialize map
  const initializeMap = useCallback(async () => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      await loadGoogleMaps();

      const map = new google.maps.Map(mapContainerRef.current, {
        zoom: 12,
        center: { lat: 45.5017, lng: -73.5673 }, // Default to Montreal
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
      });

      mapRef.current = map;
    } catch (error) {
      console.error('Error initializing map:', error);
      toast.error('Failed to load Google Maps');
    }
  }, []);

  // Initialize - run only once on mount
  useEffect(() => {
    if (showMap) {
      initializeMap();
    }
    loadTrackingData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      loadTrackingData(false);
    }, refreshInterval * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, isPaused, loadTrackingData]);

  const handleRefresh = () => {
    loadTrackingData(true);
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
    if (isPaused) {
      toast.success('Live tracking resumed');
    } else {
      toast('Live tracking paused');
    }
  };

  const getTimeSinceUpdate = () => {
    if (!lastUpdate) return 'Never';
    const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Navigation2 className="w-5 h-5" />
                Live Vehicle Tracking
              </CardTitle>
              <CardDescription>
                Real-time GPS tracking of active deliveries
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isPaused ? 'secondary' : 'default'}>
                {isPaused ? 'Paused' : `Auto-refresh: ${refreshInterval}s`}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={togglePause}
              >
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Truck className="w-4 h-4" />
                {trackingData?.count || 0} active vehicles
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Last update: {getTimeSinceUpdate()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Map */}
      {showMap && (
        <Card>
          <CardContent className="p-0">
            <div
              ref={mapContainerRef}
              className="w-full h-[500px] rounded-lg"
            />
          </CardContent>
        </Card>
      )}

      {/* Vehicle List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trackingData?.vehicles.map((vehicle) => (
          <Card key={vehicle.vehicle_id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    {vehicle.driver_name || 'Unassigned'}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {vehicle.vehicle_name}
                  </CardDescription>
                </div>
                <Badge variant={vehicle.is_moving ? 'default' : 'secondary'}>
                  {vehicle.is_moving ? 'Moving' : 'Stopped'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Route Info */}
              {vehicle.route && (
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm font-medium text-blue-900">
                    {vehicle.route.name}
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    Progress: {vehicle.route.completed_stops}/{vehicle.route.total_stops} stops
                  </p>
                </div>
              )}

              {/* Next Stop */}
              {vehicle.next_stop && (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Next: {vehicle.next_stop.client_name}</p>
                    {vehicle.next_stop.eta && (
                      <p className="text-xs text-gray-600">
                        ETA: {new Date(vehicle.next_stop.eta).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-gray-600">Speed</p>
                  <p className="font-medium">{vehicle.speed.toFixed(0)} km/h</p>
                </div>
                <div>
                  <p className="text-gray-600">Battery</p>
                  <p className="font-medium">
                    {vehicle.battery_level ? `${vehicle.battery_level}%` : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Last Update */}
              <p className="text-xs text-gray-500">
                Updated: {new Date(vehicle.timestamp).toLocaleTimeString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {trackingData && trackingData.vehicles.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-12 h-12 text-gray-400 mb-3" />
            <p className="text-gray-600 font-medium">No active vehicles</p>
            <p className="text-sm text-gray-500 mt-1">
              Vehicles will appear here when routes are activated
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
