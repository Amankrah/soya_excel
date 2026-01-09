# Real-Time Tracking Integration

## Overview

Complete real-time GPS tracking and delivery monitoring system integrated into the Soya Excel frontend.

**Features:**
- ✅ Live vehicle position tracking with auto-refresh
- ✅ Interactive map with vehicle markers
- ✅ Delivery progress monitoring with timeline
- ✅ Geofence event detection (arrival/departure)
- ✅ Driver mobile app API endpoints
- ✅ Route completion tracking
- ✅ Next stop ETA calculation
- ✅ Vehicle status indicators (moving/stopped)

---

## Architecture

### Backend Components

1. **`backend/route/realtime_tracking.py`**
   - `VehiclePosition` model - GPS position storage
   - `GeofenceEvent` model - Entry/exit/dwell events
   - `RealTimeTrackingService` - Core tracking logic

2. **`backend/route/views.py`**
   - `live_tracking` endpoint - Get all active vehicles
   - `delivery_progress` endpoint - Get route progress

3. **`backend/route/driver_views.py`**
   - `DriverRouteViewSet` - Driver's assigned routes
   - `DriverDeliveryViewSet` - Delivery operations
   - Position update, start/complete delivery endpoints

4. **`backend/route/urls.py`**
   - Router registration for all tracking endpoints

### Frontend Components

1. **`frontend/lib/api.ts`**
   - Real-time tracking API client methods
   - Driver delivery operation methods

2. **`frontend/components/route/live-tracking.tsx`**
   - Live vehicle tracking component
   - Auto-refresh with pause/resume
   - Interactive Google Maps integration
   - Vehicle cards with status

3. **`frontend/components/route/delivery-progress.tsx`**
   - Route-specific delivery progress
   - Progress bar and statistics
   - Completed stops timeline
   - Next stop ETA

4. **`frontend/app/dashboard/live-tracking/page.tsx`**
   - Live tracking dashboard page
   - Two tabs: All Vehicles & Route Progress
   - Route selector

---

## API Endpoints

### Manager/Admin Endpoints

#### Get Live Tracking Data
```typescript
GET /api/routes/routes/live_tracking/
Query Params: route_ids?: string[]

Response: {
  vehicles: VehicleData[],
  count: number,
  timestamp: string
}
```

#### Get Delivery Progress
```typescript
GET /api/routes/routes/{routeId}/delivery_progress/

Response: {
  route_id: string,
  route_name: string,
  status: string,
  total_stops: number,
  completed_stops: number,
  progress_percentage: number,
  current_position: {...},
  next_stop: {...},
  completed_stops_details: [...]
}
```

### Driver Mobile App Endpoints

#### Update GPS Position
```typescript
POST /api/routes/driver/deliveries/update_position/

Body: {
  route_id?: string,
  latitude: number,
  longitude: number,
  speed?: number,
  heading?: number,
  accuracy?: number,
  timestamp?: string,
  battery_level?: number,
  is_moving?: boolean,
  is_ignition_on?: boolean
}
```

#### Start Delivery
```typescript
POST /api/routes/driver/deliveries/start_delivery/

Body: {
  stop_id: number,
  arrival_latitude?: number,
  arrival_longitude?: number
}
```

#### Complete Delivery
```typescript
POST /api/routes/driver/deliveries/complete_delivery/

Body: {
  stop_id: number,
  quantity_delivered?: number,
  notes?: string,
  signature_image?: string, // base64
  proof_photo?: string, // base64
  customer_rating?: number,
  had_issues?: boolean,
  issue_description?: string
}
```

#### Report Issue
```typescript
POST /api/routes/driver/deliveries/report_issue/

Body: {
  stop_id: number,
  issue_type: 'access_denied' | 'client_unavailable' | 'wrong_product' | 'other',
  description: string,
  photo?: string // base64
}
```

#### Get Driver's Active Route
```typescript
GET /api/routes/driver/routes/active/

Response: {
  ...route data,
  progress: {
    total_stops: number,
    completed_stops: number,
    remaining_stops: number,
    progress_percentage: number
  },
  next_stop: {...}
}
```

