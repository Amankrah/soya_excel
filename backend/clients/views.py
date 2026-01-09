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

        # CRITICAL: Only show clients suitable for AI predictions
        # These are clients with:
        # 1. At least 3 orders (minimum for meaningful predictions)
        # 2. Small/medium order patterns (≤10 tonnes average per order)
        # 3. Valid predictions
        # 4. Active status

        from django.db.models import Count, Avg

        # Annotate with order statistics
        queryset = queryset.annotate(
            order_count=Count('orders', filter=Q(orders__status='delivered')),
            avg_order_size=Avg('orders__total_amount_delivered_tm', filter=Q(orders__status='delivered'))
        )

        # Filter for prediction-suitable clients
        queryset = queryset.filter(
            is_active=True,  # Active clients only
            order_count__gte=3,  # At least 3 orders
            avg_order_size__lte=10.0,  # Small/medium orders (≤10 tonnes average)
            predicted_next_order_date__isnull=False  # Has valid prediction
        )

        # Filter by priority
        priority = self.request.query_params.get('priority')
        if priority:
            queryset = queryset.filter(priority=priority)

        # Filter by country
        country = self.request.query_params.get('country')
        if country:
            queryset = queryset.filter(country=country)

        # Override active status filter if explicitly provided
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            # Remove the default is_active filter and apply the requested one
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
        """
        Get client statistics including AI predictions.

        NOTE: This uses ALL clients with predictions, not just the filtered queryset,
        because statistics should show the complete picture of all clients with predictions.
        """
        # Use the filtered queryset for the paginated client list
        filtered_clients = self.get_queryset()

        # But for statistics, count ALL clients with predictions (not just filtered ones)
        # This matches what the prediction command reports
        all_clients_with_predictions = Client.objects.filter(
            is_active=True,
            predicted_next_order_date__isnull=False
        )

        # Total clients = all clients with predictions (103)
        # This is what shows in "Total Clients" card on dashboard
        total_clients = all_clients_with_predictions.count()

        # Active clients from filtered set
        active_clients = filtered_clients.filter(is_active=True).count()

        # Prediction statistics - use ALL clients with predictions
        clients_with_predictions = all_clients_with_predictions.count()

        now = timezone.now()

        # Overdue: predicted date is in the past
        overdue = all_clients_with_predictions.filter(
            predicted_next_order_date__lt=now
        ).count()

        # Urgent: 0-3 days (not including overdue)
        urgent_date = now + timedelta(days=3)
        urgent = all_clients_with_predictions.filter(
            predicted_next_order_date__gte=now,
            predicted_next_order_date__lte=urgent_date
        ).count()

        # High: 4-7 days
        high_start = now + timedelta(days=4)
        high_end = now + timedelta(days=7)
        high = all_clients_with_predictions.filter(
            predicted_next_order_date__gt=urgent_date,
            predicted_next_order_date__lte=high_end
        ).count()

        # Priority breakdown (use filtered clients for this)
        priority_breakdown = {
            'high': filtered_clients.filter(priority='high').count(),
            'medium': filtered_clients.filter(priority='medium').count(),
            'low': filtered_clients.filter(priority='low').count(),
        }

        # Country breakdown (use filtered clients)
        country_breakdown = {}
        for country in filtered_clients.values_list('country', flat=True).distinct():
            if country:
                country_breakdown[country] = filtered_clients.filter(country=country).count()

        # Get clients with upcoming orders (next 7 days) - use ALL clients with predictions
        upcoming_date = now + timedelta(days=7)
        upcoming_orders = all_clients_with_predictions.filter(
            predicted_next_order_date__lte=upcoming_date,
            predicted_next_order_date__gte=now
        ).count()

        return Response({
            'total_clients': total_clients,
            'active_clients': active_clients,
            'inactive_clients': total_clients - active_clients,
            'predictions': {
                'clients_with_predictions': clients_with_predictions,
                'urgent': urgent,
                'overdue': overdue,
                'high': high,
                'urgent_clients': urgent,  # Legacy field
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
        List orders with batch aggregation and caching.
        Orders with the same client_order_number are aggregated into a single entry.
        Results are cached to avoid expensive recomputation.

        Query Parameters:
            force_refresh: If 'true', bypass cache and recompute (default: false)
        """
        from .models_analytics import AnalyticsCache

        # Get query parameters
        force_refresh = request.query_params.get('force_refresh', 'false').lower() == 'true'
        status_filter = request.query_params.get('status', 'all')
        search_query = request.query_params.get('search', '')
        page_num = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 10))

        # Generate cache key based on filters (not page number - cache all results)
        cache_key = f"order_list_{status_filter}_{search_query[:50]}"

        def compute_order_list():
            """Compute aggregated order list - wrapped for caching"""
            queryset = self.filter_queryset(self.get_queryset())

            # Use a single optimized query to get all order data
            # Group by client_order_number and aggregate
            from django.db.models import Sum, Max, Min

            order_data = queryset.values('client_order_number').annotate(
                total_ordered=Max('total_amount_ordered_tm'),
                total_delivered=Sum('total_amount_delivered_tm'),
                first_order_date=Min('sales_order_creation_date'),
                last_delivery_date=Max('actual_expedition_date'),
                earliest_promised_date=Min('promised_expedition_date'),
                batch_count=Count('id'),
                client_id=Max('client_id'),
                product_name=Max('product_name')
            ).order_by('-last_delivery_date', '-first_order_date')

            # Get all unique client IDs to fetch in one query
            client_ids = [item['client_id'] for item in order_data if item['client_id']]
            clients_dict = {c.id: c for c in Client.objects.filter(id__in=client_ids)}

            # Build aggregated orders list
            aggregated_orders = []
            for item in order_data:
                client = clients_dict.get(item['client_id'])
                if not client:
                    continue

                order_dict = {
                    'id': item['client_order_number'],
                    'client_order_number': item['client_order_number'],
                    'product_name': item['product_name'],
                    'batch_count': item['batch_count'],

                    # Client data
                    'client': {
                        'id': client.id,
                        'name': client.name,
                        'city': client.city,
                        'country': client.country,
                    },

                    # Dates
                    'sales_order_creation_date': item['first_order_date'].isoformat() if item['first_order_date'] else None,
                    'order_date': item['first_order_date'].isoformat() if item['first_order_date'] else None,
                    'actual_expedition_date': item['last_delivery_date'].isoformat() if item['last_delivery_date'] else None,
                    'final_delivery_date': item['last_delivery_date'].isoformat() if item['last_delivery_date'] else None,
                    'delivery_date': item['last_delivery_date'].isoformat() if item['last_delivery_date'] else None,
                    'promised_expedition_date': item['earliest_promised_date'].isoformat() if item['earliest_promised_date'] else None,
                    'promised_date': item['earliest_promised_date'].isoformat() if item['earliest_promised_date'] else None,

                    # Quantities
                    'total_ordered': float(item['total_ordered'] or 0),
                    'total_amount_ordered_tm': float(item['total_ordered'] or 0),
                    'total_delivered': float(item['total_delivered'] or 0),
                    'total_amount_delivered_tm': float(item['total_delivered'] or 0),
                }

                # Calculate status
                total_delivered = item['total_delivered'] or 0
                total_ordered = item['total_ordered'] or 0
                if total_delivered == 0:
                    order_dict['status'] = 'not_delivered'
                elif total_delivered >= total_ordered:
                    order_dict['status'] = 'delivered'
                else:
                    order_dict['status'] = 'partially_delivered'

                aggregated_orders.append(order_dict)

            return aggregated_orders

        # Use caching to avoid expensive recomputation
        all_orders = AnalyticsCache.get_or_compute(
            cache_key=cache_key,
            compute_func=compute_order_list,
            force_refresh=force_refresh,
            max_age_minutes=30  # Cache for 30 minutes
        )

        # Paginate the cached results
        total_count = len(all_orders)
        start_index = (page_num - 1) * page_size
        end_index = start_index + page_size
        paginated_orders = all_orders[start_index:end_index]

        # Return paginated response
        return Response({
            'count': total_count,
            'next': f"?page={page_num + 1}" if end_index < total_count else None,
            'previous': f"?page={page_num - 1}" if page_num > 1 else None,
            'results': paginated_orders
        })

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """
        Get order statistics with caching.

        Query Parameters:
            force_refresh: If 'true', bypass cache and recompute (default: false)
        """
        from .models_analytics import AnalyticsCache

        # Get query parameters
        force_refresh = request.query_params.get('force_refresh', 'false').lower() == 'true'
        status_filter = request.query_params.get('status', 'all')
        search_query = request.query_params.get('search', '')

        # Generate cache key based on filters
        cache_key = f"order_statistics_{status_filter}_{search_query[:50]}"  # Limit search query in key

        def compute_statistics():
            """Compute order statistics - wrapped for caching"""
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

            return {
                'total_orders': total_orders,
                'total_volume_tm': float(total_volume),
                'pending_orders': status_breakdown['pending'],
                'delivered_orders': status_breakdown['delivered'],
                'total_volume': float(total_volume),  # Alias for frontend compatibility
                'status_breakdown': status_breakdown,
                'recent_orders_30_days': recent_orders,
                'product_breakdown': product_breakdown,
            }

        # Use caching to avoid expensive recomputation
        statistics_data = AnalyticsCache.get_or_compute(
            cache_key=cache_key,
            compute_func=compute_statistics,
            force_refresh=force_refresh,
            max_age_minutes=30  # Cache for 30 minutes (more frequent than analytics)
        )

        return Response(statistics_data)

    @action(detail=False, methods=['get'])
    def advanced_analytics(self, request):
        """
        Get comprehensive analytics for the dashboard with caching.
        This includes overview, trends, client segmentation, product performance, and more.

        Query Parameters:
            start_date: Start date for analytics (optional)
            end_date: End date for analytics (optional)
            force_refresh: If 'true', bypass cache and recompute (default: false)

        CRITICAL FIX: Uses year_volume variable in yearly breakdown to avoid overwriting total_volume
        """
        from .models_analytics import AnalyticsCache

        # Get query parameters
        start_date_param = request.query_params.get('start_date')
        end_date_param = request.query_params.get('end_date')
        force_refresh = request.query_params.get('force_refresh', 'false').lower() == 'true'

        # Determine date range
        queryset = Order.objects.all()
        if not start_date_param or not end_date_param:
            date_range = queryset.aggregate(
                min_date=Min('sales_order_creation_date'),
                max_date=Max('sales_order_creation_date')
            )
            start_date = date_range['min_date']
            end_date = date_range['max_date']
        else:
            from datetime import datetime
            start_date = datetime.fromisoformat(start_date_param.replace('Z', '+00:00'))
            end_date = datetime.fromisoformat(end_date_param.replace('Z', '+00:00'))

        # Generate cache key based on date range
        cache_key = f"advanced_analytics_{start_date.date() if start_date else 'all'}_{end_date.date() if end_date else 'all'}"

        def compute_analytics():
            """Compute all analytics - wrapped for caching"""
            # Filter by date range
            queryset = Order.objects.filter(
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

            # Calculate fulfillment rate (total_delivered / total_ordered)
            fulfillment_rate = (total_volume / total_ordered * 100) if total_ordered > 0 else 0

            overview = {
                'total_orders': total_orders,
                'total_volume_tm': float(total_volume),
                'total_ordered_tm': float(total_ordered),
                'avg_order_value_tm': float(avg_order_value),
                'avg_order_size_tm': float(avg_order_value),  # Same as avg_order_value
                'active_clients': active_clients,
                'unique_clients': active_clients,  # Same as active_clients
                'on_time_delivery_rate': float(on_time_rate),
                'growth_rate': float(growth_rate),
                'orders_per_day': float(orders_per_day),
                'fulfillment_rate': float(fulfillment_rate),
            }

            # === MONTHLY TRENDS ===

            monthly_data = queryset.annotate(
                month=TruncMonth('sales_order_creation_date')
            ).values('month').annotate(
                order_count=Count('client_order_number', distinct=True),
                month_volume=Sum('total_amount_delivered_tm'),
                unique_clients=Count('client', distinct=True)
            ).order_by('month')

            monthly_trends = []
            for item in monthly_data:
                month_vol = float(item['month_volume'] or 0)
                month_count = item['order_count']
                monthly_trends.append({
                    'month': item['month'].strftime('%Y-%m') if item['month'] else None,
                    'order_count': month_count,
                    'total_volume': month_vol,
                    'avg_order_size': float(month_vol / month_count) if month_count > 0 else 0,
                    'unique_clients': item['unique_clients'],
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

                    # Get last order date
                    last_order = queryset.filter(client_id=client_id).order_by('-sales_order_creation_date').first()
                    last_order_date = last_order.sales_order_creation_date.isoformat() if last_order else None

                    client_volumes[client_id] = {
                        'client_id': str(client_id),
                        'client_name': client.name,
                        'city': client.city,
                        'country': client.country,
                        'total_volume': float(client_volume),
                        'total_volume_tm': float(client_volume),
                        'order_count': len(client_aggregates),
                        'avg_order_size': float(client_volume / len(client_aggregates)) if len(client_aggregates) > 0 else 0,
                        'market_share': float(client_volume / total_volume * 100) if total_volume > 0 else 0,
                        'last_order_date': last_order_date,
                    }

            # Sort by volume and get top 10
            top_by_volume = sorted(client_volumes.values(), key=lambda x: x['total_volume_tm'], reverse=True)[:10]

            # Sort by frequency and get top 10
            top_by_frequency = sorted(client_volumes.values(), key=lambda x: x['order_count'], reverse=True)[:10]

            # Calculate repeat rate (clients with more than 1 order)
            repeat_clients = sum(1 for cv in client_volumes.values() if cv['order_count'] > 1)
            one_time_clients = len(client_volumes) - repeat_clients
            repeat_rate = (repeat_clients / len(client_volumes) * 100) if len(client_volumes) > 0 else 0

            client_segmentation = {
                'top_by_volume': top_by_volume,
                'top_by_frequency': top_by_frequency,
                'total_clients': len(client_volumes),
                'repeat_clients': repeat_clients,
                'one_time_clients': one_time_clients,
                'repeat_rate': float(repeat_rate),
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

                avg_order_size = float(product_volume / len(product_order_aggregates)) if len(product_order_aggregates) > 0 else 0

                product_volumes[product_name] = {
                    'product_name': product_name,
                    'total_volume': float(product_volume),
                    'total_volume_tm': float(product_volume),
                    'order_count': len(product_order_aggregates),
                    'avg_order_size': avg_order_size,
                    'market_share': float(product_volume / total_volume * 100) if total_volume > 0 else 0,
                    'unique_clients': product_queryset.values('client').distinct().count(),
                }

            # Sort by volume - return as array
            product_performance = sorted(product_volumes.values(), key=lambda x: x['total_volume_tm'], reverse=True)

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
                    'total_volume': float(country_volume),
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

            # Calculate average, min, max days from order to delivery
            total_days = 0
            count = 0
            min_days = None
            max_days = None
            for item in delivered_orders:
                if item['latest_delivery'] and item['order_date']:
                    days = (item['latest_delivery'] - item['order_date']).days
                    total_days += days
                    count += 1
                    if min_days is None or days < min_days:
                        min_days = days
                    if max_days is None or days > max_days:
                        max_days = days

            avg_delivery_days = total_days / count if count > 0 else 0

            # Calculate late orders (actual > promised)
            late_orders = queryset.filter(
                actual_expedition_date__isnull=False,
                promised_expedition_date__isnull=False,
                actual_expedition_date__gt=F('promised_expedition_date')
            ).values('client_order_number').distinct().count()

            # Unknown = orders with no promised date
            unknown_orders = queryset.filter(
                actual_expedition_date__isnull=False,
                promised_expedition_date__isnull=True
            ).values('client_order_number').distinct().count()

            delivery_performance = {
                'fully_delivered_count': fully_delivered,
                'partially_delivered_count': partially_delivered,
                'not_delivered_count': not_delivered,
                'fully_delivered_rate': float(fully_delivered / total_orders * 100) if total_orders > 0 else 0,
                'on_time_count': on_time_orders,
                'on_time_rate': float(on_time_rate),
                'avg_delivery_days': float(avg_delivery_days),
                'min_delivery_days': min_days if min_days is not None else 0,
                'max_delivery_days': max_days if max_days is not None else 0,
                'total_delivered': count,
                'late_count': late_orders,
                'unknown_count': unknown_orders,
            }

            # === ORDER SIZE DISTRIBUTION ===
            # Categorize orders by size: small (≤10 tm), medium (10-50 tm), large (>50 tm)
            small_orders = 0
            medium_orders = 0
            large_orders = 0

            for order_num in queryset.values_list('client_order_number', flat=True).distinct():
                order_batches = queryset.filter(client_order_number=order_num)
                total_delivered = order_batches.aggregate(Sum('total_amount_delivered_tm'))['total_amount_delivered_tm__sum'] or 0

                if total_delivered <= 10:
                    small_orders += 1
                elif total_delivered <= 50:
                    medium_orders += 1
                else:
                    large_orders += 1

            order_size_distribution = {
                'small_orders': {
                    'count': small_orders,
                    'percentage': float(small_orders / total_orders * 100) if total_orders > 0 else 0,
                    'description': '≤10 tm'
                },
                'medium_orders': {
                    'count': medium_orders,
                    'percentage': float(medium_orders / total_orders * 100) if total_orders > 0 else 0,
                    'description': '10-50 tm'
                },
                'large_orders': {
                    'count': large_orders,
                    'percentage': float(large_orders / total_orders * 100) if total_orders > 0 else 0,
                    'description': '>50 tm'
                },
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

            # Get last update datetime and serialize it
            last_update_dt = clients_with_predictions.aggregate(
                Max('last_prediction_update')
            )['last_prediction_update__max']

            ai_predictions = {
                'clients_with_predictions': clients_with_predictions.count(),
                'urgent_clients': urgent_clients,
                'upcoming_orders_week': upcoming_week,
                'upcoming_orders_month': upcoming_month,
                'last_update': last_update_dt.isoformat() if last_update_dt else None,
            }

            # === GROWTH METRICS ===

            # Split data into first and second half of the date range
            midpoint = start_date + timedelta(days=date_range_days_total // 2)

            first_half = queryset.filter(sales_order_creation_date__lt=midpoint)
            second_half = queryset.filter(sales_order_creation_date__gte=midpoint)

            first_half_aggregates = first_half.values('client_order_number').annotate(
                order_delivered=Sum('total_amount_delivered_tm')
            )
            first_half_volume = sum(item['order_delivered'] or 0 for item in first_half_aggregates)
            first_half_orders = len(first_half_aggregates)

            second_half_aggregates = second_half.values('client_order_number').annotate(
                order_delivered=Sum('total_amount_delivered_tm')
            )
            second_half_volume = sum(item['order_delivered'] or 0 for item in second_half_aggregates)
            second_half_orders = len(second_half_aggregates)

            volume_growth = ((second_half_volume - first_half_volume) / first_half_volume * 100) if first_half_volume > 0 else 0

            growth_metrics = {
                'volume_growth': float(volume_growth),
                'first_half_volume': float(first_half_volume),
                'second_half_volume': float(second_half_volume),
                'first_half_orders': first_half_orders,
                'second_half_orders': second_half_orders,
            }

            # === RECENT ACTIVITY ===
            now = timezone.now()
            seven_days_ago = now - timedelta(days=7)
            thirty_days_ago = now - timedelta(days=30)

            # Last 7 days
            last_7_days_orders = queryset.filter(sales_order_creation_date__gte=seven_days_ago)
            last_7_aggregates = last_7_days_orders.values('client_order_number').annotate(
                order_delivered=Sum('total_amount_delivered_tm')
            )
            last_7_volume = sum(item['order_delivered'] or 0 for item in last_7_aggregates)

            # Last 30 days
            last_30_days_orders = queryset.filter(sales_order_creation_date__gte=thirty_days_ago)
            last_30_aggregates = last_30_days_orders.values('client_order_number').annotate(
                order_delivered=Sum('total_amount_delivered_tm')
            )
            last_30_volume = sum(item['order_delivered'] or 0 for item in last_30_aggregates)

            recent_activity = {
                'last_7_days': {
                    'order_count': len(last_7_aggregates),
                    'total_volume': float(last_7_volume)
                },
                'last_30_days': {
                    'order_count': len(last_30_aggregates),
                    'total_volume': float(last_30_volume)
                }
            }

            # === GEOGRAPHICAL DISTRIBUTION (with cities) ===
            # Cities
            city_volumes = {}
            for city, country in queryset.values_list('client__city', 'client__country').distinct():
                if not city:
                    continue

                city_queryset = queryset.filter(client__city=city, client__country=country)
                city_aggregates = city_queryset.values('client_order_number').annotate(
                    order_delivered=Sum('total_amount_delivered_tm')
                )
                city_volume = sum(item['order_delivered'] or 0 for item in city_aggregates)

                city_key = f"{city}_{country}"
                city_volumes[city_key] = {
                    'city': city,
                    'country': country,
                    'total_volume': float(city_volume),
                    'order_count': len(city_aggregates),
                    'unique_clients': city_queryset.values('client').distinct().count(),
                }

            sorted_cities = sorted(city_volumes.values(), key=lambda x: x['total_volume'], reverse=True)

            geographical_distribution = {
                'by_country': sorted_countries,
                'by_city': sorted_cities
            }

            # === SEASONAL PATTERNS ===
            from django.db.models.functions import ExtractMonth

            seasonal_data = queryset.annotate(
                month_num=ExtractMonth('sales_order_creation_date')
            ).values('month_num').annotate(
                order_count=Count('client_order_number', distinct=True),
                total_volume=Sum('total_amount_delivered_tm')
            ).order_by('month_num')

            month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
            seasonal_patterns = []
            for item in seasonal_data:
                month_num = item['month_num']
                month_volume = float(item['total_volume'] or 0)
                month_count = item['order_count']
                seasonal_patterns.append({
                    'month': month_num,
                    'month_name': month_names[month_num - 1] if month_num else 'Unknown',
                    'order_count': month_count,
                    'total_volume': month_volume,
                    'avg_order_size': float(month_volume / month_count) if month_count > 0 else 0
                })

            # === RETURN COMPLETE ANALYTICS ===

            return {
                'overview': overview,
                'monthly_trends': monthly_trends,
                'client_segmentation': client_segmentation,
                'product_performance': product_performance,
                'geographical_analysis': geographical_analysis,
                'geographical_distribution': geographical_distribution,
                'delivery_performance': delivery_performance,
                'order_size_distribution': order_size_distribution,
                'yearly_breakdown': yearly_breakdown,
                'ai_predictions': ai_predictions,
                'growth_metrics': growth_metrics,
                'recent_activity': recent_activity,
                'seasonal_patterns': seasonal_patterns,
                'date_range': {
                    'start_date': start_date.isoformat() if start_date else None,
                    'end_date': end_date.isoformat() if end_date else None,
                }
            }

        # Use caching to avoid expensive recomputation
        analytics_data = AnalyticsCache.get_or_compute(
            cache_key=cache_key,
            compute_func=compute_analytics,
            force_refresh=force_refresh,
            max_age_minutes=60  # Cache for 1 hour
        )

        return Response(analytics_data)
