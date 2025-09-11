from django.db import models
from django.contrib.auth.models import User
from decimal import Decimal
from django.utils import timezone


class Farmer(models.Model):
    """Model representing a farmer client - updated for Soya Excel's business"""
    
    # Canadian provinces and international locations
    PROVINCE_CHOICES = [
        ('QC', 'Quebec'),
        ('ON', 'Ontario'),
        ('NB', 'New Brunswick'),
        ('BC', 'British Columbia'),
        ('USD', 'United States'),
        ('SPAIN', 'Spain'),
    ]
    
    CLIENT_TYPE_CHOICES = [
        ('dairy_trituro', 'Dairy Trituro'),
        ('trituro_44', 'Trituro 44'),
        ('oil', 'Oil'),
        ('other', 'Other'),
    ]
    
    PRIORITY_CHOICES = [
        ('high', 'High Priority'),
        ('medium', 'Medium Priority'),
        ('low', 'Low Priority'),
    ]
    
    name = models.CharField(max_length=200)
    phone_number = models.CharField(max_length=20)
    email = models.EmailField(null=True, blank=True)
    address = models.TextField()
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    
    # Soya Excel specific fields
    province = models.CharField(max_length=10, choices=PROVINCE_CHOICES, default='QC', null=True, blank=True)
    client_type = models.CharField(max_length=20, choices=CLIENT_TYPE_CHOICES, default='dairy_trituro', null=True, blank=True)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium', null=True, blank=True)
    account_manager = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='managed_farmers')
    
    # Contract and delivery preferences
    has_contract = models.BooleanField(default=False, help_text="Has long-term contract")
    preferred_delivery_day = models.CharField(max_length=10, blank=True, help_text="Preferred delivery day of week")
    historical_monthly_usage = models.DecimalField(max_digits=10, decimal_places=2, default=0, null=True, blank=True, help_text="Average monthly usage in tonnes")
    
    # Integration fields
    zoho_crm_id = models.CharField(max_length=100, blank=True, help_text="ZOHO CRM client ID")
    alix_customer_id = models.CharField(max_length=100, blank=True, help_text="ALIX customer ID")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['name']
    
    def __str__(self):
        return f"{self.name} ({self.province})"
    
    @property
    def has_coordinates(self):
        """Check if farmer has valid coordinates"""
        return self.latitude is not None and self.longitude is not None
    
    @property
    def coordinates_tuple(self):
        """Get coordinates as tuple (lat, lng) or None"""
        if self.has_coordinates:
            return (float(self.latitude), float(self.longitude))
        return None
    
    def geocode_address(self, save=True):
        """
        Geocode the farmer's address using Google Maps.
        Returns the geocoding result dictionary or None if failed.
        """
        try:
            from route.services import GoogleMapsService
            
            maps_service = GoogleMapsService()
            result = maps_service.geocode_address(self.address, self.province)
            
            if result and save:
                self.latitude = result['latitude']
                self.longitude = result['longitude']
                self.save(update_fields=['latitude', 'longitude'])
            
            return result
            
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error geocoding address for farmer {self.name}: {str(e)}")
            return None
    
    def validate_address(self):
        """
        Validate the farmer's address using Google Maps.
        Returns validation result dictionary.
        """
        try:
            from route.services import GoogleMapsService
            
            maps_service = GoogleMapsService()
            return maps_service.validate_canadian_address(self.address)
            
        except Exception as e:
            return {
                'is_valid': False,
                'error': f'Validation service error: {str(e)}'
            }
    
    def update_coordinates_if_missing(self):
        """
        Update coordinates if they are missing by geocoding the address.
        Returns True if coordinates were updated, False otherwise.
        """
        if not self.has_coordinates and self.address:
            result = self.geocode_address(save=True)
            return result is not None
        return False
    
    @property
    def address_quality_score(self):
        """
        Calculate a quality score for the address based on completeness.
        Returns a score from 0-100.
        """
        if not self.address:
            return 0
        
        score = 0
        address_lower = self.address.lower()
        
        # Basic address components (40 points)
        if any(word in address_lower for word in ['street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 'boulevard', 'blvd']):
            score += 20
        if any(char.isdigit() for char in self.address):  # Has house number
            score += 20
        
        # City/locality (25 points)
        canadian_cities = ['montreal', 'quebec', 'toronto', 'ottawa', 'hamilton', 'winnipeg', 'calgary', 'edmonton', 'vancouver']
        if any(city in address_lower for city in canadian_cities):
            score += 25
        
        # Province (20 points)
        provinces = ['quebec', 'ontario', 'qc', 'on', 'nb', 'bc', 'new brunswick', 'british columbia']
        if any(prov in address_lower for prov in provinces):
            score += 20
        elif self.province and self.province in address_lower:
            score += 20
        
        # Postal code (15 points)
        import re
        postal_pattern = r'[a-zA-Z]\d[a-zA-Z]\s?\d[a-zA-Z]\d'
        if re.search(postal_pattern, self.address):
            score += 15
        
        return min(score, 100)  # Cap at 100


class FeedStorage(models.Model):
    """Model for tracking soybean meal storage with BinConnect sensors"""
    
    SENSOR_TYPE_CHOICES = [
        ('binconnect', 'BinConnect'),
        ('manual', 'Manual Entry'),
        ('other', 'Other Sensor'),
    ]
    
    farmer = models.OneToOneField(Farmer, on_delete=models.CASCADE, related_name='feed_storage')
    
    # Storage specifications (in tonnes as per Soya Excel)
    capacity = models.DecimalField(max_digits=10, decimal_places=2, help_text="Total capacity in tonnes (3-80 tm range)")
    current_quantity = models.DecimalField(max_digits=10, decimal_places=2, help_text="Current quantity in tonnes")
    
    # Sensor configuration
    sensor_type = models.CharField(max_length=20, choices=SENSOR_TYPE_CHOICES, default='binconnect', null=True, blank=True)
    sensor_id = models.CharField(max_length=100, unique=True)
    last_reported = models.DateTimeField(auto_now=True)
    reporting_frequency = models.IntegerField(default=60, null=True, blank=True, help_text="Reporting frequency in minutes")
    
    # Alert thresholds (Soya Excel: 1 tm or 20%, whichever is higher)
    # 20% is more realistic than 80% - farmers need time to order and receive deliveries
    low_stock_threshold_tonnes = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('1.0'), null=True, blank=True)
    low_stock_threshold_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('20.0'), null=True, blank=True)
    
    # Connectivity and status
    is_connected = models.BooleanField(default=True)
    last_maintenance = models.DateTimeField(null=True, blank=True)
    
    @property
    def percentage_remaining(self):
        if self.capacity > 0:
            return (self.current_quantity / self.capacity) * 100
        return 0
    
    @property
    def is_low_stock(self):
        """Check if below 1 tm OR 20% capacity (whichever is higher)"""
        below_absolute_threshold = self.current_quantity <= self.low_stock_threshold_tonnes
        below_percentage_threshold = self.percentage_remaining <= float(self.low_stock_threshold_percentage)
        return below_absolute_threshold or below_percentage_threshold
    
    @property
    def is_emergency_level(self):
        """Emergency level for pre-filtered alerts"""
        return self.current_quantity <= Decimal('0.5') or self.percentage_remaining <= 10
    
    def __str__(self):
        return f"{self.farmer.name} - Silo ({self.capacity} tm)"


