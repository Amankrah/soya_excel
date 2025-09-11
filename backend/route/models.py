from django.db import models
from django.contrib.auth.models import User
from decimal import Decimal
from datetime import timedelta
import json


class Route(models.Model):
    """Model for delivery routes optimized for Soya Excel operations"""
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('planned', 'Planned'),
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('delayed', 'Delayed'),
    ]
    
    ROUTE_TYPE_CHOICES = [
        ('contract', 'Contract Deliveries'),
        ('on_demand', 'On-Demand Deliveries'),
        ('emergency', 'Emergency Refills'),
        ('mixed', 'Mixed Route'),
    ]
    
    name = models.CharField(max_length=200)
    date = models.DateField()
    route_type = models.CharField(max_length=20, choices=ROUTE_TYPE_CHOICES, default='mixed', null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    # Planning details
    planned_during_week = models.CharField(max_length=10, blank=True, help_text="Week when route was planned (e.g., 2024-W45)")
    planning_accuracy_target = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('90.0'), help_text="Target accuracy percentage")
    
    # Route optimization
    total_distance = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Total distance in km")
    estimated_duration = models.IntegerField(null=True, blank=True, help_text="Estimated duration in minutes")
    optimized_sequence = models.JSONField(default=list, help_text="Optimized delivery sequence")
    waypoints = models.JSONField(default=list, help_text="List of waypoints with coordinates")
    
    # Vehicle and capacity
    assigned_vehicle_type = models.CharField(max_length=20, blank=True, help_text="Type of vehicle assigned")
    total_capacity_used = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Total capacity used in tonnes")
    
    # Performance tracking
    actual_distance = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Actual distance traveled")
    actual_duration = models.IntegerField(null=True, blank=True, help_text="Actual duration in minutes")
    fuel_consumed = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text="Fuel consumed in liters")
    co2_emissions = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="CO2 emissions in kg")
    
    # KPI calculations
    km_per_tonne = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text="KM/TM efficiency metric")
    route_efficiency_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="Overall route efficiency percentage")
    
    # Integration with external systems
    alix_route_reference = models.CharField(max_length=100, blank=True, help_text="ALIX system reference")
    gps_tracking_enabled = models.BooleanField(default=True)
    electronic_log_data = models.JSONField(default=dict, blank=True, help_text="Data from electronic truck logs")
    
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_routes')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    @property
    def is_within_accuracy_target(self):
        """Check if route performance is within accuracy target"""
        if self.actual_distance and self.total_distance:
            accuracy = (min(self.actual_distance, self.total_distance) / max(self.actual_distance, self.total_distance)) * 100
            return accuracy >= float(self.planning_accuracy_target)
        return None
    
    @property
    def delivery_efficiency(self):
        """Calculate delivery efficiency based on planned vs actual"""
        if self.estimated_duration and self.actual_duration:
            return (self.estimated_duration / self.actual_duration) * 100
        return None
    
    class Meta:
        ordering = ['-date', '-created_at']
    
    def __str__(self):
        return f"{self.name} - {self.date} ({self.get_route_type_display()})"


