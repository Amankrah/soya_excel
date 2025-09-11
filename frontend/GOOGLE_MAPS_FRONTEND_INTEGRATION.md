# Google Maps Frontend Integration for Soya Excel

This document describes the frontend Google Maps integration for the Soya Excel route management system. The integration provides interactive maps, route visualization, and live driver tracking capabilities.

## 🗺️ Components Created

### Core Map Components

#### GoogleMap (`/components/ui/google-map.tsx`)
Base Google Maps wrapper component with:
- **Async Map Loading**: Automatically loads Google Maps JavaScript API
- **Error Handling**: Graceful handling of API failures
- **Custom Styling**: Support for default and dark themes
- **Canada-focused Configuration**: Optimized for Canadian operations
- **Ref Support**: Imperative map control methods

```tsx
<GoogleMap
  center={{ lat: 45.5017, lng: -73.5673 }}
  zoom={10}
  height="400px"
  onMapLoad={handleMapLoad}
/>
```

#### RouteMap (`/components/maps/route-map.tsx`)
Specialized component for route visualization:
- **Route Visualization**: Shows all stops with sequence numbers
- **Directions Integration**: Displays turn-by-turn directions
- **Route Optimization**: One-click route optimization
- **Interactive Markers**: Click to see stop details
- **Progress Tracking**: Visual indication of completed stops

```tsx
<RouteMap
  route={selectedRoute}
  showDirections={true}
  showOptimizeButton={true}
  onRouteOptimized={() => refreshData()}
/>
```

#### LiveTrackingMap (`/components/maps/live-tracking-map.tsx`)
Real-time driver tracking component:
- **Live Driver Positions**: Real-time GPS tracking simulation
- **Multiple Route Support**: Track all active routes simultaneously
- **Auto-refresh**: Configurable refresh intervals
- **Progress Indicators**: Visual route completion status
- **Driver Information**: Detailed driver and vehicle info

```tsx
<LiveTrackingMap
  height="600px"
  refreshInterval={30}
  showAllRoutes={true}
/>
```

### Page Integrations

#### Enhanced Routes Page (`/app/dashboard/routes/page.tsx`)
The routes page now includes:
- **Tabbed Route Details**: Overview, Map View, Live Tracking tabs
- **Integrated Map View**: Route visualization within dialogs
- **Live Tracking Tab**: Real-time tracking for active routes
- **Route Optimization**: Direct access to route optimization

#### Live Tracking Dashboard (`/app/dashboard/live-tracking/page.tsx`)
Dedicated page for fleet management:
- **Fleet Overview**: Summary of all active deliveries
- **Live Map Display**: Full-screen tracking of all drivers
- **Route Progress Panel**: Detailed progress for each route
- **Performance Metrics**: KPIs and delivery alerts
- **Auto-refresh Controls**: Manual and automatic data updates

## 🛠️ Configuration

### Environment Variables

Create a `.env.local` file in the frontend directory:

```bash
# API Configuration  
NEXT_PUBLIC_API_URL=http://localhost:8000/api

# Google Maps API Key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyC7aHMceYCqZjA2Vd146YsswkOjRwgXg6Y
```

### Google Maps API Setup

