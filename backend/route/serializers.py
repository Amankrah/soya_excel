from rest_framework import serializers
from .models import Route, RouteStop, RouteOptimization


class RouteStopSerializer(serializers.ModelSerializer):
    farmer_name = serializers.CharField(source='farmer.name', read_only=True)
    farmer_address = serializers.CharField(source='farmer.address', read_only=True)
    order_number = serializers.CharField(source='order.order_number', read_only=True)
    order_quantity = serializers.DecimalField(source='order.quantity', max_digits=10, decimal_places=2, read_only=True)
    farmer = serializers.SerializerMethodField()
    order = serializers.SerializerMethodField()
    
    class Meta:
        model = RouteStop
        fields = '__all__'
    
    def get_farmer(self, obj):
        return {
            'id': obj.farmer.id,
            'name': obj.farmer.name,
            'address': obj.farmer.address
        }
    
    def get_order(self, obj):
        return {
            'id': obj.order.id,
            'order_number': obj.order.order_number,
            'quantity': float(obj.order.quantity)
        }


class RouteSerializer(serializers.ModelSerializer):
    stops = RouteStopSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    created_by = serializers.SerializerMethodField()
    stops_count = serializers.SerializerMethodField()
    driver_name = serializers.SerializerMethodField()
    vehicle_number = serializers.SerializerMethodField()
    route_type = serializers.CharField()
    
    class Meta:
        model = Route
        fields = ['id', 'name', 'date', 'status', 'route_type', 'created_by', 'created_by_name',
                  'total_distance', 'estimated_duration', 'optimized_sequence', 
                  'waypoints', 'created_at', 'updated_at', 'stops', 'stops_count', 
                  'driver_name', 'vehicle_number']
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