# Google Maps Integration for Soya Excel Route Management

This document describes the Google Maps integration implemented for the Soya Excel route management system. The integration provides real address geocoding, route optimization, and turn-by-turn directions for delivery operations across Canada.

## Features

### 🗺️ Core Features
- **Address Geocoding**: Convert Canadian addresses to precise coordinates
- **Address Validation**: Validate and standardize Canadian addresses
- **Route Optimization**: Optimize delivery routes using Google's routing algorithms
- **Turn-by-turn Directions**: Provide detailed driving directions for drivers
- **Distance Matrix**: Calculate distances and travel times between multiple points
- **Canadian Focus**: Optimized for Canadian addresses with province-specific validation

### 📍 Supported Regions
- Quebec (QC)
- Ontario (ON)  
- New Brunswick (NB)
- British Columbia (BC)
- United States (USD) - for cross-border deliveries
- Spain (SPAIN) - for international operations

## Setup Instructions

### 1. Get Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/google/maps-apis/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - **Geocoding API** - for address geocoding
   - **Directions API** - for route optimization and directions
   - **Distance Matrix API** - for distance calculations
   - **Maps JavaScript API** - for frontend map display
4. Create credentials (API Key)
5. Restrict the API key to your domains for security

### 2. Configure Environment

Add your API key to your environment variables:

```bash
# In your .env file or environment
GOOGLE_MAPS_API_KEY=your_actual_google_maps_api_key_here
```

The system will automatically load this from `settings.py`:

```python
GOOGLE_MAPS_API_KEY = os.getenv('GOOGLE_MAPS_API_KEY', 'YOUR_GOOGLE_MAPS_API_KEY_HERE')
```

### 3. Install Dependencies

The required Google Maps Python client is already in `requirements.txt`:

```
googlemaps==4.10.0
```

## API Endpoints

### Route Management Endpoints

#### Optimize Route
```http
POST /api/routes/{route_id}/optimize/
Content-Type: application/json

{
    "optimization_type": "balanced"  // Options: "distance", "duration", "balanced"
}
```

**Response:**
```json
{
    "route": {...},
    "optimization": {...},
    "message": "Route optimized successfully using Google Maps"
}
```

#### Get Directions
```http
GET /api/routes/{route_id}/directions/
```

**Response:**
```json
{
    "route_id": 123,
    "directions": {
        "legs": [...],
        "overview_polyline": "encoded_polyline_string",
        "summary": "Route summary",
        "waypoint_order": [...]
    },
    "waypoints_count": 5
}
```

#### Geocode Address
```http
POST /api/routes/geocode_address/
Content-Type: application/json

{
    "address": "123 Main St, Montreal, QC",
    "province": "QC"
}
```

#### Weekly Route Optimization
```http
POST /api/routes/optimize_weekly/
Content-Type: application/json

{
    "week_start": "2024-01-15"
}
```

#### Route KPIs
```http
GET /api/routes/{route_id}/kpis/
```

### Farmer/Client Address Management

#### Geocode Farmer Address
```http
POST /api/farmers/{farmer_id}/geocode_address/
```

#### Validate Farmer Address  
```http
POST /api/farmers/{farmer_id}/validate_address/
```

#### Validate New Address (Form Validation)
```http
POST /api/farmers/validate_new_address/
Content-Type: application/json

{
    "address": "456 Farm Road, Quebec City, QC G1A 1A1",
    "province": "QC"
}
```

#### Address Quality Report
```http
GET /api/farmers/address_quality_report/
```

## Management Commands

### Geocode All Farmer Addresses
```bash
python manage.py geocode_farmer_addresses [OPTIONS]
```

**Options:**
- `--force` - Re-geocode all addresses, even those with existing coordinates
- `--province QC` - Only process farmers from specific province
- `--limit 100` - Maximum number to process (default: 100)
- `--delay 0.1` - Delay between requests (default: 0.1 seconds)
- `--dry-run` - Show what would be processed without making changes

