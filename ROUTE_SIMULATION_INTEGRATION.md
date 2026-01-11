# Route Simulation Integration - Complete Guide

## Overview
The route simulation feature provides a realistic, animated visualization of delivery routes on Google Maps, showing a vehicle moving along actual road paths with driver and vehicle information.

## Key Features

### 1. **Realistic Path Following**
- Uses Google Maps DirectionsService to generate actual road paths
- Vehicle follows roads instead of straight lines between points
- Smooth animation with configurable playback speed (1x-10x)

### 2. **Driver & Vehicle Information**
- Displays assigned driver details (name, phone, license)
- Shows vehicle information (make, model, license plate, capacity)
- Automatically fetched from route's delivery assignments

### 3. **Interactive Controls**
- Play/Pause simulation
- Reset to start
- Adjustable speed (1x to 10x)
- Real-time progress tracking

### 4. **Visual Elements**
- Animated vehicle marker with directional arrow
- Color-coded waypoint markers (warehouses vs. stops)
- Route polyline following actual roads
- Info windows for each stop with delivery details

## Architecture

### Backend Components

#### 1. `simulation_service.py`
```python
# Enhanced to include driver/vehicle data
def generate_simulation_data(route_id, simulation_speed, include_return_journey):
    # Fetches route with deliveries, driver, and vehicle
    route = Route.objects.select_related(
        'origin_warehouse',
        'destination_warehouse'
    ).prefetch_related(
        'stops__client',
        'deliveries__driver',
        'deliveries__vehicle'
    ).get(id=route_id)

    # Returns:
    # - waypoints with timing information
    # - driver_info (name, phone, license)
    # - vehicle_info (make, model, capacity)
    # - simulation_config (speed, duration, distance)
```

**Key Enhancements:**
- Added `driver_info` and `vehicle_info` to response
- Fetches active delivery assignments
- Provides fallback vehicle info if no driver assigned

#### 2. `views.py` - Endpoint
```python
@action(detail=True, methods=['get'])
def simulate_route(self, request, pk=None):
    """
    GET /routes/routes/{id}/simulate_route/

    Query params:
    - speed: float (default: 2.0)
    - include_return: boolean (default: true)
    """
```

### Frontend Components

#### 1. `route-simulation-modal.tsx` (Complete Rewrite)

**Key Features:**
- **Google Maps DirectionsService Integration**
  ```typescript
  const loadRouteDirections = async (map: google.maps.Map) => {
    const directionsService = new google.maps.DirectionsService();
    const result = await directionsService.route({
      origin,
      destination,
      waypoints,
      travelMode: google.maps.TravelMode.DRIVING,
      optimizeWaypoints: false,
    });

    // Extract path coordinates for smooth animation
    const path: google.maps.LatLng[] = [];
    result.routes[0].legs.forEach(leg => {
      leg.steps.forEach(step => {
        path.push(...step.path);
      });
    });
  }
  ```

- **Smooth Animation**
  ```typescript
  const updateVehiclePosition = (elapsedTime: number) => {
    // Calculate progress along entire route
    const overallProgress = elapsedTime / totalDuration;
    const targetIndex = Math.floor(overallProgress * (directionsPath.length - 1));

    // Update vehicle position on actual road path
    vehicleMarkerRef.current.setPosition(directionsPath[targetIndex]);

    // Calculate and update vehicle heading
    const heading = google.maps.geometry.spherical.computeHeading(
      currentPos,
      nextPos
    );
  }
  ```

- **Driver/Vehicle Info Panel**
  ```tsx
  {(simulationData.driver_info || simulationData.vehicle_info) && (
    <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg">
      {/* Driver Information */}
      {/* Vehicle Information */}
    </div>
  )}
  ```

#### 2. `route-management.tsx` - Integration Point
```tsx
// Simulate button for planned/active routes
{(route.status === 'planned' || route.status === 'active') && (
  <Button
    onClick={() => {
      setSelectedRouteForSimulation({ id: route.id, name: route.name });
      setShowSimulationModal(true);
    }}
  >
    <Play className="h-3.5 w-3.5 mr-1.5" />
    Simulate
  </Button>
)}

{/* Simulation Modal */}
{showSimulationModal && selectedRouteForSimulation && (
  <RouteSimulationModal
    open={showSimulationModal}
    onClose={() => {
      setShowSimulationModal(false);
      setSelectedRouteForSimulation(null);
    }}
    routeId={selectedRouteForSimulation.id}
    routeName={selectedRouteForSimulation.name}
  />
)}
```

## Data Flow

```
1. User clicks "Simulate" button
   ↓
2. RouteSimulationModal opens
   ↓
3. Frontend calls: GET /routes/routes/{id}/simulate_route/?speed=2.0
   ↓
4. Backend (simulation_service.py):
   - Fetches route with stops, driver, vehicle
   - Calculates waypoint timings
   - Returns simulation data
   ↓
5. Frontend (route-simulation-modal.tsx):
   - Initializes Google Maps
   - Calls DirectionsService to get actual road path
   - Creates markers (waypoints + vehicle)
   - Starts animation loop
   ↓
6. Animation Loop:
   - Updates vehicle position along path
   - Calculates heading/rotation
   - Updates progress indicators
   - Tracks current/next waypoint
```

## API Response Structure

