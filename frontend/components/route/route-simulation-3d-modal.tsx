'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { X, Play, Pause, RotateCcw, MapPin, Clock, Mountain, Eye, User, Car } from 'lucide-react';
import { routeAPI } from '@/lib/api';
import { toast } from 'sonner';
import { loadGoogleMaps } from '@/lib/google-maps';
import { Badge } from '@/components/ui/badge';

interface RouteSimulation3DModalProps {
  open: boolean;
  onClose: () => void;
  routeId: string;
  routeName: string;
}

interface Waypoint {
  type: 'warehouse' | 'delivery_stop' | 'warehouse_return' | 'in_transit';
  sequence: number;
  client_name: string | null;
  address: string;
  latitude: number;
  longitude: number;
  arrival_time_seconds: number;
  departure_time_seconds: number;
  stop_duration_seconds: number;
  quantity_to_deliver: number | null;
  cumulative_distance_km: number;
}

interface SimulationData {
  success: boolean;
  route_id: number;
  route_name: string;
  waypoints: Waypoint[];
  directions?: {
    polyline?: string;
    total_distance_km?: number;
    total_duration_seconds?: number;
  };
  simulation_config: {
    speed_multiplier: number;
    total_simulation_duration_seconds: number;
    real_duration_seconds: number;
    total_distance_km?: number;
  };
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
}

