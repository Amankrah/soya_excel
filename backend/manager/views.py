from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Count, Sum, F
from django.utils import timezone
from datetime import timedelta
from .models import Manager, SoybeanMealProduct, SupplyInventory, SupplyTransaction, WeeklyDistributionPlan, MonthlyDistributionPlan, KPIMetrics
from .serializers import (
    ManagerSerializer, SupplyInventorySerializer, 
    SupplyTransactionSerializer, WeeklyDistributionPlanSerializer,
    KPIMetricsSerializer, DashboardSerializer
)
from clients.models import Client, Order
from driver.models import Driver, Delivery
from route.models import Route


class ManagerViewSet(viewsets.ModelViewSet):
    queryset = Manager.objects.all()
    serializer_class = ManagerSerializer
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Get dashboard summary data for Soya Excel"""
        # Calculate date ranges
        today = timezone.now().date()
        month_start = today.replace(day=1)
        
        # Get counts
        total_clients = Client.objects.filter(is_active=True).count()
        active_routes = Route.objects.filter(
            status='active',
            date=today
        ).count()
        available_drivers = Driver.objects.filter(is_available=True).count()

        # Prediction-based alerts using date-only comparison (matching client statistics)
        # Overdue clients (past predicted date)
        overdue_alerts = Client.objects.filter(
            is_active=True,
            predicted_next_order_date__isnull=False,
            predicted_next_order_date__date__lt=today
        ).count()

        # Urgent clients (0-3 days, EXCLUDING overdue)
        cutoff_3days = today + timedelta(days=3)
        urgent_alerts = Client.objects.filter(
            is_active=True,
            predicted_next_order_date__isnull=False,
            predicted_next_order_date__date__gte=today,  # NOT overdue (today or future)
            predicted_next_order_date__date__lte=cutoff_3days
        ).count()

        # High priority clients (4-7 days from today)
        high_start = today + timedelta(days=4)
        high_end = today + timedelta(days=7)
        high_priority_alerts = Client.objects.filter(
            is_active=True,
            predicted_next_order_date__isnull=False,
            predicted_next_order_date__date__gte=high_start,
            predicted_next_order_date__date__lte=high_end
        ).count()
        
        # Pending orders
        pending_orders = Order.objects.filter(status='pending').count()
        
        # Monthly deliveries
        monthly_deliveries = Delivery.objects.filter(
            assigned_date__gte=month_start,
            status='completed'
        ).count()
        
        # Inventory status for soybean meal products
        inventory_items = SupplyInventory.objects.select_related('product').all()
        inventory_status = []
        for item in inventory_items:
            inventory_status.append({
                'id': item.id,
                'product_name': item.product.product_name,
                'current_stock': float(item.current_stock),
                'minimum_stock': float(item.minimum_stock),
                'is_low_stock': item.is_low_stock
            })
        
        data = {
            'total_clients': total_clients,
            'active_routes': active_routes,
            'available_drivers': available_drivers,
            'overdue_alerts': overdue_alerts,
            'urgent_alerts': urgent_alerts,
            'high_priority_alerts': high_priority_alerts,
            'pending_orders': pending_orders,
            'monthly_deliveries': monthly_deliveries,
            'inventory_status': inventory_status,
        }
        
        serializer = DashboardSerializer(data)
        return Response(serializer.data)


class SoybeanMealProductViewSet(viewsets.ModelViewSet):
    queryset = SoybeanMealProduct.objects.all()
    permission_classes = [IsAuthenticated]
    filterset_fields = ['product_type', 'primary_origin', 'sustainability_certified', 'is_active']
    search_fields = ['product_name', 'product_code']
    ordering_fields = ['product_name', 'base_price_per_tonne']


class SupplyInventoryViewSet(viewsets.ModelViewSet):
    queryset = SupplyInventory.objects.select_related('product').all()
    serializer_class = SupplyInventorySerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['product__product_type', 'quality_grade']
    search_fields = ['product__product_name', 'product__product_code', 'silo_number']
    ordering_fields = ['product__product_name', 'current_stock']
    
    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        """Get all items with low stock"""
        items = self.get_queryset().filter(
            current_stock__lte=F('minimum_stock')
        )
        serializer = self.get_serializer(items, many=True)
        return Response(serializer.data)


class SupplyTransactionViewSet(viewsets.ModelViewSet):
    queryset = SupplyTransaction.objects.select_related('inventory__product').all()
    serializer_class = SupplyTransactionSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['transaction_type', 'origin_country', 'quality_approved']
    search_fields = ['reference_number', 'description', 'container_number']
    ordering_fields = ['transaction_date']
    
    def perform_create(self, serializer):
        serializer.save(performed_by=self.request.user)


class WeeklyDistributionPlanViewSet(viewsets.ModelViewSet):
    queryset = WeeklyDistributionPlan.objects.all()
    serializer_class = WeeklyDistributionPlanSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['planning_week', 'status', 'planned_on_tuesday', 'finalized_by_friday']
    search_fields = ['plan_name']
    ordering_fields = ['week_start_date', 'created_at']
    
    def perform_create(self, serializer):
        manager = Manager.objects.get(user=self.request.user)
        serializer.save(created_by=manager)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a weekly distribution plan"""
        plan = self.get_object()
        manager = Manager.objects.get(user=request.user)
        
        if not manager.can_approve_plans:
            return Response(
                {'error': 'You do not have permission to approve plans'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        plan.status = 'approved'
        plan.approved_by = manager
        plan.approved_date = timezone.now()
        plan.save()
        
        serializer = self.get_serializer(plan)
        return Response(serializer.data)


class MonthlyDistributionPlanViewSet(viewsets.ModelViewSet):
    queryset = MonthlyDistributionPlan.objects.all()
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status']
    search_fields = ['plan_name']
    ordering_fields = ['month', 'created_at']
    
    def perform_create(self, serializer):
        manager = Manager.objects.get(user=self.request.user)
        serializer.save(created_by=manager)


class KPIMetricsViewSet(viewsets.ModelViewSet):
    queryset = KPIMetrics.objects.all()
    serializer_class = KPIMetricsSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['metric_type', 'period_type', 'trend_direction']
    ordering_fields = ['calculated_at', 'period_end']
    
    @action(detail=False, methods=['get'])
    def soya_excel_kpis(self, request):
        """Get Soya Excel's priority KPIs: KM/TM by product type"""
        period_type = request.query_params.get('period_type', 'weekly')
        
        # Get latest KPIs for each product type
        kpi_types = ['km_per_tonne_trituro_44', 'km_per_tonne_dairy_trituro', 'km_per_tonne_oil']
        
        kpis = {}
        for kpi_type in kpi_types:
            latest_kpi = KPIMetrics.objects.filter(
                metric_type=kpi_type,
                period_type=period_type
            ).order_by('-period_end').first()
            
            if latest_kpi:
                kpis[kpi_type] = {
                    'metric_value': float(latest_kpi.metric_value),
                    'target_value': float(latest_kpi.target_value) if latest_kpi.target_value else None,
                    'trend_direction': latest_kpi.trend_direction,
                    'period_end': latest_kpi.period_end
                }
        
        return Response(kpis)
    
    @action(detail=False, methods=['get'])
    def forecast_accuracy(self, request):
        """Get forecast accuracy metrics"""
        weekly_plans = WeeklyDistributionPlan.objects.filter(
            forecast_accuracy_percentage__isnull=False
        ).order_by('-week_start_date')[:4]  # Last 4 weeks
        
        accuracies = []
        for plan in weekly_plans:
            accuracies.append({
                'week': plan.week_start_date.strftime('%Y-W%V'),
                'accuracy': float(plan.forecast_accuracy_percentage),
                'meets_target': plan.forecast_accuracy_percentage >= 90  # 90-95% target
            })
        
        return Response(accuracies)