```json
{
  "success": true,
  "route_id": 123,
  "route_name": "Distribution Route 1",
  "route_date": "2026-01-10",
  "route_status": "planned",
  "simulation_config": {
    "speed_multiplier": 2.0,
    "total_real_duration_seconds": 7200,
    "total_simulation_duration_seconds": 3600,
    "total_distance_km": 150.5,
    "total_stops": 8,
    "include_return": true
  },
  "waypoints": [
    {
      "id": "warehouse_1",
      "type": "warehouse",
      "name": "Main Warehouse",
      "address": "123 Industrial Ave",
      "latitude": 45.5017,
      "longitude": -73.5673,
      "sequence": 0,
      "arrival_time_seconds": 0,
      "departure_time_seconds": 0,
      "service_time_seconds": 0,
      "cumulative_distance_km": 0
    },
    {
      "id": "stop_456",
      "type": "delivery_stop",
      "name": "Client ABC",
      "latitude": 45.5234,
      "longitude": -73.5892,
      "sequence": 1,
      "arrival_time_seconds": 1200,
      "departure_time_seconds": 1800,
      "service_time_seconds": 600,
      "quantity_to_deliver": 5.5
    }
  ],
  "driver_info": {
    "id": 42,
    "name": "John Doe",
    "phone": "+1-555-0123",
    "license_number": "DL123456"
  },
  "vehicle_info": {
    "id": 15,
    "vehicle_number": "VH-001",
    "vehicle_type": "Truck",
    "make": "Volvo",
    "model": "FH16",
    "capacity_tonnes": 20.0,
    "license_plate": "ABC-1234"
  }
}
```

## Usage

### For Users

1. **Navigate to Route Management**
   - Go to Routes section
   - Select a date with routes

2. **Start Simulation**
   - Click "Simulate" button on any planned/active route
   - Modal opens with map and controls

3. **Control Playback**
   - **Play/Pause**: Start or pause animation
   - **Reset**: Return to start position
   - **Speed**: Adjust from 1x to 10x speed
   - **View Info**: See current stop, next stop, progress

4. **Monitor Progress**
   - Watch vehicle move along actual roads
   - See driver and vehicle information
   - Track delivery progress in real-time

### For Developers

#### Testing the Integration

```bash
# 1. Start backend
cd backend
python manage.py runserver

# 2. Start frontend
cd frontend
npm run dev

# 3. Create a test route with stops
# 4. Assign a driver and vehicle (optional)
# 5. Click "Simulate" button
```

#### Debugging

**Backend:**
```python
# Add logging in simulation_service.py
logger.info(f"Generating simulation for route {route_id}")
logger.info(f"Driver: {driver_info}")
logger.info(f"Vehicle: {vehicle_info}")
```

**Frontend:**
```typescript
// Check console for:
console.log('Simulation data:', simulationData);
console.log('Directions path points:', directionsPath.length);
console.log('Current position:', vehicleMarkerRef.current?.getPosition());
```

## Key Improvements

### 1. Realistic Path Following
- **Before**: Vehicle moved in straight lines between waypoints
- **After**: Vehicle follows actual roads using Google DirectionsService

### 2. Complete Route Information
- **Before**: Only basic route and stop data
- **After**: Includes driver name, phone, vehicle details

### 3. Smooth Animation
- **Before**: Jerky movement between waypoints
- **After**: Smooth interpolation along path with proper heading

### 4. Better UX
- **Before**: Basic controls
- **After**: Full playback controls, speed adjustment, progress tracking

## Technical Notes

### Google Maps API Requirements
- **Required Libraries**: `geometry` (for heading calculations)
- **Services Used**: DirectionsService, DirectionsRenderer
- **Rate Limits**: DirectionsService has usage limits, consider caching

### Performance Considerations
1. **Path Complexity**: Directions API returns many points for accuracy
2. **Animation Frame**: Uses `requestAnimationFrame` for smooth 60fps
3. **Memory**: Clears markers and listeners on cleanup

### Browser Compatibility
- Modern browsers with ES6+ support
- Google Maps JavaScript API v3
- Requires active internet connection

## Future Enhancements

1. **Real-time Tracking Integration**
   - Show actual vehicle GPS position alongside simulation
   - Compare planned vs. actual routes

2. **Traffic Data**
   - Include real-time traffic conditions
   - Adjust ETAs based on traffic

3. **Route Replay**
   - Replay completed routes with actual delivery times
   - Compare planned vs. actual performance

4. **Multiple Vehicle View**
   - Simulate multiple routes simultaneously
   - Fleet overview mode

5. **Export & Sharing**
   - Export simulation as video
   - Share simulation link with stakeholders

## Troubleshooting

### Issue: Simulation doesn't start
**Solution**: Check that route has:
- At least one stop with coordinates
- Origin warehouse with coordinates
- Valid waypoint sequence

### Issue: Vehicle moves in straight lines
**Solution**:
- Verify Google Maps DirectionsService is working
- Check browser console for API errors
- Ensure `geometry` library is loaded

### Issue: No driver/vehicle information shown
**Solution**:
- Verify route has an assigned delivery
- Check that delivery has driver and vehicle assigned
- Review backend logs for data fetching errors

### Issue: Animation is choppy
**Solution**:
- Reduce simulation speed
- Check browser performance
- Verify path has enough points for smooth interpolation

## Contact & Support

For issues or questions about route simulation:
- Check backend logs: `/var/log/soya_excel/`
- Review frontend console for errors
- Test with sample data first before production routes
