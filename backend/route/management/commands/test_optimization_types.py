"""
Management command to test all optimization types and verify they produce different results.

This command:
1. Tests all 5 optimization types (balanced, distance, duration, fuel_cost, co2_emissions)
2. Compares the results to see if they differ
3. Validates that Google Maps is actually using different optimization strategies

Usage:
    python manage.py test_optimization_types <route_id>
"""

from django.core.management.base import BaseCommand
from route.models import Route
from route.services import GoogleMapsService


class Command(BaseCommand):
    help = 'Test all optimization types to verify they produce different results'

    def add_arguments(self, parser):
        parser.add_argument(
            'route_id',
            type=int,
            help='Route ID to test optimization types on',
        )

    def handle(self, *args, **options):
        route_id = options['route_id']

        try:
            route = Route.objects.prefetch_related('stops').get(id=route_id)
        except Route.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'Route {route_id} not found'))
            return

        self.stdout.write(self.style.SUCCESS(f'\n{"="*80}'))
        self.stdout.write(self.style.SUCCESS(f'OPTIMIZATION TYPES COMPARISON TEST'))
        self.stdout.write(self.style.SUCCESS(f'{"="*80}\n'))

        self.stdout.write(f'Route: {route.name}')
        self.stdout.write(f'Route ID: {route.id}')
        self.stdout.write(f'Stops: {route.stops.count()}')
        self.stdout.write(f'Return to Warehouse: {route.return_to_warehouse}\n')

        # Build waypoints
        maps_service = GoogleMapsService()
        stops = list(route.stops.all().order_by('sequence_number'))
        warehouse = route.origin_warehouse

        if not warehouse or not warehouse.has_coordinates:
            self.stdout.write(self.style.ERROR('ERROR: No warehouse with coordinates found'))
            self.stdout.write('Run: python manage.py setup_warehouse')
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

        # Test all optimization types
        optimization_types = [
            ('balanced', 'Balanced (Distance & Time)'),
            ('distance', 'Shortest Distance'),
            ('duration', 'Fastest Time'),
            ('fuel_cost', 'Fuel Efficient'),
            ('co2_emissions', 'Low Emissions')
        ]

        results = {}

        self.stdout.write(f'{"="*80}')
        self.stdout.write(self.style.WARNING('TESTING ALL OPTIMIZATION TYPES\n'))

        for opt_type, opt_label in optimization_types:
            self.stdout.write(f'{"-"*80}')
            self.stdout.write(self.style.WARNING(f'Testing: {opt_label} ({opt_type})'))

            result = maps_service._optimize_waypoints(
                waypoints,
                optimization_type=opt_type,
                return_to_origin=route.return_to_warehouse
            )

            if result.get('success'):
                distance = result['total_distance']
                duration = result['total_duration']
                waypoint_order = result.get('waypoint_order', [])

                results[opt_type] = {
                    'label': opt_label,
                    'distance': distance,
                    'duration': duration,
                    'order': waypoint_order
                }

                self.stdout.write(self.style.SUCCESS(f'  ✓ Distance: {distance:.2f} km'))
                self.stdout.write(self.style.SUCCESS(f'  ✓ Duration: {duration:.2f} minutes'))
                self.stdout.write(f'  ✓ Waypoint Order: {waypoint_order}')

                # Show the actual stop sequence
                if waypoint_order:
                    self.stdout.write(f'\n  Stop Sequence:')
                    self.stdout.write(f'    1. Warehouse (origin)')
                    for new_idx, orig_idx in enumerate(waypoint_order, 2):
                        if orig_idx < len(stops):
                            stop = stops[orig_idx]
                            self.stdout.write(f'    {new_idx}. {stop.client.name}')
                    if route.return_to_warehouse:
                        self.stdout.write(f'    {len(waypoint_order) + 2}. Warehouse (return)')
            else:
                self.stdout.write(self.style.ERROR(f'  ✗ Failed: {result.get("error")}'))
                results[opt_type] = None

            self.stdout.write('')

        # Analysis: Compare results
        self.stdout.write(f'{"="*80}')
        self.stdout.write(self.style.WARNING('COMPARISON ANALYSIS\n'))

        # Check if all succeeded
        successful_results = {k: v for k, v in results.items() if v is not None}

        if len(successful_results) < len(optimization_types):
            self.stdout.write(self.style.ERROR(f'⚠ Only {len(successful_results)}/{len(optimization_types)} optimization types succeeded'))
            return

        # Compare distances
        self.stdout.write(self.style.WARNING('1. Distance Comparison:'))
        sorted_by_distance = sorted(successful_results.items(), key=lambda x: x[1]['distance'])
        for opt_type, data in sorted_by_distance:
            self.stdout.write(f'   {data["label"]:30} {data["distance"]:8.2f} km')

        distance_range = sorted_by_distance[-1][1]['distance'] - sorted_by_distance[0][1]['distance']
        self.stdout.write(f'\n   Distance Range: {distance_range:.2f} km')

        # Compare durations
        self.stdout.write(f'\n{"-"*80}')
        self.stdout.write(self.style.WARNING('2. Duration Comparison:'))
        sorted_by_duration = sorted(successful_results.items(), key=lambda x: x[1]['duration'])
        for opt_type, data in sorted_by_duration:
            self.stdout.write(f'   {data["label"]:30} {data["duration"]:8.2f} minutes')

        duration_range = sorted_by_duration[-1][1]['duration'] - sorted_by_duration[0][1]['duration']
        self.stdout.write(f'\n   Duration Range: {duration_range:.2f} minutes')

        # Compare waypoint orders
        self.stdout.write(f'\n{"-"*80}')
        self.stdout.write(self.style.WARNING('3. Waypoint Order Comparison:'))

        unique_orders = set()
        for opt_type, data in successful_results.items():
            order_tuple = tuple(data['order'])
            unique_orders.add(order_tuple)
            self.stdout.write(f'   {data["label"]:30} {data["order"]}')

        self.stdout.write(f'\n   Unique Order Combinations: {len(unique_orders)}')

        # Final verdict
        self.stdout.write(f'\n{"="*80}')
        self.stdout.write(self.style.WARNING('VERDICT\n'))

        if distance_range > 0.1 or duration_range > 0.1:
            self.stdout.write(self.style.SUCCESS('✓ OPTIMIZATION TYPES ARE WORKING!'))
            self.stdout.write('')
            self.stdout.write(f'  Different optimization types produce measurably different results:')
            self.stdout.write(f'    - Distance varies by {distance_range:.2f} km')
            self.stdout.write(f'    - Duration varies by {duration_range:.2f} minutes')
            self.stdout.write(f'    - {len(unique_orders)} unique stop order(s) found')

            if len(unique_orders) > 1:
                self.stdout.write('')
                self.stdout.write(self.style.SUCCESS('  ✓ Different optimization types recommend different stop sequences!'))
            else:
                self.stdout.write('')
                self.stdout.write(self.style.WARNING('  ⚠ All types recommend the same stop sequence (but different metrics)'))
        else:
            self.stdout.write(self.style.WARNING('⚠ OPTIMIZATION TYPES SHOW MINIMAL DIFFERENCES'))
            self.stdout.write('')
            self.stdout.write('  Possible reasons:')
            self.stdout.write('    1. Route is already optimally ordered for all criteria')
            self.stdout.write('    2. Geographic layout makes all orderings similar')
            self.stdout.write('    3. Google Maps API may be ignoring optimization_type parameter')
            self.stdout.write('')
            self.stdout.write('  Recommendations:')
            self.stdout.write('    - Test with a route that has more stops (8+)')
            self.stdout.write('    - Test with a route covering wider geographic area')
            self.stdout.write('    - Scramble the route first: python manage.py scramble_route_stops {route_id} --method worst')

        # Best choices
        self.stdout.write(f'\n{"-"*80}')
        self.stdout.write(self.style.WARNING('RECOMMENDATIONS FOR THIS ROUTE:\n'))

        shortest_distance_type = sorted_by_distance[0]
        fastest_time_type = sorted_by_duration[0]

        self.stdout.write(f'  🏆 Shortest Distance: {shortest_distance_type[1]["label"]}')
        self.stdout.write(f'     {shortest_distance_type[1]["distance"]:.2f} km, {shortest_distance_type[1]["duration"]:.2f} min')

        self.stdout.write(f'\n  ⚡ Fastest Time: {fastest_time_type[1]["label"]}')
        self.stdout.write(f'     {fastest_time_type[1]["distance"]:.2f} km, {fastest_time_type[1]["duration"]:.2f} min')

        self.stdout.write(f'\n{"="*80}')
        self.stdout.write(self.style.SUCCESS('TEST COMPLETE'))
        self.stdout.write(f'{"="*80}\n')
