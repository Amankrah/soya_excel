/**
 * Google Maps configuration and utilities for Soya Excel
 */

import { Loader } from '@googlemaps/js-api-loader';

// Google Maps configuration - Using same API key as backend
export const GOOGLE_MAPS_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyC7aHMceYCqZjA2Vd146YsswkOjRwgXg6Y', // Same as backend
  version: 'weekly',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  libraries: ['geometry', 'places', 'marker', 'maps3d'] as any,
  region: 'CA', // Canada
  language: 'en',
  mapIds: ['a8a144e1af8cdeccebc1af0d'], // Map ID for photorealistic 3D maps
};

// Canada bounds for better geocoding accuracy
export const CANADA_BOUNDS = {
  north: 83.23324,
  south: 41.6765556,
  west: -141.00187,
  east: -52.6480987,
};

// Default map center (Montreal, QC)
export const DEFAULT_CENTER = {
  lat: 45.5017,
  lng: -73.5673,
};

// Map styles for different themes
export const MAP_STYLES = {
  default: [],
  dark: [
    { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
    {
      featureType: 'administrative.locality',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#d59563' }],
    },
    {
      featureType: 'poi',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#d59563' }],
    },
    {
      featureType: 'poi.park',
      elementType: 'geometry',
      stylers: [{ color: '#263c3f' }],
    },
    {
      featureType: 'poi.park',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#6b9a76' }],
    },
    {
      featureType: 'road',
      elementType: 'geometry',
      stylers: [{ color: '#38414e' }],
    },
    {
      featureType: 'road',
      elementType: 'geometry.stroke',
      stylers: [{ color: '#212a37' }],
    },
    {
      featureType: 'road',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#9ca5b3' }],
    },
    {
      featureType: 'road.highway',
      elementType: 'geometry',
      stylers: [{ color: '#746855' }],
    },
    {
      featureType: 'road.highway',
      elementType: 'geometry.stroke',
      stylers: [{ color: '#1f2835' }],
    },
    {
      featureType: 'road.highway',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#f3d19c' }],
    },
    {
      featureType: 'transit',
      elementType: 'geometry',
      stylers: [{ color: '#2f3948' }],
    },
    {
      featureType: 'transit.station',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#d59563' }],
    },
    {
      featureType: 'water',
      elementType: 'geometry',
      stylers: [{ color: '#17263c' }],
    },
    {
      featureType: 'water',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#515c6d' }],
    },
    {
      featureType: 'water',
      elementType: 'labels.text.stroke',
      stylers: [{ color: '#17263c' }],
    },
  ],
};

// Custom marker icons for different purposes
export const createMarkerIcons = () => ({
  warehouse: {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="12" fill="#2563eb" stroke="white" stroke-width="2"/>
        <rect x="10" y="10" width="12" height="8" fill="white" rx="1"/>
        <rect x="12" y="12" width="2" height="2" fill="#2563eb"/>
        <rect x="14.5" y="12" width="2" height="2" fill="#2563eb"/>
        <rect x="17" y="12" width="2" height="2" fill="#2563eb"/>
        <rect x="12" y="15" width="2" height="2" fill="#2563eb"/>
        <rect x="14.5" y="15" width="2" height="2" fill="#2563eb"/>
        <rect x="17" y="15" width="2" height="2" fill="#2563eb"/>
      </svg>
    `),
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 16),
  },
  farmer: {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="12" fill="#16a34a" stroke="white" stroke-width="2"/>
        <path d="M12 20h8l-2-4h-4l-2 4z" fill="white"/>
        <circle cx="14" cy="13" r="1" fill="white"/>
        <circle cx="18" cy="13" r="1" fill="white"/>
        <path d="M13 15h6v1h-6v-1z" fill="white"/>
      </svg>
    `),
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 16),
  },
  driver: {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="12" fill="#dc2626" stroke="white" stroke-width="2"/>
        <rect x="10" y="12" width="12" height="6" fill="white" rx="1"/>
        <circle cx="12.5" cy="19" r="1.5" fill="#dc2626"/>
        <circle cx="19.5" cy="19" r="1.5" fill="#dc2626"/>
        <rect x="11" y="14" width="3" height="2" fill="#dc2626" rx="0.5"/>
        <rect x="15" y="14" width="5" height="2" fill="#dc2626" rx="0.5"/>
      </svg>
    `),
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 16),
  },
  completed: {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="12" fill="#059669" stroke="white" stroke-width="2"/>
        <path d="M12 16l3 3 6-6" stroke="white" stroke-width="2" fill="none"/>
      </svg>
    `),
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 16),
  },
  pending: {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="12" fill="#f59e0b" stroke="white" stroke-width="2"/>
        <circle cx="16" cy="16" r="6" fill="white"/>
        <path d="M16 13v3l2 2" stroke="#f59e0b" stroke-width="1.5" fill="none"/>
      </svg>
    `),
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 16),
  },
});

// Google Maps loader instance
let loader: Loader | null = null;

/**
 * Initialize Google Maps loader
 */
export function getGoogleMapsLoader(): Loader {
  if (!loader) {
    loader = new Loader(GOOGLE_MAPS_CONFIG);
  }
  return loader;
}

/**
 * Load Google Maps API
 */
export async function loadGoogleMaps(): Promise<typeof google> {
  try {
    // Check if already loaded
    if (typeof globalThis.google !== 'undefined' && globalThis.google.maps) {
      return globalThis.google;
    }
    
    const loader = getGoogleMapsLoader();
    const google = await loader.load();
    return google;
    
  } catch (error) {
    console.error('Google Maps loading failed:', error);
    throw new Error(`Failed to load Google Maps: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a custom info window content for route stops
 */
export function createStopInfoWindowContent(stop: {
  client: { name: string; full_address: string; city?: string | null; country?: string | null };
  order: { client_order_number: string; quantity_ordered: number } | null;
  sequence_number: number;
  is_completed: boolean;
  estimated_arrival_time?: string | null;
}): string {
  const statusBadge = stop.is_completed
    ? '<span class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Completed</span>'
    : '<span class="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">Pending</span>';

  const location = stop.client.city && stop.client.country
    ? `${stop.client.city}, ${stop.client.country}`
    : stop.client.full_address;

  return `
    <div class="p-3 min-w-0 max-w-xs">
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-semibold text-gray-900">Stop ${stop.sequence_number}</h3>
        ${statusBadge}
      </div>
      <div class="space-y-1 text-sm text-gray-600">
        <p><strong>Client:</strong> ${stop.client.name}</p>
        <p><strong>Location:</strong> ${location}</p>
        ${stop.order ? `
          <p><strong>Order:</strong> ${stop.order.client_order_number}</p>
          <p><strong>Quantity:</strong> ${stop.order.quantity_ordered} tm</p>
        ` : '<p class="text-gray-500 italic">No linked order</p>'}
        ${stop.estimated_arrival_time ?
          `<p><strong>ETA:</strong> ${new Date(stop.estimated_arrival_time).toLocaleTimeString()}</p>` :
          ''
        }
      </div>
    </div>
  `;
}

/**
 * Create a custom info window content for live driver tracking
 */
export function createDriverInfoWindowContent(driver: {
  name: string;
  vehicle?: { license_plate: string; vehicle_type: string };
  current_route?: { name: string; stops_completed: number; total_stops: number };
  last_update?: string;
}): string {
  return `
    <div class="p-3 min-w-0 max-w-xs">
      <h3 class="font-semibold text-gray-900 mb-2">Driver: ${driver.name}</h3>
      <div class="space-y-1 text-sm text-gray-600">
        ${driver.vehicle ? 
          `<p><strong>Vehicle:</strong> ${driver.vehicle.license_plate} (${driver.vehicle.vehicle_type})</p>` : 
          '<p class="text-gray-400">No vehicle assigned</p>'
        }
        ${driver.current_route ? `
          <p><strong>Route:</strong> ${driver.current_route.name}</p>
          <p><strong>Progress:</strong> ${driver.current_route.stops_completed}/${driver.current_route.total_stops} stops</p>
        ` : '<p class="text-gray-400">No active route</p>'}
        ${driver.last_update ? 
          `<p class="text-xs text-gray-500">Last update: ${new Date(driver.last_update).toLocaleString()}</p>` : 
          ''
        }
      </div>
    </div>
  `;
}

/**
 * Calculate bounds that include all given points
 */
export function calculateBounds(points: Array<{ lat: number; lng: number }>): google.maps.LatLngBounds {
  const bounds = new google.maps.LatLngBounds();
  points.forEach(point => {
    bounds.extend(new google.maps.LatLng(point.lat, point.lng));
  });
  return bounds;
}

/**
 * Format distance for display
 */
export function formatDistance(distanceInKm: number | string | null | undefined): string {
  // Handle null, undefined, or non-numeric values
  if (distanceInKm == null) {
    return 'N/A';
  }
  
  // Convert to number and validate
  const distance = typeof distanceInKm === 'string' ? parseFloat(distanceInKm) : distanceInKm;
  
  if (isNaN(distance) || distance < 0) {
    return 'N/A';
  }
  
  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }
  return `${distance.toFixed(1)} km`;
}

