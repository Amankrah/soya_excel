'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { loadGoogleMaps, DEFAULT_CENTER, MAP_STYLES } from '@/lib/google-maps';

export interface GoogleMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: string;
  width?: string;
  className?: string;
  mapStyle?: 'default' | 'dark';
  options?: google.maps.MapOptions;
  onMapLoad?: (map: google.maps.Map) => void;
  onMapClick?: (event: google.maps.MapMouseEvent) => void;
  children?: React.ReactNode;
}

export interface GoogleMapRef {
  getMap: () => google.maps.Map | null;
  panTo: (location: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  fitBounds: (bounds: google.maps.LatLngBounds) => void;
}

const GoogleMap = forwardRef<GoogleMapRef, GoogleMapProps>(({
  center = DEFAULT_CENTER,
  zoom = 10,
  height = '400px',
  width = '100%',
  className = '',
  mapStyle = 'default',
  options = {},
  onMapLoad,
  onMapClick,
  children,
}, ref) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    getMap: () => map,
    panTo: (location: { lat: number; lng: number }) => {
      if (map) {
        map.panTo(location);
      }
    },
    setZoom: (zoom: number) => {
      if (map) {
        map.setZoom(zoom);
      }
    },
    fitBounds: (bounds: google.maps.LatLngBounds) => {
      if (map) {
        map.fitBounds(bounds);
      }
    },
  }));

  useEffect(() => {
    let mounted = true;

    const initializeMap = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Load Google Maps API
        await loadGoogleMaps();

        if (!mounted || !mapRef.current) return;

        // Create map options
        const mapOptions: google.maps.MapOptions = {
          center,
          zoom,
          styles: MAP_STYLES[mapStyle],
          mapTypeId: google.maps.MapTypeId.ROADMAP,
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: true,
          scaleControl: true,
          streetViewControl: true,
          rotateControl: false,
          fullscreenControl: true,
          restriction: {
            latLngBounds: {
              north: 83.23324,  // Canada north bound
              south: 41.6765556, // Canada south bound
              west: -141.00187,  // Canada west bound
              east: -52.6480987, // Canada east bound
            },
            strictBounds: false,
          },
          ...options,
        };

        // Initialize the map
        const googleMap = new google.maps.Map(mapRef.current, mapOptions);

        // Add click listener if provided
        if (onMapClick) {
          googleMap.addListener('click', onMapClick);
        }

        setMap(googleMap);
        onMapLoad?.(googleMap);
      } catch (err) {
        if (mounted) {
          setError(`Failed to load Google Maps: ${err instanceof Error ? err.message : 'Unknown error'}`);
          console.error('Google Maps initialization error:', err);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initializeMap();

    return () => {
      mounted = false;
    };
  }, [center, zoom, mapStyle, options, onMapLoad, onMapClick]);

  // Error state
  if (error) {
    return (
      <div 
        className={`flex items-center justify-center bg-gray-100 border border-gray-300 rounded-lg ${className}`}
        style={{ height, width }}
      >
        <div className="text-center p-4">
          <div className="text-red-600 text-sm font-medium mb-2">
            Map Error
          </div>
          <div className="text-gray-600 text-xs">
            {error}
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div 
        className={`flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg ${className}`}
        style={{ height, width }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <div className="text-gray-600 text-sm">Loading map...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ height, width }}>
      <div 
        ref={mapRef} 
        className="w-full h-full rounded-lg"
      />
      {/* Render children (markers, overlays, etc.) */}
      {children}
    </div>
  );
});

GoogleMap.displayName = 'GoogleMap';

export { GoogleMap };
