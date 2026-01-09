"""
Real-time GPS Tracking Service for Soya Excel Routes

This module provides real-time vehicle position tracking with:
- GPS position updates from mobile devices
- Position history storage
- Geofencing and proximity detection
- Live tracking data broadcast
- Delivery progress monitoring
"""

import logging
from typing import Dict, List, Optional, Tuple
from decimal import Decimal
from datetime import datetime, timedelta
from django.db import models
from django.utils import timezone
from django.db.models import Q
from geopy.distance import geodesic

from .models import Route, RouteStop

logger = logging.getLogger(__name__)


class VehiclePosition(models.Model):
    """Model for storing GPS position updates from vehicles"""

    # Vehicle and driver
    vehicle = models.ForeignKey(
        'driver.Vehicle',
        on_delete=models.CASCADE,
        related_name='gps_positions'
    )
    driver = models.ForeignKey(
        'driver.Driver',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gps_positions'
    )
    route = models.ForeignKey(
        Route,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gps_positions'
    )

    # GPS coordinates
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    accuracy = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="GPS accuracy in meters"
    )
    altitude = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Altitude in meters"
    )

    # Movement data
    speed = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Speed in km/h"
    )
    heading = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Compass heading in degrees (0-360)"
    )

    # Timestamp and metadata
    timestamp = models.DateTimeField(auto_now_add=True)
    recorded_at = models.DateTimeField(
        help_text="Device timestamp when position was recorded"
    )

    # Status flags
    is_moving = models.BooleanField(default=True)
    is_ignition_on = models.BooleanField(default=True)
    battery_level = models.IntegerField(
        null=True,
        blank=True,
        help_text="Mobile device battery level (0-100)"
    )

    # Data source
    source = models.CharField(
        max_length=50,
        default='mobile_app',
        help_text="Source of position data (mobile_app, gps_device, etc.)"
    )

    class Meta:
        ordering = ['-recorded_at']
        indexes = [
            models.Index(fields=['vehicle', '-recorded_at']),
            models.Index(fields=['route', '-recorded_at']),
            models.Index(fields=['-recorded_at']),
        ]

    def __str__(self):
        return f"{self.vehicle} at {self.recorded_at}"

    @property
    def coordinates_tuple(self):
        """Get coordinates as tuple (lat, lng)"""
        return (float(self.latitude), float(self.longitude))


class GeofenceEvent(models.Model):
    """Model for tracking geofence entry/exit events"""

    EVENT_TYPE_CHOICES = [
        ('enter', 'Entered Geofence'),
        ('exit', 'Exited Geofence'),
        ('dwell', 'Dwelling in Geofence'),
    ]

    position = models.ForeignKey(
        VehiclePosition,
        on_delete=models.CASCADE,
        related_name='geofence_events'
    )
    route_stop = models.ForeignKey(
        RouteStop,
        on_delete=models.CASCADE,
        related_name='geofence_events'
    )

    event_type = models.CharField(max_length=10, choices=EVENT_TYPE_CHOICES)
    event_time = models.DateTimeField(auto_now_add=True)

    # Distance from geofence center
    distance_meters = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Distance from stop location in meters"
    )

    # Notification sent
    notification_sent = models.BooleanField(default=False)
    notification_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-event_time']

    def __str__(self):
        return f"{self.get_event_type_display()} - {self.route_stop} at {self.event_time}"


