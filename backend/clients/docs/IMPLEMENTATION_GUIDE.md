# Implementation Guide - New Client/Order System

## Overview

This guide will help you replace the old Farmer/FeedStorage system with the new Client/Order system that includes AI prediction capabilities.

---

## 📋 Files Summary

### New Files Created

| Old File | New File | Status |
|----------|----------|--------|
| `models.py` | `models_new.py` | ✅ Ready to replace |
| `serializers.py` | `serializers_new.py` | ✅ Ready to replace |
| `views.py` | `views_new.py` | ✅ Ready to replace |
| `urls.py` | `urls_new.py` | ✅ Ready to replace |
| `admin.py` | `admin_new.py` | ✅ Ready to replace |
| `apps.py` | `apps_new.py` | ⚠️ Optional (minimal changes) |

### Additional Files (No changes needed)
- ✅ `services/prediction_service.py` - Already updated
- ✅ `services/feature_engineering.py` - Already updated
- ✅ `management/commands/update_predictions.py` - Already updated

---

## 🔄 Step-by-Step Implementation

### Step 1: Backup Current System

```bash
# Navigate to clients app
cd backend/clients

# Create backup directory
mkdir -p backup_old_system

# Backup current files
cp models.py backup_old_system/
cp serializers.py backup_old_system/
cp views.py backup_old_system/
cp urls.py backup_old_system/
cp admin.py backup_old_system/
```

### Step 2: Replace Files

**IMPORTANT**: Do this in the correct order!

```bash
# 1. Replace models first (database schema)
mv models.py models_old.py
mv models_new.py models.py

# 2. Replace serializers (API layer)
mv serializers.py serializers_old.py
mv serializers_new.py serializers.py

# 3. Replace views (business logic)
mv views.py views_old.py
mv views_new.py views.py

# 4. Replace URLs (routing)
mv urls.py urls_old.py
mv urls_new.py urls.py

# 5. Replace admin (Django admin interface)
mv admin.py admin_old.py
mv admin_new.py admin.py

# 6. OPTIONAL: Replace apps.py
mv apps.py apps_old.py
mv apps_new.py apps.py
```

### Step 3: Create and Run Migrations

```bash
cd backend

# Create migrations
python manage.py makemigrations clients

# Review the migration file
# Django should detect:
# - Rename Farmer → Client
# - Remove FeedStorage model
# - Update Order model fields
# - Add new indexes

# Run migrations
python manage.py migrate clients
```

### Step 4: Verify Model Changes

```bash
python manage.py shell
```

```python
from clients.models import Client, Order

# Check Client model
print(f"Clients: {Client.objects.count()}")
client = Client.objects.first()
print(f"Client: {client.name}, {client.city}, {client.country}")

# Check Order model
print(f"Orders: {Order.objects.count()}")
order = Order.objects.first()
print(f"Order: {order.client_order_number}, {order.total_amount_delivered_tm} tm")

# Check legacy alias
from clients.models import Farmer
print(f"Farmer alias works: {Farmer.objects.count()}")
```

### Step 5: Update Predictions

```bash
# Test prediction for single client
python manage.py update_predictions --client-id 1

# Update all clients (this may take time)
python manage.py update_predictions

# View upcoming reorders
python manage.py update_predictions --show-upcoming 7
```

### Step 6: Geocode Addresses

```bash
python manage.py shell
```

```python
from clients.models import Client

# Geocode all clients missing coordinates
for client in Client.objects.filter(latitude__isnull=True):
    if client.city or client.postal_code:
        print(f"Geocoding {client.name}...")
        client.update_coordinates_if_missing()
```

### Step 7: Test API Endpoints

```bash
# Start development server
python manage.py runserver
```

Test these endpoints (adjust auth headers as needed):

```bash
# List clients
GET http://localhost:8000/api/clients/

# Get client predictions
GET http://localhost:8000/api/clients/predictions/

# Get upcoming reorders
GET http://localhost:8000/api/clients/upcoming_reorders/?days=7

# Get client statistics
GET http://localhost:8000/api/clients/statistics/

# List orders
GET http://localhost:8000/api/orders/

# Get order statistics
GET http://localhost:8000/api/orders/statistics/

# Get batch details
GET http://localhost:8000/api/orders/by_client_order_number/?client_order_number=ORD-001
```

### Step 8: Verify Django Admin

