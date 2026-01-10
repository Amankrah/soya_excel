"""
Consolidated Route Management API - Single Source of Truth

This module provides a unified, streamlined API for all route operations:
- Route CRUD operations with validation
- Route optimization (Google Maps integration)
- Multi-client distribution planning
- Real-time GPS tracking
- Advanced route editing
- Performance analytics
- Driver mobile app endpoints

All redundant code has been removed. This is the only route management system.
"""

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Count, F, Max, Sum, Avg
from django.db import transaction
from django.utils import timezone
from asgiref.sync import async_to_sync

from .models import Route, RouteStop, RouteOptimization, Warehouse
from .serializers import (
    RouteSerializer, RouteStopSerializer, RouteCreateSerializer,
    RouteOptimizationSerializer, DistributionPlanSerializer, BatchGeocodeSerializer
)
from .services import GoogleMapsService, RouteOptimizationService
from .realtime_tracking import RealTimeTrackingService
from .route_editing import RouteEditingService
from clients.models import Order, Client

logger = logging.getLogger(__name__)


# ============================================================================
# MAIN ROUTE VIEWSET - Core route management
# ============================================================================

class RouteViewSet(viewsets.ModelViewSet):
    """
    Unified Route Management ViewSet

    Provides all route operations in one place:
    - CRUD operations
    - Route optimization
    - Distribution planning
    - Live tracking
    - Advanced editing
    """

    queryset = Route.objects.all()
    serializer_class = RouteSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status', 'date', 'route_type']
    search_fields = ['name']
    ordering_fields = ['date', 'created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return RouteCreateSerializer
        return RouteSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        """Update route - only blocked for completed routes"""
        route = self.get_object()
        if route.status == 'completed':
            return Response(
                {'error': 'Cannot edit completed routes'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        """Partially update route - only blocked for completed routes"""
        route = self.get_object()
        if route.status == 'completed':
            return Response(
                {'error': 'Cannot edit completed routes'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Delete route - cannot delete active or completed routes"""
        route = self.get_object()
        if route.status in ['active', 'completed']:
            return Response(
                {'error': f'Cannot delete {route.status} routes. Please complete or cancel first.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)

    # ========================================================================
    # ROUTE STATUS MANAGEMENT
    # ========================================================================

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Activate a route for delivery"""
        route = self.get_object()
        if route.status not in ['draft', 'planned']:
            return Response(
                {'error': 'Only draft or planned routes can be activated'},
                status=status.HTTP_400_BAD_REQUEST
            )
        route.status = 'active'
        route.save()
        return Response(self.get_serializer(route).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark route as completed"""
        route = self.get_object()
        if route.status != 'active':
            return Response(
                {'error': 'Only active routes can be completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        route.status = 'completed'
        route.save()
        route.stops.update(is_completed=True)
        return Response(self.get_serializer(route).data)

    @action(detail=False, methods=['get'])
    def today(self, request):
        """Get today's routes"""
        today = timezone.now().date()
        routes = self.get_queryset().filter(date=today)
        return Response(self.get_serializer(routes, many=True).data)

    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get all active routes"""
        routes = self.get_queryset().filter(status='active')
        return Response(self.get_serializer(routes, many=True).data)

    @action(detail=False, methods=['get'])
    def dates_with_routes(self, request):
        """Get list of dates that have routes"""
        dates = self.get_queryset().values_list('date', flat=True).distinct().order_by('date')
        return Response({'dates': [date.isoformat() for date in dates]})

    # ========================================================================
    # ROUTE OPTIMIZATION - Google Maps integration
    # ========================================================================

    @action(detail=True, methods=['post'])
    def optimize(self, request, pk=None):
        """
        Optimize route using Google Maps Directions API

        This endpoint:
        1. Calculates distance with current stop order (baseline)
        2. Calculates distance with Google-optimized stop order
        3. Compares both to calculate actual savings
        4. Updates route with optimized sequence if beneficial

        Google Maps automatically optimizes for travel time.
        """
        route = self.get_object()

        try:
            maps_service = GoogleMapsService()
            result = maps_service.optimize_route(route.id)

            if result['success']:
                # The optimize_route method now returns both original and optimized values
                original_distance = Decimal(str(result.get('original_distance', 0)))
                original_duration = int(result.get('original_duration', 0))
                optimized_distance = Decimal(str(result.get('optimized_distance', 0)))
                optimized_duration = int(result.get('optimized_duration', 0))
                distance_savings = Decimal(str(result.get('distance_savings', 0)))
                time_savings = int(result.get('time_savings', 0))

                # Create optimization record with accurate savings
                optimization = RouteOptimization.objects.create(
                    route=route,
                    optimization_type='balanced',  # Google Maps optimizes for time by default
                    request_data={
                        'route_id': route.id,
                        'waypoint_order': result.get('waypoint_order', [])
                    },
                    response_data=result,
                    original_distance=original_distance,
                    optimized_distance=optimized_distance,
                    distance_savings=distance_savings,
                    original_duration=original_duration,
                    optimized_duration=optimized_duration,
                    time_savings=time_savings,
                    success=True,
                    created_by=request.user
                )

                # Calculate savings percentage
                savings_percentage = 0
                if original_distance > 0:
                    savings_percentage = (float(distance_savings) / float(original_distance)) * 100

                # Check if order changed
                waypoint_order = result.get('waypoint_order', [])
                stops = route.stops.all().order_by('sequence_number')
                expected_order = list(range(len(stops) - 1)) if len(stops) > 1 else []
                order_changed = waypoint_order != expected_order if waypoint_order else False

                # Determine message
                if distance_savings > 0:
                    message = f'Route optimized successfully! Saved {float(distance_savings):.1f} km ({savings_percentage:.1f}%)'
                elif order_changed:
                    message = 'Route order optimized (distance similar - common for round-trip routes)'
                else:
                    message = 'Route already optimally ordered'

                route.refresh_from_db()
                return Response({
                    'route': self.get_serializer(route).data,
                    'optimization': RouteOptimizationSerializer(optimization).data,
                    'message': message,
                    'savings_summary': {
                        'distance_saved_km': float(distance_savings),
                        'time_saved_minutes': time_savings,
                        'savings_percentage': round(savings_percentage, 2),
                        'original_distance_km': float(original_distance),
                        'optimized_distance_km': float(optimized_distance),
                        'order_changed': order_changed,
                        'new_order': waypoint_order,
                        'is_round_trip': route.return_to_warehouse,
                        'note': 'Round-trip routes often show minimal distance savings even when order changes'
                                if (order_changed and distance_savings == 0 and route.return_to_warehouse) else None
                    }
                })
            else:
                RouteOptimization.objects.create(
                    route=route,
                    optimization_type=optimization_type,
                    request_data={'route_id': route.id},
                    response_data=result,
                    success=False,
                    error_message=result.get('error', 'Unknown error'),
                    created_by=request.user
                )
                return Response(
                    {'error': result.get('error', 'Optimization failed')},
                    status=status.HTTP_400_BAD_REQUEST
                )

        except ValueError as ve:
            return Response(
                {'error': 'Google Maps API not configured', 'details': str(ve)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error(f"Optimization error: {str(e)}")
            return Response(
                {'error': f'Optimization error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def directions(self, request, pk=None):
        """Get turn-by-turn directions for route"""
        route = self.get_object()

        try:
            maps_service = GoogleMapsService()
            stops = list(route.stops.all().order_by('sequence_number'))

            if not stops:
                return Response(
                    {'error': 'Route must have at least 1 stop'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Get warehouse
            warehouse = route.origin_warehouse or Warehouse.objects.filter(is_primary=True, is_active=True).first()
            if not warehouse or not warehouse.has_coordinates:
                return Response(
                    {'error': 'Route requires warehouse with coordinates'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Build waypoints: warehouse -> stops -> warehouse
            waypoints = [f"{warehouse.latitude},{warehouse.longitude}"]
            for stop in stops:
                coords = stop.get_coordinates()
                if coords:
                    waypoints.append(f"{coords[0]},{coords[1]}")

            if route.return_to_warehouse:
                dest_warehouse = route.destination_warehouse or warehouse
                waypoints.append(f"{dest_warehouse.latitude},{dest_warehouse.longitude}")

            directions = maps_service.get_directions(
                origin=waypoints[0],
                destination=waypoints[-1],
                waypoints=waypoints[1:-1] if len(waypoints) > 2 else None,
                optimize_waypoints=False
            )

            if directions:
                return Response({
                    'route_id': route.id,
                    'directions': directions,
                    'waypoints_count': len(waypoints)
                })
            return Response(
                {'error': 'Could not get directions'},
                status=status.HTTP_400_BAD_REQUEST
            )

        except Exception as e:
            logger.error(f"Directions error: {str(e)}")
            return Response(
                {'error': f'Error getting directions: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    # ========================================================================
    # MULTI-CLIENT DISTRIBUTION PLANNING
    # ========================================================================

    @action(detail=False, methods=['post'])
    def create_distribution_plan(self, request):
        """
        Create optimized distribution plan for multiple clients

        Request body:
        {
            "client_ids": [1, 2, 3, 4, 5],
            "date": "2026-01-15",
            "max_stops_per_route": 10,
            "max_distance_km": 300,
            "clustering_method": "dbscan"|"kmeans",
            "use_async": false,
            "create_routes": false
        }
        """
        serializer = DistributionPlanSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        # Async processing
        if data.get('use_async', False):
            try:
                from .tasks import create_distribution_plan_task
                task = create_distribution_plan_task.delay(
                    client_ids=data['client_ids'],
                    date_str=data['date'].isoformat(),
                    max_stops_per_route=data.get('max_stops_per_route', 10),
                    max_distance_km=data.get('max_distance_km', 300),
                    clustering_method=data.get('clustering_method', 'dbscan'),
                    user_id=request.user.id
                )
                return Response({
                    'success': True,
                    'task_id': task.id,
                    'message': 'Distribution plan is being created',
                    'status_url': f'/api/tasks/{task.id}/'
                }, status=status.HTTP_202_ACCEPTED)
            except Exception as e:
                logger.error(f"Async task launch error: {str(e)}")
                return Response(
                    {'error': 'Could not start background processing'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

        # Sync processing
        try:
            from .services_async import create_multi_client_routes
            result = async_to_sync(create_multi_client_routes)(
                client_ids=data['client_ids'],
                date=data['date'],
                max_stops_per_route=data.get('max_stops_per_route', 10),
                max_distance_km=data.get('max_distance_km', 300),
                clustering_method=data.get('clustering_method', 'dbscan')
            )

            if result.get('success') and request.data.get('create_routes', False):
                result['created_routes'] = self._persist_distribution_plan(
                    result, data['date'], request.user
                )

            return Response(result)

        except Exception as e:
            logger.error(f"Distribution plan error: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Error creating distribution plan: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def available_clients(self, request):
        """Get all active clients with geocoded coordinates, grouped by cluster"""
        from clients.serializers import ClientListSerializer
        from django.db.models import Count

        # Get filter parameters
        cluster_id = request.query_params.get('cluster_id')
        include_unclustered = request.query_params.get('include_unclustered', 'true').lower() == 'true'

        clients = Client.objects.filter(
            is_active=True,
            latitude__isnull=False,
            longitude__isnull=False
        )

        # Filter by cluster if specified
        if cluster_id is not None:
            if cluster_id == '-1' or cluster_id == 'unclustered':
                clients = clients.filter(cluster_id__isnull=True)
            else:
                clients = clients.filter(cluster_id=int(cluster_id))
        elif not include_unclustered:
            clients = clients.filter(cluster_id__isnull=False)

        clients = clients.order_by('cluster_id', 'name')

        # Get cluster summary for sidebar
        cluster_summary = Client.objects.filter(
            is_active=True,
            latitude__isnull=False,
            longitude__isnull=False,
            cluster_id__isnull=False
        ).values('cluster_id', 'cluster_label').annotate(
            client_count=Count('id')
        ).order_by('cluster_id')

        # Get unclustered count
        unclustered_count = Client.objects.filter(
            is_active=True,
            latitude__isnull=False,
            longitude__isnull=False,
            cluster_id__isnull=True
        ).count()

        return Response({
            'count': clients.count(),
            'results': ClientListSerializer(clients, many=True).data,
            'clusters': list(cluster_summary),
            'unclustered_count': unclustered_count,
            'total_clustered': sum(c['client_count'] for c in cluster_summary)
        })

    def _persist_distribution_plan(self, plan_result: Dict, date, user) -> List[Dict]:
        """Convert distribution plan into Route objects"""
        created_routes = []
        timestamp = timezone.now().strftime('%H%M%S')
        warehouse = Warehouse.objects.filter(is_primary=True, is_active=True).first()

        try:
            for idx, route_data in enumerate(plan_result.get('routes', [])):
                route_name = f"Distribution Route {idx + 1} - {date} - {timestamp}"
                counter = 1
                original_name = route_name
                while Route.objects.filter(name=route_name).exists():
                    route_name = f"{original_name}-{counter}"
                    counter += 1

                route = Route.objects.create(
                    name=route_name,
                    date=date,
                    status='planned',
                    route_type='mixed',
                    origin_warehouse=warehouse,
                    return_to_warehouse=True,
                    total_distance=Decimal(str(route_data['total_distance_km'])),
                    estimated_duration=int(route_data['estimated_duration_minutes']),
                    waypoints=route_data['optimized_sequence'],
                    created_by=user
                )

                # route_data['clients'] is already in Google Maps optimized order
                # (reordering now happens in DistributionPlanService.create_distribution_plan)
                ordered_client_ids = route_data['clients']
                
                # Create stops in the optimized order
                for seq, client_id in enumerate(ordered_client_ids, 1):
                    client = Client.objects.get(id=client_id)
                    pending_order = client.orders.filter(status__in=['pending', 'confirmed']).first()

                    RouteStop.objects.create(
                        route=route,
                        client=client,
                        order=pending_order,
                        sequence_number=seq,
                        location_latitude=client.latitude,
                        location_longitude=client.longitude
                    )

                created_routes.append({
                    'id': route.id,
                    'name': route.name,
                    'stops_count': route.stops.count(),
                    'distance_km': float(route.total_distance),
                    'duration_minutes': route.estimated_duration
                })

            return created_routes
        except Exception as e:
            logger.error(f"Error persisting plan: {str(e)}")
            raise

    # ========================================================================
    # GEOCODING
    # ========================================================================

    @action(detail=False, methods=['post'])
    def batch_geocode(self, request):
        """
        Batch geocode client addresses

        Request body:
        {
            "client_ids": [1, 2, 3],
            "force_update": false,
            "use_async": false
        }
        """
        serializer = BatchGeocodeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        # Filter clients
        if data.get('force_update', False):
            client_ids = data['client_ids']
        else:
            client_ids = list(
                Client.objects.filter(
                    id__in=data['client_ids'],
                    latitude__isnull=True
                ).values_list('id', flat=True)
            )

        if not client_ids:
            return Response({
                'success': True,
                'message': 'All clients already have coordinates',
                'clients_processed': 0
            })

        # Async processing
        if data.get('use_async', False):
            from .tasks import geocode_client_addresses_task
            task = geocode_client_addresses_task.delay(client_ids)
            return Response({
                'success': True,
                'task_id': task.id,
                'clients_to_process': len(client_ids),
                'message': 'Geocoding in progress',
                'status_url': f'/api/tasks/{task.id}/'
            }, status=status.HTTP_202_ACCEPTED)

        # Sync processing
        try:
            from .services_async import geocode_clients_batch
            results = async_to_sync(geocode_clients_batch)(client_ids)
            successful = sum(1 for r in results if r['success'])

            return Response({
                'success': True,
                'clients_processed': len(client_ids),
                'successful': successful,
                'failed': len(results) - successful,
                'results': results
            })
        except Exception as e:
            logger.error(f"Geocoding error: {str(e)}")
            return Response(
                {'error': f'Error geocoding: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    # ========================================================================
    # REAL-TIME TRACKING
    # ========================================================================

    @action(detail=False, methods=['get'])
    def live_tracking(self, request):
        """Get live vehicle locations for active routes"""
        route_ids = request.query_params.getlist('route_ids')

        try:
            tracking_service = RealTimeTrackingService()
            vehicles = tracking_service.get_active_vehicles(route_ids if route_ids else None)

            return Response({
                'vehicles': vehicles,
                'count': len(vehicles),
                'timestamp': timezone.now().isoformat()
            })
        except Exception as e:
            logger.error(f"Live tracking error: {str(e)}")
            return Response(
                {'error': f'Error getting tracking data: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def delivery_progress(self, request, pk=None):
        """Get delivery progress for a route"""
        route = self.get_object()

        try:
            tracking_service = RealTimeTrackingService()
            progress = tracking_service.get_route_progress(route.id)
            return Response(progress)
        except Exception as e:
            logger.error(f"Progress error: {str(e)}")
            return Response(
                {'error': f'Error getting progress: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    # ========================================================================
    # ADVANCED ROUTE EDITING
    # ========================================================================

    @action(detail=True, methods=['post'])
    def reorder_stops(self, request, pk=None):
        """
        Reorder route stops

        Request body:
        {
            "stop_order": [5, 3, 1, 2, 4],  # Stop IDs in new order
            "optimize": true
        }
        """
        route = self.get_object()
        stop_order = request.data.get('stop_order', [])
        optimize = request.data.get('optimize', False)

        if not stop_order:
            return Response(
                {'error': 'stop_order is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            editing_service = RouteEditingService()
            result = editing_service.reorder_stops(route.id, stop_order, optimize)
            return Response(result)
        except Exception as e:
            logger.error(f"Reorder error: {str(e)}")
            return Response(
                {'error': f'Error reordering stops: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def insert_stop(self, request, pk=None):
        """
        Insert new stop into route

        Request body:
        {
            "client_id": 123,
            "insert_after_stop_id": 456,  # Optional
            "insert_at_position": 3,  # Optional
            "optimize": true
        }
        """
        route = self.get_object()

        try:
            editing_service = RouteEditingService()
            result = editing_service.insert_stop(
                route_id=route.id,
                client_id=request.data.get('client_id'),
                insert_after_stop_id=request.data.get('insert_after_stop_id'),
                insert_at_position=request.data.get('insert_at_position'),
                optimize=request.data.get('optimize', True)
            )
            return Response(result)
        except Exception as e:
            logger.error(f"Insert stop error: {str(e)}")
            return Response(
                {'error': f'Error inserting stop: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def remove_stop(self, request, pk=None):
        """
        Remove stop from route

        Request body:
        {
            "stop_id": 123,
            "reoptimize": true
        }
        """
        route = self.get_object()

        try:
            editing_service = RouteEditingService()
            result = editing_service.remove_stop(
                route_id=route.id,
                stop_id=request.data.get('stop_id'),
                reoptimize=request.data.get('reoptimize', True)
            )
            return Response(result)
        except Exception as e:
            logger.error(f"Remove stop error: {str(e)}")
            return Response(
                {'error': f'Error removing stop: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def split(self, request, pk=None):
        """
        Split route into two routes

        Request body:
        {
            "split_after_stop_id": 123,
            "new_route_name": "Route Part 2"
        }
        """
        route = self.get_object()

        try:
            editing_service = RouteEditingService()
            result = editing_service.split_route(
                route_id=route.id,
                split_after_stop_id=request.data.get('split_after_stop_id'),
                new_route_name=request.data.get('new_route_name')
            )
            return Response(result)
        except Exception as e:
            logger.error(f"Split error: {str(e)}")
            return Response(
                {'error': f'Error splitting route: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def merge(self, request, pk=None):
        """
        Merge another route into this one

        Request body:
        {
            "secondary_route_id": 456,
            "reoptimize": true
        }
        """
        route = self.get_object()

        try:
            editing_service = RouteEditingService()
            result = editing_service.merge_routes(
                primary_route_id=route.id,
                secondary_route_id=request.data.get('secondary_route_id'),
                reoptimize=request.data.get('reoptimize', True)
            )
            return Response(result)
        except Exception as e:
            logger.error(f"Merge error: {str(e)}")
            return Response(
                {'error': f'Error merging routes: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    # ========================================================================
    # DRIVER ASSIGNMENT & ROUTE SHARING
    # ========================================================================

    @action(detail=True, methods=['post'])
    def assign_to_driver(self, request, pk=None):
        """
        Assign route to a driver with vehicle and share via Google Maps

        Request body:
        {
            "driver_id": 123,
            "vehicle_id": 456,  # optional
            "send_notification": true,  # optional
            "notification_method": "email|sms|both"  # optional
        }
        """
        from driver.models import Driver, Vehicle
        from .google_maps_integration import GoogleMapsRouteSharing

        route = self.get_object()

        if route.status not in ['planned', 'draft']:
            return Response(
                {'error': f'Cannot assign {route.status} routes'},
                status=status.HTTP_400_BAD_REQUEST
            )

        driver_id = request.data.get('driver_id')
        if not driver_id:
            return Response(
                {'error': 'driver_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                driver = Driver.objects.get(id=driver_id)

                # Assign vehicle if provided
                vehicle_id = request.data.get('vehicle_id')
                if vehicle_id:
                    vehicle = Vehicle.objects.get(id=vehicle_id)
                    if not vehicle.is_available:
                        return Response(
                            {'error': 'Vehicle is not available'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    # Link to route via driver model
                    route.assigned_vehicle_type = vehicle.vehicle_type

                # Update route status
                if route.status == 'draft':
                    route.status = 'planned'

                route.save()

                # Create Delivery record to link driver to route
                from driver.models import Delivery
                delivery, created = Delivery.objects.get_or_create(
                    route=route,
                    driver=driver,
                    defaults={
                        'vehicle': Vehicle.objects.get(id=vehicle_id) if vehicle_id else driver.assigned_vehicle,
                        'status': 'assigned'
                    }
                )

                # Generate Google Maps links
                maps_service = GoogleMapsRouteSharing()
                route_summary = maps_service.create_route_summary_for_driver(route.id)

                response_data = {
                    'success': True,
                    'route': self.get_serializer(route).data,
                    'driver': {
                        'id': driver.id,
                        'name': driver.full_name,
                        'phone': driver.phone_number
                    },
                    'google_maps_urls': route_summary.get('navigation_urls', {}),
                    'route_summary': route_summary,
                    'message': f'Route assigned to {driver.full_name}'
                }

                # Send notification if requested
                if request.data.get('send_notification', False):
                    notification_method = request.data.get('notification_method', 'email')
                    notification_result = self._send_route_notification(
                        driver, route, route_summary, notification_method
                    )
                    response_data['notification'] = notification_result

                return Response(response_data)

        except Driver.DoesNotExist:
            return Response(
                {'error': 'Driver not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Vehicle.DoesNotExist:
            return Response(
                {'error': 'Vehicle not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Driver assignment error: {str(e)}")
            return Response(
                {'error': f'Assignment error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def unassign_driver(self, request, pk=None):
        """Unassign driver from route"""
        route = self.get_object()

        try:
            from driver.models import Delivery

            deliveries = Delivery.objects.filter(route=route, status='assigned')
            if not deliveries.exists():
                return Response(
                    {'error': 'No driver assigned to this route'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            deliveries.update(status='cancelled')

            return Response({
                'success': True,
                'message': 'Driver unassigned from route'
            })

        except Exception as e:
            logger.error(f"Driver unassignment error: {str(e)}")
            return Response(
                {'error': f'Unassignment error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def google_maps_links(self, request, pk=None):
        """
        Get Google Maps navigation links for this route

        Query params:
        - url_type: web|mobile|android|ios (default: mobile)
        """
        from .google_maps_integration import GoogleMapsRouteSharing

        route = self.get_object()
        url_type = request.query_params.get('url_type', 'mobile')

        try:
            maps_service = GoogleMapsRouteSharing()
            result = maps_service.generate_route_url(route.id, url_type)

            return Response(result)

        except Exception as e:
            logger.error(f"Google Maps link error: {str(e)}")
            return Response(
                {'error': f'Error generating links: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def driver_summary(self, request, pk=None):
        """Get comprehensive route summary for driver app"""
        from .google_maps_integration import GoogleMapsRouteSharing

        route = self.get_object()

        try:
            maps_service = GoogleMapsRouteSharing()
            summary = maps_service.create_route_summary_for_driver(route.id)

            return Response(summary)

        except Exception as e:
            logger.error(f"Driver summary error: {str(e)}")
            return Response(
                {'error': f'Error creating summary: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def qr_code_data(self, request, pk=None):
        """Get QR code data for quick route access by drivers"""
        from .google_maps_integration import GoogleMapsRouteSharing

        route = self.get_object()
        url_type = request.query_params.get('url_type', 'mobile')

        try:
            maps_service = GoogleMapsRouteSharing()
            qr_data = maps_service.generate_qr_code_data(route.id, url_type)

            return Response(qr_data)

        except Exception as e:
            logger.error(f"QR code error: {str(e)}")
            return Response(
                {'error': f'Error generating QR code: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def tracking_status(self, request, pk=None):
        """Get real-time tracking status for this route"""
        route = self.get_object()

        try:
            tracking_service = RealTimeTrackingService()
            progress = tracking_service.get_route_progress(route.id)

            return Response(progress)

        except Exception as e:
            logger.error(f"Tracking status error: {str(e)}")
            return Response(
                {'error': f'Error getting tracking status: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _send_route_notification(self, driver, route, route_summary, method='email'):
        """Helper method to send route notification to driver"""
        try:
            from .notification_service import RouteNotificationService

            notification_service = RouteNotificationService()
            result = notification_service.send_route_assignment(
                driver=driver,
                route=route,
                route_summary=route_summary,
                method=method
            )

            # Determine overall success
            sent = False
            if method == 'email':
                sent = result.get('email_sent', False)
            elif method == 'sms':
                sent = result.get('sms_sent', False)
            elif method == 'both':
                sent = result.get('email_sent', False) or result.get('sms_sent', False)

            response = {
                'sent': sent,
                'method': method,
                'email_sent': result.get('email_sent', False),
                'sms_sent': result.get('sms_sent', False)
            }

            if sent:
                response['message'] = 'Notification sent successfully'
            else:
                response['message'] = 'Notification failed'
                response['errors'] = result.get('errors', [])

            return response

        except Exception as e:
            logger.error(f"Notification error: {str(e)}")
            return {
                'sent': False,
                'method': method,
                'error': str(e),
                'message': 'Error sending notification'
            }

    # ========================================================================
    # PERFORMANCE ANALYTICS
    # ========================================================================

    @action(detail=True, methods=['get'])
    def kpis(self, request, pk=None):
        """Get route KPIs (KM/TM ratios, efficiency metrics)"""
        route = self.get_object()

        try:
            optimization_service = RouteOptimizationService()
            kpis = optimization_service.calculate_route_kpis(route.id)
            return Response(kpis)
        except Exception as e:
            logger.error(f"KPI error: {str(e)}")
            return Response(
                {'error': f'Error calculating KPIs: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================================
# ROUTE STOPS VIEWSET
# ============================================================================

class RouteStopViewSet(viewsets.ModelViewSet):
    """Route stop management"""

    queryset = RouteStop.objects.all()
    serializer_class = RouteStopSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['route', 'client', 'is_completed']
    ordering_fields = ['sequence_number']

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark stop as completed"""
        stop = self.get_object()
        stop.is_completed = True
        stop.actual_arrival_time = timezone.now()
        stop.save()

        if stop.order:
            stop.order.status = 'delivered'
            stop.order.actual_delivery_date = timezone.now()
            stop.order.save()

        return Response(self.get_serializer(stop).data)

    @action(detail=True, methods=['post'])
    def update_coordinates(self, request, pk=None):
        """Update stop coordinates from client"""
        stop = self.get_object()

        try:
            result = stop.update_coordinates_from_client(save=True)
            if result:
                return Response({
                    'success': True,
                    'stop': self.get_serializer(stop).data,
                    'message': 'Coordinates updated from client'
                })
            return Response(
                {'error': 'Client does not have coordinates'},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'error': f'Error updating coordinates: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================================
# ROUTE OPTIMIZATION HISTORY VIEWSET
# ============================================================================

class RouteOptimizationViewSet(viewsets.ReadOnlyModelViewSet):
    """Route optimization history (read-only)"""

    queryset = RouteOptimization.objects.all()
    serializer_class = RouteOptimizationSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['route', 'success', 'optimization_type']
    ordering_fields = ['created_at']