1. **Get API Key**: Visit [Google Cloud Console](https://console.cloud.google.com/google/maps-apis/)
2. **Enable APIs**:
   - Geocoding API
   - Directions API  
   - Distance Matrix API
   - Maps JavaScript API
3. **Configure Restrictions**: Limit to your domains for security
4. **Set Billing**: Google Maps requires a billing account

### API Configuration (`/lib/google-maps.ts`)

```typescript
export const GOOGLE_MAPS_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || 'your_api_key',
  version: 'weekly',
  libraries: ['geometry', 'places', 'marker'] as google.maps.Libraries,
  region: 'CA', // Canada focus
  language: 'en',
};
```

## 📡 API Integration (`/lib/api.ts`)

New Google Maps related endpoints:

### Route APIs
```typescript
// Get turn-by-turn directions for a route
routeAPI.getRouteDirections(routeId: string)

// Geocode any address
routeAPI.geocodeAddress(address: string, province?: string)

// Optimize routes for a week
routeAPI.optimizeWeeklyRoutes(weekStart: string)

// Get route performance metrics
routeAPI.getRouteKPIs(routeId: string)

// Route management
routeAPI.activateRoute(routeId: string)
routeAPI.completeRoute(routeId: string)
```

### Client Address APIs
```typescript
// Geocode farmer address and update coordinates
clientAPI.geocodeFarmerAddress(farmerId: string)

// Validate address format and accuracy
clientAPI.validateFarmerAddress(farmerId: string)

// Validate address before saving (form validation)
clientAPI.validateNewAddress(address: string, province?: string)

// Get address quality report
clientAPI.getAddressQualityReport()
```

## 🎨 UI Features

### Interactive Map Features
- **Custom Markers**: Different icons for warehouses, farmers, drivers, completed stops
- **Info Windows**: Rich tooltips with stop/driver details
- **Route Polylines**: Visual route paths with status colors
- **Bounds Fitting**: Auto-zoom to show all relevant points
- **Click Interactions**: Detailed information on click

### Visual Indicators
- **Route Status Colors**:
  - Active routes: Red (`#dc2626`)
  - Completed routes: Green (`#16a34a`) 
  - Planned routes: Blue (`#2563eb`)
  - Draft routes: Gray (`#6b7280`)

- **Marker Types**:
  - 🏭 Warehouse: Blue with warehouse icon
  - 🚜 Farmer: Green with farm icon
  - 🚛 Driver: Red with truck icon
  - ✅ Completed: Green with checkmark
  - ⏳ Pending: Yellow with clock

### Live Tracking Features
- **Real-time Updates**: 30-second refresh intervals
- **Driver Status**: Active/inactive indication
- **Route Progress**: Visual progress bars
- **Time Estimates**: ETA calculations
- **Alert System**: Delayed route notifications

## 📱 Responsive Design

All map components are fully responsive:
- **Mobile Friendly**: Touch-enabled map controls
- **Adaptive Layout**: Sidebar collapses on mobile
- **Flexible Heights**: Configurable map dimensions
- **Modal Dialogs**: Full-screen maps on mobile

## 🚀 Usage Examples

### Basic Route Visualization
```tsx
import { RouteMap } from '@/components/maps/route-map';

function RouteDetails({ route }) {
  return (
    <div>
      <RouteMap
        route={route}
        showDirections={true}
        showOptimizeButton={route.status === 'planned'}
        height="400px"
      />
    </div>
  );
}
```

### Live Fleet Tracking
```tsx
import { LiveTrackingMap } from '@/components/maps/live-tracking-map';

function FleetDashboard() {
  return (
    <LiveTrackingMap
      height="100vh"
      refreshInterval={30}
      showAllRoutes={true}
    />
  );
}
```

### Custom Map Integration
```tsx
import { GoogleMap } from '@/components/ui/google-map';
import { loadGoogleMaps, MARKER_ICONS } from '@/lib/google-maps';

function CustomMap() {
  const mapRef = useRef<GoogleMapRef>(null);

  const handleMapLoad = async (map: google.maps.Map) => {
    // Add custom markers
    const marker = new google.maps.Marker({
      position: { lat: 45.5017, lng: -73.5673 },
      map,
      icon: MARKER_ICONS.farmer,
    });
  };

  return (
    <GoogleMap
      ref={mapRef}
      center={{ lat: 45.5017, lng: -73.5673 }}
      zoom={12}
      onMapLoad={handleMapLoad}
    />
  );
}
```

## 🔧 Development

### Running Locally

1. **Install Dependencies**:
```bash
cd frontend
npm install @googlemaps/js-api-loader @types/google.maps
```

2. **Set Environment Variables**:
```bash
# Copy example and add your API key
cp .env.local.example .env.local
# Edit .env.local with your Google Maps API key
```

3. **Start Development Server**:
```bash
npm run dev
```

4. **Test Maps Integration**:
   - Navigate to `/dashboard/routes`
   - Click "View" on any route
   - Switch to "Map & Directions" tab
   - Visit `/dashboard/live-tracking` for full fleet view

### Building for Production

```bash
npm run build
npm start
```

### TypeScript Support

Full TypeScript support is included:
- Google Maps type definitions
- Custom component interfaces
- API response types
- Proper error handling

## 🐛 Troubleshooting

### Common Issues

#### Maps Not Loading
1. **Check API Key**: Ensure `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set
2. **Verify APIs**: Confirm all required APIs are enabled
3. **Check Browser Console**: Look for JavaScript errors
4. **Domain Restrictions**: Ensure your domain is allowed

#### Geocoding Failures
1. **Address Format**: Ensure addresses include city, province
2. **API Quotas**: Check if you've hit rate limits
3. **Invalid Addresses**: Some addresses may not exist in Google's database

#### Performance Issues
1. **Too Many Markers**: Limit markers on screen (use clustering)
2. **Auto-refresh Rate**: Reduce refresh frequency
3. **Map Size**: Optimize map dimensions for mobile

### Debug Mode

Enable debug logging:

```typescript
// In lib/google-maps.ts
const DEBUG = process.env.NODE_ENV === 'development';

if (DEBUG) {
  console.log('Google Maps initialized:', map);
}
```

### Error Handling

All components include comprehensive error handling:
- **Network Failures**: Graceful API error handling
- **Invalid Data**: Safe rendering with fallbacks
- **Map Load Errors**: User-friendly error messages

## 📈 Performance Optimization

### Best Practices Implemented
1. **Lazy Loading**: Maps load only when needed
2. **Marker Clustering**: Avoid too many markers
3. **Efficient Re-renders**: Smart state management
4. **Image Optimization**: SVG icons for markers
5. **Debounced Updates**: Prevent excessive API calls

### Monitoring
- Monitor Google Maps API usage in Google Cloud Console
- Set up billing alerts to prevent unexpected charges
- Track performance with Next.js analytics

## 🔐 Security

### API Key Protection
- Environment variables for sensitive data
- Domain restrictions on API keys
- No API keys in client-side code (except public Maps key)
- Regular key rotation recommended

### Data Privacy
- GPS tracking simulation only (no real location data stored)
- Client address data properly secured
- HTTPS required for production

## 🚀 Future Enhancements

### Planned Features
- **Real GPS Integration**: Actual driver GPS tracking
- **Route Recording**: Historical route playback
- **Geofencing**: Automatic delivery confirmations
- **Offline Support**: Cached maps for poor connectivity
- **Advanced Analytics**: Heat maps and route efficiency analysis

### Integration Opportunities
- **Mobile Driver App**: Turn-by-turn navigation
- **Customer Portal**: Live delivery tracking
- **IoT Sensors**: Real-time vehicle telemetry
- **Weather Integration**: Route adjustments for conditions

This integration provides a solid foundation for Soya Excel's route management and tracking needs, with room for future enhancements as the business grows.
