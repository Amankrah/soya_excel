#!/usr/bin/env python
"""Test script for route simulation service"""

import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'soya_excel_backend.settings')
django.setup()

from route.simulation_service import RouteSimulationService
from route.models import Route, RouteStop

def test_simulation():
    service = RouteSimulationService()
    route = Route.objects.first()

    if not route:
        print("❌ No routes found in database")
        return

    print(f"Testing simulation for route: {route.name} (ID: {route.id})")
    print("=" * 70)

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

    # ========================================================================
    # CHECK DISTANCE AND DURATION FROM PREVIOUS FOR EACH STOP
    # ========================================================================
    print("\n" + "=" * 70)
    print("--- STOP-TO-STOP DISTANCE & DURATION CHECK (for speed calculation) ---")
    print("=" * 70)
    
    stops = route.stops.all().order_by('sequence_number')
    stops_with_distance = 0
    stops_with_duration = 0
    total_segment_distance = 0
    total_segment_duration = 0
    
    print(f"\nTotal stops in route: {stops.count()}")
    print("-" * 70)
    
    for stop in stops:
        has_distance = stop.distance_from_previous is not None and stop.distance_from_previous > 0
        has_duration = stop.duration_from_previous is not None and stop.duration_from_previous > 0
        
        if has_distance:
            stops_with_distance += 1
            total_segment_distance += float(stop.distance_from_previous)
        if has_duration:
            stops_with_duration += 1
            total_segment_duration += stop.duration_from_previous
        
        # Calculate speed for this segment
        speed_kmh = "N/A"
        if has_distance and has_duration:
            duration_hours = stop.duration_from_previous / 60  # Convert minutes to hours
            if duration_hours > 0:
                speed_kmh = f"{float(stop.distance_from_previous) / duration_hours:.1f} km/h"
        
        distance_str = f"{stop.distance_from_previous:.2f} km" if has_distance else "❌ MISSING"
        duration_str = f"{stop.duration_from_previous} min" if has_duration else "❌ MISSING"
        
        print(f"Stop {stop.sequence_number}: {stop.client.name}")
        print(f"   Distance from previous: {distance_str}")
        print(f"   Duration from previous: {duration_str}")
        print(f"   Calculated Speed: {speed_kmh}")
        print()
    
    print("-" * 70)
    print(f"\n📊 SUMMARY:")
    print(f"   Stops with distance_from_previous: {stops_with_distance}/{stops.count()} ", end="")
    print("✅" if stops_with_distance == stops.count() else "⚠️ MISSING DATA")
    print(f"   Stops with duration_from_previous: {stops_with_duration}/{stops.count()} ", end="")
    print("✅" if stops_with_duration == stops.count() else "⚠️ MISSING DATA")
    
    if total_segment_distance > 0:
        print(f"\n   Total segment distance: {total_segment_distance:.2f} km")
    if total_segment_duration > 0:
        print(f"   Total segment duration: {total_segment_duration} min ({total_segment_duration / 60:.2f} hours)")
    
    # Calculate average speed if we have data
    if total_segment_distance > 0 and total_segment_duration > 0:
        avg_speed = total_segment_distance / (total_segment_duration / 60)
        print(f"   Average speed: {avg_speed:.1f} km/h")
    
    # Check if route needs re-optimization
    if stops_with_distance < stops.count() or stops_with_duration < stops.count():
        print("\n" + "⚠️ " * 10)
        print("⚠️  WARNING: Route is missing distance/duration data!")
        print("⚠️  This is why the speedometer shows 0 km/h in simulation.")
        print("⚠️  ")
        print("⚠️  To fix: Re-optimize the route to fetch fresh Google Maps data.")
        print("⚠️  This will populate distance_from_previous and duration_from_previous.")
        print("⚠️ " * 10)
    else:
        print("\n✅ Route has complete distance/duration data for speed calculation!")

    # ========================================================================
    # TEST SIMULATION DATA GENERATION
    # ========================================================================
    print("\n" + "=" * 70)
    print("--- SIMULATION DATA TEST ---")
    print("=" * 70)

    # Test with default speed of 60x
    result = service.generate_simulation_data(route.id, simulation_speed=60.0)

    if result.get('success'):
        print("✅ Simulation data generated successfully!")
        print(f"\nRoute: {result.get('route_name')}")
        print(f"Date: {result.get('route_date')}")
        print(f"Status: {result.get('route_status')}")
        print(f"Total Stops: {result['simulation_config']['total_stops']}")
        print(f"Total Distance: {result['simulation_config']['total_distance_km']:.2f} km")
        
        # Check new travel time field
        travel_time = result['simulation_config'].get('total_travel_time_seconds', 0)
        print(f"Total Travel Time (excluding service): {travel_time}s ({travel_time/60:.1f} min)")
        
        print(f"\nSimulation Duration:")
        print(f"  Real Duration: {result['simulation_config']['total_real_duration_seconds']} seconds ({result['simulation_config']['total_real_duration_seconds'] / 60:.2f} minutes / {result['simulation_config']['total_real_duration_seconds'] / 3600:.2f} hours)")
        print(f"  Simulation Duration (at {result['simulation_config']['speed_multiplier']}x speed): {result['simulation_config']['total_simulation_duration_seconds']:.2f} seconds ({result['simulation_config']['total_simulation_duration_seconds'] / 60:.2f} minutes)")

        # Calculate and show average speed from simulation data
        total_dist = result['simulation_config']['total_distance_km']
        if travel_time > 0:
            avg_speed_sim = (total_dist / travel_time) * 3600
            print(f"\n📊 Average Speed (from simulation data): {avg_speed_sim:.1f} km/h")

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

        print("\n--- Waypoints with Timing & Speed Data ---")
        print(f"Total waypoints: {len(result.get('waypoints', []))}")
        for i, wp in enumerate(result.get('waypoints', [])):
            arrival_min = wp['arrival_time_seconds'] / 60
            departure_min = wp['departure_time_seconds'] / 60
            
            # Get segment distance and duration from waypoint data
            seg_dist = wp.get('segment_distance_km', 0)
            seg_dur = wp.get('segment_duration_seconds', 0)
            
            print(f"\n{i+1}. {wp['name']} ({wp['type']})")
            print(f"   Arrival: {arrival_min:.2f}min ({wp['arrival_time_seconds']}s)")
            print(f"   Departure: {departure_min:.2f}min ({wp['departure_time_seconds']}s)")
            print(f"   Service Time: {wp['service_time_seconds']}s")
            print(f"   Cumulative Distance: {wp.get('cumulative_distance_km', 0):.2f} km")
            
            # Show segment data (for speed calculation)
            if seg_dist > 0 or seg_dur > 0:
                print(f"   📍 Segment Distance: {seg_dist:.2f} km")
                print(f"   ⏱️  Segment Duration: {seg_dur}s ({seg_dur/60:.1f} min)")
                if seg_dur > 0 and seg_dist > 0:
                    seg_speed = (seg_dist / seg_dur) * 3600
                    print(f"   🚚 Segment Speed: {seg_speed:.1f} km/h")
            else:
                print(f"   ⚠️  No segment distance/duration data (speed will use fallback)")
            
            if i >= 4:  # Show first 5 waypoints
                remaining = len(result.get('waypoints', [])) - 5
                if remaining > 0:
                    print(f"\n... and {remaining} more waypoints")
                break

    else:
        print(f"❌ Error: {result.get('error')}")


