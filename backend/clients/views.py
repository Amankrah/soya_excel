from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, F, Sum, Count, Max, Min, Avg, Case, When, Value, IntegerField
from django.db.models.functions import TruncMonth, TruncYear, ExtractYear
from django.utils import timezone
from datetime import timedelta, datetime
from decimal import Decimal
from .models import Client, Order
from .serializers import ClientSerializer, OrderSerializer
from .models_analytics import AnalyticsCache


class ClientViewSet(viewsets.ModelViewSet):
    """ViewSet for Client model with AI prediction support"""
    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['is_active', 'country', 'priority', 'has_contract']
    search_fields = ['name', 'city', 'postal_code', 'address', 'account_manager']
    ordering_fields = ['name', 'created_at', 'predicted_next_order_date', 'historical_monthly_usage']

    def get_queryset(self):
        """Enhanced queryset with filtering"""
        queryset = super().get_queryset()

        # Filter by priority
        priority = self.request.query_params.get('priority')
        if priority:
            queryset = queryset.filter(priority=priority)

        # Filter by country
        country = self.request.query_params.get('country')
        if country:
            queryset = queryset.filter(country=country)

        # Filter by active status
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')

        # Filter by urgent predictions (predicted to order within 3 days)
        urgent_only = self.request.query_params.get('urgent_only')
        if urgent_only == 'true':
            urgent_date = timezone.now() + timedelta(days=3)
            queryset = queryset.filter(
                predicted_next_order_date__isnull=False,
                predicted_next_order_date__lte=urgent_date
            )

        # Filter by has coordinates
        has_coordinates = self.request.query_params.get('has_coordinates')
        if has_coordinates == 'true':
            queryset = queryset.filter(latitude__isnull=False, longitude__isnull=False)
        elif has_coordinates == 'false':
            queryset = queryset.filter(Q(latitude__isnull=True) | Q(longitude__isnull=True))

        # Default ordering by name
        if not self.request.query_params.get('ordering'):
            queryset = queryset.order_by('name')

        return queryset

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Get client statistics including AI predictions"""
        clients = self.get_queryset()

        total_clients = clients.count()
        active_clients = clients.filter(is_active=True).count()

        # Prediction statistics
        clients_with_predictions = clients.filter(predicted_next_order_date__isnull=False).count()

        # Calculate urgent clients (property, can't filter directly)
        # Urgent = predicted to order within 3 days or overdue
        urgent_date = timezone.now() + timedelta(days=3)
        urgent_clients = clients.filter(
            predicted_next_order_date__isnull=False,
            predicted_next_order_date__lte=urgent_date
        ).count()

        # Priority breakdown
        priority_breakdown = {
            'high': clients.filter(priority='high').count(),
            'medium': clients.filter(priority='medium').count(),
            'low': clients.filter(priority='low').count(),
        }

        # Country breakdown
        country_breakdown = {}
        for country in clients.values_list('country', flat=True).distinct():
            if country:
                country_breakdown[country] = clients.filter(country=country).count()

        # Get clients with upcoming orders (next 7 days)
        upcoming_date = timezone.now() + timedelta(days=7)
        upcoming_orders = clients.filter(
            predicted_next_order_date__lte=upcoming_date,
            predicted_next_order_date__gte=timezone.now()
        ).count()

        return Response({
            'total_clients': total_clients,
            'active_clients': active_clients,
            'inactive_clients': total_clients - active_clients,
            'predictions': {
                'clients_with_predictions': clients_with_predictions,
                'urgent_clients': urgent_clients,
                'upcoming_orders_7_days': upcoming_orders,
            },
            'priority_breakdown': priority_breakdown,
            'country_breakdown': country_breakdown,
        })

    @action(detail=True, methods=['post'])
    def update_prediction(self, request, pk=None):
        """Update AI prediction for a specific client"""
        client = self.get_object()

        from clients.services import get_prediction_service
        service = get_prediction_service()

        if not service.model_loaded:
            return Response(
                {'error': 'Prediction model not loaded'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        success = service.update_client_prediction(client)

        if success:
            serializer = self.get_serializer(client)
            return Response(serializer.data)
        else:
            return Response(
                {'error': 'Failed to update prediction'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['post'])
    def update_predictions(self, request):
        """Bulk update AI predictions for all clients"""
        from clients.services import get_prediction_service
        service = get_prediction_service()

        if not service.model_loaded:
            return Response(
                {'error': 'Prediction model not loaded'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Get all active clients
        clients = Client.objects.filter(is_active=True)

        success_count = 0
        fail_count = 0

        for client in clients:
            if service.update_client_prediction(client):
                success_count += 1
            else:
                fail_count += 1

        return Response({
            'success': True,
            'updated': success_count,
            'failed': fail_count,
            'total': clients.count()
        })

    @action(detail=True, methods=['post'])
    def geocode_address(self, request, pk=None):
        """Geocode client's address and update coordinates"""
        client = self.get_object()

        if not client.full_address:
            return Response(
                {'error': 'Client has no address to geocode'},
                status=status.HTTP_400_BAD_REQUEST
            )

        success = client.update_coordinates_if_missing()

        if success:
            serializer = self.get_serializer(client)
            return Response(serializer.data)
        else:
            return Response(
                {'error': 'Failed to geocode address'},
                status=status.HTTP_400_BAD_REQUEST
            )


