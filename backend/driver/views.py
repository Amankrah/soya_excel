from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Count, Sum, Avg, F
from django.utils import timezone
from datetime import timedelta
from .models import Driver, Delivery, DeliveryItem, Vehicle
from .serializers import (
    DriverSerializer, DeliverySerializer, 
    DeliveryCreateSerializer, DeliveryItemSerializer, VehicleSerializer
)
from clients.models import Order
from route.models import Route


class DriverViewSet(viewsets.ModelViewSet):
    queryset = Driver.objects.select_related('user', 'assigned_vehicle').prefetch_related('deliveries')
    serializer_class = DriverSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['is_available', 'assigned_vehicle__vehicle_type']
    search_fields = ['full_name', 'staff_id', 'phone_number']
    ordering_fields = ['full_name', 'created_at', 'total_deliveries_completed']
    
    def get_queryset(self):
        """Enhanced queryset with filtering and performance metrics"""
        queryset = super().get_queryset()
        
        # Filter by availability
        availability = self.request.query_params.get('availability')
        if availability == 'available':
            queryset = queryset.filter(is_available=True)
        elif availability == 'unavailable':
            queryset = queryset.filter(is_available=False)
        
        # Filter by vehicle type
        vehicle_type = self.request.query_params.get('vehicle_type')
        if vehicle_type:
            queryset = queryset.filter(assigned_vehicle__vehicle_type=vehicle_type)
        
        # Filter by performance metrics
        min_deliveries = self.request.query_params.get('min_deliveries')
        if min_deliveries:
            queryset = queryset.filter(total_deliveries_completed__gte=min_deliveries)
        
        return queryset
    
    @action(detail=True, methods=['post'])
    def toggle_availability(self, request, pk=None):
        """Toggle driver availability"""
        driver = self.get_object()
        driver.is_available = not driver.is_available
        driver.save()
        serializer = self.get_serializer(driver)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def assign_vehicle(self, request, pk=None):
        """Assign a vehicle to a driver"""
        driver = self.get_object()
        vehicle_id = request.data.get('vehicle_id')
        
        if not vehicle_id:
            return Response(
                {'error': 'vehicle_id is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            vehicle = Vehicle.objects.get(id=vehicle_id)
            driver.assigned_vehicle = vehicle
            driver.save()
            serializer = self.get_serializer(driver)
            return Response(serializer.data)
        except Vehicle.DoesNotExist:
            return Response(
                {'error': 'Vehicle not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['post'])
    def unassign_vehicle(self, request, pk=None):
        """Unassign vehicle from driver"""
        driver = self.get_object()
        driver.assigned_vehicle = None
        driver.save()
        serializer = self.get_serializer(driver)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def deliveries(self, request, pk=None):
        """Get all deliveries for a specific driver"""
        driver = self.get_object()
        deliveries = driver.deliveries.select_related('route', 'vehicle').prefetch_related('items')
        serializer = DeliverySerializer(deliveries, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def performance_metrics(self, request, pk=None):
        """Get driver performance metrics"""
        driver = self.get_object()
        
        # Calculate metrics for the last 30 days
        thirty_days_ago = timezone.now() - timedelta(days=30)
        recent_deliveries = driver.deliveries.filter(
            assigned_date__gte=thirty_days_ago,
            status='completed'
        )
        
        metrics = {
            'total_deliveries_completed': driver.total_deliveries_completed,
            'total_km_driven': float(driver.total_km_driven),
            'average_delivery_rating': float(driver.average_delivery_rating) if driver.average_delivery_rating else None,
            'recent_deliveries_count': recent_deliveries.count(),
            'recent_km_driven': float(recent_deliveries.aggregate(
                total_km=Sum('actual_distance_km') or 0
            )['total_km']),
            'recent_quantity_delivered': float(recent_deliveries.aggregate(
                total_quantity=Sum('total_quantity_delivered') or 0
            )['total_quantity']),
            'current_active_deliveries': driver.deliveries.filter(
                status__in=['assigned', 'in_progress']
            ).count()
        }
        
        return Response(metrics)
    
    # Note: Direct order-to-driver assignment not implemented in current data model
    # Orders are assigned to Routes, and Routes have Deliveries assigned to Drivers
    # @action(detail=True, methods=['get'])
    # def assigned_orders(self, request, pk=None):
    #     """Get orders assigned to this driver"""
    #     driver = self.get_object()
    #     orders = driver.assigned_orders.select_related('farmer', 'assigned_route').order_by('-order_date')
    #     from clients.serializers import OrderSerializer
    #     serializer = OrderSerializer(orders, many=True)
    #     return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def assigned_routes(self, request, pk=None):
        """Get routes assigned to this driver with Google Maps navigation"""
        driver = self.get_object()

        # Get active deliveries for this driver
        deliveries = driver.deliveries.filter(
            status__in=['assigned', 'in_progress']
        ).select_related('route', 'vehicle').prefetch_related('route__stops')

        serializer = DeliverySerializer(
            deliveries,
            many=True,
            context={'request': request}  # Pass request for user agent detection
        )

        return Response({
            'driver_id': driver.id,
            'driver_name': driver.full_name,
            'active_routes': serializer.data
        })

    @action(detail=True, methods=['get'])
    def current_route_navigation(self, request, pk=None):
        """Get detailed navigation for driver's current active route"""
        from route.google_maps_integration import GoogleMapsRouteSharing

        driver = self.get_object()

        # Get current active delivery
        active_delivery = driver.deliveries.filter(
            status='in_progress'
        ).select_related('route').first()

        if not active_delivery:
            # Try assigned deliveries
            active_delivery = driver.deliveries.filter(
                status='assigned'
            ).select_related('route').first()

        if not active_delivery or not active_delivery.route:
            return Response(
                {'error': 'No active route found for this driver'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            maps_service = GoogleMapsRouteSharing()
            route_summary = maps_service.create_route_summary_for_driver(active_delivery.route.id)

            return Response({
                'delivery_id': active_delivery.id,
                'delivery_status': active_delivery.status,
                **route_summary
            })

        except Exception as e:
            return Response(
                {'error': f'Error generating navigation: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def available(self, request):
        """Get all available drivers"""
        drivers = self.get_queryset().filter(is_available=True)
        serializer = self.get_serializer(drivers, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def performance_summary(self, request):
        """Get performance summary for all drivers"""
        drivers = self.get_queryset()
        
        summary = {
            'total_drivers': drivers.count(),
            'available_drivers': drivers.filter(is_available=True).count(),
            'total_deliveries': drivers.aggregate(
                total=Sum('total_deliveries_completed') or 0
            )['total'],
            'total_km': float(drivers.aggregate(
                total_km=Sum('total_km_driven') or 0
            )['total_km']),
            'average_rating': float(drivers.aggregate(
                avg_rating=Avg('average_delivery_rating') or 0
            )['avg_rating']),
            'top_performers': drivers.order_by('-total_deliveries_completed')[:5].values(
                'id', 'full_name', 'total_deliveries_completed', 'total_km_driven'
            )
        }
        
        return Response(summary)


class DeliveryViewSet(viewsets.ModelViewSet):
    queryset = Delivery.objects.select_related(
        'driver', 'vehicle', 'route'
    ).prefetch_related('items__order', 'items__farmer')
    serializer_class = DeliverySerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['driver', 'route', 'status', 'vehicle']
    search_fields = ['driver__full_name', 'route__name', 'notes']
    ordering_fields = ['assigned_date', 'start_time', 'end_time']
    
    def get_queryset(self):
        """Enhanced queryset with filtering"""
        queryset = super().get_queryset()
        
        # Filter by date range
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            queryset = queryset.filter(assigned_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(assigned_date__lte=end_date)
        
        # Filter by delivery status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by driver
        driver_id = self.request.query_params.get('driver_id')
        if driver_id:
            queryset = queryset.filter(driver_id=driver_id)
        
        # Filter by route
        route_id = self.request.query_params.get('route_id')
        if route_id:
            queryset = queryset.filter(route_id=route_id)
        
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'create':
            return DeliveryCreateSerializer
        return DeliverySerializer
    
    @action(detail=True, methods=['post'])
    def start_delivery(self, request, pk=None):
        """Mark delivery as in progress"""
        delivery = self.get_object()
        if delivery.status != 'assigned':
            return Response(
                {'error': 'Delivery must be in assigned status to start'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        delivery.status = 'in_progress'
        delivery.start_time = timezone.now()
        delivery.save()
        
        # Update driver availability
        delivery.driver.is_available = False
        delivery.driver.save()
        
        serializer = self.get_serializer(delivery)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def complete_delivery(self, request, pk=None):
        """Mark delivery as completed"""
        delivery = self.get_object()
        if delivery.status != 'in_progress':
            return Response(
                {'error': 'Delivery must be in progress to complete'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        delivery.status = 'completed'
        delivery.end_time = timezone.now()
        
        # Calculate total quantity delivered
        total_quantity = sum(
            float(item.quantity_delivered or 0) 
            for item in delivery.items.all()
        )
        delivery.total_quantity_delivered = total_quantity
        
        # Calculate actual distance and duration if provided
        actual_distance = request.data.get('actual_distance_km')
        if actual_distance:
            delivery.actual_distance_km = actual_distance
        
        actual_duration = request.data.get('actual_duration_minutes')
        if actual_duration:
            delivery.actual_duration_minutes = actual_duration
        
        delivery.save()
        
        # Update driver availability and performance metrics
        delivery.driver.is_available = True
        delivery.driver.total_deliveries_completed += 1
        if delivery.actual_distance_km:
            delivery.driver.total_km_driven += delivery.actual_distance_km
        delivery.driver.save()
        
        # Update order statuses
        for item in delivery.items.all():
            if item.order:
                item.order.status = 'delivered'
                item.order.actual_delivery_date = timezone.now()
                item.order.save()
        
        serializer = self.get_serializer(delivery)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def update_location(self, request, pk=None):
        """Update delivery location and GPS data"""
        delivery = self.get_object()
        
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        gps_data = request.data.get('gps_data', {})
        
        if latitude and longitude:
            delivery.driver.current_location_lat = latitude
            delivery.driver.current_location_lng = longitude
            delivery.driver.last_location_update = timezone.now()
            delivery.driver.save()
        
        if gps_data:
            delivery.gps_tracking_data.update(gps_data)
            delivery.save()
        
        serializer = self.get_serializer(delivery)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get all active deliveries"""
        deliveries = self.get_queryset().filter(
            status__in=['assigned', 'in_progress']
        )
        serializer = self.get_serializer(deliveries, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """Get overdue deliveries"""
        from django.utils import timezone
        overdue_deliveries = self.get_queryset().filter(
            status__in=['assigned', 'in_progress'],
            route__date__lt=timezone.now().date()
        )
        serializer = self.get_serializer(overdue_deliveries, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def today(self, request):
        """Get today's deliveries"""
        from django.utils import timezone
        today = timezone.now().date()
        today_deliveries = self.get_queryset().filter(
            route__date=today
        )
        serializer = self.get_serializer(today_deliveries, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def performance_summary(self, request):
        """Get delivery performance summary"""
        # Get date range from query params
        days = int(request.query_params.get('days', 30))
        start_date = timezone.now() - timedelta(days=days)
        
        deliveries = self.get_queryset().filter(
            assigned_date__gte=start_date,
            status='completed'
        )
        
        summary = {
            'total_deliveries': deliveries.count(),
            'total_quantity_delivered': float(deliveries.aggregate(
                total=Sum('total_quantity_delivered') or 0
            )['total']),
            'total_distance_km': float(deliveries.aggregate(
                total=Sum('actual_distance_km') or 0
            )['total']),
            'average_km_per_tonne': float(deliveries.aggregate(
                avg=Avg('km_per_tonne') or 0
            )['avg']),
            'on_time_deliveries': deliveries.filter(
                end_time__lte=F('route__estimated_duration')
            ).count(),
            'delivery_efficiency': float(deliveries.aggregate(
                avg=Avg('efficiency_rating') or 0
            )['avg'])
        }
        
        return Response(summary)


class VehicleViewSet(viewsets.ModelViewSet):
    queryset = Vehicle.objects.prefetch_related('assigned_drivers', 'deliveries')
    serializer_class = VehicleSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['vehicle_type', 'status']
    search_fields = ['vehicle_number', 'make_model']
    ordering_fields = ['vehicle_number', 'created_at', 'capacity_tonnes']
    
    def get_queryset(self):
        """Enhanced queryset with filtering"""
        queryset = super().get_queryset()
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by vehicle type
        vehicle_type = self.request.query_params.get('vehicle_type')
        if vehicle_type:
            queryset = queryset.filter(vehicle_type=vehicle_type)
        
        # Filter by availability
        available = self.request.query_params.get('available')
        if available == 'true':
            queryset = queryset.filter(assigned_drivers__isnull=True)
        elif available == 'false':
            queryset = queryset.filter(assigned_drivers__isnull=False)
        
        return queryset
    
    @action(detail=True, methods=['post'])
    def assign_driver(self, request, pk=None):
        """Assign a driver to this vehicle"""
        vehicle = self.get_object()
        driver_id = request.data.get('driver_id')
        
        if not driver_id:
            return Response(
                {'error': 'driver_id is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            driver = Driver.objects.get(id=driver_id)
            
            # Check if driver already has a vehicle
            if driver.assigned_vehicle:
                return Response(
                    {'error': 'Driver already has an assigned vehicle'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if vehicle is already assigned
            if vehicle.assigned_drivers.exists():
                return Response(
                    {'error': 'Vehicle is already assigned to a driver'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Update driver's assigned vehicle
            driver.assigned_vehicle = vehicle
            driver.save()
            
            serializer = self.get_serializer(vehicle)
            return Response(serializer.data)
        except Driver.DoesNotExist:
            return Response(
                {'error': 'Driver not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['post'])
    def unassign_driver(self, request, pk=None):
        """Unassign driver from this vehicle"""
        vehicle = self.get_object()
        
        if not vehicle.assigned_drivers.exists():
            return Response(
                {'error': 'Vehicle has no assigned driver'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update driver's assigned vehicle
        driver = vehicle.assigned_drivers.first()
        driver.assigned_vehicle = None
        driver.save()
        
        serializer = self.get_serializer(vehicle)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def update_maintenance(self, request, pk=None):
        """Update vehicle maintenance information"""
        vehicle = self.get_object()
        
        maintenance_status = request.data.get('maintenance_status')
        maintenance_notes = request.data.get('maintenance_notes')
        next_maintenance_date = request.data.get('next_maintenance_date')
        
        if maintenance_status:
            vehicle.maintenance_status = maintenance_status
        if maintenance_notes:
            vehicle.maintenance_notes = maintenance_notes
        if next_maintenance_date:
            vehicle.next_maintenance_date = next_maintenance_date
        
        vehicle.save()
        serializer = self.get_serializer(vehicle)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def available(self, request):
        """Get all available vehicles (not assigned to any driver)"""
        available_vehicles = self.get_queryset().filter(assigned_drivers__isnull=True)
        serializer = self.get_serializer(available_vehicles, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def maintenance_due(self, request):
        """Get vehicles due for maintenance"""
        from django.utils import timezone
        today = timezone.now().date()
        maintenance_due_vehicles = self.get_queryset().filter(
            next_maintenance_date__lte=today
        )
        serializer = self.get_serializer(maintenance_due_vehicles, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def performance_summary(self, request):
        """Get vehicle performance summary"""
        # Get date range from query params
        days = int(request.query_params.get('days', 30))
        start_date = timezone.now() - timedelta(days=days)
        
        vehicles = self.get_queryset()
        summary = {
            'total_vehicles': vehicles.count(),
            'assigned_vehicles': vehicles.filter(assigned_drivers__isnull=False).count(),
            'available_vehicles': vehicles.filter(assigned_drivers__isnull=True).count(),
            'maintenance_due': vehicles.filter(
                next_maintenance_date__lte=timezone.now().date()
            ).count(),
            'total_deliveries': vehicles.aggregate(
                total=Count('deliveries')
            )['total'] or 0,
            'total_distance_km': float(vehicles.aggregate(
                total=Sum('deliveries__actual_distance_km') or 0
            )['total']),
            'average_km_per_tonne': float(vehicles.aggregate(
                avg=Avg('deliveries__km_per_tonne') or 0
            )['avg'])
        }
        
        return Response(summary)
