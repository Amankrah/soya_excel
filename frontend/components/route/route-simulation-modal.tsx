'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Truck, X, Play, Pause, RotateCcw, MapPin, Clock, User, Car, Video, Eye, Leaf, Fuel, TrendingDown } from 'lucide-react';
import { routeAPI } from '@/lib/api';
import { toast } from 'sonner';
import { loadGoogleMaps } from '@/lib/google-maps';

type CameraMode = 'overview' | 'chase' | 'cinematic';

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
  segment_distance_km?: number;  // Distance from previous stop (Google Maps)
  segment_duration_seconds?: number;  // Travel time from previous stop (Google ETA)
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
    total_travel_time_seconds?: number;  // Travel time only (excludes service time)
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
  emissions_data?: {
    success: boolean;
    total_emissions_kg_co2e: number;
    total_emissions_tonnes_co2e: number;
    delivery_emissions_kg_co2e: number;
    return_emissions_kg_co2e: number;
    estimated_fuel_liters: number;
    kpi_metrics: {
      kg_co2e_per_tonne: number;
      kg_co2e_per_km: number;
      kg_co2e_per_tonne_km: number;
    };
    methodology: string;
    standard: string;
    vehicle_info?: {
      vehicle_type: string;
      capacity_tonnes: number | null;
      total_mass_tonnes: number;
      utilization_pct: number | null;
    };
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
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [currentSpeed, setCurrentSpeed] = useState(0); // km/h for display (real-world speed)
  const currentSegmentSpeedRef = useRef<number>(0); // Store calculated segment speed

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
  
  // Camera control refs for smooth transitions
  const currentCameraHeadingRef = useRef<number>(0);
  const currentCameraTiltRef = useRef<number>(0);
  const currentCameraZoomRef = useRef<number>(15);
  const targetCameraHeadingRef = useRef<number>(0);
  const targetCameraTiltRef = useRef<number>(0);
  const targetCameraZoomRef = useRef<number>(15);
  const vehicleHeadingRef = useRef<number>(0);
  const trailPolylineRef = useRef<google.maps.Polyline | null>(null);
  const trailPathRef = useRef<google.maps.LatLng[]>([]);
  const lastVehiclePositionRef = useRef<google.maps.LatLng | null>(null);

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

      // Configure map with 3D tilt support and smooth controls
      const map = new google.maps.Map(mapContainerRef.current, {
        center: { lat: startLocation.latitude, lng: startLocation.longitude },
        zoom: 15,
        mapTypeId: 'roadmap',
        tilt: cameraMode === 'chase' || cameraMode === 'cinematic' ? 45 : 0,
        heading: 0,
        gestureHandling: 'greedy',
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        rotateControl: true,
        // Enable smooth map interactions
        scrollwheel: true,
        disableDoubleClickZoom: false,
        // Dark style for video game feel
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
          { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
          { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#255763' }] },
          { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2c6675' }] },
          { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#255763' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
          { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#283d6a' }] },
          { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
          { featureType: 'landscape', stylers: [{ color: '#1d2c4d' }] },
        ],
      });

      mapRef.current = map;
      
      // Initialize camera refs
      currentCameraHeadingRef.current = 0;
      currentCameraTiltRef.current = cameraMode === 'chase' || cameraMode === 'cinematic' ? 45 : 0;
      currentCameraZoomRef.current = 15;

      // Get route directions from Google Maps for realistic path
      await loadRouteDirections(map);

      // Add waypoint markers with glow effect
      simulationData.waypoints.forEach((waypoint, index) => {
        const isWarehouse = waypoint.type === 'warehouse' || waypoint.type === 'warehouse_return';
        const baseColor = isWarehouse ? '#f59e0b' : '#10b981';
        
        // Create glowing marker effect with custom icon
        const marker = new google.maps.Marker({
          position: { lat: waypoint.latitude, lng: waypoint.longitude },
          map: map,
          title: waypoint.name,
          label: {
            text: `${index + 1}`,
            color: 'white',
            fontSize: '11px',
            fontWeight: 'bold',
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: baseColor,
            fillOpacity: 0.9,
            strokeColor: baseColor,
            strokeWeight: 4,
            strokeOpacity: 0.4,
          },
          zIndex: 100 + index,
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 12px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white; border-radius: 8px; min-width: 180px;">
              <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px; color: ${baseColor};">${waypoint.name}</div>
              <div style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">${waypoint.address}</div>
              ${waypoint.quantity_to_deliver ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #334155;"><span style="color: #10b981; font-weight: bold;">${waypoint.quantity_to_deliver.toFixed(2)} tonnes</span></div>` : ''}
            </div>
          `,
        });

        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });

        waypointMarkersRef.current.push(marker);
      });

      // Create vehicle trail polyline
      const trailPolyline = new google.maps.Polyline({
        path: [],
        geodesic: true,
        strokeColor: '#3b82f6',
        strokeOpacity: 0.6,
        strokeWeight: 4,
        map: map,
        zIndex: 500,
      });
      trailPolylineRef.current = trailPolyline;
      trailPathRef.current = [];

      // Create enhanced vehicle marker with glow effect
      // Arrow pointing UP (north) at 0° rotation - tip at negative Y
      const vehicleMarker = new google.maps.Marker({
        position: { lat: startLocation.latitude, lng: startLocation.longitude },
        map: map,
        title: 'Delivery Vehicle',
        icon: {
          path: 'M 0,-8 L 5,4 L 2,4 L 2,8 L -2,8 L -2,4 L -5,4 Z', // Arrow pointing UP at 0°
          scale: 2.5,
          fillColor: '#60a5fa',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          rotation: 0,
          anchor: new google.maps.Point(0, 0),
        },
        zIndex: 1000,
      });

      vehicleMarkerRef.current = vehicleMarker;
      lastVehiclePositionRef.current = new google.maps.LatLng(startLocation.latitude, startLocation.longitude);

      // Fit map to bounds initially
      const bounds = new google.maps.LatLngBounds();
      simulationData.waypoints.forEach((waypoint) => {
        bounds.extend({ lat: waypoint.latitude, lng: waypoint.longitude });
      });
      map.fitBounds(bounds);
      
      // Set initial camera for chase mode after a short delay
      setTimeout(() => {
        if (cameraMode === 'chase' || cameraMode === 'cinematic') {
          map.setZoom(17);
          map.setTilt(45);
        }
      }, 500);
    } catch (error) {
      console.error('Error initializing map:', error);
      toast.error('Failed to initialize map');
    }
  }, [simulationData, loadRouteDirections, cameraMode]);

  // Initialize Google Maps
  useEffect(() => {
    if (simulationData && mapContainerRef.current && !mapRef.current) {
      initializeMap();
    }
  }, [simulationData, initializeMap]);

  // Helper function to find the closest path index for a waypoint, searching from a minimum index
  const findClosestPathIndexFrom = useCallback((
    waypoint: Waypoint, 
    path: google.maps.LatLng[], 
    fromIndex: number = 0
  ): number => {
    if (path.length === 0) return 0;
    
    let closestIndex = fromIndex;
    let closestDistance = Infinity;
    
    // Search only from fromIndex onwards to ensure forward progression
    for (let i = fromIndex; i < path.length; i++) {
      const pathPoint = path[i];
      const distance = Math.sqrt(
        Math.pow(pathPoint.lat() - waypoint.latitude, 2) +
        Math.pow(pathPoint.lng() - waypoint.longitude, 2)
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

  // Smooth camera update function
  const updateCamera = useCallback((position: google.maps.LatLng, vehicleHeading: number, isAtStop: boolean) => {
    if (!mapRef.current) return;
    
    const map = mapRef.current;
    
    if (cameraMode === 'overview') {
      // Overview mode: top-down view, no rotation
      targetCameraTiltRef.current = 0;
      targetCameraZoomRef.current = 14;
      // Smooth pan to position
      map.panTo(position);
      map.setTilt(0);
      map.setHeading(0);
    } else if (cameraMode === 'chase') {
      // Chase cam: behind the vehicle, tilted view, rotates with vehicle
      targetCameraTiltRef.current = 55;
      targetCameraZoomRef.current = isAtStop ? 17 : 18;
      targetCameraHeadingRef.current = vehicleHeading;
      
      // Smooth interpolation for heading (handle 360 wraparound)
      let headingDiff = targetCameraHeadingRef.current - currentCameraHeadingRef.current;
      if (headingDiff > 180) headingDiff -= 360;
      if (headingDiff < -180) headingDiff += 360;
      currentCameraHeadingRef.current += headingDiff * 0.08; // Smooth factor
      
      // Normalize heading
      if (currentCameraHeadingRef.current > 180) currentCameraHeadingRef.current -= 360;
      if (currentCameraHeadingRef.current < -180) currentCameraHeadingRef.current += 360;
      
      // Smooth zoom
      const zoomDiff = targetCameraZoomRef.current - currentCameraZoomRef.current;
      currentCameraZoomRef.current += zoomDiff * 0.1;
      
      // Apply camera
      map.moveCamera({
        center: position,
        zoom: currentCameraZoomRef.current,
        heading: currentCameraHeadingRef.current,
        tilt: targetCameraTiltRef.current,
      });
    } else if (cameraMode === 'cinematic') {
      // Cinematic mode: smooth orbiting camera with dynamic angles
      const time = Date.now() / 1000;
      const orbitAngle = vehicleHeading + Math.sin(time * 0.3) * 30; // Gentle sway
      const dynamicTilt = 45 + Math.sin(time * 0.2) * 10; // Tilt variation
      const dynamicZoom = isAtStop ? 17 : (17.5 + Math.sin(time * 0.15) * 0.5);
      
      targetCameraHeadingRef.current = orbitAngle;
      targetCameraTiltRef.current = dynamicTilt;
      targetCameraZoomRef.current = dynamicZoom;
      
      // Smooth interpolation
      let headingDiff = targetCameraHeadingRef.current - currentCameraHeadingRef.current;
      if (headingDiff > 180) headingDiff -= 360;
      if (headingDiff < -180) headingDiff += 360;
      currentCameraHeadingRef.current += headingDiff * 0.05;
      
      const tiltDiff = targetCameraTiltRef.current - currentCameraTiltRef.current;
      currentCameraTiltRef.current += tiltDiff * 0.1;
      
      const zoomDiff = targetCameraZoomRef.current - currentCameraZoomRef.current;
      currentCameraZoomRef.current += zoomDiff * 0.1;
      
      map.moveCamera({
        center: position,
        zoom: currentCameraZoomRef.current,
        heading: currentCameraHeadingRef.current,
        tilt: currentCameraTiltRef.current,
      });
    }
  }, [cameraMode]);

  // Calculate the effective total duration from the last waypoint's departure time
  const getEffectiveTotalDuration = useCallback(() => {
    if (!simulationData) return 0;
    const waypoints = simulationData.waypoints;
    const speedMultiplier = simulationData.simulation_config.speed_multiplier;
    
    if (waypoints.length === 0) return simulationData.simulation_config.total_simulation_duration_seconds;
    
    // Use the last waypoint's departure time as the true end of simulation
    const lastWaypoint = waypoints[waypoints.length - 1];
    const scaledLastDeparture = lastWaypoint.departure_time_seconds / speedMultiplier;
    
    // Return the max of configured duration and actual waypoint-based duration
    return Math.max(
      simulationData.simulation_config.total_simulation_duration_seconds,
      scaledLastDeparture
    );
  }, [simulationData]);

  // Update vehicle position callback
  const updateVehiclePosition = useCallback((elapsedTime: number) => {
    if (!simulationData || !vehicleMarkerRef.current || directionsPath.length === 0) return;

    const waypoints = simulationData.waypoints;
    const speedMultiplier = simulationData.simulation_config.speed_multiplier;
    const effectiveTotalDuration = getEffectiveTotalDuration();

    let currentLocationWaypoint: Waypoint | null = null;
    let nextStopWaypoint: Waypoint | null = null;
    let isAtStopLocal = false;
    let currentPos: google.maps.LatLng | null = null;

    // Find which segment we're in based on SCALED waypoint times
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];

      // Scale waypoint times to simulation time
      const scaledArrival = wp.arrival_time_seconds / speedMultiplier;
      const scaledDeparture = wp.departure_time_seconds / speedMultiplier;

      // Check if we're currently at or servicing this waypoint
      if (elapsedTime >= scaledArrival && elapsedTime < scaledDeparture) {
        currentLocationWaypoint = wp;
        isAtStopLocal = true;
        
        // Vehicle is at a stop - set speed to 0
        currentSegmentSpeedRef.current = 0;
        setCurrentSpeed(0);

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
      else if (elapsedTime >= scaledDeparture && i + 1 < waypoints.length) {
        const nextWp = waypoints[i + 1];
        const nextScaledArrival = nextWp.arrival_time_seconds / speedMultiplier;

        if (elapsedTime < nextScaledArrival) {
          // Calculate progress within this transit segment
          const segmentTravelTime = nextScaledArrival - scaledDeparture;
          const timeIntoSegment = elapsedTime - scaledDeparture;
          const segmentProgress = segmentTravelTime > 0 ? timeIntoSegment / segmentTravelTime : 0;

          // Find path indices for current and next waypoints using pre-calculated indices
          const currentWpPathIndex = getWaypointPathIndex(wp);
          const nextWpPathIndex = getWaypointPathIndex(nextWp);

          // Interpolate position along the path segment
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

          // Calculate segment speed using Google Maps data
          // Speed = segment_distance_km / segment_duration_hours (real-world speed from Google)
          // The simulation speed multiplier only affects animation speed, NOT displayed vehicle speed
          
          // Try to get segment-specific data first (from Google Maps via backend)
          const segmentDistanceKm = nextWp.segment_distance_km || 
            (nextWp.cumulative_distance_km - wp.cumulative_distance_km);
          const segmentTimeSeconds = nextWp.segment_duration_seconds || 
            (nextWp.arrival_time_seconds - wp.departure_time_seconds);
          const segmentTimeHours = segmentTimeSeconds / 3600;
          
          let segmentSpeedKmh = 0;
          
          if (segmentTimeHours > 0 && segmentDistanceKm > 0) {
            // Best case: we have both distance and time from Google Maps
            segmentSpeedKmh = Math.round(segmentDistanceKm / segmentTimeHours);
          } else if (segmentTimeHours > 0) {
            // Fallback: no segment distance, use average route speed
            // Average speed = total_distance / total_travel_time (excludes service time at stops)
            const totalDistanceKm = simulationData.simulation_config.total_distance_km;
            // Use travel time only (excludes service time) for accurate speed
            const totalTravelSeconds = simulationData.simulation_config.total_travel_time_seconds || 
              simulationData.simulation_config.total_real_duration_seconds;
            if (totalTravelSeconds > 0 && totalDistanceKm > 0) {
              const avgSpeedKmh = (totalDistanceKm / totalTravelSeconds) * 3600;
              segmentSpeedKmh = Math.round(avgSpeedKmh);
            } else {
              segmentSpeedKmh = 85; // Default highway speed
            }
          } else {
            segmentSpeedKmh = 85; // Default if no time data
          }
          
          // Store and display speed (real-world km/h, unaffected by simulation multiplier)
          currentSegmentSpeedRef.current = segmentSpeedKmh;
          setCurrentSpeed(segmentSpeedKmh);

          // Create a placeholder waypoint for in-transit display
          currentLocationWaypoint = {
            ...wp,
            name: nextStopWaypoint ? `En route to ${nextStopWaypoint.name}` : 'In transit',
            type: 'in_transit',
            cumulative_distance_km: wp.cumulative_distance_km + 
              (nextWp.cumulative_distance_km - wp.cumulative_distance_km) * segmentProgress,
          };

          // Geocoding for in-transit location name
          if (currentPos) {
            const pathIndexKey = Math.floor(targetPathIndex / 50);

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
          }
          break;
        }
      }
    }

    // Fallback if no waypoint matched (at the start)
    if (!currentLocationWaypoint && waypoints.length > 0) {
      currentLocationWaypoint = waypoints[0];
      isAtStopLocal = true;
      setCurrentSpeed(0); // At start, not moving yet
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

    // Update vehicle marker position and heading
    if (currentPos && vehicleMarkerRef.current) {
      vehicleMarkerRef.current.setPosition(currentPos);

      // Find current path index for heading calculation
      const currentPathIndex = directionsPath.findIndex(
        p => p.lat() === currentPos!.lat() && p.lng() === currentPos!.lng()
      );
      
      // Calculate heading if we have next point
      let vehicleHeading = vehicleHeadingRef.current;
      if (currentPathIndex >= 0 && currentPathIndex + 1 < directionsPath.length) {
        const nextPos = directionsPath[currentPathIndex + 1];
        vehicleHeading = google.maps.geometry.spherical.computeHeading(currentPos, nextPos);
        vehicleHeadingRef.current = vehicleHeading;

        const icon = vehicleMarkerRef.current.getIcon() as google.maps.Symbol;
        if (icon) {
          icon.rotation = vehicleHeading;
          vehicleMarkerRef.current.setIcon(icon);
        }
      }

      // Update vehicle trail
      if (trailPolylineRef.current && !isAtStopLocal) {
        // Only add to trail if moved significantly
        const lastPos = lastVehiclePositionRef.current;
        if (lastPos) {
          const distance = google.maps.geometry.spherical.computeDistanceBetween(lastPos, currentPos);
          if (distance > 5) { // Add point every 5 meters
            trailPathRef.current.push(currentPos);
            // Keep trail to last 200 points for performance
            if (trailPathRef.current.length > 200) {
              trailPathRef.current = trailPathRef.current.slice(-200);
            }
            trailPolylineRef.current.setPath(trailPathRef.current);
            lastVehiclePositionRef.current = currentPos;
          }
        } else {
          lastVehiclePositionRef.current = currentPos;
        }
      }

      // Speed is already set in the transit/stop branches above
      // This is just a fallback for edge cases
      if (!currentLocationWaypoint) {
        setCurrentSpeed(0);
      }

      // Update camera based on mode
      if (mapRef.current) {
        updateCamera(currentPos, vehicleHeading, isAtStopLocal);
      }
    }

    // Update ref (kept for potential external use)
    isAtStopRef.current = isAtStopLocal;

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
    setProgress((elapsedTime / effectiveTotalDuration) * 100);
  }, [simulationData, directionsPath, getWaypointPathIndex, getEffectiveTotalDuration, updateCamera]);

  // Animation loop
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
            updateVehiclePosition(maxTime); // Final position update
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
  }, [isPlaying, simulationData, directionsPath, updateVehiclePosition, getEffectiveTotalDuration]);

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
    setCurrentSpeed(0);
    currentSegmentSpeedRef.current = 0;
    
    // Reset trail
    if (trailPolylineRef.current) {
      trailPolylineRef.current.setPath([]);
      trailPathRef.current = [];
    }
    
    // Reset camera refs
    currentCameraHeadingRef.current = 0;
    vehicleHeadingRef.current = 0;
    
    if (simulationData && vehicleMarkerRef.current) {
      const startLocation = simulationData.start_location;
      vehicleMarkerRef.current.setPosition({
        lat: startLocation.latitude,
        lng: startLocation.longitude,
      });
      lastVehiclePositionRef.current = new google.maps.LatLng(startLocation.latitude, startLocation.longitude);
      
      // Reset camera to start position with appropriate mode
      if (mapRef.current) {
        if (cameraMode === 'overview') {
          mapRef.current.panTo({ lat: startLocation.latitude, lng: startLocation.longitude });
          mapRef.current.setZoom(14);
          mapRef.current.setTilt(0);
          mapRef.current.setHeading(0);
        } else {
          mapRef.current.moveCamera({
            center: { lat: startLocation.latitude, lng: startLocation.longitude },
            zoom: 17,
            tilt: 45,
            heading: 0,
          });
        }
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

  // Handle camera mode change
  const handleCameraModeChange = useCallback((mode: CameraMode) => {
    setCameraMode(mode);
    
    if (mapRef.current && simulationData) {
      const currentPosition = vehicleMarkerRef.current?.getPosition();
      const position = currentPosition || new google.maps.LatLng(
        simulationData.start_location.latitude,
        simulationData.start_location.longitude
      );
      
      if (mode === 'overview') {
        mapRef.current.moveCamera({
          center: position,
          zoom: 14,
          tilt: 0,
          heading: 0,
        });
      } else if (mode === 'chase') {
        mapRef.current.moveCamera({
          center: position,
          zoom: 17,
          tilt: 55,
          heading: vehicleHeadingRef.current,
        });
        currentCameraHeadingRef.current = vehicleHeadingRef.current;
      } else if (mode === 'cinematic') {
        mapRef.current.moveCamera({
          center: position,
          zoom: 17,
          tilt: 45,
          heading: vehicleHeadingRef.current,
        });
        currentCameraHeadingRef.current = vehicleHeadingRef.current;
      }
    }
  }, [simulationData]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 rounded-xl w-full max-w-7xl max-h-[95vh] overflow-hidden shadow-2xl border border-slate-700">
        {/* Modal Header - Gaming Style */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
          <h2 className="text-xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 rounded-lg border border-cyan-500/30">
              <Truck className="h-5 w-5 text-cyan-400" />
            </div>
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Route Simulation
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-300 font-normal">{routeName}</span>
          </h2>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Modal Content */}
        <div className="overflow-y-auto bg-slate-900" style={{ maxHeight: 'calc(95vh - 80px)' }}>
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-cyan-500"></div>
                  <div className="absolute inset-0 animate-ping rounded-full h-16 w-16 border-2 border-cyan-500/30"></div>
                </div>
                <div className="text-cyan-400 font-mono text-sm uppercase tracking-wider animate-pulse">Loading Simulation...</div>
              </div>
            </div>
          ) : simulationData ? (
            <div className="flex flex-col gap-4 p-4">
              {/* Driver & Vehicle Info Panel - Gaming Style */}
              {(simulationData.driver_info || simulationData.vehicle_info) && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  {simulationData.driver_info && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-cyan-400 uppercase tracking-wider">
                        <User className="h-4 w-4" />
                        Driver
                      </div>
                      <div className="text-sm space-y-1 text-slate-300">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 w-16">Name:</span>
                          <span className="font-semibold text-white">{simulationData.driver_info.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 w-16">Phone:</span>
                          <span className="font-mono">{simulationData.driver_info.phone}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 w-16">License:</span>
                          <span className="font-mono text-xs">{simulationData.driver_info.license_number}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {simulationData.vehicle_info && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-cyan-400 uppercase tracking-wider">
                        <Car className="h-4 w-4" />
                        Vehicle
                      </div>
                      <div className="text-sm space-y-1 text-slate-300">
                        {simulationData.vehicle_info.vehicle_number && (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 w-16">ID:</span>
                            <span className="font-mono text-amber-400">{simulationData.vehicle_info.vehicle_number}</span>
                          </div>
                        )}
                        {simulationData.vehicle_info.make_model && (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 w-16">Model:</span>
                            <span className="font-semibold text-white">{simulationData.vehicle_info.make_model}</span>
                          </div>
                        )}
                        {simulationData.vehicle_info.vehicle_type && (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 w-16">Type:</span>
                            <span>{simulationData.vehicle_info.vehicle_type}</span>
                          </div>
                        )}
                        {simulationData.vehicle_info.license_plate && (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 w-16">Plate:</span>
                            <span className="font-mono bg-slate-700 px-2 py-0.5 rounded">{simulationData.vehicle_info.license_plate}</span>
                          </div>
                        )}
                        {simulationData.vehicle_info.capacity_tonnes && (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 w-16">Capacity:</span>
                            <span className="font-mono text-emerald-400">{simulationData.vehicle_info.capacity_tonnes} tonnes</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Scope 3 Emissions Panel */}
              {simulationData.emissions_data && simulationData.emissions_data.success && (
                <div className="p-4 bg-gradient-to-br from-green-900/30 to-emerald-900/30 rounded-lg border border-emerald-500/30">
                  <div className="flex items-center gap-2 mb-3">
                    <Leaf className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                      Scope 3 GHG Emissions
                    </h3>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/40 font-medium">
                      WTW
                    </span>
                    <span className="text-xs text-slate-400 ml-auto">{simulationData.emissions_data.standard}</span>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    {/* Total Emissions */}
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                      <div className="flex items-center gap-1.5 mb-1">
                        <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-xs text-slate-400">Total CO₂e</span>
                      </div>
                      <div className="text-xl font-bold text-emerald-400 tabular-nums">
                        {simulationData.emissions_data.total_emissions_kg_co2e.toFixed(1)}
                      </div>
                      <div className="text-xs text-slate-500">kg</div>
                    </div>

                    {/* Fuel Estimate */}
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Fuel className="h-3.5 w-3.5 text-amber-400" />
                        <span className="text-xs text-slate-400">Est. Fuel</span>
                      </div>
                      <div className="text-xl font-bold text-amber-400 tabular-nums">
                        {simulationData.emissions_data.estimated_fuel_liters.toFixed(1)}
                      </div>
                      <div className="text-xs text-slate-500">liters</div>
                    </div>

                    {/* CO2 per Tonne */}
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs text-slate-400">CO₂e / tonne</span>
                      </div>
                      <div className="text-xl font-bold text-cyan-400 tabular-nums">
                        {simulationData.emissions_data.kpi_metrics.kg_co2e_per_tonne.toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-500">kg/tm</div>
                    </div>

                    {/* CO2 per KM */}
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs text-slate-400">CO₂e / km</span>
                      </div>
                      <div className="text-xl font-bold text-blue-400 tabular-nums">
                        {simulationData.emissions_data.kpi_metrics.kg_co2e_per_km.toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-500">kg/km</div>
                    </div>
                  </div>

                  {/* Emissions Breakdown */}
                  {simulationData.emissions_data.delivery_emissions_kg_co2e >= 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-700">
                      {/* WTW Note */}
                      <div className="text-[10px] text-slate-500 mb-2 italic">
                        Well-to-Wheel (WTW): Includes combustion + upstream fuel production emissions
                      </div>

                      {/* Trip Emissions */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-emerald-900/20 rounded p-2 border border-emerald-500/20">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-emerald-400 font-medium">Outbound (Loaded):</span>
                            <span className="font-mono text-sm text-emerald-300 font-bold">
                              {simulationData.emissions_data.delivery_emissions_kg_co2e.toFixed(1)} kg
                            </span>
                          </div>
                        </div>
                        <div className="bg-slate-800/50 rounded p-2 border border-slate-600/30">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400 font-medium">Return (Empty):</span>
                            <span className="font-mono text-sm text-slate-300 font-bold">
                              {simulationData.emissions_data.return_emissions_kg_co2e?.toFixed(1) || '0.0'} kg
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Vehicle Info */}
                      {simulationData.emissions_data.vehicle_info && (
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Load:</span>
                            <span className="font-mono text-cyan-300">
                              {simulationData.emissions_data.vehicle_info.total_mass_tonnes.toFixed(2)} tonnes
                            </span>
                          </div>
                          {simulationData.emissions_data.vehicle_info.utilization_pct && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Utilization:</span>
                              <span className="font-mono text-blue-300">
                                {simulationData.emissions_data.vehicle_info.utilization_pct.toFixed(1)}%
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Map Container with HUD Overlay */}
              <div className="relative">
                <div ref={mapContainerRef} className="w-full h-[500px] rounded-lg border-2 border-slate-700 shadow-2xl" />
                
                {/* HUD Overlay - Speedometer */}
                <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm rounded-xl p-3 border border-cyan-500/30">
                  <div className="text-center">
                    <div className="text-3xl font-mono font-bold text-cyan-400 tabular-nums">
                      {currentSpeed}
                    </div>
                    <div className="text-xs text-cyan-300/70 uppercase tracking-wider">km/h</div>
                  </div>
                </div>
                
                {/* Camera Mode Toggle */}
                <div className="absolute top-4 right-4 flex gap-1 bg-black/70 backdrop-blur-sm rounded-lg p-1 border border-slate-600">
                  <button
                    onClick={() => handleCameraModeChange('overview')}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                      cameraMode === 'overview'
                        ? 'bg-cyan-500 text-black'
                        : 'text-slate-300 hover:bg-slate-700'
                    }`}
                    title="Overview - Top-down view"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleCameraModeChange('chase')}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                      cameraMode === 'chase'
                        ? 'bg-cyan-500 text-black'
                        : 'text-slate-300 hover:bg-slate-700'
                    }`}
                    title="Chase Cam - Follow behind vehicle"
                  >
                    <Truck className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleCameraModeChange('cinematic')}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                      cameraMode === 'cinematic'
                        ? 'bg-cyan-500 text-black'
                        : 'text-slate-300 hover:bg-slate-700'
                    }`}
                    title="Cinematic - Dynamic camera"
                  >
                    <Video className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Progress Bar Overlay */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800/80">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                
                {/* Status Indicator */}
                {isPlaying && (
                  <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-red-500/50">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs text-red-400 font-medium uppercase tracking-wider">Live</span>
                  </div>
                )}
              </div>

              {/* Info Panel - Gaming Style */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-lg border border-slate-700">
                <div className="space-y-2">
                  <div className="text-xs text-cyan-400 uppercase font-bold tracking-wider flex items-center gap-2">
                    <MapPin className="w-3 h-3" />
                    Current Location
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {currentWaypoint?.type === 'in_transit' && currentLocationName
                      ? currentLocationName
                      : (currentWaypoint?.name || 'Starting...')}
                  </div>
                  {currentWaypoint && currentWaypoint.type === 'in_transit' && (
                    <div className="text-xs text-cyan-400 flex items-center gap-1">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                      In transit
                    </div>
                  )}
                  {currentWaypoint && currentWaypoint.type === 'delivery_stop' && (
                    <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                      {currentWaypoint.quantity_to_deliver 
                        ? `Offloading ${currentWaypoint.quantity_to_deliver.toFixed(2)} tonnes`
                        : 'Servicing stop...'}
                    </div>
                  )}
                  {currentWaypoint && currentWaypoint.type === 'in_transit' && nextWaypoint?.quantity_to_deliver && (
                    <div className="text-xs text-slate-400">{nextWaypoint.quantity_to_deliver.toFixed(2)} tonnes to deliver</div>
                  )}
                  {currentWaypoint && currentWaypoint.type === 'warehouse' && (
                    <div className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                      <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
                      Preparing for departure
                    </div>
                  )}
                  {currentWaypoint && currentWaypoint.type === 'warehouse_return' && (
                    <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                      ✓ Returned to warehouse
                    </div>
                  )}
                </div>
                <div className="space-y-2 border-l border-r border-slate-700 px-4">
                  <div className="text-xs text-cyan-400 uppercase font-bold tracking-wider flex items-center gap-2">
                    <Truck className="w-3 h-3" />
                    Next Stop
                  </div>
                  {progress >= 100 ? (
                    <div className="text-sm font-bold text-emerald-400">🎉 Mission Complete!</div>
                  ) : nextWaypoint ? (
                    <>
                      <div className="text-sm font-semibold text-white">{nextWaypoint.name}</div>
                      {nextWaypoint.quantity_to_deliver && (
                        <div className="text-xs text-slate-400">{nextWaypoint.quantity_to_deliver.toFixed(2)} tonnes</div>
                      )}
                      {etaToNextStop !== null && (
                        <div className="text-xs text-amber-400 font-mono font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          ETA: {formatTime(etaToNextStop)}
                        </div>
                      )}
                      {distanceToNextStop !== null && distanceToNextStop > 0 && (
                        <div className="text-xs text-slate-500">
                          {distanceToNextStop.toFixed(1)} km away
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm font-semibold text-slate-500">End of route</div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-cyan-400 uppercase font-bold tracking-wider flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    Progress
                  </div>
                  <div className="text-2xl font-mono font-bold text-white tabular-nums">{progress.toFixed(1)}%</div>
                  <div className="text-xs text-slate-400 font-mono">
                    {formatTime(currentTime)} / {formatTime(getEffectiveTotalDuration())}
                  </div>
                  {progress >= 100 && (
                    <div className="text-xs text-emerald-400 font-bold">All deliveries completed</div>
                  )}
                </div>
              </div>

              {/* Controls - Gaming Style */}
              <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700 rounded-lg">
                <Button 
                  onClick={handlePlayPause} 
                  className={`w-28 font-bold transition-all ${
                    isPlaying 
                      ? 'bg-amber-500 hover:bg-amber-600 text-black' 
                      : 'bg-emerald-500 hover:bg-emerald-600 text-black'
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4 mr-2" />
                      PAUSE
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      START
                    </>
                  )}
                </Button>

                <Button 
                  onClick={handleReset}
                  className="bg-slate-700 hover:bg-slate-600 text-white border border-slate-600"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  RESET
                </Button>

                <div className="flex-1 flex items-center gap-3 px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700">
                  <span className="text-xs text-cyan-400 uppercase font-bold tracking-wider">Speed:</span>
                  <div className="flex-1">
                    <Slider
                      value={[speed]}
                      onValueChange={handleSpeedChange}
                      min={5}
                      max={600}
                      step={5}
                      className="w-full [&_[role=slider]]:bg-cyan-400 [&_[role=slider]]:border-cyan-500"
                    />
                  </div>
                  <span className="text-lg font-mono font-bold text-cyan-400 w-16 tabular-nums">{speed}x</span>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  <span className="font-mono font-bold">{simulationData.simulation_config.total_stops}</span>
                  <span className="text-slate-500">stops</span>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span className="font-mono font-bold">{simulationData.simulation_config.total_distance_km.toFixed(1)}</span>
                  <span className="text-slate-500">km</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="p-4 bg-slate-800/50 rounded-full mb-4 mx-auto w-fit">
                  <MapPin className="w-16 h-16 text-slate-600" />
                </div>
                <p className="text-slate-500 font-medium">No simulation data available</p>
                <p className="text-slate-600 text-sm mt-1">Please select a valid route to simulate</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
