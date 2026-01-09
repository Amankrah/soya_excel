# Route Management System - Documentation

## Overview

The Route Management system for Soya Excel provides advanced route planning, optimization, and distribution management using Google Maps API integration with modern async capabilities.

## Key Features

### 1. **Multi-Client Distribution Planning**
Create optimized delivery routes for multiple clients using intelligent clustering algorithms.

- **Geographic Clustering**: Automatically groups clients by proximity
- **Route Optimization**: Uses Google Maps Directions API for optimal routes
- **Capacity Management**: Respects vehicle capacity and distance constraints
- **Flexible Algorithms**: Choose between DBSCAN (density-based) or K-Means clustering

### 2. **Async Geocoding & Route Optimization**
High-performance async operations for batch processing.

- **Concurrent Geocoding**: Process multiple addresses simultaneously
- **Rate Limiting**: Respects Google Maps API limits (50 QPS)
- **Intelligent Caching**: 24-hour cache for geocoding results
- **Celery Integration**: Background task processing for large operations

### 3. **Real-time Route Tracking**
Monitor active delivery routes and vehicle positions.

- **Live Vehicle Locations**: GPS-based tracking
- **Delivery Progress**: Track completion of route stops
- **Geofencing**: Automatic arrival detection
- **Performance Metrics**: Distance, duration, efficiency scores

## Architecture

### Models

#### `Route`
Represents a delivery route with multiple stops.

**Key Fields:**
- `name`: Route identifier
- `date`: Planned delivery date
- `route_type`: contract, on_demand, emergency, or mixed
- `status`: draft, planned, active, completed, cancelled, delayed
- `total_distance`: Total distance in km
- `estimated_duration`: Duration in minutes
- `optimized_sequence`: Optimized stop order
- `waypoints`: GPS coordinates for route visualization

#### `RouteStop`
Individual delivery stop on a route.

**Key Fields:**
- `route`: Parent route (ForeignKey)
- `client`: Client to deliver to (ForeignKey)
- `order`: Order being delivered (ForeignKey)
- `sequence_number`: Stop order
- `location_latitude/longitude`: GPS coordinates
- `quantity_to_deliver`: Delivery quantity in tonnes
- `estimated_arrival_time`: Planned arrival
- `actual_arrival_time`: Actual arrival
- `is_completed`: Completion status

#### `RouteOptimization`
Stores optimization request/response data.

**Key Fields:**
- `route`: Associated route
- `optimization_type`: distance, duration, fuel_cost, balanced, co2_emissions
- `original_distance/duration`: Pre-optimization metrics
- `optimized_distance/duration`: Post-optimization metrics
- `distance_savings/time_savings`: Improvement metrics

### Services

#### `AsyncGoogleMapsService` (services_async.py)
Modern async Google Maps integration.

**Methods:**
- `geocode_address()`: Async geocode single address
- `geocode_batch()`: Concurrent batch geocoding
- `calculate_distance_matrix()`: Distance/duration matrix
- `optimize_route_directions()`: Get optimized route with turn-by-turn directions

**Features:**
- Async/await with aiohttp
- Rate limiting (50 QPS)
- Response caching (24h TTL)
- Automatic retries

#### `DistributionPlanService` (services_async.py)
Multi-client route planning with clustering.

**Methods:**
- `create_distribution_plan()`: Create optimized multi-route plan
- `optimize_existing_route()`: Optimize a single route
- `_cluster_dbscan()`: Density-based clustering
- `_cluster_kmeans()`: K-means clustering

**Clustering Algorithms:**

**DBSCAN (Default)**
- Density-based spatial clustering
- Automatically determines cluster count
- Good for irregular geographic distributions
- Parameters:
  - `eps`: Maximum distance between points (default: ~300km)
  - `min_samples`: Minimum points per cluster (default: 2)

**K-Means**
- Partitioning algorithm with specified cluster count
- Produces balanced clusters
- Better for evenly distributed clients
- Parameters:
  - `n_clusters`: Number of routes to create

### Celery Tasks (tasks.py)

Background tasks for expensive operations.

#### `geocode_client_addresses_task`
Geocode multiple clients in background.
- **Args**: `client_ids: List[int]`
- **Retries**: 3 with 60s delay
- **Returns**: Geocoding results

#### `optimize_route_task`
Optimize single route in background.
- **Args**: `route_id: int, optimization_type: str, user_id: int`
- **Retries**: 3 with 60s delay
- **Returns**: Optimization results

#### `create_distribution_plan_task`
Create multi-client distribution plan.
- **Args**: `client_ids, date_str, max_stops_per_route, max_distance_km, clustering_method, user_id`
- **Retries**: 2 with 120s delay
- **Returns**: Distribution plan with created routes

#### `optimize_weekly_routes_task`
Optimize all routes for a week.
- **Args**: `week_start_str: str, user_id: int`
- **Retries**: 2
- **Returns**: Weekly optimization results

