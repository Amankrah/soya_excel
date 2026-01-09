from django.contrib import admin
from .models import Route, RouteStop, RouteOptimization, WeeklyRoutePerformance, MonthlyRoutePerformance, Warehouse


class RouteStopInline(admin.TabularInline):
    model = RouteStop
    extra = 0
    ordering = ['sequence_number']
    readonly_fields = ['is_on_time', 'service_efficiency']
    fields = ['sequence_number', 'client', 'order', 'delivery_method', 'quantity_to_deliver', 'quantity_delivered', 'estimated_arrival_time', 'actual_arrival_time', 'is_completed', 'delivery_rating']


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'city', 'province', 'is_primary', 'is_active', 'has_coordinates', 'stock_utilization_percentage']
    list_filter = ['is_primary', 'is_active', 'province', 'operates_weekends']
    search_fields = ['name', 'code', 'address', 'city']
    readonly_fields = ['created_at', 'updated_at', 'full_address', 'stock_utilization_percentage', 'has_coordinates']
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'code', 'is_primary', 'is_active')
        }),
        ('Location', {
            'fields': ('address', 'city', 'province', 'postal_code', 'country', 'full_address')
        }),
        ('Coordinates', {
            'fields': ('latitude', 'longitude', 'has_coordinates'),
            'description': 'Coordinates will be automatically geocoded when saving if not provided.'
        }),
        ('Capacity & Stock', {
            'fields': ('capacity_tonnes', 'current_stock_tonnes', 'stock_utilization_percentage')
        }),
        ('Operating Hours', {
            'fields': ('operating_hours_start', 'operating_hours_end', 'operates_weekends')
        }),
        ('Contact Information', {
            'fields': ('manager_name', 'phone_number', 'email')
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )


@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    list_display = ['name', 'date', 'route_type', 'status', 'origin_warehouse', 'total_distance', 'actual_distance', 'km_per_tonne', 'route_efficiency_score', 'created_by']
    list_filter = ['route_type', 'status', 'assigned_vehicle_type', 'origin_warehouse', 'return_to_warehouse', 'date', 'created_at']
    search_fields = ['name', 'alix_route_reference']
    readonly_fields = ['created_at', 'updated_at', 'is_within_accuracy_target', 'delivery_efficiency']
    inlines = [RouteStopInline]
    date_hierarchy = 'date'
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'date', 'route_type', 'status', 'created_by')
        }),
        ('Warehouse & Routing', {
            'fields': ('origin_warehouse', 'return_to_warehouse', 'destination_warehouse'),
            'description': 'Warehouse configuration for route origin and destination'
        }),
        ('Route Details', {
            'fields': ('planned_during_week', 'planning_accuracy_target', 'assigned_vehicle_type', 'total_capacity_used')
        }),
        ('Optimization', {
            'fields': ('total_distance', 'estimated_duration', 'optimized_sequence', 'waypoints')
        }),
        ('Performance', {
            'fields': ('actual_distance', 'actual_duration', 'fuel_consumed', 'co2_emissions', 'km_per_tonne', 'route_efficiency_score')
        }),
        ('Integration', {
            'fields': ('alix_route_reference', 'gps_tracking_enabled', 'electronic_log_data'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at', 'is_within_accuracy_target', 'delivery_efficiency'),
            'classes': ('collapse',)
        })
    )


@admin.register(RouteStop)
class RouteStopAdmin(admin.ModelAdmin):
    list_display = ['route', 'sequence_number', 'client', 'delivery_method', 'quantity_to_deliver', 'quantity_delivered', 'is_completed', 'delivery_rating', 'had_delivery_issues']
    list_filter = ['delivery_method', 'is_completed', 'had_delivery_issues', 'delivery_rating', 'route__date']
    search_fields = ['route__name', 'client__name', 'order__client_order_number']
    readonly_fields = ['is_on_time', 'service_efficiency']
    ordering = ['route', 'sequence_number']


@admin.register(RouteOptimization)
class RouteOptimizationAdmin(admin.ModelAdmin):
    list_display = ['route', 'optimization_type', 'optimization_score', 'distance_savings', 'estimated_fuel_savings', 'google_maps_used', 'success', 'created_at']
    list_filter = ['optimization_type', 'success', 'google_maps_used', 'created_at']
    search_fields = ['route__name']
    readonly_fields = ['created_at', 'request_data', 'response_data']


@admin.register(WeeklyRoutePerformance)
class WeeklyRoutePerformanceAdmin(admin.ModelAdmin):
    list_display = ['week_start_date', 'total_routes_completed', 'km_per_tonne_trituro_44', 'km_per_tonne_dairy_trituro', 'planning_accuracy_percentage', 'meets_90_percent_accuracy_target']
    list_filter = ['meets_90_percent_accuracy_target', 'exceeds_kpi_targets', 'week_start_date']
    search_fields = []
    readonly_fields = ['calculated_at']
    date_hierarchy = 'week_start_date'


@admin.register(MonthlyRoutePerformance)
class MonthlyRoutePerformanceAdmin(admin.ModelAdmin):
    list_display = ['month', 'total_routes_month', 'monthly_km_per_tonne_trituro_44', 'planning_accuracy_1_week', 'planning_accuracy_1_month', 'compared_to_previous_month', 'meets_monthly_targets']
    list_filter = ['compared_to_previous_month', 'meets_monthly_targets', 'month']
    search_fields = []
    readonly_fields = ['calculated_at']
    date_hierarchy = 'month'