**Examples:**
```bash
# Geocode farmers missing coordinates
python manage.py geocode_farmer_addresses

# Re-geocode all Quebec farmers
python manage.py geocode_farmer_addresses --force --province QC

# Process first 50 Ontario farmers with longer delay
python manage.py geocode_farmer_addresses --province ON --limit 50 --delay 0.2

# Dry run to see what would be processed
python manage.py geocode_farmer_addresses --dry-run
```

### Validate Addresses
```bash
python manage.py validate_addresses [OPTIONS]
```

**Options:**
- `--fix-invalid` - Automatically update addresses with corrected versions
- `--province QC` - Only validate specific province
- `--limit 50` - Maximum addresses to validate (default: 50)
- `--delay 0.2` - Delay between requests (default: 0.2 seconds)
- `--only-missing-coords` - Only validate addresses missing coordinates

**Examples:**
```bash
# Validate addresses and show suggestions
python manage.py validate_addresses

# Auto-fix address formatting issues
python manage.py validate_addresses --fix-invalid

# Validate only farmers missing coordinates
python manage.py validate_addresses --only-missing-coords
```

## Model Enhancements

### Farmer Model New Methods

```python
farmer = Farmer.objects.get(id=1)

# Check if farmer has coordinates
if farmer.has_coordinates:
    lat, lng = farmer.coordinates_tuple

# Geocode address
result = farmer.geocode_address(save=True)

# Validate address
validation = farmer.validate_address()

# Update coordinates if missing
updated = farmer.update_coordinates_if_missing()

# Get address quality score (0-100)
score = farmer.address_quality_score
```

### RouteStop Model New Methods

```python
stop = RouteStop.objects.get(id=1)

# Get coordinates (stop's own or farmer's as fallback)
coords = stop.get_coordinates()

# Update coordinates from farmer
stop.update_coordinates_from_farmer()

# Geocode this specific location
result = stop.geocode_location(save=True)
```

## Service Classes

### GoogleMapsService

Main service class for Google Maps operations:

```python
from route.services import GoogleMapsService

service = GoogleMapsService()

# Geocode address
result = service.geocode_address("123 Main St, Montreal, QC", "QC")

# Validate Canadian address
validation = service.validate_canadian_address("456 Farm Rd, Toronto, ON")

# Optimize route
optimization = service.optimize_route(route_id=123, optimization_type="balanced")

# Get directions
directions = service.get_directions(origin, destination, waypoints)

# Get distance matrix
matrix = service.get_distance_matrix(origins, destinations)
```

### RouteOptimizationService

Advanced route optimization for Soya Excel operations:

```python
from route.services import RouteOptimizationService

optimizer = RouteOptimizationService()

# Optimize all routes for a week
result = optimizer.optimize_weekly_routes("2024-01-15")

# Calculate route KPIs
kpis = optimizer.calculate_route_kpis(route_id=123)
```

## Data Models

### Enhanced Fields

**Farmer Model:**
- `latitude` - Decimal field for precise coordinates
- `longitude` - Decimal field for precise coordinates  
- `address` - Enhanced with validation
- `province` - Canadian province codes

**RouteStop Model:**
- `location_latitude` - Stop-specific coordinates
- `location_longitude` - Stop-specific coordinates

**Route Model:**
- `waypoints` - JSON field storing route waypoints
- `optimized_sequence` - Optimized stop order

**RouteOptimization Model:**
- `google_maps_used` - Boolean flag
- `original_distance` / `optimized_distance` - Distance comparison
- `optimization_type` - Type of optimization performed

## Usage Examples

### 1. Creating an Optimized Route

```python
# Create route with stops
route = Route.objects.create(name="Montreal Delivery Route", date="2024-01-15")

# Add stops
stop1 = RouteStop.objects.create(route=route, farmer=farmer1, sequence_number=1)
stop2 = RouteStop.objects.create(route=route, farmer=farmer2, sequence_number=2)

# Optimize using Google Maps
from route.services import GoogleMapsService
service = GoogleMapsService()
result = service.optimize_route(route.id, "balanced")

if result['success']:
    print(f"Route optimized: {result['optimized_distance']} km")
```