def check_all_routes():
    """Check all routes for missing distance/duration data"""
    print("\n" + "=" * 70)
    print("CHECKING ALL ROUTES FOR MISSING DATA")
    print("=" * 70)
    
    routes = Route.objects.all()
    routes_with_issues = []
    
    for route in routes:
        stops = route.stops.all()
        stops_missing_distance = stops.filter(distance_from_previous__isnull=True).count()
        stops_missing_distance += stops.filter(distance_from_previous=0).count()
        
        stops_missing_duration = stops.filter(duration_from_previous__isnull=True).count()
        stops_missing_duration += stops.filter(duration_from_previous=0).count()
        
        total_stops = stops.count()
        
        if stops_missing_distance > 0 or stops_missing_duration > 0:
            routes_with_issues.append({
                'id': route.id,
                'name': route.name,
                'total_stops': total_stops,
                'missing_distance': stops_missing_distance,
                'missing_duration': stops_missing_duration
            })
    
    if routes_with_issues:
        print(f"\n⚠️  Found {len(routes_with_issues)} routes with missing data:\n")
        for r in routes_with_issues:
            print(f"Route {r['id']}: {r['name']}")
            print(f"   Total stops: {r['total_stops']}")
            print(f"   Missing distance: {r['missing_distance']}")
            print(f"   Missing duration: {r['missing_duration']}")
            print()
    else:
        print("\n✅ All routes have complete distance/duration data!")
    
    return routes_with_issues


if __name__ == '__main__':
    test_simulation()
    print("\n\n")
    check_all_routes()
