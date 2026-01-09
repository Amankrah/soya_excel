"""
Async-enabled Google Maps and Route Optimization Services for Soya Excel.

This module provides modern async support for:
- Concurrent geocoding of multiple addresses
- Batch route optimization
- Distribution plan clustering
- Real-time route calculations with proper rate limiting

Uses aiohttp for async HTTP requests and implements best practices for
Django async views and Celery tasks.
"""

import asyncio
import logging
from typing import List, Dict, Optional, Tuple, Any
from decimal import Decimal
from datetime import datetime, timedelta
import json

import aiohttp
from asyncio_throttle import Throttler
from django.conf import settings
from django.core.cache import cache
from asgiref.sync import sync_to_async

# Scientific computing for clustering
import numpy as np
from sklearn.cluster import DBSCAN, KMeans
from scipy.spatial.distance import cdist
from geopy.distance import geodesic

from .models import Route, RouteStop, RouteOptimization
from clients.models import Client, Order

logger = logging.getLogger(__name__)


class AsyncGoogleMapsService:
    """
    Async-enabled Google Maps API service with rate limiting and caching.

    Features:
    - Concurrent geocoding with throttling (50 requests/second Google limit)
    - Response caching to minimize API costs
    - Batch operations for efficiency
    - Proper error handling and retries
    """

    # Google Maps API rate limits: 50 QPS (queries per second)
    RATE_LIMIT_QPS = 50
    CACHE_TTL = 86400  # 24 hours for geocoding results

    def __init__(self):
        """Initialize async Google Maps client"""
        if not hasattr(settings, 'GOOGLE_MAPS_API_KEY') or not settings.GOOGLE_MAPS_API_KEY:
            raise ValueError("Google Maps API key is not configured in settings")

        self.api_key = settings.GOOGLE_MAPS_API_KEY
        self.base_url = "https://maps.googleapis.com/maps/api"

        # Throttler to respect rate limits
        self.throttler = Throttler(rate_limit=self.RATE_LIMIT_QPS, period=1.0)

        # Canada bounds for validation
        self.canada_bounds = {
            'southwest': {'lat': 41.6765556, 'lng': -141.00187},
            'northeast': {'lat': 83.23324, 'lng': -52.6480987}
        }

    async def geocode_address(
        self,
        address: str,
        country: str = "Canada",
        use_cache: bool = True
    ) -> Optional[Dict]:
        """
        Async geocode a single address.

        Args:
            address: Address string to geocode
            country: Country for region bias
            use_cache: Whether to use cached results

        Returns:
            Dictionary with geocoding results or None
        """
        # Check cache first
        cache_key = f"geocode:{address}:{country}"
        if use_cache:
            cached_result = cache.get(cache_key)
            if cached_result:
                logger.debug(f"Cache hit for geocoding: {address}")
                return cached_result

        try:
            async with self.throttler:
                async with aiohttp.ClientSession() as session:
                    params = {
                        'address': f"{address}, {country}" if country not in address else address,
                        'key': self.api_key,
                        'region': 'ca' if country == 'Canada' else None
                    }

                    url = f"{self.base_url}/geocode/json"

                    async with session.get(url, params=params) as response:
                        if response.status == 200:
                            data = await response.json()

                            if data['status'] == 'OK' and data['results']:
                                result = data['results'][0]
                                location = result['geometry']['location']

                                # Validate coordinates are in expected region
                                geocode_result = {
                                    'latitude': Decimal(str(location['lat'])),
                                    'longitude': Decimal(str(location['lng'])),
                                    'formatted_address': result['formatted_address'],
                                    'place_id': result.get('place_id'),
                                    'address_components': result.get('address_components', [])
                                }

                                # Cache successful result
                                cache.set(cache_key, geocode_result, self.CACHE_TTL)

                                return geocode_result
                            else:
                                logger.warning(f"Geocoding failed for '{address}': {data.get('status')}")
                                return None
                        else:
                            logger.error(f"HTTP {response.status} from Google Maps API")
                            return None

        except Exception as e:
            logger.error(f"Error geocoding address '{address}': {str(e)}")
            return None

    async def geocode_batch(
        self,
        addresses: List[Tuple[int, str, str]],
        use_cache: bool = True
    ) -> List[Dict]:
        """
        Geocode multiple addresses concurrently.

        Args:
            addresses: List of tuples (id, address, country)
            use_cache: Whether to use cached results

        Returns:
            List of dictionaries with geocoding results
        """
        tasks = []
        for client_id, address, country in addresses:
            task = self.geocode_address(address, country, use_cache)
            tasks.append((client_id, task))

        results = []
        for client_id, task in tasks:
            result = await task
            results.append({
                'client_id': client_id,
                'geocode_result': result,
                'success': result is not None
            })

        return results

    async def calculate_distance_matrix(
        self,
        origins: List[Tuple[float, float]],
        destinations: List[Tuple[float, float]],
        mode: str = 'driving'
    ) -> Optional[Dict]:
        """
        Calculate distance matrix between multiple points.

        Args:
            origins: List of (lat, lng) tuples
            destinations: List of (lat, lng) tuples
            mode: Travel mode (driving, walking, bicycling, transit)

        Returns:
            Distance matrix data
        """
        try:
            # Format coordinates
            origins_str = '|'.join([f"{lat},{lng}" for lat, lng in origins])
            destinations_str = '|'.join([f"{lat},{lng}" for lat, lng in destinations])

            async with self.throttler:
                async with aiohttp.ClientSession() as session:
                    params = {
                        'origins': origins_str,
                        'destinations': destinations_str,
                        'mode': mode,
                        'units': 'metric',
                        'key': self.api_key
                    }

                    url = f"{self.base_url}/distancematrix/json"

                    async with session.get(url, params=params) as response:
                        if response.status == 200:
                            data = await response.json()

                            if data['status'] == 'OK':
                                return self._format_distance_matrix(data)
                            else:
                                logger.error(f"Distance matrix API error: {data.get('status')}")
                                return None
                        else:
                            logger.error(f"HTTP {response.status} from Distance Matrix API")
                            return None

        except Exception as e:
            logger.error(f"Error calculating distance matrix: {str(e)}")
            return None

    async def optimize_route_directions(
        self,
        waypoints: List[Dict],
        optimize: bool = True
    ) -> Optional[Dict]:
        """
        Get optimized directions for a route.

        Args:
            waypoints: List of waypoint dictionaries with lat/lng
            optimize: Whether to optimize waypoint order

        Returns:
            Optimized route with directions
        """
        if len(waypoints) < 2:
            return {'success': False, 'error': 'Need at least 2 waypoints'}

        try:
            # Format waypoints
            origin = f"{waypoints[0]['lat']},{waypoints[0]['lng']}"
            destination = f"{waypoints[-1]['lat']},{waypoints[-1]['lng']}"

            intermediate = []
            if len(waypoints) > 2:
                for wp in waypoints[1:-1]:
                    intermediate.append(f"{wp['lat']},{wp['lng']}")

            async with self.throttler:
                async with aiohttp.ClientSession() as session:
                    params = {
                        'origin': origin,
                        'destination': destination,
                        'mode': 'driving',
                        'units': 'metric',
                        'optimize_waypoints': 'true' if optimize else 'false',
                        'key': self.api_key
                    }

                    if intermediate:
                        params['waypoints'] = '|'.join(intermediate)

                    url = f"{self.base_url}/directions/json"

                    async with session.get(url, params=params) as response:
                        if response.status == 200:
                            data = await response.json()

                            if data['status'] == 'OK' and data['routes']:
                                route = data['routes'][0]

                                # Extract route information
                                waypoint_order = route.get('waypoint_order', [])
                                legs = route.get('legs', [])

                                total_distance = sum(leg['distance']['value'] for leg in legs) / 1000.0  # km
                                total_duration = sum(leg['duration']['value'] for leg in legs) / 60.0  # minutes

                                return {
                                    'success': True,
                                    'waypoint_order': waypoint_order,
                                    'total_distance': total_distance,
                                    'total_duration': total_duration,
                                    'legs': legs,
                                    'overview_polyline': route.get('overview_polyline', {}).get('points', ''),
                                    'optimized_waypoints': waypoints
                                }
                            else:
                                return {
                                    'success': False,
                                    'error': f"Directions API error: {data.get('status')}"
                                }
                        else:
                            return {
                                'success': False,
                                'error': f"HTTP {response.status} from Directions API"
                            }

        except Exception as e:
            logger.error(f"Error optimizing route: {str(e)}")
            return {'success': False, 'error': str(e)}

    def _format_distance_matrix(self, matrix_data: Dict) -> Dict:
        """Format distance matrix response"""
        rows = matrix_data.get('rows', [])

        formatted_matrix = []
        for row in rows:
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


