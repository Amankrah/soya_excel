'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Truck, X, Play, Pause, RotateCcw, MapPin, Clock, User, Car } from 'lucide-react';
import { routeAPI } from '@/lib/api';
import { toast } from 'sonner';
import { loadGoogleMaps } from '@/lib/google-maps';

interface RouteSimulationModalProps {
  open: boolean;
  onClose: () => void;
  routeId: string;
  routeName: string;
}

interface Waypoint {
  id: string;
  type: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  sequence: number;
  arrival_time_seconds: number;
  departure_time_seconds: number;
  service_time_seconds: number;
  cumulative_distance_km: number;
  icon: string;
  description: string;
  quantity_to_deliver?: number;
}

interface SimulationData {
  success: boolean;
  route_id: number;
  route_name: string;
  route_date: string;
  simulation_config: {
    speed_multiplier: number;
    total_real_duration_seconds: number;
    total_simulation_duration_seconds: number;
    total_distance_km: number;
    total_stops: number;
    include_return: boolean;
  };
  waypoints: Waypoint[];
  path_coordinates: Array<{ lat: number; lng: number }>;
  driver_info?: {
    id: number;
    name: string;
    phone: string;
    license_number: string;
    profile_photo?: string | null;
  } | null;
  vehicle_info?: {
    id?: number;
    vehicle_number?: string;
    vehicle_type?: string;
    make_model?: string;
    capacity_tonnes?: number;
    license_plate?: string;
    type?: string;
    capacity_used_tonnes?: number;
    icon: string;
  } | null;
  start_location: Waypoint;
  end_location: Waypoint;
  instructions: string;
}

