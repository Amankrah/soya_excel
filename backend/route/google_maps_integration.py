"""
Google Maps Integration for Driver Route Sharing

This module provides functionality to:
- Generate Google Maps deep links for drivers
- Share optimized routes with Google Maps
- Create waypoint-based navigation URLs
- Generate route summaries for driver apps
"""

import logging
from typing import Dict, List, Optional
from urllib.parse import urlencode, quote
from decimal import Decimal

from .models import Route, RouteStop, Warehouse

logger = logging.getLogger(__name__)


class GoogleMapsRouteSharing:
    """
    Service for creating shareable Google Maps routes for drivers.

    Features:
    - Generate Google Maps URLs with all waypoints
    - Create deep links for mobile Google Maps app
    - Support for multi-stop routes with optimized sequence
    - Compatible with iOS and Android Google Maps apps
    """

    # Google Maps base URLs
    MAPS_WEB_URL = "https://www.google.com/maps/dir/"
    MAPS_MOBILE_URL = "https://maps.google.com/"

    def __init__(self):
        self.logger = logger

    def generate_route_url(
        self,
        route_id: int,
        url_type: str = 'web',
        include_waypoint_optimization: bool = False
    ) -> Dict:
        """
        Generate a Google Maps URL for a complete route.

        Args:
            route_id: Route ID
            url_type: Type of URL ('web', 'mobile', 'android', 'ios')
            include_waypoint_optimization: Let Google optimize waypoint order

        Returns:
            Dictionary with URL and route information
        """
        try:
            route = Route.objects.prefetch_related(
                'stops__client',
                'origin_warehouse'
            ).get(id=route_id)

            # Get ordered stops
            stops = route.stops.all().order_by('sequence_number')

            if not stops.exists():
                return {
                    'success': False,
                    'error': 'Route has no stops'
                }

            # Build waypoint list
            waypoints = []

            # Add origin warehouse as starting point
            if route.origin_warehouse and route.origin_warehouse.has_coordinates:
                waypoints.append({
                    'name': route.origin_warehouse.name,
                    'address': route.origin_warehouse.full_address,
                    'latitude': float(route.origin_warehouse.latitude),
                    'longitude': float(route.origin_warehouse.longitude),
                    'type': 'warehouse'
                })

            # Add all delivery stops
            for stop in stops:
                coords = stop.get_coordinates()
                if coords:
                    waypoints.append({
                        'name': stop.client.name,
                        'address': getattr(stop.client, 'full_address', f"{stop.client.city}, {stop.client.country}"),
                        'latitude': coords[0],
                        'longitude': coords[1],
                        'sequence': stop.sequence_number,
                        'type': 'delivery',
                        'quantity': float(stop.quantity_to_deliver) if stop.quantity_to_deliver else None
                    })

            # Add return to warehouse if configured
            if route.return_to_warehouse and route.origin_warehouse and route.origin_warehouse.has_coordinates:
                waypoints.append({
                    'name': f"{route.origin_warehouse.name} (Return)",
                    'address': route.origin_warehouse.full_address,
                    'latitude': float(route.origin_warehouse.latitude),
                    'longitude': float(route.origin_warehouse.longitude),
                    'type': 'warehouse'
                })

            # Generate appropriate URL
            if url_type == 'web':
                url = self._generate_web_url(waypoints, include_waypoint_optimization)
            elif url_type in ['mobile', 'android', 'ios']:
                url = self._generate_mobile_url(waypoints, url_type)
            else:
                url = self._generate_web_url(waypoints, include_waypoint_optimization)

            return {
                'success': True,
                'route_id': route.id,
                'route_name': route.name,
                'route_date': route.date.isoformat(),
                'url': url,
                'url_type': url_type,
                'waypoints_count': len(waypoints),
                'waypoints': waypoints,
                'total_distance_km': float(route.total_distance) if route.total_distance else None,
                'estimated_duration_minutes': route.estimated_duration,
                'instructions': self._get_driver_instructions(route, url_type)
            }

        except Route.DoesNotExist:
            return {
                'success': False,
                'error': 'Route not found'
            }
        except Exception as e:
            self.logger.error(f"Error generating route URL: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def _generate_web_url(
        self,
        waypoints: List[Dict],
        optimize_waypoints: bool = False
    ) -> str:
        """
        Generate a Google Maps web URL with waypoints.

        Format: https://www.google.com/maps/dir/origin/waypoint1/waypoint2.../destination
        """
        if not waypoints:
            return ""

        # Build URL path with coordinates
        location_parts = []

        for wp in waypoints:
            # Use lat,lng format for precision
            location_parts.append(f"{wp['latitude']},{wp['longitude']}")

        # Join all locations
        url_path = "/".join(location_parts)

        # Add query parameters
        params = {
            'travelmode': 'driving',
            'dir_action': 'navigate'
        }

        # Add waypoint optimization if requested
        if optimize_waypoints and len(waypoints) > 2:
            params['optimize'] = 'true'

        query_string = urlencode(params)
        full_url = f"{self.MAPS_WEB_URL}{url_path}?{query_string}"

        return full_url

    def _generate_mobile_url(
        self,
        waypoints: List[Dict],
        platform: str = 'mobile'
    ) -> str:
        """
        Generate a Google Maps mobile app deep link.

        iOS: comgooglemaps://?saddr=...&daddr=...&waypoints=...
        Android: google.navigation:q=...&waypoints=...
        Generic: https://maps.google.com/?saddr=...&daddr=...&waypoints=...
        """
        if not waypoints:
            return ""

        if len(waypoints) < 2:
            # Single location - just navigate there
            wp = waypoints[0]
            if platform == 'ios':
                return f"comgooglemaps://?daddr={wp['latitude']},{wp['longitude']}&directionsmode=driving"
            elif platform == 'android':
                return f"google.navigation:q={wp['latitude']},{wp['longitude']}&mode=d"
            else:
                return f"{self.MAPS_MOBILE_URL}?daddr={wp['latitude']},{wp['longitude']}"

        # Multi-stop route
        origin = waypoints[0]
        destination = waypoints[-1]
        intermediate = waypoints[1:-1] if len(waypoints) > 2 else []

        # Build waypoints string
        waypoints_str = "|".join([
            f"{wp['latitude']},{wp['longitude']}"
            for wp in intermediate
        ])

        if platform == 'ios':
            # iOS Google Maps URL Scheme
            url = f"comgooglemaps://?saddr={origin['latitude']},{origin['longitude']}"
            url += f"&daddr={destination['latitude']},{destination['longitude']}"
            if waypoints_str:
                url += f"&waypoints={waypoints_str}"
            url += "&directionsmode=driving"
            return url

        elif platform == 'android':
            # Android Intent URL
            url = f"google.navigation:q={destination['latitude']},{destination['longitude']}"
            if waypoints_str:
                url += f"&waypoints={waypoints_str}"
            url += "&mode=d"
            return url

        else:
            # Generic mobile web URL
            url = f"{self.MAPS_MOBILE_URL}?saddr={origin['latitude']},{origin['longitude']}"
            url += f"&daddr={destination['latitude']},{destination['longitude']}"
            if waypoints_str:
                url += f"&waypoints={waypoints_str}"
            url += "&directionsmode=driving"
            return url

    def _get_driver_instructions(self, route: Route, url_type: str) -> str:
        """Generate instructions for drivers on how to use the shared route"""

        if url_type in ['android', 'ios']:
            return (
                f"Tap the link to open this route directly in Google Maps. "
                f"The route includes {route.stops.count()} delivery stops in the optimal sequence. "
                f"Follow the turn-by-turn navigation provided by Google Maps."
            )
        elif url_type == 'mobile':
            return (
                f"Open this link on your mobile device. If you have Google Maps installed, "
                f"it will open automatically with the complete route ({route.stops.count()} stops). "
                f"Otherwise, it will open in your mobile browser."
            )
        else:  # web
            return (
                f"Open this link to view the complete delivery route in Google Maps. "
                f"You can send this link to your phone, or click 'Send to your phone' in Google Maps. "
                f"Route includes {route.stops.count()} stops totaling "
                f"{float(route.total_distance) if route.total_distance else 'N/A'} km."
            )

    def generate_stop_navigation_url(
        self,
        stop_id: int,
        current_latitude: Optional[float] = None,
        current_longitude: Optional[float] = None
    ) -> Dict:
        """
        Generate navigation URL from current position to a specific stop.

        Args:
            stop_id: RouteStop ID
            current_latitude: Current driver latitude (optional)
            current_longitude: Current driver longitude (optional)

        Returns:
            Dictionary with navigation URL
        """
        try:
            stop = RouteStop.objects.select_related('client', 'route').get(id=stop_id)

            dest_coords = stop.get_coordinates()
            if not dest_coords:
                return {
                    'success': False,
                    'error': 'Stop does not have valid coordinates'
                }

            # Build navigation URL
            if current_latitude and current_longitude:
                # Navigate from current position
                url = (
                    f"{self.MAPS_MOBILE_URL}?saddr={current_latitude},{current_longitude}"
                    f"&daddr={dest_coords[0]},{dest_coords[1]}"
                    f"&directionsmode=driving"
                )
            else:
                # Navigate to destination (will use device location)
                url = (
                    f"{self.MAPS_MOBILE_URL}?daddr={dest_coords[0]},{dest_coords[1]}"
                    f"&directionsmode=driving"
                )

            return {
                'success': True,
                'stop_id': stop.id,
                'stop_sequence': stop.sequence_number,
                'client_name': stop.client.name,
                'client_address': getattr(stop.client, 'full_address', f"{stop.client.city}, {stop.client.country}"),
                'latitude': dest_coords[0],
                'longitude': dest_coords[1],
                'url': url,
                'quantity_to_deliver': float(stop.quantity_to_deliver) if stop.quantity_to_deliver else None
            }

        except RouteStop.DoesNotExist:
            return {
                'success': False,
                'error': 'Stop not found'
            }
        except Exception as e:
            self.logger.error(f"Error generating stop navigation URL: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def create_route_summary_for_driver(self, route_id: int) -> Dict:
        """
        Create a comprehensive route summary for driver apps.

        Includes all information drivers need for their deliveries.
        """
        try:
            route = Route.objects.select_related(
                'origin_warehouse',
                'destination_warehouse'
            ).prefetch_related(
                'stops__client',
                'stops__order'
            ).get(id=route_id)

            # Get all stops in order
            stops = route.stops.all().order_by('sequence_number')

            # Build stop summaries
            stop_summaries = []
            for stop in stops:
                coords = stop.get_coordinates()
                stop_summaries.append({
                    'id': stop.id,
                    'sequence': stop.sequence_number,
                    'client_name': stop.client.name,
                    'client_phone': getattr(stop.client, 'phone_number', None),
                    'address': getattr(stop.client, 'full_address', f"{stop.client.city}, {stop.client.country}"),
                    'latitude': coords[0] if coords else None,
                    'longitude': coords[1] if coords else None,
                    'quantity_to_deliver': float(stop.quantity_to_deliver) if stop.quantity_to_deliver else None,
                    'delivery_method': stop.delivery_method,
                    'estimated_arrival': stop.estimated_arrival_time.isoformat() if stop.estimated_arrival_time else None,
                    'estimated_service_time': stop.estimated_service_time,
                    'special_notes': stop.delivery_notes,
                    'has_coordinates': coords is not None
                })

            # Generate all URL types
            web_url = self.generate_route_url(route_id, 'web')
            mobile_url = self.generate_route_url(route_id, 'mobile')
            android_url = self.generate_route_url(route_id, 'android')
            ios_url = self.generate_route_url(route_id, 'ios')

            return {
                'success': True,
                'route': {
                    'id': route.id,
                    'name': route.name,
                    'date': route.date.isoformat(),
                    'status': route.status,
                    'route_type': route.route_type,
                    'total_distance_km': float(route.total_distance) if route.total_distance else None,
                    'estimated_duration_minutes': route.estimated_duration,
                    'total_capacity_tonnes': float(route.total_capacity_used),
                    'total_stops': stops.count()
                },
                'origin_warehouse': {
                    'name': route.origin_warehouse.name,
                    'address': route.origin_warehouse.full_address,
                    'latitude': float(route.origin_warehouse.latitude) if route.origin_warehouse.latitude else None,
                    'longitude': float(route.origin_warehouse.longitude) if route.origin_warehouse.longitude else None,
                    'phone': route.origin_warehouse.phone_number,
                    'operating_hours': f"{route.origin_warehouse.operating_hours_start} - {route.origin_warehouse.operating_hours_end}"
                } if route.origin_warehouse else None,
                'stops': stop_summaries,
                'navigation_urls': {
                    'web': web_url.get('url') if web_url.get('success') else None,
                    'mobile': mobile_url.get('url') if mobile_url.get('success') else None,
                    'android': android_url.get('url') if android_url.get('success') else None,
                    'ios': ios_url.get('url') if ios_url.get('success') else None
                },
                'instructions': {
                    'pre_departure': [
                        'Verify all delivery paperwork is complete',
                        'Check vehicle fuel level and tire pressure',
                        'Confirm all products are loaded correctly',
                        'Review special delivery instructions for each stop'
                    ],
                    'during_route': [
                        'Follow the optimized sequence for efficiency',
                        'Update delivery status after each stop',
                        'Capture customer signatures',
                        'Report any issues immediately'
                    ],
                    'completion': [
                        'Confirm all deliveries are completed or reported',
                        'Return to warehouse',
                        'Submit final delivery report'
                    ]
                }
            }

        except Route.DoesNotExist:
            return {
                'success': False,
                'error': 'Route not found'
            }
        except Exception as e:
            self.logger.error(f"Error creating route summary: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def generate_qr_code_data(self, route_id: int, url_type: str = 'mobile') -> Dict:
        """
        Generate data for QR code that drivers can scan to open route.

        Returns URL and metadata for QR code generation.
        """
        try:
            route_data = self.generate_route_url(route_id, url_type)

            if not route_data.get('success'):
                return route_data

            return {
                'success': True,
                'qr_data': route_data.get('url'),
                'route_name': route_data.get('route_name'),
                'route_date': route_data.get('route_date'),
                'metadata': {
                    'type': 'soya_excel_route',
                    'route_id': route_id,
                    'generated_at': route_data.get('waypoints_count'),
                    'url_type': url_type
                }
            }

        except Exception as e:
            self.logger.error(f"Error generating QR code data: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
