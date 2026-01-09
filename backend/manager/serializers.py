from rest_framework import serializers
from .models import Manager, SoybeanMealProduct, SupplyInventory, SupplyTransaction, WeeklyDistributionPlan, MonthlyDistributionPlan, KPIMetrics


class ManagerSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    
    class Meta:
        model = Manager
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class SoybeanMealProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = SoybeanMealProduct
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'price_last_updated']


class SupplyInventorySerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.product_name', read_only=True)
    product_code = serializers.CharField(source='product.product_code', read_only=True)
    product_type = serializers.CharField(source='product.product_type', read_only=True)
    is_low_stock = serializers.ReadOnlyField()
    stock_percentage = serializers.SerializerMethodField()
    days_of_supply_remaining = serializers.ReadOnlyField()
    current_stock = serializers.DecimalField(max_digits=12, decimal_places=2, coerce_to_string=False)
    minimum_stock = serializers.DecimalField(max_digits=12, decimal_places=2, coerce_to_string=False)
    maximum_stock = serializers.DecimalField(max_digits=12, decimal_places=2, coerce_to_string=False)
    
    class Meta:
        model = SupplyInventory
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
    
    def get_stock_percentage(self, obj):
        return float(obj.stock_percentage)


class SupplyTransactionSerializer(serializers.ModelSerializer):
    inventory_name = serializers.CharField(source='inventory.product.product_name', read_only=True)
    performed_by_name = serializers.CharField(source='performed_by.username', read_only=True)
    
    class Meta:
        model = SupplyTransaction
        fields = '__all__'
        read_only_fields = ['transaction_date', 'performed_by']
    
    def create(self, validated_data):
        validated_data['performed_by'] = self.context['request'].user
        
        # Update inventory based on transaction
        inventory = validated_data['inventory']
        quantity = validated_data['quantity']
        transaction_type = validated_data['transaction_type']
        
        if transaction_type in ['container_unload', 'transfer', 'return', 'quality_release']:
            inventory.current_stock += abs(quantity)
        elif transaction_type in ['dispatch', 'adjustment', 'quality_hold']:
            inventory.current_stock -= abs(quantity)
        
        inventory.save()
        
        return super().create(validated_data)


class WeeklyDistributionPlanSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.full_name', read_only=True, allow_null=True)
    accuracy_target_met = serializers.SerializerMethodField()
    
    class Meta:
        model = WeeklyDistributionPlan
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'approved_date', 'forecast_accuracy_percentage']
    
    def get_accuracy_target_met(self, obj):
        if obj.forecast_accuracy_percentage:
            return obj.forecast_accuracy_percentage >= 90  # 90-95% target for weekly plans
        return None


class MonthlyDistributionPlanSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.full_name', read_only=True, allow_null=True)
    accuracy_target_met = serializers.SerializerMethodField()
    
    class Meta:
        model = MonthlyDistributionPlan
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'forecast_accuracy_percentage']
    
    def get_accuracy_target_met(self, obj):
        if obj.forecast_accuracy_percentage:
            return obj.forecast_accuracy_percentage >= 80  # 80-85% target for monthly plans
        return None


class KPIMetricsSerializer(serializers.ModelSerializer):
    calculated_by_name = serializers.CharField(source='calculated_by.username', read_only=True)
    metric_type_display = serializers.CharField(source='get_metric_type_display', read_only=True)
    period_type_display = serializers.CharField(source='get_period_type_display', read_only=True)
    trend_direction_display = serializers.CharField(source='get_trend_direction_display', read_only=True)
    target_variance = serializers.SerializerMethodField()
    
    class Meta:
        model = KPIMetrics
        fields = '__all__'
        read_only_fields = ['calculated_at']
    
    def get_target_variance(self, obj):
        if obj.target_value and obj.metric_value:
            variance = float(obj.metric_value) - float(obj.target_value)
            variance_percent = (variance / float(obj.target_value)) * 100
            return {
                'absolute_variance': variance,
                'percentage_variance': variance_percent,
                'meets_target': variance <= 0  # Lower is better for KM/TM
            }
        return None


class DashboardSerializer(serializers.Serializer):
    """Serializer for Soya Excel dashboard summary data"""
    total_clients = serializers.IntegerField()
    active_routes = serializers.IntegerField()
    available_drivers = serializers.IntegerField()
    high_priority_alerts = serializers.IntegerField()
    urgent_alerts = serializers.IntegerField()
    pending_orders = serializers.IntegerField()
    monthly_deliveries = serializers.IntegerField()
    inventory_status = serializers.ListField(child=serializers.DictField(), required=False) 