# Quick Reference Guide - AI Prediction System

## Common Commands

### Update Predictions

```bash
# Update all active clients
python manage.py update_predictions

# Update specific client
python manage.py update_predictions --client-id 42

# Update and show upcoming reorders (next 7 days)
python manage.py update_predictions --show-upcoming 7
```

---

## Python/Django Shell

### Get Prediction Service

```python
from clients.services import get_prediction_service

service = get_prediction_service()

# Check if model loaded
print(service.model_loaded)  # Should be True
```

### Update Single Client

```python
from clients.models import Client

client = Client.objects.get(id=1)
success = service.update_client_prediction(client)

if success:
    print(f"Days until reorder: {client.predicted_next_order_days}")
    print(f"Expected date: {client.predicted_next_order_date}")
    print(f"Priority: {client.priority}")
    print(f"Monthly usage: {client.historical_monthly_usage} tonnes")
```

### Get Upcoming Reorders

```python
# Next 7 days
upcoming = service.get_upcoming_reorders(days_ahead=7)

for client in upcoming:
    days_left = (client.predicted_next_order_date - timezone.now()).days
    print(f"{client.name}: {days_left} days ({client.priority} priority)")
```

### Get Overdue Clients

```python
overdue = service.get_overdue_predictions()

for client in overdue:
    days_overdue = (timezone.now() - client.predicted_next_order_date).days
    print(f"{client.name}: {days_overdue} days overdue")
```

### Find High Priority Clients

```python
high_priority = Client.objects.filter(
    is_active=True,
    priority='high'
).order_by('predicted_next_order_date')

for client in high_priority:
    print(f"{client.name}: {client.predicted_next_order_days} days")
```

---

## Client Operations

### Create New Client

```python
client = Client.objects.create(
    name="ABC Dairy Farm",
    city="Montreal",
    postal_code="H1A 1A1",
    country="Canada"
)
# Automatically geocodes address!
print(f"Coordinates: {client.latitude}, {client.longitude}")
```

### Update Client Address

```python
client = Client.objects.get(id=1)
client.city = "Toronto"
client.postal_code = "M5H 2N2"
client.save()
# Automatically re-geocodes and clears old coordinates!
```

### Check Client Status

```python
client = Client.objects.get(id=1)

print(f"Name: {client.name}")
print(f"Location: {client.city}, {client.country}")
print(f"Has coordinates: {client.has_coordinates}")
print(f"Priority: {client.priority}")
print(f"Monthly usage: {client.historical_monthly_usage} tonnes")
print(f"Days until reorder: {client.predicted_next_order_days}")
print(f"Is urgent: {client.is_urgent}")
```

### Manual Calculations

```python
# Manually calculate monthly usage
usage = client.calculate_monthly_usage(save=True)
print(f"Monthly usage: {usage} tonnes")

# Manually calculate priority
priority = client.calculate_priority()
client.priority = priority
client.save()
print(f"Priority: {priority}")

# Manually geocode
result = client.geocode_from_city_country(save=True)
if result:
    print(f"Geocoded to: {result['latitude']}, {result['longitude']}")
```

---

## Order Operations

### Create Order

```python
order = Order.objects.create(
    client=client,
    client_order_number="ORD-2024-001",
    expedition_number="EXP-001",
    product_name="Soybean Meal",
    sales_order_creation_date=timezone.now(),
    total_amount_ordered_tm=38.0,
    total_amount_delivered_tm=0.0,
    status='pending'
)
```

### Mark Order as Delivered

```python
order.actual_expedition_date = timezone.now()
order.total_amount_delivered_tm = 38.0
order.save()
# Automatically sets status='delivered'!
```

### Check Delivery Status (Batches)

```python
# For orders with multiple batches
order = Order.objects.get(client_order_number="ORD-2024-001")

print(f"Status: {order.delivery_status}")
# Returns: 'not_delivered', 'partially_delivered', or 'fully_delivered'

print(f"Completion: {order.delivery_completion_percentage}%")
print(f"Fully delivered: {order.is_fully_delivered}")
print(f"Partially delivered: {order.is_partially_delivered}")
```

### Combine Batch Data

```python
# Get aggregated data for all batches
combined = Order.combine_batches("ORD-2024-001")

print(f"Total ordered: {combined['total_ordered']} tm")
print(f"Total delivered: {combined['total_delivered']} tm")
print(f"Batch count: {combined['batch_count']}")
print(f"Final delivery: {combined['final_delivery_date']}")
```

---

## Filtering & Queries

### High-Priority Clients Reordering Soon

```python
from django.utils import timezone
from datetime import timedelta

cutoff = timezone.now() + timedelta(days=3)

urgent_clients = Client.objects.filter(
    is_active=True,
    priority='high',
    predicted_next_order_date__lte=cutoff
).order_by('predicted_next_order_date')
```

### Clients by Location

```python
# Clients in Montreal
montreal_clients = Client.objects.filter(
    city__icontains='Montreal',
    is_active=True
)

# Clients in Canada
canadian_clients = Client.objects.filter(
    country='Canada',
    is_active=True
)

# Clients with coordinates
geocoded_clients = Client.objects.exclude(
    latitude__isnull=True
)
```

### Recent Orders

```python
from datetime import timedelta

# Orders in last 30 days
recent_orders = Order.objects.filter(
    sales_order_creation_date__gte=timezone.now() - timedelta(days=30)
).order_by('-sales_order_creation_date')

# Delivered orders this month
delivered_this_month = Order.objects.filter(
    status='delivered',
    actual_expedition_date__month=timezone.now().month,
    actual_expedition_date__year=timezone.now().year
)
```