/**
 * Format duration for display
 */
export function formatDuration(durationInMinutes: number | string | null | undefined): string {
  // Handle null, undefined, or non-numeric values
  if (durationInMinutes == null) {
    return 'N/A';
  }
  
  // Convert to number and validate
  const duration = typeof durationInMinutes === 'string' ? parseFloat(durationInMinutes) : durationInMinutes;
  
  if (isNaN(duration) || duration < 0) {
    return 'N/A';
  }
  
  const hours = Math.floor(duration / 60);
  const minutes = Math.round(duration % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Decode Google's polyline encoding to coordinates
 */
export function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const poly: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    poly.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return poly;
}

/**
 * Get color for route based on status
 */
export function getRouteColor(status: string): string {
  switch (status) {
    case 'active':
      return '#dc2626'; // red
    case 'completed':
      return '#16a34a'; // green
    case 'planned':
      return '#2563eb'; // blue
    default:
      return '#6b7280'; // gray
  }
}

/**
 * Provincial boundaries for better geocoding (approximate centers)
 */
export const PROVINCE_CENTERS: Record<string, { lat: number; lng: number }> = {
  QC: { lat: 46.8139, lng: -71.2080 }, // Quebec City
  ON: { lat: 43.6532, lng: -79.3832 }, // Toronto
  NB: { lat: 46.5653, lng: -66.4619 }, // Fredericton
  BC: { lat: 49.2827, lng: -123.1207 }, // Vancouver
  AB: { lat: 53.9333, lng: -116.5765 }, // Edmonton
  SK: { lat: 50.4452, lng: -104.6189 }, // Regina
  MB: { lat: 49.8951, lng: -97.1384 }, // Winnipeg
  NS: { lat: 44.6488, lng: -63.5752 }, // Halifax
  PE: { lat: 46.2382, lng: -63.1311 }, // Charlottetown
  NL: { lat: 47.5615, lng: -52.7126 }, // St. John's
};

/**
 * Utility to check if Google Maps API is loaded
 */
export function isGoogleMapsLoaded(): boolean {
  return typeof google !== 'undefined' && google.maps !== undefined;
}