#### Start Route
```typescript
POST /api/routes/driver/routes/{routeId}/start_route/
```

#### Complete Route
```typescript
POST /api/routes/driver/routes/{routeId}/complete_route/
```

---

## Frontend Integration

### Using Live Tracking Component

```tsx
import { LiveTracking } from '@/components/route/live-tracking';

function MyPage() {
  return (
    <LiveTracking
      routeIds={['123', '456']}  // Optional: filter by routes
      autoRefresh={true}           // Auto-refresh enabled
      refreshInterval={10}         // Refresh every 10 seconds
      showMap={true}               // Show Google Maps
    />
  );
}
```

### Using Delivery Progress Component

```tsx
import { DeliveryProgress } from '@/components/route/delivery-progress';

function RouteDetailsPage({ routeId }: { routeId: string }) {
  return (
    <DeliveryProgress
      routeId={routeId}
      autoRefresh={true}
      refreshInterval={30}  // Refresh every 30 seconds
    />
  );
}
```

### API Client Usage

```typescript
import { routeAPI } from '@/lib/api';

// Get live tracking data
const trackingData = await routeAPI.getLiveTracking(['route-123']);

// Get delivery progress
const progress = await routeAPI.getDeliveryProgress('route-123');

// Driver updates position
const result = await routeAPI.updateDriverPosition({
  route_id: 'route-123',
  latitude: 45.5017,
  longitude: -73.5673,
  speed: 65,
  heading: 180,
});

// Start delivery
await routeAPI.startDelivery({
  stop_id: 456,
  arrival_latitude: 45.5017,
  arrival_longitude: -73.5673,
});

// Complete delivery
await routeAPI.completeDelivery({
  stop_id: 456,
  quantity_delivered: 25.5,
  notes: 'Delivered successfully',
  customer_rating: 5,
});
```

---

## Geofencing

### How It Works

1. **Position Update**: Driver's mobile app sends GPS position every 30 seconds
2. **Proximity Check**: Backend calculates distance to all incomplete stops
3. **Geofence Detection**: If within 100 meters, triggers event
4. **Event Types**:
   - **Enter**: Vehicle enters geofence (arrival)
   - **Dwell**: Vehicle stays in geofence for >5 minutes (delivering)
   - **Exit**: Vehicle leaves geofence (departure)

### Automatic Actions

- **On Enter**: Records `actual_arrival_time` on RouteStop
- **On Exit**: Records `actual_departure_time` and calculates `actual_service_time`
- **Updates**: Stops become "completed" when driver marks them done

### Configuration

```python
# In backend/route/realtime_tracking.py
GEOFENCE_RADIUS_METERS = 100  # Adjust geofence size
MIN_UPDATE_INTERVAL = 30       # Minimum time between updates (seconds)
```

---

## Database Models

### VehiclePosition

```python
class VehiclePosition(models.Model):
    vehicle = ForeignKey(Vehicle)
    driver = ForeignKey(Driver, null=True)
    route = ForeignKey(Route, null=True)
    latitude = DecimalField(max_digits=9, decimal_places=6)
    longitude = DecimalField(max_digits=9, decimal_places=6)
    accuracy = DecimalField()
    speed = DecimalField()  # km/h
    heading = DecimalField()  # degrees (0-360)
    recorded_at = DateTimeField()
    is_moving = BooleanField()
    battery_level = IntegerField()
    source = CharField(default='mobile_app')
```

### GeofenceEvent

```python
class GeofenceEvent(models.Model):
    position = ForeignKey(VehiclePosition)
    route_stop = ForeignKey(RouteStop)
    event_type = CharField(choices=['enter', 'exit', 'dwell'])
    distance_meters = DecimalField()
    event_time = DateTimeField(auto_now_add=True)
    notification_sent = BooleanField(default=False)
```

---

## User Flows

### Manager: Monitoring Active Deliveries

