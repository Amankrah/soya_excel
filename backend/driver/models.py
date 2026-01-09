from django.db import models
from django.contrib.auth.models import User
from decimal import Decimal


class Vehicle(models.Model):
    """Model for tracking Soya Excel's vehicle fleet"""
    
    VEHICLE_TYPE_CHOICES = [
        ('bulk_truck', 'Bulk Truck'),
        ('tank_oil', 'Oil Tank'),
        ('tank_blower', 'Blower Compartment Tank'),
        ('box_truck', 'Box Truck (Tote Bags)'),
        ('dump_truck', 'Dump Truck'),
    ]
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('maintenance', 'In Maintenance'),
        ('out_of_service', 'Out of Service'),
    ]
    
    vehicle_number = models.CharField(max_length=50, unique=True)
    vehicle_type = models.CharField(max_length=20, choices=VEHICLE_TYPE_CHOICES)
    capacity_tonnes = models.DecimalField(max_digits=8, decimal_places=2, help_text="Vehicle capacity in tonnes")
    
    # Vehicle specifications
    make_model = models.CharField(max_length=100, blank=True)
    year = models.IntegerField(null=True, blank=True)
    license_plate = models.CharField(max_length=20, blank=True)
    
    # GPS and tracking
    has_gps_tracking = models.BooleanField(default=False)
    electronic_log_device = models.CharField(max_length=100, blank=True, help_text="Electronic truck log device ID")
    
    # Status and maintenance
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    last_maintenance = models.DateTimeField(null=True, blank=True)
    next_maintenance_due = models.DateTimeField(null=True, blank=True)
    odometer_km = models.IntegerField(default=0, help_text="Current odometer reading in KM")
    
    # Environmental tracking
    fuel_efficiency_l_per_100km = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    co2_emissions_factor = models.DecimalField(max_digits=8, decimal_places=4, default=Decimal('2.31'), help_text="CO2 kg per liter of diesel")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    @property
    def is_available(self):
        return self.status == 'active'
    
    def calculate_co2_emissions(self, distance_km):
        """Calculate CO2 emissions for a given distance"""
        if self.fuel_efficiency_l_per_100km:
            fuel_used = (distance_km / 100) * float(self.fuel_efficiency_l_per_100km)
            return fuel_used * float(self.co2_emissions_factor)
        return 0
    
    class Meta:
        ordering = ['vehicle_type', 'vehicle_number']
    
    def __str__(self):
        return f"{self.vehicle_number} ({self.get_vehicle_type_display()})"


