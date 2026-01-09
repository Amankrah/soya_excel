"""
Management command to test optimization with one-way (non-round-trip) routes.

One-way routes should show more dramatic optimization savings since stop order
truly matters (unlike round-trips which form closed circuits).

Usage:
    python manage.py test_oneway_route <route_id>
"""

from django.core.management.base import BaseCommand
from route.models import Route
from route.services import GoogleMapsService


class Command(BaseCommand):
    help = 'Test route optimization with one-way (non-round-trip) configuration'

    def add_arguments(self, parser):
        parser.add_argument(
            'route_id',
            type=int,
            help='Route ID to test',
        )
        parser.add_argument(
            '--restore',
            action='store_true',
            help='Restore return_to_warehouse to True after test',
        )

    def handle(self, *args, **options):
        route_id = options['route_id']
        restore = options['restore']

        try:
            route = Route.objects.prefetch_related('stops').get(id=route_id)
        except Route.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'Route {route_id} not found'))
            return

        self.stdout.write(self.style.SUCCESS(f'\n{"="*70}'))
        self.stdout.write(self.style.SUCCESS(f'ONE-WAY ROUTE OPTIMIZATION TEST'))
        self.stdout.write(self.style.SUCCESS(f'{"="*70}\n'))

        # Store original setting
        original_return_to_warehouse = route.return_to_warehouse

        self.stdout.write(f'Route: {route.name}')
        self.stdout.write(f'Route ID: {route.id}')
        self.stdout.write(f'Stops: {route.stops.count()}')
        self.stdout.write(f'Current return_to_warehouse: {original_return_to_warehouse}\n')

        # Step 1: Test with round-trip (current state)
        self.stdout.write(self.style.WARNING('STEP 1: Testing Round-Trip Configuration'))
        self.stdout.write(f'  return_to_warehouse = True\n')

        maps_service = GoogleMapsService()

        # Build waypoints
        stops = route.stops.all().order_by('sequence_number')
        warehouse = route.origin_warehouse

        # Auto-assign warehouse if not set
        if not warehouse:
            from route.models import Warehouse
            warehouse = Warehouse.objects.filter(is_primary=True, is_active=True).first()
            if warehouse:
                route.origin_warehouse = warehouse
                route.save()
                self.stdout.write(self.style.SUCCESS(f'  ✓ Auto-assigned warehouse: {warehouse.name}\n'))
            else:
                self.stdout.write(self.style.ERROR('No primary warehouse found. Run: python manage.py setup_warehouse'))
                return

        if not warehouse.has_coordinates:
            self.stdout.write(self.style.ERROR(f'Warehouse {warehouse.name} has no coordinates'))
            self.stdout.write('Run: python manage.py setup_warehouse')
            return

        waypoints = []
        waypoints.append({
            'lat': float(warehouse.latitude),
            'lng': float(warehouse.longitude),
            'stop_id': 'warehouse_origin'
        })

        for stop in stops:
            coords = stop.get_coordinates()
            if coords:
                waypoints.append({
                    'lat': coords[0],
                    'lng': coords[1],
                    'stop_id': stop.id
                })

        # Round-trip: add warehouse at end
        waypoints.append({
            'lat': float(warehouse.latitude),
            'lng': float(warehouse.longitude),
            'stop_id': 'warehouse_destination'
        })

        # Calculate with current order (no optimization)
        roundtrip_current = maps_service._calculate_route_distance_no_optimization(
            waypoints, return_to_origin=True
        )

        # Calculate with optimized order
        roundtrip_optimized = maps_service._optimize_waypoints(
            waypoints, 'balanced', return_to_origin=True
        )

        if roundtrip_current['success'] and roundtrip_optimized['success']:
            rt_current_dist = roundtrip_current['total_distance']
            rt_optimized_dist = roundtrip_optimized['total_distance']
            rt_savings = rt_current_dist - rt_optimized_dist

            self.stdout.write(f'  Current order distance: {rt_current_dist:.2f} km')
            self.stdout.write(f'  Optimized order distance: {rt_optimized_dist:.2f} km')
            self.stdout.write(f'  Savings: {rt_savings:.2f} km\n')
        else:
            self.stdout.write(self.style.ERROR('  Failed to calculate round-trip distances\n'))
            return

        # Step 2: Test with one-way
        self.stdout.write(f'{"-"*70}')
        self.stdout.write(self.style.WARNING('STEP 2: Testing One-Way Configuration'))
        self.stdout.write(f'  return_to_warehouse = False\n')

        # One-way: remove warehouse from end
        oneway_waypoints = waypoints[:-1]

        # Calculate with current order (no optimization)
        oneway_current = maps_service._calculate_route_distance_no_optimization(
            oneway_waypoints, return_to_origin=False
        )

        # Calculate with optimized order
        oneway_optimized = maps_service._optimize_waypoints(
            oneway_waypoints, 'balanced', return_to_origin=False
        )

        if oneway_current['success'] and oneway_optimized['success']:
            ow_current_dist = oneway_current['total_distance']
            ow_optimized_dist = oneway_optimized['total_distance']
            ow_savings = ow_current_dist - ow_optimized_dist

            self.stdout.write(f'  Current order distance: {ow_current_dist:.2f} km')
            self.stdout.write(f'  Optimized order distance: {ow_optimized_dist:.2f} km')
            self.stdout.write(f'  Savings: {ow_savings:.2f} km\n')
        else:
            self.stdout.write(self.style.ERROR('  Failed to calculate one-way distances\n'))
            return

        # Step 3: Analysis
        self.stdout.write(f'{"-"*70}')
        self.stdout.write(self.style.WARNING('STEP 3: Comparison & Analysis\n'))

        self.stdout.write(f'  Round-Trip Savings: {rt_savings:.2f} km ({(rt_savings/rt_current_dist*100):.2f}%)')
        self.stdout.write(f'  One-Way Savings: {ow_savings:.2f} km ({(ow_savings/ow_current_dist*100):.2f}%)\n')

        if abs(ow_savings) > abs(rt_savings):
            diff = abs(ow_savings) - abs(rt_savings)
            self.stdout.write(self.style.SUCCESS(f'  ✓ One-way routes show {diff:.2f} km MORE savings!'))
            self.stdout.write(f'    This is expected - stop order matters more in one-way routes.')
        else:
            self.stdout.write(self.style.WARNING(f'  ⚠ Round-trip and one-way show similar savings'))
            self.stdout.write(f'    This suggests stops are in a geographic pattern where order')
            self.stdout.write(f'    doesn\'t significantly impact total distance.')

        # Show waypoint order changes
        rt_order = roundtrip_optimized.get('waypoint_order', [])
        ow_order = oneway_optimized.get('waypoint_order', [])

        self.stdout.write(f'\n  Round-Trip Waypoint Order: {rt_order}')
        self.stdout.write(f'  One-Way Waypoint Order: {ow_order}')

        if rt_order != ow_order:
            self.stdout.write(self.style.SUCCESS('\n  ✓ Different optimal orders for round-trip vs one-way!'))
        else:
            self.stdout.write('\n  Same optimal order for both configurations')

        # Step 4: Apply one-way test to actual route (optional)
        self.stdout.write(f'\n{"-"*70}')
        self.stdout.write(self.style.WARNING('STEP 4: Apply One-Way Configuration?'))

        if not restore:
            self.stdout.write('\n  To actually test optimization with one-way:')
            self.stdout.write(f'    1. python manage.py shell')
            self.stdout.write(f'    2. route = Route.objects.get(id={route_id})')
            self.stdout.write(f'    3. route.return_to_warehouse = False')
            self.stdout.write(f'    4. route.save()')
            self.stdout.write(f'    5. Then optimize via API or test_optimization_flow')
            self.stdout.write(f'\n  Or run this command again with --restore to auto-restore')

        self.stdout.write(f'\n{"="*70}')
        self.stdout.write(self.style.SUCCESS('TEST COMPLETE'))
        self.stdout.write(f'{"="*70}\n')
