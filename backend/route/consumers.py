"""
WebSocket Consumers for Real-Time Route Tracking

Provides WebSocket support for:
- Live vehicle position updates
- Route progress notifications
- Delivery status changes
- Geofence event broadcasts
"""

import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone

logger = logging.getLogger(__name__)


class RouteTrackingConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time route tracking.

    Clients can subscribe to:
    - All active routes
    - Specific routes by ID
    - Specific vehicles by ID

    Message format:
    {
        "type": "subscribe"|"unsubscribe"|"position_update",
        "route_id": 123,  # optional
        "vehicle_id": 456  # optional
    }
    """

    async def connect(self):
        """Handle WebSocket connection"""
        self.user = self.scope['user']

        # Require authentication
        if not self.user.is_authenticated:
            await self.close()
            return

        # Join general tracking group
        self.tracking_group = 'route_tracking'
        await self.channel_layer.group_add(
            self.tracking_group,
            self.channel_name
        )

        # Store subscribed routes and vehicles
        self.subscribed_routes = set()
        self.subscribed_vehicles = set()

        await self.accept()

        # Send connection confirmation
        await self.send(text_data=json.dumps({
            'type': 'connection_established',
            'message': 'Connected to route tracking',
            'timestamp': timezone.now().isoformat()
        }))

        logger.info(f"User {self.user.username} connected to route tracking")

    async def disconnect(self, close_code):
        """Handle WebSocket disconnection"""
        # Leave all groups
        await self.channel_layer.group_discard(
            self.tracking_group,
            self.channel_name
        )

        # Leave route-specific groups
        for route_id in self.subscribed_routes:
            await self.channel_layer.group_discard(
                f'route_{route_id}',
                self.channel_name
            )

        # Leave vehicle-specific groups
        for vehicle_id in self.subscribed_vehicles:
            await self.channel_layer.group_discard(
                f'vehicle_{vehicle_id}',
                self.channel_name
            )

        logger.info(f"User {self.user.username} disconnected from route tracking")

    async def receive(self, text_data):
        """Handle incoming WebSocket messages"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')

            if message_type == 'subscribe':
                await self.handle_subscribe(data)
            elif message_type == 'unsubscribe':
                await self.handle_unsubscribe(data)
            elif message_type == 'ping':
                await self.send(text_data=json.dumps({
                    'type': 'pong',
                    'timestamp': timezone.now().isoformat()
                }))
            else:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': f'Unknown message type: {message_type}'
                }))

        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid JSON format'
            }))
        except Exception as e:
            logger.error(f"Error handling WebSocket message: {str(e)}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Internal server error'
            }))

    async def handle_subscribe(self, data):
        """Handle subscription requests"""
        route_id = data.get('route_id')
        vehicle_id = data.get('vehicle_id')

        if route_id:
            # Subscribe to specific route
            group_name = f'route_{route_id}'
            await self.channel_layer.group_add(
                group_name,
                self.channel_name
            )
            self.subscribed_routes.add(route_id)

            await self.send(text_data=json.dumps({
                'type': 'subscribed',
                'route_id': route_id,
                'message': f'Subscribed to route {route_id}'
            }))

            # Send current route state
            route_data = await self.get_route_state(route_id)
            if route_data:
                await self.send(text_data=json.dumps({
                    'type': 'route_state',
                    'data': route_data
                }))

        if vehicle_id:
            # Subscribe to specific vehicle
            group_name = f'vehicle_{vehicle_id}'
            await self.channel_layer.group_add(
                group_name,
                self.channel_name
            )
            self.subscribed_vehicles.add(vehicle_id)

            await self.send(text_data=json.dumps({
                'type': 'subscribed',
                'vehicle_id': vehicle_id,
                'message': f'Subscribed to vehicle {vehicle_id}'
            }))

            # Send current vehicle position
            position_data = await self.get_vehicle_position(vehicle_id)
            if position_data:
                await self.send(text_data=json.dumps({
                    'type': 'vehicle_position',
                    'data': position_data
                }))

    async def handle_unsubscribe(self, data):
        """Handle unsubscription requests"""
        route_id = data.get('route_id')
        vehicle_id = data.get('vehicle_id')

        if route_id and route_id in self.subscribed_routes:
            group_name = f'route_{route_id}'
            await self.channel_layer.group_discard(
                group_name,
                self.channel_name
            )
            self.subscribed_routes.remove(route_id)

            await self.send(text_data=json.dumps({
                'type': 'unsubscribed',
                'route_id': route_id,
                'message': f'Unsubscribed from route {route_id}'
            }))

        if vehicle_id and vehicle_id in self.subscribed_vehicles:
            group_name = f'vehicle_{vehicle_id}'
            await self.channel_layer.group_discard(
                group_name,
                self.channel_name
            )
            self.subscribed_vehicles.remove(vehicle_id)

            await self.send(text_data=json.dumps({
                'type': 'unsubscribed',
                'vehicle_id': vehicle_id,
                'message': f'Unsubscribed from vehicle {vehicle_id}'
            }))

    # Message handlers for group broadcasts

    async def position_update(self, event):
        """Handle position update broadcast"""
        await self.send(text_data=json.dumps({
            'type': 'position_update',
            'data': event['data']
        }))

    async def geofence_event(self, event):
        """Handle geofence event broadcast"""
        await self.send(text_data=json.dumps({
            'type': 'geofence_event',
            'data': event['data']
        }))

    async def delivery_completed(self, event):
        """Handle delivery completion broadcast"""
        await self.send(text_data=json.dumps({
            'type': 'delivery_completed',
            'data': event['data']
        }))

    async def route_status_change(self, event):
        """Handle route status change broadcast"""
        await self.send(text_data=json.dumps({
            'type': 'route_status_change',
            'data': event['data']
        }))

    # Database queries (sync_to_async)

    @database_sync_to_async
    def get_route_state(self, route_id):
        """Get current state of a route"""
        try:
            from .realtime_tracking import RealTimeTrackingService

            service = RealTimeTrackingService()
            return service.get_route_progress(route_id)
        except Exception as e:
            logger.error(f"Error getting route state: {str(e)}")
            return None

    @database_sync_to_async
    def get_vehicle_position(self, vehicle_id):
        """Get latest position for a vehicle"""
        try:
            from .realtime_tracking import RealTimeTrackingService

            service = RealTimeTrackingService()
            return service.get_vehicle_position(vehicle_id, latest_only=True)
        except Exception as e:
            logger.error(f"Error getting vehicle position: {str(e)}")
            return None


class DriverAppConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for driver mobile app.

    Handles:
    - Real-time position updates from drivers
    - Route assignment notifications
    - Delivery instruction updates
    - Status confirmations
    """

    async def connect(self):
        """Handle driver app connection"""
        self.user = self.scope['user']

        # Require authentication
        if not self.user.is_authenticated:
            await self.close()
            return

        # Get driver associated with user
        self.driver = await self.get_driver_for_user()
        if not self.driver:
            await self.close()
            return

        # Join driver-specific group
        self.driver_group = f'driver_{self.driver.id}'
        await self.channel_layer.group_add(
            self.driver_group,
            self.channel_name
        )

        await self.accept()

        # Send connection confirmation with driver data
        await self.send(text_data=json.dumps({
            'type': 'connection_established',
            'driver_id': self.driver.id,
            'driver_name': self.driver.name,
            'message': 'Connected to driver app',
            'timestamp': timezone.now().isoformat()
        }))

        # Send current assigned route if any
        active_route = await self.get_active_route()
        if active_route:
            await self.send(text_data=json.dumps({
                'type': 'active_route',
                'data': active_route
            }))

        logger.info(f"Driver {self.driver.name} connected to driver app")

    async def disconnect(self, close_code):
        """Handle driver app disconnection"""
        if hasattr(self, 'driver_group'):
            await self.channel_layer.group_discard(
                self.driver_group,
                self.channel_name
            )

        if hasattr(self, 'driver'):
            logger.info(f"Driver {self.driver.name} disconnected from driver app")

    async def receive(self, text_data):
        """Handle incoming messages from driver app"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')

            if message_type == 'position_update':
                await self.handle_position_update(data)
            elif message_type == 'delivery_start':
                await self.handle_delivery_start(data)
            elif message_type == 'delivery_complete':
                await self.handle_delivery_complete(data)
            elif message_type == 'ping':
                await self.send(text_data=json.dumps({
                    'type': 'pong',
                    'timestamp': timezone.now().isoformat()
                }))
            else:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': f'Unknown message type: {message_type}'
                }))

        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid JSON format'
            }))
        except Exception as e:
            logger.error(f"Error handling driver app message: {str(e)}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Internal server error'
            }))

    async def handle_position_update(self, data):
        """Handle GPS position update from driver"""
        position_data = data.get('position', {})

        # Record position in database
        result = await self.record_position(
            latitude=position_data.get('latitude'),
            longitude=position_data.get('longitude'),
            speed=position_data.get('speed'),
            heading=position_data.get('heading'),
            accuracy=position_data.get('accuracy'),
            recorded_at=position_data.get('timestamp')
        )

        if result.get('success'):
            # Broadcast position to tracking consumers
            route_id = position_data.get('route_id')
            if route_id:
                await self.channel_layer.group_send(
                    f'route_{route_id}',
                    {
                        'type': 'position_update',
                        'data': {
                            'driver_id': self.driver.id,
                            'position': position_data,
                            'timestamp': timezone.now().isoformat()
                        }
                    }
                )

            # Send confirmation to driver
            await self.send(text_data=json.dumps({
                'type': 'position_recorded',
                'success': True,
                'geofence_events': result.get('geofence_events', [])
            }))
        else:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Failed to record position'
            }))

    async def handle_delivery_start(self, data):
        """Handle delivery start notification"""
        stop_id = data.get('stop_id')
        result = await self.mark_delivery_started(stop_id)

        if result:
            await self.send(text_data=json.dumps({
                'type': 'delivery_started',
                'stop_id': stop_id,
                'timestamp': timezone.now().isoformat()
            }))

            # Broadcast to route tracking
            route_id = data.get('route_id')
            if route_id:
                await self.channel_layer.group_send(
                    f'route_{route_id}',
                    {
                        'type': 'delivery_started',
                        'data': {
                            'stop_id': stop_id,
                            'driver_id': self.driver.id,
                            'timestamp': timezone.now().isoformat()
                        }
                    }
                )

    async def handle_delivery_complete(self, data):
        """Handle delivery completion notification"""
        stop_id = data.get('stop_id')
        delivery_data = data.get('delivery_data', {})

        result = await self.mark_delivery_completed(stop_id, delivery_data)

        if result:
            await self.send(text_data=json.dumps({
                'type': 'delivery_completed',
                'stop_id': stop_id,
                'success': True
            }))

            # Broadcast to route tracking
            route_id = data.get('route_id')
            if route_id:
                await self.channel_layer.group_send(
                    f'route_{route_id}',
                    {
                        'type': 'delivery_completed',
                        'data': {
                            'stop_id': stop_id,
                            'driver_id': self.driver.id,
                            'delivery_data': delivery_data,
                            'timestamp': timezone.now().isoformat()
                        }
                    }
                )

    # Message handlers for broadcasts to driver

    async def route_assigned(self, event):
        """Handle route assignment notification"""
        await self.send(text_data=json.dumps({
            'type': 'route_assigned',
            'data': event['data']
        }))

    async def route_updated(self, event):
        """Handle route update notification"""
        await self.send(text_data=json.dumps({
            'type': 'route_updated',
            'data': event['data']
        }))

    # Database operations

    @database_sync_to_async
    def get_driver_for_user(self):
        """Get driver instance for current user"""
        try:
            from driver.models import Driver
            return Driver.objects.get(user=self.user)
        except Driver.DoesNotExist:
            return None

    @database_sync_to_async
    def get_active_route(self):
        """Get active route assigned to driver"""
        try:
            from .models import Route
            from .serializers import RouteSerializer

            route = Route.objects.filter(
                driver=self.driver,
                status='active'
            ).first()

            if route:
                serializer = RouteSerializer(route)
                return serializer.data
            return None
        except Exception as e:
            logger.error(f"Error getting active route: {str(e)}")
            return None

    @database_sync_to_async
    def record_position(self, **kwargs):
        """Record GPS position in database"""
        try:
            from .realtime_tracking import RealTimeTrackingService

            service = RealTimeTrackingService()
            vehicle_id = self.driver.current_vehicle.id if hasattr(self.driver, 'current_vehicle') and self.driver.current_vehicle else None

            if not vehicle_id:
                return {'success': False, 'error': 'No vehicle assigned'}

            return service.record_position(
                vehicle_id=vehicle_id,
                driver_id=self.driver.id,
                **kwargs
            )
        except Exception as e:
            logger.error(f"Error recording position: {str(e)}")
            return {'success': False, 'error': str(e)}

    @database_sync_to_async
    def mark_delivery_started(self, stop_id):
        """Mark delivery as started"""
        try:
            from .models import RouteStop

            stop = RouteStop.objects.get(id=stop_id)
            stop.actual_arrival_time = timezone.now()
            stop.save(update_fields=['actual_arrival_time'])
            return True
        except Exception as e:
            logger.error(f"Error marking delivery started: {str(e)}")
            return False

    @database_sync_to_async
    def mark_delivery_completed(self, stop_id, delivery_data):
        """Mark delivery as completed"""
        try:
            from .models import RouteStop

            stop = RouteStop.objects.get(id=stop_id)
            stop.is_completed = True
            stop.actual_departure_time = timezone.now()

            # Update delivery data
            if 'quantity_delivered' in delivery_data:
                stop.quantity_delivered = delivery_data['quantity_delivered']
            if 'notes' in delivery_data:
                stop.delivery_notes = delivery_data['notes']
            if 'signature_captured' in delivery_data:
                stop.customer_signature_captured = delivery_data['signature_captured']
            if 'rating' in delivery_data:
                stop.delivery_rating = delivery_data['rating']

            # Calculate service time
            if stop.actual_arrival_time:
                service_duration = (stop.actual_departure_time - stop.actual_arrival_time).total_seconds() / 60.0
                stop.actual_service_time = int(service_duration)

            stop.save()

            # Update order status if linked
            if stop.order:
                stop.order.status = 'delivered'
                stop.order.actual_delivery_date = timezone.now()
                stop.order.save()

            return True
        except Exception as e:
            logger.error(f"Error marking delivery completed: {str(e)}")
            return False
