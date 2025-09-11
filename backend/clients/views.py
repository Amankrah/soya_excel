from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, F
from django.utils import timezone
from .models import Farmer, FeedStorage, Order
from .serializers import FarmerSerializer, FeedStorageSerializer, OrderSerializer


class FarmerViewSet(viewsets.ModelViewSet):
    queryset = Farmer.objects.select_related('feed_storage').prefetch_related('orders')
    serializer_class = FarmerSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['is_active']
    search_fields = ['name', 'phone_number', 'email', 'address']
    ordering_fields = ['name', 'created_at']
    
    @action(detail=True, methods=['get'])
    def orders(self, request, pk=None):
        """Get all orders for a specific farmer"""
        farmer = self.get_object()
        orders = farmer.orders.all()
        serializer = OrderSerializer(orders, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        """Get farmers with low feed stock"""
        farmers = Farmer.objects.select_related('feed_storage').filter(
            feed_storage__isnull=False,
            feed_storage__is_low_stock=True
        )
        serializer = self.get_serializer(farmers, many=True)
        return Response(serializer.data)
    
    def get_queryset(self):
        """Override to ensure feed_storage is always prefetched"""
        return Farmer.objects.select_related('feed_storage').prefetch_related('orders')
    
    @action(detail=True, methods=['post'])
    def geocode_address(self, request, pk=None):
        """Geocode farmer's address and update coordinates"""
        farmer = self.get_object()
        
        if not farmer.address:
            return Response(
                {'error': 'Farmer has no address to geocode'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            result = farmer.geocode_address(save=True)
            
            if result:
                return Response({
                    'success': True,
                    'farmer_id': farmer.id,
                    'geocoding_result': result,
                    'coordinates': farmer.coordinates_tuple
                })
            else:
                return Response(
                    {'error': 'Could not geocode the address'},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
        except Exception as e:
            return Response(
                {'error': f'Geocoding service error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def validate_address(self, request, pk=None):
        """Validate farmer's address using Google Maps"""
        farmer = self.get_object()
        
        if not farmer.address:
            return Response(
                {'error': 'Farmer has no address to validate'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            validation_result = farmer.validate_address()
            
            return Response({
                'farmer_id': farmer.id,
                'current_address': farmer.address,
                'validation_result': validation_result,
                'address_quality_score': farmer.address_quality_score
            })
            
        except Exception as e:
            return Response(
                {'error': f'Address validation error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'])
    def validate_new_address(self, request):
        """Validate an address before saving (for form validation)"""
        address = request.data.get('address')
        province = request.data.get('province')
        
        if not address:
            return Response(
                {'error': 'Address is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from route.services import GoogleMapsService
            
            maps_service = GoogleMapsService()
            validation_result = maps_service.validate_canadian_address(address)
            
            return Response({
                'address': address,
                'province': province,
                'validation_result': validation_result
            })
            
        except ValueError as ve:
            return Response(
                {'error': 'Google Maps API not configured properly', 'details': str(ve)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            return Response(
                {'error': f'Address validation error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def address_quality_report(self, request):
        """Get a report on address quality for all farmers"""
        farmers = self.get_queryset()
        
        report = {
            'total_farmers': farmers.count(),
            'farmers_with_coordinates': farmers.filter(
                latitude__isnull=False, 
                longitude__isnull=False
            ).count(),
            'farmers_without_addresses': farmers.filter(
                address__isnull=True
            ).union(farmers.filter(address='')).count(),
            'address_quality_distribution': {
                'excellent': 0,  # 90-100
                'good': 0,       # 70-89
                'fair': 0,       # 50-69
                'poor': 0        # 0-49
            },
            'farmers_by_province': {}
        }
        
        # Calculate quality distribution
        for farmer in farmers:
            quality_score = farmer.address_quality_score
            if quality_score >= 90:
                report['address_quality_distribution']['excellent'] += 1
            elif quality_score >= 70:
                report['address_quality_distribution']['good'] += 1
            elif quality_score >= 50:
                report['address_quality_distribution']['fair'] += 1
            else:
                report['address_quality_distribution']['poor'] += 1
            
            # Province distribution
            province = farmer.province or 'Unknown'
            if province not in report['farmers_by_province']:
                report['farmers_by_province'][province] = {
                    'total': 0,
                    'with_coordinates': 0
                }
            report['farmers_by_province'][province]['total'] += 1
            if farmer.has_coordinates:
                report['farmers_by_province'][province]['with_coordinates'] += 1
        
        return Response(report)


class FeedStorageViewSet(viewsets.ModelViewSet):
    queryset = FeedStorage.objects.all()
    serializer_class = FeedStorageSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['farmer', 'is_low_stock']
    search_fields = ['sensor_id', 'farmer__name']
    
    @action(detail=True, methods=['post'])
    def update_quantity(self, request, pk=None):
        """Update feed quantity from IoT sensor"""
        feed_storage = self.get_object()
        quantity = request.data.get('current_quantity')
        
        if quantity is None:
            return Response(
                {'error': 'current_quantity is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        feed_storage.current_quantity = quantity
        feed_storage.save()
        
        serializer = self.get_serializer(feed_storage)
        return Response(serializer.data)


class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.select_related(
        'farmer', 'assigned_route', 'assigned_driver', 'assigned_vehicle', 
        'approved_by', 'created_by'
    ).prefetch_related('farmer__feed_storage')
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['farmer', 'status', 'order_type', 'delivery_method', 'priority', 'is_urgent']
    search_fields = ['order_number', 'expedition_number', 'farmer__name', 'notes']
    ordering_fields = ['order_date', 'expected_delivery_date', 'priority', 'quantity']
    
    def get_queryset(self):
        """Enhanced queryset with filtering and ordering"""
        queryset = super().get_queryset()
        
        # Filter by date range
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            queryset = queryset.filter(order_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(order_date__lte=end_date)
        
        # Filter by delivery urgency
        urgency = self.request.query_params.get('urgency')
        if urgency == 'overdue':
            queryset = queryset.filter(
                expected_delivery_date__lt=timezone.now(),
                status__in=['pending', 'confirmed', 'planned']
            )
        elif urgency == 'due_soon':
            queryset = queryset.filter(
                expected_delivery_date__lte=timezone.now() + timezone.timedelta(days=3),
                status__in=['pending', 'confirmed', 'planned']
            )
        
        # Filter by approval status
        requires_approval = self.request.query_params.get('requires_approval')
        if requires_approval == 'true':
            queryset = queryset.filter(requires_approval=True)
        elif requires_approval == 'false':
            queryset = queryset.filter(requires_approval=False)
        
        # Default ordering by priority and urgency
        if not self.request.query_params.get('ordering'):
            queryset = queryset.order_by('-is_urgent', '-priority', 'expected_delivery_date')
        
        return queryset
    
    def perform_create(self, serializer):
        """Enhanced order creation with business logic"""
        order = serializer.save(created_by=self.request.user)
        
        # Auto-generate order number if not provided
        if not order.order_number:
            order.order_number = f"ORD-{timezone.now().strftime('%Y%m%d')}-{order.pk:04d}"
            order.save()
        
        # Check if order requires approval
        if order.requires_approval:
            # Could send notification to managers here
            pass
        
        # Check for low stock alerts
        if hasattr(order.farmer, 'feed_storage') and order.farmer.feed_storage:
            storage = order.farmer.feed_storage
            if storage.is_low_stock:
                # Could send notification here
                pass
    
    def perform_update(self, serializer):
        """Enhanced order update with validation"""
        old_status = self.get_object().status
        order = serializer.save()
        
        # Handle status transitions
        if old_status != order.status:
            self._handle_status_transition(order, old_status)
    
    def _handle_status_transition(self, order, old_status):
        """Handle order status transitions with business logic"""
        if order.status == 'delivered' and old_status != 'delivered':
            order.actual_delivery_date = timezone.now()
            order.save()
            
            # Update farmer's feed storage
            if hasattr(order.farmer, 'feed_storage') and order.farmer.feed_storage:
                storage = order.farmer.feed_storage
                storage.current_quantity += order.quantity
                storage.save()
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve an order that requires approval"""
        order = self.get_object()
        
        if not order.requires_approval:
            return Response(
                {'error': 'Order does not require approval'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        success = order.approve_order(request.user)
        if success:
            serializer = self.get_serializer(order)
            return Response(serializer.data)
        else:
            return Response(
                {'error': 'Failed to approve order'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirm a pending order"""
        order = self.get_object()
        
        if not order.can_be_confirmed:
            return Response(
                {'error': 'Order cannot be confirmed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        success = order.confirm_order()
        if success:
            serializer = self.get_serializer(order)
            return Response(serializer.data)
        else:
            return Response(
                {'error': 'Failed to confirm order'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def plan(self, request, pk=None):
        """Plan an order for delivery"""
        order = self.get_object()
        planning_week = request.data.get('planning_week')
        
        if not planning_week:
            return Response(
                {'error': 'Planning week is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not order.can_be_planned:
            return Response(
                {'error': 'Order cannot be planned'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        success = order.plan_order(planning_week)
        if success:
            serializer = self.get_serializer(order)
            return Response(serializer.data)
        else:
            return Response(
                {'error': 'Failed to plan order'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def assign_route(self, request, pk=None):
        """Assign order to a delivery route"""
        order = self.get_object()
        route_id = request.data.get('route_id')
        driver_id = request.data.get('driver_id')
        vehicle_id = request.data.get('vehicle_id')
        
        if not route_id:
            return Response(
                {'error': 'Route ID is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from route.models import Route
            from driver.models import Driver, Vehicle
            
            route = Route.objects.get(id=route_id)
            driver = Driver.objects.get(id=driver_id) if driver_id else None
            vehicle = Vehicle.objects.get(id=vehicle_id) if vehicle_id else None
            
            success = order.assign_to_route(route, driver, vehicle)
            if success:
                serializer = self.get_serializer(order)
                return Response(serializer.data)
            else:
                return Response(
                    {'error': 'Failed to assign order to route'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except (Route.DoesNotExist, Driver.DoesNotExist, Vehicle.DoesNotExist):
            return Response(
                {'error': 'Invalid route, driver, or vehicle ID'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """Update order status with validation"""
        order = self.get_object()
        new_status = request.data.get('status')
        
        if new_status not in dict(Order.STATUS_CHOICES):
            return Response(
                {'error': 'Invalid status'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        old_status = order.status
        order.status = new_status
        
        # Handle special status transitions
        if new_status == 'delivered':
            order.actual_delivery_date = timezone.now()
        elif new_status == 'cancelled':
            # Could add cancellation reason here
            pass
        
        order.save()
        
        # Handle status transition logic
        self._handle_status_transition(order, old_status)
        
        serializer = self.get_serializer(order)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def pending(self, request):
        """Get all pending orders"""
        orders = self.get_queryset().filter(status='pending')
        serializer = self.get_serializer(orders, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def requires_approval(self, request):
        """Get all orders that require approval"""
        orders = self.get_queryset().filter(requires_approval=True)
        serializer = self.get_serializer(orders, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def urgent(self, request):
        """Get all urgent orders"""
        orders = self.get_queryset().filter(is_urgent=True)
        serializer = self.get_serializer(orders, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """Get all overdue orders"""
        orders = self.get_queryset().filter(
            expected_delivery_date__lt=timezone.now(),
            status__in=['pending', 'confirmed', 'planned']
        )
        serializer = self.get_serializer(orders, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get order summary statistics"""
        total_orders = Order.objects.count()
        pending_orders = Order.objects.filter(status='pending').count()
        confirmed_orders = Order.objects.filter(status='confirmed').count()
        planned_orders = Order.objects.filter(status='planned').count()
        in_transit_orders = Order.objects.filter(status='in_transit').count()
        delivered_today = Order.objects.filter(
            status='delivered',
            actual_delivery_date__date=timezone.now().date()
        ).count()
        requires_approval_count = Order.objects.filter(requires_approval=True).count()
        urgent_orders = Order.objects.filter(is_urgent=True).count()
        
        return Response({
            'total_orders': total_orders,
            'pending_orders': pending_orders,
            'confirmed_orders': confirmed_orders,
            'planned_orders': planned_orders,
            'in_transit_orders': in_transit_orders,
            'delivered_today': delivered_today,
            'requires_approval': requires_approval_count,
            'urgent_orders': urgent_orders,
        })
