# Migration Guide: Farmer → Client Model Refactoring

## Overview

This guide covers the migration from the old `Farmer` model to the new `Client` model with integrated AI prediction capabilities.

## Key Changes

### 1. Model Renaming
- `Farmer` → `Client`
- All references updated throughout the codebase

### 2. Field Changes

#### Removed Fields:
- `province` (PROVINCE_CHOICES) → Replaced with `city`, `postal_code`, `country`
- `client_type` (CLIENT_TYPE_CHOICES) → Not needed
- `preferred_delivery_day` → Not tracked
- `phone_number` → Can be added back if needed
- `email` → Can be added back if needed
- `zoho_crm_id` → Can be added back if needed
- `alix_customer_id` → Can be added back if needed
- `FeedStorage` model → Completely removed (sensor tracking not needed)

#### New/Modified Fields:
```python
# Address fields (matching Excel data)
city = models.CharField(max_length=100, blank=True)
postal_code = models.CharField(max_length=20, blank=True)
country = models.CharField(max_length=100, default='Canada')

# Auto-calculated fields
priority = models.CharField(...)  # Auto-calculated from predicted reorder date
historical_monthly_usage = models.DecimalField(...)  # Auto-calculated from order history
last_usage_calculation = models.DateTimeField(...)
```

### 3. Order Model Simplification

#### Old Order Model Fields:
- `order_number` (user-generated)
- `expedition_number`
- `quantity`
- `delivery_method`
- `order_type`
- `status`
- `order_date`
- `expected_delivery_date`
- `actual_delivery_date`
- Plus many route planning fields

#### New Order Model Fields (matching Excel):
```python
# Core identification
client_order_number = models.CharField(...)  # From Excel
expedition_number = models.CharField(...)    # From Excel

# Product info
product_name = models.CharField(...)         # From Excel

# Dates
sales_order_creation_date = models.DateTimeField(...)     # From Excel
promised_expedition_date = models.DateTimeField(...)      # From Excel
actual_expedition_date = models.DateTimeField(...)        # From Excel

# Quantities
total_amount_ordered_tm = models.DecimalField(...)        # From Excel
total_amount_delivered_tm = models.DecimalField(...)      # From Excel

# Status (simplified)
status = 'pending' | 'delivered' | 'cancelled'
```

## Migration Steps

### Step 1: Backup Current Database

```bash
# Export current data
python manage.py dumpdata clients > clients_backup.json

# Backup database
cp db.sqlite3 db.sqlite3.backup
```

### Step 2: Replace Models File

```bash
# Replace old models with new models
mv backend/clients/models.py backend/clients/models_old.py
mv backend/clients/models_new.py backend/clients/models.py
```

### Step 3: Create Migrations

```bash
cd backend
python manage.py makemigrations clients
```

This will create a migration to:
- Rename `Farmer` table to `Client`
- Add new fields: `city`, `postal_code`, `country`
- Remove old fields: `province`, `client_type`, `preferred_delivery_day`, etc.
- Update Order model fields

### Step 4: Data Migration Script

Create a custom migration to transform existing data:

```python
# backend/clients/migrations/0002_data_migration.py
from django.db import migrations

def migrate_farmer_to_client_data(apps, schema_editor):
    """
    Migrate data from old Farmer fields to new Client fields
    """
    Client = apps.get_model('clients', 'Client')

    for client in Client.objects.all():
        # Map province to city if needed
        if client.province == 'QC':
            client.country = 'Canada'
            # You may need to manually set city based on address
        elif client.province == 'ON':
            client.country = 'Canada'
        elif client.province == 'USD':
            client.country = 'United States'
        elif client.province == 'SPAIN':
            client.country = 'Spain'

        client.save()

class Migration(migrations.Migration):
    dependencies = [
        ('clients', '0001_initial'),  # Your initial migration
    ]

    operations = [
        migrations.RunPython(migrate_farmer_to_client_data),
    ]
```

### Step 5: Run Migrations

```bash
python manage.py migrate clients
```

### Step 6: Verify Data

```bash
python manage.py shell
```

```python
from clients.models import Client, Order

# Check client count
print(f"Total clients: {Client.objects.count()}")

# Check sample client
client = Client.objects.first()
print(f"Client: {client.name}")
print(f"City: {client.city}, Country: {client.country}")
print(f"Orders: {client.orders.count()}")

# Check order structure
order = Order.objects.first()
print(f"Order: {order.client_order_number}")
print(f"Product: {order.product_name}")
print(f"Delivered: {order.total_amount_delivered_tm} tm")
```

### Step 7: Geocode Existing Clients

The new model auto-geocodes addresses when they change. For existing clients:

```python
from clients.models import Client

# Geocode all clients without coordinates
for client in Client.objects.filter(latitude__isnull=True):
    if client.city or client.postal_code:
        print(f"Geocoding {client.name}...")
        client.update_coordinates_if_missing()
```

### Step 8: Generate Initial Predictions

```bash
# Update predictions for all active clients
python manage.py update_predictions

# Show upcoming reorders
python manage.py update_predictions --show-upcoming 7
```

## API Changes

### Service Method Changes

#### Old Method Names:
```python
prediction_service.update_farmer_prediction(farmer)
```

#### New Method Names:
```python
prediction_service.update_client_prediction(client)
```

**Note**: Old method names are still supported for backward compatibility via alias methods.

### Management Command Changes

#### Old Command:
```bash
python manage.py update_predictions --farmer-id 1
```

#### New Command:
```bash
python manage.py update_predictions --client-id 1
```

## Auto-Calculated Fields

### Priority
Priority is now **auto-calculated** based on predicted reorder date:

```python
# High: Ordering within 3 days or overdue
# Medium: Ordering within 7 days
# Low: Ordering in 7+ days

client.calculate_priority()  # Returns 'high', 'medium', or 'low'
```

This is automatically updated when predictions are calculated.

### Historical Monthly Usage
Monthly usage is now **auto-calculated** from order history:

```python
client.calculate_monthly_usage()  # Returns tonnes/month
```

This is automatically updated when predictions are calculated.

## Batch Order Handling

The new Order model properly handles orders delivered in multiple batches:

```python
# Check delivery status across all batches
order.delivery_status  # 'not_delivered', 'partially_delivered', 'fully_delivered'

order.is_fully_delivered  # True if all batches delivered
order.delivery_completion_percentage  # 0-100%

# Get combined batch data
Order.combine_batches('CLIENT_ORDER_123')
# Returns aggregated data for all batches with same client_order_number
```

## Testing Checklist

- [ ] All clients migrated successfully
- [ ] Client addresses geocoded
- [ ] Orders properly linked to clients
- [ ] Batch orders handled correctly (same client_order_number)
- [ ] Predictions generated for clients with ≥3 orders
- [ ] Priority auto-calculated correctly
- [ ] Monthly usage auto-calculated correctly
- [ ] Admin interface working
- [ ] API endpoints working

## Rollback Plan

If issues occur:

```bash
# Stop Django
# Restore backup database
cp db.sqlite3.backup db.sqlite3

# Restore old models
mv backend/clients/models_old.py backend/clients/models.py

# Restart Django
python manage.py runserver
```

## Support

For issues:
1. Check logs: `python manage.py update_predictions --client-id 1`
2. Review [AI_PREDICTION_README.md](AI_PREDICTION_README.md)
3. Check feature engineering: `clients/services/feature_engineering.py`

---

**Migration Date**: 2025-01-17
**Models Version**: Client v2.0 (AI-integrated)
