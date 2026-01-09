from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.utils import timezone
from .models import Client, Order
from .models_analytics import AnalyticsCache


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    """
    Admin interface for Client model with AI prediction support
    """
    list_display = [
        'name', 'city', 'country', 'priority_colored',
        'predicted_next_order_days', 'is_urgent_badge',
        'historical_monthly_usage', 'has_coordinates_badge',
        'account_manager', 'is_active'
    ]

    list_filter = [
        'is_active', 'priority', 'country', 'has_contract',
        'last_prediction_update'
    ]

    search_fields = [
        'name', 'city', 'postal_code', 'address'
    ]

    readonly_fields = [
        'created_at', 'updated_at',
        'latitude', 'longitude', 'has_coordinates', 'coordinates_tuple', 'full_address',
        'predicted_next_order_days', 'predicted_next_order_date',
        'prediction_confidence_lower', 'prediction_confidence_upper',
        'last_prediction_update', 'prediction_accuracy_score',
        'historical_monthly_usage', 'last_usage_calculation',
        'priority', 'days_until_predicted_order', 'is_urgent'
    ]

    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'is_active')
        }),
        ('Address & Location', {
            'fields': (
                'city', 'postal_code', 'country', 'address',
                'latitude', 'longitude', 'has_coordinates', 'coordinates_tuple', 'full_address'
            )
        }),
        ('Business Information', {
            'fields': (
                'account_manager', 'has_contract', 'priority'
            )
        }),
        ('AI Predictions (Auto-calculated)', {
            'fields': (
                'predicted_next_order_days', 'predicted_next_order_date',
                'days_until_predicted_order', 'is_urgent',
                'prediction_confidence_lower', 'prediction_confidence_upper',
                'last_prediction_update', 'prediction_accuracy_score'
            ),
            'classes': ('collapse',)
        }),
        ('Usage Metrics (Auto-calculated)', {
            'fields': (
                'historical_monthly_usage', 'last_usage_calculation'
            ),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    list_editable = ['is_active']
    date_hierarchy = 'created_at'
    ordering = ['name']

    actions = ['update_predictions', 'geocode_addresses', 'recalculate_usage']

    def priority_colored(self, obj):
        """Display priority with color coding"""
        if not obj.priority:
            return '-'

        colors = {
            'high': '#dc3545',    # Red
            'medium': '#ffc107',  # Yellow
            'low': '#28a745'      # Green
        }

        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            colors.get(obj.priority, '#6c757d'),
            obj.get_priority_display() if obj.priority else '-'
        )
    priority_colored.short_description = 'Priority'
    priority_colored.admin_order_field = 'priority'

    def is_urgent_badge(self, obj):
        """Display urgent badge"""
        if obj.is_urgent:
            return format_html(
                '<span style="background-color: #dc3545; color: white; padding: 3px 8px; '
                'border-radius: 3px; font-size: 11px; font-weight: bold;">URGENT</span>'
            )
        return '-'
    is_urgent_badge.short_description = 'Urgent'

    def has_coordinates_badge(self, obj):
        """Display geocoding status badge"""
        if obj.has_coordinates:
            return format_html(
                '<span style="color: #28a745;">✓</span>'
            )
        return format_html(
            '<span style="color: #dc3545;">✗</span>'
        )
    has_coordinates_badge.short_description = 'Geocoded'

    def update_predictions(self, request, queryset):
        """Admin action to update predictions for selected clients"""
        from clients.services import get_prediction_service

        service = get_prediction_service()

        if not service.model_loaded:
            self.message_user(
                request,
                "Prediction model not loaded. Cannot update predictions.",
                level='error'
            )
            return

        success_count = 0
        fail_count = 0

        for client in queryset:
            if service.update_client_prediction(client):
                success_count += 1
            else:
                fail_count += 1

        self.message_user(
            request,
            f"Updated predictions: {success_count} successful, {fail_count} failed",
            level='success' if fail_count == 0 else 'warning'
        )
    update_predictions.short_description = "Update AI predictions for selected clients"

    def geocode_addresses(self, request, queryset):
        """Admin action to geocode selected clients"""
        success_count = 0
        fail_count = 0

        for client in queryset.filter(latitude__isnull=True):
            if client.update_coordinates_if_missing():
                success_count += 1
            else:
                fail_count += 1

        self.message_user(
            request,
            f"Geocoded addresses: {success_count} successful, {fail_count} failed",
            level='success' if fail_count == 0 else 'warning'
        )
    geocode_addresses.short_description = "Geocode addresses for selected clients"

    def recalculate_usage(self, request, queryset):
        """Admin action to recalculate monthly usage"""
        count = 0

        for client in queryset:
            client.calculate_monthly_usage(save=True)
            count += 1

        self.message_user(
            request,
            f"Recalculated monthly usage for {count} clients",
            level='success'
        )
    recalculate_usage.short_description = "Recalculate monthly usage for selected clients"


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    """
    Admin interface for Order model with batch handling
    """
    list_display = [
        'client_order_number', 'expedition_number', 'client_link',
        'product_name', 'total_amount_delivered_tm', 'status',
        'delivery_status_badge', 'sales_order_creation_date', 'actual_expedition_date'
    ]

    list_filter = [
        'status', 'product_name', 'sales_order_creation_date',
        'actual_expedition_date', 'client__priority'
    ]

    search_fields = [
        'client_order_number', 'expedition_number', 'product_name',
        'client__name'
    ]

    readonly_fields = [
        'created_at', 'updated_at',
        'delivery_status', 'is_fully_delivered', 'is_partially_delivered',
        'delivery_completion_percentage', 'days_from_order_to_delivery',
        'was_on_time', 'batch_info_display', 'status_colored'
    ]

    fieldsets = (
        ('Order Identification', {
            'fields': (
                'client', 'client_order_number', 'expedition_number', 'product_name'
            )
        }),
        ('Dates', {
            'fields': (
                'sales_order_creation_date', 'promised_expedition_date', 'actual_expedition_date',
                'days_from_order_to_delivery', 'was_on_time'
            )
        }),
        ('Quantities', {
            'fields': (
                'total_amount_ordered_tm', 'total_amount_delivered_tm'
            )
        }),
        ('Status & Delivery', {
            'fields': (
                'status', 'status_colored', 'delivery_status', 'is_fully_delivered', 'is_partially_delivered',
                'delivery_completion_percentage'
            )
        }),
        ('Batch Information', {
            'fields': ('batch_info_display',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    list_editable = ['status']
    date_hierarchy = 'sales_order_creation_date'
    ordering = ['-sales_order_creation_date']

    actions = ['mark_as_delivered', 'mark_as_cancelled']

    def client_link(self, obj):
        """Display clickable link to client"""
        url = reverse('admin:clients_client_change', args=[obj.client.id])
        return format_html('<a href="{}">{}</a>', url, obj.client.name)
    client_link.short_description = 'Client'
    client_link.admin_order_field = 'client__name'

    def status_colored(self, obj):
        """Display status with color coding"""
        colors = {
            'pending': '#ffc107',    # Yellow
            'delivered': '#28a745',  # Green
            'cancelled': '#dc3545'   # Red
        }

        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            colors.get(obj.status, '#6c757d'),
            obj.get_status_display()
        )
    status_colored.short_description = 'Status'
    status_colored.admin_order_field = 'status'

    def delivery_status_badge(self, obj):
        """Display delivery status badge"""
        status = obj.delivery_status

        colors = {
            'not_delivered': '#dc3545',      # Red
            'partially_delivered': '#ffc107', # Yellow
            'fully_delivered': '#28a745'      # Green
        }

        labels = {
            'not_delivered': 'Not Delivered',
            'partially_delivered': f'Partial ({obj.delivery_completion_percentage:.0f}%)',
            'fully_delivered': 'Complete'
        }

        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 3px; font-size: 11px; font-weight: bold;">{}</span>',
            colors.get(status, '#6c757d'),
            labels.get(status, status)
        )
    delivery_status_badge.short_description = 'Delivery Status'

    def batch_info_display(self, obj):
        """Display batch information"""
        if not obj.pk:
            return '-'

        combined = Order.combine_batches(obj.client_order_number)
        if not combined:
            return 'No batch data available'

        return format_html(
            '<strong>Batch Count:</strong> {}<br>'
            '<strong>Total Ordered:</strong> {} tm<br>'
            '<strong>Total Delivered:</strong> {} tm<br>'
            '<strong>Completion:</strong> {:.1f}%<br>'
            '<strong>First Order:</strong> {}<br>'
            '<strong>Final Delivery:</strong> {}',
            combined['batch_count'],
            combined['total_ordered'],
            combined['total_delivered'],
            (float(combined['total_delivered']) / float(combined['total_ordered']) * 100) if combined['total_ordered'] > 0 else 0,
            combined['order_date'].strftime('%Y-%m-%d') if combined['order_date'] else '-',
            combined['final_delivery_date'].strftime('%Y-%m-%d') if combined['final_delivery_date'] else '-'
        )
    batch_info_display.short_description = 'Batch Information'

    def mark_as_delivered(self, request, queryset):
        """Admin action to mark orders as delivered"""
        count = 0
        for order in queryset:
            if not order.actual_expedition_date:
                order.actual_expedition_date = timezone.now()
            order.status = 'delivered'
            order.save()
            count += 1

        self.message_user(
            request,
            f"Marked {count} orders as delivered",
            level='success'
        )
    mark_as_delivered.short_description = "Mark selected orders as delivered"

    def mark_as_cancelled(self, request, queryset):
        """Admin action to mark orders as cancelled"""
        count = queryset.update(status='cancelled')

        self.message_user(
            request,
            f"Marked {count} orders as cancelled",
            level='success'
        )
    mark_as_cancelled.short_description = "Mark selected orders as cancelled"


@admin.register(AnalyticsCache)
class AnalyticsCacheAdmin(admin.ModelAdmin):
    """Admin interface for AnalyticsCache model"""
    list_display = [
        'cache_key', 'order_count_at_cache', 'last_order_date',
        'updated_at', 'age_minutes'
    ]

    list_filter = ['updated_at', 'created_at']
    search_fields = ['cache_key']
    readonly_fields = ['created_at', 'updated_at', 'data', 'age_minutes']

    fieldsets = (
        ('Cache Information', {
            'fields': ('cache_key', 'order_count_at_cache', 'last_order_date')
        }),
        ('Cached Data', {
            'fields': ('data',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at', 'age_minutes'),
        }),
    )

    actions = ['invalidate_cache']

    def age_minutes(self, obj):
        """Display cache age in minutes"""
        age = timezone.now() - obj.updated_at
        minutes = int(age.total_seconds() / 60)

        if minutes < 60:
            return format_html('<span>{} minutes</span>', minutes)
        elif minutes < 1440:  # Less than 24 hours
            hours = minutes / 60
            return format_html('<span>{:.1f} hours</span>', hours)
        else:
            days = minutes / 1440
            return format_html('<span style="color: #dc3545;">{:.1f} days (STALE)</span>', days)

    age_minutes.short_description = 'Cache Age'

    def invalidate_cache(self, request, queryset):
        """Admin action to invalidate selected caches"""
        count = queryset.count()
        queryset.delete()

        self.message_user(
            request,
            f"Invalidated {count} analytics cache(s)",
            level='success'
        )
    invalidate_cache.short_description = "Invalidate selected caches"