#### `update_missing_coordinates_task`
Background geocoding for clients without coordinates.
- **Args**: `limit: int = 100`
- **Returns**: Update results

## API Endpoints

### Routes

#### `POST /api/routes/create_distribution_plan/`
Create optimized distribution plan for multiple clients.

**Request Body:**
```json
{
  "client_ids": [1, 2, 3, 4, 5],
  "date": "2026-01-15",
  "max_stops_per_route": 10,
  "max_distance_km": 300,
  "clustering_method": "dbscan",
  "use_async": false
}
```

**Response (Sync):**
```json
{
  "success": true,
  "date": "2026-01-15",
  "total_clients": 5,
  "routes_count": 2,
  "routes": [
    {
      "cluster_id": 0,
      "clients": [1, 2, 3],
      "client_count": 3,
      "total_distance_km": 145.2,
      "estimated_duration_minutes": 180,
      "waypoint_order": [0, 1, 2],
      "optimized_sequence": [...]
    }
  ],
  "clustering_method": "dbscan"
}
```

**Response (Async):**
```json
{
  "success": true,
  "task_id": "abc-123-def-456",
  "message": "Distribution plan is being created in the background",
  "status_url": "/api/tasks/abc-123-def-456/"
}
```

#### `POST /api/routes/batch_geocode/`
Geocode multiple client addresses.

**Request Body:**
```json
{
  "client_ids": [1, 2, 3, 4, 5],
  "force_update": false,
  "use_async": false
}
```

**Response:**
```json
{
  "success": true,
  "clients_processed": 5,
  "successful": 4,
  "failed": 1,
  "results": [
    {
      "client_id": 1,
      "geocode_result": {
        "latitude": 45.5017,
        "longitude": -73.5673,
        "formatted_address": "Montreal, QC, Canada"
      },
      "success": true
    }
  ]
}
```

#### `POST /api/routes/{id}/optimize/`
Optimize a specific route.

**Request Body:**
```json
{
  "optimization_type": "balanced"
}
```

**Response:**
```json
{
  "route": {...},
  "optimization": {
    "optimized_distance": 125.5,
    "optimized_duration": 150,
    "distance_savings": 24.5,
    "time_savings": 30
  },
  "message": "Route optimized successfully using Google Maps"
}
```

#### `GET /api/routes/{id}/directions/`
Get turn-by-turn directions for a route.

**Response:**
```json
{
  "route_id": 1,
  "directions": {
    "legs": [...],
    "overview_polyline": "...",
    "summary": "Via QC-138",
    "waypoint_order": [0, 1, 2]
  },
  "waypoints_count": 5
}
```

#### `GET /api/routes/live_tracking/`
Get live vehicle locations.

**Query Params:**
- `route_ids`: Optional list of route IDs

**Response:**
```json
{
  "vehicles": [
    {
      "id": "vehicle_1",
      "name": "Driver Name",
      "latitude": 45.5017,
      "longitude": -73.5673,
      "vehicle": {...},
      "current_route": {...},
      "next_stop": {...},
      "is_active": true,
      "speed": 65,
      "heading": 180
    }
  ],
  "count": 1,
  "timestamp": "2026-01-04T10:30:00Z"
}
```

### Route Stops

#### `POST /api/route-stops/{id}/update_coordinates/`
Update stop coordinates from client address.

**Response:**
```json
{
  "success": true,
  "stop": {...},
  "message": "Coordinates updated from client"
}
```

## Management Commands

### `geocode_client_addresses`
Geocode client addresses using Google Maps API.

**Usage:**
```bash
# Geocode clients without coordinates
python manage.py geocode_client_addresses --limit 100

# Force re-geocode all addresses
python manage.py geocode_client_addresses --force

# Filter by country
python manage.py geocode_client_addresses --country Canada

# Use async batch processing
python manage.py geocode_client_addresses --async --limit 500

# Dry run to preview
python manage.py geocode_client_addresses --dry-run
```

**Options:**
- `--force`: Re-geocode all addresses, even with existing coordinates
- `--country`: Filter by country (Canada, USD, SPAIN)
- `--limit`: Maximum addresses to process (default: 100)
- `--delay`: Delay between requests in seconds (default: 0.1)
- `--dry-run`: Preview without making changes
- `--async`: Use async batch geocoding for better performance

### `validate_client_addresses`
Validate client addresses and suggest corrections.

**Usage:**
```bash
# Validate addresses
python manage.py validate_client_addresses --limit 50

# Auto-fix invalid addresses
python manage.py validate_client_addresses --fix-invalid

# Only validate missing coordinates
python manage.py validate_client_addresses --only-missing-coords
```

**Options:**
- `--fix-invalid`: Automatically update with corrected addresses
- `--country`: Filter by country
- `--limit`: Maximum addresses to validate (default: 50)
- `--delay`: Delay between requests (default: 0.2)
- `--only-missing-coords`: Only validate addresses missing coordinates

## Setup & Configuration

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

