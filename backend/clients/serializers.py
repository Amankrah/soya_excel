from rest_framework import serializers
from .models import Client, Order


class ClientSerializer(serializers.ModelSerializer):
    """Serializer for Client model with AI prediction fields"""

    # Read-only computed fields
    has_coordinates = serializers.ReadOnlyField()
    coordinates_tuple = serializers.ReadOnlyField()
    full_address = serializers.ReadOnlyField()
    days_until_predicted_order = serializers.ReadOnlyField()
    is_urgent = serializers.ReadOnlyField()

    # Related fields
    orders_count = serializers.SerializerMethodField()
    account_manager_name = serializers.CharField(source='account_manager.username', read_only=True)

    class Meta:
        model = Client
        fields = [
            # Basic info
            'id', 'name',

            # Address fields
            'city', 'postal_code', 'country', 'address',

            # Geocoding
            'latitude', 'longitude', 'has_coordinates', 'coordinates_tuple', 'full_address',

            # Business fields
            'priority', 'account_manager', 'account_manager_name', 'has_contract',

            # Auto-calculated metrics
            'historical_monthly_usage', 'last_usage_calculation',

            # AI Prediction fields
            'predicted_next_order_days', 'predicted_next_order_date',
            'prediction_confidence_lower', 'prediction_confidence_upper',
            'last_prediction_update', 'prediction_accuracy_score',
            'days_until_predicted_order', 'is_urgent',

            # Geographic Clustering fields
            'cluster_id', 'cluster_label', 'cluster_method',
            'cluster_distance_to_centroid', 'cluster_updated_at',

            # Metadata
            'created_at', 'updated_at', 'is_active',

            # Related data
            'orders_count'
        ]
        read_only_fields = [
            'created_at', 'updated_at', 'latitude', 'longitude',
            'has_coordinates', 'coordinates_tuple', 'full_address',
            'priority', 'historical_monthly_usage', 'last_usage_calculation',
            'predicted_next_order_days', 'predicted_next_order_date',
            'prediction_confidence_lower', 'prediction_confidence_upper',
            'last_prediction_update', 'prediction_accuracy_score',
            'days_until_predicted_order', 'is_urgent', 'orders_count',
            'cluster_id', 'cluster_label', 'cluster_method',
            'cluster_distance_to_centroid', 'cluster_updated_at'
        ]

    def get_orders_count(self, obj):
        """Get total number of orders for this client"""
        return obj.orders.count()


class ClientListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for client lists"""

    has_coordinates = serializers.ReadOnlyField()
    is_urgent = serializers.ReadOnlyField()
    days_until_predicted_order = serializers.ReadOnlyField()
    orders_count = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = [
            'id', 'name', 'city', 'country', 'priority', 'postal_code', 'address',
            'latitude', 'longitude', 'has_coordinates', 'predicted_next_order_date',
            'predicted_next_order_days', 'days_until_predicted_order',
            'prediction_confidence_lower', 'prediction_confidence_upper',
            'last_prediction_update', 'prediction_accuracy_score',
            'historical_monthly_usage', 'is_urgent',
            'is_active', 'orders_count',
            # Clustering fields
            'cluster_id', 'cluster_label', 'cluster_method',
            'cluster_distance_to_centroid', 'cluster_updated_at'
        ]

    def get_orders_count(self, obj):
        return obj.orders.count()


class OrderClientNestedSerializer(serializers.ModelSerializer):
    """Nested client serializer for orders"""
    class Meta:
        model = Client
        fields = ['id', 'name', 'city', 'country']


class OrderSerializer(serializers.ModelSerializer):
    """Serializer for Order model with batch handling"""

    # Nested client object for frontend
    client = OrderClientNestedSerializer(read_only=True)

    # Keep these for backwards compatibility
    client_name = serializers.CharField(source='client.name', read_only=True)
    client_city = serializers.CharField(source='client.city', read_only=True)
    client_country = serializers.CharField(source='client.country', read_only=True)
    client_priority = serializers.CharField(source='client.priority', read_only=True)

    # Computed fields
    delivery_status = serializers.ReadOnlyField()
    is_fully_delivered = serializers.ReadOnlyField()
    is_partially_delivered = serializers.ReadOnlyField()
    delivery_completion_percentage = serializers.ReadOnlyField()
    days_from_order_to_delivery = serializers.ReadOnlyField()
    was_on_time = serializers.ReadOnlyField()

    # Additional info
    batch_info = serializers.SerializerMethodField()
    delivery_date = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            # Basic info
            'id', 'client', 'client_name', 'client_city', 'client_country', 'client_priority',

            # Order identification
            'client_order_number', 'expedition_number', 'product_name',

            # Dates
            'sales_order_creation_date', 'promised_expedition_date', 'actual_expedition_date', 'delivery_date',

            # Quantities
            'total_amount_ordered_tm', 'total_amount_delivered_tm',

            # Status
            'status',

            # Computed fields
            'delivery_status', 'is_fully_delivered', 'is_partially_delivered',
            'delivery_completion_percentage', 'days_from_order_to_delivery', 'was_on_time',

            # Batch info
            'batch_info',

            # Metadata
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'created_at', 'updated_at', 'delivery_status',
            'is_fully_delivered', 'is_partially_delivered',
            'delivery_completion_percentage', 'days_from_order_to_delivery',
            'was_on_time', 'batch_info', 'delivery_date'
        ]

    def get_delivery_date(self, obj):
        """Return actual_expedition_date as delivery_date for frontend"""
        return obj.actual_expedition_date

    def get_batch_info(self, obj):
        """Get information about all batches for this order"""
        combined = Order.combine_batches(obj.client_order_number)
        if combined:
            return {
                'batch_count': combined['batch_count'],
                'total_ordered': float(combined['total_ordered']),
                'total_delivered': float(combined['total_delivered']),
                'order_date': combined['order_date'],
                'final_delivery_date': combined['final_delivery_date'],
                'promised_date': combined['promised_date']
            }
        return None

    def validate(self, data):
        """Custom validation for order creation/update"""
        # Validate quantities
        if 'total_amount_ordered_tm' in data and data['total_amount_ordered_tm'] <= 0:
            raise serializers.ValidationError({
                'total_amount_ordered_tm': "Quantity must be greater than 0"
            })

        if 'total_amount_delivered_tm' in data and data['total_amount_delivered_tm'] < 0:
            raise serializers.ValidationError({
                'total_amount_delivered_tm': "Delivered quantity cannot be negative"
            })

        # Validate dates
        if 'promised_expedition_date' in data and data.get('promised_expedition_date'):
            from django.utils import timezone
            if data['promised_expedition_date'] < timezone.now():
                raise serializers.ValidationError({
                    'promised_expedition_date': "Promised delivery date cannot be in the past"
                })

        # Validate delivered quantity doesn't exceed ordered
        ordered = data.get('total_amount_ordered_tm')
        delivered = data.get('total_amount_delivered_tm')

        if ordered and delivered and delivered > ordered:
            raise serializers.ValidationError({
                'total_amount_delivered_tm': "Delivered quantity cannot exceed ordered quantity"
            })

        return data


class OrderListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for order lists"""

    # Nested client object for frontend
    client = OrderClientNestedSerializer(read_only=True)

    # Keep for backwards compatibility
    client_name = serializers.CharField(source='client.name', read_only=True)
    delivery_status = serializers.ReadOnlyField()
    delivery_completion_percentage = serializers.ReadOnlyField()
    delivery_date = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'client', 'client_name', 'client_order_number',
            'expedition_number', 'product_name', 'sales_order_creation_date',
            'actual_expedition_date', 'delivery_date', 'total_amount_ordered_tm',
            'total_amount_delivered_tm', 'status', 'delivery_status',
            'delivery_completion_percentage'
        ]

    def get_delivery_date(self, obj):
        """Return actual_expedition_date as delivery_date for frontend"""
        return obj.actual_expedition_date


class ClientPredictionSerializer(serializers.ModelSerializer):
    """Serializer focused on AI prediction data"""

    days_until_predicted_order = serializers.ReadOnlyField()
    is_urgent = serializers.ReadOnlyField()

    class Meta:
        model = Client
        fields = [
            'id', 'name', 'city', 'country', 'priority',
            'predicted_next_order_days', 'predicted_next_order_date',
            'prediction_confidence_lower', 'prediction_confidence_upper',
            'last_prediction_update', 'prediction_accuracy_score',
            'days_until_predicted_order', 'is_urgent',
            'historical_monthly_usage'
        ]
        read_only_fields = [
            'id', 'days_until_predicted_order', 'is_urgent'
        ]


class BatchOrderSerializer(serializers.Serializer):
    """Serializer for combined batch order data"""

    client = ClientListSerializer(read_only=True)
    client_order_number = serializers.CharField()
    product_name = serializers.CharField()
    total_ordered = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_delivered = serializers.DecimalField(max_digits=10, decimal_places=2)
    order_date = serializers.DateTimeField()
    final_delivery_date = serializers.DateTimeField()
    promised_date = serializers.DateTimeField()
    batch_count = serializers.IntegerField()

    completion_percentage = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    def get_completion_percentage(self, obj):
        """Calculate completion percentage"""
        if obj['total_ordered'] == 0:
            return 0
        return min(100, (float(obj['total_delivered']) / float(obj['total_ordered'])) * 100)

    def get_status(self, obj):
        """Get delivery status"""
        total_delivered = obj['total_delivered']
        total_ordered = obj['total_ordered']

        if total_delivered == 0:
            return 'not_delivered'
        elif total_delivered >= total_ordered:
            return 'fully_delivered'
        else:
            return 'partially_delivered'
