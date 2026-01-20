# Scope 3 GHG Emissions Calculation - Usage Guide

## Overview

The `Scope3EmissionService` provides standardized Scope 3 greenhouse gas (GHG) emission calculations for truck transportation following international standards:

- **GHG Protocol Corporate Value Chain (Scope 3) Standard**
- **Category 4**: Upstream Transportation and Distribution
- **Category 9**: Downstream Transportation and Distribution
- **Environment and Climate Change Canada (ECCC)** National Inventory Report 2025

## Key Features

✅ **Distance-based method** (tonne-kilometer) - Primary method when mass and distance are known
✅ **Fuel-based method** - More accurate when actual fuel consumption is available
✅ **Segment-level tracking** - Track emissions per route segment
✅ **Vehicle utilization adjustments** - Accounts for load factors
✅ **Return trip calculations** - Includes empty return journeys
✅ **Canadian-specific emission factors** - Based on ECCC data for heavy-duty trucks

---

## Installation & Setup

The service is automatically initialized in:
- **Route Simulation Service** ([simulation_service.py](./simulation_service.py#L33))
- Can be used independently anywhere in the codebase

```python
from route.scope3_emission_service import Scope3EmissionService

emission_service = Scope3EmissionService()
```

---

## Usage Examples

### 1. Calculate Emissions for a Complete Route

**Use Case**: When route planning or after vehicle assignment

```python
from route.scope3_emission_service import Scope3EmissionService
from route.models import Route
from driver.models import Vehicle

# Initialize service
emission_service = Scope3EmissionService()

# Get route data
route = Route.objects.get(id=123)
vehicle = Vehicle.objects.get(id=456)

# Calculate emissions
result = emission_service.calculate_route_emissions(
    route_distance_km=250.5,                    # Total route distance
    total_mass_tonnes=18.5,                     # Total product delivered
    vehicle_type=vehicle.vehicle_type,          # 'bulk_truck', 'tank_oil', etc.
    vehicle_capacity_tonnes=float(vehicle.capacity_tonnes),
    return_to_origin=True,                      # Include return trip
    segment_data=None                           # Optional: for segment-level accuracy
)

if result['success']:
    print(f"Total Emissions: {result['total_emissions_kg_co2e']:.2f} kg CO2e")
    print(f"Emissions (tonnes): {result['total_emissions_tonnes_co2e']:.4f} t CO2e")
    print(f"Estimated Fuel: {result['route_summary']['estimated_fuel_liters']:.1f} L")
    print(f"KPI - kg CO2e per tonne: {result['kpi_metrics']['kg_co2e_per_tonne']:.2f}")
```

**Response Structure:**
```json
{
  "success": true,
  "total_emissions_kg_co2e": 475.8,
  "total_emissions_tonnes_co2e": 0.4758,
  "delivery_emissions_kg_co2e": 350.5,
  "return_emissions_kg_co2e": 125.3,
  "route_summary": {
    "total_distance_km": 250.5,
    "total_mass_tonnes": 18.5,
    "vehicle_type": "bulk_truck",
    "vehicle_capacity_tonnes": 25.0,
    "utilization_pct": 74.0,
    "return_to_origin": true,
    "estimated_fuel_liters": 177.5
  },
  "kpi_metrics": {
    "kg_co2e_per_tonne": 25.72,
    "kg_co2e_per_km": 1.90,
    "kg_co2e_per_tonne_km": 0.10
  },
  "standard": "GHG Protocol Scope 3 - Category 4/9",
  "methodology": "Distance-based (tonne-kilometer)"
}
```

---

### 2. Calculate Emissions with Segment-Level Data

**Use Case**: More accurate emissions when you have stop-by-stop data

```python
from route.scope3_emission_service import Scope3EmissionService

emission_service = Scope3EmissionService()

# Build segment data from route stops
route = Route.objects.get(id=123)
stops = route.stops.all().order_by('sequence_number')

segment_data = []
remaining_mass = 18.5  # Total mass at start

for stop in stops:
    if stop.distance_from_previous:
        delivery_qty = float(stop.quantity_to_deliver) if stop.quantity_to_deliver else 0

        segment_data.append({
            'distance_km': float(stop.distance_from_previous),
            'mass_tonnes': remaining_mass  # Mass carried during this segment
        })

        # Reduce mass after delivery
        remaining_mass = max(0, remaining_mass - delivery_qty)

# Calculate with segment data
result = emission_service.calculate_route_emissions(
    route_distance_km=250.5,
    total_mass_tonnes=18.5,
    vehicle_type='bulk_truck',
    vehicle_capacity_tonnes=25.0,
    return_to_origin=True,
    segment_data=segment_data  # Provides segment-by-segment accuracy
)

# Access segment-level emissions
if result['success'] and result['segment_emissions']:
    for segment in result['segment_emissions']:
        print(f"Segment {segment['segment_number']}: {segment['emissions_kg_co2e']:.2f} kg CO2e")
```

---

### 3. Calculate Single Segment Emissions

**Use Case**: Individual route segment analysis

```python
emission_service = Scope3EmissionService()

# Calculate emissions for one segment
result = emission_service.calculate_segment_emissions(
    segment_distance_km=45.2,
    segment_mass_tonnes=18.5,
    vehicle_type='bulk_truck',
    vehicle_capacity_tonnes=25.0
)

if result['success']:
    print(f"Segment Emissions: {result['emissions_kg_co2e']:.2f} kg CO2e")
    print(f"Utilization: {result['segment_info']['utilization_pct']:.1f}%")
```

---

### 4. Fuel-Based Calculation (When Fuel Data Available)

**Use Case**: After delivery completion with actual fuel consumption data

```python
from driver.models import Delivery

delivery = Delivery.objects.get(id=789)

# If delivery has fuel consumption data
if delivery.fuel_consumed_liters:
    result = emission_service.calculate_fuel_based_emissions(
        fuel_consumed_liters=float(delivery.fuel_consumed_liters),
        fuel_type='diesel'
    )

    if result['success']:
        print(f"Actual Emissions: {result['emissions_kg_co2e']:.2f} kg CO2e")

        # Update delivery record
        delivery.co2_emissions_kg = Decimal(str(result['emissions_kg_co2e']))
        delivery.save()
```

---

### 5. Estimate Fuel Consumption

**Use Case**: Predict fuel needs for route planning

```python
result = emission_service.estimate_fuel_consumption(
    distance_km=250.5,
    vehicle_type='bulk_truck',
    fuel_efficiency_override=None  # Optional: override default efficiency
)

if result['success']:
    print(f"Estimated Fuel: {result['fuel_liters']:.1f} L")
    print(f"Fuel Efficiency: {result['fuel_efficiency_l_per_100km']:.1f} L/100km")
```

---

## Integration Points

### A. Route Planning (Before Vehicle Assignment)

In [views.py](./views.py) - `create_distribution_plan` endpoint:

```python
@action(detail=False, methods=['post'])
def create_distribution_plan(self, request):
    # ... existing code ...

    # After route creation, calculate estimated emissions
    from route.scope3_emission_service import Scope3EmissionService

    emission_service = Scope3EmissionService()

    for route_data in plan_result.get('routes', []):
        emissions = emission_service.calculate_route_emissions(
            route_distance_km=route_data['total_distance_km'],
            total_mass_tonnes=route_data.get('total_mass', 0),
            vehicle_type='default_heavy_duty',  # Before vehicle assignment
            vehicle_capacity_tonnes=None,
            return_to_origin=True
        )

        route_data['estimated_emissions_kg_co2e'] = emissions['total_emissions_kg_co2e']
```

### B. Vehicle Assignment

In [views.py](./views.py) - `assign_to_driver` endpoint:

```python
@action(detail=True, methods=['post'])
def assign_to_driver(self, request, pk=None):
    # ... existing code ...

    if vehicle:
        # Calculate emissions with actual vehicle data
        from route.scope3_emission_service import Scope3EmissionService

        emission_service = Scope3EmissionService()
        emissions = emission_service.calculate_route_emissions(
            route_distance_km=float(route.total_distance),
            total_mass_tonnes=float(route.total_capacity_used),
            vehicle_type=vehicle.vehicle_type,
            vehicle_capacity_tonnes=float(vehicle.capacity_tonnes),
            return_to_origin=route.return_to_warehouse
        )

        # Store in route for reference
        route.co2_emissions = Decimal(str(emissions['total_emissions_kg_co2e']))
        route.save()
```

### C. Route Simulation (Already Integrated)

Emissions are automatically calculated in [simulation_service.py](./simulation_service.py#L256):

```python
# Automatically included in simulation data
simulation_data = simulation_service.generate_simulation_data(
    route_id=route.id,
    simulation_speed=60.0,
    include_return_journey=True
)

# Access emissions data
emissions = simulation_data['emissions_data']
```

### D. Post-Delivery Analysis

After delivery completion with actual data:

```python
from driver.models import Delivery

delivery = Delivery.objects.get(route=route, status='completed')

# Use fuel-based method if fuel data available
if delivery.fuel_consumed_liters:
    result = emission_service.calculate_fuel_based_emissions(
        fuel_consumed_liters=float(delivery.fuel_consumed_liters)
    )
    delivery.co2_emissions_kg = Decimal(str(result['emissions_kg_co2e']))
    delivery.save()
```

---

## Emission Factors (Canadian Standards)

### Vehicle Type Factors (kg CO₂e per tonne-km)

| Vehicle Type | Emission Factor | Description |
|-------------|----------------|-------------|
| `bulk_truck` | 0.095 | Bulk soya transport (pneumatic) |
| `tank_oil` | 0.110 | Liquid tank trucks (oil products) |
| `tank_blower` | 0.105 | Blower compartment tanks |
| `box_truck` | 0.085 | Box trucks for tote bags |
| `dump_truck` | 0.100 | Dump trucks |
| `default_heavy_duty` | 0.100 | Average heavy-duty truck |

### Fuel Emission Factor

- **Diesel (well-to-wheel)**: 2.68 kg CO₂e per liter
  - Combustion: 2.31 kg CO₂e/L
  - Upstream (production/transport): 0.37 kg CO₂e/L

### Load Utilization Adjustments

| Capacity Used | Adjustment Factor | Notes |
|--------------|------------------|-------|
| 0% (empty) | 1.80× | Empty return trips |
| 25% | 1.40× | Quarter loaded |
| 50% | 1.20× | Half loaded |
| 75% | 1.05× | Three-quarters loaded |
| 100% | 1.00× | Fully loaded (baseline) |

---

## API Response Fields

### Standard Response Structure

```python
{
    "success": bool,                          # Operation success status
    "total_emissions_kg_co2e": float,         # Total emissions in kg
    "total_emissions_tonnes_co2e": float,     # Total emissions in tonnes
    "delivery_emissions_kg_co2e": float,      # Outbound journey emissions
    "return_emissions_kg_co2e": float,        # Return trip emissions

    "route_summary": {
        "total_distance_km": float,
        "total_mass_tonnes": float,
        "vehicle_type": str,
        "vehicle_capacity_tonnes": float,
        "utilization_pct": float,
        "return_to_origin": bool,
        "estimated_fuel_liters": float
    },

    "segment_emissions": [                    # Optional: if segment_data provided
        {
            "segment_number": int,
            "emissions_kg_co2e": float,
            "distance_km": float,
            "mass_tonnes": float
        }
    ],

    "kpi_metrics": {
        "kg_co2e_per_tonne": float,          # Emissions per tonne delivered
        "kg_co2e_per_km": float,             # Emissions per kilometer
        "kg_co2e_per_tonne_km": float        # Emissions per tonne-kilometer
    },

    "standard": "GHG Protocol Scope 3 - Category 4/9",
    "methodology": "Distance-based (tonne-kilometer)",
    "emission_factor_source": "ECCC NIR 2025 - Canada heavy-duty trucks",
    "calculated_at": "ISO 8601 timestamp"
}
```

---

## Best Practices

### 1. **Use Segment Data When Available**
For maximum accuracy, provide segment-by-segment distance and mass data rather than aggregate totals.

### 2. **Update Emissions After Vehicle Assignment**
Recalculate emissions once actual vehicle is assigned to get accurate factors.

### 3. **Use Fuel-Based Method for Actuals**
When delivery is complete and fuel data is available, use `calculate_fuel_based_emissions()` for most accurate results.

### 4. **Store Emissions in Database**
Save calculated emissions to Route/Delivery models for reporting and analytics.

### 5. **Report Consistently**
Always cite the standard: "GHG Protocol Scope 3, Category 4/9, using ECCC emission factors"

---

## Regulatory Compliance

### Canada Federal Requirements

✅ Complies with **Environment and Climate Change Canada (ECCC)** reporting standards
✅ Uses **National Inventory Report (NIR) 2025** emission factors
✅ Suitable for **federal offset programs** and **carbon credit applications**
✅ Aligns with **IPCC guidelines** for national GHG inventories

### Corporate Sustainability Reporting

✅ Meets **GHG Protocol** requirements for Scope 3 disclosure
✅ Compatible with **CDP (Carbon Disclosure Project)** reporting
✅ Supports **ESG (Environmental, Social, Governance)** reporting
✅ Provides audit trail with methodology transparency

---

## Testing & Validation

Example test case:

```python
# Test with known values
emission_service = Scope3EmissionService()

result = emission_service.calculate_distance_based_emissions(
    distance_km=100,
    mass_tonnes=10,
    vehicle_type='bulk_truck',
    utilization_pct=100,
    return_trip_empty=False
)

# Expected: 100 km × 10 tonnes × 0.095 kg CO₂e/tkm = 95 kg CO₂e
assert result['success'] == True
assert abs(result['emissions_kg_co2e'] - 95.0) < 0.1
```

---

## References

1. **GHG Protocol**: Corporate Value Chain (Scope 3) Accounting and Reporting Standard
   - https://ghgprotocol.org/standards/scope-3-standard

2. **Environment and Climate Change Canada**: National Inventory Report 1990-2023 (2025 Edition)
   - https://www.canada.ca/en/environment-climate-change/services/climate-change/greenhouse-gas-emissions/inventory.html

3. **IPCC Guidelines**: Guidelines for National Greenhouse Gas Inventories
   - https://www.ipcc.ch/report/2019-refinement-to-the-2006-ipcc-guidelines-for-national-greenhouse-gas-inventories/

---

## Support & Questions

For questions or issues with emission calculations:
1. Review this documentation
2. Check [scope3_emission_service.py](./scope3_emission_service.py) source code
3. Verify emission factors against latest ECCC NIR publication
4. Contact: Soya Excel Transportation Analytics Team

**Version**: 1.0
**Last Updated**: 2026-01-20
**Maintained By**: Soya Excel Development Team
