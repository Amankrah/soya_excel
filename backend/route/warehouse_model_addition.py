# Add this to backend/route/models.py after the imports

class Warehouse(models.Model):
    """Model for Soya Excel warehouses/depots (route origins)"""

    name = models.CharField(max_length=200, help_text="Warehouse name (e.g., 'Main Depot - Montreal')")
    code = models.CharField(max_length=20, unique=True, help_text="Warehouse code (e.g., 'MTL-01')")

    # Address information
    address = models.CharField(max_length=500)
    city = models.CharField(max_length=100)
    province = models.CharField(max_length=50)
    postal_code = models.CharField(max_length=20)
    country = models.CharField(max_length=100, default="Canada")

    # Geocoded coordinates
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    has_coordinates = models.BooleanField(default=False)

    # Warehouse details
    capacity_tonnes = models.DecimalField(max_digits=12, decimal_places=2, help_text="Total storage capacity in tonnes")
    current_stock_tonnes = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Operating hours
    operating_hours_start = models.TimeField(default='07:00:00', help_text="Warehouse opening time")
    operating_hours_end = models.TimeField(default='18:00:00', help_text="Warehouse closing time")
    operates_weekends = models.BooleanField(default=False)

    # Contact information
    manager_name = models.CharField(max_length=200, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)

    # Status
    is_active = models.BooleanField(default=True)
    is_primary = models.BooleanField(default=False, help_text="Primary/main warehouse for routes")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_primary', 'name']

    def __str__(self):
        return f"{self.name} ({self.code})"

    @property
    def full_address(self):
        """Return formatted full address"""
        return f"{self.address}, {self.city}, {self.province} {self.postal_code}, {self.country}"

    @property
    def stock_utilization_percentage(self):
        """Calculate current stock utilization"""
        if self.capacity_tonnes > 0:
            return (self.current_stock_tonnes / self.capacity_tonnes) * 100
        return 0


# Update the Route model by adding these fields:

class Route(models.Model):
    # ... existing fields ...

    # ADD THESE FIELDS:
    origin_warehouse = models.ForeignKey(
        'Warehouse',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='outbound_routes',
        help_text="Starting warehouse/depot for this route"
    )

    return_to_warehouse = models.BooleanField(
        default=True,
        help_text="Whether route returns to origin warehouse"
    )

    destination_warehouse = models.ForeignKey(
        'Warehouse',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='inbound_routes',
        help_text="Ending warehouse if different from origin"
    )