1. Navigate to **Live Tracking** from main menu
2. View all active vehicles on map
3. See vehicle cards with:
   - Driver name
   - Route progress
   - Next stop
   - Speed and battery
4. Click marker for detailed info window
5. Switch to **Route Progress** tab for specific route
6. Select route from dropdown
7. View:
   - Progress bar
   - Completed/pending stats
   - Next stop with ETA
   - Timeline of completed deliveries

### Driver: Executing Route

1. **Start Route**:
   ```typescript
   await routeAPI.getDriverActiveRoute();
   await routeAPI.startDriverRoute(routeId);
   ```

2. **Update Position** (every 30s):
   ```typescript
   navigator.geolocation.getCurrentPosition(async (pos) => {
     await routeAPI.updateDriverPosition({
       route_id: routeId,
       latitude: pos.coords.latitude,
       longitude: pos.coords.longitude,
       speed: pos.coords.speed,
       heading: pos.coords.heading,
     });
   });
   ```

3. **Arrive at Stop**:
   ```typescript
   await routeAPI.startDelivery({
     stop_id: stopId,
     arrival_latitude: lat,
     arrival_longitude: lng,
   });
   ```

4. **Complete Delivery**:
   ```typescript
   await routeAPI.completeDelivery({
     stop_id: stopId,
     quantity_delivered: 25.5,
     notes: 'Customer requested early delivery',
     signature_image: base64Image,
     customer_rating: 5,
   });
   ```

5. **Report Issue** (if needed):
   ```typescript
   await routeAPI.reportDeliveryIssue({
     stop_id: stopId,
     issue_type: 'client_unavailable',
     description: 'Office closed, attempted contact',
   });
   ```

6. **Complete Route**:
   ```typescript
   await routeAPI.completeDriverRoute(routeId);
   ```

---

## Features in Detail

### Live Tracking Component

**Features:**
- Auto-refresh every 10 seconds (configurable)
- Pause/resume functionality
- Google Maps with vehicle markers
- Vehicle markers rotate based on heading
- Color-coded by status (green=moving, red=stopped)
- Info windows with route details
- Vehicle cards with metrics
- Last update timestamp

**Props:**
```typescript
interface LiveTrackingProps {
  routeIds?: string[];        // Filter by specific routes
  autoRefresh?: boolean;      // Enable auto-refresh (default: true)
  refreshInterval?: number;   // Seconds between refreshes (default: 10)
  showMap?: boolean;          // Show Google Maps (default: true)
}
```

### Delivery Progress Component

**Features:**
- Progress bar with percentage
- Completed/pending/total stats
- Next stop with ETA
- Current vehicle position
- Completed stops timeline
- Service time tracking
- Auto-refresh every 30 seconds

**Props:**
```typescript
interface DeliveryProgressProps {
  routeId: string;
  autoRefresh?: boolean;
  refreshInterval?: number;  // Default: 30 seconds
}
```

---

## Testing Checklist

### Backend

- [ ] Position updates create VehiclePosition records
- [ ] Geofence events trigger correctly
- [ ] Arrival/departure times recorded
- [ ] Service time calculated correctly
- [ ] Multiple vehicles tracked simultaneously
- [ ] Driver authentication works
- [ ] Position cleanup job removes old data

### Frontend

- [ ] Live tracking page loads without errors
- [ ] Map displays all active vehicles
- [ ] Vehicle markers update in real-time
- [ ] Auto-refresh works correctly
- [ ] Pause/resume functionality works
- [ ] Delivery progress shows accurate data
- [ ] Progress bar updates correctly
- [ ] Navigation menu includes Live Tracking

### Integration

- [ ] Driver position updates appear on manager's map
- [ ] Completed deliveries update progress
- [ ] Geofence events visible in timeline
- [ ] Multiple managers can view same tracking
- [ ] Real-time updates work without page refresh

---

## Performance Considerations

### Position Update Frequency

