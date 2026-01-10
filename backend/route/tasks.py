"""
Celery tasks for route optimization and geocoding.

These tasks run asynchronously in the background to avoid blocking
web requests during expensive operations like:
- Batch geocoding of client addresses
- Multi-route optimization
- Weekly route planning
"""

import logging
from typing import List, Dict, Any
from decimal import Decimal
from datetime import datetime

from celery import shared_task
from django.utils import timezone
from asgiref.sync import async_to_sync

from .models import Route, RouteStop, RouteOptimization
from .services_async import (
    AsyncGoogleMapsService,
    DistributionPlanService,
    geocode_clients_batch
)
from clients.models import Client

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    name='route.geocode_client_addresses'
)
def geocode_client_addresses_task(self, client_ids: List[int]) -> Dict[str, Any]:
    """
    Geocode multiple client addresses in the background.

    Args:
        client_ids: List of client IDs to geocode

    Returns:
        Dictionary with geocoding results
    """
    try:
        logger.info(f"Starting geocoding task for {len(client_ids)} clients")

        # Run async geocoding
        results = async_to_sync(geocode_clients_batch)(client_ids)

        successful = sum(1 for r in results if r['success'])
        failed = len(results) - successful

        logger.info(f"Geocoding completed: {successful} successful, {failed} failed")

        return {
            'success': True,
            'total_clients': len(client_ids),
            'successful': successful,
            'failed': failed,
            'results': results
        }

    except Exception as e:
        logger.error(f"Error in geocoding task: {str(e)}")
        raise self.retry(exc=e)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    name='route.optimize_route'
)
def optimize_route_task(
    self,
    route_id: int,
    optimization_type: str = 'balanced',
    user_id: int = None
) -> Dict[str, Any]:
    """
    Optimize a single route in the background.

    Args:
        route_id: Route ID to optimize
        optimization_type: Type of optimization
        user_id: User who requested optimization

    Returns:
        Optimization results
    """
    try:
        logger.info(f"Starting route optimization for route {route_id}")

        service = DistributionPlanService()
        result = async_to_sync(service.optimize_existing_route)(route_id)

        if result['success']:
            # Create optimization record
            route = Route.objects.get(id=route_id)

            RouteOptimization.objects.create(
                route=route,
                optimization_type=optimization_type,
                request_data={
                    'route_id': route_id,
                    'optimization_type': optimization_type,
                    'task_id': self.request.id
                },
                response_data=result,
                optimized_distance=Decimal(str(result.get('optimized_distance', 0))),
                optimized_duration=int(result.get('optimized_duration', 0)),
                success=True,
                google_maps_used=True,
                created_by_id=user_id
            )

            logger.info(f"Route {route_id} optimized successfully")

        return result

    except Route.DoesNotExist:
        logger.error(f"Route {route_id} not found")
        return {'success': False, 'error': 'Route not found'}
    except Exception as e:
        logger.error(f"Error optimizing route {route_id}: {str(e)}")
        raise self.retry(exc=e)


@shared_task(
    bind=True,
    max_retries=2,
    default_retry_delay=120,
    name='route.create_distribution_plan'
)
def create_distribution_plan_task(
    self,
    client_ids: List[int],
    date_str: str,
    max_stops_per_route: int = 10,
    max_distance_km: int = 300,
    clustering_method: str = 'dbscan',
    user_id: int = None
) -> Dict[str, Any]:
    """
    Create a distribution plan for multiple clients in the background.

    Args:
        client_ids: List of client IDs to include
        date_str: Delivery date as ISO string
        max_stops_per_route: Maximum stops per route
        max_distance_km: Maximum route distance
        clustering_method: Clustering algorithm to use
        user_id: User who requested the plan

    Returns:
        Distribution plan with routes
    """
    try:
        logger.info(f"Creating distribution plan for {len(client_ids)} clients")

        date = datetime.fromisoformat(date_str)

        service = DistributionPlanService()
        result = async_to_sync(service.create_distribution_plan)(
            client_ids=client_ids,
            date=date,
            max_stops_per_route=max_stops_per_route,
            max_distance_km=max_distance_km,
            clustering_method=clustering_method
        )

        if result['success']:
            # Create Route objects from plan
            routes_created = []

            for route_data in result['routes']:
                # Create route
                route = Route.objects.create(
                    name=f"Distribution Route {route_data['cluster_id']} - {date.strftime('%Y-%m-%d')}",
                    date=date,
                    route_type='mixed',
                    status='draft',
                    total_distance=Decimal(str(route_data['total_distance_km'])),
                    estimated_duration=int(route_data['estimated_duration_minutes']),
                    optimized_sequence=route_data.get('optimized_sequence', []),
                    waypoints=route_data.get('optimized_sequence', []),
                    created_by_id=user_id
                )

                # Create stops for each client in optimized order
                # route_data['clients'] is already in Google Maps optimized order
                # (reordering now happens in DistributionPlanService.create_distribution_plan)
                client_ids_ordered = route_data['clients']

                for seq, client_id in enumerate(client_ids_ordered, start=1):
                    client = Client.objects.get(id=client_id)

                    # Get pending orders for this client
                    pending_orders = client.orders.filter(
                        status='pending'
                    ).order_by('-sales_order_creation_date')

                    if pending_orders.exists():
                        order = pending_orders.first()

                        RouteStop.objects.create(
                            route=route,
                            client=client,
                            order=order,
                            sequence_number=seq,
                            location_latitude=client.latitude,
                            location_longitude=client.longitude,
                            quantity_to_deliver=order.total_amount_ordered_tm
                        )

                routes_created.append({
                    'id': route.id,
                    'name': route.name,
                    'stops_count': route.stops.count()
                })

            logger.info(f"Created {len(routes_created)} routes from distribution plan")

            result['routes_created'] = routes_created

        return result

    except Exception as e:
        logger.error(f"Error creating distribution plan: {str(e)}")
        raise self.retry(exc=e)


