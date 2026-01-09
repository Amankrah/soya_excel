from django.db import models
from django.contrib.auth.models import User
from decimal import Decimal
from django.utils import timezone

# Import analytics caching model
from .models_analytics import AnalyticsCache


class Client(models.Model):
    """Model representing a client - Soya Excel business"""

    PRIORITY_CHOICES = [
        ('high', 'High Priority'),
        ('medium', 'Medium Priority'),
        ('low', 'Low Priority'),
    ]

    # Basic client information
    name = models.CharField(max_length=200, db_index=True)

    # Address fields (matching Excel data: city_client, postal_code_client, country_client)
    city = models.CharField(max_length=100, blank=True, help_text="Client city")
    postal_code = models.CharField(max_length=20, blank=True, help_text="Client postal code")
    country = models.CharField(max_length=100, default='Canada', help_text="Client country")
    address = models.TextField(blank=True, help_text="Full address if available")

    # Geocoding for mapping
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    # Business fields (auto-calculated based on predictions)
    priority = models.CharField(
        max_length=10, choices=PRIORITY_CHOICES, null=True, blank=True,
        help_text="Auto-calculated based on predicted reorder date urgency"
    )
    account_manager = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='managed_clients')

    # Contract preferences
    has_contract = models.BooleanField(default=False, help_text="Has long-term contract")

    # Auto-calculated usage metrics (updated automatically)
    historical_monthly_usage = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Average monthly usage in tonnes (auto-calculated from order history)"
    )
    last_usage_calculation = models.DateTimeField(
        null=True, blank=True,
        help_text="When usage was last calculated"
    )


    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    # AI Prediction fields (automatically updated by ML system)
    predicted_next_order_days = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="AI-predicted days until next order"
    )
    predicted_next_order_date = models.DateTimeField(
        null=True, blank=True,
        help_text="Expected next order date based on AI prediction"
    )
    prediction_confidence_lower = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Lower confidence interval (days)"
    )
    prediction_confidence_upper = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Upper confidence interval (days)"
    )
    last_prediction_update = models.DateTimeField(
        null=True, blank=True,
        help_text="When prediction was last calculated"
    )
    prediction_accuracy_score = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Historical accuracy of predictions for this client (0-100)"
    )

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['city', 'country']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        location = f"{self.city}, {self.country}" if self.city and self.country else "Unknown Location"
        return f"{self.name} ({location})"

    @property
    def has_coordinates(self):
        """Check if client has valid coordinates"""
        return self.latitude is not None and self.longitude is not None

    @property
    def coordinates_tuple(self):
        """Get coordinates as tuple (lat, lng) or None"""
        if self.has_coordinates:
            return (float(self.latitude), float(self.longitude))
        return None

    @property
    def full_address(self):
        """Get full address string"""
        parts = [self.address, self.city, self.postal_code, self.country]
        return ", ".join([p for p in parts if p])

    def geocode_from_city_country(self, save=True):
        """
        Geocode using city and country.
        Returns the geocoding result dictionary or None if failed.
        """
        try:
            from route.services import GoogleMapsService

            maps_service = GoogleMapsService()
            address_str = f"{self.city}, {self.postal_code}, {self.country}"
            result = maps_service.geocode_address(address_str)

            if result and save:
                self.latitude = result['latitude']
                self.longitude = result['longitude']
                self.save(update_fields=['latitude', 'longitude'])

            return result

        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error geocoding address for client {self.name}: {str(e)}")
            return None

    def update_coordinates_if_missing(self):
        """
        Update coordinates if they are missing by geocoding city/country.
        Returns True if coordinates were updated, False otherwise.
        """
        if not self.has_coordinates and (self.city or self.postal_code):
            result = self.geocode_from_city_country(save=True)
            return result is not None
        return False

    def calculate_monthly_usage(self, save=True):
        """
        Auto-calculate average monthly usage from order history
        Returns the calculated usage in tonnes/month
        """
        from django.db.models import Sum
        from datetime import timedelta

        # Get all delivered orders (using correct field names from Order model)
        delivered_orders = self.orders.filter(status='delivered', actual_expedition_date__isnull=False)

        if not delivered_orders.exists():
            return 0

        # Get date range
        first_order = delivered_orders.order_by('actual_expedition_date').first()
        last_order = delivered_orders.order_by('actual_expedition_date').last()

        if not first_order or not last_order:
            return 0

        # Calculate total quantity and time span
        total_quantity = delivered_orders.aggregate(total=Sum('total_amount_delivered_tm'))['total'] or 0
        time_span_days = (last_order.actual_expedition_date - first_order.actual_expedition_date).days

        if time_span_days < 1:
            # Only one order or same day orders
            monthly_usage = float(total_quantity)
        else:
            # Calculate average per month
            months = time_span_days / 30.0
            monthly_usage = float(total_quantity) / months if months > 0 else 0

        if save:
            self.historical_monthly_usage = round(monthly_usage, 2)
            self.last_usage_calculation = timezone.now()
            self.save(update_fields=['historical_monthly_usage', 'last_usage_calculation'])

        return round(monthly_usage, 2)

    def calculate_priority(self):
        """
        Auto-calculate priority based on predicted next order date

        Logic:
        - High: Predicted to order within 3 days
        - Medium: Predicted to order within 7 days
        - Low: Predicted to order in 7+ days
        - None: No prediction available

        Returns the calculated priority string
        """
        if not self.predicted_next_order_date:
            return None

        days_until_order = (self.predicted_next_order_date - timezone.now()).days

        if days_until_order < 0:
            # Overdue - CRITICAL!
            return 'high'
        elif days_until_order <= 3:
            # Ordering within 3 days - HIGH priority
            return 'high'
        elif days_until_order <= 7:
            # Ordering within a week - MEDIUM priority
            return 'medium'
        else:
            # Ordering later - LOW priority
            return 'low'

    @property
    def days_until_predicted_order(self):
        """Calculate days until predicted next order"""
        if not self.predicted_next_order_date:
            return None
        # Compare dates only to avoid time-of-day issues
        today = timezone.now().date()
        predicted_date = self.predicted_next_order_date.date()
        return (predicted_date - today).days

    @property
    def is_urgent(self):
        """Check if client needs urgent attention (ordering within 3 days or overdue)"""
        if not self.predicted_next_order_date:
            return False
        days_until = self.days_until_predicted_order
        return days_until is not None and days_until <= 3

    def save(self, *args, **kwargs):
        """
        Override save to automatically geocode when address changes
        """
        # Check if this is an update and address fields have changed
        if self.pk:  # Existing client
            try:
                old_client = Client.objects.get(pk=self.pk)
                address_changed = (
                    old_client.city != self.city or
                    old_client.postal_code != self.postal_code or
                    old_client.country != self.country
                )

                # If address changed, clear coordinates so they'll be re-geocoded
                if address_changed:
                    self.latitude = None
                    self.longitude = None
            except Client.DoesNotExist:
                pass

        # Save first
        super().save(*args, **kwargs)

        # Auto-geocode if coordinates are missing and we have address info
        if not self.has_coordinates and (self.city or self.postal_code):
            try:
                self.geocode_from_city_country(save=True)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Auto-geocoding failed for {self.name}: {str(e)}")


