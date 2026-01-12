"""
Management command to fix missing distance/duration data on route stops.

This command fetches Google Maps Directions data and populates:
- distance_from_previous (km)
- duration_from_previous (minutes)

Usage:
    python manage.py fix_route_distances              # Fix all routes with missing data
    python manage.py fix_route_distances --route_id 4 # Fix specific route
    python manage.py fix_route_distances --dry-run    # Preview without making changes
"""

import os
import googlemaps
from django.core.management.base import BaseCommand
from django.conf import settings
from decimal import Decimal
from route.models import Route, RouteStop, Warehouse


class Command(BaseCommand):
    help = 'Fix missing distance/duration data on route stops using Google Maps'

    def add_arguments(self, parser):
        parser.add_argument(
            '--route_id',
            type=int,
            help='Specific route ID to fix (default: all routes with missing data)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview changes without saving to database'
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Re-fetch data even if already populated'
        )

    def handle(self, *args, **options):
        route_id = options.get('route_id')
        dry_run = options.get('dry_run', False)
        force = options.get('force', False)

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be saved'))

        # Get routes to process
        if route_id:
            routes = Route.objects.filter(id=route_id)
            if not routes.exists():
                self.stdout.write(self.style.ERROR(f'Route {route_id} not found'))
                return
        else:
            # Find routes with stops missing distance/duration data
            routes = Route.objects.filter(
                stops__distance_from_previous__isnull=True
            ).distinct()
            
            if not force:
                self.stdout.write(f'Found {routes.count()} routes with missing distance data')

        if not routes.exists():
            self.stdout.write(self.style.SUCCESS('All routes have complete distance data!'))
            return

        # Initialize Google Maps client directly (to get raw response with values)
        api_key = getattr(settings, 'GOOGLE_MAPS_API_KEY', None) or os.environ.get('GOOGLE_MAPS_API_KEY')
        if not api_key:
            self.stdout.write(self.style.ERROR('GOOGLE_MAPS_API_KEY not configured'))
            return
        
        try:
            gmaps_client = googlemaps.Client(key=api_key)
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Failed to initialize Google Maps: {e}'))
            return

        total_fixed = 0
        total_errors = 0

        for route in routes:
            self.stdout.write(f'\n{"="*60}')
            self.stdout.write(f'Processing Route {route.id}: {route.name}')
            self.stdout.write(f'{"="*60}')

            try:
                result = self.fix_route_distances(route, gmaps_client, dry_run, force)
                if result['success']:
                    total_fixed += 1
                    self.stdout.write(self.style.SUCCESS(f'✅ Fixed {result["stops_updated"]} stops'))
                else:
                    total_errors += 1
                    self.stdout.write(self.style.ERROR(f'❌ Error: {result["error"]}'))
            except Exception as e:
                total_errors += 1
                self.stdout.write(self.style.ERROR(f'❌ Exception: {str(e)}'))
                import traceback
                self.stdout.write(traceback.format_exc())

        # Summary
        self.stdout.write(f'\n{"="*60}')
        self.stdout.write('SUMMARY')
        self.stdout.write(f'{"="*60}')
        self.stdout.write(f'Routes processed: {routes.count()}')
        self.stdout.write(self.style.SUCCESS(f'Routes fixed: {total_fixed}'))
        if total_errors:
            self.stdout.write(self.style.ERROR(f'Routes with errors: {total_errors}'))

    def fix_route_distances(self, route, gmaps_client, dry_run=False, force=False):
        """
        Fix distance/duration data for a single route using Google Maps Directions API
        """
        stops = list(route.stops.all().order_by('sequence_number'))
        
        if not stops:
            return {'success': False, 'error': 'Route has no stops'}

        # Get warehouse (origin)
        warehouse = route.origin_warehouse
        if not warehouse:
            warehouse = Warehouse.objects.filter(is_primary=True, is_active=True).first()
        
        if not warehouse or not warehouse.has_coordinates:
            return {'success': False, 'error': 'No warehouse with coordinates found'}

        # Build waypoints list: warehouse -> all stops -> warehouse (if return)
        waypoints = []
        
        # Origin: warehouse
        origin = f"{warehouse.latitude},{warehouse.longitude}"
        waypoints.append(origin)
        
        # Add all stops
        for stop in stops:
            coords = stop.get_coordinates()
            if coords:
                waypoints.append(f"{coords[0]},{coords[1]}")
            else:
                self.stdout.write(self.style.WARNING(
                    f'  ⚠️  Stop {stop.sequence_number} ({stop.client.name}) has no coordinates - skipping'
                ))

        # Destination: back to warehouse if return_to_warehouse
        if route.return_to_warehouse:
            dest_warehouse = route.destination_warehouse or warehouse
            destination = f"{dest_warehouse.latitude},{dest_warehouse.longitude}"
        else:
            destination = waypoints[-1]  # Last stop is destination

        self.stdout.write(f'  Waypoints: {len(waypoints)} (including warehouse)')
        self.stdout.write(f'  Origin: {origin}')
        self.stdout.write(f'  Destination: {destination}')

        # Get RAW directions from Google Maps (not through GoogleMapsService which formats it)
        try:
            # Build intermediate waypoints (excluding origin and destination)
            intermediate_waypoints = waypoints[1:-1] if len(waypoints) > 2 else None
            
            # Call Google Maps API directly to get raw response
            directions_result = gmaps_client.directions(
                origin=origin,
                destination=destination,
                waypoints=intermediate_waypoints,
                optimize_waypoints=False,  # Keep current order
                mode='driving',
                region='ca',
                units='metric'
            )
        except Exception as e:
            return {'success': False, 'error': f'Google Maps API error: {str(e)}'}

        if not directions_result:
            return {'success': False, 'error': 'No directions returned from Google Maps'}

        # Get legs from the first route
        directions = directions_result[0]
        legs = directions.get('legs', [])
        
        self.stdout.write(f'  Google Maps returned {len(legs)} legs')

        # Update stops with distance/duration from each leg
        stops_updated = 0
        
        for idx, leg in enumerate(legs):
            # First leg (idx=0) is warehouse -> first stop
            # So leg[idx] corresponds to stops[idx]
            if idx < len(stops):
                stop = stops[idx]
                
                # Extract distance and duration from RAW response
                # Raw format: {'distance': {'text': '157 km', 'value': 157000}, 'duration': {...}}
                distance_meters = leg.get('distance', {}).get('value', 0)
                duration_seconds = leg.get('duration', {}).get('value', 0)
                
                distance_km = distance_meters / 1000.0
                duration_minutes = duration_seconds / 60.0
                
                # Calculate speed for display
                speed_kmh = 0
                if duration_minutes > 0:
                    speed_kmh = distance_km / (duration_minutes / 60)
                
                # Check if we need to update
                needs_update = force or (
                    stop.distance_from_previous is None or 
                    stop.duration_from_previous is None or
                    float(stop.distance_from_previous or 0) == 0 or
                    (stop.duration_from_previous or 0) == 0
                )
                
                if needs_update:
                    self.stdout.write(
                        f'  Stop {stop.sequence_number} ({stop.client.name}): '
                        f'{distance_km:.2f} km, {duration_minutes:.1f} min '
                        f'(Speed: {speed_kmh:.1f} km/h)'
                    )
                    
                    if not dry_run:
                        stop.distance_from_previous = Decimal(str(round(distance_km, 2)))
                        stop.duration_from_previous = int(round(duration_minutes))
                        stop.save(update_fields=['distance_from_previous', 'duration_from_previous'])
                    
                    stops_updated += 1
                else:
                    self.stdout.write(
                        f'  Stop {stop.sequence_number} ({stop.client.name}): '
                        f'Already has data ({stop.distance_from_previous} km, {stop.duration_from_previous} min)'
                    )

        return {
            'success': True,
            'stops_updated': stops_updated,
            'legs_count': len(legs)
        }

