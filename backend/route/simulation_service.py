"""
Route Simulation Service

Provides route simulation capabilities for visualizing vehicle movement
along optimized routes with stops on Google Maps in real-time.

Includes Scope 3 GHG emission tracking for environmental impact analysis.
"""

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional
import json

from django.utils import timezone
from .models import Route, RouteStop, Warehouse
from .scope3_emission_service import Scope3EmissionService
from .emission_interpretation_service import (
    EmissionInterpretationService,
    EmissionRecommendationEngine,
    evaluate_against_benchmark
)

logger = logging.getLogger(__name__)


class RouteSimulationService:
    """
    Service for simulating vehicle movement along routes

    Features:
    - Generate simulation waypoints from route data
    - Calculate vehicle positions at specific times
    - Support for multiple simulation speeds
    - Include all stops with ETA calculations
    """

    def __init__(self):
        self.logger = logger
        self.emission_service = Scope3EmissionService()

    def generate_simulation_data(
        self,
        route_id: int,
        simulation_speed: float = 1.0,
        include_return_journey: bool = True
    ) -> Dict:
        """
        Generate complete simulation data for a route

        Args:
            route_id: Route ID to simulate
            simulation_speed: Speed multiplier (1.0 = real-time, 2.0 = 2x speed)
            include_return_journey: Include return to warehouse

        Returns:
            Dictionary with simulation configuration and waypoints
        """
        try:
            route = Route.objects.select_related(
                'origin_warehouse',
                'destination_warehouse'
            ).prefetch_related(
                'stops__client',
                'deliveries__driver',
                'deliveries__vehicle'
            ).get(id=route_id)

            # Get ordered stops
            stops = route.stops.all().order_by('sequence_number')

            if not stops.exists():
                return {
                    'success': False,
                    'error': 'Route has no stops to simulate'
                }

            # Build simulation waypoints
            waypoints = []
            total_duration_seconds = 0
            cumulative_distance = 0

            # Calculate total distance and service time to determine travel time
            total_route_distance = float(route.total_distance) if route.total_distance else 0
            total_service_time_seconds = 0

            for stop in stops:
                service_time = (stop.estimated_service_time or 30) * 60
                total_service_time_seconds += service_time

            # Calculate total travel time from route's estimated_duration
            route_duration_seconds = route.estimated_duration * 60 if route.estimated_duration else 0
            total_travel_time_seconds = route_duration_seconds - total_service_time_seconds

            # Starting point - warehouse
            if route.origin_warehouse and route.origin_warehouse.has_coordinates:
                warehouse = route.origin_warehouse
                waypoints.append({
                    'id': f'warehouse_{warehouse.id}',
                    'type': 'warehouse',
                    'name': warehouse.name,
                    'address': warehouse.full_address,
                    'latitude': float(warehouse.latitude),
                    'longitude': float(warehouse.longitude),
                    'sequence': 0,
                    'arrival_time_seconds': 0,
                    'departure_time_seconds': 0,
                    'service_time_seconds': 0,
                    'cumulative_distance_km': 0,
                    'icon': 'warehouse',
                    'description': f'Starting point: {warehouse.name}'
                })

            # Add all delivery stops
            for stop in stops:
                coords = stop.get_coordinates()
                if not coords:
                    continue

                # Update cumulative distance BEFORE adding waypoint
                if stop.distance_from_previous:
                    cumulative_distance += float(stop.distance_from_previous)

                # Calculate travel time for this segment
                # Use duration_from_previous if available, otherwise estimate from distance proportion
                if stop.duration_from_previous and stop.duration_from_previous > 0:
                    segment_travel_time = stop.duration_from_previous * 60
                elif stop.distance_from_previous and total_route_distance > 0:
                    # Estimate travel time based on distance proportion
                    distance_proportion = float(stop.distance_from_previous) / total_route_distance
                    segment_travel_time = total_travel_time_seconds * distance_proportion
                else:
                    # Default: assume even distribution of travel time
                    segment_travel_time = total_travel_time_seconds / stops.count() if stops.count() > 0 else 0

                total_duration_seconds += segment_travel_time

                arrival_time = total_duration_seconds
                service_time = (stop.estimated_service_time or 30) * 60  # Convert to seconds
                departure_time = arrival_time + service_time

                # Calculate segment distance for speed calculation
                segment_distance = float(stop.distance_from_previous) if stop.distance_from_previous else 0
                
                # Add stop waypoint
                waypoints.append({
                    'id': f'stop_{stop.id}',
                    'type': 'delivery_stop',
                    'stop_id': stop.id,
                    'client_id': stop.client.id,
                    'name': stop.client.name,
                    'address': getattr(stop.client, 'full_address', f"{stop.client.city}, {stop.client.country}"),
                    'latitude': coords[0],
                    'longitude': coords[1],
                    'sequence': stop.sequence_number,
                    'arrival_time_seconds': arrival_time,
                    'departure_time_seconds': departure_time,
                    'service_time_seconds': service_time,
                    'cumulative_distance_km': cumulative_distance,
                    'segment_distance_km': segment_distance,  # Distance from previous stop (for speed calc)
                    'segment_duration_seconds': segment_travel_time,  # Travel time from previous (Google ETA)
                    'icon': 'delivery',
                    'quantity_to_deliver': float(stop.quantity_to_deliver) if stop.quantity_to_deliver else None,
                    'delivery_method': stop.delivery_method,
                    'description': f'Stop #{stop.sequence_number}: {stop.client.name}'
                })

                # Add service time to total
                total_duration_seconds += service_time

            # Add return to warehouse if configured
            if include_return_journey and route.return_to_warehouse and route.origin_warehouse and route.origin_warehouse.has_coordinates:
                warehouse = route.origin_warehouse

                # Estimate return journey time (use last stop's distance/duration as rough estimate)
                last_stop = stops.last()
                return_duration = (last_stop.duration_from_previous or 30) * 60  # seconds
                return_distance = float(last_stop.distance_from_previous) if last_stop.distance_from_previous else 10.0

                arrival_time = total_duration_seconds + return_duration
                cumulative_distance += return_distance

                waypoints.append({
                    'id': f'warehouse_return_{warehouse.id}',
                    'type': 'warehouse_return',
                    'name': f'{warehouse.name} (Return)',
                    'address': warehouse.full_address,
                    'latitude': float(warehouse.latitude),
                    'longitude': float(warehouse.longitude),
                    'sequence': stops.count() + 1,
                    'arrival_time_seconds': arrival_time,
                    'departure_time_seconds': arrival_time,
                    'service_time_seconds': 0,
                    'cumulative_distance_km': cumulative_distance,
                    'icon': 'warehouse',
                    'description': f'Return to: {warehouse.name}'
                })

                total_duration_seconds = arrival_time

            # Use route's estimated_duration if available (stored in minutes)
            if route.estimated_duration:
                # Route estimated_duration is in minutes, convert to seconds for consistency
                total_duration_seconds = route.estimated_duration * 60

            # Apply simulation speed to convert real duration to simulation duration
            adjusted_total_duration = total_duration_seconds / simulation_speed

            # Build route polyline coordinates for smooth path
            path_coordinates = []
            for wp in waypoints:
                path_coordinates.append({
                    'lat': wp['latitude'],
                    'lng': wp['longitude']
                })

            # Get driver and vehicle information from assigned delivery
            driver_info = None
            vehicle_info = None
            active_delivery = route.deliveries.filter(status__in=['assigned', 'in_progress']).first()

            if active_delivery:
                if active_delivery.driver:
                    # Safely get profile_photo if it exists
                    profile_photo_url = None
                    if hasattr(active_delivery.driver, 'profile_photo'):
                        try:
                            if active_delivery.driver.profile_photo:
                                profile_photo_url = active_delivery.driver.profile_photo.url
                        except:
                            pass

                    driver_info = {
                        'id': active_delivery.driver.id,
                        'name': active_delivery.driver.full_name,
                        'phone': active_delivery.driver.phone_number,
                        'license_number': active_delivery.driver.license_number,
                        'profile_photo': profile_photo_url
                    }

                if active_delivery.vehicle:
                    vehicle_info = {
                        'id': active_delivery.vehicle.id,
                        'vehicle_number': active_delivery.vehicle.vehicle_number,
                        'vehicle_type': active_delivery.vehicle.vehicle_type,
                        'make_model': active_delivery.vehicle.make_model,
                        'capacity_tonnes': float(active_delivery.vehicle.capacity_tonnes) if active_delivery.vehicle.capacity_tonnes else 0,
                        'license_plate': active_delivery.vehicle.license_plate,
                        'icon': '🚚'
                    }

            # Fallback vehicle info if no delivery assigned
            if not vehicle_info:
                vehicle_info = {
                    'type': route.assigned_vehicle_type or 'Delivery Truck',
                    'capacity_used_tonnes': float(route.total_capacity_used) if route.total_capacity_used else 0,
                    'icon': '🚚'
                }

            # Use route's total_distance if available, otherwise use cumulative from stops
            final_total_distance = float(route.total_distance) if route.total_distance else cumulative_distance

            # Calculate Scope 3 emissions for the route
            emissions_data = self._calculate_route_emissions(
                route=route,
                stops=stops,
                vehicle_info=vehicle_info,
                active_delivery=active_delivery,
                final_total_distance=final_total_distance,
                include_return_journey=include_return_journey
            )

            # Generate interpretation and recommendations if emissions were calculated successfully
            interpretation_data = None
            recommendations = None
            benchmarks = None

            if emissions_data and emissions_data.get('success'):
                try:
                    interpreter = EmissionInterpretationService(emissions_data)
                    recommender = EmissionRecommendationEngine(emissions_data)

                    interpretation_data = {
                        'summary': interpreter.generate_summary(),
                        'breakdown': interpreter.generate_breakdown_explanation(),
                        'utilization_insight': interpreter.generate_utilization_insight(),
                        'comparisons': interpreter.generate_comparison_context()
                    }

                    recommendations = recommender.generate_recommendations()

                    # Calculate fuel efficiency for benchmarking
                    fuel = emissions_data.get('estimated_fuel_liters', 0)
                    distance = final_total_distance
                    fuel_per_100km = (fuel / distance * 100) if distance > 0 else 0

                    benchmarks = {
                        'co2e_per_tonne': evaluate_against_benchmark(
                            emissions_data['kpi_metrics']['kg_co2e_per_tonne'],
                            'kg_co2e_per_tonne'
                        ),
                        'co2e_per_km': evaluate_against_benchmark(
                            emissions_data['kpi_metrics']['kg_co2e_per_km'],
                            'kg_co2e_per_km'
                        ),
                        'fuel_efficiency': evaluate_against_benchmark(
                            fuel_per_100km,
                            'fuel_efficiency_l_per_100km'
                        ),
                        'utilization': evaluate_against_benchmark(
                            emissions_data.get('vehicle_info', {}).get('utilization_pct', 0),
                            'utilization_pct'
                        ) if emissions_data.get('vehicle_info', {}).get('utilization_pct') else None
                    }
                except Exception as e:
                    self.logger.error(f"Error generating emission interpretations: {str(e)}")

            return {
                'success': True,
                'route_id': route.id,
                'route_name': route.name,
                'route_date': route.date.isoformat(),
                'route_status': route.status,
                'simulation_config': {
                    'speed_multiplier': simulation_speed,
                    'total_real_duration_seconds': total_duration_seconds,
                    'total_travel_time_seconds': total_travel_time_seconds,  # Excludes service time
                    'total_simulation_duration_seconds': adjusted_total_duration,
                    'total_distance_km': final_total_distance,
                    'total_stops': stops.count(),
                    'include_return': include_return_journey
                },
                'waypoints': waypoints,
                'path_coordinates': path_coordinates,
                'driver_info': driver_info,
                'vehicle_info': vehicle_info,
                'emissions_data': emissions_data,  # Scope 3 GHG emissions
                'interpretation': interpretation_data,  # Human-readable interpretations
                'recommendations': recommendations,  # Actionable recommendations
                'benchmarks': benchmarks,  # Industry benchmark comparisons
                'start_location': waypoints[0] if waypoints else None,
                'end_location': waypoints[-1] if waypoints else None,
                'instructions': self._get_simulation_instructions(route, simulation_speed)
            }

        except Route.DoesNotExist:
            return {
                'success': False,
                'error': 'Route not found'
            }
        except Exception as e:
            self.logger.error(f"Error generating simulation data: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def calculate_vehicle_position(
        self,
        simulation_data: Dict,
        elapsed_seconds: float
    ) -> Dict:
        """
        Calculate vehicle position at a specific time in the simulation

        Args:
            simulation_data: Simulation data from generate_simulation_data()
            elapsed_seconds: Time elapsed in simulation (real time * speed)

        Returns:
            Current vehicle state including position, next stop, progress
        """
        waypoints = simulation_data.get('waypoints', [])
        if not waypoints:
            return {
                'success': False,
                'error': 'No waypoints in simulation data'
            }

        # Find current segment
        current_waypoint_index = 0
        next_waypoint_index = 1

        for i, waypoint in enumerate(waypoints):
            if elapsed_seconds >= waypoint['departure_time_seconds']:
                current_waypoint_index = i
            else:
                break

        # Check if simulation is complete
        total_duration = simulation_data['simulation_config']['total_simulation_duration_seconds']
        if elapsed_seconds >= total_duration:
            final_waypoint = waypoints[-1]
            return {
                'success': True,
                'status': 'completed',
                'position': {
                    'latitude': final_waypoint['latitude'],
                    'longitude': final_waypoint['longitude']
                },
                'current_waypoint': final_waypoint,
                'next_waypoint': None,
                'progress_percentage': 100,
                'completed': True
            }

        # Vehicle is at a stop (servicing)
        current_waypoint = waypoints[current_waypoint_index]
        if elapsed_seconds >= current_waypoint['arrival_time_seconds'] and \
           elapsed_seconds < current_waypoint['departure_time_seconds']:
            return {
                'success': True,
                'status': 'at_stop',
                'position': {
                    'latitude': current_waypoint['latitude'],
                    'longitude': current_waypoint['longitude']
                },
                'current_waypoint': current_waypoint,
                'next_waypoint': waypoints[current_waypoint_index + 1] if current_waypoint_index + 1 < len(waypoints) else None,
                'progress_percentage': (elapsed_seconds / total_duration) * 100,
                'service_progress': ((elapsed_seconds - current_waypoint['arrival_time_seconds']) /
                                   current_waypoint['service_time_seconds']) * 100 if current_waypoint['service_time_seconds'] > 0 else 100,
                'completed': False
            }

        # Vehicle is in transit between stops
        if current_waypoint_index + 1 < len(waypoints):
            next_waypoint = waypoints[current_waypoint_index + 1]

            # Calculate progress between waypoints
            segment_start_time = current_waypoint['departure_time_seconds']
            segment_end_time = next_waypoint['arrival_time_seconds']
            segment_duration = segment_end_time - segment_start_time

            if segment_duration > 0:
                progress_in_segment = (elapsed_seconds - segment_start_time) / segment_duration
                progress_in_segment = max(0, min(1, progress_in_segment))

                # Interpolate position
                lat1 = current_waypoint['latitude']
                lng1 = current_waypoint['longitude']
                lat2 = next_waypoint['latitude']
                lng2 = next_waypoint['longitude']

                current_lat = lat1 + (lat2 - lat1) * progress_in_segment
                current_lng = lng1 + (lng2 - lng1) * progress_in_segment

                return {
                    'success': True,
                    'status': 'in_transit',
                    'position': {
                        'latitude': current_lat,
                        'longitude': current_lng
                    },
                    'current_waypoint': current_waypoint,
                    'next_waypoint': next_waypoint,
                    'progress_percentage': (elapsed_seconds / total_duration) * 100,
                    'segment_progress': progress_in_segment * 100,
                    'completed': False
                }

        # Fallback - return current waypoint position
        return {
            'success': True,
            'status': 'unknown',
            'position': {
                'latitude': current_waypoint['latitude'],
                'longitude': current_waypoint['longitude']
            },
            'current_waypoint': current_waypoint,
            'next_waypoint': None,
            'progress_percentage': (elapsed_seconds / total_duration) * 100,
            'completed': False
        }

    def get_current_status(
        self,
        waypoints: List[Dict],
        elapsed_seconds: float,
        total_duration_seconds: float
    ) -> Dict:
        """
        Determine current location and next stop based on elapsed time

        Args:
            waypoints: List of waypoint dictionaries
            elapsed_seconds: Time elapsed in REAL route time (not simulation time)
            total_duration_seconds: Total REAL route duration

        Returns:
            Dictionary with current_waypoint_index and next_stop_index
        """
        current_waypoint_idx = None
        next_stop_idx = None
        is_in_transit = False

        # Find which waypoint we're currently at or heading to
        for i, wp in enumerate(waypoints):
            # If we're at or servicing this waypoint (between arrival and departure)
            if elapsed_seconds >= wp['arrival_time_seconds'] and elapsed_seconds < wp['departure_time_seconds']:
                current_waypoint_idx = i
                is_in_transit = False

                # Find next delivery stop after this one (skip warehouse starts)
                for j in range(i + 1, len(waypoints)):
                    if waypoints[j]['type'] in ['delivery_stop', 'warehouse_return']:
                        next_stop_idx = j
                        break
                break
            # If we've left this waypoint, check if we're in transit to the next
            elif elapsed_seconds >= wp['departure_time_seconds']:
                if i + 1 < len(waypoints) and elapsed_seconds < waypoints[i + 1]['arrival_time_seconds']:
                    # In transit between this waypoint and the next
                    current_waypoint_idx = i  # Just left this waypoint
                    is_in_transit = True

                    # The "next stop" should be where we're heading (i+1 if it's a delivery stop)
                    # Otherwise keep looking ahead
                    for j in range(i + 1, len(waypoints)):
                        if waypoints[j]['type'] in ['delivery_stop', 'warehouse_return']:
                            next_stop_idx = j
                            break
                    break

        # If no current waypoint found, we're at the start (warehouse)
        if current_waypoint_idx is None and waypoints:
            current_waypoint_idx = 0
            is_in_transit = False

            # Find first delivery stop (not the warehouse)
            for j in range(1, len(waypoints)):
                if waypoints[j]['type'] == 'delivery_stop':
                    next_stop_idx = j
                    break

        return {
            'current_waypoint_index': current_waypoint_idx,
            'next_stop_index': next_stop_idx,
            'progress_percentage': (elapsed_seconds / total_duration_seconds * 100) if total_duration_seconds > 0 else 0,
            'is_in_transit': is_in_transit
        }

    def _calculate_route_emissions(
        self,
        route,
        stops,
        vehicle_info: Dict,
        active_delivery,
        final_total_distance: float,
        include_return_journey: bool
    ) -> Dict:
        """
        Calculate Scope 3 GHG emissions for the route

        Uses the Scope3EmissionService to estimate emissions based on:
        - Route distance and total mass delivered
        - Vehicle type and capacity from assigned delivery
        - Return journey if applicable
        """
        try:
            # Determine vehicle type and capacity
            vehicle_type = 'default_heavy_duty'
            vehicle_capacity = None

            if active_delivery and active_delivery.vehicle:
                # Use actual assigned vehicle
                vehicle_type = active_delivery.vehicle.vehicle_type
                vehicle_capacity = float(active_delivery.vehicle.capacity_tonnes) if active_delivery.vehicle.capacity_tonnes else None
            elif route.assigned_vehicle_type:
                # Use route's assigned vehicle type
                vehicle_type = route.assigned_vehicle_type

            # Calculate total mass to deliver
            total_mass = 0
            for stop in stops:
                if stop.quantity_to_deliver:
                    total_mass += float(stop.quantity_to_deliver)

            # If no mass data from stops, use route's total_capacity_used
            if total_mass == 0 and route.total_capacity_used:
                total_mass = float(route.total_capacity_used)

            # Build segment data for more accurate calculations
            # Each segment carries the remaining mass after previous deliveries
            segment_data = []
            remaining_mass = total_mass

            for stop in stops:
                if stop.distance_from_previous and stop.distance_from_previous > 0:
                    delivery_qty = float(stop.quantity_to_deliver) if stop.quantity_to_deliver else 0

                    segment_data.append({
                        'distance_km': float(stop.distance_from_previous),
                        'mass_tonnes': remaining_mass,  # Carry remaining mass
                    })

                    # Reduce remaining mass after delivery
                    remaining_mass = max(0, remaining_mass - delivery_qty)

            # Calculate emissions using the emission service
            # NOTE: final_total_distance from route.total_distance already includes return trip
            # (calculated by Google Maps with warehouse as destination when return_to_warehouse=True)
            emissions_result = self.emission_service.calculate_route_emissions(
                route_distance_km=final_total_distance,
                total_mass_tonnes=total_mass,
                vehicle_type=vehicle_type,
                vehicle_capacity_tonnes=vehicle_capacity,
                return_to_origin=include_return_journey,
                segment_data=segment_data if segment_data else None,
                distance_includes_return=True  # Route distance from Google Maps includes return trip
            )

            if emissions_result['success']:
                return {
                    'success': True,
                    'total_emissions_kg_co2e': emissions_result['total_emissions_kg_co2e'],
                    'total_emissions_tonnes_co2e': emissions_result['total_emissions_tonnes_co2e'],
                    'delivery_emissions_kg_co2e': emissions_result['delivery_emissions_kg_co2e'],
                    'return_emissions_kg_co2e': emissions_result['return_emissions_kg_co2e'],
                    'estimated_fuel_liters': emissions_result['route_summary']['estimated_fuel_liters'],
                    'kpi_metrics': emissions_result['kpi_metrics'],
                    'methodology': emissions_result['methodology'],
                    'standard': emissions_result['standard'],
                    'route_summary': emissions_result['route_summary'],  # Include full route_summary for interpretation service
                    'vehicle_info': {
                        'vehicle_type': vehicle_type,
                        'capacity_tonnes': vehicle_capacity,
                        'total_mass_tonnes': total_mass,
                        'utilization_pct': (total_mass / vehicle_capacity * 100) if vehicle_capacity and vehicle_capacity > 0 else None
                    }
                }
            else:
                return {
                    'success': False,
                    'error': emissions_result.get('error', 'Unknown error'),
                    'total_emissions_kg_co2e': 0
                }

        except Exception as e:
            self.logger.error(f"Error calculating route emissions: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'total_emissions_kg_co2e': 0
            }

    def _get_simulation_instructions(self, route: Route, speed: float) -> str:
        """Generate user-friendly simulation instructions"""
        speed_desc = "real-time" if speed == 1.0 else f"{speed}x speed"

        return (
            f"This simulation shows the vehicle following the optimized route "
            f"'{route.name}' at {speed_desc}. "
            f"Watch as the vehicle visits each stop in sequence, with service times "
            f"at each location. Total route distance: "
            f"{float(route.total_distance) if route.total_distance else 'N/A'} km."
        )