class Driver(models.Model):
    """Model representing a delivery driver"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='driver_profile')
    staff_id = models.CharField(max_length=50, unique=True)
    full_name = models.CharField(max_length=200)
    phone_number = models.CharField(max_length=20)
    license_number = models.CharField(max_length=50)
    
    # Vehicle assignment
    assigned_vehicle = models.ForeignKey(Vehicle, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_drivers')
    can_drive_vehicle_types = models.JSONField(default=list, help_text="List of vehicle types this driver is certified for")
    
    # Availability and status
    is_available = models.BooleanField(default=True)
    current_location_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    current_location_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    last_location_update = models.DateTimeField(null=True, blank=True)
    
    # Performance tracking
    total_deliveries_completed = models.IntegerField(default=0)
    total_km_driven = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    average_delivery_rating = models.DecimalField(max_digits=3, decimal_places=2, null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    @property
    def vehicle_number(self):
        """Get the assigned vehicle number for display purposes"""
        return self.assigned_vehicle.vehicle_number if self.assigned_vehicle else None
    
    @property
    def current_delivery_status(self):
        """Get current delivery status if driver is on a delivery"""
        active_delivery = self.deliveries.filter(status__in=['assigned', 'in_progress']).first()
        if active_delivery:
            return {
                'status': active_delivery.status,
                'route_name': active_delivery.route.name,
                'delivery_id': active_delivery.id
            }
        return None
    
    class Meta:
        ordering = ['full_name']
    
    def __str__(self):
        return f"{self.staff_id} - {self.full_name}"


class Delivery(models.Model):
    """Model for tracking deliveries assigned to drivers"""
    STATUS_CHOICES = [
        ('assigned', 'Assigned'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('delayed', 'Delayed'),
    ]
    
    driver = models.ForeignKey(Driver, on_delete=models.CASCADE, related_name='deliveries')
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='deliveries', null=True, blank=True)
    route = models.ForeignKey('route.Route', on_delete=models.CASCADE, related_name='deliveries')
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='assigned')
    assigned_date = models.DateTimeField(auto_now_add=True)
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    
    # Delivery metrics
    total_quantity_delivered = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Total delivered in tonnes")
    actual_distance_km = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    actual_duration_minutes = models.IntegerField(null=True, blank=True)
    
    # Environmental metrics
    fuel_consumed_liters = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    co2_emissions_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    
    # GPS tracking data from electronic log
    gps_tracking_data = models.JSONField(default=dict, blank=True, help_text="GPS data from electronic truck log")
    
    notes = models.TextField(blank=True)
    
    @property
    def km_per_tonne(self):
        """Calculate KM/TM metric (Soya Excel's priority KPI)"""
        if self.total_quantity_delivered and self.actual_distance_km:
            return float(self.actual_distance_km) / float(self.total_quantity_delivered)
        return 0
    
    @property
    def efficiency_rating(self):
        """Rate delivery efficiency based on time vs estimated"""
        if self.start_time and self.end_time and self.route.estimated_duration:
            actual_minutes = (self.end_time - self.start_time).total_seconds() / 60
            efficiency = (self.route.estimated_duration / actual_minutes) * 100
            return min(100, max(0, efficiency))  # Cap between 0-100%
        return None
    
    class Meta:
        ordering = ['-assigned_date']
    
    def __str__(self):
        return f"Delivery - {self.driver.full_name} - {self.assigned_date.date()}"


class DeliveryItem(models.Model):
    """Model for individual delivery items within a delivery"""
    delivery = models.ForeignKey(Delivery, on_delete=models.CASCADE, related_name='items')
    order = models.ForeignKey('clients.Order', on_delete=models.CASCADE)
    farmer = models.ForeignKey('clients.Client', on_delete=models.CASCADE)
    
    # Delivery details
    quantity_planned = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Planned quantity in tonnes")
    quantity_delivered = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Actual delivered quantity in tonnes")
    delivery_time = models.DateTimeField(null=True, blank=True)
    
    # Delivery method specifics
    delivery_method = models.CharField(max_length=20, choices=[
        ('silo_to_silo', 'Silo to Silo (Bulk)'),
        ('compartment_unload', 'Tank Compartment Unload'),
        ('tote_delivery', 'Tote Bag Delivery'),
    ], default='silo_to_silo', null=True, blank=True)
    
    # Quality and confirmation
    signature = models.TextField(null=True, blank=True, help_text="Base64 encoded signature")
    delivery_confirmation_number = models.CharField(max_length=50, blank=True)
    quality_check_passed = models.BooleanField(null=True, blank=True)
    
    # Customer feedback
    customer_rating = models.IntegerField(null=True, blank=True, help_text="1-5 rating from customer")
    notes = models.TextField(blank=True)
    
    def __str__(self):
        return f"Item - {self.farmer.name} - {self.quantity_planned} tm"


class DeliveryPerformanceMetrics(models.Model):
    """Model for storing calculated performance metrics"""
    
    METRIC_TYPE_CHOICES = [
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
        ('annual', 'Annual'),
    ]
    
    PRODUCT_TYPE_CHOICES = [
        ('all_trituro_44', 'All Trituro 44'),
        ('all_dairy_trituro', 'All Dairy Trituro'),
        ('all_oil', 'All Oil'),
        ('combined', 'Combined'),
    ]
    
    metric_type = models.CharField(max_length=20, choices=METRIC_TYPE_CHOICES)
    product_type = models.CharField(max_length=20, choices=PRODUCT_TYPE_CHOICES)
    period_start = models.DateTimeField()
    period_end = models.DateTimeField()
    
    # Soya Excel's priority KPIs
    total_km = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_tonnes = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    km_per_tonne = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    
    # Additional metrics
    total_deliveries = models.IntegerField(default=0)
    total_co2_emissions_kg = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    average_delivery_time_minutes = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    on_time_delivery_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    
    calculated_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-period_end']
        unique_together = ['metric_type', 'product_type', 'period_start', 'period_end']
    
    def __str__(self):
        return f"{self.get_metric_type_display()} - {self.get_product_type_display()} - KM/TM: {self.km_per_tonne}"
