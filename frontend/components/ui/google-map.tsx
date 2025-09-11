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
  const [mapDiv, setMapDiv] = useState<HTMLDivElement | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

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

  // Simple callback ref to capture the div element
  const mapDivRef = (div: HTMLDivElement | null) => {
    if (div && div !== mapRef.current) {
      mapRef.current = div;
      setMapDiv(div);
    } else if (!div) {
      setMapDiv(null);
    }
  };

  // Effect to check DOM on mount
  useEffect(() => {
    const checkElement = () => {
      if (mapRef.current && !mapDiv) {
        setMapDiv(mapRef.current);
      }
    };
    checkElement();
    const timer = setTimeout(checkElement, 100);
    return () => clearTimeout(timer);
  }, [mapDiv]);

  useEffect(() => {
    let mounted = true;
    let initializationStarted = false;

    const initializeMap = async () => {
      // Prevent multiple initializations
      if (initializationStarted) return;
      initializationStarted = true;

      try {
        if (mounted) {
          setIsLoading(true);
          setError(null);
        }

        // Load Google Maps API
        await loadGoogleMaps();

        if (!mounted || !mapDiv) return;
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
        const googleMap = new google.maps.Map(mapDiv, mapOptions);

        // Add click listener if provided
        if (onMapClick) {
          googleMap.addListener('click', onMapClick);
        }

        if (mounted) {
          setMap(googleMap);
          onMapLoad?.(googleMap);
        }
      } catch (err) {
        if (mounted) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          
          // More user-friendly error messages
          if (errorMessage.includes('timeout')) {
            setError('Google Maps is taking too long to load. Please check your internet connection and try again.');
          } else if (errorMessage.includes('quota') || errorMessage.includes('key')) {
            setError('Google Maps API key issue. Please contact support.');
          } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
            setError('Network error loading Google Maps. Please check your internet connection.');
          } else {
            setError(`Failed to load Google Maps: ${errorMessage}`);
          }
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    // Initialize map when component mounts and mapDiv is available
    if (!map && mapDiv) {
      initializeMap();
    }

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryAttempt, map, mapDiv]); // Include mapDiv to trigger when DOM element becomes available

  // Separate effect to handle prop changes on existing map
  useEffect(() => {
    if (map) {
      // Update map properties when props change (but avoid infinite loops)
      const currentCenter = map.getCenter();
      const currentZoom = map.getZoom();
      
      if (!currentCenter || 
          Math.abs(currentCenter.lat() - center.lat) > 0.0001 || 
          Math.abs(currentCenter.lng() - center.lng) > 0.0001) {
        map.setCenter(center);
      }
      
      if (currentZoom !== zoom) {
        map.setZoom(zoom);
      }
      
      // Note: Changing styles requires re-creating the map, which we'll skip
      // to avoid infinite loop issues. This is acceptable for most use cases.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, zoom, map]);

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
          <div className="text-gray-600 text-xs mb-3">
            {error}
          </div>
          <button 
            onClick={() => {
              setError(null);
              setMap(null);
              setRetryAttempt(prev => prev + 1);
            }}
            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
          >
            Retry Loading Map
          </button>
        </div>
      </div>
    );
  }

  // Loading state with timeout warning
  if (isLoading) {
    return (
      <div 
        className={`flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg ${className}`}
        style={{ height, width }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <div className="text-gray-600 text-sm">Loading Google Maps...</div>
          <div className="text-xs text-gray-500 mt-2">
            Check console for details if this takes longer than 15 seconds
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ height, width }}>
      <div 
        ref={mapDivRef} 
        className="w-full h-full rounded-lg"
        style={{ minHeight: height, minWidth: '100%' }}
        id="google-map-container"
      />
      {/* Render children (markers, overlays, etc.) */}
      {children}
    </div>
  );
});

GoogleMap.displayName = 'GoogleMap';

export { GoogleMap };
