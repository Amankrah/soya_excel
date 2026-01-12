'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { X, Play, Pause, RotateCcw, MapPin, Clock, Eye, User, Car, Truck } from 'lucide-react';
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
  const [directionsPath, setDirectionsPath] = useState<Array<{ lat: number; lng: number }>>([]);

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

  // Load route directions from Google Maps Directions API for realistic road path
  const loadRouteDirections = useCallback(async () => {
    if (!simulationData) return;

    try {
      const googleMaps = await loadGoogleMaps();
      const directionsService = new googleMaps.maps.DirectionsService();

      // Build waypoints array (excluding first and last)
      const waypoints = simulationData.waypoints
        .slice(1, -1)
        .map(wp => ({
          location: new googleMaps.maps.LatLng(wp.latitude, wp.longitude),
          stopover: true
        }));

      const origin = new googleMaps.maps.LatLng(
        simulationData.start_location.latitude,
        simulationData.start_location.longitude
      );

      const destination = new googleMaps.maps.LatLng(
        simulationData.end_location.latitude,
        simulationData.end_location.longitude
      );

      const result = await directionsService.route({
        origin,
        destination,
        waypoints,
        travelMode: googleMaps.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      });

      // Extract path coordinates from directions - this gives us the actual road path
      const path: Array<{ lat: number; lng: number }> = [];
      result.routes[0].legs.forEach(leg => {
        leg.steps.forEach(step => {
          step.path.forEach(point => {
            path.push({ lat: point.lat(), lng: point.lng() });
          });
        });
      });

      setDirectionsPath(path);
      // Also update pathCoordsRef for 3D elements
      pathCoordsRef.current = path.map(c => ({ ...c, altitude: 0 }));
    } catch (error) {
      console.error('Error loading directions:', error);
      // Fallback to simple path if directions fail
      const fallbackPath = simulationData.waypoints.map(wp => ({
        lat: wp.latitude,
        lng: wp.longitude
      }));
      setDirectionsPath(fallbackPath);
      pathCoordsRef.current = fallbackPath.map(c => ({ ...c, altitude: 0 }));
    }
  }, [simulationData]);

  // Helper function to find the closest path index for a waypoint, searching from a minimum index
  const findClosestPathIndexFrom = useCallback((
    waypoint: Waypoint,
    path: Array<{ lat: number; lng: number }>,
    fromIndex: number = 0
  ): number => {
    if (path.length === 0) return 0;

    let closestIndex = fromIndex;
    let closestDistance = Infinity;

    // Search only from fromIndex onwards to ensure forward progression
    for (let i = fromIndex; i < path.length; i++) {
      const pathPoint = path[i];
      const distance = Math.sqrt(
        Math.pow(pathPoint.lat - waypoint.latitude, 2) +
        Math.pow(pathPoint.lng - waypoint.longitude, 2)
      );
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    }
    return closestIndex;
  }, []);

  // Pre-calculate path indices for all waypoints in sequence order
  // This ensures the vehicle always moves forward along the path
  const waypointPathIndices = useMemo(() => {
    if (!simulationData || directionsPath.length === 0) return new Map<string, number>();

    const indices = new Map<string, number>();
    let lastIndex = 0;

    for (const wp of simulationData.waypoints) {
      // For warehouse return, use the end of the path
      if (wp.type === 'warehouse_return') {
        indices.set(wp.id, directionsPath.length - 1);
      } else {
        // Find closest point from the last index onwards (forward only)
        const pathIndex = findClosestPathIndexFrom(wp, directionsPath, lastIndex);
        indices.set(wp.id, pathIndex);
        lastIndex = pathIndex;
      }
    }

    return indices;
  }, [simulationData, directionsPath, findClosestPathIndexFrom]);

  // Helper to get waypoint path index from pre-calculated map
  const getWaypointPathIndex = useCallback((waypoint: Waypoint): number => {
    return waypointPathIndices.get(waypoint.id) ?? 0;
  }, [waypointPathIndices]);

  // Initialize 3D Map - creates a single photorealistic 3D map
  const initialize3DMap = useCallback(async () => {
    if (!mapContainerRef.current) return;

    // Prevent duplicate initialization
    if (map3DElementRef.current) {
      console.log('Map already initialized, skipping...');
      return;
    }

    // Clear the container completely to avoid duplicate maps
    while (mapContainerRef.current.firstChild) {
      mapContainerRef.current.removeChild(mapContainerRef.current.firstChild);
    }

    try {
      const googleMaps = await loadGoogleMaps();
      googleRef.current = googleMaps;

      // Import the maps3d library following Google's official pattern
      await googleMaps.maps.importLibrary('maps3d');

      // Create gmp-map-3d element using document.createElement (Google's recommended approach)
      // This creates a single photorealistic 3D map with HYBRID mode
      const map3DElement = document.createElement('gmp-map-3d');
      
      // Set attributes for photorealistic 3D with clear road-focused view
      map3DElement.setAttribute('center', '45.5017,-73.5673,25'); // lat,lng,altitude
      map3DElement.setAttribute('range', '250'); // Medium range for clear visibility
      map3DElement.setAttribute('tilt', '67'); // Moderate tilt for clear forward view
      map3DElement.setAttribute('heading', '0');
      map3DElement.setAttribute('mode', 'hybrid'); // HYBRID mode for photorealistic 3D
      
      // Set the map element to fill its container
      map3DElement.style.width = '100%';
      map3DElement.style.height = '100%';
      map3DElement.style.display = 'block';

      // Append the 3D map element to the container
      mapContainerRef.current.appendChild(map3DElement);
      map3DElementRef.current = map3DElement;

      // Add event listeners
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
      setTimeout(() => setMap3DReady(true), 1500);

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

        // Load route directions from Google Maps for realistic road path
        await loadRouteDirections();

        // Import 3D libraries following Google's official pattern
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { Polyline3DInteractiveElement, Marker3DElement, AltitudeMode } = await googleMaps.maps.importLibrary('maps3d') as any;

        // Clear existing overlays - just reset references without trying to remove
        // The Map3DElement will handle its own cleanup
        markers3DRef.current = [];
        polyline3DRef.current = null;

        // Use directions path (actual road path) if available, otherwise use waypoints
        const coords = pathCoordsRef.current.length > 0
          ? pathCoordsRef.current.map(c => ({ lat: c.lat, lng: c.lng }))
          : simulationData.waypoints.map(wp => ({ lat: wp.latitude, lng: wp.longitude }));

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

          // Create vehicle marker at start location with truck icon
          const startLocation = simulationData.start_location;
          
          // Import PinElement for custom marker styling
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { PinElement } = await googleMaps.maps.importLibrary('marker') as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { Marker3DInteractiveElement } = await googleMaps.maps.importLibrary('maps3d') as any;
          
          const vehicleMarker = new Marker3DInteractiveElement({
            position: {
              lat: startLocation.latitude,
              lng: startLocation.longitude,
              altitude: 15
            },
            altitudeMode: AltitudeMode.RELATIVE_TO_GROUND,
            extruded: true,
          });

          // Create PinElement with truck emoji glyph (more reliable than SVG)
          const pin = new PinElement({
            background: '#3b82f6',
            borderColor: '#1d4ed8',
            glyphColor: 'white',
            glyph: '🚛', // Truck emoji - visible and reliable
            scale: 1.5,
          });

          vehicleMarker.append(pin);
          map3D.append(vehicleMarker);
          vehicleMarker3DRef.current = vehicleMarker;
        }

        // Center map on start location with clear road-focused camera
        if (simulationData.start_location) {
          const startLocation = simulationData.start_location;

          // Chase camera with clear forward view
          map3D.setAttribute('center', `${startLocation.latitude},${startLocation.longitude},25`);
          map3D.setAttribute('range', '250'); // Medium range for clear visibility
          map3D.setAttribute('tilt', '67'); // Moderate tilt for clear forward view
          map3D.setAttribute('heading', '0');
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
  }, [simulationData, map3DReady, loadRouteDirections]);

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
      setDirectionsPath([]);

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

  // Update camera and vehicle position during animation
  const updateCameraPosition = useCallback((time: number) => {
    if (!simulationData || !map3DElementRef.current || directionsPath.length === 0) return;

    const waypoints = simulationData.waypoints;
    const speedMultiplier = simulationData.simulation_config.speed_multiplier;

    let currentLocationWaypoint: Waypoint | null = null;
    let nextStopWaypoint: Waypoint | null = null;
    let currentPos: { lat: number; lng: number } | null = null;

    // Find which segment we're in based on SCALED waypoint times
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];

      // Scale waypoint times to simulation time
      const scaledArrival = wp.arrival_time_seconds / speedMultiplier;
      const scaledDeparture = wp.departure_time_seconds / speedMultiplier;

      // Check if we're currently at or servicing this waypoint
      if (time >= scaledArrival && time < scaledDeparture) {
        currentLocationWaypoint = wp;

        // Position vehicle at this waypoint using pre-calculated index
        const waypointPathIndex = getWaypointPathIndex(wp);
        currentPos = directionsPath[waypointPathIndex];

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
      else if (time >= scaledDeparture && i + 1 < waypoints.length) {
        const nextWp = waypoints[i + 1];
        const nextScaledArrival = nextWp.arrival_time_seconds / speedMultiplier;

        if (time < nextScaledArrival) {
          // Calculate progress within this transit segment
          const segmentTravelTime = nextScaledArrival - scaledDeparture;
          const timeIntoSegment = time - scaledDeparture;
          const segmentProgress = segmentTravelTime > 0 ? timeIntoSegment / segmentTravelTime : 0;

          // Find path indices for current and next waypoints using pre-calculated indices
          const currentWpPathIndex = getWaypointPathIndex(wp);
          const nextWpPathIndex = getWaypointPathIndex(nextWp);

          // Interpolate position along the path segment (following the road)
          const pathSegmentLength = nextWpPathIndex - currentWpPathIndex;
          const targetPathIndex = Math.min(
            currentWpPathIndex + Math.floor(segmentProgress * pathSegmentLength),
            directionsPath.length - 1
          );

          currentPos = directionsPath[Math.max(0, targetPathIndex)];

          // Find next delivery stop
          for (let j = i + 1; j < waypoints.length; j++) {
            if (waypoints[j].type === 'delivery_stop' || waypoints[j].type === 'warehouse_return') {
              nextStopWaypoint = waypoints[j];
              break;
            }
          }

          // Create a placeholder waypoint for in-transit display
          const inTransitName = nextStopWaypoint ? `En route to ${nextStopWaypoint.name}` : 'In transit';
          currentLocationWaypoint = {
            ...wp,
            name: inTransitName,
            type: 'in_transit',
            cumulative_distance_km: wp.cumulative_distance_km +
              (nextWp.cumulative_distance_km - wp.cumulative_distance_km) * segmentProgress,
          };

          setCurrentLocationName(inTransitName);
          break;
        }
      }
    }

    // Fallback if no waypoint matched (at the start)
    if (!currentLocationWaypoint && waypoints.length > 0) {
      currentLocationWaypoint = waypoints[0];
      const waypointPathIndex = getWaypointPathIndex(waypoints[0]);
      currentPos = directionsPath[waypointPathIndex];

      // Find first delivery stop
      for (let i = 1; i < waypoints.length; i++) {
        if (waypoints[i].type === 'delivery_stop') {
          nextStopWaypoint = waypoints[i];
          break;
        }
      }
    }

    setCurrentWaypoint(currentLocationWaypoint);
    setNextWaypoint(nextStopWaypoint);

    // Calculate ETA to next stop based on scaled waypoint times
    if (nextStopWaypoint) {
      const scaledNextArrival = nextStopWaypoint.arrival_time_seconds / speedMultiplier;
      const remainingTimeToNext = Math.max(0, scaledNextArrival - time);
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

    // Update vehicle marker position and camera
    if (currentPos) {
      // Calculate heading towards next point on the path
      let heading = 0;

      // Find current position index in the path
      const currentPathIndex = directionsPath.findIndex(
        p => p.lat === currentPos.lat && p.lng === currentPos.lng
      );

      if (currentPathIndex >= 0 && currentPathIndex < directionsPath.length - 1) {
        const nextPos = directionsPath[currentPathIndex + 1];
        const deltaLng = nextPos.lng - currentPos.lng;
        const deltaLat = nextPos.lat - currentPos.lat;
        heading = Math.atan2(deltaLng, deltaLat) * (180 / Math.PI);
      }

      // Update vehicle marker position
      if (vehicleMarker3DRef.current) {
        vehicleMarker3DRef.current.position = {
          lat: currentPos.lat,
          lng: currentPos.lng,
          altitude: 5 // Very low altitude - just above the road
        };
      }

      // Professional video game style camera - centered on vehicle with forward offset
      if (map3DElementRef.current) {
        // Calculate camera offset to look ahead of the vehicle
        const headingRad = (heading * Math.PI) / 180;

        // Position camera slightly ahead of the vehicle to show the road ahead
        const lookAheadDistance = 0.0008; // ~80m ahead to see the road coming
        const cameraLat = currentPos.lat + Math.cos(headingRad) * lookAheadDistance;
        const cameraLng = currentPos.lng + Math.sin(headingRad) * lookAheadDistance;

        // Dynamic camera settings for clear road-focused view
        const cameraAltitude = 30; // Slightly higher for better perspective
        const cameraRange = 300; // Wider range to keep vehicle visible
        const cameraTilt = 65; // Good tilt for forward road view

        // Center camera on point ahead of vehicle (keeps vehicle in view)
        map3DElementRef.current.setAttribute('center', `${cameraLat},${cameraLng},${cameraAltitude}`);
        map3DElementRef.current.setAttribute('range', cameraRange.toString());
        map3DElementRef.current.setAttribute('tilt', cameraTilt.toString());
        map3DElementRef.current.setAttribute('heading', heading.toString()); // Camera follows vehicle heading
      }
    }
  }, [simulationData, directionsPath, getWaypointPathIndex]);

  // Animation loop - matches 2D modal behavior
  useEffect(() => {
    if (isPlaying && simulationData && directionsPath.length > 0) {
      const maxTime = getEffectiveTotalDuration();

      const animate = () => {
        const now = Date.now();
        const deltaTime = (now - lastUpdateTimeRef.current) / 1000;
        lastUpdateTimeRef.current = now;

        setCurrentTime((prevTime) => {
          const newTime = prevTime + deltaTime;

          if (newTime >= maxTime) {
            setIsPlaying(false);
            updateCameraPosition(maxTime); // Final position update
            setProgress(100);
            return maxTime;
          }

          updateCameraPosition(newTime);
          setProgress((newTime / maxTime) * 100);
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
  }, [isPlaying, simulationData, directionsPath, getEffectiveTotalDuration, updateCameraPosition]);

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

    if (simulationData && map3DElementRef.current) {
      const startLocation = simulationData.start_location;

      // Reset camera to start location with clear road view
      map3DElementRef.current.setAttribute('center', `${startLocation.latitude},${startLocation.longitude},25`);
      map3DElementRef.current.setAttribute('range', '250'); // Medium range for clear visibility
      map3DElementRef.current.setAttribute('tilt', '67'); // Moderate tilt for clear forward view
      map3DElementRef.current.setAttribute('heading', '0');

      // Reset vehicle marker to start position
      if (vehicleMarker3DRef.current) {
        vehicleMarker3DRef.current.position = {
          lat: startLocation.latitude,
          lng: startLocation.longitude,
          altitude: 5 // Very low - just above the road
        };
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
    setDirectionsPath([]);

    // Clear existing 3D overlays but keep the map
    markers3DRef.current = [];
    polyline3DRef.current = null;
    vehicleMarker3DRef.current = null;
    pathCoordsRef.current = [];

    // Clear simulation data to trigger reload
    setSimulationData(null);
    setMap3DReady(false);

    // Clear the map container and refs - map will be reinitialized when new data loads
    if (mapContainerRef.current) {
      while (mapContainerRef.current.firstChild) {
        mapContainerRef.current.removeChild(mapContainerRef.current.firstChild);
      }
    }
    map3DElementRef.current = null;

    // Reload simulation data with new speed - useEffects will handle map initialization
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
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-indigo-600 to-purple-600">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Truck className="h-5 w-5" />
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

              {/* 3D Map Container - single map only */}
              <div
                ref={mapContainerRef}
                className="w-full h-[500px] rounded-lg border-2 border-indigo-200 bg-gray-100 overflow-hidden relative"
                style={{ minHeight: '500px', maxHeight: '500px' }}
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
                        : (currentWaypoint?.name || 'Starting...')}
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
                          ? `Offloading ${currentWaypoint.quantity_to_deliver.toFixed(2)} tonnes`
                          : 'Servicing stop...'}
                      </div>
                    )}
                    {currentWaypoint?.type === 'in_transit' && nextWaypoint?.quantity_to_deliver && (
                      <div className="text-xs text-gray-600">{nextWaypoint.quantity_to_deliver.toFixed(2)} tonnes to deliver at next stop</div>
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
                          {nextWaypoint.name}
                        </div>
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
                      {simulationData.simulation_config.total_stops} stops
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Clock className="w-4 h-4" />
                      {simulationData.simulation_config.total_distance_km.toFixed(1)} km
                    </div>
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
