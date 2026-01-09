# Quick Start Guide - Soya Excel Integrations

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies
```bash
cd frontend
npm install
```

### Step 2: Configure Environment
```bash
# Create frontend/.env.local
echo "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here" > .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" >> .env.local
```

### Step 3: Start Services
```bash
# Terminal 1 - Backend
cd backend
python manage.py runserver

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### Step 4: Access Application
```
http://localhost:3000/dashboard
```

---

## 📋 New Features Overview

### 1. Driver Assignment
**Location:** Routes page → "Assign Driver" button

**Quick Test:**
1. Go to `/dashboard/routes`
2. Click "Assign Driver" on a planned route
3. Select driver and vehicle
4. Choose notification method
5. Submit and view Google Maps links + QR code

---

### 2. Live Tracking
**Location:** Main menu → "Live Tracking"

**Quick Test:**
1. Activate a route first
2. Go to `/dashboard/live-tracking`
3. View vehicles on map (All Vehicles tab)
4. Switch to Route Progress tab
5. Select active route to see progress

---

### 3. Analytics
**Location:** Main menu → "Analytics"

**Quick Test:**
1. Go to `/dashboard/analytics`
2. Browse 4 tabs:
   - **Overview**: Weekly trends
   - **Drivers**: Performance rankings
   - **Vehicles**: Fleet efficiency
   - **Savings**: Cost optimization

---

## 🔑 API Endpoints Quick Reference

### Driver Assignment
```typescript
// Assign driver to route
await routeAPI.assignRouteToDriver(routeId, {
  driver_id: 123,
  vehicle_id: 456,
  send_notification: true,
  notification_method: 'email'
});

// Get Google Maps links
await routeAPI.getGoogleMapsLinks(routeId, 'mobile');

// Get QR code data
await routeAPI.getQRCodeData(routeId);
```

### Real-Time Tracking
```typescript
// Get all active vehicles
const vehicles = await routeAPI.getLiveTracking();

// Get route progress
const progress = await routeAPI.getDeliveryProgress(routeId);

// Update driver position
await routeAPI.updateDriverPosition({
  route_id: routeId,
  latitude: 45.5017,
  longitude: -73.5673,
  speed: 65
});
```

### Analytics
```typescript
// Get weekly performance
const weekly = await routeAPI.getWeeklyPerformance({ weeks: 4 });

// Get driver rankings
const rankings = await routeAPI.getDriverRankings({
  metric: 'on_time_rate'
});

// Get optimization savings
const savings = await routeAPI.getOptimizationSavings({
  start_date: '2026-01-01',
  end_date: '2026-01-31'
});
```

---

## 🎯 Common Use Cases

### Use Case 1: Assign Route to Driver
```typescript
// 1. Find a planned route
const routes = await routeAPI.getRoutes();
const plannedRoute = routes.find(r => r.status === 'planned');

// 2. Assign to driver with notification
const result = await routeAPI.assignRouteToDriver(plannedRoute.id, {
  driver_id: 123,
  send_notification: true,
  notification_method: 'both' // email + SMS
});

// 3. Driver receives email/SMS with Google Maps link
// 4. Manager sees assignment in route list
```

### Use Case 2: Monitor Active Delivery
```typescript
// 1. Get delivery progress
const progress = await routeAPI.getDeliveryProgress(routeId);

// Shows:
// - Progress: 3/10 stops completed
// - Next stop: "ABC Farm" - ETA 15 minutes
// - Completed stops timeline
// - Current vehicle position
```

### Use Case 3: View Performance Metrics
```typescript
// 1. Get weekly performance
const performance = await routeAPI.getWeeklyPerformance({ weeks: 4 });

// Shows:
// - Total routes completed
// - On-time delivery rate
// - Planning accuracy (actual vs planned)
// - Distance efficiency (km/tonne)
```

---

## 🛠️ Troubleshooting

### Problem: Map not loading
```bash
# Solution: Check API key
echo $NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

# Enable APIs in Google Cloud Console:
# - Maps JavaScript API
# - Directions API
# - Geocoding API
```

### Problem: No vehicles showing in Live Tracking
```bash
# Solution: Check route status
# Routes must be 'active' and have recent position updates

# Backend check:
python manage.py shell
>>> from route.models import Route
>>> Route.objects.filter(status='active').count()
```

### Problem: Analytics shows no data
```bash
# Solution: Create test data
# Need completed routes with distance/duration data

# Check:
>>> from route.models import Route
>>> Route.objects.filter(status='completed').count()
```

---

## 📱 Driver Mobile App Flow

```typescript
// 1. Login
const { token } = await api.post('/api/auth/login/', credentials);