### Clients by Order Count

```python
from django.db.models import Count

# Clients with most orders
top_clients = Client.objects.annotate(
    order_count=Count('orders')
).filter(
    is_active=True
).order_by('-order_count')[:10]

for client in top_clients:
    print(f"{client.name}: {client.order_count} orders")
```

---

## Bulk Operations

### Update All Predictions

```python
results = service.update_all_predictions()

print(f"Total: {results['total_clients']}")
print(f"Success: {results['successful_predictions']}")
print(f"Failed: {results['failed_predictions']}")
print(f"Skipped: {results['skipped']}")
```

### Geocode All Clients

```python
# Geocode clients missing coordinates
count = 0
for client in Client.objects.filter(latitude__isnull=True):
    if client.update_coordinates_if_missing():
        count += 1
        print(f"Geocoded: {client.name}")

print(f"Total geocoded: {count}")
```

### Recalculate All Priorities

```python
for client in Client.objects.filter(is_active=True, predicted_next_order_date__isnull=False):
    old_priority = client.priority
    new_priority = client.calculate_priority()

    if old_priority != new_priority:
        client.priority = new_priority
        client.save(update_fields=['priority'])
        print(f"{client.name}: {old_priority} → {new_priority}")
```

---

## Model Information

### Check Model Status

```python
service = get_prediction_service()

print(f"Model loaded: {service.model_loaded}")
print(f"Model directory: {service.model_dir}")

if service.model:
    print("✅ XGBoost model ready")
if service.scaler:
    print("✅ StandardScaler ready")
```

### Feature Engineering Test

```python
from clients.services.feature_engineering import ClientFeatureEngineer

engineer = ClientFeatureEngineer()
client = Client.objects.get(id=1)

# Get features
features = engineer.prepare_client_data(client)

if features:
    print(f"Features generated: {len(features)}")
    print(f"Days since last order: {features['days_since_last_order']}")
    print(f"Total volume: {features['total_volume_tonnes']} tonnes")
    print(f"Order frequency: {features['order_frequency_per_month']}/month")

    # Validate
    is_valid, missing = engineer.validate_features(features)
    print(f"Valid: {is_valid}")
    if not is_valid:
        print(f"Missing: {missing}")
else:
    print("❌ Insufficient data (need ≥3 orders)")
```

---

## Cron Job Examples

### Linux/Mac (crontab)

```bash
# Daily at 6 AM
0 6 * * * cd /path/to/backend && /path/to/python manage.py update_predictions >> /var/log/predictions.log 2>&1

# Every 6 hours
0 */6 * * * cd /path/to/backend && /path/to/python manage.py update_predictions

# Weekly on Sunday at midnight
0 0 * * 0 cd /path/to/backend && /path/to/python manage.py update_predictions
```

### Django-Crontab (settings.py)

```python
INSTALLED_APPS = [
    ...
    'django_crontab',
]

CRONJOBS = [
    # Daily at 6 AM
    ('0 6 * * *', 'django.core.management.call_command', ['update_predictions']),

    # Every 12 hours
    ('0 */12 * * *', 'django.core.management.call_command', ['update_predictions']),
]
```

Activate: `python manage.py crontab add`

---

## Debugging

### Check Logs

```bash
# If using cron with log file
tail -f /var/log/predictions.log

# Django logs
tail -f logs/django.log
```

### Verbose Prediction

```python
import logging
logging.basicConfig(level=logging.DEBUG)

from clients.services import get_prediction_service
service = get_prediction_service()

client = Client.objects.get(id=1)
service.update_client_prediction(client)
# Will show detailed logs
```

### Validate Single Client

```python
client = Client.objects.get(id=1)

# Check order count
order_count = client.orders.filter(status='delivered').count()
print(f"Delivered orders: {order_count}")

if order_count < 3:
    print("❌ Need at least 3 orders for prediction")
else:
    # Check feature engineering
    from clients.services.feature_engineering import ClientFeatureEngineer
    engineer = ClientFeatureEngineer()
    features = engineer.prepare_client_data(client)

    if features:
        print(f"✅ Features ready: {len(features)} features")

        # Try prediction
        service = get_prediction_service()
        success = service.update_client_prediction(client)
        print(f"Prediction: {'✅ Success' if success else '❌ Failed'}")
    else:
        print("❌ Feature engineering failed")
```

---

## API Integration (Future)

### REST API Endpoint Example

```python
# views.py
from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(['GET'])
def client_prediction(request, client_id):
    try:
        client = Client.objects.get(id=client_id)

        return Response({
            'client_id': client.id,
            'name': client.name,
            'predicted_days': client.predicted_next_order_days,
            'predicted_date': client.predicted_next_order_date,
            'priority': client.priority,
            'monthly_usage': client.historical_monthly_usage,
            'is_urgent': client.is_urgent
        })
    except Client.DoesNotExist:
        return Response({'error': 'Client not found'}, status=404)

@api_view(['GET'])
def upcoming_reorders(request):
    days = request.GET.get('days', 7)
    service = get_prediction_service()
    clients = service.get_upcoming_reorders(days_ahead=int(days))

    return Response({
        'count': clients.count(),
        'clients': [
            {
                'id': c.id,
                'name': c.name,
                'predicted_date': c.predicted_next_order_date,
                'priority': c.priority
            }
            for c in clients
        ]
    })
```

---

**Last Updated**: 2025-01-17
**System Version**: v2.0