1. Navigate to: `http://localhost:8000/admin/clients/`
2. Check that you see:
   - ✅ Clients (with prediction fields)
   - ✅ Orders (with batch information)
   - ❌ Feed Storage (removed)

3. Test admin actions:
   - Update predictions for selected clients
   - Geocode addresses
   - Recalculate monthly usage
   - Mark orders as delivered

---

## 🔍 Key Changes Summary

### Model Changes

#### Client Model (formerly Farmer)

**Removed Fields:**
- `province` (replaced with `city`, `postal_code`, `country`)
- `client_type` (not needed)
- `phone_number` (can add back if needed)
- `email` (can add back if needed)
- `preferred_delivery_day` (not tracked)
- `zoho_crm_id` (can add back if needed)
- `alix_customer_id` (can add back if needed)

**New/Modified Fields:**
- `city` - Client city
- `postal_code` - Client postal code
- `country` - Client country (default: Canada)
- `priority` - **Auto-calculated** from predictions
- `historical_monthly_usage` - **Auto-calculated** from orders
- `last_usage_calculation` - Timestamp of last calculation

**AI Prediction Fields** (all auto-updated):
- `predicted_next_order_days`
- `predicted_next_order_date`
- `prediction_confidence_lower`
- `prediction_confidence_upper`
- `last_prediction_update`
- `prediction_accuracy_score`

#### Order Model

**Removed Fields:**
- `order_number` (replaced with `client_order_number`)
- `quantity` (replaced with `total_amount_ordered_tm` & `total_amount_delivered_tm`)
- `delivery_method` (replaced with `product_name`)
- `order_type` (simplified)
- `order_date` (replaced with `sales_order_creation_date`)
- `expected_delivery_date` (replaced with `promised_expedition_date`)
- `actual_delivery_date` (replaced with `actual_expedition_date`)
- `forecast_based`, `planning_week` (simplified)
- Route/driver/vehicle assignments (can add back if needed)
- Approval fields (can add back if needed)

**New/Simplified Fields:**
- `client_order_number` - Order number (multiple batches may share)
- `expedition_number` - Unique batch/expedition number
- `product_name` - Product delivered
- `sales_order_creation_date` - When order was created
- `promised_expedition_date` - Promised delivery date
- `actual_expedition_date` - Actual delivery date
- `total_amount_ordered_tm` - Ordered quantity in tonnes
- `total_amount_delivered_tm` - Delivered quantity in tonnes

**Status Simplified:**
- `pending` (was: pending, confirmed, planned, in_transit)
- `delivered`
- `cancelled`

#### Removed Models
- ❌ `FeedStorage` - Sensor tracking not needed

---

## 🆕 New Features

### 1. AI Predictions (Automatic)
- Daily predictions via cron job
- Auto-calculated priority (high/medium/low)
- Confidence intervals
- Upcoming reorder alerts

### 2. Auto-Geocoding
- Automatically geocodes when address changes
- Uses city, postal_code, country
- Updates latitude/longitude

### 3. Batch Order Handling
- Multiple deliveries per order
- Delivery status: not_delivered, partially_delivered, fully_delivered
- Completion percentage
- Batch aggregation via `Order.combine_batches()`

### 4. Auto-Calculated Metrics
- Monthly usage from order history
- Priority from prediction urgency
- No manual data entry required

---

## 📊 API Endpoint Changes

### Client Endpoints

| Old Endpoint | New Endpoint | Notes |
|--------------|--------------|-------|
| `/api/farmers/` | `/api/clients/` | Renamed |
| `/api/farmers/{id}/orders/` | `/api/clients/{id}/orders/` | Same functionality |
| `/api/farmers/{id}/geocode_address/` | `/api/clients/{id}/geocode/` | Renamed |
| `/api/farmers/low_stock/` | ❌ Removed | FeedStorage removed |
| ❌ N/A | `/api/clients/predictions/` | **NEW** |
| ❌ N/A | `/api/clients/upcoming_reorders/` | **NEW** |
| ❌ N/A | `/api/clients/overdue_predictions/` | **NEW** |
| ❌ N/A | `/api/clients/urgent/` | **NEW** |
| ❌ N/A | `/api/clients/high_priority/` | **NEW** |
| ❌ N/A | `/api/clients/statistics/` | **NEW** |
| ❌ N/A | `/api/clients/{id}/update_prediction/` | **NEW** |
| ❌ N/A | `/api/clients/bulk_geocode/` | **NEW** |

### Order Endpoints