// 2. Get active route
const activeRoute = await routeAPI.getDriverActiveRoute();

// 3. Start route
await routeAPI.startDriverRoute(activeRoute.id);

// 4. Send position updates (every 30s)
setInterval(() => {
  routeAPI.updateDriverPosition({
    route_id: activeRoute.id,
    latitude: currentLat,
    longitude: currentLng,
    speed: currentSpeed
  });
}, 30000);

// 5. Arrive at stop
await routeAPI.startDelivery({
  stop_id: nextStop.id,
  arrival_latitude: currentLat,
  arrival_longitude: currentLng
});

// 6. Complete delivery
await routeAPI.completeDelivery({
  stop_id: nextStop.id,
  quantity_delivered: 25.5,
  notes: 'Delivered successfully',
  customer_rating: 5
});

// 7. Complete route
await routeAPI.completeDriverRoute(activeRoute.id);
```

---

## 📊 Component Quick Reference

### LiveTracking Component
```tsx
import { LiveTracking } from '@/components/route/live-tracking';

<LiveTracking
  routeIds={['123']}      // Optional: filter by routes
  autoRefresh={true}       // Auto-refresh enabled
  refreshInterval={10}     // Refresh every 10 seconds
  showMap={true}           // Show Google Maps
/>
```

### DeliveryProgress Component
```tsx
import { DeliveryProgress } from '@/components/route/delivery-progress';

<DeliveryProgress
  routeId="123"
  autoRefresh={true}
  refreshInterval={30}  // Refresh every 30 seconds
/>
```

### DriverAssignmentDialog Component
```tsx
import { DriverAssignmentDialog } from '@/components/route/driver-assignment-dialog';

<DriverAssignmentDialog
  route={selectedRoute}
  open={dialogOpen}
  onOpenChange={setDialogOpen}
  onAssignmentComplete={() => {
    // Refresh routes
    loadRoutes();
  }}
/>
```

### AnalyticsDashboard Component
```tsx
import { AnalyticsDashboard } from '@/components/route/analytics-dashboard';

<AnalyticsDashboard />
// No props needed - fully self-contained
```

---

## 🔐 Authentication

### Frontend Setup
```typescript
// api.ts already configured with token handling
import { useAuthStore } from '@/lib/store';

// Login
const { user, login } = useAuthStore();
await login({ username, password });

// Token automatically added to all requests
// via axios interceptor
```

### Driver App Authentication
```typescript
// Store token after login
localStorage.setItem('authToken', token);

// Token automatically included in API calls
// routeAPI methods handle authentication
```

---

## 📦 Package Versions

```json
{
  "dependencies": {
    "axios": "^1.6.0",
    "react-hot-toast": "^2.4.1",
    "@googlemaps/js-api-loader": "^1.16.2",
    "qrcode.react": "^4.0.1",
    "lucide-react": "latest"
  }
}
```

---

## 🎨 Styling

All components use:
- **Tailwind CSS** for styling
- **Radix UI** for accessible components
- **Lucide React** for icons
- **shadcn/ui** component patterns

---

## 📖 Documentation Links

- **Detailed Guides:**
  - [Frontend Implementation Guide](./FRONTEND_IMPLEMENTATION_GUIDE.md)
  - [Real-Time Tracking Integration](./REALTIME_TRACKING_INTEGRATION.md)
  - [Integration Summary](./INTEGRATION_SUMMARY.md)

- **Backend API:**
  - [Driver Google Maps Integration](./DRIVER_GOOGLE_MAPS_INTEGRATION.md)
  - [Notification Setup Guide](./NOTIFICATION_SETUP_GUIDE.md)

---

## ✅ Integration Checklist

- [x] QR code package installed
- [x] API endpoints added
- [x] Components created
- [x] Pages created
- [x] Navigation updated
- [x] Google Maps API key configured
- [x] Documentation complete
- [ ] Email/SMS configured (optional)
- [ ] Backend running
- [ ] Frontend running
- [ ] Test drive assignment
- [ ] Test live tracking
- [ ] Test analytics

---

## 🚨 Important Notes

1. **Google Maps API Key**: Required for all map features
2. **Active Routes**: Must have active routes for live tracking
3. **Position Updates**: Drivers must send position updates for tracking
4. **Completed Routes**: Need historical data for analytics
5. **Email/SMS**: Optional but recommended for notifications

---

## 🆘 Get Help

- Check browser console for errors
- Review backend logs: `python manage.py runserver`
- Verify API endpoints: `http://localhost:8000/api/routes/`
- Test backend directly: Use Postman or curl
- Check documentation files in project root

---

**Last Updated:** 2026-01-08
**Version:** 1.0
**Status:** Ready for Testing
