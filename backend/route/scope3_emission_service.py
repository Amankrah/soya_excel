"""
Scope 3 GHG Emission Calculation Service for Transportation

Implements Scope 3 emission estimation following international standards:
- GHG Protocol Corporate Value Chain (Scope 3) Accounting and Reporting Standard
- Category 4: Upstream Transportation and Distribution
- Category 9: Downstream Transportation and Distribution
- Environment and Climate Change Canada (ECCC) National Inventory Report (NIR 2025)

Methodology:
- Distance-based method (preferred): tonne-kilometer (tkm) approach
- Fuel-based method (when fuel data available): direct fuel consumption
- Well-to-wheel emissions including upstream fuel production

Author: Soya Excel Transportation Analytics
Version: 1.0
"""

import logging
from decimal import Decimal
from typing import Dict, List, Optional, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)


# ============================================================================
# EMISSION FACTORS - CANADA
# ============================================================================
# Source: Environment and Climate Change Canada (ECCC)
# National Inventory Report 1990-2023 (2025 Edition)
# Heavy-duty diesel trucks - road freight transportation within Canada
# Units: kg CO2e per tonne-kilometer (kg CO2e/tkm)
# Scope: CO2 + CH4 + N2O (converted to CO2e) + upstream emissions (well-to-tank)

class CanadianEmissionFactors:
    """
    Canadian-specific emission factors for road freight transport
    Based on ECCC NIR and GHG Protocol guidance
    """

    # Vehicle type emission factors (kg CO2e per tonne-km)
    # Accounts for typical load factors, fuel efficiency, and well-to-wheel emissions
    VEHICLE_TYPE_FACTORS = {
        'bulk_truck': Decimal('0.095'),           # Bulk soya transport (pneumatic)
        'tank_oil': Decimal('0.110'),             # Liquid tank trucks (oil products)
        'tank_blower': Decimal('0.105'),          # Blower compartment tanks
        'box_truck': Decimal('0.085'),            # Box trucks for tote bags (lighter loads)
        'dump_truck': Decimal('0.100'),           # Dump trucks
        'default_heavy_duty': Decimal('0.100'),   # Average heavy-duty truck (fallback)
    }

    # Diesel fuel emission factor (kg CO2e per liter)
    # Well-to-wheel: combustion (2.31) + upstream production/transport (0.37)
    DIESEL_KG_CO2E_PER_LITER = Decimal('2.68')

    # Average fuel consumption for heavy-duty trucks
    # Liters per 100 km (varies by load, terrain, vehicle age)
    DEFAULT_FUEL_EFFICIENCY = {
        'bulk_truck': Decimal('38.0'),
        'tank_oil': Decimal('42.0'),
        'tank_blower': Decimal('40.0'),
        'box_truck': Decimal('28.0'),
        'dump_truck': Decimal('35.0'),
        'default_heavy_duty': Decimal('38.0'),
    }

    # Load utilization adjustment factors
    # Accounts for reduced efficiency with lower loads or empty return trips
    # Multiplier applied to base emission factor
    UTILIZATION_ADJUSTMENTS = {
        0: Decimal('1.80'),      # Empty return trip (much higher emissions per tkm)
        25: Decimal('1.40'),     # 25% capacity
        50: Decimal('1.20'),     # 50% capacity
        75: Decimal('1.05'),     # 75% capacity
        100: Decimal('1.00'),    # Full capacity (baseline)
    }

    @classmethod
    def get_vehicle_factor(cls, vehicle_type: str) -> Decimal:
        """Get emission factor for vehicle type"""
        return cls.VEHICLE_TYPE_FACTORS.get(
            vehicle_type,
            cls.VEHICLE_TYPE_FACTORS['default_heavy_duty']
        )

    @classmethod
    def get_fuel_efficiency(cls, vehicle_type: str) -> Decimal:
        """Get typical fuel efficiency for vehicle type"""
        return cls.DEFAULT_FUEL_EFFICIENCY.get(
            vehicle_type,
            cls.DEFAULT_FUEL_EFFICIENCY['default_heavy_duty']
        )

    @classmethod
    def get_utilization_factor(cls, utilization_pct: float) -> Decimal:
        """
        Get utilization adjustment factor
        Uses nearest percentage bracket
        """
        if utilization_pct >= 100:
            return cls.UTILIZATION_ADJUSTMENTS[100]
        elif utilization_pct >= 75:
            return cls.UTILIZATION_ADJUSTMENTS[75]
        elif utilization_pct >= 50:
            return cls.UTILIZATION_ADJUSTMENTS[50]
        elif utilization_pct >= 25:
            return cls.UTILIZATION_ADJUSTMENTS[25]
        else:
            return cls.UTILIZATION_ADJUSTMENTS[0]