| Old Endpoint | New Endpoint | Notes |
|--------------|--------------|-------|
| `/api/orders/` | `/api/orders/` | Same |
| `/api/orders/pending/` | `/api/orders/pending/` | Same |
| `/api/orders/requires_approval/` | ❌ Removed | Simplified |
| `/api/orders/urgent/` | ❌ Removed | Use client priority |
| `/api/orders/summary/` | `/api/orders/statistics/` | Renamed |
| ❌ N/A | `/api/orders/{id}/batch_details/` | **NEW** |
| ❌ N/A | `/api/orders/by_client_order_number/` | **NEW** |
| ❌ N/A | `/api/orders/delivery_report/` | **NEW** |

### Removed Endpoints
- ❌ `/api/feed-storage/` - FeedStorage model removed

---

## 🔧 Configuration Updates

### Update Cron Job (if using)

**Old:**
```bash
0 6 * * * python manage.py update_predictions --farmer-id 1
```

**New:**
```bash
0 6 * * * python manage.py update_predictions --client-id 1
```

---

## ⚠️ Breaking Changes

### 1. URL Changes
- `/api/farmers/` → `/api/clients/`
- Update all frontend API calls

### 2. Field Name Changes
- `farmer` → `client` in Order serializer
- `province` → `city`, `postal_code`, `country`
- `quantity` → `total_amount_delivered_tm`
- `order_date` → `sales_order_creation_date`
- `actual_delivery_date` → `actual_expedition_date`

### 3. Removed Features
- FeedStorage tracking (sensor data)
- Order approval workflow
- Route/driver assignment (can add back if needed)

### 4. Status Changes
Order status simplified from 6 options to 3:
- OLD: `pending`, `confirmed`, `planned`, `in_transit`, `delivered`, `cancelled`
- NEW: `pending`, `delivered`, `cancelled`

---

## 🐛 Troubleshooting

### Issue: Migration fails

**Solution:**
```bash
# Drop and recreate database (DEV ONLY - YOU WILL LOSE DATA)
python manage.py migrate clients zero
python manage.py migrate clients

# OR manually fix migration file
python manage.py showmigrations clients
```

### Issue: "No such column" errors

**Cause:** Old code still using old field names

**Solution:** Search for old field names:
```bash
grep -r "actual_delivery_date" .
grep -r "\.quantity" .
grep -r "farmer\." .
```

### Issue: Predictions not updating

**Check:**
1. Model files in `model_deployment_xgboost/`
2. At least 3 delivered orders per client
3. Orders have `actual_expedition_date` set
4. Client `is_active=True`

```bash
python manage.py update_predictions --client-id 1
# Check logs for errors
```

### Issue: Geocoding not working

**Check:**
1. Google Maps API key configured
2. `route.services.GoogleMapsService` available
3. Client has `city` or `postal_code`

```python
from clients.models import Client
client = Client.objects.first()
result = client.geocode_from_city_country(save=True)
print(result)
```

---

## ✅ Verification Checklist

After implementation, verify:

- [ ] All clients migrated from Farmer to Client
- [ ] Client addresses geocoded (latitude/longitude populated)
- [ ] Orders properly linked to clients
- [ ] Batch orders handled correctly (same client_order_number)
- [ ] Predictions generated for clients with ≥3 orders
- [ ] Priority auto-calculated correctly
- [ ] Monthly usage auto-calculated correctly
- [ ] Django admin interface working
- [ ] API endpoints responding correctly
- [ ] Frontend updated to use new endpoints
- [ ] Cron job scheduled for daily predictions
- [ ] No references to old field names in codebase
- [ ] FeedStorage references removed

---

## 📞 Support

If you encounter issues:

1. **Check logs**: `python manage.py update_predictions --client-id 1`
2. **Review documentation**: `AI_PREDICTION_README.md`, `MIGRATION_GUIDE.md`
3. **Verify field names**: `FIELD_MAPPING_REFERENCE.md`
4. **Test in shell**: Use Django shell to debug

---

## 🎯 Quick Commands Reference

```bash
# Update all predictions
python manage.py update_predictions

# Update specific client
python manage.py update_predictions --client-id 1

# Show upcoming reorders
python manage.py update_predictions --show-upcoming 7

# Django shell testing
python manage.py shell

# Run development server
python manage.py runserver

# Create superuser (if needed)
python manage.py createsuperuser
```

---

**Last Updated**: 2025-01-17
**System Version**: v2.0 (Client/Order with AI Predictions)