class OrderViewSet(viewsets.ModelViewSet):
    """ViewSet for Order model with batch aggregation support"""
    queryset = Order.objects.select_related('client').all()
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['client', 'status', 'product_name']
    search_fields = ['client_order_number', 'expedition_number', 'product_name', 'client__name']
    ordering_fields = ['sales_order_creation_date', 'actual_expedition_date', 'total_amount_delivered_tm']

    def get_queryset(self):
        """Enhanced queryset with filtering"""
        queryset = super().get_queryset()

        # Filter by date range
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            queryset = queryset.filter(sales_order_creation_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(sales_order_creation_date__lte=end_date)

        # Filter by client
        client_id = self.request.query_params.get('client_id')
        if client_id:
            queryset = queryset.filter(client_id=client_id)

        # Filter by status
        order_status = self.request.query_params.get('status')
        if order_status:
            queryset = queryset.filter(status=order_status)

        # Filter by product
        product_name = self.request.query_params.get('product_name')
        if product_name:
            queryset = queryset.filter(product_name=product_name)

        # Default ordering by date descending
        if not self.request.query_params.get('ordering'):
            queryset = queryset.order_by('-sales_order_creation_date')

        return queryset

    def list(self, request, *args, **kwargs):
        """
        List orders with batch aggregation.
        Orders with the same client_order_number are aggregated into a single entry.
        """
        queryset = self.filter_queryset(self.get_queryset())

        # Get unique order numbers
        unique_order_numbers = queryset.values_list('client_order_number', flat=True).distinct()

        # Aggregate batches for each order
        aggregated_orders = []
        for order_number in unique_order_numbers:
            combined = Order.combine_batches(order_number)
            if combined:
                # Convert Client object to serializable format
                client = combined['client']
                combined['client'] = {
                    'id': client.id,
                    'name': client.name,
                    'city': client.city,
                    'country': client.country,
                }
                # Convert datetime objects to ISO format strings
                if combined.get('order_date'):
                    combined['order_date'] = combined['order_date'].isoformat()
                if combined.get('final_delivery_date'):
                    combined['final_delivery_date'] = combined['final_delivery_date'].isoformat()
                if combined.get('promised_date'):
                    combined['promised_date'] = combined['promised_date'].isoformat()

                # Convert Decimal to float for JSON serialization
                if combined.get('total_ordered'):
                    combined['total_ordered'] = float(combined['total_ordered'])
                if combined.get('total_delivered'):
                    combined['total_delivered'] = float(combined['total_delivered'])

                aggregated_orders.append(combined)

        # Sort by date
        aggregated_orders.sort(key=lambda x: x['order_date'] if x['order_date'] else '', reverse=True)

        # Pagination
        page = self.paginate_queryset(aggregated_orders)
        if page is not None:
            return self.get_paginated_response(page)

        return Response(aggregated_orders)

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Get order statistics"""
        queryset = self.get_queryset()

        # Aggregate by order first to avoid counting batches multiple times
        order_aggregates = queryset.values('client_order_number').annotate(
            order_delivered=Sum('total_amount_delivered_tm'),
            order_ordered=Max('total_amount_ordered_tm')
        )

        total_orders = len(order_aggregates)
        total_volume = sum(item['order_delivered'] or 0 for item in order_aggregates)

        # Status breakdown
        status_breakdown = {
            'pending': queryset.filter(status='pending').values('client_order_number').distinct().count(),
            'delivered': queryset.filter(status='delivered').values('client_order_number').distinct().count(),
            'cancelled': queryset.filter(status='cancelled').values('client_order_number').distinct().count(),
        }

        # Recent orders (last 30 days)
        thirty_days_ago = timezone.now() - timedelta(days=30)
        recent_orders = queryset.filter(
            sales_order_creation_date__gte=thirty_days_ago
        ).values('client_order_number').distinct().count()

        # Product breakdown
        product_breakdown = {}
        for product in queryset.values_list('product_name', flat=True).distinct():
            if product:
                product_orders = queryset.filter(product_name=product).values('client_order_number').distinct().count()
                product_breakdown[product] = product_orders

        return Response({
            'total_orders': total_orders,
            'total_volume_tm': float(total_volume),
            'status_breakdown': status_breakdown,
            'recent_orders_30_days': recent_orders,
            'product_breakdown': product_breakdown,
        })

    @action(detail=False, methods=['get'])
    def advanced_analytics(self, request):
        """
        Get comprehensive analytics for the dashboard.
        This includes overview, trends, client segmentation, product performance, and more.

        CRITICAL FIX: Uses year_volume variable in yearly breakdown to avoid overwriting total_volume
        """
        # Get date range from query params or use all data
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        queryset = Order.objects.all()

        if not start_date or not end_date:
            # Use full date range
            date_range = queryset.aggregate(
                min_date=Min('sales_order_creation_date'),
                max_date=Max('sales_order_creation_date')
            )
            start_date = date_range['min_date']
            end_date = date_range['max_date']

        # Filter by date range
        queryset = queryset.filter(
            sales_order_creation_date__gte=start_date,
            sales_order_creation_date__lte=end_date
        )

        # === OVERVIEW METRICS ===

        # Aggregate by order first (handles batches correctly)
        order_aggregates = queryset.values('client_order_number').annotate(
            order_delivered=Sum('total_amount_delivered_tm'),
            order_ordered=Max('total_amount_ordered_tm')
        )

        total_orders = len(order_aggregates)
        total_volume = sum(item['order_delivered'] or 0 for item in order_aggregates)
        total_ordered = sum(item['order_ordered'] or 0 for item in order_aggregates)

        # Calculate average order value
        avg_order_value = total_volume / total_orders if total_orders > 0 else 0

        # Active clients
        active_clients = queryset.values('client').distinct().count()

        # Delivery performance (was_on_time is a property, calculate it differently)
        # On-time = actual_expedition_date <= promised_expedition_date
        on_time_orders = queryset.filter(
            actual_expedition_date__isnull=False,
            promised_expedition_date__isnull=False,
            actual_expedition_date__lte=F('promised_expedition_date')
        ).values('client_order_number').distinct().count()
        on_time_rate = (on_time_orders / total_orders * 100) if total_orders > 0 else 0

        # Growth rate (compare to previous period)
        date_range_days = (end_date - start_date).days
        previous_start = start_date - timedelta(days=date_range_days)
        previous_queryset = Order.objects.filter(
            sales_order_creation_date__gte=previous_start,
            sales_order_creation_date__lt=start_date
        )

        previous_aggregates = previous_queryset.values('client_order_number').annotate(
            order_delivered=Sum('total_amount_delivered_tm')
        )
        previous_volume = sum(item['order_delivered'] or 0 for item in previous_aggregates)

        growth_rate = ((total_volume - previous_volume) / previous_volume * 100) if previous_volume > 0 else 0

        # Calculate orders per day
        date_range_days_total = (end_date - start_date).days
        orders_per_day = total_orders / date_range_days_total if date_range_days_total > 0 else 0

        overview = {
            'total_orders': total_orders,
            'total_volume_tm': float(total_volume),
            'total_ordered_tm': float(total_ordered),
            'avg_order_value_tm': float(avg_order_value),
            'active_clients': active_clients,
            'on_time_delivery_rate': float(on_time_rate),
            'growth_rate': float(growth_rate),
            'orders_per_day': float(orders_per_day),
        }

        # === MONTHLY TRENDS ===

        monthly_data = queryset.annotate(
            month=TruncMonth('sales_order_creation_date')
        ).values('month').annotate(
            order_count=Count('client_order_number', distinct=True),
            total_volume=Sum('total_amount_delivered_tm')
        ).order_by('month')

        monthly_trends = []
        for item in monthly_data:
            monthly_trends.append({
                'month': item['month'].strftime('%Y-%m') if item['month'] else None,
                'order_count': item['order_count'],
                'total_volume_tm': float(item['total_volume'] or 0),
            })

        # === CLIENT SEGMENTATION ===

        # Get top clients by volume
        client_volumes = {}
        for client_id in queryset.values_list('client', flat=True).distinct():
            client_queryset = queryset.filter(client_id=client_id)
            client_aggregates = client_queryset.values('client_order_number').annotate(
                order_delivered=Sum('total_amount_delivered_tm')
            )
            client_volume = sum(item['order_delivered'] or 0 for item in client_aggregates)

            if client_volume > 0:
                client = Client.objects.get(id=client_id)
                client_volumes[client_id] = {
                    'client_id': client_id,
                    'client_name': client.name,
                    'total_volume_tm': float(client_volume),
                    'order_count': len(client_aggregates),
                    'market_share': float(client_volume / total_volume * 100) if total_volume > 0 else 0,
                }

        # Sort by volume and get top 10
        top_clients = sorted(client_volumes.values(), key=lambda x: x['total_volume_tm'], reverse=True)[:10]

        client_segmentation = {
            'top_clients': top_clients,
            'total_clients': len(client_volumes),
        }

        # === PRODUCT PERFORMANCE ===

        # Calculate product volumes correctly (aggregate by order first)
        product_volumes = {}
        for product_name in queryset.values_list('product_name', flat=True).distinct():
            if not product_name:
                continue

            product_queryset = queryset.filter(product_name=product_name)

            # Aggregate by order first (handles batches)
            product_order_aggregates = product_queryset.values('client_order_number').annotate(
                order_delivered=Sum('total_amount_delivered_tm')
            )

            product_volume = sum(item['order_delivered'] or 0 for item in product_order_aggregates)

            product_volumes[product_name] = {
                'product_name': product_name,
                'total_volume_tm': float(product_volume),
                'order_count': len(product_order_aggregates),
                'market_share': float(product_volume / total_volume * 100) if total_volume > 0 else 0,
                'unique_clients': product_queryset.values('client').distinct().count(),
            }

        # Sort by volume
        sorted_products = sorted(product_volumes.values(), key=lambda x: x['total_volume_tm'], reverse=True)

        product_performance = {
            'products': sorted_products,
            'total_products': len(sorted_products),
        }

        # === GEOGRAPHICAL ANALYSIS ===

        country_volumes = {}
        for country in queryset.values_list('client__country', flat=True).distinct():
            if not country:
                continue

            country_queryset = queryset.filter(client__country=country)
            country_aggregates = country_queryset.values('client_order_number').annotate(
                order_delivered=Sum('total_amount_delivered_tm')
            )
            country_volume = sum(item['order_delivered'] or 0 for item in country_aggregates)

            country_volumes[country] = {
                'country': country,
                'total_volume_tm': float(country_volume),
                'order_count': len(country_aggregates),
                'market_share': float(country_volume / total_volume * 100) if total_volume > 0 else 0,
                'unique_clients': country_queryset.values('client').distinct().count(),
            }

        sorted_countries = sorted(country_volumes.values(), key=lambda x: x['total_volume_tm'], reverse=True)

        geographical_analysis = {
            'countries': sorted_countries,
            'total_countries': len(sorted_countries),
        }

        # === DELIVERY PERFORMANCE ===

        # Calculate delivery metrics (is_fully_delivered is a property, calculate manually)
        # For each unique order, check if total_delivered >= total_ordered
        fully_delivered = 0
        partially_delivered = 0
        not_delivered = 0

        for order_num in queryset.values_list('client_order_number', flat=True).distinct():
            order_batches = queryset.filter(client_order_number=order_num)
            total_delivered = order_batches.aggregate(Sum('total_amount_delivered_tm'))['total_amount_delivered_tm__sum'] or 0
            total_ordered = order_batches.aggregate(Max('total_amount_ordered_tm'))['total_amount_ordered_tm__max'] or 0

            if total_delivered == 0:
                not_delivered += 1
            elif total_delivered >= total_ordered:
                fully_delivered += 1
            else:
                partially_delivered += 1

        # Average delivery time (days_from_order_to_delivery is a property, calculate manually)
        # Calculate the difference between actual_expedition_date and sales_order_creation_date
        delivered_orders = queryset.filter(
            actual_expedition_date__isnull=False
        ).values('client_order_number').annotate(
            latest_delivery=Max('actual_expedition_date'),
            order_date=Min('sales_order_creation_date')
        )

        # Calculate average days from order to delivery
        total_days = 0
        count = 0
        for item in delivered_orders:
            if item['latest_delivery'] and item['order_date']:
                days = (item['latest_delivery'] - item['order_date']).days
                total_days += days
                count += 1

        avg_delivery_days = total_days / count if count > 0 else 0

        delivery_performance = {
            'fully_delivered_count': fully_delivered,
            'partially_delivered_count': partially_delivered,
            'not_delivered_count': not_delivered,
            'fully_delivered_rate': float(fully_delivered / total_orders * 100) if total_orders > 0 else 0,
            'on_time_count': on_time_orders,
            'on_time_rate': float(on_time_rate),
            'avg_delivery_days': float(avg_delivery_days),
        }

        # === YEARLY BREAKDOWN ===
        # CRITICAL FIX: Use year_volume instead of total_volume to avoid overwriting

        yearly_data = queryset.annotate(
            year=ExtractYear('sales_order_creation_date')
        ).values('year').annotate(
            order_count=Count('client_order_number', distinct=True),
            year_volume=Sum('total_amount_delivered_tm'),  # FIXED: Renamed from total_volume
            year_ordered=Max('total_amount_ordered_tm')     # FIXED: Renamed from total_ordered
        ).order_by('year')

        yearly_breakdown = []
        for item in yearly_data:
            year_vol = float(item['year_volume'] or 0)  # FIXED: Use year_volume
            yearly_breakdown.append({
                'year': item['year'],
                'order_count': item['order_count'],
                'total_volume_tm': year_vol,
                'total_ordered_tm': float(item['year_ordered'] or 0),
                'market_share': float(year_vol / float(total_volume) * 100) if total_volume > 0 else 0,  # Now uses correct total_volume
            })

        # === AI PREDICTIONS ===

        # Get clients with predictions
        clients_with_predictions = Client.objects.filter(
            predicted_next_order_date__isnull=False
        )

        # Urgent clients (predicted to order within 3 days or overdue)
        urgent_date = timezone.now() + timedelta(days=3)
        urgent_clients = clients_with_predictions.filter(
            predicted_next_order_date__lte=urgent_date
        ).count()

        # Upcoming orders (next 7 days)
        week_date = timezone.now() + timedelta(days=7)
        upcoming_week = clients_with_predictions.filter(
            predicted_next_order_date__gte=timezone.now(),
            predicted_next_order_date__lte=week_date
        ).count()

        # Upcoming orders (next 30 days)
        month_date = timezone.now() + timedelta(days=30)
        upcoming_month = clients_with_predictions.filter(
            predicted_next_order_date__gte=timezone.now(),
            predicted_next_order_date__lte=month_date
        ).count()

        ai_predictions = {
            'clients_with_predictions': clients_with_predictions.count(),
            'urgent_clients': urgent_clients,
            'upcoming_orders_week': upcoming_week,
            'upcoming_orders_month': upcoming_month,
            'last_update': clients_with_predictions.aggregate(
                Max('last_prediction_update')
            )['last_prediction_update__max'],
        }

        # === RETURN COMPLETE ANALYTICS ===

        return Response({
            'overview': overview,
            'monthly_trends': monthly_trends,
            'client_segmentation': client_segmentation,
            'product_performance': product_performance,
            'geographical_analysis': geographical_analysis,
            'delivery_performance': delivery_performance,
            'yearly_breakdown': yearly_breakdown,
            'ai_predictions': ai_predictions,
            'date_range': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
            }
        })
