"""
Google Maps integration services for Soya Excel route optimization.
This service handles:
- Address geocoding for Canadian addresses
- Route optimization using Google's routing API
- Distance matrix calculations
- Turn-by-turn directions for drivers
"""

import googlemaps
import logging
from typing import List, Dict, Optional, Tuple, Any
from decimal import Decimal
from django.conf import settings
from django.core.exceptions import ValidationError
from .models import Route, RouteStop
from clients.models import Farmer, Order

logger = logging.getLogger(__name__)


class GoogleMapsService:
    """Service class for Google Maps API integration"""
    
    def __init__(self):
        """Initialize Google Maps client"""
        if not hasattr(settings, 'GOOGLE_MAPS_API_KEY') or not settings.GOOGLE_MAPS_API_KEY:
            raise ValueError("Google Maps API key is not configured in settings")
        
        self.client = googlemaps.Client(key=settings.GOOGLE_MAPS_API_KEY)
        self.canada_bounds = {
            'southwest': {'lat': 41.6765556, 'lng': -141.00187},
            'northeast': {'lat': 83.23324, 'lng': -52.6480987}
        }
    
    def geocode_address(self, address: str, province: str = None) -> Optional[Dict]:
        """
        Geocode a Canadian address to get latitude and longitude.
        
        Args:
            address: The address string to geocode
            province: Optional province to help with accuracy
            
        Returns:
            Dictionary with geocoding results or None if failed
        """
        try:
            # Format address for better Canadian results
            search_address = address
            if province and province in ['QC', 'ON', 'NB', 'BC']:
                province_names = {
                    'QC': 'Quebec', 'ON': 'Ontario', 
                    'NB': 'New Brunswick', 'BC': 'British Columbia'
                }
                search_address = f"{address}, {province_names[province]}, Canada"
            elif not 'Canada' in address.upper():
                search_address = f"{address}, Canada"
            
            # Geocode with Canada bounds for better accuracy
            results = self.client.geocode(
                search_address,
                bounds=self.canada_bounds,
                region='ca'  # Canada region bias
            )
            
            if results:
                result = results[0]
                location = result['geometry']['location']
                
                # Validate that result is actually in Canada
                if self._is_in_canada(location['lat'], location['lng']):
                    return {
                        'latitude': Decimal(str(location['lat'])),
                        'longitude': Decimal(str(location['lng'])),
                        'formatted_address': result['formatted_address'],
                        'place_id': result.get('place_id'),
                        'address_components': result.get('address_components', [])
                    }
                else:
                    logger.warning(f"Geocoded address is outside Canada: {result['formatted_address']}")
                    return None
            
            logger.warning(f"No geocoding results for address: {address}")
            return None
            
        except Exception as e:
            logger.error(f"Error geocoding address '{address}': {str(e)}")
            return None
    
    def validate_canadian_address(self, address: str) -> Dict[str, Any]:
        """
        Validate and standardize a Canadian address.
        
        Args:
            address: Address string to validate
            
        Returns:
            Dictionary with validation results
        """
        try:
            geocode_result = self.geocode_address(address)
            
            if geocode_result:
                address_components = geocode_result.get('address_components', [])
                
                # Extract Canadian-specific address components
                province = None
                postal_code = None
                
                for component in address_components:
                    types = component.get('types', [])
                    if 'administrative_area_level_1' in types:
                        province = component.get('short_name')
                    elif 'postal_code' in types:
                        postal_code = component.get('long_name')
                
                return {
                    'is_valid': True,
                    'formatted_address': geocode_result['formatted_address'],
                    'latitude': geocode_result['latitude'],
                    'longitude': geocode_result['longitude'],
                    'province': province,
                    'postal_code': postal_code,
                    'place_id': geocode_result['place_id']
                }
            else:
                return {
                    'is_valid': False,
                    'error': 'Address could not be geocoded or is not in Canada'
                }
                
        except Exception as e:
            return {
                'is_valid': False,
                'error': str(e)
            }

    def validate_international_address(self, address: str, expected_country: str = None) -> Dict[str, Any]:
        """
        Validate and standardize an international address.
        
        Args:
            address: Address string to validate
            expected_country: Optional expected country code/name for validation
            
        Returns:
            Dictionary with validation results
        """
        try:
            # Geocode without Canada bounds restriction
            results = self.client.geocode(address)
            
            if results:
                result = results[0]
                location = result['geometry']['location']
                address_components = result.get('address_components', [])
                
                # Extract address components
                country = None
                admin_area = None
                postal_code = None
                
                for component in address_components:
                    types = component.get('types', [])
                    if 'country' in types:
                        country = component.get('short_name')
                    elif 'administrative_area_level_1' in types:
                        admin_area = component.get('short_name')
                    elif 'postal_code' in types:
                        postal_code = component.get('long_name')
                
                # If expected country is provided, validate it
                if expected_country:
                    expected_codes = {
                        'USD': ['US', 'USA', 'United States'],
                        'SPAIN': ['ES', 'ESP', 'Spain']
                    }
                    
                    if expected_country in expected_codes:
                        valid_codes = expected_codes[expected_country]
                        # Check if the actual country code matches any of the expected codes
                        country_match = False
                        if country:
                            country_match = any(
                                country.upper() == code.upper() or 
                                code.lower() in result['formatted_address'].lower() 
                                for code in valid_codes
                            )
                        
                        if not country_match:
                            return {
                                'is_valid': False,
                                'error': f'Address appears to be in {country} but expected {expected_country}',
                                'formatted_address': result['formatted_address']
                            }
                
                return {
                    'is_valid': True,
                    'formatted_address': result['formatted_address'],
                    'latitude': Decimal(str(location['lat'])),
                    'longitude': Decimal(str(location['lng'])),
                    'country': country,
                    'admin_area': admin_area,
                    'postal_code': postal_code,
                    'place_id': result.get('place_id')
                }
            else:
                return {
                    'is_valid': False,
                    'error': 'Address could not be geocoded'
                }
                
        except Exception as e:
            return {
                'is_valid': False,
                'error': str(e)
            }
    
    def optimize_route(self, route_id: int, optimization_type: str = 'balanced') -> Dict[str, Any]:
        """
        Optimize a route using Google Maps API.
        
        Args:
            route_id: ID of the route to optimize
            optimization_type: Type of optimization ('distance', 'duration', 'balanced')
            
        Returns:
            Dictionary with optimization results
        """
        try:
            route = Route.objects.get(id=route_id)
            stops = list(route.stops.all().order_by('sequence_number'))
            
            if len(stops) < 2:
                return {'success': False, 'error': 'Route must have at least 2 stops'}
            
            # Get coordinates for all stops
            waypoints = []
            invalid_addresses = []
            
            for stop in stops:
                if stop.location_latitude and stop.location_longitude:
                    waypoints.append({
                        'lat': float(stop.location_latitude),
                        'lng': float(stop.location_longitude),
                        'stop_id': stop.id
                    })
                else:
                    # Try to geocode farmer's address
                    geocode_result = self.geocode_address(
                        stop.farmer.address, 
                        stop.farmer.province
                    )
                    
                    if geocode_result:
                        stop.location_latitude = geocode_result['latitude']
                        stop.location_longitude = geocode_result['longitude']
                        stop.save()
                        
                        waypoints.append({
                            'lat': float(geocode_result['latitude']),
                            'lng': float(geocode_result['longitude']),
                            'stop_id': stop.id
                        })
                    else:
                        invalid_addresses.append({
                            'stop_id': stop.id,
                            'farmer_name': stop.farmer.name,
                            'address': stop.farmer.address
                        })
            
            if invalid_addresses:
                return {
                    'success': False, 
                    'error': 'Could not geocode some addresses',
                    'invalid_addresses': invalid_addresses
                }
            
            if len(waypoints) < 2:
                return {'success': False, 'error': 'Not enough valid addresses found'}
            
            # Use Google's route optimization
            optimized_result = self._optimize_waypoints(waypoints, optimization_type)
            
            if optimized_result['success']:
                # Update route with optimized data
                self._update_route_with_optimization(route, optimized_result)
                
                return {
                    'success': True,
                    'route_id': route.id,
                    'optimized_distance': optimized_result.get('total_distance'),
                    'optimized_duration': optimized_result.get('total_duration'),
                    'optimization_type': optimization_type,
                    'stops_optimized': len(waypoints)
                }
            else:
                return optimized_result
                
        except Route.DoesNotExist:
            return {'success': False, 'error': 'Route not found'}
        except Exception as e:
            logger.error(f"Error optimizing route {route_id}: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    def get_directions(self, origin: str, destination: str, 
                      waypoints: List[str] = None, 
                      optimize_waypoints: bool = True) -> Optional[Dict]:
        """
        Get turn-by-turn directions between points.
        
        Args:
            origin: Starting address or coordinates
            destination: Ending address or coordinates
            waypoints: List of waypoint addresses (optional)
            optimize_waypoints: Whether to optimize waypoint order
            
        Returns:
            Dictionary with directions data
        """
        try:
            directions_result = self.client.directions(
                origin=origin,
                destination=destination,
                waypoints=waypoints,
                optimize_waypoints=optimize_waypoints,
                mode='driving',
                region='ca',
                units='metric'
            )
            
            if directions_result:
                return self._format_directions_response(directions_result[0])
            return None
            
        except Exception as e:
            logger.error(f"Error getting directions from {origin} to {destination}: {str(e)}")
            return None
    
    def get_distance_matrix(self, origins: List[str], destinations: List[str]) -> Optional[Dict]:
        """
        Get distance and duration matrix between multiple points.
        
        Args:
            origins: List of origin addresses/coordinates
            destinations: List of destination addresses/coordinates
            
        Returns:
            Distance matrix data
        """
        try:
            matrix = self.client.distance_matrix(
                origins=origins,
                destinations=destinations,
                mode='driving',
                units='metric',
                region='ca'
            )
            
            return self._format_distance_matrix(matrix)
            
        except Exception as e:
            logger.error(f"Error getting distance matrix: {str(e)}")
            return None
    
    def _is_in_canada(self, lat: float, lng: float) -> bool:
        """Check if coordinates are within Canada bounds"""
        return (self.canada_bounds['southwest']['lat'] <= lat <= self.canada_bounds['northeast']['lat'] and
                self.canada_bounds['southwest']['lng'] <= lng <= self.canada_bounds['northeast']['lng'])
    
    def _optimize_waypoints(self, waypoints: List[Dict], optimization_type: str) -> Dict[str, Any]:
        """
        Optimize waypoint order using Google's route optimization.
        
        Args:
            waypoints: List of waypoint dictionaries with lat/lng
            optimization_type: Type of optimization
            
        Returns:
            Optimization result dictionary
        """
        try:
            if len(waypoints) < 2:
                return {'success': False, 'error': 'Need at least 2 waypoints'}
            
            # Convert waypoints to coordinate strings
            origin = f"{waypoints[0]['lat']},{waypoints[0]['lng']}"
            destination = f"{waypoints[-1]['lat']},{waypoints[-1]['lng']}"
            intermediate_waypoints = [
                f"{wp['lat']},{wp['lng']}" for wp in waypoints[1:-1]
            ]
            
            # Get optimized route
            directions = self.client.directions(
                origin=origin,
                destination=destination,
                waypoints=intermediate_waypoints,
                optimize_waypoints=True,
                mode='driving',
                region='ca',
                units='metric'
            )
            
            if directions:
                route = directions[0]
                
                # Extract optimization results
                waypoint_order = route.get('waypoint_order', [])
                legs = route.get('legs', [])
                
                total_distance = 0
                total_duration = 0
                
                for leg in legs:
                    if 'distance' in leg:
                        total_distance += leg['distance']['value']  # meters
                    if 'duration' in leg:
                        total_duration += leg['duration']['value']  # seconds
                
                # Convert to appropriate units
                total_distance_km = total_distance / 1000.0  # Convert to km
                total_duration_minutes = total_duration / 60.0  # Convert to minutes
                
                return {
                    'success': True,
                    'waypoint_order': waypoint_order,
                    'total_distance': total_distance_km,
                    'total_duration': total_duration_minutes,
                    'legs': legs,
                    'overview_polyline': route.get('overview_polyline', {}).get('points', ''),
                    'optimized_waypoints': waypoints
                }
            else:
                return {'success': False, 'error': 'No route found'}
                
        except Exception as e:
            logger.error(f"Error optimizing waypoints: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    def _update_route_with_optimization(self, route: Route, optimization_result: Dict) -> None:
        """Update route model with optimization results"""
        try:
            # Update route totals
            route.total_distance = Decimal(str(optimization_result['total_distance']))
            route.estimated_duration = int(optimization_result['total_duration'])
            
            # Store waypoints and polyline data
            route.waypoints = optimization_result.get('optimized_waypoints', [])
            
            # Update optimization sequence
            waypoint_order = optimization_result.get('waypoint_order', [])
            if waypoint_order:
                # Reorder stops based on optimization
                stops = list(route.stops.all())
                
                # Create new sequence: origin + optimized intermediate + destination
                new_sequence = [stops[0].id]  # First stop stays first
                for idx in waypoint_order:
                    if idx + 1 < len(stops) - 1:  # Intermediate stops
                        new_sequence.append(stops[idx + 1].id)
                if len(stops) > 1:
                    new_sequence.append(stops[-1].id)  # Last stop stays last
                
                route.optimized_sequence = new_sequence
                
                # Update stop sequence numbers
                for i, stop_id in enumerate(new_sequence):
                    RouteStop.objects.filter(id=stop_id).update(sequence_number=i + 1)
            
            route.save()
            
        except Exception as e:
            logger.error(f"Error updating route with optimization: {str(e)}")
    
    def _format_directions_response(self, directions_data: Dict) -> Dict:
        """Format Google Directions API response for frontend consumption"""
        legs = directions_data.get('legs', [])
        
        formatted_steps = []
        for leg_idx, leg in enumerate(legs):
            leg_steps = []
            for step in leg.get('steps', []):
                leg_steps.append({
                    'instruction': step.get('html_instructions', ''),
                    'distance': step.get('distance', {}).get('text', ''),
                    'duration': step.get('duration', {}).get('text', ''),
                    'start_location': step.get('start_location', {}),
                    'end_location': step.get('end_location', {}),
                    'maneuver': step.get('maneuver', ''),
                    'polyline': step.get('polyline', {}).get('points', '')
                })
            
            formatted_steps.append({
                'leg_index': leg_idx,
                'start_address': leg.get('start_address', ''),
                'end_address': leg.get('end_address', ''),
                'distance': leg.get('distance', {}).get('text', ''),
                'duration': leg.get('duration', {}).get('text', ''),
                'steps': leg_steps
            })
        
        return {
            'legs': formatted_steps,
            'overview_polyline': directions_data.get('overview_polyline', {}).get('points', ''),
            'summary': directions_data.get('summary', ''),
            'warnings': directions_data.get('warnings', []),
            'waypoint_order': directions_data.get('waypoint_order', [])
        }
    
    def _format_distance_matrix(self, matrix_data: Dict) -> Dict:
        """Format distance matrix response"""
        rows = matrix_data.get('rows', [])
        
        formatted_matrix = []
        for row_idx, row in enumerate(rows):
            elements = []
            for element in row.get('elements', []):
                elements.append({
                    'distance_km': element.get('distance', {}).get('value', 0) / 1000.0,
                    'distance_text': element.get('distance', {}).get('text', ''),
                    'duration_minutes': element.get('duration', {}).get('value', 0) / 60.0,
                    'duration_text': element.get('duration', {}).get('text', ''),
                    'status': element.get('status', 'UNKNOWN')
                })
            formatted_matrix.append(elements)
        
        return {
            'origin_addresses': matrix_data.get('origin_addresses', []),
            'destination_addresses': matrix_data.get('destination_addresses', []),
            'matrix': formatted_matrix
        }


class RouteOptimizationService:
    """Service for advanced route optimization specific to Soya Excel operations"""
    
    def __init__(self):
        self.maps_service = GoogleMapsService()
    
    def optimize_weekly_routes(self, week_start_date: str) -> Dict[str, Any]:
        """
        Optimize all routes for a given week.
        
        Args:
            week_start_date: Start date of the week (YYYY-MM-DD)
            
        Returns:
            Dictionary with optimization results for all routes
        """
        try:
            from datetime import datetime, timedelta
            import dateutil.parser
            
            start_date = dateutil.parser.parse(week_start_date).date()
            end_date = start_date + timedelta(days=6)
            
            routes = Route.objects.filter(
                date__range=[start_date, end_date],
                status__in=['draft', 'planned']
            )
            
            optimization_results = []
            
            for route in routes:
                result = self.maps_service.optimize_route(route.id)
                optimization_results.append({
                    'route_id': route.id,
                    'route_name': route.name,
                    'date': route.date.isoformat(),
                    'optimization_result': result
                })
            
            return {
                'success': True,
                'week_start': week_start_date,
                'routes_optimized': len(optimization_results),
                'results': optimization_results
            }
            
        except Exception as e:
            logger.error(f"Error optimizing weekly routes: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    def calculate_route_kpis(self, route_id: int) -> Dict[str, Any]:
        """
        Calculate KPIs for a specific route (KM/TM ratios, efficiency, etc.).
        
        Args:
            route_id: ID of the route
            
        Returns:
            Dictionary with calculated KPIs
        """
        try:
            route = Route.objects.get(id=route_id)
            
            total_quantity = sum(
                float(stop.quantity_to_deliver or 0) 
                for stop in route.stops.all()
            )
            
            kpis = {
                'route_id': route.id,
                'total_distance_km': float(route.total_distance or 0),
                'total_quantity_tonnes': total_quantity,
                'km_per_tonne': 0,
                'stops_count': route.stops.count(),
                'estimated_duration_hours': (route.estimated_duration or 0) / 60.0,
                'efficiency_score': 0
            }
            
            # Calculate KM/TM ratio
            if total_quantity > 0:
                kpis['km_per_tonne'] = kpis['total_distance_km'] / total_quantity
            
            # Calculate efficiency score (lower KM/TM is better)
            if kpis['km_per_tonne'] > 0:
                # Target KM/TM varies by product type, but generally 15-25 is good
                target_km_per_tonne = 20.0
                kpis['efficiency_score'] = max(0, 100 - (kpis['km_per_tonne'] - target_km_per_tonne) * 2)
            
            return kpis
            
        except Route.DoesNotExist:
            return {'error': 'Route not found'}
        except Exception as e:
            logger.error(f"Error calculating route KPIs: {str(e)}")
            return {'error': str(e)}


# Convenience functions for easy usage
def geocode_farmer_address(farmer: Farmer) -> Optional[Dict]:
    """Geocode a farmer's address and update their coordinates"""
    service = GoogleMapsService()
    result = service.geocode_address(farmer.address, farmer.province)
    
    if result:
        farmer.latitude = result['latitude']
        farmer.longitude = result['longitude']
        farmer.save()
    
    return result


def optimize_route_with_google_maps(route_id: int, optimization_type: str = 'balanced') -> Dict[str, Any]:
    """Optimize a single route using Google Maps"""
    service = GoogleMapsService()
    return service.optimize_route(route_id, optimization_type)


def validate_address(address: str) -> Dict[str, Any]:
    """Validate and standardize a Canadian address"""
    service = GoogleMapsService()
    return service.validate_canadian_address(address)


class LiveTrackingService:
    """Service for live vehicle tracking and position updates"""
    
    def __init__(self):
        self.active_vehicles = {}  # In-memory cache for demo purposes
    
    def get_active_vehicle_locations(self, route_ids: List[str] = None) -> List[Dict]:
        """
        Get current positions of active vehicles
        In a real implementation, this would connect to GPS tracking systems
        """
        try:
            from django.utils import timezone as django_timezone
            import random
            
            # Get active routes
            active_routes = Route.objects.filter(status='active')
            if route_ids:
                active_routes = active_routes.filter(id__in=route_ids)
            
            vehicle_locations = []
            
            for route in active_routes:
                # Simulate GPS tracking data
                vehicle_data = self._simulate_vehicle_position(route)
                if vehicle_data:
                    vehicle_locations.append(vehicle_data)
            
            return vehicle_locations
            
        except Exception as e:
            logger.error(f"Error getting vehicle locations: {str(e)}")
            return []
    
    def _simulate_vehicle_position(self, route: Route) -> Optional[Dict]:
        """
        Simulate vehicle position for demo purposes
        In production, this would query actual GPS devices
        """
        try:
            import random
            from django.utils import timezone as django_timezone
            
            # Get completed and upcoming stops
            completed_stops = list(route.stops.filter(is_completed=True).order_by('sequence_number'))
            upcoming_stops = list(route.stops.filter(is_completed=False).order_by('sequence_number'))
            
            if not upcoming_stops:
                return None  # Route is completed
            
            next_stop = upcoming_stops[0]
            
            # If no coordinates available, can't simulate position
            if not next_stop.location_latitude or not next_stop.location_longitude:
                return None
            
            # Calculate simulated position
            if completed_stops:
                # Between last completed stop and next stop
                last_stop = completed_stops[-1]
                if last_stop.location_latitude and last_stop.location_longitude:
                    # Interpolate position (simulate being 30-70% along the way)
                    progress = random.uniform(0.3, 0.7)
                    
                    lat = last_stop.location_latitude + (next_stop.location_latitude - last_stop.location_latitude) * Decimal(str(progress))
                    lng = last_stop.location_longitude + (next_stop.location_longitude - last_stop.location_longitude) * Decimal(str(progress))
                else:
                    # Use next stop position with small offset
                    lat = next_stop.location_latitude + Decimal(str(random.uniform(-0.001, 0.001)))
                    lng = next_stop.location_longitude + Decimal(str(random.uniform(-0.001, 0.001)))
            else:
                # At or near first stop
                lat = next_stop.location_latitude + Decimal(str(random.uniform(-0.001, 0.001)))
                lng = next_stop.location_longitude + Decimal(str(random.uniform(-0.001, 0.001)))
            
            # Get delivery info if available
            delivery = None
            try:
                delivery = route.deliveries.first() if hasattr(route, 'deliveries') else None
            except:
                pass
            
            return {
                'id': f'vehicle_{route.id}',
                'name': delivery.driver.full_name if delivery and delivery.driver else f'Driver {route.id}',
                'latitude': float(lat),
                'longitude': float(lng),
                'vehicle': {
                    'id': delivery.vehicle.id if delivery and delivery.vehicle else f'vehicle_{route.id}',
                    'license_plate': delivery.vehicle.vehicle_number if delivery and delivery.vehicle else f'QC{route.id:03d}',
                    'vehicle_type': delivery.vehicle.get_vehicle_type_display() if delivery and delivery.vehicle else 'Delivery Truck'
                },
                'current_route': {
                    'id': str(route.id),
                    'name': route.name,
                    'stops_completed': len(completed_stops),
                    'total_stops': route.stops.count(),
                    'status': route.status
                },
                'last_update': django_timezone.now().isoformat(),
                'is_active': True,
                'heading': random.randint(0, 359),  # Random heading for demo
                'speed': random.randint(40, 70),    # Random speed 40-70 km/h
                'next_stop': {
                    'farmer_name': next_stop.farmer.name,
                    'estimated_arrival': next_stop.estimated_arrival_time.isoformat() if next_stop.estimated_arrival_time else None,
                    'sequence_number': next_stop.sequence_number
                } if next_stop else None
            }
            
        except Exception as e:
            logger.error(f"Error simulating vehicle position for route {route.id}: {str(e)}")
            return None
    
    def update_vehicle_position(self, vehicle_id: str, latitude: float, longitude: float, 
                               heading: float = None, speed: float = None) -> bool:
        """
        Update vehicle position (for real GPS integration)
        """
        try:
            from django.utils import timezone as django_timezone
            
            # In a real implementation, this would update the database or cache
            # with actual GPS coordinates received from tracking devices
            
            self.active_vehicles[vehicle_id] = {
                'latitude': latitude,
                'longitude': longitude,
                'heading': heading,
                'speed': speed,
                'last_update': django_timezone.now().isoformat()
            }
            
            # Here you would also update any delivery progress, 
            # check for geofencing alerts, etc.
            
            return True
            
        except Exception as e:
            logger.error(f"Error updating vehicle position for {vehicle_id}: {str(e)}")
            return False
    
    def check_delivery_progress(self, route_id: int) -> Dict:
        """
        Check if vehicle has reached delivery stops (geofencing)
        """
        try:
            route = Route.objects.get(id=route_id)
            
            # Get current vehicle position
            vehicle_positions = self.get_active_vehicle_locations([str(route_id)])
            if not vehicle_positions:
                return {'status': 'no_tracking_data'}
            
            vehicle = vehicle_positions[0]
            vehicle_lat = vehicle['latitude']
            vehicle_lng = vehicle['longitude']
            
            # Check proximity to upcoming stops (within 100 meters)
            upcoming_stops = route.stops.filter(is_completed=False).order_by('sequence_number')
            
            for stop in upcoming_stops:
                if stop.location_latitude and stop.location_longitude:
                    # Calculate distance (simple approximation)
                    lat_diff = abs(float(stop.location_latitude) - vehicle_lat)
                    lng_diff = abs(float(stop.location_longitude) - vehicle_lng)
                    
                    # Rough distance calculation (1 degree ≈ 111km)
                    distance_km = ((lat_diff ** 2 + lng_diff ** 2) ** 0.5) * 111
                    
                    if distance_km < 0.1:  # Within 100 meters
                        return {
                            'status': 'arrived_at_stop',
                            'stop_id': stop.id,
                            'farmer_name': stop.farmer.name,
                            'sequence_number': stop.sequence_number,
                            'distance_meters': distance_km * 1000
                        }
            
            return {'status': 'en_route'}
            
        except Exception as e:
            logger.error(f"Error checking delivery progress for route {route_id}: {str(e)}")
            return {'status': 'error', 'message': str(e)}
