from django.db import models
from django.contrib.auth.models import User
from decimal import Decimal


class Manager(models.Model):
    """Model representing a supply and logistics manager"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='manager_profile')
    employee_id = models.CharField(max_length=50, unique=True)
    full_name = models.CharField(max_length=200)
    phone_number = models.CharField(max_length=20)
    email = models.EmailField()
    department = models.CharField(max_length=100, default="Supply & Logistics")

    # Soya Excel specific roles
    can_approve_plans = models.BooleanField(default=False, help_text="Can approve distribution plans")
    can_manage_contracts = models.BooleanField(default=False, help_text="Can manage long-term contracts")
    managed_provinces = models.JSONField(default=list, help_text="List of provinces this manager oversees")

    # Multi-Factor Authentication (MFA) fields
    mfa_enabled = models.BooleanField(default=False, help_text="Whether MFA is enabled for this manager")
    mfa_secret = models.CharField(max_length=32, blank=True, default='', help_text="TOTP secret key for MFA")

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.employee_id} - {self.full_name}"


class SoybeanMealProduct(models.Model):
    """Model for Soya Excel's soybean meal products"""
    
    PRODUCT_TYPE_CHOICES = [
        ('soybean_meal_44', 'Soybean Meal 44% Protein'),
        ('soybean_meal_48', 'Soybean Meal 48% Protein'),
        ('soybean_hulls', 'Soybean Hulls'),
        ('soybean_oil', 'Soybean Oil'),
        ('specialty_blend', 'Specialty Blend'),
    ]
    
    ORIGIN_CHOICES = [
        ('canada', 'Canada'),
        ('usa', 'United States'),
        ('brazil', 'Brazil'),
        ('argentina', 'Argentina'),
        ('other', 'Other'),
    ]
    
    product_name = models.CharField(max_length=200)
    product_code = models.CharField(max_length=50, unique=True)
    product_type = models.CharField(max_length=20, choices=PRODUCT_TYPE_CHOICES)
    
    # Nutritional specifications
    protein_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    crude_fiber_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    moisture_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    
    # Origin tracking for sustainability
    primary_origin = models.CharField(max_length=20, choices=ORIGIN_CHOICES, default='canada')
    sustainability_certified = models.BooleanField(default=False)
    
    # Pricing
    base_price_per_tonne = models.DecimalField(max_digits=10, decimal_places=2, help_text="Base price per tonne")
    price_last_updated = models.DateTimeField(auto_now=True)
    
    # Status
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['product_type', 'product_name']
    
    def __str__(self):
        return f"{self.product_name} ({self.product_code})"


class SupplyInventory(models.Model):
    """Model for tracking soybean meal supply inventory"""
    
    product = models.ForeignKey(SoybeanMealProduct, on_delete=models.CASCADE, related_name='inventory_records', null=True, blank=True)
    
    # Inventory levels (in tonnes)
    current_stock = models.DecimalField(max_digits=12, decimal_places=2, help_text="Current stock in tonnes")
    minimum_stock = models.DecimalField(max_digits=12, decimal_places=2, help_text="Minimum stock level in tonnes")
    maximum_stock = models.DecimalField(max_digits=12, decimal_places=2, help_text="Maximum stock level in tonnes")
    
    # Storage location
    silo_number = models.CharField(max_length=20, blank=True)
    storage_location = models.CharField(max_length=100, blank=True, help_text="Physical storage location")
    
    # Batch information
    current_batch_number = models.CharField(max_length=100, blank=True)
    batch_received_date = models.DateTimeField(null=True, blank=True)
    batch_expiry_date = models.DateTimeField(null=True, blank=True)
    
    # Quality metrics
    quality_grade = models.CharField(max_length=10, blank=True)
    last_quality_check = models.DateTimeField(null=True, blank=True)
    
    # Integration with ALIX
    alix_inventory_id = models.CharField(max_length=100, blank=True, help_text="ALIX inventory reference")
    last_restocked = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    @property
    def is_low_stock(self):
        return self.current_stock <= self.minimum_stock
    
    @property
    def stock_percentage(self):
        if self.maximum_stock > 0:
            return (self.current_stock / self.maximum_stock) * 100
        return 0
    
    @property
    def days_of_supply_remaining(self):
        """Estimate days of supply based on recent usage"""
        # This would be calculated based on historical consumption
        # For now, return a simple calculation
        if self.current_stock > 0:
            return int(self.current_stock / 10)  # Placeholder logic
        return 0
    
    class Meta:
        verbose_name_plural = "Supply Inventories"
        ordering = ['product__product_name']
        unique_together = ['product', 'silo_number']
    
    def __str__(self):
        return f"{self.product.product_name} - {self.current_stock} tm"


class SupplyTransaction(models.Model):
    """Model for tracking inventory transactions"""
    TRANSACTION_TYPES = [
        ('container_unload', 'Container Unloading'),
        ('dispatch', 'Dispatch to Customer'),
        ('transfer', 'Inter-Silo Transfer'),
        ('adjustment', 'Inventory Adjustment'),
        ('return', 'Customer Return'),
        ('quality_hold', 'Quality Hold'),
        ('quality_release', 'Quality Release'),
    ]
    
    inventory = models.ForeignKey(SupplyInventory, on_delete=models.CASCADE, related_name='transactions')
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, help_text="Quantity in tonnes (positive for inflow, negative for outflow)")
    
    # Transaction references
    reference_number = models.CharField(max_length=100, unique=True)
    container_number = models.CharField(max_length=50, blank=True, help_text="Container number if applicable")
    bill_of_lading = models.CharField(max_length=100, blank=True)
    
    # Origin tracking
    origin_country = models.CharField(max_length=50, blank=True)
    supplier_name = models.CharField(max_length=200, blank=True)
    
    # Quality information
    quality_certificate = models.TextField(blank=True)
    quality_approved = models.BooleanField(null=True, blank=True)
    
    # Integration references
    alix_transaction_id = models.CharField(max_length=100, blank=True, help_text="ALIX transaction reference")
    order_reference = models.ForeignKey('clients.Order', on_delete=models.SET_NULL, null=True, blank=True)
    
    description = models.TextField(blank=True)
    performed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    transaction_date = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-transaction_date']
    
    def __str__(self):
        return f"{self.transaction_type} - {self.inventory.product.product_name} - {self.quantity}tm"