class RouteStop(models.Model):
    """Model for individual stops on a route with enhanced tracking"""
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='stops')
    farmer = models.ForeignKey('clients.Farmer', on_delete=models.CASCADE)
    order = models.ForeignKey('clients.Order', on_delete=models.CASCADE)
    
    # Stop sequence and planning
    sequence_number = models.IntegerField()
    estimated_arrival_time = models.DateTimeField(null=True, blank=True)
    estimated_service_time = models.IntegerField(default=30, help_text="Estimated service time in minutes")
    
    # Actual performance
    actual_arrival_time = models.DateTimeField(null=True, blank=True)
    actual_departure_time = models.DateTimeField(null=True, blank=True)
    actual_service_time = models.IntegerField(null=True, blank=True, help_text="Actual service time in minutes")
    
    # Distance and routing
    distance_from_previous = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Distance from previous stop in km")
    duration_from_previous = models.IntegerField(null=True, blank=True, help_text="Duration from previous stop in minutes")
    
    # Delivery specifics for Soya Excel
    delivery_method = models.CharField(max_length=20, choices=[
        ('silo_to_silo', 'Silo to Silo (Bulk)'),
        ('compartment_delivery', 'Tank Compartment'),
        ('tote_delivery', 'Tote Bags'),
    ], default='silo_to_silo', null=True, blank=True)
    
    quantity_to_deliver = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Planned quantity in tonnes")
    quantity_delivered = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Actual quantity delivered")
    
    # Location and GPS
    location_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    
    # Status and notes
    is_completed = models.BooleanField(default=False)
    delivery_notes = models.TextField(blank=True)
    customer_signature_captured = models.BooleanField(default=False)
    delivery_rating = models.IntegerField(null=True, blank=True, help_text="Customer rating 1-5")
    
    # Issues and exceptions
    had_delivery_issues = models.BooleanField(default=False)
    issue_description = models.TextField(blank=True)
    resolution_notes = models.TextField(blank=True)
    
    @property
    def is_on_time(self):
        """Check if delivery was on time"""
        if self.estimated_arrival_time and self.actual_arrival_time:
            # Allow 15 minute buffer
            return self.actual_arrival_time <= (self.estimated_arrival_time + timedelta(minutes=15))
        return None
    
    @property
    def service_efficiency(self):
        """Calculate service efficiency"""
        if self.estimated_service_time and self.actual_service_time:
            return (self.estimated_service_time / self.actual_service_time) * 100
        return None
    
    class Meta:
        ordering = ['route', 'sequence_number']
        unique_together = ['route', 'sequence_number']
    
    def __str__(self):
        return f"{self.route.name} - Stop {self.sequence_number}: {self.farmer.name}"
    
    @property
    def has_coordinates(self):
        """Check if stop has valid coordinates"""
        return self.location_latitude is not None and self.location_longitude is not None
    
    @property
    def coordinates_tuple(self):
        """Get coordinates as tuple (lat, lng) or None"""
        if self.has_coordinates:
            return (float(self.location_latitude), float(self.location_longitude))
        return None
    
    def get_coordinates(self):
        """
        Get coordinates for this stop, using farmer's coordinates as fallback.
        Returns tuple (lat, lng) or None.
        """
        if self.has_coordinates:
            return self.coordinates_tuple
        elif self.farmer.has_coordinates:
            return self.farmer.coordinates_tuple
        return None
    
    def update_coordinates_from_farmer(self, save=True):
        """
        Update stop coordinates from farmer's coordinates.
        Returns True if coordinates were updated.
        """
        if self.farmer.has_coordinates:
            self.location_latitude = self.farmer.latitude
            self.location_longitude = self.farmer.longitude
            if save:
                self.save(update_fields=['location_latitude', 'location_longitude'])
            return True
        return False
    
    def geocode_location(self, save=True):
        """
        Geocode this stop's location using farmer's address.
        Returns geocoding result or None.
        """
        if not self.farmer.address:
            return None
        
        try:
            from route.services import GoogleMapsService
            
            maps_service = GoogleMapsService()
            result = maps_service.geocode_address(self.farmer.address, self.farmer.province)
            
            if result and save:
                self.location_latitude = result['latitude']
                self.location_longitude = result['longitude']
                self.save(update_fields=['location_latitude', 'location_longitude'])
                
                # Also update farmer's coordinates if they don't have them
                if not self.farmer.has_coordinates:
                    self.farmer.latitude = result['latitude']
                    self.farmer.longitude = result['longitude']
                    self.farmer.save(update_fields=['latitude', 'longitude'])
            
            return result
            
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error geocoding location for stop {self.id}: {str(e)}")
            return None