export function RouteSimulationModal({ open, onClose, routeId, routeName }: RouteSimulationModalProps) {
  const [loading, setLoading] = useState(false);
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(60);
  const [currentWaypoint, setCurrentWaypoint] = useState<Waypoint | null>(null);
  const [nextWaypoint, setNextWaypoint] = useState<Waypoint | null>(null);
  const [progress, setProgress] = useState(0);
  const [directionsPath, setDirectionsPath] = useState<google.maps.LatLng[]>([]);
  const [currentLocationName, setCurrentLocationName] = useState<string>('');
  const [etaToNextStop, setEtaToNextStop] = useState<number | null>(null);
  const [distanceToNextStop, setDistanceToNextStop] = useState<number | null>(null);

  const mapRef = useRef<google.maps.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const vehicleMarkerRef = useRef<google.maps.Marker | null>(null);
  const waypointMarkersRef = useRef<google.maps.Marker[]>([]);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(Date.now());
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const lastGeocodedIndexRef = useRef<number>(-1);
  const geocodeCacheRef = useRef<Map<number, string>>(new Map());
  const isAtStopRef = useRef<boolean>(false);

  // Load simulation data callback
  // Accept optional speedOverride to handle async state update timing
  const loadSimulationData = useCallback(async (speedOverride?: number) => {
    const effectiveSpeed = speedOverride ?? speed;
    setLoading(true);
    try {
      const data = await routeAPI.simulateRoute(routeId, effectiveSpeed);
      if (data.success) {
        setSimulationData(data);
        toast.success(`Simulation loaded at ${effectiveSpeed}x speed`);
      } else {
        toast.error(data.error || 'Failed to load simulation');
      }
    } catch (error: unknown) {
      console.error('Error loading simulation:', error);
      toast.error('Failed to load simulation data');
    } finally {
      setLoading(false);
    }
  }, [routeId, speed]);

  // Load simulation data
  useEffect(() => {
    if (open && routeId && !simulationData) {
      loadSimulationData();
    }
  }, [open, routeId, simulationData, loadSimulationData]);

  // Load route directions callback
  const loadRouteDirections = useCallback(async (map: google.maps.Map) => {
    if (!simulationData) return;

    try {
      const google = await loadGoogleMaps();
      const directionsService = new google.maps.DirectionsService();

      // Build waypoints array (excluding first and last)
      const waypoints = simulationData.waypoints
        .slice(1, -1)
        .map(wp => ({
          location: new google.maps.LatLng(wp.latitude, wp.longitude),
          stopover: true
        }));

      const origin = new google.maps.LatLng(
        simulationData.start_location.latitude,
        simulationData.start_location.longitude
      );

      const destination = new google.maps.LatLng(
        simulationData.end_location.latitude,
        simulationData.end_location.longitude
      );

      const result = await directionsService.route({
        origin,
        destination,
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      });

      // Create directions renderer
      const directionsRenderer = new google.maps.DirectionsRenderer({
        map,
        directions: result,
        suppressMarkers: true, // We use our own markers
        polylineOptions: {
          strokeColor: '#10b981',
          strokeOpacity: 0.7,
          strokeWeight: 4,
        },
      });

      directionsRendererRef.current = directionsRenderer;

      // Extract path coordinates from directions
      const path: google.maps.LatLng[] = [];
      result.routes[0].legs.forEach(leg => {
        leg.steps.forEach(step => {
          path.push(...step.path);
        });
      });

      setDirectionsPath(path);
    } catch (error) {
      console.error('Error loading directions:', error);
      // Fallback to simple path if directions fail
      const fallbackPath = simulationData.waypoints.map(
        wp => new google.maps.LatLng(wp.latitude, wp.longitude)
      );
      setDirectionsPath(fallbackPath);
    }
  }, [simulationData]);

  // Initialize map callback
  const initializeMap = useCallback(async () => {
    if (!simulationData || !mapContainerRef.current) return;

    try {
      const google = await loadGoogleMaps();
      const startLocation = simulationData.start_location;

      const map = new google.maps.Map(mapContainerRef.current, {
        center: { lat: startLocation.latitude, lng: startLocation.longitude },
        zoom: 12,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
      });

      mapRef.current = map;

      // Get route directions from Google Maps for realistic path
      await loadRouteDirections(map);

      // Add waypoint markers
      simulationData.waypoints.forEach((waypoint, index) => {
        const marker = new google.maps.Marker({
          position: { lat: waypoint.latitude, lng: waypoint.longitude },
          map: map,
          title: waypoint.name,
          label: {
            text: `${index + 1}`,
            color: 'white',
            fontSize: '12px',
            fontWeight: 'bold',
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: waypoint.type === 'warehouse' || waypoint.type === 'warehouse_return' ? '#f59e0b' : '#10b981',
            fillOpacity: 0.9,
            strokeColor: 'white',
            strokeWeight: 2,
          },
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 8px;">
              <strong>${waypoint.name}</strong><br/>
              <small>${waypoint.address}</small><br/>
              ${waypoint.quantity_to_deliver ? `<br/><strong>Quantity:</strong> ${waypoint.quantity_to_deliver.toFixed(2)} tonnes` : ''}
            </div>
          `,
        });

        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });

        waypointMarkersRef.current.push(marker);
      });

      // Create vehicle marker
      const vehicleMarker = new google.maps.Marker({
        position: { lat: startLocation.latitude, lng: startLocation.longitude },
        map: map,
        title: 'Delivery Vehicle',
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: '#3b82f6',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2,
          rotation: 0,
        },
        zIndex: 1000,
      });

      vehicleMarkerRef.current = vehicleMarker;

      // Fit map to bounds
      const bounds = new google.maps.LatLngBounds();
      simulationData.waypoints.forEach((waypoint) => {
        bounds.extend({ lat: waypoint.latitude, lng: waypoint.longitude });
      });
      map.fitBounds(bounds);
    } catch (error) {
      console.error('Error initializing map:', error);
      toast.error('Failed to initialize map');
    }
  }, [simulationData, loadRouteDirections]);

  // Initialize Google Maps
  useEffect(() => {
    if (simulationData && mapContainerRef.current && !mapRef.current) {
      initializeMap();
    }
  }, [simulationData, initializeMap]);

  // Update vehicle position callback
  const updateVehiclePosition = useCallback((elapsedTime: number) => {
    if (!simulationData || !vehicleMarkerRef.current || directionsPath.length === 0) return;

    const waypoints = simulationData.waypoints;
    const totalDuration = simulationData.simulation_config.total_simulation_duration_seconds;

    // Calculate progress along the entire route based on time
    const overallProgress = Math.min(elapsedTime / totalDuration, 1);
    const targetIndex = Math.floor(overallProgress * (directionsPath.length - 1));

    // Get current position from directions path
    let currentPos: google.maps.LatLng | null = null;
    if (targetIndex >= 0 && targetIndex < directionsPath.length) {
      currentPos = directionsPath[targetIndex];
      vehicleMarkerRef.current.setPosition(currentPos);

      // Calculate heading if we have next point
      if (targetIndex + 1 < directionsPath.length) {
        const nextPos = directionsPath[targetIndex + 1];
        const heading = google.maps.geometry.spherical.computeHeading(currentPos, nextPos);

        const icon = vehicleMarkerRef.current.getIcon() as google.maps.Symbol;
        if (icon) {
          icon.rotation = heading;
          vehicleMarkerRef.current.setIcon(icon);
        }
      }

      // Pan map to follow vehicle
      mapRef.current?.panTo(currentPos);
    }

    // Determine current waypoint and next stop based on SCALED simulation time
    // Scale waypoint times from real route time to simulation time
    const speedMultiplier = simulationData.simulation_config.speed_multiplier;

    let currentLocationWaypoint: Waypoint | null = null;
    let nextStopWaypoint: Waypoint | null = null;
    let isAtStop = false;

    // Find which waypoint we're at based on scaled time
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];

      // Scale waypoint times to simulation time
      const scaledArrival = wp.arrival_time_seconds / speedMultiplier;
      const scaledDeparture = wp.departure_time_seconds / speedMultiplier;

      // Check if we're currently at or servicing this waypoint
      if (elapsedTime >= scaledArrival && elapsedTime < scaledDeparture) {
        currentLocationWaypoint = wp;
        isAtStop = true;

        // Find next delivery stop after this one
        for (let j = i + 1; j < waypoints.length; j++) {
          if (waypoints[j].type === 'delivery_stop' || waypoints[j].type === 'warehouse_return') {
            nextStopWaypoint = waypoints[j];
            break;
          }
        }
        break;
      }
      // Check if we're in transit to the next waypoint
      else if (elapsedTime >= scaledDeparture) {
        if (i + 1 < waypoints.length) {
          const nextWp = waypoints[i + 1];
          const nextScaledArrival = nextWp.arrival_time_seconds / speedMultiplier;

          if (elapsedTime < nextScaledArrival) {
            // We're in transit - find next delivery stop
            for (let j = i + 1; j < waypoints.length; j++) {
              if (waypoints[j].type === 'delivery_stop' || waypoints[j].type === 'warehouse_return') {
                nextStopWaypoint = waypoints[j];
                break;
              }
            }

            // Use geocoding for current location if available (in transit)
            if (currentPos) {
              const pathIndexKey = Math.floor(targetIndex / 50); // Geocode every 50 path points

              if (geocodeCacheRef.current.has(pathIndexKey)) {
                setCurrentLocationName(geocodeCacheRef.current.get(pathIndexKey)!);
              } else if (lastGeocodedIndexRef.current !== pathIndexKey) {
                lastGeocodedIndexRef.current = pathIndexKey;

                if (!geocoderRef.current && window.google) {
                  geocoderRef.current = new google.maps.Geocoder();
                }

                if (geocoderRef.current) {
                  geocoderRef.current.geocode(
                    { location: currentPos },
                    (results, status) => {
                      if (status === 'OK' && results && results[0]) {
                        const streetAddress = results[0].address_components.find(
                          (component) => component.types.includes('route')
                        );
                        const locality = results[0].address_components.find(
                          (component) => component.types.includes('locality')
                        );

                        let locationName = 'In transit';
                        if (streetAddress) {
                          locationName = streetAddress.long_name;
                          if (locality) {
                            locationName += `, ${locality.long_name}`;
                          }
                        } else if (results[0].formatted_address) {
                          locationName = results[0].formatted_address.split(',').slice(0, 2).join(',');
                        }

                        geocodeCacheRef.current.set(pathIndexKey, locationName);
                        setCurrentLocationName(locationName);
                      } else {
                        const fallbackName = nextStopWaypoint ? `En route to ${nextStopWaypoint.name}` : 'In transit';
                        geocodeCacheRef.current.set(pathIndexKey, fallbackName);
                        setCurrentLocationName(fallbackName);
                      }
                    }
                  );
                }
              }

              // Create a placeholder waypoint for in-transit display
              currentLocationWaypoint = {
                ...wp,
                name: nextStopWaypoint ? `En route to ${nextStopWaypoint.name}` : 'In transit',
                type: 'in_transit',
              };
            }
            break;
          }
        }
      }
    }

    // Fallback if no waypoint matched (at the start)
    if (!currentLocationWaypoint && waypoints.length > 0) {
      currentLocationWaypoint = waypoints[0];
      isAtStop = true;

      // Find first delivery stop
      for (let i = 1; i < waypoints.length; i++) {
        if (waypoints[i].type === 'delivery_stop') {
          nextStopWaypoint = waypoints[i];
          break;
        }
      }
    }

    // Update the ref for use in the UI
    isAtStopRef.current = isAtStop;

    // Calculate ETA to next stop based on scaled waypoint times
    if (nextStopWaypoint) {
      const scaledNextArrival = nextStopWaypoint.arrival_time_seconds / speedMultiplier;
      const remainingTimeToNext = Math.max(0, scaledNextArrival - elapsedTime);
      setEtaToNextStop(remainingTimeToNext);

      // Calculate distance to next stop
      if (currentLocationWaypoint) {
        const distanceToNext = nextStopWaypoint.cumulative_distance_km - (currentLocationWaypoint.cumulative_distance_km || 0);
        setDistanceToNextStop(Math.max(0, distanceToNext));
      }
    } else {
      setEtaToNextStop(null);
      setDistanceToNextStop(null);
    }

    setCurrentWaypoint(currentLocationWaypoint);
    setNextWaypoint(nextStopWaypoint);
    setProgress((elapsedTime / totalDuration) * 100);
  }, [simulationData, directionsPath]);

  // Animation loop
  useEffect(() => {
    if (isPlaying && simulationData && directionsPath.length > 0) {
      const animate = () => {
        const now = Date.now();
        const deltaTime = (now - lastUpdateTimeRef.current) / 1000;
        lastUpdateTimeRef.current = now;

        setCurrentTime((prevTime) => {
          const newTime = prevTime + deltaTime;
          const maxTime = simulationData.simulation_config.total_simulation_duration_seconds;

          if (newTime >= maxTime) {
            setIsPlaying(false);
            return maxTime;
          }

          updateVehiclePosition(newTime);
          return newTime;
        });

        animationFrameRef.current = requestAnimationFrame(animate);
      };

      lastUpdateTimeRef.current = Date.now();
      animationFrameRef.current = requestAnimationFrame(animate);

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [isPlaying, simulationData, directionsPath, updateVehiclePosition]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    setProgress(0);
    setEtaToNextStop(null);
    setDistanceToNextStop(null);
    setCurrentWaypoint(null);
    setNextWaypoint(null);
    if (simulationData && vehicleMarkerRef.current) {
      const startLocation = simulationData.start_location;
      vehicleMarkerRef.current.setPosition({
        lat: startLocation.latitude,
        lng: startLocation.longitude,
      });
      mapRef.current?.panTo({
        lat: startLocation.latitude,
        lng: startLocation.longitude,
      });
    }
  };

  const handleSpeedChange = async (newSpeed: number[]) => {
    const newSpeedValue = newSpeed[0];
    const wasPlaying = isPlaying;
    setIsPlaying(false);
    setSpeed(newSpeedValue);
    setCurrentTime(0);
    setProgress(0);
    setEtaToNextStop(null);
    setDistanceToNextStop(null);
    setCurrentWaypoint(null);
    setNextWaypoint(null);
    setSimulationData(null);
    mapRef.current = null;
    vehicleMarkerRef.current = null;
    waypointMarkersRef.current = [];
    directionsRendererRef.current = null;
    setDirectionsPath([]);

    // Reload with new speed - pass directly to avoid stale state
    await loadSimulationData(newSpeedValue);

    if (wasPlaying) {
      setTimeout(() => setIsPlaying(true), 1000);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-7xl max-h-[95vh] overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <Truck className="h-5 w-5 text-blue-600" />
            Route Simulation: {routeName}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Modal Content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(95vh - 80px)' }}>
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
            </div>
          ) : simulationData ? (
            <div className="flex flex-col gap-4 p-4">
              {/* Driver & Vehicle Info Panel */}
              {(simulationData.driver_info || simulationData.vehicle_info) && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  {simulationData.driver_info && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                        <User className="h-4 w-4" />
                        Driver Information
                      </div>
                      <div className="text-sm space-y-1">
                        <div><strong>Name:</strong> {simulationData.driver_info.name}</div>
                        <div><strong>Phone:</strong> {simulationData.driver_info.phone}</div>
                        <div><strong>License:</strong> {simulationData.driver_info.license_number}</div>
                      </div>
                    </div>
                  )}
                  {simulationData.vehicle_info && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                        <Car className="h-4 w-4" />
                        Vehicle Information
                      </div>
                      <div className="text-sm space-y-1">
                        {simulationData.vehicle_info.vehicle_number && (
                          <div><strong>Number:</strong> {simulationData.vehicle_info.vehicle_number}</div>
                        )}
                        {simulationData.vehicle_info.make_model && (
                          <div><strong>Vehicle:</strong> {simulationData.vehicle_info.make_model}</div>
                        )}
                        {simulationData.vehicle_info.vehicle_type && (
                          <div><strong>Type:</strong> {simulationData.vehicle_info.vehicle_type}</div>
                        )}
                        {simulationData.vehicle_info.license_plate && (
                          <div><strong>Plate:</strong> {simulationData.vehicle_info.license_plate}</div>
                        )}
                        {simulationData.vehicle_info.capacity_tonnes && (
                          <div><strong>Capacity:</strong> {simulationData.vehicle_info.capacity_tonnes} tonnes</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Map Container */}
              <div ref={mapContainerRef} className="w-full h-[500px] rounded-lg border" />

              {/* Info Panel */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 uppercase font-medium">Current Location</div>
                  <div className="text-sm font-semibold">
                    {currentWaypoint?.type === 'in_transit' && currentLocationName
                      ? currentLocationName
                      : (currentWaypoint?.name || 'Starting...')}
                  </div>
                  {currentWaypoint && currentWaypoint.type === 'in_transit' && (
                    <div className="text-xs text-blue-600 flex items-center gap-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      In transit
                    </div>
                  )}
                  {currentWaypoint && currentWaypoint.type === 'delivery_stop' && currentWaypoint.quantity_to_deliver && (
                    // Check if we're at the stop (not in transit)
                    isAtStopRef.current ? (
                      <div className="text-xs text-green-600 font-semibold flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        Offloading {currentWaypoint.quantity_to_deliver.toFixed(2)} tonnes
                      </div>
                    ) : (
                      <div className="text-xs text-gray-600">{currentWaypoint.quantity_to_deliver.toFixed(2)} tonnes to deliver</div>
                    )
                  )}
                  {currentWaypoint && currentWaypoint.type === 'warehouse_return' && (
                    <div className="text-xs text-blue-600 font-semibold">✓ Returning to warehouse</div>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 uppercase font-medium">Next Stop</div>
                  {progress >= 100 ? (
                    <div className="text-sm font-semibold text-green-600">🎉 Simulation Complete!</div>
                  ) : nextWaypoint ? (
                    <>
                      <div className="text-sm font-semibold">{nextWaypoint.name}</div>
                      {nextWaypoint.quantity_to_deliver && (
                        <div className="text-xs text-gray-600">{nextWaypoint.quantity_to_deliver.toFixed(2)} tonnes</div>
                      )}
                      {etaToNextStop !== null && (
                        <div className="text-xs text-blue-600 font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          ETA: {formatTime(etaToNextStop)}
                        </div>
                      )}
                      {distanceToNextStop !== null && distanceToNextStop > 0 && (
                        <div className="text-xs text-gray-500">
                          {distanceToNextStop.toFixed(1)} km away
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm font-semibold text-gray-400">End of route</div>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 uppercase font-medium">Progress</div>
                  <div className="text-sm font-semibold">{progress.toFixed(1)}%</div>
                  <div className="text-xs text-gray-600">
                    {formatTime(currentTime)} / {formatTime(simulationData.simulation_config.total_simulation_duration_seconds)}
                  </div>
                  {progress >= 100 && (
                    <div className="text-xs text-green-600 font-semibold">All deliveries completed</div>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-4 p-4 bg-white border rounded-lg">
                <Button variant="outline" size="sm" onClick={handlePlayPause} className="w-24">
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4 mr-2" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Play
                    </>
                  )}
                </Button>

                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>

                <div className="flex-1 flex items-center gap-3">
                  <span className="text-sm text-gray-600">Speed:</span>
                  <div className="flex-1">
                    <Slider
                      value={[speed]}
                      onValueChange={handleSpeedChange}
                      min={60}
                      max={600}
                      step={60}
                      className="w-full"
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700 w-20">{speed}x</span>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4" />
                  {simulationData.simulation_config.total_stops} stops
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="w-4 h-4" />
                  {simulationData.simulation_config.total_distance_km.toFixed(1)} km
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-96 text-gray-500">
              <div className="text-center">
                <MapPin className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p>No simulation data available</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