class WeeklyDistributionPlan(models.Model):
    """Model for Soya Excel's weekly distribution planning (Tuesday-Friday)"""
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('under_review', 'Under Review'),
        ('approved', 'Approved'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    PLANNING_WEEK_CHOICES = [
        ('current', 'Current Week'),
        ('next', 'Next Week'),
        ('week_2', 'Week +2'),
        ('week_3', 'Week +3'),
    ]
    
    plan_name = models.CharField(max_length=200)
    planning_week = models.CharField(max_length=10, choices=PLANNING_WEEK_CHOICES, help_text="Which week this plan covers")
    week_start_date = models.DateField(help_text="Monday of the planning week")
    week_end_date = models.DateField(help_text="Sunday of the planning week")
    
    # Planning details
    total_quantity_planned = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="Total tonnes planned")
    total_contract_deliveries = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_on_demand_deliveries = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_emergency_deliveries = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Routes and logistics
    planned_routes = models.IntegerField(default=0, help_text="Number of planned routes")
    estimated_total_km = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    estimated_fuel_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    estimated_co2_emissions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Accuracy tracking (for 90-95% target)
    forecasted_demand = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    actual_demand = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    forecast_accuracy_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    
    # Status and approvals
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    created_by = models.ForeignKey(Manager, on_delete=models.SET_NULL, null=True, related_name='created_plans')
    approved_by = models.ForeignKey(Manager, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_plans')
    approved_date = models.DateTimeField(null=True, blank=True)
    
    # Planning cycle tracking
    planned_on_tuesday = models.BooleanField(default=False, help_text="Planned during Tuesday-Friday cycle")
    finalized_by_friday = models.BooleanField(default=False, help_text="Finalized by end of Friday")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-week_start_date']
        unique_together = ['planning_week', 'week_start_date']
    
    def __str__(self):
        return f"Week Plan {self.week_start_date} - {self.total_quantity_planned} tm"


class MonthlyDistributionPlan(models.Model):
    """Model for longer-term monthly distribution planning (80-85% accuracy target)"""
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('approved', 'Approved'),
        ('active', 'Active'),
        ('completed', 'Completed'),
    ]
    
    plan_name = models.CharField(max_length=200)
    month = models.DateField(help_text="First day of the month")
    
    # High-level planning
    total_monthly_forecast = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    contract_deliveries_forecast = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    seasonal_adjustments = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Product type breakdown
    dairy_trituro_forecast = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    trituro_44_forecast = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    oil_forecast = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Capacity planning
    production_capacity_needed = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    fleet_utilization_target = models.DecimalField(max_digits=5, decimal_places=2, default=85.0)
    
    # Accuracy tracking
    actual_monthly_deliveries = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    forecast_accuracy_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    created_by = models.ForeignKey(Manager, on_delete=models.SET_NULL, null=True)
    approved_by = models.ForeignKey(Manager, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_monthly_plans')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-month']
    
    def __str__(self):
        return f"Monthly Plan {self.month.strftime('%Y %B')} - {self.total_monthly_forecast} tm"


class KPIMetrics(models.Model):
    """Model for storing Soya Excel's priority KPI metrics"""
    
    METRIC_TYPE_CHOICES = [
        ('km_per_tonne_trituro_44', 'KM/TM for All Trituro 44'),
        ('km_per_tonne_dairy_trituro', 'KM/TM for All Dairy Trituro'),
        ('km_per_tonne_oil', 'KM/TM for All Oil'),
        ('forecast_accuracy', 'Forecast Accuracy'),
        ('on_time_delivery', 'On-Time Delivery Rate'),
        ('fleet_utilization', 'Fleet Utilization'),
        ('co2_emissions', 'CO2 Emissions'),
        ('customer_satisfaction', 'Customer Satisfaction'),
    ]
    
    PERIOD_TYPE_CHOICES = [
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
        ('annual', 'Annual'),
    ]
    
    metric_type = models.CharField(max_length=30, choices=METRIC_TYPE_CHOICES)
    period_type = models.CharField(max_length=10, choices=PERIOD_TYPE_CHOICES)
    period_start = models.DateField()
    period_end = models.DateField()
    
    # Metric values
    metric_value = models.DecimalField(max_digits=12, decimal_places=2)
    target_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    previous_period_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    
    # Supporting data
    total_distance_km = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    total_tonnes_delivered = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    number_of_deliveries = models.IntegerField(null=True, blank=True)
    
    # Trend analysis
    trend_direction = models.CharField(max_length=10, choices=[
        ('improving', 'Improving'),
        ('stable', 'Stable'),
        ('declining', 'Declining'),
    ], null=True, blank=True)
    
    calculated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    calculated_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-period_end', 'metric_type']
        unique_together = ['metric_type', 'period_type', 'period_start', 'period_end']
    
    def __str__(self):
        return f"{self.get_metric_type_display()} - {self.period_start} to {self.period_end}: {self.metric_value}"