class Order(models.Model):
    """Model for tracking soybean meal orders"""
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('planned', 'Planned'),
        ('in_transit', 'In Transit'),
        ('delivered', 'Delivered'),
        ('cancelled', 'Cancelled'),
    ]
    
    DELIVERY_METHOD_CHOICES = [
        ('bulk_38tm', 'Bulk Truck (38 tm)'),
        ('tank_compartment', 'Tank Compartments (2-10 tm)'),
        ('tote_500kg', 'Tote Bags 500kg'),
        ('tote_1000kg', 'Tote Bags 1000kg'),
    ]
    
    ORDER_TYPE_CHOICES = [
        ('contract', 'Contract Delivery'),
        ('on_demand', 'On-Demand'),
        ('emergency', 'Emergency Refill'),
        ('proactive', 'Proactive Based on Forecast'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    
    farmer = models.ForeignKey(Farmer, on_delete=models.CASCADE, related_name='orders')
    order_number = models.CharField(max_length=50, unique=True)
    expedition_number = models.CharField(max_length=50, blank=True, help_text="System-generated expedition number")
    
    # Order details
    quantity = models.DecimalField(max_digits=10, decimal_places=2, help_text="Quantity in tonnes")
    delivery_method = models.CharField(max_length=20, choices=DELIVERY_METHOD_CHOICES, default='bulk_38tm', null=True, blank=True)
    order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES, default='on_demand', null=True, blank=True)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    
    # Status and dates
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    order_date = models.DateTimeField(auto_now_add=True)
    expected_delivery_date = models.DateTimeField(null=True, blank=True)
    actual_delivery_date = models.DateTimeField(null=True, blank=True)
    
    # Planning and forecasting
    forecast_based = models.BooleanField(default=False, help_text="Generated from consumption forecast")
    planning_week = models.CharField(max_length=10, blank=True, help_text="Planning week (e.g., 2024-W45)")
    
    # Route and delivery assignment
    assigned_route = models.ForeignKey('route.Route', on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    assigned_driver = models.ForeignKey('driver.Driver', on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_orders')
    assigned_vehicle = models.ForeignKey('driver.Vehicle', on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_orders')
    
    # Integration and tracking
    alix_order_id = models.CharField(max_length=100, blank=True, help_text="ALIX sales order ID")
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_orders')
    
    # Business logic fields
    is_urgent = models.BooleanField(default=False, help_text="Marked as urgent by system or user")
    requires_approval = models.BooleanField(default=False, help_text="Requires manager approval")
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_orders')
    approved_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-order_date']
        indexes = [
            models.Index(fields=['status', 'expected_delivery_date']),
            models.Index(fields=['farmer', 'status']),
            models.Index(fields=['priority', 'is_urgent']),
        ]
    
    def __str__(self):
        return f"Order {self.order_number} - {self.farmer.name} ({self.quantity} tm)"
    
    def clean(self):
        """Validate order data"""
        from django.core.exceptions import ValidationError
        
        if self.quantity <= 0:
            raise ValidationError('Quantity must be greater than 0')
        
        if self.expected_delivery_date and self.expected_delivery_date < self.order_date:
            raise ValidationError('Expected delivery date cannot be before order date')
        
        # Check if farmer has active feed storage
        if hasattr(self.farmer, 'feed_storage') and self.farmer.feed_storage:
            storage = self.farmer.feed_storage
            if storage.current_quantity + self.quantity > storage.capacity:
                raise ValidationError(f'Order quantity would exceed storage capacity. Available: {storage.capacity - storage.current_quantity} tm')
    
    def save(self, *args, **kwargs):
        # Auto-set priority based on order type and farmer priority
        if self.order_type == 'emergency':
            self.priority = 'urgent'
            self.is_urgent = True
        elif self.farmer.priority == 'high':
            self.priority = 'high'
        
        # Auto-set requires_approval for certain conditions
        if self.quantity > 10 or self.order_type == 'emergency' or self.farmer.priority == 'high':
            self.requires_approval = True
        
        # Generate expedition number after saving if it doesn't exist
        if not self.expedition_number and not self.pk:
            # Save first to get pk
            super().save(*args, **kwargs)
            # Generate expedition number with the new pk
            year = self.order_date.strftime('%Y') if self.order_date else '2024'
            self.expedition_number = f"EXP{year}{self.pk:05d}"
            # Update with expedition number
            super().save(update_fields=['expedition_number'])
        else:
            super().save(*args, **kwargs)
    
    @property
    def can_be_confirmed(self):
        """Check if order can be confirmed"""
        return self.status == 'pending' and not self.requires_approval
    
    @property
    def can_be_planned(self):
        """Check if order can be planned for delivery"""
        return self.status in ['confirmed', 'pending'] and not self.requires_approval
    
    @property
    def delivery_urgency(self):
        """Calculate delivery urgency score"""
        if not self.expected_delivery_date:
            return 0
        
        days_until_delivery = (self.expected_delivery_date - timezone.now()).days
        
        if days_until_delivery < 0:
            return 100  # Overdue
        elif days_until_delivery <= 1:
            return 90   # Due today/tomorrow
        elif days_until_delivery <= 3:
            return 70   # Due this week
        elif days_until_delivery <= 7:
            return 50   # Due next week
        else:
            return 30   # Due later
    
    def approve_order(self, approved_by_user):
        """Approve an order that requires approval"""
        if not self.requires_approval:
            return False
        
        self.requires_approval = False
        self.approved_by = approved_by_user
        self.approved_at = timezone.now()
        self.save()
        return True
    
    def confirm_order(self):
        """Confirm a pending order"""
        if not self.can_be_confirmed:
            return False
        
        self.status = 'confirmed'
        self.save()
        return True
    
    def plan_order(self, planning_week):
        """Plan an order for delivery"""
        if not self.can_be_planned:
            return False
        
        self.status = 'planned'
        self.planning_week = planning_week
        self.save()
        return True
    
    def assign_to_route(self, route, driver=None, vehicle=None):
        """Assign order to a delivery route"""
        self.assigned_route = route
        if driver:
            self.assigned_driver = driver
        if vehicle:
            self.assigned_vehicle = vehicle
        self.status = 'planned'
        self.save()
        return True