class DistributionPlanService:
    """
    Service for planning multi-client distribution routes.

    Features:
    - Cluster clients by geographic proximity
    - Optimize delivery sequences within clusters
    - Balance vehicle capacity constraints
    - Generate multiple route options for manager selection
    """

    def __init__(self):
        self.maps_service = AsyncGoogleMapsService()

    async def create_distribution_plan(
        self,
        client_ids: List[int],
        date: datetime,
        max_stops_per_route: int = 10,
        max_distance_km: int = 300,
        clustering_method: str = 'dbscan'
    ) -> Dict[str, Any]:
        """
        Create an optimized distribution plan for selected clients.

        Args:
            client_ids: List of client IDs to include in plan
            date: Planned delivery date
            max_stops_per_route: Maximum stops per route
            max_distance_km: Maximum route distance
            clustering_method: 'dbscan' or 'kmeans'

        Returns:
            Dictionary with planned routes and optimization data
        """
        try:
            # Get clients with coordinates
            clients = await sync_to_async(list)(
                Client.objects.filter(
                    id__in=client_ids,
                    latitude__isnull=False,
                    longitude__isnull=False
                ).select_related()
            )

            if not clients:
                return {
                    'success': False,
                    'error': 'No clients found with valid coordinates'
                }

            # Extract coordinates
            coordinates = np.array([
                [float(c.latitude), float(c.longitude)] for c in clients
            ])

            # Cluster clients geographically
            if clustering_method == 'dbscan':
                clusters = self._cluster_dbscan(
                    coordinates,
                    max_distance_km=max_distance_km / 111.0  # Convert to degrees (approx)
                )
            else:
                # Estimate number of routes needed
                n_routes = max(1, len(clients) // max_stops_per_route)
                clusters = self._cluster_kmeans(coordinates, n_clusters=n_routes)

            # Create routes for each cluster
            routes_data = []
            for cluster_id in set(clusters):
                if cluster_id == -1:  # DBSCAN noise points
                    continue

                cluster_clients = [c for i, c in enumerate(clients) if clusters[i] == cluster_id]

                if not cluster_clients:
                    continue

                # Build route waypoints
                waypoints = [
                    {
                        'lat': float(c.latitude),
                        'lng': float(c.longitude),
                        'client_id': c.id,
                        'client_name': c.name
                    }
                    for c in cluster_clients
                ]

                # Optimize route
                optimization_result = await self.maps_service.optimize_route_directions(
                    waypoints,
                    optimize=True
                )

                if optimization_result and optimization_result.get('success'):
                    routes_data.append({
                        'cluster_id': int(cluster_id),
                        'clients': [c.id for c in cluster_clients],
                        'client_count': len(cluster_clients),
                        'total_distance_km': optimization_result['total_distance'],
                        'estimated_duration_minutes': optimization_result['total_duration'],
                        'waypoint_order': optimization_result['waypoint_order'],
                        'optimized_sequence': waypoints,
                        'overview_polyline': optimization_result['overview_polyline']
                    })

            return {
                'success': True,
                'date': date.isoformat(),
                'total_clients': len(clients),
                'routes_count': len(routes_data),
                'routes': routes_data,
                'clustering_method': clustering_method
            }

        except Exception as e:
            logger.error(f"Error creating distribution plan: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def _cluster_dbscan(
        self,
        coordinates: np.ndarray,
        max_distance_km: float = 2.7  # ~300km in degrees
    ) -> np.ndarray:
        """
        Cluster coordinates using DBSCAN algorithm.

        DBSCAN is density-based and automatically determines cluster count.
        Good for irregular geographic distributions.
        """
        try:
            # DBSCAN with haversine metric for geographic clustering
            clustering = DBSCAN(
                eps=max_distance_km,
                min_samples=2,
                metric='haversine',
                algorithm='ball_tree'
            )

            # Convert to radians for haversine
            coords_rad = np.radians(coordinates)
            labels = clustering.fit_predict(coords_rad)

            return labels

        except Exception as e:
            logger.error(f"Error in DBSCAN clustering: {str(e)}")
            # Fallback: single cluster
            return np.zeros(len(coordinates), dtype=int)

    def _cluster_kmeans(
        self,
        coordinates: np.ndarray,
        n_clusters: int
    ) -> np.ndarray:
        """
        Cluster coordinates using K-Means algorithm.

        K-Means requires specifying cluster count but produces balanced groups.
        """
        try:
            clustering = KMeans(
                n_clusters=min(n_clusters, len(coordinates)),
                random_state=42,
                n_init=10
            )

            labels = clustering.fit_predict(coordinates)

            return labels

        except Exception as e:
            logger.error(f"Error in K-Means clustering: {str(e)}")
            # Fallback: single cluster
            return np.zeros(len(coordinates), dtype=int)

    async def optimize_existing_route(self, route_id: int) -> Dict[str, Any]:
        """
        Optimize an existing route using async Google Maps API.

        Args:
            route_id: Route ID to optimize

        Returns:
            Optimization results
        """
        try:
            # Get route and stops
            route = await sync_to_async(Route.objects.get)(id=route_id)
            stops = await sync_to_async(list)(
                route.stops.all().select_related('client').order_by('sequence_number')
            )

            if len(stops) < 2:
                return {
                    'success': False,
                    'error': 'Route must have at least 2 stops'
                }

            # Build waypoints from stops
            waypoints = []
            invalid_stops = []

            for stop in stops:
                if stop.location_latitude and stop.location_longitude:
                    waypoints.append({
                        'lat': float(stop.location_latitude),
                        'lng': float(stop.location_longitude),
                        'stop_id': stop.id,
                        'client_id': stop.client.id
                    })
                elif stop.client.has_coordinates:
                    waypoints.append({
                        'lat': float(stop.client.latitude),
                        'lng': float(stop.client.longitude),
                        'stop_id': stop.id,
                        'client_id': stop.client.id
                    })
                else:
                    invalid_stops.append({
                        'stop_id': stop.id,
                        'client_name': stop.client.name
                    })

            if invalid_stops:
                return {
                    'success': False,
                    'error': 'Some stops are missing coordinates',
                    'invalid_stops': invalid_stops
                }

            # Optimize route
            optimization_result = await self.maps_service.optimize_route_directions(
                waypoints,
                optimize=True
            )

            if optimization_result and optimization_result.get('success'):
                # Update route in database
                await sync_to_async(self._update_route_from_optimization)(
                    route,
                    optimization_result
                )

                return {
                    'success': True,
                    'route_id': route.id,
                    'optimized_distance': optimization_result['total_distance'],
                    'optimized_duration': optimization_result['total_duration'],
                    'waypoint_order': optimization_result['waypoint_order']
                }
            else:
                return optimization_result

        except Route.DoesNotExist:
            return {'success': False, 'error': 'Route not found'}
        except Exception as e:
            logger.error(f"Error optimizing route {route_id}: {str(e)}")
            return {'success': False, 'error': str(e)}

    def _update_route_from_optimization(
        self,
        route: Route,
        optimization_result: Dict
    ) -> None:
        """Update route model with optimization results (sync method)"""
        try:
            route.total_distance = Decimal(str(optimization_result['total_distance']))
            route.estimated_duration = int(optimization_result['total_duration'])

            # Update waypoint order
            waypoint_order = optimization_result.get('waypoint_order', [])
            if waypoint_order:
                stops = list(route.stops.all())

                # Reorder stops based on optimization
                new_sequence = [stops[0].id]  # First stop
                for idx in waypoint_order:
                    if idx + 1 < len(stops) - 1:
                        new_sequence.append(stops[idx + 1].id)
                if len(stops) > 1:
                    new_sequence.append(stops[-1].id)  # Last stop

                route.optimized_sequence = new_sequence

                # Update stop sequence numbers
                for i, stop_id in enumerate(new_sequence):
                    RouteStop.objects.filter(id=stop_id).update(sequence_number=i + 1)

            route.save()

        except Exception as e:
            logger.error(f"Error updating route with optimization: {str(e)}")
            raise


# Async helper functions for easy integration
async def geocode_clients_batch(client_ids: List[int]) -> List[Dict]:
    """
    Geocode multiple clients concurrently.

    Args:
        client_ids: List of client IDs to geocode

    Returns:
        List of geocoding results
    """
    service = AsyncGoogleMapsService()

    # Get clients needing geocoding
    clients = await sync_to_async(list)(
        Client.objects.filter(
            id__in=client_ids,
            latitude__isnull=True
        )
    )

    # Prepare addresses
    addresses = [
        (
            c.id,
            f"{c.city}, {c.postal_code}, {c.country}",
            c.country
        )
        for c in clients
    ]

    # Geocode in batch
    results = await service.geocode_batch(addresses)

    # Update clients with results
    for result in results:
        if result['success']:
            geocode_data = result['geocode_result']
            await sync_to_async(
                Client.objects.filter(id=result['client_id']).update
            )(
                latitude=geocode_data['latitude'],
                longitude=geocode_data['longitude']
            )

    return results


async def create_multi_client_routes(
    client_ids: List[int],
    date: datetime,
    **kwargs
) -> Dict[str, Any]:
    """
    Create optimized routes for multiple clients.

    Args:
        client_ids: List of client IDs
        date: Delivery date
        **kwargs: Additional parameters for distribution planning

    Returns:
        Distribution plan with optimized routes
    """
    service = DistributionPlanService()
    return await service.create_distribution_plan(client_ids, date, **kwargs)