class RealTimeTrackingService:
    """
    Service for managing real-time GPS tracking and geofencing.

    Features:
    - Record GPS positions from mobile devices
    - Calculate proximity to delivery stops
    - Detect geofence entry/exit
    - Monitor delivery progress
    - Provide live tracking data
    """

    # Geofence radius in meters
    GEOFENCE_RADIUS_METERS = 100

    # Position update frequency (seconds)
    MIN_UPDATE_INTERVAL = 30

    def __init__(self):
        self.logger = logger

    def record_position(
        self,
        vehicle_id: int,
        latitude: float,
        longitude: float,
        driver_id: Optional[int] = None,
        route_id: Optional[int] = None,
        **kwargs
    ) -> Dict:
        """
        Record a GPS position update from a vehicle.

        Args:
            vehicle_id: Vehicle ID
            latitude: GPS latitude
            longitude: GPS longitude
            driver_id: Optional driver ID
            route_id: Optional route ID
            **kwargs: Additional position data (speed, heading, etc.)

        Returns:
            Dictionary with position data and geofence events
        """
        try:
            from driver.models import Vehicle, Driver

            vehicle = Vehicle.objects.get(id=vehicle_id)
            driver = Driver.objects.get(id=driver_id) if driver_id else None
            route = Route.objects.get(id=route_id) if route_id else None

            # Get recorded_at from kwargs or use current time
            recorded_at = kwargs.pop('recorded_at', timezone.now())
            if isinstance(recorded_at, str):
                from dateutil import parser
                recorded_at = parser.parse(recorded_at)

            # Create position record
            position = VehiclePosition.objects.create(
                vehicle=vehicle,
                driver=driver,
                route=route,
                latitude=Decimal(str(latitude)),
                longitude=Decimal(str(longitude)),
                recorded_at=recorded_at,
                speed=Decimal(str(kwargs.get('speed', 0))) if kwargs.get('speed') is not None else None,
                heading=Decimal(str(kwargs.get('heading', 0))) if kwargs.get('heading') is not None else None,
                accuracy=Decimal(str(kwargs.get('accuracy', 0))) if kwargs.get('accuracy') is not None else None,
                altitude=Decimal(str(kwargs.get('altitude', 0))) if kwargs.get('altitude') is not None else None,
                is_moving=kwargs.get('is_moving', True),
                is_ignition_on=kwargs.get('is_ignition_on', True),
                battery_level=kwargs.get('battery_level'),
                source=kwargs.get('source', 'mobile_app')
            )

            # Check for geofence events if route is active
            geofence_events = []
            if route and route.status == 'active':
                geofence_events = self._check_geofences(position, route)

            return {
                'success': True,
                'position_id': position.id,
                'timestamp': position.recorded_at.isoformat(),
                'geofence_events': geofence_events,
                'message': 'Position recorded successfully'
            }

        except Vehicle.DoesNotExist:
            return {'success': False, 'error': 'Vehicle not found'}
        except Driver.DoesNotExist:
            return {'success': False, 'error': 'Driver not found'}
        except Route.DoesNotExist:
            return {'success': False, 'error': 'Route not found'}
        except Exception as e:
            self.logger.error(f"Error recording position: {str(e)}")
            return {'success': False, 'error': str(e)}

    def _check_geofences(self, position: VehiclePosition, route: Route) -> List[Dict]:
        """
        Check if position triggers any geofence events.

        Args:
            position: VehiclePosition instance
            route: Route instance

        Returns:
            List of geofence event dictionaries
        """
        events = []

        try:
            # Get all incomplete stops for this route
            stops = route.stops.filter(is_completed=False).select_related('client')

            for stop in stops:
                stop_coords = stop.get_coordinates()
                if not stop_coords:
                    continue

                # Calculate distance to stop
                distance = geodesic(
                    position.coordinates_tuple,
                    stop_coords
                ).meters

                # Check if within geofence
                within_geofence = distance <= self.GEOFENCE_RADIUS_METERS

                # Check for previous event
                previous_event = GeofenceEvent.objects.filter(
                    route_stop=stop,
                    position__vehicle=position.vehicle
                ).order_by('-event_time').first()

                # Determine event type
                if within_geofence:
                    if not previous_event or previous_event.event_type == 'exit':
                        # Entering geofence
                        event = GeofenceEvent.objects.create(
                            position=position,
                            route_stop=stop,
                            event_type='enter',
                            distance_meters=Decimal(str(distance))
                        )

                        events.append({
                            'type': 'enter',
                            'stop_id': stop.id,
                            'stop_name': stop.client.name,
                            'distance_meters': distance,
                            'message': f'Arrived at {stop.client.name}'
                        })

                        # Update stop arrival time
                        if not stop.actual_arrival_time:
                            stop.actual_arrival_time = timezone.now()
                            stop.save(update_fields=['actual_arrival_time'])

                    elif previous_event and previous_event.event_type == 'enter':
                        # Still dwelling
                        dwell_time = (timezone.now() - previous_event.event_time).total_seconds() / 60.0

                        if dwell_time > 5:  # More than 5 minutes
                            event = GeofenceEvent.objects.create(
                                position=position,
                                route_stop=stop,
                                event_type='dwell',
                                distance_meters=Decimal(str(distance))
                            )

                            events.append({
                                'type': 'dwell',
                                'stop_id': stop.id,
                                'stop_name': stop.client.name,
                                'dwell_time_minutes': dwell_time,
                                'message': f'Delivering at {stop.client.name}'
                            })

                else:
                    if previous_event and previous_event.event_type in ['enter', 'dwell']:
                        # Exiting geofence
                        event = GeofenceEvent.objects.create(
                            position=position,
                            route_stop=stop,
                            event_type='exit',
                            distance_meters=Decimal(str(distance))
                        )

                        events.append({
                            'type': 'exit',
                            'stop_id': stop.id,
                            'stop_name': stop.client.name,
                            'distance_meters': distance,
                            'message': f'Departed from {stop.client.name}'
                        })

                        # Update stop departure time
                        if not stop.actual_departure_time:
                            stop.actual_departure_time = timezone.now()

                            # Calculate actual service time
                            if stop.actual_arrival_time:
                                service_duration = (stop.actual_departure_time - stop.actual_arrival_time).total_seconds() / 60.0
                                stop.actual_service_time = int(service_duration)

                            stop.save(update_fields=['actual_departure_time', 'actual_service_time'])

            return events

        except Exception as e:
            self.logger.error(f"Error checking geofences: {str(e)}")
            return []

    def get_vehicle_position(
        self,
        vehicle_id: int,
        latest_only: bool = True
    ) -> Optional[Dict]:
        """
        Get current or recent position for a vehicle.

        Args:
            vehicle_id: Vehicle ID
            latest_only: Return only the latest position

        Returns:
            Position data dictionary or None
        """
        try:
            from driver.models import Vehicle

            vehicle = Vehicle.objects.get(id=vehicle_id)

            if latest_only:
                position = VehiclePosition.objects.filter(
                    vehicle=vehicle
                ).order_by('-recorded_at').first()

                if position:
                    return self._format_position(position)
                return None
            else:
                # Return recent positions (last hour)
                cutoff_time = timezone.now() - timedelta(hours=1)
                positions = VehiclePosition.objects.filter(
                    vehicle=vehicle,
                    recorded_at__gte=cutoff_time
                ).order_by('-recorded_at')

                return [self._format_position(p) for p in positions]

        except Vehicle.DoesNotExist:
            return None
        except Exception as e:
            self.logger.error(f"Error getting vehicle position: {str(e)}")
            return None

    def get_active_vehicles(self, route_ids: Optional[List[int]] = None) -> List[Dict]:
        """
        Get all currently active vehicles with latest positions.

        Args:
            route_ids: Optional list of route IDs to filter by

        Returns:
            List of vehicle position dictionaries
        """
        try:
            # Get active routes
            routes_query = Route.objects.filter(status='active')
            if route_ids:
                routes_query = routes_query.filter(id__in=route_ids)

            active_routes = routes_query.select_related('origin_warehouse')

            vehicles = []
            cutoff_time = timezone.now() - timedelta(minutes=10)  # Last 10 minutes

            for route in active_routes:
                # Get latest position for this route
                latest_position = VehiclePosition.objects.filter(
                    route=route,
                    recorded_at__gte=cutoff_time
                ).select_related('vehicle', 'driver').order_by('-recorded_at').first()

                if latest_position:
                    position_data = self._format_position(latest_position)
                    position_data['route'] = {
                        'id': route.id,
                        'name': route.name,
                        'status': route.status,
                        'total_stops': route.stops.count(),
                        'completed_stops': route.stops.filter(is_completed=True).count()
                    }

                    # Get next stop
                    next_stop = route.stops.filter(
                        is_completed=False
                    ).order_by('sequence_number').first()

                    if next_stop:
                        position_data['next_stop'] = {
                            'id': next_stop.id,
                            'sequence': next_stop.sequence_number,
                            'client_name': next_stop.client.name,
                            'eta': next_stop.estimated_arrival_time.isoformat() if next_stop.estimated_arrival_time else None
                        }

                    vehicles.append(position_data)

            return vehicles

        except Exception as e:
            self.logger.error(f"Error getting active vehicles: {str(e)}")
            return []

    def get_route_progress(self, route_id: int) -> Dict:
        """
        Get delivery progress for a route.

        Args:
            route_id: Route ID

        Returns:
            Progress data dictionary
        """
        try:
            route = Route.objects.get(id=route_id)

            # Get all stops
            all_stops = route.stops.all().order_by('sequence_number')
            completed_stops = all_stops.filter(is_completed=True)
            pending_stops = all_stops.filter(is_completed=False)

            # Calculate progress percentage
            total_stops = all_stops.count()
            completed_count = completed_stops.count()
            progress_percentage = (completed_count / total_stops * 100) if total_stops > 0 else 0

            # Get current position
            latest_position = VehiclePosition.objects.filter(
                route=route
            ).order_by('-recorded_at').first()

            # Get next stop
            next_stop = pending_stops.first()

            # Calculate ETA to next stop (simplified)
            eta_minutes = None
            if next_stop and latest_position and next_stop.get_coordinates():
                distance = geodesic(
                    latest_position.coordinates_tuple,
                    next_stop.get_coordinates()
                ).kilometers

                # Assume average speed of 60 km/h
                avg_speed = 60.0
                eta_minutes = (distance / avg_speed) * 60

            return {
                'route_id': route.id,
                'route_name': route.name,
                'status': route.status,
                'total_stops': total_stops,
                'completed_stops': completed_count,
                'pending_stops': total_stops - completed_count,
                'progress_percentage': round(progress_percentage, 2),
                'current_position': self._format_position(latest_position) if latest_position else None,
                'next_stop': {
                    'id': next_stop.id,
                    'sequence': next_stop.sequence_number,
                    'client': next_stop.client.name,
                    'eta_minutes': round(eta_minutes, 1) if eta_minutes else None
                } if next_stop else None,
                'completed_stops_details': [
                    {
                        'id': stop.id,
                        'sequence': stop.sequence_number,
                        'client': stop.client.name,
                        'arrival_time': stop.actual_arrival_time.isoformat() if stop.actual_arrival_time else None,
                        'departure_time': stop.actual_departure_time.isoformat() if stop.actual_departure_time else None,
                        'service_time_minutes': stop.actual_service_time
                    }
                    for stop in completed_stops
                ]
            }

        except Route.DoesNotExist:
            return {'error': 'Route not found'}
        except Exception as e:
            self.logger.error(f"Error getting route progress: {str(e)}")
            return {'error': str(e)}

    def _format_position(self, position: VehiclePosition) -> Dict:
        """Format position data for API response"""
        return {
            'id': position.id,
            'vehicle_id': position.vehicle.id,
            'vehicle_name': str(position.vehicle),
            'driver_id': position.driver.id if position.driver else None,
            'driver_name': position.driver.name if position.driver else None,
            'latitude': float(position.latitude),
            'longitude': float(position.longitude),
            'speed': float(position.speed) if position.speed else 0,
            'heading': float(position.heading) if position.heading else 0,
            'accuracy': float(position.accuracy) if position.accuracy else None,
            'is_moving': position.is_moving,
            'timestamp': position.recorded_at.isoformat(),
            'battery_level': position.battery_level,
            'source': position.source
        }

    def cleanup_old_positions(self, days: int = 30) -> int:
        """
        Delete GPS positions older than specified days.

        Args:
            days: Number of days to keep

        Returns:
            Number of positions deleted
        """
        try:
            cutoff_date = timezone.now() - timedelta(days=days)
            deleted_count, _ = VehiclePosition.objects.filter(
                recorded_at__lt=cutoff_date
            ).delete()

            self.logger.info(f"Cleaned up {deleted_count} old GPS positions")
            return deleted_count

        except Exception as e:
            self.logger.error(f"Error cleaning up positions: {str(e)}")
            return 0
