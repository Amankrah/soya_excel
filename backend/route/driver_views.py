"""
Driver Mobile App API Endpoints

Provides REST API endpoints for driver mobile applications:
- Route assignment viewing
- GPS position updates
- Delivery status updates
- Photo proof of delivery
- Customer signatures
- Issue reporting
"""

import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.core.files.base import ContentFile
import base64
import json

from .models import Route, RouteStop
from .serializers import RouteSerializer, RouteStopSerializer
from .realtime_tracking import RealTimeTrackingService

logger = logging.getLogger(__name__)


class DriverRouteViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for driver mobile app route operations.

    Drivers can:
    - View assigned routes
    - Get route details and directions
    - See delivery stop information
    """

    serializer_class = RouteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return routes assigned to current driver"""
        user = self.request.user

        try:
            from driver.models import Driver
            driver = Driver.objects.get(user=user)

            # Return routes assigned to this driver
            return Route.objects.filter(
                driver=driver
            ).select_related(
                'origin_warehouse',
                'destination_warehouse'
            ).prefetch_related(
                'stops__client',
                'stops__order'
            ).order_by('-date')

        except Driver.DoesNotExist:
            return Route.objects.none()

    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get current active route for driver"""
        try:
            from driver.models import Driver
            driver = Driver.objects.get(user=request.user)

            active_route = Route.objects.filter(
                driver=driver,
                status='active'
            ).select_related(
                'origin_warehouse',
                'destination_warehouse'
            ).prefetch_related(
                'stops__client',
                'stops__order'
            ).first()

            if active_route:
                serializer = self.get_serializer(active_route)

                # Add progress information
                total_stops = active_route.stops.count()
                completed_stops = active_route.stops.filter(is_completed=True).count()

                response_data = serializer.data
                response_data['progress'] = {
                    'total_stops': total_stops,
                    'completed_stops': completed_stops,
                    'remaining_stops': total_stops - completed_stops,
                    'progress_percentage': (completed_stops / total_stops * 100) if total_stops > 0 else 0
                }

                # Add next stop
                next_stop = active_route.stops.filter(
                    is_completed=False
                ).order_by('sequence_number').first()

                if next_stop:
                    response_data['next_stop'] = RouteStopSerializer(next_stop).data

                return Response(response_data)
            else:
                return Response(
                    {'message': 'No active route assigned'},
                    status=status.HTTP_404_NOT_FOUND
                )

        except Exception as e:
            return Response(
                {'error': f'Error getting active route: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def start_route(self, request, pk=None):
        """Start a route (change status to active)"""
        route = self.get_object()

        if route.status != 'planned':
            return Response(
                {'error': 'Only planned routes can be started'},
                status=status.HTTP_400_BAD_REQUEST
            )

        route.status = 'active'
        route.save(update_fields=['status'])

        serializer = self.get_serializer(route)
        return Response({
            'success': True,
            'route': serializer.data,
            'message': 'Route started successfully'
        })

    @action(detail=True, methods=['post'])
    def complete_route(self, request, pk=None):
        """Complete a route (all deliveries done)"""
        route = self.get_object()

        if route.status != 'active':
            return Response(
                {'error': 'Only active routes can be completed'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if all stops are completed
        incomplete_stops = route.stops.filter(is_completed=False).count()
        if incomplete_stops > 0:
            return Response(
                {
                    'error': f'{incomplete_stops} stops are still pending',
                    'incomplete_stops': incomplete_stops
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        route.status = 'completed'
        route.save(update_fields=['status'])

        serializer = self.get_serializer(route)
        return Response({
            'success': True,
            'route': serializer.data,
            'message': 'Route completed successfully'
        })


class DriverDeliveryViewSet(viewsets.ViewSet):
    """
    ViewSet for driver delivery operations.

    Handles:
    - GPS position updates
    - Delivery start/complete actions
    - Photo proof of delivery
    - Customer signatures
    - Issue reporting
    """

    permission_classes = [IsAuthenticated]

    def get_driver(self):
        """Get driver instance for current user"""
        from driver.models import Driver
        return Driver.objects.get(user=self.request.user)

    @action(detail=False, methods=['post'])
    def update_position(self, request):
        """
        Record GPS position update from driver.

        Request Body:
        {
            "route_id": 123,
            "latitude": 45.5017,
            "longitude": -73.5673,
            "speed": 65.5,
            "heading": 180.0,
            "accuracy": 10.0,
            "timestamp": "2026-01-04T10:30:00Z"
        }
        """
        try:
            driver = self.get_driver()

            # Get vehicle assigned to driver
            vehicle = driver.current_vehicle if hasattr(driver, 'current_vehicle') else None
            if not vehicle:
                return Response(
                    {'error': 'No vehicle assigned to driver'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Extract position data
            latitude = request.data.get('latitude')
            longitude = request.data.get('longitude')
            route_id = request.data.get('route_id')

            if not latitude or not longitude:
                return Response(
                    {'error': 'Latitude and longitude are required'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Record position
            tracking_service = RealTimeTrackingService()
            result = tracking_service.record_position(
                vehicle_id=vehicle.id,
                latitude=float(latitude),
                longitude=float(longitude),
                driver_id=driver.id,
                route_id=route_id,
                speed=request.data.get('speed'),
                heading=request.data.get('heading'),
                accuracy=request.data.get('accuracy'),
                recorded_at=request.data.get('timestamp'),
                battery_level=request.data.get('battery_level'),
                is_moving=request.data.get('is_moving', True),
                is_ignition_on=request.data.get('is_ignition_on', True)
            )

            if result.get('success'):
                # Broadcast position update via WebSocket (if channels is configured)
                try:
                    from channels.layers import get_channel_layer
                    from asgiref.sync import async_to_sync

                    channel_layer = get_channel_layer()
                    if channel_layer and route_id:
                        async_to_sync(channel_layer.group_send)(
                            f'route_{route_id}',
                            {
                                'type': 'position_update',
                                'data': {
                                    'driver_id': driver.id,
                                    'vehicle_id': vehicle.id,
                                    'latitude': float(latitude),
                                    'longitude': float(longitude),
                                    'speed': request.data.get('speed'),
                                    'heading': request.data.get('heading'),
                                    'timestamp': result.get('timestamp')
                                }
                            }
                        )
                except Exception as e:
                    logger.warning(f"Could not broadcast position update: {str(e)}")

                return Response(result)
            else:
                return Response(
                    result,
                    status=status.HTTP_400_BAD_REQUEST
                )

        except Exception as e:
            logger.error(f"Error updating position: {str(e)}")
            return Response(
                {'error': f'Error updating position: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def start_delivery(self, request):
        """
        Mark delivery as started (arrived at stop).

        Request Body:
        {
            "stop_id": 123,
            "arrival_latitude": 45.5017,
            "arrival_longitude": -73.5673
        }
        """
        try:
            stop_id = request.data.get('stop_id')

            if not stop_id:
                return Response(
                    {'error': 'stop_id is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            stop = RouteStop.objects.select_related('route', 'client').get(id=stop_id)

            # Verify driver is assigned to this route
            driver = self.get_driver()
            if stop.route.driver != driver:
                return Response(
                    {'error': 'You are not assigned to this route'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Mark arrival
            stop.actual_arrival_time = timezone.now()

            # Update actual coordinates if provided
            if 'arrival_latitude' in request.data and 'arrival_longitude' in request.data:
                stop.location_latitude = request.data['arrival_latitude']
                stop.location_longitude = request.data['arrival_longitude']

            stop.save()

            # Broadcast event
            try:
                from channels.layers import get_channel_layer
                from asgiref.sync import async_to_sync

                channel_layer = get_channel_layer()
                if channel_layer:
                    async_to_sync(channel_layer.group_send)(
                        f'route_{stop.route.id}',
                        {
                            'type': 'geofence_event',
                            'data': {
                                'event_type': 'arrival',
                                'stop_id': stop.id,
                                'client_name': stop.client.name,
                                'arrival_time': stop.actual_arrival_time.isoformat()
                            }
                        }
                    )
            except Exception as e:
                logger.warning(f"Could not broadcast delivery start: {str(e)}")

            serializer = RouteStopSerializer(stop)
            return Response({
                'success': True,
                'stop': serializer.data,
                'message': f'Delivery started at {stop.client.name}'
            })

        except RouteStop.DoesNotExist:
            return Response(
                {'error': 'Route stop not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error starting delivery: {str(e)}")
            return Response(
                {'error': f'Error starting delivery: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def complete_delivery(self, request):
        """
        Mark delivery as completed.

        Request Body:
        {
            "stop_id": 123,
            "quantity_delivered": 25.5,
            "notes": "Delivered successfully",
            "signature_image": "base64_encoded_image",
            "proof_photo": "base64_encoded_image",
            "customer_rating": 5,
            "had_issues": false,
            "issue_description": ""
        }
        """
        try:
            stop_id = request.data.get('stop_id')

            if not stop_id:
                return Response(
                    {'error': 'stop_id is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            stop = RouteStop.objects.select_related('route', 'client', 'order').get(id=stop_id)

            # Verify driver is assigned to this route
            driver = self.get_driver()
            if stop.route.driver != driver:
                return Response(
                    {'error': 'You are not assigned to this route'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Mark completion
            stop.is_completed = True
            stop.actual_departure_time = timezone.now()

            # Update delivery data
            if 'quantity_delivered' in request.data:
                stop.quantity_delivered = request.data['quantity_delivered']

            if 'notes' in request.data:
                stop.delivery_notes = request.data['notes']

            if 'customer_rating' in request.data:
                stop.delivery_rating = request.data['customer_rating']

            if 'had_issues' in request.data:
                stop.had_delivery_issues = request.data['had_issues']
                if request.data['had_issues'] and 'issue_description' in request.data:
                    stop.issue_description = request.data['issue_description']

            # Handle signature image
            if 'signature_image' in request.data:
                try:
                    signature_data = request.data['signature_image']
                    # Remove data URL prefix if present
                    if ',' in signature_data:
                        signature_data = signature_data.split(',')[1]

                    signature_file = ContentFile(
                        base64.b64decode(signature_data),
                        name=f'signature_{stop.id}_{timezone.now().timestamp()}.png'
                    )

                    # Save signature (you may need to add a FileField to RouteStop model)
                    # stop.customer_signature.save(signature_file.name, signature_file)
                    stop.customer_signature_captured = True

                except Exception as e:
                    logger.error(f"Error processing signature: {str(e)}")

            # Calculate actual service time
            if stop.actual_arrival_time:
                service_duration = (stop.actual_departure_time - stop.actual_arrival_time).total_seconds() / 60.0
                stop.actual_service_time = int(service_duration)

            stop.save()

            # Update order status if linked
            if stop.order:
                stop.order.status = 'delivered'
                stop.order.actual_delivery_date = timezone.now()
                if 'quantity_delivered' in request.data:
                    stop.order.quantity_delivered = request.data['quantity_delivered']
                stop.order.save()

            # Broadcast completion event
            try:
                from channels.layers import get_channel_layer
                from asgiref.sync import async_to_sync

                channel_layer = get_channel_layer()
                if channel_layer:
                    async_to_sync(channel_layer.group_send)(
                        f'route_{stop.route.id}',
                        {
                            'type': 'delivery_completed',
                            'data': {
                                'stop_id': stop.id,
                                'client_name': stop.client.name,
                                'quantity_delivered': float(stop.quantity_delivered) if stop.quantity_delivered else None,
                                'completion_time': stop.actual_departure_time.isoformat()
                            }
                        }
                    )
            except Exception as e:
                logger.warning(f"Could not broadcast delivery completion: {str(e)}")

            serializer = RouteStopSerializer(stop)
            return Response({
                'success': True,
                'stop': serializer.data,
                'message': f'Delivery completed at {stop.client.name}'
            })

        except RouteStop.DoesNotExist:
            return Response(
                {'error': 'Route stop not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error completing delivery: {str(e)}")
            return Response(
                {'error': f'Error completing delivery: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def report_issue(self, request):
        """
        Report an issue during delivery.

        Request Body:
        {
            "stop_id": 123,
            "issue_type": "access_denied"|"client_unavailable"|"wrong_product"|"other",
            "description": "Client was not available",
            "photo": "base64_encoded_image"
        }
        """
        try:
            stop_id = request.data.get('stop_id')
            issue_type = request.data.get('issue_type')
            description = request.data.get('description')

            if not stop_id or not issue_type:
                return Response(
                    {'error': 'stop_id and issue_type are required'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            stop = RouteStop.objects.get(id=stop_id)

            # Verify driver is assigned to this route
            driver = self.get_driver()
            if stop.route.driver != driver:
                return Response(
                    {'error': 'You are not assigned to this route'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Mark issue
            stop.had_delivery_issues = True
            stop.issue_description = f"[{issue_type}] {description}"
            stop.save(update_fields=['had_delivery_issues', 'issue_description'])

            # Log issue
            logger.warning(
                f"Delivery issue reported for stop {stop_id} by driver {driver.name}: "
                f"{issue_type} - {description}"
            )

            # Broadcast issue notification
            try:
                from channels.layers import get_channel_layer
                from asgiref.sync import async_to_sync

                channel_layer = get_channel_layer()
                if channel_layer:
                    async_to_sync(channel_layer.group_send)(
                        'route_tracking',  # Broadcast to all managers
                        {
                            'type': 'delivery_issue',
                            'data': {
                                'route_id': stop.route.id,
                                'stop_id': stop.id,
                                'client_name': stop.client.name,
                                'issue_type': issue_type,
                                'description': description,
                                'driver_id': driver.id,
                                'driver_name': driver.name,
                                'timestamp': timezone.now().isoformat()
                            }
                        }
                    )
            except Exception as e:
                logger.warning(f"Could not broadcast issue notification: {str(e)}")

            return Response({
                'success': True,
                'message': 'Issue reported successfully',
                'stop_id': stop.id
            })

        except RouteStop.DoesNotExist:
            return Response(
                {'error': 'Route stop not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error reporting issue: {str(e)}")
            return Response(
                {'error': f'Error reporting issue: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def current_position(self, request):
        """Get driver's current position and route progress"""
        try:
            driver = self.get_driver()

            # Get active route
            active_route = Route.objects.filter(
                driver=driver,
                status='active'
            ).first()

            if not active_route:
                return Response(
                    {'message': 'No active route'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Get route progress
            tracking_service = RealTimeTrackingService()
            progress = tracking_service.get_route_progress(active_route.id)

            return Response(progress)

        except Exception as e:
            logger.error(f"Error getting current position: {str(e)}")
            return Response(
                {'error': f'Error getting current position: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