export function RouteSimulation3DModal({ open, onClose, routeId, routeName }: RouteSimulation3DModalProps) {
  const [loading, setLoading] = useState(false);
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(60);
  const [currentWaypoint, setCurrentWaypoint] = useState<Waypoint | null>(null);
  const [nextWaypoint, setNextWaypoint] = useState<Waypoint | null>(null);
  const [progress, setProgress] = useState(0);
  const [map3DReady, setMap3DReady] = useState(false);
  const [currentLocationName, setCurrentLocationName] = useState<string>('');
  const [etaToNextStop, setEtaToNextStop] = useState<number | null>(null);
  const [distanceToNextStop, setDistanceToNextStop] = useState<number | null>(null);

  // Refs - using unknown for Google Maps 3D elements as they're dynamically loaded
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map3DElementRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polyline3DRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markers3DRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vehicleMarker3DRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(Date.now());
  const pathCoordsRef = useRef<Array<{ lat: number; lng: number; altitude: number }>>([]);
  const googleRef = useRef<typeof google | null>(null);

  // Load simulation data
  const loadSimulationData = useCallback(async (speedOverride?: number) => {
    const effectiveSpeed = speedOverride ?? speed;
    setLoading(true);
    try {
      const data = await routeAPI.simulateRoute(routeId, effectiveSpeed);
      if (data.success) {
        setSimulationData(data);
        toast.success(`3D Simulation loaded at ${effectiveSpeed}x speed`);
      } else {
        toast.error(data.error || 'Failed to load simulation');
      }
    } catch (error) {
      console.error('Error loading simulation:', error);
      toast.error('Failed to load simulation data');
    } finally {
      setLoading(false);
    }
  }, [routeId, speed]);

  // Load simulation data when modal opens
  useEffect(() => {
    if (open && routeId && !simulationData) {
      loadSimulationData();
    }
  }, [open, routeId, simulationData, loadSimulationData]);

  // Initialize 3D Map
  const initialize3DMap = useCallback(async () => {
    if (!mapContainerRef.current) return;

    // Prevent duplicate initialization
    if (map3DElementRef.current) {
      console.log('Map already initialized, skipping...');
      return;
    }

    // Clear the container completely to avoid duplicate maps
    mapContainerRef.current.innerHTML = '';

    try {
      const googleMaps = await loadGoogleMaps();
      googleRef.current = googleMaps;

      // Import the maps3d library for Map3DElement following Google's official pattern
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { Map3DElement, MapMode } = await googleMaps.maps.importLibrary('maps3d') as any;

      // Create the photorealistic 3D map element following Google's example pattern
      const map3DElement = new Map3DElement({
        center: { lat: 45.5017, lng: -73.5673, altitude: 500 }, // Montreal default, elevated
        range: 5000, // Camera distance from center
        tilt: 67.5, // Camera tilt angle
        heading: 0, // Camera heading
        mode: MapMode.SATELLITE, // REQUIRED for photorealistic 3D satellite view
        gestureHandling: 'COOPERATIVE', // Require ctrl/cmd for zoom
      });

      // Append the 3D map element to the container
      mapContainerRef.current.append(map3DElement);
      map3DElementRef.current = map3DElement;

      // Add event listeners for debugging
      map3DElement.addEventListener('gmp-load', () => {
        console.log('3D Map loaded successfully');
        setMap3DReady(true);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map3DElement.addEventListener('gmp-error', (event: any) => {
        console.error('3D Map error:', event);
        toast.error('Failed to load 3D map: ' + (event.error?.message || 'Unknown error'));
      });

      // Set ready state after a short delay to allow map to initialize
      setTimeout(() => setMap3DReady(true), 1000);

    } catch (error) {
      console.error('Error initializing 3D map:', error);
      toast.error('Failed to initialize 3D map. Make sure you have a valid Map ID configured.');
    }
  }, []);

  // Setup route visualization when data is loaded
  useEffect(() => {
    if (!simulationData || !map3DElementRef.current || !map3DReady || !googleRef.current) return;

    const setupRoute = async () => {
      try {
        const googleMaps = googleRef.current!;
        const map3D = map3DElementRef.current;

        // Import 3D libraries following Google's official pattern
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { Polyline3DInteractiveElement, Marker3DElement, AltitudeMode } = await googleMaps.maps.importLibrary('maps3d') as any;

        // Clear existing overlays - just reset references without trying to remove
        // The Map3DElement will handle its own cleanup
        markers3DRef.current = [];
        polyline3DRef.current = null;

        // Build path coordinates from waypoints
        const coords = simulationData.waypoints.map(wp => ({
          lat: wp.latitude,
          lng: wp.longitude,
        }));
        pathCoordsRef.current = coords.map(c => ({ ...c, altitude: 0 }));

        // Create 3D polyline for the route following Google's pattern
        if (Polyline3DInteractiveElement) {
          const polyline = new Polyline3DInteractiveElement({
            path: coords, // Use 'path' property as per latest API
            strokeColor: '#10B981',
            outerColor: 'white',
            strokeWidth: 10,
            outerWidth: 0.4,
            altitudeMode: AltitudeMode.RELATIVE_TO_GROUND, // Place on the ground
            drawsOccludedSegments: true, // Show the line through buildings
          });
          map3D.append(polyline);
          polyline3DRef.current = polyline;
        }

        // Create 3D markers for waypoints
        if (Marker3DElement) {
          for (const waypoint of simulationData.waypoints) {
            const marker = new Marker3DElement({
              position: {
                lat: waypoint.latitude,
                lng: waypoint.longitude,
                altitude: 50
              },
              altitudeMode: AltitudeMode.RELATIVE_TO_GROUND,
              extruded: true, // Draw line from ground to marker
              label: `${waypoint.sequence}`,
            });

            map3D.append(marker);
            markers3DRef.current.push(marker);
          }

          // Create vehicle marker
          const vehicleMarker = new Marker3DElement({
            position: {
              lat: coords[0].lat,
              lng: coords[0].lng,
              altitude: 30
            },
            altitudeMode: AltitudeMode.RELATIVE_TO_GROUND,
            extruded: true,
            label: '🚛',
          });

          map3D.append(vehicleMarker);
          vehicleMarker3DRef.current = vehicleMarker;
        }

        // Center map on route
        if (simulationData.waypoints.length > 0) {
          const firstWp = simulationData.waypoints[0];
          const lastWp = simulationData.waypoints[simulationData.waypoints.length - 1];
          const centerLat = (firstWp.latitude + lastWp.latitude) / 2;
          const centerLng = (firstWp.longitude + lastWp.longitude) / 2;

          map3D.center = { lat: centerLat, lng: centerLng, altitude: 200 };
          map3D.range = 10000; // Zoom out to see entire route
          map3D.tilt = 55;
        }

        // Set initial waypoints
        setCurrentWaypoint(simulationData.waypoints[0]);
        if (simulationData.waypoints.length > 1) {
          setNextWaypoint(simulationData.waypoints[1]);
        }

      } catch (error) {
        console.error('Error setting up 3D route:', error);
      }
    };

    setupRoute();
  }, [simulationData, map3DReady]);

  // Initialize map when modal opens and simulation data is loaded
  useEffect(() => {
    if (open && simulationData && !map3DElementRef.current) {
      initialize3DMap();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [open, simulationData, initialize3DMap]);

  // Cleanup when modal closes
  useEffect(() => {
    if (!open) {
      // Cancel any ongoing animation
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // Clear the map container
      if (mapContainerRef.current) {
        mapContainerRef.current.innerHTML = '';
      }

      // Reset state
      setMap3DReady(false);
      setSimulationData(null);
      setCurrentTime(0);
      setProgress(0);
      setIsPlaying(false);
      setCurrentWaypoint(null);
      setNextWaypoint(null);

      // Clear refs
      markers3DRef.current = [];
      polyline3DRef.current = null;
      vehicleMarker3DRef.current = null;
      pathCoordsRef.current = [];
      map3DElementRef.current = null;
      googleRef.current = null;
    }
  }, [open]);

  // Get effective total duration
  const getEffectiveTotalDuration = useCallback(() => {
    if (!simulationData || simulationData.waypoints.length === 0) {
      return simulationData?.simulation_config.total_simulation_duration_seconds || 0;
    }
    const lastWaypoint = simulationData.waypoints[simulationData.waypoints.length - 1];
    const scaledLastDeparture = lastWaypoint.departure_time_seconds / simulationData.simulation_config.speed_multiplier;
    return Math.max(simulationData.simulation_config.total_simulation_duration_seconds, scaledLastDeparture);
  }, [simulationData]);

  // Update camera position during animation
  const updateCameraPosition = useCallback((time: number) => {
    if (!simulationData || !map3DElementRef.current) return;

    const speedMultiplier = simulationData.simulation_config.speed_multiplier;
    const scaledCurrentTime = time * speedMultiplier;

    // Find current waypoint and next stop
    let currentWp: Waypoint | null = null;
    let nextWp: Waypoint | null = null;

    for (let i = 0; i < simulationData.waypoints.length; i++) {
      const wp = simulationData.waypoints[i];
      const scaledArrival = wp.arrival_time_seconds / speedMultiplier;
      const scaledDeparture = wp.departure_time_seconds / speedMultiplier;

      // Currently at this waypoint (stopped)
      if (time >= scaledArrival && time < scaledDeparture) {
        currentWp = wp;

        // Find next delivery stop
        for (let j = i + 1; j < simulationData.waypoints.length; j++) {
          if (simulationData.waypoints[j].type === 'delivery_stop' ||
              simulationData.waypoints[j].type === 'warehouse_return') {
            nextWp = simulationData.waypoints[j];
            break;
          }
        }
        break;
      }
      // In transit to next waypoint
      else if (time >= scaledDeparture && i + 1 < simulationData.waypoints.length) {
        const nextWaypoint = simulationData.waypoints[i + 1];
        const nextScaledArrival = nextWaypoint.arrival_time_seconds / speedMultiplier;

        if (time < nextScaledArrival) {
          // Calculate progress within this transit segment
          const segmentTravelTime = nextScaledArrival - scaledDeparture;
          const timeIntoSegment = time - scaledDeparture;
          const segmentProgress = segmentTravelTime > 0 ? timeIntoSegment / segmentTravelTime : 0;

          // Create placeholder for in-transit
          const inTransitName = nextWaypoint.client_name ? `En route to ${nextWaypoint.client_name}` : 'In transit';
          currentWp = {
            ...wp,
            type: 'in_transit',
            client_name: inTransitName,
            cumulative_distance_km: wp.cumulative_distance_km +
              (nextWaypoint.cumulative_distance_km - wp.cumulative_distance_km) * segmentProgress,
          };

          // Set current location name for in-transit
          setCurrentLocationName(inTransitName);

          // Find next delivery stop
          for (let j = i + 1; j < simulationData.waypoints.length; j++) {
            if (simulationData.waypoints[j].type === 'delivery_stop' ||
                simulationData.waypoints[j].type === 'warehouse_return') {
              nextWp = simulationData.waypoints[j];
              break;
            }
          }
          break;
        }
      }
    }

    // Fallback to first waypoint if nothing matched
    if (!currentWp && simulationData.waypoints.length > 0) {
      currentWp = simulationData.waypoints[0];
      for (let i = 1; i < simulationData.waypoints.length; i++) {
        if (simulationData.waypoints[i].type === 'delivery_stop') {
          nextWp = simulationData.waypoints[i];
          break;
        }
      }
    }

    setCurrentWaypoint(currentWp);
    setNextWaypoint(nextWp);

    // Calculate ETA and distance to next stop
    if (nextWp) {
      const scaledNextArrival = nextWp.arrival_time_seconds / speedMultiplier;
      const remainingTime = Math.max(0, scaledNextArrival - time);
      setEtaToNextStop(remainingTime);

      if (currentWp) {
        const distanceToNext = nextWp.cumulative_distance_km - (currentWp.cumulative_distance_km || 0);
        setDistanceToNextStop(Math.max(0, distanceToNext));
      }
    } else {
      setEtaToNextStop(null);
      setDistanceToNextStop(null);
    }

    // Smoothly animate camera along route
    const totalDuration = simulationData.simulation_config.real_duration_seconds;
    const progressRatio = Math.min(scaledCurrentTime / totalDuration, 1);

    if (pathCoordsRef.current.length > 0) {
      const pathIndex = Math.floor(progressRatio * (pathCoordsRef.current.length - 1));
      const position = pathCoordsRef.current[Math.min(pathIndex, pathCoordsRef.current.length - 1)];

      if (position) {
        // Update vehicle marker position
        if (vehicleMarker3DRef.current) {
          vehicleMarker3DRef.current.position = {
            lat: position.lat,
            lng: position.lng,
            altitude: 30
          };
        }

        // Animate camera to follow route - using direct property updates for smooth animation
        if (map3DElementRef.current) {
          // Calculate heading towards next point
          let heading = map3DElementRef.current.heading || 0;
          if (pathIndex < pathCoordsRef.current.length - 1) {
            const nextPos = pathCoordsRef.current[pathIndex + 1];
            const deltaLng = nextPos.lng - position.lng;
            const deltaLat = nextPos.lat - position.lat;
            heading = Math.atan2(deltaLng, deltaLat) * (180 / Math.PI);
          }

          // Set camera to follow vehicle from behind and above
          map3DElementRef.current.center = {
            lat: position.lat,
            lng: position.lng,
            altitude: 100
          };
          map3DElementRef.current.range = 1500;
          map3DElementRef.current.tilt = 70;
          map3DElementRef.current.heading = heading;
        }
      }
    }
  }, [simulationData]);

  // Animation loop
  useEffect(() => {
    if (isPlaying && simulationData) {
      const maxTime = getEffectiveTotalDuration();

      const animate = () => {
        const now = Date.now();
        const deltaTime = (now - lastUpdateTimeRef.current) / 1000;
        lastUpdateTimeRef.current = now;

        setCurrentTime((prevTime) => {
          const newTime = prevTime + deltaTime;

          if (newTime >= maxTime) {
            setIsPlaying(false);
            setProgress(100);
            return maxTime;
          }

          setProgress((newTime / maxTime) * 100);
          updateCameraPosition(newTime);
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
  }, [isPlaying, simulationData, getEffectiveTotalDuration, updateCameraPosition]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    setProgress(0);
    setEtaToNextStop(null);
    setDistanceToNextStop(null);

    if (simulationData && map3DElementRef.current) {
      const firstWp = simulationData.waypoints[0];
      const lastWp = simulationData.waypoints[simulationData.waypoints.length - 1];
      const centerLat = (firstWp.latitude + lastWp.latitude) / 2;
      const centerLng = (firstWp.longitude + lastWp.longitude) / 2;

      // Reset camera to overview of entire route
      map3DElementRef.current.center = { lat: centerLat, lng: centerLng, altitude: 200 };
      map3DElementRef.current.range = 10000;
      map3DElementRef.current.tilt = 55;
      map3DElementRef.current.heading = 0;

      // Reset vehicle marker to start position
      if (vehicleMarker3DRef.current && pathCoordsRef.current.length > 0) {
        vehicleMarker3DRef.current.position = {
          lat: pathCoordsRef.current[0].lat,
          lng: pathCoordsRef.current[0].lng,
          altitude: 30
        };
      }

      setCurrentWaypoint(simulationData.waypoints[0]);
      if (simulationData.waypoints.length > 1) {
        setNextWaypoint(simulationData.waypoints[1]);
      }
    }
  };

  const handleSpeedChange = async (newSpeed: number[]) => {
    const newSpeedValue = newSpeed[0];
    const wasPlaying = isPlaying;
    setIsPlaying(false);
    setSpeed(newSpeedValue);
    setCurrentTime(0);
    setProgress(0);
    setCurrentWaypoint(null);
    setNextWaypoint(null);
    setEtaToNextStop(null);
    setDistanceToNextStop(null);
    setSimulationData(null);

    // Clear the entire map container to avoid overlay accumulation
    if (mapContainerRef.current) {
      mapContainerRef.current.innerHTML = '';
    }

    // Clear 3D element references
    markers3DRef.current = [];
    polyline3DRef.current = null;
    vehicleMarker3DRef.current = null;
    pathCoordsRef.current = [];
    setMap3DReady(false);
    map3DElementRef.current = null;

    // Reinitialize the map with new data
    await initialize3DMap();

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
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-indigo-600 to-purple-600">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Mountain className="h-5 w-5" />
            3D Route Simulation: {routeName}
            <Badge variant="secondary" className="ml-2 bg-white/20 text-white border-0">
              BETA
            </Badge>
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Modal Content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(95vh - 80px)' }}>
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading 3D Simulation...</p>
              </div>
            </div>
          ) : simulationData ? (
            <div className="flex flex-col gap-4 p-4">
              {/* Driver & Vehicle Info Panel */}
              {(simulationData.driver_info || simulationData.vehicle_info) && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                  {simulationData.driver_info && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
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
                      <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
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

              {/* 3D Map Container */}
              <div
                ref={mapContainerRef}
                className="w-full h-[500px] rounded-lg border-2 border-indigo-200 bg-gray-100"
                style={{ minHeight: '500px' }}
              />
              {!map3DReady && (
                <div className="flex items-center justify-center h-[500px] -mt-[500px]">
                  <div className="text-center text-gray-500">
                    <Eye className="w-16 h-16 mx-auto mb-4 text-indigo-400" />
                    <p>Initializing 3D Map...</p>
                  </div>
                </div>
              )}

              {/* Info Panel */}
              {simulationData && (
                <div className="grid grid-cols-3 gap-4 p-4 bg-indigo-50 rounded-lg">
                  <div className="space-y-1">
                    <div className="text-xs text-indigo-600 uppercase font-medium">Current Location</div>
                    <div className="text-sm font-semibold">
                      {currentWaypoint?.type === 'in_transit' && currentLocationName
                        ? currentLocationName
                        : (currentWaypoint?.client_name || (currentWaypoint?.type === 'warehouse' ? 'Warehouse' : 'Starting...'))}
                    </div>
                    {currentWaypoint?.type === 'in_transit' && (
                      <div className="text-xs text-blue-600 flex items-center gap-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        In transit
                      </div>
                    )}
                    {currentWaypoint?.type === 'delivery_stop' && (
                      <div className="text-xs text-green-600 font-semibold flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        {currentWaypoint.quantity_to_deliver
                          ? `Offloading ${currentWaypoint.quantity_to_deliver} tonnes`
                          : 'Servicing stop...'}
                      </div>
                    )}
                    {currentWaypoint?.type === 'in_transit' && nextWaypoint?.quantity_to_deliver && (
                      <div className="text-xs text-gray-600">{nextWaypoint.quantity_to_deliver} tonnes to deliver at next stop</div>
                    )}
                    {currentWaypoint?.type === 'warehouse' && (
                      <div className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                        <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                        Preparing for departure
                      </div>
                    )}
                    {currentWaypoint?.type === 'warehouse_return' && (
                      <div className="text-xs text-green-600 font-semibold flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        ✓ Returned to warehouse
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-indigo-600 uppercase font-medium">Next Stop</div>
                    {progress >= 100 ? (
                      <div className="text-sm font-semibold text-green-600">🎉 Simulation Complete!</div>
                    ) : nextWaypoint ? (
                      <>
                        <div className="text-sm font-semibold">
                          {nextWaypoint.client_name || 'Warehouse'}
                        </div>
                        {nextWaypoint.quantity_to_deliver && (
                          <div className="text-xs text-gray-600">{nextWaypoint.quantity_to_deliver} tonnes</div>
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
                    <div className="text-xs text-indigo-600 uppercase font-medium">Progress</div>
                    <div className="text-sm font-semibold">{progress.toFixed(1)}%</div>
                    <div className="text-xs text-gray-600">
                      {formatTime(currentTime)} / {formatTime(getEffectiveTotalDuration())}
                    </div>
                    {progress >= 100 && (
                      <div className="text-xs text-green-600 font-semibold">All deliveries completed</div>
                    )}
                  </div>
                </div>
              )}

              {/* Controls */}
              <div className="flex items-center gap-4 p-4 bg-white border rounded-lg">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handlePlayPause} 
                  className="w-24"
                  disabled={!simulationData}
                >
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

                <Button variant="outline" size="sm" onClick={handleReset} disabled={!simulationData}>
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

                {simulationData && (
                  <>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin className="w-4 h-4" />
                      {simulationData.waypoints.length} stops
                    </div>

                    {(simulationData.directions?.total_distance_km || simulationData.simulation_config?.total_distance_km) && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="w-4 h-4" />
                        {(simulationData.directions?.total_distance_km || simulationData.simulation_config?.total_distance_km || 0).toFixed(1)} km
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
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
