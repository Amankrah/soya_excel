from rest_framework import serializers
from .models import Route, RouteStop, RouteOptimization, Warehouse


class RouteStopSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.name', read_only=True)
    client_address = serializers.CharField(source='client.full_address', read_only=True)
    order_number = serializers.CharField(source='order.client_order_number', read_only=True)
    order_quantity = serializers.DecimalField(source='order.total_amount_ordered_tm', max_digits=10, decimal_places=2, read_only=True)
    client = serializers.SerializerMethodField()
    order = serializers.SerializerMethodField()
    has_coordinates = serializers.BooleanField(read_only=True)

    class Meta:
        model = RouteStop
        fields = '__all__'

    def get_client(self, obj):
        return {
            'id': obj.client.id,
            'name': obj.client.name,
            'city': obj.client.city,
            'country': obj.client.country,
            'full_address': obj.client.full_address,
            'has_coordinates': obj.client.has_coordinates,
            'latitude': float(obj.client.latitude) if obj.client.latitude else None,
            'longitude': float(obj.client.longitude) if obj.client.longitude else None
        }

    def get_order(self, obj):
        if obj.order:
            return {
                'id': obj.order.id,
                'client_order_number': obj.order.client_order_number,
                'quantity_ordered': float(obj.order.total_amount_ordered_tm),
                'quantity_delivered': float(obj.order.total_amount_delivered_tm),
                'status': obj.order.status
            }
        return None


class WarehouseSerializer(serializers.ModelSerializer):
    """Serializer for warehouse data"""
    class Meta:
        model = Warehouse
        fields = ['id', 'name', 'code', 'address', 'city', 'province', 'postal_code',
                  'country', 'latitude', 'longitude', 'has_coordinates', 'full_address',
                  'is_primary', 'is_active']
        read_only_fields = ['full_address', 'has_coordinates']


class RouteSerializer(serializers.ModelSerializer):
    stops = RouteStopSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    created_by = serializers.SerializerMethodField()
    stops_count = serializers.SerializerMethodField()
    driver_name = serializers.SerializerMethodField()
    vehicle_number = serializers.SerializerMethodField()
    route_type = serializers.CharField()
    origin_warehouse = WarehouseSerializer(read_only=True)
    destination_warehouse = WarehouseSerializer(read_only=True)

    class Meta:
        model = Route
        fields = ['id', 'name', 'date', 'status', 'route_type', 'created_by', 'created_by_name',
                  'total_distance', 'estimated_duration', 'optimized_sequence',
                  'waypoints', 'created_at', 'updated_at', 'stops', 'stops_count',
                  'driver_name', 'vehicle_number', 'origin_warehouse', 'destination_warehouse',
                  'return_to_warehouse']
        read_only_fields = ['created_at', 'updated_at']

    def get_created_by(self, obj):
        if obj.created_by:
            return {
                'id': obj.created_by.id,
                'username': obj.created_by.username
            }
        return None

    def get_stops_count(self, obj):
        return obj.stops.count()

    def get_driver_name(self, obj):
        """Get driver name from the delivery relationship"""
        delivery = obj.deliveries.first() if hasattr(obj, 'deliveries') else None
        if delivery and delivery.driver:
            return delivery.driver.full_name
        return None

    def get_vehicle_number(self, obj):
        """Get vehicle number from the delivery relationship"""
        delivery = obj.deliveries.first() if hasattr(obj, 'deliveries') else None
        if delivery and delivery.vehicle:
            return delivery.vehicle.vehicle_number
        return None


class RouteCreateSerializer(serializers.ModelSerializer):
    stops = serializers.ListField(
        child=serializers.DictField(),
        write_only=True
    )
    
    class Meta:
        model = Route
        fields = ['name', 'date', 'stops']
    
    def create(self, validated_data):
        stops_data = validated_data.pop('stops')
        validated_data['created_by'] = self.context['request'].user
        route = Route.objects.create(**validated_data)
        
        for index, stop_data in enumerate(stops_data):
            stop_data['sequence_number'] = index + 1
            RouteStop.objects.create(route=route, **stop_data)
        
        return route


class RouteOptimizationSerializer(serializers.ModelSerializer):
    route_name = serializers.CharField(source='route.name', read_only=True)
    
    class Meta:
        model = RouteOptimization
        fields = '__all__'
        read_only_fields = ['created_at']


class RouteOptimizeSerializer(serializers.Serializer):
    """Serializer for route optimization requests"""
    route_id = serializers.IntegerField()
    optimization_type = serializers.ChoiceField(choices=['distance', 'duration', 'balanced'])
    origin = serializers.DictField(required=False)  # Starting point if different from first stop
    destination = serializers.DictField(required=False)  # Ending point if different from last stop


class DistributionPlanSerializer(serializers.Serializer):
    """Serializer for multi-client distribution planning requests"""
    client_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of client IDs to include in distribution plan"
    )
    date = serializers.DateField(
        help_text="Planned delivery date"
    )
    max_stops_per_route = serializers.IntegerField(
        default=10,
        help_text="Maximum stops per route"
    )
    max_distance_km = serializers.IntegerField(
        default=300,
        help_text="Maximum route distance in kilometers"
    )
    clustering_method = serializers.ChoiceField(
        choices=['dbscan', 'kmeans'],
        default='dbscan',
        help_text="Clustering algorithm: 'dbscan' (density-based) or 'kmeans' (balanced)"
    )
    use_async = serializers.BooleanField(
        default=False,
        help_text="Process asynchronously as Celery task"
    )


class BatchGeocodeSerializer(serializers.Serializer):
    """Serializer for batch geocoding requests"""
    client_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of client IDs to geocode"
    )
    force_update = serializers.BooleanField(
        default=False,
        help_text="Re-geocode even if coordinates exist"
    )
    use_async = serializers.BooleanField(
        default=False,
        help_text="Process asynchronously as Celery task"
    )