# ============================================================================
# SCOPE 3 EMISSION SERVICE
# ============================================================================

class Scope3EmissionService:
    """
    Service for calculating Scope 3 GHG emissions from road freight transport

    Methods:
    - Distance-based (tonne-kilometer): Primary method when mass and distance known
    - Fuel-based: More accurate when actual fuel consumption available
    - Segment-level: Track emissions per route segment
    - Route-level: Aggregate emissions for entire routes
    """

    def __init__(self):
        self.logger = logger
        self.factors = CanadianEmissionFactors()

    def calculate_distance_based_emissions(
        self,
        distance_km: float,
        mass_tonnes: float,
        vehicle_type: str = 'default_heavy_duty',
        utilization_pct: Optional[float] = None,
        return_trip_empty: bool = False
    ) -> Dict:
        """
        Calculate Scope 3 emissions using distance-based method (tonne-kilometer)

        This is the GHG Protocol's preferred method for transportation emissions
        when activity data (mass, distance) is available.

        Formula: Emissions = Mass (tonnes) × Distance (km) × Emission Factor (kg CO2e/tkm)

        Args:
            distance_km: Distance traveled in kilometers
            mass_tonnes: Mass of product transported in tonnes
            vehicle_type: Type of vehicle (from Vehicle.VEHICLE_TYPE_CHOICES)
            utilization_pct: Vehicle capacity utilization percentage (0-100)
            return_trip_empty: Whether return trip is empty (doubles emissions)

        Returns:
            Dictionary with emission calculations and metadata
        """
        try:
            # Input validation
            if distance_km <= 0 or mass_tonnes < 0:
                return {
                    'success': False,
                    'error': 'Invalid distance or mass values',
                    'emissions_kg_co2e': 0
                }

            # Get base emission factor for vehicle type
            base_factor = self.factors.get_vehicle_factor(vehicle_type)

            # Calculate tonne-kilometers
            tonne_km = Decimal(str(mass_tonnes)) * Decimal(str(distance_km))

            # Apply utilization adjustment if provided
            adjustment_factor = Decimal('1.0')
            if utilization_pct is not None:
                adjustment_factor = self.factors.get_utilization_factor(utilization_pct)

            # Adjust emission factor
            adjusted_factor = base_factor * adjustment_factor

            # Calculate one-way emissions
            # Special case: For empty vehicles (mass = 0), use fuel-based estimation
            if mass_tonnes == 0 and distance_km > 0:
                # Empty truck still burns fuel - estimate based on fuel consumption
                fuel_consumed = (Decimal(str(distance_km)) / 100) * self.factors.get_fuel_efficiency(vehicle_type)
                # Reduce by ~60% for empty vehicle (lighter, better fuel economy)
                fuel_consumed = fuel_consumed * Decimal('0.6')
                one_way_emissions = fuel_consumed * self.factors.DIESEL_KG_CO2E_PER_LITER
            else:
                one_way_emissions = tonne_km * adjusted_factor

            # Account for return trip if empty
            total_emissions = one_way_emissions
            if return_trip_empty:
                # Empty return uses higher factor (no payload, but fuel consumed)
                empty_factor = base_factor * self.factors.UTILIZATION_ADJUSTMENTS[0]
                # Distance only (no mass for return)
                return_emissions = Decimal(str(distance_km)) * empty_factor * Decimal('0.1')  # Assume 10% of loaded
                total_emissions += return_emissions

            return {
                'success': True,
                'method': 'distance_based_tkm',
                'emissions_kg_co2e': float(total_emissions),
                'emissions_tonnes_co2e': float(total_emissions / 1000),
                'calculation_details': {
                    'distance_km': distance_km,
                    'mass_tonnes': mass_tonnes,
                    'tonne_km': float(tonne_km),
                    'vehicle_type': vehicle_type,
                    'base_emission_factor_kg_co2e_per_tkm': float(base_factor),
                    'utilization_pct': utilization_pct,
                    'utilization_adjustment_factor': float(adjustment_factor),
                    'adjusted_emission_factor': float(adjusted_factor),
                    'one_way_emissions_kg_co2e': float(one_way_emissions),
                    'return_trip_empty': return_trip_empty,
                    'total_emissions_kg_co2e': float(total_emissions),
                },
                'standard': 'GHG Protocol Scope 3 - Category 4/9',
                'emission_factor_source': 'ECCC NIR 2025 - Heavy-duty trucks Canada',
                'calculated_at': datetime.now().isoformat()
            }

        except Exception as e:
            self.logger.error(f"Error calculating distance-based emissions: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'emissions_kg_co2e': 0
            }

    def calculate_fuel_based_emissions(
        self,
        fuel_consumed_liters: float,
        fuel_type: str = 'diesel'
    ) -> Dict:
        """
        Calculate Scope 3 emissions using fuel-based method

        More accurate when actual fuel consumption data is available
        (e.g., from vehicle telemetry, fuel receipts, or electronic logs)

        Formula: Emissions = Fuel Consumed (L) × Emission Factor (kg CO2e/L)

        Args:
            fuel_consumed_liters: Actual fuel consumed in liters
            fuel_type: Type of fuel ('diesel' is standard for freight trucks)

        Returns:
            Dictionary with emission calculations and metadata
        """
        try:
            if fuel_consumed_liters <= 0:
                return {
                    'success': False,
                    'error': 'Invalid fuel consumption value',
                    'emissions_kg_co2e': 0
                }

            # Use diesel emission factor (well-to-wheel)
            emission_factor = self.factors.DIESEL_KG_CO2E_PER_LITER

            # Calculate total emissions
            total_emissions = Decimal(str(fuel_consumed_liters)) * emission_factor

            return {
                'success': True,
                'method': 'fuel_based',
                'emissions_kg_co2e': float(total_emissions),
                'emissions_tonnes_co2e': float(total_emissions / 1000),
                'calculation_details': {
                    'fuel_consumed_liters': fuel_consumed_liters,
                    'fuel_type': fuel_type,
                    'emission_factor_kg_co2e_per_liter': float(emission_factor),
                    'total_emissions_kg_co2e': float(total_emissions),
                },
                'standard': 'GHG Protocol Scope 3 - Category 4/9',
                'emission_factor_source': 'ECCC - Diesel well-to-wheel',
                'calculated_at': datetime.now().isoformat()
            }

        except Exception as e:
            self.logger.error(f"Error calculating fuel-based emissions: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'emissions_kg_co2e': 0
            }

    def estimate_fuel_consumption(
        self,
        distance_km: float,
        vehicle_type: str = 'default_heavy_duty',
        fuel_efficiency_override: Optional[float] = None
    ) -> Dict:
        """
        Estimate fuel consumption based on distance and vehicle type

        Args:
            distance_km: Distance in kilometers
            vehicle_type: Type of vehicle
            fuel_efficiency_override: Override default efficiency (L/100km)

        Returns:
            Dictionary with fuel consumption estimate
        """
        try:
            if distance_km <= 0:
                return {
                    'success': False,
                    'error': 'Invalid distance',
                    'fuel_liters': 0
                }

            # Get fuel efficiency
            if fuel_efficiency_override:
                efficiency = Decimal(str(fuel_efficiency_override))
            else:
                efficiency = self.factors.get_fuel_efficiency(vehicle_type)

            # Calculate fuel consumption
            fuel_liters = (Decimal(str(distance_km)) / 100) * efficiency

            return {
                'success': True,
                'fuel_liters': float(fuel_liters),
                'distance_km': distance_km,
                'fuel_efficiency_l_per_100km': float(efficiency),
                'vehicle_type': vehicle_type
            }

        except Exception as e:
            self.logger.error(f"Error estimating fuel consumption: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'fuel_liters': 0
            }

    def calculate_segment_emissions(
        self,
        segment_distance_km: float,
        segment_mass_tonnes: float,
        vehicle_type: str,
        vehicle_capacity_tonnes: Optional[float] = None
    ) -> Dict:
        """
        Calculate emissions for a single route segment (stop-to-stop)

        Args:
            segment_distance_km: Distance for this segment
            segment_mass_tonnes: Mass carried during this segment
            vehicle_type: Type of vehicle
            vehicle_capacity_tonnes: Vehicle capacity for utilization calculation

        Returns:
            Segment emission data
        """
        try:
            # Calculate utilization if capacity provided
            utilization_pct = None
            if vehicle_capacity_tonnes and vehicle_capacity_tonnes > 0:
                utilization_pct = (segment_mass_tonnes / vehicle_capacity_tonnes) * 100
                utilization_pct = min(100, utilization_pct)  # Cap at 100%

            # Calculate emissions
            emissions = self.calculate_distance_based_emissions(
                distance_km=segment_distance_km,
                mass_tonnes=segment_mass_tonnes,
                vehicle_type=vehicle_type,
                utilization_pct=utilization_pct,
                return_trip_empty=False
            )

            if emissions['success']:
                emissions['segment_info'] = {
                    'distance_km': segment_distance_km,
                    'mass_tonnes': segment_mass_tonnes,
                    'utilization_pct': utilization_pct
                }

            return emissions

        except Exception as e:
            self.logger.error(f"Error calculating segment emissions: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'emissions_kg_co2e': 0
            }

    def calculate_route_emissions(
        self,
        route_distance_km: float,
        total_mass_tonnes: float,
        vehicle_type: str,
        vehicle_capacity_tonnes: Optional[float] = None,
        return_to_origin: bool = True,
        segment_data: Optional[List[Dict]] = None,
        distance_includes_return: bool = False
    ) -> Dict:
        """
        Calculate total Scope 3 emissions for a complete route

        Can use either:
        - Aggregate route data (total distance, total mass)
        - Detailed segment-by-segment data (more accurate)

        Args:
            route_distance_km: Total route distance (one-way or round-trip depending on distance_includes_return)
            total_mass_tonnes: Total mass delivered across all stops
            vehicle_type: Type of vehicle
            vehicle_capacity_tonnes: Vehicle capacity
            return_to_origin: Whether vehicle returns to starting point
            segment_data: Optional list of segment dicts with 'distance_km' and 'mass_tonnes'
            distance_includes_return: True if route_distance_km already includes return trip (from Google Maps)

        Returns:
            Complete route emission analysis
        """
        try:
            # Calculate utilization
            utilization_pct = None
            if vehicle_capacity_tonnes and vehicle_capacity_tonnes > 0:
                avg_utilization = (total_mass_tonnes / vehicle_capacity_tonnes) * 100
                utilization_pct = min(100, avg_utilization)

            # Determine one-way distance
            if distance_includes_return and return_to_origin:
                # If distance already includes return, divide by 2 to get one-way
                one_way_distance = route_distance_km / 2
            else:
                # Distance is one-way
                one_way_distance = route_distance_km

            # Calculate emissions for delivery journey
            delivery_emissions = self.calculate_distance_based_emissions(
                distance_km=one_way_distance,
                mass_tonnes=total_mass_tonnes,
                vehicle_type=vehicle_type,
                utilization_pct=utilization_pct,
                return_trip_empty=False
            )

            # Calculate segment-level emissions if provided
            segment_emissions = []
            total_segment_emissions = 0

            if segment_data:
                for i, segment in enumerate(segment_data):
                    seg_result = self.calculate_segment_emissions(
                        segment_distance_km=segment.get('distance_km', 0),
                        segment_mass_tonnes=segment.get('mass_tonnes', 0),
                        vehicle_type=vehicle_type,
                        vehicle_capacity_tonnes=vehicle_capacity_tonnes
                    )

                    if seg_result['success']:
                        segment_emissions.append({
                            'segment_number': i + 1,
                            'emissions_kg_co2e': seg_result['emissions_kg_co2e'],
                            'distance_km': segment.get('distance_km'),
                            'mass_tonnes': segment.get('mass_tonnes')
                        })
                        total_segment_emissions += seg_result['emissions_kg_co2e']

            # Calculate return trip emissions if applicable
            return_emissions = 0
            if return_to_origin and delivery_emissions['success']:
                # Return trip with empty vehicle
                return_result = self.calculate_distance_based_emissions(
                    distance_km=one_way_distance,
                    mass_tonnes=0,  # Empty
                    vehicle_type=vehicle_type,
                    utilization_pct=0,
                    return_trip_empty=False
                )
                if return_result['success']:
                    return_emissions = return_result['emissions_kg_co2e']

            # Total emissions
            total_emissions_kg = delivery_emissions.get('emissions_kg_co2e', 0) + return_emissions

            # Use segment total if available (more accurate)
            if segment_emissions:
                total_emissions_kg = total_segment_emissions + return_emissions

            # Estimate fuel consumption
            # NOTE: route_distance_km should already include return trip if return_to_origin=True
            # (calculated by Google Maps with warehouse as destination)
            fuel_estimate = self.estimate_fuel_consumption(
                distance_km=route_distance_km,
                vehicle_type=vehicle_type
            )

            return {
                'success': True,
                'total_emissions_kg_co2e': total_emissions_kg,
                'total_emissions_tonnes_co2e': total_emissions_kg / 1000,
                'delivery_emissions_kg_co2e': total_segment_emissions if segment_emissions else delivery_emissions.get('emissions_kg_co2e', 0),
                'return_emissions_kg_co2e': return_emissions,
                'route_summary': {
                    'total_distance_km': route_distance_km,
                    'total_mass_tonnes': total_mass_tonnes,
                    'vehicle_type': vehicle_type,
                    'vehicle_capacity_tonnes': vehicle_capacity_tonnes,
                    'utilization_pct': utilization_pct,
                    'return_to_origin': return_to_origin,
                    'estimated_fuel_liters': fuel_estimate.get('fuel_liters', 0)
                },
                'segment_emissions': segment_emissions if segment_emissions else None,
                'kpi_metrics': {
                    'kg_co2e_per_tonne': total_emissions_kg / total_mass_tonnes if total_mass_tonnes > 0 else 0,
                    'kg_co2e_per_km': total_emissions_kg / route_distance_km if route_distance_km > 0 else 0,
                    'kg_co2e_per_tonne_km': total_emissions_kg / (total_mass_tonnes * route_distance_km) if (total_mass_tonnes * route_distance_km) > 0 else 0
                },
                'standard': 'GHG Protocol Scope 3 - Category 4/9',
                'methodology': 'Distance-based (tonne-kilometer)',
                'emission_factor_source': 'ECCC NIR 2025 - Canada heavy-duty trucks',
                'calculated_at': datetime.now().isoformat()
            }

        except Exception as e:
            self.logger.error(f"Error calculating route emissions: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'total_emissions_kg_co2e': 0
            }