```typescript
// Mobile app should throttle updates
const UPDATE_INTERVAL = 30000; // 30 seconds

setInterval(async () => {
  if (isRouteActive) {
    await updatePosition();
  }
}, UPDATE_INTERVAL);
```

### Data Cleanup

```python
# Run daily via cron job or Celery beat
from route.realtime_tracking import RealTimeTrackingService

tracking_service = RealTimeTrackingService()
tracking_service.cleanup_old_positions(days=30)  # Keep 30 days
```

### Database Indexes

```python
# Already included in VehiclePosition model
class Meta:
    indexes = [
        models.Index(fields=['vehicle', '-recorded_at']),
        models.Index(fields=['route', '-recorded_at']),
        models.Index(fields=['-recorded_at']),
    ]
```

---

## WebSocket Integration (Future Enhancement)

For truly real-time updates without polling:

### Backend (Django Channels)

```python
# backend/route/consumers.py
from channels.generic.websocket import AsyncWebsocketConsumer

class TrackingConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.route_id = self.scope['url_route']['kwargs']['route_id']
        await self.channel_layer.group_add(
            f'route_{self.route_id}',
            self.channel_name
        )
        await self.accept()

    async def position_update(self, event):
        await self.send(text_data=json.dumps(event['data']))
```

### Frontend (WebSocket Hook)

```typescript
// frontend/hooks/use-tracking-websocket.ts
import { useEffect, useState } from 'react';

export function useTrackingWebSocket(routeId: string) {
  const [position, setPosition] = useState(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/tracking/${routeId}/`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setPosition(data);
    };

    return () => ws.close();
  }, [routeId]);

  return position;
}
```

---

## Troubleshooting

### Map Not Loading

**Problem**: Google Maps doesn't initialize

**Solution**:
- Check `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` environment variable
- Verify API key has Maps JavaScript API enabled
- Check browser console for errors

### No Vehicles Showing

**Problem**: Live tracking shows 0 vehicles

**Solution**:
- Verify routes are in 'active' status
- Check that position updates were sent in last 10 minutes
- Inspect backend logs for errors
- Test position update endpoint directly

### Geofence Not Triggering

**Problem**: Arrival events not detected

**Solution**:
- Check GPS accuracy (should be <50 meters)
- Verify stop has valid coordinates
- Increase `GEOFENCE_RADIUS_METERS` if needed
- Check that route status is 'active'

---

## Files Created/Modified

### Created

- `frontend/components/route/live-tracking.tsx` - Live tracking component
- `frontend/components/route/delivery-progress.tsx` - Progress component
- `frontend/app/dashboard/live-tracking/page.tsx` - Dashboard page
- `REALTIME_TRACKING_INTEGRATION.md` - This documentation

### Modified

- `frontend/lib/api.ts` - Added tracking API methods
- `frontend/components/layout/dashboard-layout.tsx` - Added Live Tracking nav

### Existing Backend Files (Already Implemented)

- `backend/route/realtime_tracking.py` - Core tracking service
- `backend/route/views.py` - Manager tracking endpoints
- `backend/route/driver_views.py` - Driver delivery endpoints
- `backend/route/urls.py` - URL routing

---

## Next Steps

1. **Test the Integration**:
   - Run backend: `python manage.py runserver`
   - Run frontend: `npm run dev`
   - Activate a route and test position updates

2. **Optional Enhancements**:
   - WebSocket integration for true real-time updates
   - Push notifications for geofence events
   - Historical playback of routes
   - Driver mobile app (React Native)
   - Advanced analytics (route replay, heatmaps)

3. **Production Deployment**:
   - Configure Redis for caching position data
   - Set up Celery for background tasks
   - Enable HTTPS for production API
   - Configure CORS for mobile apps

---

**Integration Date:** 2026-01-08
**Status:** ✅ Complete
**Ready for Testing:** Yes

For questions or issues, refer to:
- [Frontend Implementation Guide](./FRONTEND_IMPLEMENTATION_GUIDE.md)
- [Driver Google Maps Integration](./DRIVER_GOOGLE_MAPS_INTEGRATION.md)
