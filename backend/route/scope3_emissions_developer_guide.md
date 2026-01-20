# Scope 3 GHG Emissions - Developer Implementation Guide

## Overview

This guide provides instructions for developers to implement the Scope 3 GHG emissions results interpretation and explanation feature in the Soya Excel Transportation Analytics platform. The goal is to present complex emission data in a clear, actionable format for business users.

---

## Table of Contents

1. [Data Structure Reference](#1-data-structure-reference)
2. [Emission Calculation Methods](#2-emission-calculation-methods)
3. [KPI Calculations and Formulas](#3-kpi-calculations-and-formulas)
4. [Industry Benchmarks](#4-industry-benchmarks)
5. [Interpretation Logic](#5-interpretation-logic)
6. [Recommendation Engine](#6-recommendation-engine)
7. [UI/UX Implementation](#7-uiux-implementation)
8. [Code Examples](#8-code-examples)
9. [Localization and Units](#9-localization-and-units)
10. [Compliance and Standards](#10-compliance-and-standards)

---

## 1. Data Structure Reference

### 1.1 Emission Service Response Structure

The `Scope3EmissionService.calculate_route_emissions()` method returns the following structure:

```python
{
    'success': True,
    'total_emissions_kg_co2e': 756.0,           # Total route emissions
    'total_emissions_tonnes_co2e': 0.756,       # Same in tonnes
    'delivery_emissions_kg_co2e': 612.3,        # Outbound (loaded) emissions
    'return_emissions_kg_co2e': 143.7,          # Return (empty) emissions
    'route_summary': {
        'total_distance_km': 470.4,
        'total_mass_tonnes': 15.0,
        'vehicle_type': 'bulk_truck',
        'vehicle_capacity_tonnes': 25.0,
        'utilization_pct': 60.0,
        'return_to_origin': True,
        'estimated_fuel_liters': 178.8
    },
    'segment_emissions': [                       # Per-segment breakdown (optional)
        {'segment_number': 1, 'emissions_kg_co2e': 245.2, ...},
        {'segment_number': 2, 'emissions_kg_co2e': 198.4, ...},
        ...
    ],
    'kpi_metrics': {
        'kg_co2e_per_tonne': 50.40,             # Carbon intensity per tonne delivered
        'kg_co2e_per_km': 1.61,                 # Carbon intensity per kilometer
        'kg_co2e_per_tonne_km': 0.107           # Carbon intensity per tonne-km
    },
    'standard': 'GHG Protocol Scope 3 - Category 4/9',
    'methodology': 'Distance-based (tonne-kilometer)',
    'emission_factor_source': 'ECCC NIR 2025 - Canada heavy-duty trucks',
    'calculated_at': '2026-01-20T14:30:00'
}
```

### 1.2 Key Fields Explained

| Field | Type | Description | Display Format |
|-------|------|-------------|----------------|
| `total_emissions_kg_co2e` | float | Total emissions for entire route | `{value:.1f} kg` |
| `delivery_emissions_kg_co2e` | float | Emissions for loaded outbound journey | `{value:.1f} kg` |
| `return_emissions_kg_co2e` | float | Emissions for empty return journey | `{value:.1f} kg` |
| `estimated_fuel_liters` | float | Estimated diesel consumption | `{value:.1f} L` |
| `utilization_pct` | float | Vehicle capacity utilization | `{value:.1f}%` |
| `kg_co2e_per_tonne` | float | Carbon intensity per tonne | `{value:.2f} kg/tm` |
| `kg_co2e_per_km` | float | Carbon intensity per km | `{value:.2f} kg/km` |

---

## 2. Emission Calculation Methods

### 2.1 Method Selection Logic

The service uses different calculation methods depending on the journey leg:

```python
def determine_calculation_method(mass_tonnes: float, distance_km: float) -> str:
    """
    Determine which calculation method to use
    
    Returns:
        'tonne_km': For loaded segments (mass > 0)
        'fuel_based': For empty segments (mass = 0)
    """
    if mass_tonnes > 0:
        return 'tonne_km'
    else:
        return 'fuel_based'
```

### 2.2 Tonne-Kilometer Method (Loaded Segments)

**Formula:**
```
Emissions (kg CO₂e) = Mass (tonnes) × Distance (km) × Emission Factor (kg CO₂e/tkm)
```

**When to use:** Outbound/loaded journey segments where cargo mass is known.

**Emission factors by vehicle type:**

| Vehicle Type | Emission Factor (kg CO₂e/tkm) |
|--------------|------------------------------|
| `bulk_truck` | 0.095 |
| `tank_oil` | 0.110 |
| `tank_blower` | 0.105 |
| `box_truck` | 0.085 |
| `dump_truck` | 0.100 |
| `default_heavy_duty` | 0.100 |

### 2.3 Fuel-Based Method (Empty Segments)

**Formula:**
```
Fuel (L) = (Distance (km) / 100) × Fuel Efficiency (L/100km) × 0.6
Emissions (kg CO₂e) = Fuel (L) × 2.68 (kg CO₂e/L)
```

**Note:** The 0.6 multiplier accounts for reduced fuel consumption when the vehicle is empty (approximately 40% fuel savings).

**When to use:** Return journey with empty vehicle (mass = 0).

### 2.4 Display Method Information

Always display the calculation methodology to users:

```typescript
interface MethodologyDisplay {
    standard: string;           // "GHG Protocol Scope 3 - Category 4/9"
    methodology: string;        // "Distance-based (tonne-kilometer)"
    scope: string;              // "Well-to-Wheel (WTW)"
    scopeDescription: string;   // "Includes combustion + upstream fuel production emissions"
    emissionFactorSource: string; // "ECCC NIR 2025 - Canada heavy-duty trucks"
}
```

---

## 3. KPI Calculations and Formulas

### 3.1 Primary KPIs

Implement these calculations in a dedicated utility class:

```python
class EmissionKPICalculator:
    """Calculate emission KPIs for route analysis"""
    
    @staticmethod
    def co2e_per_tonne(total_emissions_kg: float, mass_tonnes: float) -> float:
        """
        Carbon intensity per tonne of goods delivered
        
        Formula: Total Emissions / Total Mass Delivered
        Unit: kg CO₂e/tonne
        
        Interpretation: How much carbon is emitted to deliver each tonne
        Lower is better
        """
        if mass_tonnes <= 0:
            return 0
        return round(total_emissions_kg / mass_tonnes, 2)
    
    @staticmethod
    def co2e_per_km(total_emissions_kg: float, distance_km: float) -> float:
        """
        Carbon intensity per kilometer traveled
        
        Formula: Total Emissions / Total Distance
        Unit: kg CO₂e/km
        
        Interpretation: Vehicle efficiency indicator
        """
        if distance_km <= 0:
            return 0
        return round(total_emissions_kg / distance_km, 2)
    
    @staticmethod
    def co2e_per_tonne_km(total_emissions_kg: float, mass_tonnes: float, distance_km: float) -> float:
        """
        Carbon intensity per tonne-kilometer (transport work)
        
        Formula: Total Emissions / (Total Mass × Total Distance)
        Unit: kg CO₂e/tkm
        
        Interpretation: Standard industry metric for comparing transport efficiency
        """
        tonne_km = mass_tonnes * distance_km
        if tonne_km <= 0:
            return 0
        return round(total_emissions_kg / tonne_km, 4)
    
    @staticmethod
    def fuel_efficiency(fuel_liters: float, distance_km: float) -> float:
        """
        Fuel consumption rate
        
        Formula: (Fuel / Distance) × 100
        Unit: L/100km
        """
        if distance_km <= 0:
            return 0
        return round((fuel_liters / distance_km) * 100, 1)
    
    @staticmethod
    def empty_return_percentage(return_emissions: float, total_emissions: float) -> float:
        """
        Percentage of emissions from empty return journey
        
        Interpretation: High percentage indicates backhaul optimization opportunity
        """
        if total_emissions <= 0:
            return 0
        return round((return_emissions / total_emissions) * 100, 1)
```

### 3.2 Secondary/Derived KPIs

```python
class DerivedKPICalculator:
    """Calculate derived and comparative KPIs"""
    
    @staticmethod
    def annualized_emissions(route_emissions_kg: float, trips_per_year: int) -> dict:
        """
        Project annual emissions from single route
        
        Returns:
            {
                'annual_kg_co2e': float,
                'annual_tonnes_co2e': float,
                'annual_fuel_liters': float
            }
        """
        annual_kg = route_emissions_kg * trips_per_year
        return {
            'annual_kg_co2e': round(annual_kg, 0),
            'annual_tonnes_co2e': round(annual_kg / 1000, 2),
            'annual_fuel_liters': round((route_emissions_kg / 2.68) * trips_per_year, 0)
        }
    
    @staticmethod
    def tree_equivalent(emissions_kg_co2e: float) -> int:
        """
        Convert emissions to tree absorption equivalent
        
        Based on: 1 mature tree absorbs ~22 kg CO₂ per year
        """
        return round(emissions_kg_co2e / 22)
    
    @staticmethod
    def car_km_equivalent(emissions_kg_co2e: float) -> float:
        """
        Convert to equivalent passenger car kilometers
        
        Based on: Average car emits ~0.21 kg CO₂/km
        """
        return round(emissions_kg_co2e / 0.21, 0)
```

---

## 4. Industry Benchmarks

### 4.1 Benchmark Data Structure

Store benchmarks in a configuration that can be updated:

```python
EMISSION_BENCHMARKS = {
    'road_freight': {
        'kg_co2e_per_tonne': {
            'excellent': {'max': 30, 'label': 'Excellent'},
            'good': {'min': 30, 'max': 50, 'label': 'Good'},
            'average': {'min': 50, 'max': 80, 'label': 'Average'},
            'poor': {'min': 80, 'max': 120, 'label': 'Needs Improvement'},
            'very_poor': {'min': 120, 'label': 'Poor'}
        },
        'kg_co2e_per_km': {
            'excellent': {'max': 1.0, 'label': 'Excellent'},
            'good': {'min': 1.0, 'max': 1.5, 'label': 'Good'},
            'average': {'min': 1.5, 'max': 2.0, 'label': 'Average'},
            'poor': {'min': 2.0, 'max': 2.5, 'label': 'Needs Improvement'},
            'very_poor': {'min': 2.5, 'label': 'Poor'}
        },
        'fuel_efficiency_l_per_100km': {
            'excellent': {'max': 30, 'label': 'Excellent'},
            'good': {'min': 30, 'max': 38, 'label': 'Good'},
            'average': {'min': 38, 'max': 45, 'label': 'Average'},
            'poor': {'min': 45, 'max': 55, 'label': 'Needs Improvement'},
            'very_poor': {'min': 55, 'label': 'Poor'}
        },
        'utilization_pct': {
            'excellent': {'min': 85, 'label': 'Excellent'},
            'good': {'min': 70, 'max': 85, 'label': 'Good'},
            'average': {'min': 50, 'max': 70, 'label': 'Average'},
            'poor': {'min': 30, 'max': 50, 'label': 'Needs Improvement'},
            'very_poor': {'max': 30, 'label': 'Poor'}
        }
    }
}
```

### 4.2 Benchmark Evaluation Function

```python
def evaluate_against_benchmark(
    value: float, 
    metric: str, 
    industry: str = 'road_freight'
) -> dict:
    """
    Evaluate a metric value against industry benchmarks
    
    Args:
        value: The metric value to evaluate
        metric: The metric name (e.g., 'kg_co2e_per_tonne')
        industry: Industry category
    
    Returns:
        {
            'rating': 'good',
            'label': 'Good',
            'color': '#22c55e',
            'icon': 'check-circle',
            'message': 'Performance is within good range'
        }
    """
    benchmarks = EMISSION_BENCHMARKS.get(industry, {}).get(metric, {})
    
    # Color and icon mapping
    rating_styles = {
        'excellent': {'color': '#10b981', 'icon': 'star'},
        'good': {'color': '#22c55e', 'icon': 'check-circle'},
        'average': {'color': '#f59e0b', 'icon': 'minus-circle'},
        'poor': {'color': '#f97316', 'icon': 'alert-triangle'},
        'very_poor': {'color': '#ef4444', 'icon': 'x-circle'}
    }
    
    for rating, criteria in benchmarks.items():
        min_val = criteria.get('min', float('-inf'))
        max_val = criteria.get('max', float('inf'))
        
        if min_val <= value < max_val:
            return {
                'rating': rating,
                'label': criteria['label'],
                **rating_styles.get(rating, {})
            }
    
    return {'rating': 'unknown', 'label': 'N/A', 'color': '#6b7280'}
```

---

## 5. Interpretation Logic

### 5.1 Results Interpretation Service

Create a service to generate human-readable interpretations:

```python
class EmissionInterpretationService:
    """Generate human-readable interpretations of emission data"""
    
    def __init__(self, emissions_data: dict):
        self.data = emissions_data
        self.kpi = emissions_data.get('kpi_metrics', {})
        self.summary = emissions_data.get('route_summary', {})
    
    def generate_summary(self) -> str:
        """
        Generate executive summary paragraph
        """
        total = self.data.get('total_emissions_kg_co2e', 0)
        mass = self.summary.get('total_mass_tonnes', 0)
        distance = self.summary.get('total_distance_km', 0)
        
        return (
            f"This route generates {total:.1f} kg of CO₂ equivalent emissions "
            f"to deliver {mass:.2f} tonnes of product over {distance:.1f} km (round trip). "
            f"Each tonne of product carries a carbon intensity of "
            f"{self.kpi.get('kg_co2e_per_tonne', 0):.2f} kg CO₂e."
        )
    
    def generate_breakdown_explanation(self) -> dict:
        """
        Explain the emission breakdown
        """
        delivery = self.data.get('delivery_emissions_kg_co2e', 0)
        return_em = self.data.get('return_emissions_kg_co2e', 0)
        total = self.data.get('total_emissions_kg_co2e', 0)
        
        delivery_pct = (delivery / total * 100) if total > 0 else 0
        return_pct = (return_em / total * 100) if total > 0 else 0
        
        return {
            'outbound': {
                'value': delivery,
                'percentage': delivery_pct,
                'method': 'Tonne-kilometer',
                'explanation': (
                    f"The outbound journey carrying {self.summary.get('total_mass_tonnes', 0):.2f} tonnes "
                    f"accounts for {delivery_pct:.1f}% of total emissions. "
                    f"Emissions are calculated based on the weight carried and distance traveled."
                )
            },
            'return': {
                'value': return_em,
                'percentage': return_pct,
                'method': 'Fuel-based',
                'explanation': (
                    f"The empty return journey accounts for {return_pct:.1f}% of total emissions. "
                    f"Since no cargo is carried, emissions are estimated based on fuel consumption "
                    f"with a 40% reduction factor for the unladen vehicle."
                )
            }
        }
    
    def generate_utilization_insight(self) -> dict:
        """
        Provide insight on capacity utilization impact
        """
        utilization = self.summary.get('utilization_pct', 0)
        capacity = self.summary.get('vehicle_capacity_tonnes', 0)
        mass = self.summary.get('total_mass_tonnes', 0)
        
        unused_capacity = capacity - mass if capacity > 0 else 0
        
        insight = {
            'current_utilization': utilization,
            'unused_capacity_tonnes': unused_capacity,
            'status': 'optimal' if utilization >= 80 else 'suboptimal'
        }
        
        if utilization < 50:
            insight['message'] = (
                f"Vehicle is only {utilization:.0f}% utilized. "
                f"Consider consolidating shipments to reduce emissions per tonne."
            )
            insight['potential_reduction'] = "15-25%"
        elif utilization < 80:
            insight['message'] = (
                f"Vehicle utilization at {utilization:.0f}% is moderate. "
                f"Increasing to 80%+ would improve carbon efficiency."
            )
            insight['potential_reduction'] = "5-15%"
        else:
            insight['message'] = (
                f"Vehicle utilization at {utilization:.0f}% is efficient. "
                f"Continue optimizing for full loads when possible."
            )
            insight['potential_reduction'] = "0-5%"
        
        return insight
    
    def generate_comparison_context(self) -> list:
        """
        Generate relatable comparisons for emissions
        """
        total = self.data.get('total_emissions_kg_co2e', 0)
        
        comparisons = [
            {
                'metric': 'Tree Absorption',
                'value': round(total / 22),
                'unit': 'trees',
                'context': f"Equivalent to what {round(total / 22)} mature trees absorb in one year"
            },
            {
                'metric': 'Car Travel',
                'value': round(total / 0.21),
                'unit': 'km',
                'context': f"Equivalent to driving a passenger car {round(total / 0.21):,} km"
            },
            {
                'metric': 'Household Energy',
                'value': round(total / 8.5, 1),
                'unit': 'days',
                'context': f"Equivalent to {round(total / 8.5, 1)} days of average household energy use"
            }
        ]
        
        return comparisons
```

### 5.2 Contextual Messages

```python
CONTEXTUAL_MESSAGES = {
    'methodology': {
        'wtw': {
            'title': 'Well-to-Wheel (WTW)',
            'description': 'Includes both direct combustion emissions and upstream emissions from fuel extraction, refining, and transportation.',
            'why_it_matters': 'Provides complete picture of transportation carbon footprint for accurate Scope 3 reporting.'
        },
        'ttw': {
            'title': 'Tank-to-Wheel (TTW)',
            'description': 'Includes only direct emissions from fuel combustion in the vehicle.',
            'why_it_matters': 'Useful for comparing vehicle efficiency, but understates total climate impact.'
        }
    },
    'kpi_explanations': {
        'kg_co2e_per_tonne': {
            'title': 'Carbon Intensity per Tonne',
            'description': 'The amount of CO₂ equivalent emitted for each tonne of product delivered.',
            'business_relevance': 'Key metric for customer carbon footprint disclosures and comparing delivery efficiency across routes.',
            'improvement_lever': 'Improve by increasing load utilization, optimizing routes, or using lower-emission vehicles.'
        },
        'kg_co2e_per_km': {
            'title': 'Carbon Intensity per Kilometer',
            'description': 'The amount of CO₂ equivalent emitted for each kilometer traveled.',
            'business_relevance': 'Indicates overall vehicle and route efficiency. Higher values may indicate stop-and-go driving, terrain challenges, or vehicle issues.',
            'improvement_lever': 'Improve with driver training, route optimization, and vehicle maintenance.'
        }
    }
}
```

---

## 6. Recommendation Engine

### 6.1 Recommendation Generator

```python
class EmissionRecommendationEngine:
    """Generate actionable recommendations based on emission analysis"""
    
    def __init__(self, emissions_data: dict):
        self.data = emissions_data
        self.kpi = emissions_data.get('kpi_metrics', {})
        self.summary = emissions_data.get('route_summary', {})
    
    def generate_recommendations(self) -> list:
        """
        Analyze emission data and generate prioritized recommendations
        
        Returns:
            List of recommendations sorted by potential impact
        """
        recommendations = []
        
        # Check utilization
        utilization = self.summary.get('utilization_pct', 0)
        if utilization < 80:
            recommendations.append(self._utilization_recommendation(utilization))
        
        # Check empty return
        return_emissions = self.data.get('return_emissions_kg_co2e', 0)
        total_emissions = self.data.get('total_emissions_kg_co2e', 0)
        if return_emissions > 0 and (return_emissions / total_emissions) > 0.15:
            recommendations.append(self._backhaul_recommendation(return_emissions, total_emissions))
        
        # Check fuel efficiency
        fuel_per_100km = self._calculate_fuel_efficiency()
        if fuel_per_100km > 42:
            recommendations.append(self._fuel_efficiency_recommendation(fuel_per_100km))
        
        # Always include fuel alternatives
        recommendations.append(self._fuel_alternatives_recommendation())
        
        # Sort by potential reduction (highest first)
        recommendations.sort(key=lambda x: x.get('potential_reduction_pct', 0), reverse=True)
        
        return recommendations
    
    def _utilization_recommendation(self, utilization: float) -> dict:
        potential_reduction = min(25, (80 - utilization) * 0.5)
        return {
            'id': 'increase_utilization',
            'title': 'Increase Load Utilization',
            'priority': 'high' if utilization < 50 else 'medium',
            'potential_reduction_pct': potential_reduction,
            'current_value': f"{utilization:.0f}%",
            'target_value': '80%+',
            'description': (
                f"Current utilization is {utilization:.0f}%. Increasing to 80%+ "
                f"could reduce emissions per tonne by up to {potential_reduction:.0f}%."
            ),
            'actions': [
                'Consolidate shipments from multiple orders',
                'Adjust delivery schedules to maximize load',
                'Consider using smaller vehicles for partial loads'
            ],
            'icon': 'package',
            'category': 'operational'
        }
    
    def _backhaul_recommendation(self, return_emissions: float, total_emissions: float) -> dict:
        return_pct = (return_emissions / total_emissions) * 100
        return {
            'id': 'optimize_backhaul',
            'title': 'Optimize Return Journey (Backhaul)',
            'priority': 'high',
            'potential_reduction_pct': return_pct * 0.8,  # 80% of return emissions
            'current_value': f"{return_emissions:.1f} kg CO₂e ({return_pct:.0f}%)",
            'target_value': 'Near zero with backhaul cargo',
            'description': (
                f"Empty return journey contributes {return_pct:.0f}% of total emissions. "
                f"Carrying backhaul cargo could nearly eliminate this."
            ),
            'actions': [
                'Partner with suppliers for return cargo',
                'Use freight matching platforms',
                'Coordinate with nearby facilities for pickup loads'
            ],
            'icon': 'repeat',
            'category': 'network'
        }
    
    def _fuel_efficiency_recommendation(self, fuel_per_100km: float) -> dict:
        target = 38
        potential_reduction = ((fuel_per_100km - target) / fuel_per_100km) * 100
        return {
            'id': 'improve_fuel_efficiency',
            'title': 'Improve Fuel Efficiency',
            'priority': 'medium',
            'potential_reduction_pct': potential_reduction,
            'current_value': f"{fuel_per_100km:.1f} L/100km",
            'target_value': f"{target} L/100km",
            'description': (
                f"Current fuel consumption of {fuel_per_100km:.1f} L/100km is above optimal. "
                f"Reducing to {target} L/100km would cut emissions by {potential_reduction:.0f}%."
            ),
            'actions': [
                'Implement eco-driving training programs',
                'Ensure regular vehicle maintenance',
                'Monitor tire pressure and aerodynamics',
                'Use route optimization to avoid congestion'
            ],
            'icon': 'fuel',
            'category': 'vehicle'
        }
    
    def _fuel_alternatives_recommendation(self) -> dict:
        return {
            'id': 'alternative_fuels',
            'title': 'Consider Alternative Fuels',
            'priority': 'low',
            'potential_reduction_pct': 15,
            'current_value': 'Diesel',
            'target_value': 'Biodiesel B20 or higher',
            'description': (
                "Transitioning to biodiesel blends can reduce lifecycle emissions "
                "by 15-80% depending on blend ratio and feedstock."
            ),
            'actions': [
                'Evaluate B20 biodiesel availability in your region',
                'Assess vehicle compatibility with higher blends',
                'Calculate cost-benefit of fuel switching',
                'Explore electric or hydrogen options for future fleet'
            ],
            'icon': 'leaf',
            'category': 'fleet'
        }
    
    def _calculate_fuel_efficiency(self) -> float:
        fuel = self.summary.get('estimated_fuel_liters', 0)
        distance = self.summary.get('total_distance_km', 0)
        if distance > 0:
            return (fuel / distance) * 100
        return 0
```

### 6.2 Recommendation Display Schema

```typescript
interface Recommendation {
    id: string;
    title: string;
    priority: 'high' | 'medium' | 'low';
    potential_reduction_pct: number;
    current_value: string;
    target_value: string;
    description: string;
    actions: string[];
    icon: string;
    category: 'operational' | 'network' | 'vehicle' | 'fleet';
}
```

---

## 7. UI/UX Implementation

### 7.1 Component Structure

```
EmissionResultsPanel/
├── EmissionSummaryCard/
│   ├── TotalEmissionsDisplay
│   ├── FuelEstimateDisplay
│   ├── KPIGrid
│   └── MethodologyBadge
├── EmissionBreakdownChart/
│   ├── OutboundBar
│   ├── ReturnBar
│   └── LegendWithExplanations
├── KPIDetailCards/
│   ├── CO2PerTonneCard
│   ├── CO2PerKmCard
│   └── UtilizationCard
├── BenchmarkComparisonTable/
│   └── MetricRows with status indicators
├── RecommendationsPanel/
│   └── RecommendationCards (sorted by impact)
└── ComplianceFooter/
    ├── StandardReference
    ├── MethodologyLink
    └── CalculationTimestamp
```

### 7.2 Summary Card Layout

```tsx
interface EmissionSummaryCardProps {
    totalEmissions: number;
    fuelEstimate: number;
    co2PerTonne: number;
    co2PerKm: number;
    methodology: 'WTW' | 'TTW';
}

const EmissionSummaryCard: React.FC<EmissionSummaryCardProps> = ({
    totalEmissions,
    fuelEstimate,
    co2PerTonne,
    co2PerKm,
    methodology
}) => {
    return (
        <div className="emission-summary-card">
            <div className="header">
                <h3>SCOPE 3 GHG EMISSIONS</h3>
                <Badge variant="info">{methodology}</Badge>
                <span className="standard-ref">GHG Protocol Scope 3 - Category 4/9</span>
            </div>
            
            <div className="kpi-grid">
                <KPIBox
                    label="Total CO₂e"
                    value={totalEmissions.toFixed(1)}
                    unit="kg"
                    variant="primary"
                />
                <KPIBox
                    label="Est. Fuel"
                    value={fuelEstimate.toFixed(1)}
                    unit="liters"
                    variant="secondary"
                />
                <KPIBox
                    label="CO₂e / tonne"
                    value={co2PerTonne.toFixed(2)}
                    unit="kg/tm"
                    variant="metric"
                />
                <KPIBox
                    label="CO₂e / km"
                    value={co2PerKm.toFixed(2)}
                    unit="kg/km"
                    variant="metric"
                />
            </div>
            
            <div className="methodology-note">
                <InfoIcon />
                <span>
                    Well-to-Wheel (WTW): Includes combustion + upstream fuel production emissions
                </span>
            </div>
        </div>
    );
};
```

### 7.3 Breakdown Display

```tsx
interface EmissionBreakdownProps {
    outboundEmissions: number;
    returnEmissions: number;
    totalEmissions: number;
}

const EmissionBreakdown: React.FC<EmissionBreakdownProps> = ({
    outboundEmissions,
    returnEmissions,
    totalEmissions
}) => {
    const outboundPct = (outboundEmissions / totalEmissions) * 100;
    const returnPct = (returnEmissions / totalEmissions) * 100;
    
    return (
        <div className="emission-breakdown">
            <div className="breakdown-row">
                <span className="label">Outbound (Loaded):</span>
                <div className="bar-container">
                    <div 
                        className="bar outbound" 
                        style={{ width: `${outboundPct}%` }}
                    />
                </div>
                <span className="value">{outboundEmissions.toFixed(1)} kg</span>
            </div>
            
            <div className="breakdown-row">
                <span className="label">Return (Empty):</span>
                <div className="bar-container">
                    <div 
                        className="bar return" 
                        style={{ width: `${returnPct}%` }}
                    />
                </div>
                <span className="value">{returnEmissions.toFixed(1)} kg</span>
            </div>
            
            <div className="breakdown-explanation">
                <details>
                    <summary>How are these calculated?</summary>
                    <p>
                        <strong>Outbound:</strong> Uses tonne-kilometer method 
                        (mass × distance × emission factor)
                    </p>
                    <p>
                        <strong>Return:</strong> Uses fuel-based method with 40% 
                        reduction for empty vehicle
                    </p>
                </details>
            </div>
        </div>
    );
};
```

### 7.4 Color Scheme

```css
:root {
    /* Status Colors */
    --status-excellent: #10b981;
    --status-good: #22c55e;
    --status-average: #f59e0b;
    --status-poor: #f97316;
    --status-very-poor: #ef4444;
    
    /* Emission Colors */
    --emission-primary: #06b6d4;    /* Cyan for totals */
    --emission-outbound: #3b82f6;   /* Blue for loaded */
    --emission-return: #8b5cf6;     /* Purple for empty */
    --emission-fuel: #f59e0b;       /* Amber for fuel */
    
    /* Background */
    --card-bg: #1e293b;
    --card-border: #334155;
}
```

---

## 8. Code Examples

### 8.1 Full Integration Example (Django View)

```python
# views.py
from django.http import JsonResponse
from .scope3_emission_service import Scope3EmissionService
from .emission_interpretation import EmissionInterpretationService, EmissionRecommendationEngine

def get_route_emissions_report(request, route_id):
    """
    API endpoint to get complete emission analysis for a route
    """
    emission_service = Scope3EmissionService()
    
    # Get route data (simplified)
    route = Route.objects.get(id=route_id)
    stops = route.stops.all().order_by('sequence_number')
    
    # Calculate total mass
    total_mass = sum(float(s.quantity_to_deliver or 0) for s in stops)
    
    # Build segment data
    segment_data = []
    remaining_mass = total_mass
    for stop in stops:
        if stop.distance_from_previous:
            segment_data.append({
                'distance_km': float(stop.distance_from_previous),
                'mass_tonnes': remaining_mass
            })
            remaining_mass -= float(stop.quantity_to_deliver or 0)
    
    # Calculate emissions
    emissions_result = emission_service.calculate_route_emissions(
        route_distance_km=float(route.total_distance),
        total_mass_tonnes=total_mass,
        vehicle_type=route.assigned_vehicle_type or 'bulk_truck',
        vehicle_capacity_tonnes=25.0,
        return_to_origin=True,
        segment_data=segment_data,
        distance_includes_return=True
    )
    
    if not emissions_result['success']:
        return JsonResponse({'error': emissions_result.get('error')}, status=400)
    
    # Generate interpretations
    interpreter = EmissionInterpretationService(emissions_result)
    recommender = EmissionRecommendationEngine(emissions_result)
    
    # Build comprehensive response
    response = {
        'emissions': emissions_result,
        'interpretation': {
            'summary': interpreter.generate_summary(),
            'breakdown': interpreter.generate_breakdown_explanation(),
            'utilization_insight': interpreter.generate_utilization_insight(),
            'comparisons': interpreter.generate_comparison_context()
        },
        'recommendations': recommender.generate_recommendations(),
        'benchmarks': {
            'co2e_per_tonne': evaluate_against_benchmark(
                emissions_result['kpi_metrics']['kg_co2e_per_tonne'],
                'kg_co2e_per_tonne'
            ),
            'co2e_per_km': evaluate_against_benchmark(
                emissions_result['kpi_metrics']['kg_co2e_per_km'],
                'kg_co2e_per_km'
            )
        }
    }
    
    return JsonResponse(response)
```

### 8.2 Frontend Integration (React)

```tsx
// hooks/useEmissionReport.ts
import { useState, useEffect } from 'react';

interface EmissionReport {
    emissions: EmissionData;
    interpretation: InterpretationData;
    recommendations: Recommendation[];
    benchmarks: BenchmarkResults;
}

export function useEmissionReport(routeId: number) {
    const [report, setReport] = useState<EmissionReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    useEffect(() => {
        async function fetchReport() {
            try {
                setLoading(true);
                const response = await fetch(`/api/routes/${routeId}/emissions/`);
                if (!response.ok) throw new Error('Failed to fetch emissions');
                const data = await response.json();
                setReport(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        
        fetchReport();
    }, [routeId]);
    
    return { report, loading, error };
}

// components/EmissionReportPanel.tsx
export function EmissionReportPanel({ routeId }: { routeId: number }) {
    const { report, loading, error } = useEmissionReport(routeId);
    
    if (loading) return <Skeleton />;
    if (error) return <ErrorDisplay message={error} />;
    if (!report) return null;
    
    return (
        <div className="emission-report-panel">
            <EmissionSummaryCard 
                totalEmissions={report.emissions.total_emissions_kg_co2e}
                fuelEstimate={report.emissions.route_summary.estimated_fuel_liters}
                co2PerTonne={report.emissions.kpi_metrics.kg_co2e_per_tonne}
                co2PerKm={report.emissions.kpi_metrics.kg_co2e_per_km}
                methodology="WTW"
            />
            
            <EmissionBreakdown
                outboundEmissions={report.emissions.delivery_emissions_kg_co2e}
                returnEmissions={report.emissions.return_emissions_kg_co2e}
                totalEmissions={report.emissions.total_emissions_kg_co2e}
            />
            
            <SectionDivider title="Performance Analysis" />
            
            <BenchmarkTable benchmarks={report.benchmarks} />
            
            <InsightCard insight={report.interpretation.utilization_insight} />
            
            <SectionDivider title="Recommendations" />
            
            <RecommendationsList recommendations={report.recommendations} />
            
            <ComplianceFooter
                standard={report.emissions.standard}
                methodology={report.emissions.methodology}
                calculatedAt={report.emissions.calculated_at}
            />
        </div>
    );
}
```

---

## 9. Localization and Units

### 9.1 Unit Conversion Utilities

```python
class EmissionUnitConverter:
    """Handle unit conversions for different regions/preferences"""
    
    CONVERSIONS = {
        'kg_to_lb': 2.20462,
        'km_to_mi': 0.621371,
        'l_to_gal_us': 0.264172,
        'l_to_gal_uk': 0.219969,
        'tonne_to_ton_us': 1.10231,
    }
    
    @classmethod
    def convert(cls, value: float, from_unit: str, to_unit: str) -> float:
        key = f"{from_unit}_to_{to_unit}"
        factor = cls.CONVERSIONS.get(key, 1)
        return value * factor
    
    @classmethod
    def format_emission(cls, kg_co2e: float, unit_system: str = 'metric') -> dict:
        """
        Format emissions for display based on unit system
        """
        if unit_system == 'imperial':
            return {
                'value': round(kg_co2e * cls.CONVERSIONS['kg_to_lb'], 1),
                'unit': 'lb CO₂e'
            }
        return {
            'value': round(kg_co2e, 1),
            'unit': 'kg CO₂e'
        }
```

### 9.2 Language Strings

```python
EMISSION_STRINGS = {
    'en': {
        'total_emissions': 'Total CO₂e',
        'estimated_fuel': 'Est. Fuel',
        'co2e_per_tonne': 'CO₂e / tonne',
        'co2e_per_km': 'CO₂e / km',
        'outbound_loaded': 'Outbound (Loaded)',
        'return_empty': 'Return (Empty)',
        'methodology_wtw': 'Well-to-Wheel (WTW): Includes combustion + upstream fuel production emissions',
        'load': 'Load',
        'utilization': 'Utilization',
    },
    'fr': {
        'total_emissions': 'CO₂e Total',
        'estimated_fuel': 'Carburant Est.',
        'co2e_per_tonne': 'CO₂e / tonne',
        'co2e_per_km': 'CO₂e / km',
        'outbound_loaded': 'Aller (Chargé)',
        'return_empty': 'Retour (Vide)',
        'methodology_wtw': 'Du puits à la roue (WTW): Inclut les émissions de combustion + production de carburant en amont',
        'load': 'Charge',
        'utilization': 'Utilisation',
    }
}
```

---

## 10. Compliance and Standards

### 10.1 Standard References

Always include these references in the UI and reports:

| Standard | Reference | Usage |
|----------|-----------|-------|
| GHG Protocol | Corporate Value Chain (Scope 3) Standard | Methodology framework |
| GHG Protocol | Technical Guidance for Calculating Scope 3 Emissions | Calculation methods |
| ECCC NIR 2025 | National Inventory Report 1990-2023 | Canadian emission factors |
| ISO 14083:2023 | Quantification of GHG emissions from transport | Standardized calculation |

### 10.2 Required Disclosures

Every emission report should include:

```python
REQUIRED_DISCLOSURES = {
    'standard': 'GHG Protocol Scope 3 - Category 4/9',
    'methodology': 'Distance-based (tonne-kilometer) with fuel-based for empty segments',
    'emission_scope': 'Well-to-Wheel (WTW)',
    'emission_factor_source': 'ECCC NIR 2025 - Canada heavy-duty trucks',
    'gases_included': 'CO₂, CH₄, N₂O (converted to CO₂e)',
    'gwp_source': 'IPCC AR5 (100-year)',
    'boundary': 'Upstream transportation of goods',
    'limitations': [
        'Fuel consumption estimated from average efficiency factors',
        'Does not include refrigeration or auxiliary equipment emissions',
        'Return journey assumes empty vehicle'
    ]
}
```

### 10.3 Audit Trail

For compliance, maintain calculation audit trail:

```python
class EmissionCalculationLog:
    """Log all emission calculations for audit purposes"""
    
    def log_calculation(
        self,
        route_id: int,
        input_data: dict,
        result: dict,
        user_id: int = None
    ):
        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'route_id': route_id,
            'user_id': user_id,
            'inputs': {
                'distance_km': input_data.get('distance_km'),
                'mass_tonnes': input_data.get('mass_tonnes'),
                'vehicle_type': input_data.get('vehicle_type'),
                'return_to_origin': input_data.get('return_to_origin')
            },
            'outputs': {
                'total_emissions_kg_co2e': result.get('total_emissions_kg_co2e'),
                'methodology': result.get('methodology'),
                'emission_factors_used': {
                    'tkm_factor': result.get('calculation_details', {}).get('base_emission_factor'),
                    'diesel_factor': 2.68
                }
            },
            'standard': result.get('standard'),
            'version': '1.0'
        }
        
        # Store in database or logging system
        EmissionAuditLog.objects.create(
            route_id=route_id,
            calculation_data=json.dumps(log_entry)
        )
```

---

## Appendix A: Quick Reference Card

### Emission Factors (Canada - Heavy Duty Trucks)

| Factor | Value | Unit | Source |
|--------|-------|------|--------|
| Diesel WTW | 2.68 | kg CO₂e/L | ECCC NIR 2025 |
| Bulk truck tkm | 0.095 | kg CO₂e/tkm | ECCC NIR 2025 |
| Empty vehicle fuel reduction | 40% | - | Industry standard |

### KPI Formulas

| KPI | Formula | Unit |
|-----|---------|------|
| CO₂e/tonne | Total Emissions ÷ Mass Delivered | kg/tm |
| CO₂e/km | Total Emissions ÷ Total Distance | kg/km |
| CO₂e/tkm | Total Emissions ÷ (Mass × Distance) | kg/tkm |

### Benchmark Ranges (Road Freight)

| Metric | Excellent | Good | Average | Poor |
|--------|-----------|------|---------|------|
| kg CO₂e/tonne | <30 | 30-50 | 50-80 | >80 |
| kg CO₂e/km | <1.0 | 1.0-1.5 | 1.5-2.0 | >2.0 |
| L/100km | <30 | 30-38 | 38-45 | >45 |

---

## Appendix B: Testing Checklist

- [ ] Verify tonne-km calculation matches expected formula
- [ ] Verify fuel-based calculation for empty return
- [ ] Confirm WTW factor (2.68) is applied correctly
- [ ] Test KPI calculations with known values
- [ ] Validate benchmark evaluation logic
- [ ] Test recommendation generation thresholds
- [ ] Verify unit conversions (metric/imperial)
- [ ] Check localization strings render correctly
- [ ] Confirm audit logging captures all required fields
- [ ] Test edge cases (zero mass, zero distance, null values)

---

*Document Version: 1.0*  
*Last Updated: January 2026*  
*Author: Soya Excel Transportation Analytics*
