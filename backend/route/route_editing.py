"""
Advanced Route Editing Service

Provides advanced route manipulation capabilities:
- Drag-and-drop stop reordering
- Insert stops between existing stops
- Remove stops with re-optimization
- Split routes into multiple routes
- Merge routes
- Bulk stop operations
"""

import logging
from typing import List, Dict, Optional, Tuple
from decimal import Decimal
from django.db import transaction, models
from django.utils import timezone

from .models import Route, RouteStop
from .services import GoogleMapsService

logger = logging.getLogger(__name__)


class RouteEditingService:
    """Service for advanced route editing operations"""

    def __init__(self):
        self.maps_service = None
        try:
            self.maps_service = GoogleMapsService()
        except ValueError:
            logger.warning("Google Maps API not configured - some features may be limited")

    def reorder_stops(
        self,
        route_id: int,
        stop_order: List[int],
        optimize: bool = False
    ) -> Dict:
        """
        Reorder stops in a route.

        Args:
            route_id: Route ID
            stop_order: List of stop IDs in desired order
            optimize: Whether to optimize after reordering

        Returns:
            Result dictionary with updated route
        """
        try:
            route = Route.objects.get(id=route_id)

            # Verify route is editable (completed routes cannot be edited)
            if route.status == 'completed':
                return {
                    'success': False,
                    'error': 'Cannot edit completed routes'
                }

            # Get all stops
            stops = {stop.id: stop for stop in route.stops.all()}

            # Verify all provided stop IDs belong to this route
            if not all(stop_id in stops for stop_id in stop_order):
                return {
                    'success': False,
                    'error': 'Invalid stop IDs provided'
                }

            # Verify all stops are included
            if len(stop_order) != len(stops):
                return {
                    'success': False,
                    'error': 'All stops must be included in the new order'
                }

            # Update sequence numbers
            with transaction.atomic():
                for sequence, stop_id in enumerate(stop_order, start=1):
                    stops[stop_id].sequence_number = sequence
                    stops[stop_id].save(update_fields=['sequence_number'])

                # If optimize flag is set, recalculate distances and times
                if optimize and self.maps_service:
                    self._recalculate_route_metrics(route)

            # Refresh route
            route.refresh_from_db()

            return {
                'success': True,
                'route_id': route.id,
                'stops_count': len(stop_order),
                'message': 'Stop order updated successfully',
                'optimized': optimize
            }

        except Route.DoesNotExist:
            return {'success': False, 'error': 'Route not found'}
        except Exception as e:
            logger.error(f"Error reordering stops: {str(e)}")
            return {'success': False, 'error': str(e)}

    def insert_stop(
        self,
        route_id: int,
        client_id: int,
        insert_after_stop_id: Optional[int] = None,
        insert_at_position: Optional[int] = None,
        optimize: bool = True
    ) -> Dict:
        """
        Insert a new stop into a route.

        Args:
            route_id: Route ID
            client_id: Client ID to add
            insert_after_stop_id: Insert after this stop (optional)
            insert_at_position: Insert at this position (optional)
            optimize: Whether to optimize insertion point

        Returns:
            Result dictionary with created stop
        """
        try:
            from clients.models import Client

            route = Route.objects.get(id=route_id)
            client = Client.objects.get(id=client_id)

            # Verify route is editable (completed routes cannot be edited)
            if route.status == 'completed':
                return {
                    'success': False,
                    'error': 'Cannot edit completed routes'
                }

            # Verify client has coordinates
            if not client.has_coordinates:
                return {
                    'success': False,
                    'error': 'Client does not have geocoded coordinates'
                }

            with transaction.atomic():
                # Determine insertion position
                if insert_after_stop_id:
                    # Insert after specific stop
                    after_stop = RouteStop.objects.get(id=insert_after_stop_id, route=route)
                    new_sequence = after_stop.sequence_number + 1

                    # Shift subsequent stops
                    RouteStop.objects.filter(
                        route=route,
                        sequence_number__gte=new_sequence
                    ).update(sequence_number=models.F('sequence_number') + 1)

                elif insert_at_position:
                    # Insert at specific position
                    new_sequence = insert_at_position

                    # Shift subsequent stops
                    RouteStop.objects.filter(
                        route=route,
                        sequence_number__gte=new_sequence
                    ).update(sequence_number=models.F('sequence_number') + 1)

                elif optimize and self.maps_service:
                    # Find optimal insertion point
                    new_sequence = self._find_optimal_insertion_point(route, client)

                    # Shift subsequent stops
                    RouteStop.objects.filter(
                        route=route,
                        sequence_number__gte=new_sequence
                    ).update(sequence_number=models.F('sequence_number') + 1)

                else:
                    # Add to end
                    from django.db.models import Max
                    max_sequence = route.stops.aggregate(Max('sequence_number'))['sequence_number__max'] or 0
                    new_sequence = max_sequence + 1

                # Create new stop
                new_stop = RouteStop.objects.create(
                    route=route,
                    client=client,
                    sequence_number=new_sequence,
                    location_latitude=client.latitude,
                    location_longitude=client.longitude
                )

                # Recalculate route metrics
                if self.maps_service:
                    self._recalculate_route_metrics(route)

            from .serializers import RouteStopSerializer
            serializer = RouteStopSerializer(new_stop)

            return {
                'success': True,
                'stop': serializer.data,
                'message': f'Stop added at position {new_sequence}'
            }

        except Route.DoesNotExist:
            return {'success': False, 'error': 'Route not found'}
        except Client.DoesNotExist:
            return {'success': False, 'error': 'Client not found'}
        except RouteStop.DoesNotExist:
            return {'success': False, 'error': 'Reference stop not found'}
        except Exception as e:
            logger.error(f"Error inserting stop: {str(e)}")
            return {'success': False, 'error': str(e)}

    def remove_stop(
        self,
        route_id: int,
        stop_id: int,
        reoptimize: bool = True
    ) -> Dict:
        """
        Remove a stop from a route.

        Args:
            route_id: Route ID
            stop_id: Stop ID to remove
            reoptimize: Whether to reoptimize after removal

        Returns:
            Result dictionary
        """
        try:
            route = Route.objects.get(id=route_id)

            # Verify route is editable (completed routes cannot be edited)
            if route.status == 'completed':
                return {
                    'success': False,
                    'error': 'Cannot edit completed routes'
                }

            with transaction.atomic():
                # Get stop to remove
                stop = RouteStop.objects.get(id=stop_id, route=route)
                removed_sequence = stop.sequence_number
                removed_client = stop.client.name

                # Delete stop
                stop.delete()

                # Renumber subsequent stops
                RouteStop.objects.filter(
                    route=route,
                    sequence_number__gt=removed_sequence
                ).update(sequence_number=models.F('sequence_number') - 1)

                # Recalculate route metrics
                if reoptimize and self.maps_service:
                    self._recalculate_route_metrics(route)

            return {
                'success': True,
                'route_id': route.id,
                'removed_client': removed_client,
                'remaining_stops': route.stops.count(),
                'message': f'Stop removed from position {removed_sequence}'
            }

        except Route.DoesNotExist:
            return {'success': False, 'error': 'Route not found'}
        except RouteStop.DoesNotExist:
            return {'success': False, 'error': 'Stop not found'}
        except Exception as e:
            logger.error(f"Error removing stop: {str(e)}")
            return {'success': False, 'error': str(e)}

    def split_route(
        self,
        route_id: int,
        split_after_stop_id: int,
        new_route_name: Optional[str] = None
    ) -> Dict:
        """
        Split a route into two routes at specified stop.

        Args:
            route_id: Original route ID
            split_after_stop_id: Split after this stop ID
            new_route_name: Name for new route (optional)

        Returns:
            Result dictionary with both routes
        """
        try:
            original_route = Route.objects.get(id=route_id)

            # Verify route is editable
            if original_route.status in ['active', 'completed']:
                return {
                    'success': False,
                    'error': f'Cannot split {original_route.status} routes'
                }

            split_stop = RouteStop.objects.get(id=split_after_stop_id, route=original_route)
            split_sequence = split_stop.sequence_number

            with transaction.atomic():
                # Get stops for new route (after split point)
                stops_to_move = original_route.stops.filter(
                    sequence_number__gt=split_sequence
                ).order_by('sequence_number')

                if not stops_to_move.exists():
                    return {
                        'success': False,
                        'error': 'Cannot split at last stop'
                    }

                # Create new route
                new_route_name = new_route_name or f"{original_route.name} - Part 2"
                new_route = Route.objects.create(
                    name=new_route_name,
                    date=original_route.date,
                    status='draft',
                    route_type=original_route.route_type,
                    origin_warehouse=original_route.origin_warehouse,
                    return_to_warehouse=original_route.return_to_warehouse,
                    destination_warehouse=original_route.destination_warehouse,
                    created_by=original_route.created_by
                )

                # Move stops to new route
                for idx, stop in enumerate(stops_to_move, start=1):
                    stop.route = new_route
                    stop.sequence_number = idx
                    stop.save()

                # Update original route name
                original_route.name = f"{original_route.name.replace(' - Part 2', '')} - Part 1"
                original_route.save(update_fields=['name'])

                # Recalculate metrics for both routes
                if self.maps_service:
                    self._recalculate_route_metrics(original_route)
                    self._recalculate_route_metrics(new_route)

            from .serializers import RouteSerializer
            original_serializer = RouteSerializer(original_route)
            new_serializer = RouteSerializer(new_route)

            return {
                'success': True,
                'original_route': original_serializer.data,
                'new_route': new_serializer.data,
                'message': f'Route split into 2 routes at position {split_sequence}'
            }

        except Route.DoesNotExist:
            return {'success': False, 'error': 'Route not found'}
        except RouteStop.DoesNotExist:
            return {'success': False, 'error': 'Split stop not found'}
        except Exception as e:
            logger.error(f"Error splitting route: {str(e)}")
            return {'success': False, 'error': str(e)}

    def merge_routes(
        self,
        primary_route_id: int,
        secondary_route_id: int,
        reoptimize: bool = True
    ) -> Dict:
        """
        Merge two routes into one.

        Args:
            primary_route_id: Route to keep (will contain all stops)
            secondary_route_id: Route to merge into primary (will be deleted)
            reoptimize: Whether to optimize merged route

        Returns:
            Result dictionary with merged route
        """
        try:
            primary_route = Route.objects.get(id=primary_route_id)
            secondary_route = Route.objects.get(id=secondary_route_id)

            # Verify both routes are editable
            if primary_route.status in ['active', 'completed']:
                return {
                    'success': False,
                    'error': f'Cannot merge {primary_route.status} routes'
                }

            if secondary_route.status in ['active', 'completed']:
                return {
                    'success': False,
                    'error': f'Cannot merge {secondary_route.status} routes'
                }

            with transaction.atomic():
                # Get max sequence from primary route
                from django.db.models import Max
                max_sequence = primary_route.stops.aggregate(
                    Max('sequence_number')
                )['sequence_number__max'] or 0

                # Move all stops from secondary to primary
                secondary_stops = secondary_route.stops.all().order_by('sequence_number')
                for stop in secondary_stops:
                    stop.route = primary_route
                    stop.sequence_number = max_sequence + stop.sequence_number
                    stop.save()

                # Update primary route name
                primary_route.name = f"{primary_route.name} + {secondary_route.name}"
                primary_route.save(update_fields=['name'])

                # Delete secondary route
                secondary_route_name = secondary_route.name
                secondary_route.delete()

                # Reoptimize merged route
                if reoptimize and self.maps_service:
                    optimization_result = self.maps_service.optimize_route(
                        primary_route.id,
                        optimization_type='balanced'
                    )

                    if not optimization_result.get('success'):
                        logger.warning(f"Optimization failed after merge: {optimization_result.get('error')}")

            # Refresh route
            primary_route.refresh_from_db()

            from .serializers import RouteSerializer
            serializer = RouteSerializer(primary_route)

            return {
                'success': True,
                'merged_route': serializer.data,
                'total_stops': primary_route.stops.count(),
                'message': f'Routes merged successfully. Deleted "{secondary_route_name}"'
            }

        except Route.DoesNotExist:
            return {'success': False, 'error': 'One or both routes not found'}
        except Exception as e:
            logger.error(f"Error merging routes: {str(e)}")
            return {'success': False, 'error': str(e)}

    def bulk_remove_stops(
        self,
        route_id: int,
        stop_ids: List[int],
        reoptimize: bool = True
    ) -> Dict:
        """
        Remove multiple stops from a route.

        Args:
            route_id: Route ID
            stop_ids: List of stop IDs to remove
            reoptimize: Whether to reoptimize after removal

        Returns:
            Result dictionary
        """
        try:
            route = Route.objects.get(id=route_id)

            # Verify route is editable (completed routes cannot be edited)
            if route.status == 'completed':
                return {
                    'success': False,
                    'error': 'Cannot edit completed routes'
                }

            with transaction.atomic():
                # Delete stops
                deleted_count, _ = RouteStop.objects.filter(
                    route=route,
                    id__in=stop_ids
                ).delete()

                # Renumber all remaining stops
                remaining_stops = route.stops.all().order_by('sequence_number')
                for idx, stop in enumerate(remaining_stops, start=1):
                    if stop.sequence_number != idx:
                        stop.sequence_number = idx
                        stop.save(update_fields=['sequence_number'])

                # Recalculate route metrics
                if reoptimize and self.maps_service:
                    self._recalculate_route_metrics(route)

            return {
                'success': True,
                'route_id': route.id,
                'removed_count': deleted_count,
                'remaining_stops': route.stops.count(),
                'message': f'Removed {deleted_count} stops from route'
            }

        except Route.DoesNotExist:
            return {'success': False, 'error': 'Route not found'}
        except Exception as e:
            logger.error(f"Error removing stops: {str(e)}")
            return {'success': False, 'error': str(e)}

    # Helper methods

    def _find_optimal_insertion_point(self, route: Route, client) -> int:
        """
        Find optimal position to insert a new stop.

        Returns sequence number for insertion.
        """
        try:
            stops = list(route.stops.all().order_by('sequence_number'))

            if not stops:
                return 1

            if not client.has_coordinates:
                return len(stops) + 1

            from geopy.distance import geodesic
            client_coords = (float(client.latitude), float(client.longitude))

            # Calculate distance to each stop
            min_distance = float('inf')
            best_position = len(stops) + 1

            for idx, stop in enumerate(stops):
                stop_coords = stop.get_coordinates()
                if not stop_coords:
                    continue

                distance = geodesic(client_coords, stop_coords).kilometers

                if distance < min_distance:
                    min_distance = distance
                    best_position = idx + 1

            return best_position

        except Exception as e:
            logger.error(f"Error finding optimal insertion point: {str(e)}")
            return len(stops) + 1 if stops else 1

    def _recalculate_route_metrics(self, route: Route) -> None:
        """Recalculate total distance and duration for route"""
        try:
            stops = list(route.stops.all().order_by('sequence_number'))

            if len(stops) < 2:
                return

            # Build waypoints
            waypoints = []
            for stop in stops:
                coords = stop.get_coordinates()
                if coords:
                    waypoints.append(f"{coords[0]},{coords[1]}")

            if len(waypoints) < 2:
                return

            # Get directions from Google Maps
            origin = waypoints[0]
            destination = waypoints[-1]
            intermediate = waypoints[1:-1] if len(waypoints) > 2 else None

            directions = self.maps_service.get_directions(
                origin=origin,
                destination=destination,
                waypoints=intermediate,
                optimize_waypoints=False  # Keep current order
            )

            if directions and 'legs' in directions:
                # Calculate total distance and duration
                total_distance = sum(
                    leg.get('distance', {}).get('value', 0)
                    for leg in directions['legs']
                ) / 1000.0  # Convert to km

                total_duration = sum(
                    leg.get('duration', {}).get('value', 0)
                    for leg in directions['legs']
                ) / 60.0  # Convert to minutes

                # Update route
                route.total_distance = Decimal(str(total_distance))
                route.estimated_duration = int(total_duration)
                route.save(update_fields=['total_distance', 'estimated_duration'])

                # Update individual stop distances
                for idx, leg in enumerate(directions['legs']):
                    if idx + 1 < len(stops):
                        stop = stops[idx + 1]
                        stop.distance_from_previous = Decimal(
                            str(leg.get('distance', {}).get('value', 0) / 1000.0)
                        )
                        stop.duration_from_previous = int(
                            leg.get('duration', {}).get('value', 0) / 60.0
                        )
                        stop.save(update_fields=[
                            'distance_from_previous',
                            'duration_from_previous'
                        ])

        except Exception as e:
            logger.error(f"Error recalculating route metrics: {str(e)}")
