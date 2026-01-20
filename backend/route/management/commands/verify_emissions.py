"""
Django management command to verify Scope 3 emission calculations

Usage:
    python manage.py verify_emissions
    python manage.py verify_emissions --route-id 123
    python manage.py verify_emissions --verbose
"""

from django.core.management.base import BaseCommand
from django.db.models import Sum, F
from decimal import Decimal
from route.models import Route, RouteStop
from route.scope3_emission_service import Scope3EmissionService, CanadianEmissionFactors
from driver.models import Delivery
import json


class Command(BaseCommand):
    help = 'Verify Scope 3 GHG emission calculations for routes'

    def add_arguments(self, parser):
        parser.add_argument(
            '--route-id',
            type=int,
            help='Verify specific route by ID',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed calculation breakdown',
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='Verify all routes with assigned vehicles',
        )

    def handle(self, *args, **options):
        route_id = options.get('route_id')
        verbose = options.get('verbose', False)
        verify_all = options.get('all', False)

        emission_service = Scope3EmissionService()
        factors = CanadianEmissionFactors()

        self.stdout.write(self.style.SUCCESS('\n' + '='*80))
        self.stdout.write(self.style.SUCCESS('SCOPE 3 EMISSION VERIFICATION'))
        self.stdout.write(self.style.SUCCESS('='*80 + '\n'))

        if route_id:
            # Verify specific route
            try:
                route = Route.objects.get(id=route_id)
                self.verify_route(route, emission_service, factors, verbose)
            except Route.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'Route {route_id} not found'))
                return

        elif verify_all:
            # Verify all routes with vehicles
            routes = Route.objects.filter(
                deliveries__vehicle__isnull=False
            ).distinct()[:10]  # Limit to 10 for performance

            self.stdout.write(f'Verifying {routes.count()} routes...\n')

            for route in routes:
                self.verify_route(route, emission_service, factors, verbose)
                self.stdout.write('-' * 80)

        else:
            # Show example verification
            self.show_example_verification(emission_service, factors)

    def verify_route(self, route, emission_service, factors, verbose=False):
        """Verify emissions for a specific route"""

        self.stdout.write(self.style.HTTP_INFO(f'\n📍 Route: {route.name} (ID: {route.id})'))
        self.stdout.write(f'   Date: {route.date}')
        self.stdout.write(f'   Status: {route.status}')

        # Get vehicle info
        active_delivery = route.deliveries.filter(
            status__in=['assigned', 'in_progress']
        ).first()

        if not active_delivery or not active_delivery.vehicle:
            self.stdout.write(self.style.WARNING('   ⚠️  No vehicle assigned - using defaults'))
            vehicle_type = route.assigned_vehicle_type or 'default_heavy_duty'
            vehicle_capacity = None
        else:
            vehicle = active_delivery.vehicle
            vehicle_type = vehicle.vehicle_type
            vehicle_capacity = float(vehicle.capacity_tonnes) if vehicle.capacity_tonnes else None
            self.stdout.write(f'   Vehicle: {vehicle.vehicle_number} ({vehicle_type})')
            if vehicle_capacity:
                self.stdout.write(f'   Capacity: {vehicle_capacity} tonnes')

        # Get route data
        stops = route.stops.all().order_by('sequence_number')
        total_distance = float(route.total_distance) if route.total_distance else 0

        # Calculate total mass
        total_mass = sum(
            float(stop.quantity_to_deliver)
            for stop in stops
            if stop.quantity_to_deliver
        )

        if total_mass == 0 and route.total_capacity_used:
            total_mass = float(route.total_capacity_used)

        self.stdout.write(f'   Distance: {total_distance:.2f} km')
        self.stdout.write(f'   Load: {total_mass:.2f} tonnes')
        self.stdout.write(f'   Stops: {stops.count()}')

        # Calculate utilization
        if vehicle_capacity and vehicle_capacity > 0:
            utilization = (total_mass / vehicle_capacity) * 100
            self.stdout.write(f'   Utilization: {utilization:.1f}%')
        else:
            utilization = None
            self.stdout.write('   Utilization: N/A')

        # Build segment data
        segment_data = []
        remaining_mass = total_mass

        for stop in stops:
            if stop.distance_from_previous and stop.distance_from_previous > 0:
                delivery_qty = float(stop.quantity_to_deliver) if stop.quantity_to_deliver else 0
                segment_data.append({
                    'distance_km': float(stop.distance_from_previous),
                    'mass_tonnes': remaining_mass,
                })
                remaining_mass = max(0, remaining_mass - delivery_qty)

        # Calculate emissions
        self.stdout.write(self.style.HTTP_INFO('\n🧮 CALCULATING EMISSIONS...'))

        result = emission_service.calculate_route_emissions(
            route_distance_km=total_distance,
            total_mass_tonnes=total_mass,
            vehicle_type=vehicle_type,
            vehicle_capacity_tonnes=vehicle_capacity,
            return_to_origin=route.return_to_warehouse,
            segment_data=segment_data if segment_data else None
        )

        if not result['success']:
            self.stdout.write(self.style.ERROR(f'   ❌ Error: {result.get("error")}'))
            return

        # Display results
        self.stdout.write(self.style.SUCCESS('\n✅ EMISSION RESULTS:'))
        self.stdout.write(f'   Total CO₂e: {result["total_emissions_kg_co2e"]:.2f} kg')
        self.stdout.write(f'   Total CO₂e: {result["total_emissions_tonnes_co2e"]:.4f} tonnes')
        self.stdout.write(f'   Delivery: {result["delivery_emissions_kg_co2e"]:.2f} kg')

        if result["return_emissions_kg_co2e"] > 0:
            self.stdout.write(f'   Return: {result["return_emissions_kg_co2e"]:.2f} kg')

        self.stdout.write(f'   Est. Fuel: {result["route_summary"]["estimated_fuel_liters"]:.1f} L')

        self.stdout.write(self.style.HTTP_INFO('\n📊 KPI METRICS:'))
        kpis = result['kpi_metrics']
        self.stdout.write(f'   CO₂e per tonne: {kpis["kg_co2e_per_tonne"]:.2f} kg/tm')
        self.stdout.write(f'   CO₂e per km: {kpis["kg_co2e_per_km"]:.2f} kg/km')
        self.stdout.write(f'   CO₂e per tonne-km: {kpis["kg_co2e_per_tonne_km"]:.4f} kg/tkm')

        # Verbose output
        if verbose:
            self.stdout.write(self.style.HTTP_INFO('\n🔍 DETAILED VERIFICATION:'))

            # Manual calculation
            base_factor = factors.get_vehicle_factor(vehicle_type)
            self.stdout.write(f'   Base emission factor: {float(base_factor):.4f} kg CO₂e/tkm')

            # Simple calculation (no utilization adjustment)
            simple_calc = total_distance * total_mass * float(base_factor)
            self.stdout.write(f'   Simple calc (dist × mass × factor): {simple_calc:.2f} kg')

            # Tonne-kilometers
            tkm = total_distance * total_mass
            self.stdout.write(f'   Tonne-kilometers: {tkm:.2f} tkm')

            # Fuel-based cross-check
            fuel_efficiency = factors.get_fuel_efficiency(vehicle_type)
            estimated_fuel = (Decimal(str(total_distance)) / 100) * fuel_efficiency
            fuel_based_emissions = estimated_fuel * factors.DIESEL_KG_CO2E_PER_LITER
            self.stdout.write(f'   Fuel-based estimate: {float(fuel_based_emissions):.2f} kg CO₂e')

            # Comparison
            diff_pct = abs(result["total_emissions_kg_co2e"] - simple_calc) / simple_calc * 100
            self.stdout.write(f'   Difference from simple calc: {diff_pct:.1f}%')

            if segment_data:
                self.stdout.write(f'   Using segment-level calculation: YES ({len(segment_data)} segments)')

            # Show methodology
            self.stdout.write(f'\n   Standard: {result["standard"]}')
            self.stdout.write(f'   Methodology: {result["methodology"]}')

    def show_example_verification(self, emission_service, factors):
        """Show example verification with known values"""

        self.stdout.write(self.style.HTTP_INFO('📚 EXAMPLE VERIFICATION\n'))
        self.stdout.write('Testing with known values:\n')

        # Test case 1: Simple scenario
        self.stdout.write(self.style.WARNING('Test 1: Simple 100km, 10 tonnes, bulk truck'))
        result = emission_service.calculate_distance_based_emissions(
            distance_km=100,
            mass_tonnes=10,
            vehicle_type='bulk_truck',
            utilization_pct=100,
            return_trip_empty=False
        )

        if result['success']:
            expected = 100 * 10 * 0.095  # 95 kg
            actual = result['emissions_kg_co2e']
            self.stdout.write(f'   Expected: {expected:.2f} kg CO₂e')
            self.stdout.write(f'   Actual: {actual:.2f} kg CO₂e')

            if abs(expected - actual) < 0.1:
                self.stdout.write(self.style.SUCCESS('   ✅ PASS'))
            else:
                self.stdout.write(self.style.ERROR(f'   ❌ FAIL (diff: {abs(expected - actual):.2f})'))

        # Test case 2: With utilization adjustment
        self.stdout.write(self.style.WARNING('\nTest 2: 50% utilization (should increase emissions)'))
        result_50 = emission_service.calculate_distance_based_emissions(
            distance_km=100,
            mass_tonnes=10,
            vehicle_type='bulk_truck',
            utilization_pct=50,  # Half loaded
            return_trip_empty=False
        )

        if result_50['success']:
            self.stdout.write(f'   100% util: {result["emissions_kg_co2e"]:.2f} kg CO₂e')
            self.stdout.write(f'   50% util: {result_50["emissions_kg_co2e"]:.2f} kg CO₂e')

            if result_50['emissions_kg_co2e'] > result['emissions_kg_co2e']:
                self.stdout.write(self.style.SUCCESS('   ✅ PASS (50% util has higher emissions)'))
            else:
                self.stdout.write(self.style.ERROR('   ❌ FAIL (utilization adjustment not working)'))

        # Test case 3: Fuel-based calculation
        self.stdout.write(self.style.WARNING('\nTest 3: Fuel-based (100L diesel)'))
        fuel_result = emission_service.calculate_fuel_based_emissions(
            fuel_consumed_liters=100,
            fuel_type='diesel'
        )

        if fuel_result['success']:
            expected_fuel = 100 * 2.68  # 268 kg
            actual_fuel = fuel_result['emissions_kg_co2e']
            self.stdout.write(f'   Expected: {expected_fuel:.2f} kg CO₂e')
            self.stdout.write(f'   Actual: {actual_fuel:.2f} kg CO₂e')

            if abs(expected_fuel - actual_fuel) < 0.1:
                self.stdout.write(self.style.SUCCESS('   ✅ PASS'))
            else:
                self.stdout.write(self.style.ERROR(f'   ❌ FAIL (diff: {abs(expected_fuel - actual_fuel):.2f})'))

        # Show emission factors
        self.stdout.write(self.style.HTTP_INFO('\n📋 EMISSION FACTORS (Canada):'))
        self.stdout.write('   Vehicle Types:')
        for vehicle_type, factor in factors.VEHICLE_TYPE_FACTORS.items():
            self.stdout.write(f'     - {vehicle_type}: {float(factor):.4f} kg CO₂e/tkm')

        self.stdout.write(f'\n   Diesel fuel: {float(factors.DIESEL_KG_CO2E_PER_LITER):.2f} kg CO₂e/L')

        self.stdout.write(self.style.SUCCESS('\n' + '='*80))
        self.stdout.write(self.style.SUCCESS('Use --route-id <ID> to verify a specific route'))
        self.stdout.write(self.style.SUCCESS('Use --all to verify all routes with vehicles'))
        self.stdout.write(self.style.SUCCESS('Use --verbose for detailed breakdown'))
        self.stdout.write(self.style.SUCCESS('='*80 + '\n'))