### 2. Validating Addresses in Forms

```javascript
// Frontend form validation
const validateAddress = async (address, province) => {
    const response = await fetch('/api/farmers/validate_new_address/', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({address, province})
    });
    
    const result = await response.json();
    
    if (result.validation_result.is_valid) {
        console.log('Valid address:', result.validation_result.formatted_address);
    } else {
        console.error('Invalid address:', result.validation_result.error);
    }
};
```

### 3. Getting Delivery Directions

```python
# Get directions for a route
from route.services import GoogleMapsService

service = GoogleMapsService()
route = Route.objects.get(id=123)
stops = route.stops.all().order_by('sequence_number')

# Build waypoint list
waypoints = [f"{stop.farmer.latitude},{stop.farmer.longitude}" for stop in stops]

# Get directions
directions = service.get_directions(
    origin=waypoints[0],
    destination=waypoints[-1], 
    waypoints=waypoints[1:-1],
    optimize_waypoints=False
)

# directions contains turn-by-turn instructions for the driver
```

## Rate Limiting & Best Practices

### Google Maps API Limits
- **Geocoding API**: 50 requests per second
- **Directions API**: 50 requests per second  
- **Distance Matrix API**: 1000 elements per request

### Optimization Recommendations
1. **Cache Results**: Store geocoded coordinates in the database
2. **Batch Operations**: Use management commands for bulk processing
3. **Rate Limiting**: Add delays between requests (0.1-0.2 seconds)
4. **Error Handling**: Implement retry logic for API failures
5. **Cost Management**: Monitor API usage and set billing alerts

### Address Quality Tips
1. Include postal codes when possible
2. Use full province names or standard abbreviations
3. Include "Canada" in addresses for better accuracy
4. Validate addresses before saving to database
5. Regular cleanup of low-quality addresses

## Troubleshooting

### Common Issues

**API Key Not Working:**
- Verify API key is correct in environment variables
- Check that required APIs are enabled in Google Cloud Console
- Ensure API key has proper domain restrictions

**Geocoding Failures:**
- Address format may be incorrect
- Address may not exist in Google's database
- Check if address is actually in Canada
- Try adding more specific details (postal code, etc.)

**Route Optimization Failures:**
- Ensure all stops have valid coordinates
- Check that addresses are accessible by vehicle
- Verify there are at least 2 stops in the route

### Debug Mode

Enable debug logging in Django settings:

```python
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'loggers': {
        'route.services': {
            'handlers': ['console'],
            'level': 'DEBUG',
        },
    },
}
```

## Cost Estimation

### Typical Usage Costs (CAD, approximate)
- **Geocoding**: $6.50 per 1000 requests
- **Directions**: $6.50 per 1000 requests  
- **Distance Matrix**: $6.50 per 1000 elements

### Cost Optimization Strategies
1. Cache geocoded results in database
2. Use bulk operations for address updates
3. Optimize API calls by grouping requests
4. Set usage quotas and alerts
5. Consider using Static Maps for simple displays

## Future Enhancements

### Planned Features
- **Real-time Traffic**: Integrate live traffic data
- **Driver Mobile App**: Turn-by-turn navigation
- **Route Analytics**: Advanced performance metrics  
- **Geofencing**: Automatic delivery confirmations
- **Multi-depot Routing**: Support for multiple distribution centers

### Integration Opportunities
- **Fleet Management**: Vehicle tracking and monitoring
- **Customer Portal**: Delivery tracking for farmers
- **IoT Integration**: Automatic reordering based on feed levels
- **Weather Integration**: Route adjustments for weather conditions

## Support

For issues with the Google Maps integration:

1. Check the Django logs for detailed error messages
2. Verify your API key configuration and quotas
3. Test with the management commands first
4. Review the Google Maps API documentation
5. Monitor your API usage in Google Cloud Console

## Security Notes

- Never commit API keys to version control
- Use environment variables for configuration
- Restrict API keys to specific domains/IPs
- Monitor API usage for unusual patterns
- Rotate API keys periodically
- Enable billing alerts to prevent unexpected charges
