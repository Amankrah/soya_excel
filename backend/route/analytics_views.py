"""
Performance Analytics API Endpoints

Provides analytics and reporting endpoints for:
- Weekly/monthly route performance
- KPI calculations and trends
- Driver performance rankings
- Vehicle efficiency reports
- Cost analysis
- Planning accuracy metrics
"""

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Count, Sum, Avg, Q, F
from django.db.models.functions import TruncDate, TruncWeek, TruncMonth

from .models import (
    Route, RouteStop, RouteOptimization,
    WeeklyRoutePerformance, MonthlyRoutePerformance
)
from driver.models import Driver, Vehicle

logger = logging.getLogger(__name__)


class RouteAnalyticsViewSet(viewsets.ViewSet):
    """
    ViewSet for route performance analytics and reporting.
    """

    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def weekly_performance(self, request):
        """
        Get weekly performance metrics.

        Query params:
        - week_start: Week start date (YYYY-MM-DD)
        - weeks: Number of weeks to include (default: 4)
        """
        try:
            weeks = int(request.query_params.get('weeks', 4))
            week_start_str = request.query_params.get('week_start')

            if week_start_str:
                week_start = datetime.strptime(week_start_str, '%Y-%m-%d').date()
            else:
                # Default to last completed week (not current incomplete week)
                today = timezone.now().date()
                current_week_start = today - timedelta(days=today.weekday())
                # Go back one week to get the last completed week
                week_start = current_week_start - timedelta(weeks=1)

            # Get performance data for requested weeks
            performance_data = []

            for i in range(weeks):
                current_week_start = week_start - timedelta(weeks=i)
                current_week_end = current_week_start + timedelta(days=6)

                # Get routes for this week
                week_routes = Route.objects.filter(
                    date__gte=current_week_start,
                    date__lte=current_week_end
                )

                # Calculate metrics
                total_routes = week_routes.count()
                completed_routes = week_routes.filter(status='completed').count()
                cancelled_routes = week_routes.filter(status='cancelled').count()

                # Distance metrics
                total_planned_distance = week_routes.aggregate(
                    total=Sum('total_distance')
                )['total'] or Decimal('0')

                total_actual_distance = week_routes.filter(
                    status='completed'
                ).aggregate(
                    total=Sum('actual_distance')
                )['total'] or Decimal('0')

                # Quantity delivered
                total_quantity = week_routes.filter(
                    status='completed'
                ).aggregate(
                    total=Sum('total_capacity_used')
                )['total'] or Decimal('0')

                # KM per tonne
                km_per_tonne = None
                if total_quantity > 0 and total_actual_distance > 0:
                    km_per_tonne = float(total_actual_distance) / float(total_quantity)

                # On-time delivery rate
                total_stops = RouteStop.objects.filter(
                    route__in=week_routes,
                    is_completed=True
                ).count()

                on_time_stops = RouteStop.objects.filter(
                    route__in=week_routes,
                    is_completed=True,
                    actual_arrival_time__lte=F('estimated_arrival_time') + timedelta(minutes=15)
                ).count()

                on_time_rate = (on_time_stops / total_stops * 100) if total_stops > 0 else None

                # Planning accuracy
                completed_with_both_distances = week_routes.filter(
                    status='completed',
                    total_distance__isnull=False,
                    actual_distance__isnull=False
                )

                accuracy_list = []
                for route in completed_with_both_distances:
                    planned = float(route.total_distance)
                    actual = float(route.actual_distance)
                    if planned > 0:
                        accuracy = (min(planned, actual) / max(planned, actual)) * 100
                        accuracy_list.append(accuracy)

                avg_accuracy = sum(accuracy_list) / len(accuracy_list) if accuracy_list else None

                performance_data.append({
                    'week_start': current_week_start.isoformat(),
                    'week_end': current_week_end.isoformat(),
                    'total_routes': total_routes,
                    'completed_routes': completed_routes,
                    'cancelled_routes': cancelled_routes,
                    'completion_rate': (completed_routes / total_routes * 100) if total_routes > 0 else 0,
                    'total_planned_distance_km': float(total_planned_distance),
                    'total_actual_distance_km': float(total_actual_distance),
                    'total_quantity_tonnes': float(total_quantity),
                    'km_per_tonne': round(km_per_tonne, 2) if km_per_tonne else None,
                    'on_time_delivery_rate': round(on_time_rate, 2) if on_time_rate else None,
                    'planning_accuracy': round(avg_accuracy, 2) if avg_accuracy else None,
                    'meets_90_percent_target': avg_accuracy >= 90 if avg_accuracy else None
                })

            return Response({
                'weeks': performance_data,
                'summary': {
                    'total_routes': sum(w['total_routes'] for w in performance_data),
                    'average_completion_rate': sum(w['completion_rate'] for w in performance_data) / len(performance_data) if performance_data else 0,
                    'average_on_time_rate': sum(
                        w['on_time_delivery_rate'] for w in performance_data if w['on_time_delivery_rate']
                    ) / len([w for w in performance_data if w['on_time_delivery_rate']]) if any(w['on_time_delivery_rate'] for w in performance_data) else None
                }
            })

        except Exception as e:
            logger.error(f"Error calculating weekly performance: {str(e)}")
            return Response(
                {'error': f'Error calculating weekly performance: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def monthly_performance(self, request):
        """
        Get monthly performance metrics.

        Query params:
        - month: Month (YYYY-MM)
        - months: Number of months to include (default: 6)
        """
        try:
            months_count = int(request.query_params.get('months', 6))
            month_str = request.query_params.get('month')

            if month_str:
                month_date = datetime.strptime(month_str, '%Y-%m').date()
            else:
                # Default to current month
                today = timezone.now().date()
                month_date = today.replace(day=1)

            performance_data = []

            for i in range(months_count):
                # Calculate month start/end
                if i == 0:
                    current_month = month_date
                else:
                    # Go back i months
                    year = month_date.year
                    month = month_date.month - i

                    while month <= 0:
                        month += 12
                        year -= 1

                    current_month = month_date.replace(year=year, month=month, day=1)

                # Get next month for end date
                next_month_year = current_month.year
                next_month_num = current_month.month + 1
                if next_month_num > 12:
                    next_month_num = 1
                    next_month_year += 1

                month_end = current_month.replace(
                    year=next_month_year,
                    month=next_month_num
                ) - timedelta(days=1)

                # Get routes for this month
                month_routes = Route.objects.filter(
                    date__gte=current_month,
                    date__lte=month_end
                )

                # Calculate monthly metrics (similar to weekly)
                total_routes = month_routes.count()
                completed_routes = month_routes.filter(status='completed').count()

                total_distance = month_routes.filter(
                    status='completed'
                ).aggregate(
                    total=Sum('actual_distance')
                )['total'] or Decimal('0')

                total_quantity = month_routes.filter(
                    status='completed'
                ).aggregate(
                    total=Sum('total_capacity_used')
                )['total'] or Decimal('0')

                km_per_tonne = (float(total_distance) / float(total_quantity)) if total_quantity > 0 else None

                performance_data.append({
                    'month': current_month.strftime('%Y-%m'),
                    'month_name': current_month.strftime('%B %Y'),
                    'total_routes': total_routes,
                    'completed_routes': completed_routes,
                    'total_distance_km': float(total_distance),
                    'total_quantity_tonnes': float(total_quantity),
                    'km_per_tonne': round(km_per_tonne, 2) if km_per_tonne else None
                })

            return Response({
                'months': performance_data,
                'period': f"{performance_data[-1]['month']} to {performance_data[0]['month']}" if performance_data else None
            })

        except Exception as e:
            logger.error(f"Error calculating monthly performance: {str(e)}")
            return Response(
                {'error': f'Error calculating monthly performance: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def driver_rankings(self, request):
        """
        Get driver performance rankings.

        Query params:
        - start_date: Start date (YYYY-MM-DD)
        - end_date: End date (YYYY-MM-DD)
        - metric: Ranking metric (on_time_rate|efficiency|total_deliveries)
        """
        try:
            from driver.models import Driver

            start_date_str = request.query_params.get('start_date')
            end_date_str = request.query_params.get('end_date')
            metric = request.query_params.get('metric', 'on_time_rate')

            # Default to last 30 days
            if not end_date_str:
                end_date = timezone.now().date()
            else:
                end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()

            if not start_date_str:
                start_date = end_date - timedelta(days=30)
            else:
                start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()

            # Get all drivers
            drivers = Driver.objects.filter(is_available=True)

            driver_stats = []

            for driver in drivers:
                # Get routes for this driver in period
                driver_routes = Route.objects.filter(
                    driver=driver,
                    date__gte=start_date,
                    date__lte=end_date,
                    status='completed'
                )

                if not driver_routes.exists():
                    continue

                total_routes = driver_routes.count()

                # Calculate metrics
                total_stops = RouteStop.objects.filter(
                    route__in=driver_routes,
                    is_completed=True
                ).count()

                on_time_stops = RouteStop.objects.filter(
                    route__in=driver_routes,
                    is_completed=True,
                    actual_arrival_time__lte=F('estimated_arrival_time') + timedelta(minutes=15)
                ).count()

                on_time_rate = (on_time_stops / total_stops * 100) if total_stops > 0 else 0

                # Distance efficiency
                total_distance = driver_routes.aggregate(
                    total=Sum('actual_distance')
                )['total'] or Decimal('0')

                total_quantity = driver_routes.aggregate(
                    total=Sum('total_capacity_used')
                )['total'] or Decimal('0')

                km_per_tonne = (float(total_distance) / float(total_quantity)) if total_quantity > 0 else 0

                # Customer satisfaction
                avg_rating = RouteStop.objects.filter(
                    route__in=driver_routes,
                    is_completed=True,
                    delivery_rating__isnull=False
                ).aggregate(
                    avg=Avg('delivery_rating')
                )['avg'] or 0

                driver_stats.append({
                    'driver_id': driver.id,
                    'driver_name': driver.name,
                    'total_routes': total_routes,
                    'total_deliveries': total_stops,
                    'on_time_rate': round(on_time_rate, 2),
                    'km_per_tonne': round(km_per_tonne, 2),
                    'efficiency_score': round(100 / km_per_tonne, 2) if km_per_tonne > 0 else 0,
                    'average_rating': round(float(avg_rating), 2),
                    'total_distance_km': float(total_distance),
                    'total_quantity_tonnes': float(total_quantity)
                })

            # Sort by requested metric
            if metric == 'on_time_rate':
                driver_stats.sort(key=lambda x: x['on_time_rate'], reverse=True)
            elif metric == 'efficiency':
                driver_stats.sort(key=lambda x: x['efficiency_score'], reverse=True)
            elif metric == 'total_deliveries':
                driver_stats.sort(key=lambda x: x['total_deliveries'], reverse=True)

            # Add rankings
            for idx, stat in enumerate(driver_stats, 1):
                stat['rank'] = idx

            return Response({
                'period': {
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat()
                },
                'metric': metric,
                'drivers': driver_stats,
                'total_drivers': len(driver_stats)
            })

        except Exception as e:
            logger.error(f"Error calculating driver rankings: {str(e)}")
            return Response(
                {'error': f'Error calculating driver rankings: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def vehicle_efficiency(self, request):
        """
        Get vehicle efficiency metrics.

        Query params:
        - start_date: Start date (YYYY-MM-DD)
        - end_date: End date (YYYY-MM-DD)
        """
        try:
            from driver.models import Vehicle

            start_date_str = request.query_params.get('start_date')
            end_date_str = request.query_params.get('end_date')

            # Default to last 30 days
            if not end_date_str:
                end_date = timezone.now().date()
            else:
                end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()

            if not start_date_str:
                start_date = end_date - timedelta(days=30)
            else:
                start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()

            # Get all vehicles
            vehicles = Vehicle.objects.filter(status='active')

            vehicle_stats = []

            for vehicle in vehicles:
                # Get routes for this vehicle
                vehicle_routes = Route.objects.filter(
                    vehicle=vehicle,
                    date__gte=start_date,
                    date__lte=end_date,
                    status='completed'
                )

                if not vehicle_routes.exists():
                    continue

                # Calculate metrics
                total_distance = vehicle_routes.aggregate(
                    total=Sum('actual_distance')
                )['total'] or Decimal('0')

                total_fuel = vehicle_routes.aggregate(
                    total=Sum('fuel_consumed')
                )['total'] or Decimal('0')

                total_quantity = vehicle_routes.aggregate(
                    total=Sum('total_capacity_used')
                )['total'] or Decimal('0')

                total_co2 = vehicle_routes.aggregate(
                    total=Sum('co2_emissions')
                )['total'] or Decimal('0')

                # Calculate efficiency metrics
                fuel_efficiency = (float(total_distance) / float(total_fuel)) if total_fuel > 0 else 0  # km/L
                km_per_tonne = (float(total_distance) / float(total_quantity)) if total_quantity > 0 else 0

                # Utilization rate
                total_days = (end_date - start_date).days + 1
                days_used = vehicle_routes.values('date').distinct().count()
                utilization_rate = (days_used / total_days * 100) if total_days > 0 else 0

                vehicle_stats.append({
                    'vehicle_id': vehicle.id,
                    'vehicle_name': str(vehicle),
                    'vehicle_type': vehicle.vehicle_type if hasattr(vehicle, 'vehicle_type') else None,
                    'total_routes': vehicle_routes.count(),
                    'total_distance_km': float(total_distance),
                    'total_fuel_liters': float(total_fuel),
                    'fuel_efficiency_km_per_liter': round(fuel_efficiency, 2),
                    'km_per_tonne': round(km_per_tonne, 2),
                    'total_co2_emissions_kg': float(total_co2),
                    'utilization_rate': round(utilization_rate, 2),
                    'days_used': days_used,
                    'total_days': total_days
                })

            # Sort by fuel efficiency
            vehicle_stats.sort(key=lambda x: x['fuel_efficiency_km_per_liter'], reverse=True)

            return Response({
                'period': {
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat()
                },
                'vehicles': vehicle_stats,
                'total_vehicles': len(vehicle_stats)
            })

        except Exception as e:
            logger.error(f"Error calculating vehicle efficiency: {str(e)}")
            return Response(
                {'error': f'Error calculating vehicle efficiency: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def optimization_savings(self, request):
        """
        Get route optimization savings report.

        Query params:
        - start_date: Start date (YYYY-MM-DD)
        - end_date: End date (YYYY-MM-DD)
        """
        try:
            start_date_str = request.query_params.get('start_date')
            end_date_str = request.query_params.get('end_date')

            # Default to last 30 days
            if not end_date_str:
                end_date = timezone.now().date()
            else:
                end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()

            if not start_date_str:
                start_date = end_date - timedelta(days=30)
            else:
                start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()

            # Get all optimizations in period
            all_optimizations = RouteOptimization.objects.filter(
                created_at__date__gte=start_date,
                created_at__date__lte=end_date,
                success=True
            ).select_related('route')

            # Get only the latest optimization per route (unique routes)
            # Group by route_id and get the most recent optimization for each
            latest_optimizations_by_route = {}
            for opt in all_optimizations.order_by('-created_at'):
                route_id = opt.route_id
                if route_id not in latest_optimizations_by_route:
                    latest_optimizations_by_route[route_id] = opt

            # Use only the latest optimization per route for calculations
            optimizations = list(latest_optimizations_by_route.values())

            # Calculate total savings (from unique routes only)
            total_distance_saved = sum(opt.distance_savings or Decimal('0') for opt in optimizations)
            total_time_saved = sum(opt.time_savings or 0 for opt in optimizations)

            # Group by optimization type
            by_type = {}
            for opt in optimizations:
                opt_type = opt.get_optimization_type_display()
                if opt_type not in by_type:
                    by_type[opt_type] = {
                        'count': 0,
                        'distance_saved': 0,
                        'time_saved': 0
                    }

                by_type[opt_type]['count'] += 1
                by_type[opt_type]['distance_saved'] += float(opt.distance_savings or 0)
                by_type[opt_type]['time_saved'] += opt.time_savings or 0

            # Estimate cost savings
            # Assuming $1.50/km fuel cost and $50/hour driver cost
            fuel_cost_per_km = 1.50
            driver_cost_per_hour = 50.0

            estimated_fuel_savings = float(total_distance_saved) * fuel_cost_per_km
            estimated_driver_cost_savings = (total_time_saved / 60.0) * driver_cost_per_hour
            total_estimated_savings = estimated_fuel_savings + estimated_driver_cost_savings

            return Response({
                'period': {
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat()
                },
                'summary': {
                    'total_optimizations': len(optimizations),  # Count unique routes optimized
                    'total_distance_saved_km': float(total_distance_saved),
                    'total_time_saved_minutes': total_time_saved,
                    'total_time_saved_hours': round(total_time_saved / 60.0, 2),
                    'estimated_fuel_cost_savings': round(estimated_fuel_savings, 2),
                    'estimated_driver_cost_savings': round(estimated_driver_cost_savings, 2),
                    'total_estimated_savings': round(total_estimated_savings, 2)
                },
                'by_type': [
                    {
                        'type': type_name,
                        'count': stats['count'],
                        'distance_saved_km': round(stats['distance_saved'], 2),
                        'time_saved_hours': round(stats['time_saved'] / 60.0, 2)
                    }
                    for type_name, stats in by_type.items()
                ]
            })

        except Exception as e:
            logger.error(f"Error calculating optimization savings: {str(e)}")
            return Response(
                {'error': f'Error calculating optimization savings: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def planning_accuracy_trend(self, request):
        """
        Get planning accuracy trend over time.

        Shows how well planned vs actual metrics align over weeks/months.
        """
        try:
            weeks = int(request.query_params.get('weeks', 12))

            trend_data = []
            today = timezone.now().date()
            week_start = today - timedelta(days=today.weekday())

            for i in range(weeks):
                current_week_start = week_start - timedelta(weeks=i)
                current_week_end = current_week_start + timedelta(days=6)

                # Get completed routes for this week
                week_routes = Route.objects.filter(
                    date__gte=current_week_start,
                    date__lte=current_week_end,
                    status='completed',
                    total_distance__isnull=False,
                    actual_distance__isnull=False
                )

                accuracy_list = []
                for route in week_routes:
                    planned = float(route.total_distance)
                    actual = float(route.actual_distance)
                    if planned > 0:
                        accuracy = (min(planned, actual) / max(planned, actual)) * 100
                        accuracy_list.append(accuracy)

                avg_accuracy = sum(accuracy_list) / len(accuracy_list) if accuracy_list else None

                trend_data.append({
                    'week_start': current_week_start.isoformat(),
                    'week_end': current_week_end.isoformat(),
                    'routes_count': week_routes.count(),
                    'average_accuracy': round(avg_accuracy, 2) if avg_accuracy else None,
                    'meets_90_percent_target': avg_accuracy >= 90 if avg_accuracy else None
                })

            # Reverse to show chronologically
            trend_data.reverse()

            return Response({
                'weeks': trend_data,
                'overall_average': round(
                    sum(w['average_accuracy'] for w in trend_data if w['average_accuracy']) /
                    len([w for w in trend_data if w['average_accuracy']]),
                    2
                ) if any(w['average_accuracy'] for w in trend_data) else None
            })

        except Exception as e:
            logger.error(f"Error calculating planning accuracy trend: {str(e)}")
            return Response(
                {'error': f'Error calculating planning accuracy trend: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
