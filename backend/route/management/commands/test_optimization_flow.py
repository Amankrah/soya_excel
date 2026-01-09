"""
Management command to test and investigate route optimization flow.

This command helps understand:
1. What distance values are captured before/after optimization
2. Whether Google Maps is actually optimizing waypoint order
3. Why distance savings are showing as 0

Usage:
    python manage.py test_optimization_flow <route_id>
"""

from django.core.management.base import BaseCommand
from decimal import Decimal
from route.models import Route, RouteOptimization
from route.services import GoogleMapsService


class Command(BaseCommand):
    help = 'Test route optimization flow to investigate distance savings calculation'

    def add_arguments(self, parser):
        parser.add_argument(
            'route_id',
            type=int,
            help='Route ID to test optimization on',
        )

    def handle(self, *args, **options):
        route_id = options['route_id']

        try:
            route = Route.objects.prefetch_related('stops').get(id=route_id)
        except Route.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'Route {route_id} not found'))
            return

        self.stdout.write(self.style.SUCCESS(f'\n{"="*70}'))
        self.stdout.write(self.style.SUCCESS(f'ROUTE OPTIMIZATION FLOW TEST'))
        self.stdout.write(self.style.SUCCESS(f'{"="*70}\n'))

        # Step 1: Show current route state
        self.stdout.write(self.style.WARNING('STEP 1: Current Route State'))
        self.stdout.write(f'  Route Name: {route.name}')
        self.stdout.write(f'  Route ID: {route.id}')
        self.stdout.write(f'  Total Distance: {route.total_distance} km')
        self.stdout.write(f'  Estimated Duration: {route.estimated_duration} minutes')
        self.stdout.write(f'  Number of Stops: {route.stops.count()}')
        self.stdout.write(f'  Return to Warehouse: {route.return_to_warehouse}')

        # Show stop sequence
        stops = list(route.stops.all().order_by('sequence_number'))
        self.stdout.write(f'\n  Current Stop Sequence:')
        for stop in stops:
            coords = stop.get_coordinates()
            coord_str = f'({coords[0]:.6f}, {coords[1]:.6f})' if coords else 'NO COORDS'
            self.stdout.write(f'    {stop.sequence_number}. {stop.client.name} - {coord_str}')

        # Build waypoints
        maps_service = GoogleMapsService()
        warehouse = route.origin_warehouse

        if not warehouse or not warehouse.has_coordinates:
            self.stdout.write(self.style.ERROR('\n  ERROR: No warehouse with coordinates found'))
            self.stdout.write('  Run: python manage.py setup_warehouse')
            return

        waypoints = []
        waypoints.append({
            'lat': float(warehouse.latitude),
            'lng': float(warehouse.longitude),
            'stop_id': 'warehouse_origin',
            'is_warehouse': True
        })

        for stop in stops:
            coords = stop.get_coordinates()
            if coords:
                waypoints.append({
                    'lat': coords[0],
                    'lng': coords[1],
                    'stop_id': stop.id,
                    'is_warehouse': False
                })

        if route.return_to_warehouse:
            waypoints.append({
                'lat': float(warehouse.latitude),
                'lng': float(warehouse.longitude),
                'stop_id': 'warehouse_destination',
                'is_warehouse': True
            })

        # Step 2: Calculate "unoptimized" distance (current order as-is)
        self.stdout.write(f'\n{"-"*70}')
        self.stdout.write(self.style.WARNING('STEP 2: Calculate Current Order Distance'))
        self.stdout.write(f'  Calculating distance with CURRENT order (optimize_waypoints=False)...')

        # FIX: Use _calculate_route_distance_no_optimization for baseline!
        unoptimized_result = maps_service._calculate_route_distance_no_optimization(
            waypoints,
            return_to_origin=route.return_to_warehouse
        )

        if unoptimized_result.get('success'):
            unoptimized_distance = unoptimized_result['total_distance']
            unoptimized_duration = unoptimized_result['total_duration']
            self.stdout.write(self.style.SUCCESS(f'  ✓ Current Order Distance: {unoptimized_distance:.2f} km'))
            self.stdout.write(self.style.SUCCESS(f'  ✓ Current Order Duration: {unoptimized_duration:.2f} minutes'))
        else:
            self.stdout.write(self.style.ERROR(f'  ✗ Failed: {unoptimized_result.get("error")}'))
            return

        # Step 3: Calculate optimized distance (let Google optimize)
        self.stdout.write(f'\n{"-"*70}')
        self.stdout.write(self.style.WARNING('STEP 3: Calculate Optimized Order Distance'))
        self.stdout.write(f'  Calculating distance with OPTIMIZED order (optimize_waypoints=True)...')

        # Use _optimize_waypoints which calls Google's optimize_waypoints=True
        optimized_result = maps_service._optimize_waypoints(
            waypoints,
            return_to_origin=route.return_to_warehouse
        )

        if optimized_result.get('success'):
            optimized_distance = optimized_result['total_distance']
            optimized_duration = optimized_result['total_duration']
            waypoint_order = optimized_result.get('waypoint_order', [])

            self.stdout.write(self.style.SUCCESS(f'  ✓ Optimized Distance: {optimized_distance:.2f} km'))
            self.stdout.write(self.style.SUCCESS(f'  ✓ Optimized Duration: {optimized_duration:.2f} minutes'))
            self.stdout.write(f'  Google Maps Waypoint Order: {waypoint_order}')

            # Show what the optimized sequence would be
            if waypoint_order:
                self.stdout.write(f'\n  Optimized Stop Sequence (suggested by Google):')
                self.stdout.write(f'    1. Warehouse (origin)')

                # Intermediate stops reordered based on waypoint_order
                for new_idx, orig_idx in enumerate(waypoint_order, 2):
                    if orig_idx < len(stops):
                        stop = stops[orig_idx]
                        self.stdout.write(f'    {new_idx}. {stop.client.name}')

                if route.return_to_warehouse:
                    self.stdout.write(f'    {len(waypoint_order) + 2}. Warehouse (return)')
        else:
            self.stdout.write(self.style.ERROR(f'  ✗ Failed: {optimized_result.get("error")}'))
            return

        # Step 4: Calculate savings
        self.stdout.write(f'\n{"-"*70}')
        self.stdout.write(self.style.WARNING('STEP 4: Calculate Potential Savings'))

        distance_savings = max(0, unoptimized_distance - optimized_distance)
        time_savings = max(0, int(unoptimized_duration - optimized_duration))
        savings_percentage = (distance_savings / unoptimized_distance) * 100 if unoptimized_distance > 0 else 0

        self.stdout.write(f'  Original Distance: {unoptimized_distance:.2f} km')
        self.stdout.write(f'  Optimized Distance: {optimized_distance:.2f} km')
        self.stdout.write(f'  Distance Savings: {distance_savings:.2f} km ({savings_percentage:.1f}%)')
        self.stdout.write(f'  Time Savings: {time_savings} minutes')

        if distance_savings > 0:
            self.stdout.write(self.style.SUCCESS(f'\n  ✓ Optimization would save {distance_savings:.2f} km ({savings_percentage:.1f}%)!'))
        else:
            self.stdout.write(self.style.WARNING(f'\n  ⚠ Current order is already optimal or near-optimal'))
            self.stdout.write(f'     Google Maps found no better route order.')

        # Step 5: Show what's currently in the optimization history
        self.stdout.write(f'\n{"-"*70}')
        self.stdout.write(self.style.WARNING('STEP 5: Optimization History for this Route'))

        optimizations = RouteOptimization.objects.filter(route=route).order_by('-created_at')[:5]

        if optimizations.exists():
            self.stdout.write(f'  Found {RouteOptimization.objects.filter(route=route).count()} optimization record(s):\n')
            for opt in optimizations:
                self.stdout.write(f'  Optimization #{opt.id} ({opt.created_at.strftime("%Y-%m-%d %H:%M")}):')
                self.stdout.write(f'    Type: {opt.optimization_type}')
                self.stdout.write(f'    Original Distance: {opt.original_distance} km')
                self.stdout.write(f'    Optimized Distance: {opt.optimized_distance} km')
                self.stdout.write(f'    Distance Savings: {opt.distance_savings} km')
                self.stdout.write(f'    Time Savings: {opt.time_savings} minutes')
                self.stdout.write(f'    Success: {opt.success}')
                self.stdout.write('')
        else:
            self.stdout.write(f'  No optimization history found for this route')

        # Step 6: Verify the fix
        self.stdout.write(f'\n{"-"*70}')
        self.stdout.write(self.style.WARNING('STEP 6: Verification'))
        self.stdout.write('')
        
        if distance_savings > 0:
            self.stdout.write(self.style.SUCCESS('  ✓ OPTIMIZATION IS WORKING CORRECTLY!'))
            self.stdout.write('')
            self.stdout.write(f'  The services.py optimize_route() method correctly:')
            self.stdout.write(f'    1. Calculates baseline with _calculate_route_distance_no_optimization()')
            self.stdout.write(f'    2. Calculates optimized with _optimize_waypoints()')
            self.stdout.write(f'    3. Computes savings as the difference')
            self.stdout.write('')
            self.stdout.write(f'  Your API endpoint should return these savings when called.')
        else:
            self.stdout.write(self.style.WARNING('  Current stop order appears optimal'))
            self.stdout.write('')
            self.stdout.write(f'  To test with a suboptimal order:')
            self.stdout.write(f'    python manage.py scramble_route_stops {route_id} --method worst')
            self.stdout.write(f'    python manage.py test_optimization_flow {route_id}')

        self.stdout.write(f'\n{"="*70}')
        self.stdout.write(self.style.SUCCESS('TEST COMPLETE'))
        self.stdout.write(f'{"="*70}\n')