class RouteOptimization(models.Model):
    """Model to store route optimization requests and results"""
    
    OPTIMIZATION_TYPE_CHOICES = [
        ('distance', 'Minimize Distance'),
        ('duration', 'Minimize Duration'),
        ('fuel_cost', 'Minimize Fuel Cost'),
        ('balanced', 'Balanced Optimization'),
        ('co2_emissions', 'Minimize CO2 Emissions'),
    ]
    
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='optimizations')
    optimization_type = models.CharField(max_length=20, choices=OPTIMIZATION_TYPE_CHOICES, default='balanced')
    
    # Request and response data
    request_data = models.JSONField(help_text="Request sent to optimization service")
    response_data = models.JSONField(help_text="Response from optimization service")
    
    # Optimization results
    original_distance = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    optimized_distance = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    distance_savings = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    
    original_duration = models.IntegerField(null=True, blank=True)
    optimized_duration = models.IntegerField(null=True, blank=True)
    time_savings = models.IntegerField(null=True, blank=True)
    
    estimated_fuel_savings = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    estimated_co2_reduction = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    
    # Performance and status
    success = models.BooleanField(default=True)
    error_message = models.TextField(blank=True)
    optimization_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="Overall optimization score")
    
    # Integration with external services
    google_maps_used = models.BooleanField(default=True)
    external_service_cost = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    
    def __str__(self):
        return f"Optimization for {self.route.name} - {self.get_optimization_type_display()}"


class WeeklyRoutePerformance(models.Model):
    """Model for tracking weekly route performance metrics"""
    
    week_start_date = models.DateField(help_text="Monday of the week")
    week_end_date = models.DateField(help_text="Sunday of the week")
    
    # Route statistics
    total_routes_planned = models.IntegerField(default=0)
    total_routes_completed = models.IntegerField(default=0)
    total_routes_cancelled = models.IntegerField(default=0)
    
    # Distance and efficiency metrics
    total_distance_planned = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_distance_actual = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    total_quantity_delivered = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # KPI metrics for different product types
    km_per_tonne_trituro_44 = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    km_per_tonne_dairy_trituro = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    km_per_tonne_oil = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    
    # Environmental metrics
    total_fuel_consumed = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    total_co2_emissions = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    
    # Accuracy and performance
    planning_accuracy_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    on_time_delivery_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    customer_satisfaction_average = models.DecimalField(max_digits=3, decimal_places=2, null=True, blank=True)
    
    # Fleet utilization
    fleet_utilization_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    vehicle_breakdown_by_type = models.JSONField(default=dict, help_text="Usage breakdown by vehicle type")
    
    # Target comparisons
    meets_90_percent_accuracy_target = models.BooleanField(null=True, blank=True)
    exceeds_kpi_targets = models.BooleanField(null=True, blank=True)
    
    calculated_at = models.DateTimeField(auto_now_add=True)
    calculated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    
    class Meta:
        ordering = ['-week_start_date']
        unique_together = ['week_start_date', 'week_end_date']
    
    def __str__(self):
        return f"Week Performance {self.week_start_date} - {self.total_routes_completed} routes"


class MonthlyRoutePerformance(models.Model):
    """Model for tracking monthly route performance metrics (80-85% accuracy target)"""
    
    month = models.DateField(help_text="First day of the month")
    
    # Monthly statistics
    total_routes_month = models.IntegerField(default=0)
    total_distance_month = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_quantity_month = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Long-term KPI tracking
    monthly_km_per_tonne_trituro_44 = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    monthly_km_per_tonne_dairy_trituro = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    monthly_km_per_tonne_oil = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    
    # Longer-term planning accuracy
    planning_accuracy_1_week = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="1 week planning accuracy (90-95% target)")
    planning_accuracy_1_month = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="1 month planning accuracy (80-85% target)")
    planning_accuracy_3_months = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="3 month planning accuracy (80-85% target)")
    
    # Environmental impact
    monthly_co2_emissions = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    sustainability_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    
    # Trend analysis
    compared_to_previous_month = models.CharField(max_length=20, choices=[
        ('improving', 'Improving'),
        ('stable', 'Stable'),
        ('declining', 'Declining'),
    ], null=True, blank=True)
    
    meets_monthly_targets = models.BooleanField(null=True, blank=True)
    
    calculated_at = models.DateTimeField(auto_now_add=True)
    calculated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    
    class Meta:
        ordering = ['-month']
    
    def __str__(self):
        return f"Monthly Performance {self.month.strftime('%Y %B')} - {self.monthly_km_per_tonne_trituro_44 or 'N/A'} KM/TM"