**New Dependencies:**
- `aiohttp==3.10.11`: Async HTTP client
- `asyncio-throttle==1.0.2`: Rate limiting
- `geopy==2.4.1`: Geocoding utilities
- `scipy==1.15.1`: Clustering algorithms

### 2. Configure Google Maps API

Add to `settings.py`:
```python
GOOGLE_MAPS_API_KEY = env('GOOGLE_MAPS_API_KEY')
```

Add to `.env`:
```
GOOGLE_MAPS_API_KEY=your_api_key_here
```

**Required Google Maps APIs:**
- Geocoding API
- Directions API
- Distance Matrix API

### 3. Run Migrations

```bash
python manage.py makemigrations route
python manage.py migrate
```

### 4. Configure Celery

Ensure Celery is running for async tasks:
```bash
celery -A soya_excel_backend worker -l info
celery -A soya_excel_backend beat -l info
```

## Performance Considerations

### Geocoding Rate Limits
- **Google Maps Free Tier**: 40,000 requests/month
- **QPS Limit**: 50 queries per second
- **Best Practice**: Use caching and batch operations

### Optimization Tips
1. **Use Async Mode**: For 10+ clients, use `use_async: true`
2. **Cache Coordinates**: Geocode once, store permanently
3. **Batch Operations**: Process multiple routes together
4. **Choose Right Clustering**:
   - DBSCAN: Variable client density
   - K-Means: Evenly distributed clients

### Caching Strategy
- **Geocoding**: 24-hour cache (Redis/Memcached)
- **Distance Matrix**: 1-hour cache for frequent routes
- **Route Optimization**: Store in database (RouteOptimization model)

## Migration from Old System

### Model Changes
- `farmer` → `client` (ForeignKey in RouteStop)
- `farmer.address` → `client.full_address` (property)
- `farmer.province` → `client.country` (expanded field)

### Code Migration
```python
# Old
stop.farmer.name
stop.farmer.address
geocode_farmer_address(farmer)

# New
stop.client.name
stop.client.full_address
geocode_client_address(client)
```

### Data Migration Script
```python
# If you have existing RouteStop data
from route.models import RouteStop

# All RouteStop records automatically use Client model
# No data migration needed - just code updates
```

## Testing

### Unit Tests
```bash
pytest backend/route/tests.py
```

### Integration Tests
```bash
# Test geocoding
python manage.py geocode_client_addresses --limit 5 --dry-run

# Test route optimization
curl -X POST http://localhost:8000/api/routes/1/optimize/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"optimization_type": "balanced"}'
```

### Load Testing
```bash
# Test async batch geocoding
python manage.py shell
>>> from route.services_async import geocode_clients_batch
>>> import asyncio
>>> client_ids = list(range(1, 101))  # 100 clients
>>> asyncio.run(geocode_clients_batch(client_ids))
```

## Troubleshooting

### Common Issues

**1. Google Maps API Key Error**
```
ValueError: Google Maps API key is not configured
```
**Solution**: Set `GOOGLE_MAPS_API_KEY` in `.env` file

**2. Rate Limit Exceeded**
```
HTTP 429: Too Many Requests
```
**Solution**: Increase `--delay` parameter or use caching

**3. No Coordinates Found**
```
Failed to geocode: [address]
```
**Solution**: Verify address format includes city, postal code, country

**4. Celery Task Not Running**
```
Task is stuck in PENDING state
```
**Solution**: Ensure Celery worker is running: `celery -A soya_excel_backend worker`

### Debug Mode

Enable debug logging:
```python
# settings.py
LOGGING = {
    'loggers': {
        'route': {
            'level': 'DEBUG',
        },
    },
}
```

## Best Practices

### 1. Address Data Quality
- Always include city and postal code
- Normalize country names (Canada, not CA)
- Validate addresses before geocoding

### 2. Route Planning
- Geocode all clients before creating distribution plans
- Use appropriate clustering method for your distribution area
- Set realistic `max_distance_km` based on vehicle range

### 3. API Usage
- Cache geocoding results to minimize API calls
- Use batch operations for multiple addresses
- Monitor API quota usage

### 4. Performance
- Process large operations asynchronously
- Use database indexes on frequently queried fields
- Implement pagination for large result sets

## Support

For issues or questions:
1. Check this documentation
2. Review error logs in `backend/logs/`
3. Test with management commands in dry-run mode
4. Contact development team

## Changelog

### Version 2.0 (2026-01-04)
- ✨ Added async Google Maps service with rate limiting
- ✨ Implemented multi-client distribution planning
- ✨ Added geographic clustering (DBSCAN & K-Means)
- ✨ Created Celery tasks for background processing
- ✨ Migrated from Farmer to Client model
- ✨ Added batch geocoding endpoints
- ✨ Improved caching strategy
- 📚 Comprehensive documentation
- 🧪 Updated management commands

### Version 1.0
- Basic route optimization
- Google Maps integration
- Manual route creation
