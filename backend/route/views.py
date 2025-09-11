from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Count, F
from django.utils import timezone
import requests
import json
from decimal import Decimal
from .models import Route, RouteStop, RouteOptimization
from .serializers import (
    RouteSerializer, RouteStopSerializer, RouteCreateSerializer,
    RouteOptimizationSerializer, RouteOptimizeSerializer
)
from .services import GoogleMapsService, RouteOptimizationService, LiveTrackingService
from clients.models import Order, Farmer


class RouteViewSet(viewsets.ModelViewSet):
    queryset = Route.objects.all()
    serializer_class = RouteSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status', 'date']
    search_fields = ['name']
    ordering_fields = ['date', 'created_at']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return RouteCreateSerializer
        return RouteSerializer
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def optimize(self, request, pk=None):
        """Optimize route using Google Maps API"""
        route = self.get_object()
        
        try:
            # Get optimization type from request
            optimization_type = request.data.get('optimization_type', 'balanced')
            
            # Initialize Google Maps service
            try:
                maps_service = GoogleMapsService()
            except ValueError as ve:
                return Response(
                    {'error': 'Google Maps API not configured properly', 'details': str(ve)},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Perform optimization
            optimization_result = maps_service.optimize_route(route.id, optimization_type)
            
            if optimization_result['success']:
                # Create optimization record
                optimization = RouteOptimization.objects.create(
                    route=route,
                    optimization_type=optimization_type,
                    request_data={
                        'route_id': route.id,
                        'optimization_type': optimization_type,
                        'stops_count': route.stops.count()
                    },
                    response_data=optimization_result,
                    original_distance=route.total_distance,
                    optimized_distance=Decimal(str(optimization_result.get('optimized_distance', 0))),
                    distance_savings=Decimal(str(max(0, float(route.total_distance or 0) - optimization_result.get('optimized_distance', 0)))),
                    original_duration=route.estimated_duration,
                    optimized_duration=int(optimization_result.get('optimized_duration', 0)),
                    time_savings=max(0, (route.estimated_duration or 0) - int(optimization_result.get('optimized_duration', 0))),
                    success=True,
                    google_maps_used=True,
                    created_by=request.user
                )
                
                # Refresh route from database to get updated data
                route.refresh_from_db()
                serializer = RouteSerializer(route)
                
                return Response({
                    'route': serializer.data,
                    'optimization': RouteOptimizationSerializer(optimization).data,
                    'message': 'Route optimized successfully using Google Maps'
                })
            else:
                # Handle optimization failure
                error_message = optimization_result.get('error', 'Unknown error')
                
                # Create failed optimization record
                RouteOptimization.objects.create(
                    route=route,
                    optimization_type=optimization_type,
                    request_data={
                        'route_id': route.id,
                        'optimization_type': optimization_type,
                        'stops_count': route.stops.count()
                    },
                    response_data=optimization_result,
                    success=False,
                    error_message=error_message,
                    google_maps_used=True,
                    created_by=request.user
                )
                
                return Response(
                    {
                        'error': error_message,
                        'invalid_addresses': optimization_result.get('invalid_addresses', []),
                        'details': 'Route optimization failed. Check address geocoding.'
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
                
        except Exception as e:
            # Create failed optimization record for unexpected errors
            try:
                RouteOptimization.objects.create(
                    route=route,
                    optimization_type=request.data.get('optimization_type', 'balanced'),
                    request_data={'error': 'Unexpected error during optimization'},
                    response_data={'error': str(e)},
                    success=False,
                    error_message=str(e),
                    google_maps_used=False,
                    created_by=request.user
                )
            except:
                pass  # Don't fail if we can't create the error record
            
            return Response(
                {'error': f'Unexpected error during optimization: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Activate a route for delivery"""
        route = self.get_object()
        if route.status not in ['draft', 'planned']:
            return Response(
                {'error': 'Only draft or planned routes can be activated'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        route.status = 'active'
        route.save()
        
        serializer = self.get_serializer(route)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark route as completed"""
        route = self.get_object()
        if route.status != 'active':
            return Response(
                {'error': 'Only active routes can be completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        route.status = 'completed'
        route.save()
        
        # Update all stops as completed
        route.stops.update(is_completed=True)
        
        serializer = self.get_serializer(route)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def today(self, request):
        """Get today's routes"""
        today = timezone.now().date()
        routes = self.get_queryset().filter(date=today)
        serializer = self.get_serializer(routes, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get all active routes"""
        routes = self.get_queryset().filter(status='active')
        serializer = self.get_serializer(routes, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def directions(self, request, pk=None):
        """Get turn-by-turn directions for a route"""
        route = self.get_object()
        
        try:
            maps_service = GoogleMapsService()
            stops = list(route.stops.all().order_by('sequence_number'))
            
            if len(stops) < 2:
                return Response(
                    {'error': 'Route must have at least 2 stops to get directions'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Get addresses or coordinates for each stop
            waypoints = []
            for stop in stops:
                if stop.location_latitude and stop.location_longitude:
                    waypoints.append(f"{stop.location_latitude},{stop.location_longitude}")
                else:
                    # Use farmer's address
                    waypoints.append(stop.farmer.address)
            
            # Get directions from first to last stop with intermediate waypoints
            directions = maps_service.get_directions(
                origin=waypoints[0],
                destination=waypoints[-1],
                waypoints=waypoints[1:-1] if len(waypoints) > 2 else None,
                optimize_waypoints=False  # Keep current order
            )
            
            if directions:
                return Response({
                    'route_id': route.id,
                    'directions': directions,
                    'waypoints_count': len(waypoints)
                })
            else:
                return Response(
                    {'error': 'Could not get directions for this route'},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
        except ValueError as ve:
            return Response(
                {'error': 'Google Maps API not configured properly', 'details': str(ve)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            return Response(
                {'error': f'Error getting directions: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'])
    def geocode_address(self, request):
        """Geocode a Canadian address"""
        address = request.data.get('address')
        province = request.data.get('province')
        
        if not address:
            return Response(
                {'error': 'Address is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            maps_service = GoogleMapsService()
            result = maps_service.validate_canadian_address(address)
            
            return Response(result)
            
        except ValueError as ve:
            return Response(
                {'error': 'Google Maps API not configured properly', 'details': str(ve)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            return Response(
                {'error': f'Error geocoding address: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'])
    def optimize_weekly(self, request):
        """Optimize all routes for a given week"""
        week_start = request.data.get('week_start')
        
        if not week_start:
            return Response(
                {'error': 'week_start date is required (YYYY-MM-DD format)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            optimization_service = RouteOptimizationService()
            result = optimization_service.optimize_weekly_routes(week_start)
            
            return Response(result)
            
        except ValueError as ve:
            return Response(
                {'error': 'Google Maps API not configured properly', 'details': str(ve)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            return Response(
                {'error': f'Error optimizing weekly routes: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def kpis(self, request, pk=None):
        """Get route KPIs (KM/TM ratios, efficiency metrics, etc.)"""
        route = self.get_object()
        
        try:
            optimization_service = RouteOptimizationService()
            kpis = optimization_service.calculate_route_kpis(route.id)
            
            return Response(kpis)
            
        except Exception as e:
            return Response(
                {'error': f'Error calculating route KPIs: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def live_tracking(self, request):
        """Get live vehicle locations for active routes"""
        route_ids = request.query_params.getlist('route_ids')
        
        try:
            tracking_service = LiveTrackingService()
            vehicle_locations = tracking_service.get_active_vehicle_locations(route_ids if route_ids else None)
            
            return Response({
                'vehicles': vehicle_locations,
                'count': len(vehicle_locations),
                'timestamp': timezone.now().isoformat()
            })
            
        except Exception as e:
            return Response(
                {'error': f'Error getting live tracking data: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def delivery_progress(self, request, pk=None):
        """Check delivery progress for a specific route"""
        route = self.get_object()
        
        try:
            tracking_service = LiveTrackingService()
            progress_data = tracking_service.check_delivery_progress(route.id)
            
            return Response(progress_data)
            
        except Exception as e:
            return Response(
                {'error': f'Error checking delivery progress: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class RouteStopViewSet(viewsets.ModelViewSet):
    queryset = RouteStop.objects.all()
    serializer_class = RouteStopSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['route', 'farmer', 'is_completed']
    ordering_fields = ['sequence_number']
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark a stop as completed"""
        stop = self.get_object()
        stop.is_completed = True
        stop.actual_arrival_time = timezone.now()
        stop.save()
        
        # Update the associated order status
        if stop.order:
            stop.order.status = 'delivered'
            stop.order.actual_delivery_date = timezone.now()
            stop.order.save()
        
        serializer = self.get_serializer(stop)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def update_notes(self, request, pk=None):
        """Update delivery notes for a stop"""
        stop = self.get_object()
        notes = request.data.get('notes', '')
        
        stop.delivery_notes = notes
        stop.save()
        
        serializer = self.get_serializer(stop)
        return Response(serializer.data)


class RouteOptimizationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = RouteOptimization.objects.all()
    serializer_class = RouteOptimizationSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['route', 'success', 'optimization_type']
    ordering_fields = ['created_at']
