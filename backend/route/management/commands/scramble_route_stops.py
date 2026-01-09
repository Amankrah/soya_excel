"""
Management command to intentionally scramble a route's stop order.

This is useful for testing route optimization - by creating a deliberately
inefficient stop sequence, we can verify that the optimization algorithm
actually improves the route and calculates savings correctly.

Usage:
    python manage.py scramble_route_stops <route_id>
    python manage.py scramble_route_stops <route_id> --method reverse
    python manage.py scramble_route_stops <route_id> --method random
"""

import random
from django.core.management.base import BaseCommand
from route.models import Route


class Command(BaseCommand):
    help = 'Scramble route stop order to test optimization (creates intentionally bad ordering)'

    def add_arguments(self, parser):
        parser.add_argument(
            'route_id',
            type=int,
            help='Route ID to scramble',
        )
        parser.add_argument(
            '--method',
            type=str,
            choices=['reverse', 'random', 'worst'],
            default='reverse',
            help='Scrambling method: reverse (reverse order), random (shuffle), worst (geographic worst case)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without actually changing anything',
        )

    def handle(self, *args, **options):
        route_id = options['route_id']
        method = options['method']
        dry_run = options['dry_run']

        try:
            route = Route.objects.prefetch_related('stops__client').get(id=route_id)
        except Route.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'Route {route_id} not found'))
            return

        stops = list(route.stops.all().order_by('sequence_number'))

        if len(stops) < 2:
            self.stdout.write(self.style.ERROR('Route must have at least 2 stops to scramble'))
            return

        self.stdout.write(self.style.SUCCESS(f'\n{"="*70}'))
        self.stdout.write(self.style.SUCCESS(f'ROUTE STOP SCRAMBLER'))
        self.stdout.write(self.style.SUCCESS(f'{"="*70}\n'))

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made\n'))

        self.stdout.write(f'Route: {route.name}')
        self.stdout.write(f'Route ID: {route.id}')
        self.stdout.write(f'Current Distance: {route.total_distance} km')
        self.stdout.write(f'Number of Stops: {len(stops)}')
        self.stdout.write(f'Scramble Method: {method}\n')

        # Show current order
        self.stdout.write(self.style.WARNING('CURRENT STOP ORDER:'))
        for stop in stops:
            self.stdout.write(f'  {stop.sequence_number}. {stop.client.name}')

        # Apply scrambling method
        if method == 'reverse':
            new_order = list(reversed(stops))
            self.stdout.write(f'\n{"-"*70}')
            self.stdout.write(self.style.WARNING('REVERSING stop order (often creates inefficient routes)'))

        elif method == 'random':
            new_order = stops.copy()
            random.shuffle(new_order)
            self.stdout.write(f'\n{"-"*70}')
            self.stdout.write(self.style.WARNING('RANDOMIZING stop order'))

        elif method == 'worst':
            # Try to create worst-case: alternate between distant points
            new_order = self._create_worst_case_order(stops)
            self.stdout.write(f'\n{"-"*70}')
            self.stdout.write(self.style.WARNING('Creating WORST-CASE order (alternating distant stops)'))

        # Show new order
        self.stdout.write(f'\nNEW STOP ORDER:')
        for i, stop in enumerate(new_order, 1):
            self.stdout.write(f'  {i}. {stop.client.name}')

        # Apply changes
        if not dry_run:
            self.stdout.write(f'\n{"-"*70}')
            self.stdout.write('Updating stop sequence numbers...')

            # Step 1: Temporarily set all sequence numbers to negative values to avoid conflicts
            # (due to UNIQUE constraint on route_id, sequence_number)
            for i, stop in enumerate(new_order):
                stop.sequence_number = -(i + 1000)  # Negative temporary values
                stop.save(update_fields=['sequence_number'])

            # Step 2: Now set the actual new sequence numbers
            for i, stop in enumerate(new_order, 1):
                stop.sequence_number = i
                stop.save(update_fields=['sequence_number'])

            self.stdout.write(self.style.SUCCESS('✓ Route stops have been scrambled!'))
            self.stdout.write('')
            self.stdout.write('Next steps:')
            self.stdout.write(f'  1. Run: python manage.py test_optimization_flow {route_id}')
            self.stdout.write(f'  2. Or optimize via API: POST /api/routes/{route_id}/optimize/')
            self.stdout.write('')
            self.stdout.write('You should now see measurable distance savings from optimization!')

        else:
            self.stdout.write(f'\n{"-"*70}')
            self.stdout.write(self.style.WARNING('DRY RUN - No changes were made'))
            self.stdout.write('Run without --dry-run to apply the scrambling')

        self.stdout.write(f'\n{"="*70}\n')

    def _create_worst_case_order(self, stops):
        """
        Create a worst-case ordering by alternating between distant points.

        Strategy:
        - Calculate distances between all stops
        - Pick first stop
        - Next pick the FARTHEST stop from current
        - Continue alternating between close and far
        """
        if len(stops) < 3:
            return list(reversed(stops))

        # Get coordinates for all stops
        stop_coords = []
        for stop in stops:
            coords = stop.get_coordinates()
            if coords:
                stop_coords.append((stop, coords))
            else:
                # If no coords, just add to end
                stop_coords.append((stop, None))

        # Filter out stops without coordinates
        stops_with_coords = [s for s, c in stop_coords if c is not None]
        stops_without_coords = [s for s, c in stop_coords if c is None]

        if len(stops_with_coords) < 2:
            # Can't optimize without coordinates
            return list(reversed(stops))

        # Start with first stop
        result = [stops_with_coords[0]]
        remaining = stops_with_coords[1:]

        # Alternate between closest and farthest
        use_farthest = True

        while remaining:
            current_stop = result[-1]
            current_coords = current_stop.get_coordinates()

            if not current_coords:
                result.append(remaining.pop(0))
                continue

            # Calculate distances to all remaining stops
            distances = []
            for stop in remaining:
                stop_coords = stop.get_coordinates()
                if stop_coords:
                    # Simple Euclidean distance (good enough for scrambling)
                    dist = ((current_coords[0] - stop_coords[0])**2 +
                           (current_coords[1] - stop_coords[1])**2)**0.5
                    distances.append((stop, dist))

            if not distances:
                # No more stops with coordinates
                result.extend(remaining)
                break

            # Sort by distance
            distances.sort(key=lambda x: x[1], reverse=use_farthest)

            # Pick either farthest or closest
            next_stop = distances[0][0]
            result.append(next_stop)
            remaining.remove(next_stop)

            # Alternate strategy
            use_farthest = not use_farthest

        # Add stops without coordinates at the end
        result.extend(stops_without_coords)

        return result