@shared_task(
    bind=True,
    max_retries=2,
    name='route.optimize_weekly_routes'
)
def optimize_weekly_routes_task(
    self,
    week_start_str: str,
    user_id: int = None
) -> Dict[str, Any]:
    """
    Optimize all routes for a given week.

    Args:
        week_start_str: Week start date as ISO string
        user_id: User who requested optimization

    Returns:
        Weekly optimization results
    """
    try:
        from datetime import timedelta

        week_start = datetime.fromisoformat(week_start_str).date()
        week_end = week_start + timedelta(days=6)

        logger.info(f"Optimizing routes for week {week_start} to {week_end}")

        # Get routes for the week
        routes = Route.objects.filter(
            date__range=[week_start, week_end],
            status__in=['draft', 'planned']
        )

        results = []

        for route in routes:
            # Optimize each route
            result = async_to_sync(DistributionPlanService().optimize_existing_route)(route.id)

            results.append({
                'route_id': route.id,
                'route_name': route.name,
                'date': route.date.isoformat(),
                'optimization_result': result
            })

            if result['success']:
                # Create optimization record
                RouteOptimization.objects.create(
                    route=route,
                    optimization_type='balanced',
                    request_data={
                        'route_id': route.id,
                        'week_optimization': True,
                        'task_id': self.request.id
                    },
                    response_data=result,
                    optimized_distance=Decimal(str(result.get('optimized_distance', 0))),
                    optimized_duration=int(result.get('optimized_duration', 0)),
                    success=True,
                    google_maps_used=True,
                    created_by_id=user_id
                )

        successful = sum(1 for r in results if r['optimization_result'].get('success'))
        failed = len(results) - successful

        logger.info(f"Weekly optimization completed: {successful} routes optimized, {failed} failed")

        return {
            'success': True,
            'week_start': week_start_str,
            'total_routes': len(results),
            'successful': successful,
            'failed': failed,
            'results': results
        }

    except Exception as e:
        logger.error(f"Error in weekly route optimization: {str(e)}")
        raise self.retry(exc=e)


@shared_task(
    bind=True,
    name='route.update_missing_coordinates'
)
def update_missing_coordinates_task(self, limit: int = 100) -> Dict[str, Any]:
    """
    Background task to geocode clients with missing coordinates.

    Args:
        limit: Maximum number of clients to process

    Returns:
        Update results
    """
    try:
        # Get clients without coordinates
        clients = Client.objects.filter(
            is_active=True,
            latitude__isnull=True
        )[:limit]

        client_ids = list(clients.values_list('id', flat=True))

        if not client_ids:
            return {
                'success': True,
                'message': 'No clients need geocoding'
            }

        logger.info(f"Updating coordinates for {len(client_ids)} clients")

        # Geocode them
        result = async_to_sync(geocode_clients_batch)(client_ids)

        return {
            'success': True,
            'clients_processed': len(client_ids),
            'results': result
        }

    except Exception as e:
        logger.error(f"Error updating coordinates: {str(e)}")
        raise self.retry(exc=e)
