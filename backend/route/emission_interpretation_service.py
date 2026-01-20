"""
Emission Interpretation Service

Generates human-readable interpretations and recommendations for Scope 3 GHG emissions data.
Based on the Developer Implementation Guide for emission results interpretation.
"""

from typing import Dict, List, Optional
from decimal import Decimal


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
            insight['severity'] = 'high'
        elif utilization < 80:
            insight['message'] = (
                f"Vehicle utilization at {utilization:.0f}% is moderate. "
                f"Increasing to 80%+ would improve carbon efficiency."
            )
            insight['potential_reduction'] = "5-15%"
            insight['severity'] = 'medium'
        else:
            insight['message'] = (
                f"Vehicle utilization at {utilization:.0f}% is efficient. "
                f"Continue optimizing for full loads when possible."
            )
            insight['potential_reduction'] = "0-5%"
            insight['severity'] = 'low'

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
                'icon': '🌳',
                'context': f"Equivalent to what {round(total / 22)} mature trees absorb in one year"
            },
            {
                'metric': 'Car Travel',
                'value': round(total / 0.21),
                'unit': 'km',
                'icon': '🚗',
                'context': f"Equivalent to driving a passenger car {round(total / 0.21):,} km"
            },
            {
                'metric': 'Household Energy',
                'value': round(total / 8.5, 1),
                'unit': 'days',
                'icon': '🏠',
                'context': f"Equivalent to {round(total / 8.5, 1)} days of average household energy use"
            }
        ]

        return comparisons


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


# Benchmark data and evaluation
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
        'excellent': {'color': '#10b981', 'icon': 'star', 'bg_color': '#064e3b'},
        'good': {'color': '#22c55e', 'icon': 'check-circle', 'bg_color': '#14532d'},
        'average': {'color': '#f59e0b', 'icon': 'minus-circle', 'bg_color': '#78350f'},
        'poor': {'color': '#f97316', 'icon': 'alert-triangle', 'bg_color': '#7c2d12'},
        'very_poor': {'color': '#ef4444', 'icon': 'x-circle', 'bg_color': '#7f1d1d'}
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

    return {'rating': 'unknown', 'label': 'N/A', 'color': '#6b7280', 'icon': 'help-circle', 'bg_color': '#374151'}