class Order(models.Model):
    """
    Simplified Order model matching Excel data structure
    Tracks orders from creation to delivery, with batch handling
    """

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('delivered', 'Delivered'),
        ('cancelled', 'Cancelled'),
    ]

    # Client relationship
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='orders')

    # Order identification (from Excel: client_order_number, expedition_number)
    client_order_number = models.CharField(
        max_length=100, db_index=True,
        help_text="Client order number (multiple batches may share same number)"
    )
    expedition_number = models.CharField(
        max_length=100, blank=True,
        help_text="Expedition/delivery number"
    )

    # Product information
    product_name = models.CharField(max_length=200, blank=True, help_text="Product delivered")

    # Order creation (from Excel: sales_order_creation_date)
    sales_order_creation_date = models.DateTimeField(
        db_index=True,
        help_text="When the order was created/placed"
    )

    # Order quantities (from Excel)
    total_amount_ordered_tm = models.DecimalField(
        max_digits=10, decimal_places=2,
        help_text="Total amount ordered in tonnes"
    )
    total_amount_delivered_tm = models.DecimalField(
        max_digits=10, decimal_places=2,
        help_text="Total amount delivered in tonnes (may be from multiple batches)"
    )

    # Delivery dates (from Excel)
    promised_expedition_date = models.DateTimeField(
        null=True, blank=True,
        help_text="Promised/expected delivery date"
    )
    actual_expedition_date = models.DateTimeField(
        null=True, blank=True, db_index=True,
        help_text="Actual delivery date (last batch if multiple)"
    )

    # Status
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='pending',
        help_text="Order status (delivered when actual_expedition_date is set)"
    )

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-sales_order_creation_date']
        indexes = [
            models.Index(fields=['client', 'sales_order_creation_date']),
            models.Index(fields=['client_order_number']),
            models.Index(fields=['status', 'actual_expedition_date']),
        ]
        # Ensure uniqueness per batch (client_order_number + expedition_number)
        unique_together = [['client_order_number', 'expedition_number']]

    def __str__(self):
        return f"Order {self.client_order_number} - {self.client.name} ({self.total_amount_delivered_tm} tm)"

    def save(self, *args, **kwargs):
        """Auto-set status based on actual_expedition_date"""
        if self.actual_expedition_date and self.status == 'pending':
            self.status = 'delivered'

        super().save(*args, **kwargs)

    @property
    def delivery_status(self):
        """
        Check delivery status for this order (considering all batches with same client_order_number)

        Returns:
        --------
        str: 'not_delivered', 'partially_delivered', or 'fully_delivered'
        """
        from django.db.models import Sum

        # Get all batches for this order
        all_batches = Order.objects.filter(client_order_number=self.client_order_number)

        total_ordered = all_batches.aggregate(total=Sum('total_amount_ordered_tm'))['total'] or 0
        total_delivered = all_batches.aggregate(total=Sum('total_amount_delivered_tm'))['total'] or 0

        if total_delivered == 0:
            return 'not_delivered'
        elif total_delivered >= total_ordered:
            return 'fully_delivered'
        else:
            return 'partially_delivered'

    @property
    def is_fully_delivered(self):
        """Check if order is fully delivered (all batches combined)"""
        return self.delivery_status == 'fully_delivered'

    @property
    def is_partially_delivered(self):
        """Check if order is partially delivered"""
        return self.delivery_status == 'partially_delivered'

    @property
    def delivery_completion_percentage(self):
        """Calculate what percentage of the order has been delivered (all batches)"""
        from django.db.models import Sum

        all_batches = Order.objects.filter(client_order_number=self.client_order_number)

        total_ordered = all_batches.aggregate(total=Sum('total_amount_ordered_tm'))['total'] or 0
        total_delivered = all_batches.aggregate(total=Sum('total_amount_delivered_tm'))['total'] or 0

        if total_ordered == 0:
            return 0

        return min(100, (float(total_delivered) / float(total_ordered)) * 100)

    @property
    def days_from_order_to_delivery(self):
        """Calculate days between order creation and actual delivery"""
        if not self.actual_expedition_date:
            return None
        return (self.actual_expedition_date - self.sales_order_creation_date).days

    @property
    def was_on_time(self):
        """Check if delivery was on time (vs promised date)"""
        if not self.actual_expedition_date or not self.promised_expedition_date:
            return None
        return self.actual_expedition_date <= self.promised_expedition_date

    @classmethod
    def combine_batches(cls, client_order_number):
        """
        Combine multiple batches with same client_order_number into aggregated data

        Returns:
        --------
        dict with combined data for the order
        """
        from django.db.models import Sum, Max, Min

        batches = cls.objects.filter(client_order_number=client_order_number)

        if not batches.exists():
            return None

        combined = batches.aggregate(
            total_ordered=Max('total_amount_ordered_tm'),  # Use Max instead of Sum - all batches have same order total
            total_delivered=Sum('total_amount_delivered_tm'),  # Sum delivered across batches
            first_order_date=Min('sales_order_creation_date'),
            last_delivery_date=Max('actual_expedition_date'),
            earliest_promised_date=Min('promised_expedition_date')
        )

        first_batch = batches.first()

        return {
            'client': first_batch.client,
            'client_order_number': client_order_number,
            'product_name': first_batch.product_name,
            'total_ordered': combined['total_ordered'],
            'total_delivered': combined['total_delivered'],
            'order_date': combined['first_order_date'],
            'final_delivery_date': combined['last_delivery_date'],
            'promised_date': combined['earliest_promised_date'],
            'batch_count': batches.count()
        }


# Legacy alias for backward compatibility (will be removed in future versions)
Farmer = Client
