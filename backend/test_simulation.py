#!/usr/bin/env python
"""Test script for route simulation service"""

import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'soya_excel_backend.settings')
django.setup()

from route.simulation_service import RouteSimulationService
from route.models import Route

def test_simulation():
    service = RouteSimulationService()
    route = Route.objects.first()

    if not route:
        print("❌ No routes found in database")
        return

    print(f"Testing simulation for route: {route.name} (ID: {route.id})")
    print("-" * 60)

    # Check route's stored duration and distance
    print("\n--- Route Stored Data ---")
    print(f"Total Distance (from route): {route.total_distance} km")
    print(f"Estimated Duration (from route): {route.estimated_duration} minutes" if route.estimated_duration else "Estimated Duration: Not set")
    if route.estimated_duration:
        print(f"  -> In seconds: {route.estimated_duration * 60}")
        print(f"  -> In hours: {route.estimated_duration / 60:.2f}")

    # Check if route has stored Google Directions waypoints
    print(f"\n--- Google Directions Data ---")
    if route.waypoints:
        print(f"Route has stored waypoints: {len(route.waypoints)} waypoints")
        print(f"First 3 waypoints:")
        for i, wp in enumerate(route.waypoints[:3]):
            print(f"  {i+1}. {wp}")
        if len(route.waypoints) > 3:
            print(f"  ... and {len(route.waypoints) - 3} more waypoints")
    else:
        print("No stored Google Directions waypoints in database")
    print()

    # Test with default speed of 60x
    result = service.generate_simulation_data(route.id, simulation_speed=60.0)

    if result.get('success'):
        print("✅ Simulation data generated successfully!")
        print(f"\nRoute: {result.get('route_name')}")
        print(f"Date: {result.get('route_date')}")
        print(f"Status: {result.get('route_status')}")
        print(f"Total Stops: {result['simulation_config']['total_stops']}")
        print(f"Total Distance: {result['simulation_config']['total_distance_km']:.2f} km")
        print(f"\nSimulation Duration:")
        print(f"  Real Duration: {result['simulation_config']['total_real_duration_seconds']} seconds ({result['simulation_config']['total_real_duration_seconds'] / 60:.2f} minutes / {result['simulation_config']['total_real_duration_seconds'] / 3600:.2f} hours)")
        print(f"  Simulation Duration (at {result['simulation_config']['speed_multiplier']}x speed): {result['simulation_config']['total_simulation_duration_seconds']:.2f} seconds ({result['simulation_config']['total_simulation_duration_seconds'] / 60:.2f} minutes)")

        print("\n--- Driver Information ---")
        driver_info = result.get('driver_info')
        if driver_info:
            print(f"Name: {driver_info.get('name')}")
            print(f"Phone: {driver_info.get('phone')}")
            print(f"License: {driver_info.get('license_number')}")
        else:
            print("No driver assigned")

        print("\n--- Vehicle Information ---")
        vehicle_info = result.get('vehicle_info')
        if vehicle_info:
            print(f"ID: {vehicle_info.get('id')}")
            print(f"Vehicle Number: {vehicle_info.get('vehicle_number')}")
            print(f"Type: {vehicle_info.get('vehicle_type')}")
            print(f"Make/Model: {vehicle_info.get('make_model', 'N/A')}")
            print(f"License Plate: {vehicle_info.get('license_plate')}")
            print(f"Capacity: {vehicle_info.get('capacity_tonnes')} tonnes")
        else:
            print("No vehicle assigned or fallback vehicle info")

        print("\n--- Waypoints with Timing ---")
        print(f"Total waypoints: {len(result.get('waypoints', []))}")
        for i, wp in enumerate(result.get('waypoints', [])):
            arrival_min = wp['arrival_time_seconds'] / 60
            departure_min = wp['departure_time_seconds'] / 60
            print(f"{i+1}. {wp['name']} ({wp['type']})")
            print(f"   Arrival: {arrival_min:.2f}min ({wp['arrival_time_seconds']}s)")
            print(f"   Departure: {departure_min:.2f}min ({wp['departure_time_seconds']}s)")
            print(f"   Service Time: {wp['service_time_seconds']}s")
            if i >= 4:  # Show first 5 waypoints
                remaining = len(result.get('waypoints', [])) - 5
                if remaining > 0:
                    print(f"... and {remaining} more waypoints")
                break

    else:
        print(f"❌ Error: {result.get('error')}")

if __name__ == '__main__':
    test_simulation()
