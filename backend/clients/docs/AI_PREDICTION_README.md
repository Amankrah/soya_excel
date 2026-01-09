# AI Reorder Prediction System - Implementation Guide

## 🎯 Overview

This system automatically predicts when clients will place their next soybean meal order using a trained XGBoost machine learning model. The predictions are based on historical order patterns and client behavior.

**Key Features:**
- ✅ Automatic feature engineering from order history
- ✅ XGBoost model with 4.88 days average error
- ✅ Confidence intervals for predictions
- ✅ Automated daily updates via cron job
- ✅ REST API endpoints for integration
- ✅ No manual data entry required

---

## 📦 Installation & Setup

### 1. Install Required Packages

```bash
pip install xgboost pandas numpy scikit-learn joblib
```

### 2. Run Database Migrations

```bash
python manage.py makemigrations clients
python manage.py migrate clients
```

This adds the following fields to the `Farmer` model:
- `predicted_next_order_days` - Days until predicted reorder
- `predicted_next_order_date` - Expected reorder date
- `prediction_confidence_lower` - Lower confidence bound (days)
- `prediction_confidence_upper` - Upper confidence bound (days)
- `last_prediction_update` - When prediction was last calculated
- `prediction_accuracy_score` - Historical accuracy for this client

### 3. Verify Model Files

Ensure the `model_deployment_xgboost/` folder is in the backend directory with these files:
- `xgboost_model_v1_*.pkl`
- `standard_scaler_v1_*.pkl`
- `feature_metadata_v1_*.json`
- `performance_metrics_v1_*.json`

---

## 🚀 Usage

### Manual Prediction Update

Update predictions for all active farmers:

```bash
python manage.py update_predictions
```

Update a specific farmer:

```bash
python manage.py update_predictions --farmer-id 42
```

Show upcoming reorders:

```bash
python manage.py update_predictions --show-upcoming 7
```

---

## ⏰ Automated Daily Updates

### Using Cron (Linux/Mac)

Add to crontab (`crontab -e`):

```bash
# Update predictions daily at 6 AM
0 6 * * * cd /path/to/soya_excel/backend && /path/to/python manage.py update_predictions >> /var/log/predictions.log 2>&1
```

### Using Windows Task Scheduler

1. Open Task Scheduler
2. Create Basic Task
3. Trigger: Daily at 6:00 AM
4. Action: Start a Program
   - Program: `C:\path\to\python.exe`
   - Arguments: `manage.py update_predictions`
   - Start in: `C:\path\to\soya_excel\backend`

### Using Django-Crontab (Recommended)

Install:
```bash
pip install django-crontab
```

Add to `settings.py`:
```python
INSTALLED_APPS = [
    ...
    'django_crontab',
]

CRONJOBS = [
    ('0 6 * * *', 'django.core.management.call_command', ['update_predictions']),
]
```

Activate:
```bash
python manage.py crontab add
```

---

## 🔧 How It Works

### 1. Feature Engineering

The system automatically transforms client order history into 47 features:

**Client History Features:**
- Average days between orders
- Order frequency per month
- Total volume ordered (tonnes)
- Ordering consistency score
- Client lifetime (days since first order)

**Recent Behavior:**
- Rolling averages (3, 5, 7 day windows)
- Days since last order
- Deviation from normal pattern
- Trend indicators

**Volume Metrics:**
- Total tonnes ordered
- Volume per day consumption rate
- Average order size
- Client volume tier (0-4)

### 2. Prediction Process

```
Client Order History
         ↓
Feature Engineering (47 features)
         ↓
StandardScaler (normalize features)
         ↓
XGBoost Model
         ↓
Prediction + Confidence Interval
         ↓
Save to Database
```

### 3. Prediction Requirements

**Minimum requirements for prediction:**
- ✅ At least 3 delivered orders
- ✅ Orders have `actual_delivery_date` set
- ✅ Farmer status is `active`

**If client doesn't meet requirements:**
- Prediction is skipped
- `predicted_next_order_days` remains NULL

---

## 📊 Using Predictions in Your Application

### In Django Admin

Predictions are automatically visible in the Farmer admin:
```python
# admin.py
@admin.register(Farmer)
class FarmerAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'predicted_next_order_date',
        'predicted_next_order_days',
        'last_prediction_update'
    ]
    readonly_fields = [
        'predicted_next_order_days',
        'predicted_next_order_date',
        'prediction_confidence_lower',
        'prediction_confidence_upper',
        'last_prediction_update'
    ]
```

### In Python Code

```python
from clients.services import get_prediction_service

# Get prediction service
service = get_prediction_service()

# Update single farmer
from clients.models import Farmer
farmer = Farmer.objects.get(id=1)
success = service.update_farmer_prediction(farmer)

if success:
    print(f"Expected reorder in {farmer.predicted_next_order_days:.1f} days")
    print(f"Expected date: {farmer.predicted_next_order_date}")

# Get farmers reordering soon
upcoming = service.get_upcoming_reorders(days_ahead=7)
for farmer in upcoming:
    print(f"{farmer.name}: {farmer.predicted_next_order_date}")

# Get overdue farmers
overdue = service.get_overdue_predictions()
```

### In Templates

```html
{% if farmer.predicted_next_order_date %}
    <div class="prediction-card">
        <h3>Next Order Prediction</h3>
        <p>Expected: {{ farmer.predicted_next_order_date|date:"Y-m-d" }}</p>
        <p>In {{ farmer.predicted_next_order_days }} days</p>
        <p class="confidence">
            Confidence: {{ farmer.prediction_confidence_lower|floatformat:1 }} -
            {{ farmer.prediction_confidence_upper|floatformat:1 }} days
        </p>
    </div>
{% endif %}
```

---

## 🎯 Business Use Cases

### 1. Proactive Inventory Management

```python
# Get clients expected to reorder this week
upcoming_week = service.get_upcoming_reorders(days_ahead=7)
total_expected_volume = sum(f.historical_monthly_usage or 0 for f in upcoming_week)
print(f"Expected demand this week: {total_expected_volume} tonnes")
```

### 2. Sales Outreach

```python
# Find clients overdue for reorder
overdue = service.get_overdue_predictions()
for farmer in overdue:
    days_overdue = (timezone.now() - farmer.predicted_next_order_date).days
    # Send automated reminder email
    send_reorder_reminder(farmer, days_overdue)
```

### 3. Route Planning

```python
# Plan deliveries for next 2 weeks
upcoming_2weeks = service.get_upcoming_reorders(days_ahead=14)
# Group by region for efficient routing
from route.services import optimize_routes
routes = optimize_routes(upcoming_2weeks)
```

### 4. Dashboard Alerts

```python
# Alert for high-priority clients
high_priority_upcoming = service.get_upcoming_reorders(days_ahead=3).filter(
    farmer__priority='high'
)
if high_priority_upcoming.exists():
    send_alert_to_sales_team(high_priority_upcoming)
```

---

## 📈 Monitoring & Accuracy

### Prediction Accuracy

The model has these performance metrics:
- **Test MAE**: 4.88 days (average error)
- **Test RMSE**: 6.56 days
- **Test R²**: 0.4823 (48% variance explained)

### Checking Prediction Status

```python
from clients.models import Farmer
from django.utils import timezone
from datetime import timedelta

# Farmers with stale predictions (>7 days old)
stale = Farmer.objects.filter(
    is_active=True,
    last_prediction_update__lt=timezone.now() - timedelta(days=7)
)

# Farmers with no predictions
no_predictions = Farmer.objects.filter(
    is_active=True,
    predicted_next_order_days__isnull=True
)
```

---

## 🐛 Troubleshooting

### "Model not loaded" Error

**Problem**: XGBoost model files not found

**Solution**:
1. Check `model_deployment_xgboost/` folder exists in backend directory
2. Verify model files are present
3. Check file permissions
4. Review logs: `python manage.py update_predictions --farmer-id 1`

### "Insufficient data" Warning

**Problem**: Client doesn't have enough orders

**Solution**:
- Client needs at least 3 delivered orders
- Ensure orders have `actual_delivery_date` set
- Check `status='delivered'`

### Predictions Seem Inaccurate

**Possible causes**:
1. **Client behavior changed**: Recent pattern different from history
2. **Irregular ordering**: Client doesn't have consistent pattern
3. **Insufficient history**: Need more orders for better accuracy
4. **Data quality**: Missing or incorrect delivery dates

**Solutions**:
- Monitor `prediction_accuracy_score` field
- Compare predictions vs actual for validation
- Consider re-training model with more recent data

---

## 🔄 Model Updates

To update the XGBoost model with new data:

1. Re-run the training notebook: `ml_training/ml.ipynb`
2. Generate new deployment package
3. Replace files in `model_deployment_xgboost/`
4. Restart Django application
5. Run: `python manage.py update_predictions`

---

## 📞 Support

For issues or questions:
- Check logs: `python manage.py update_predictions --farmer-id <id>`
- Review feature engineering: `clients/services/feature_engineering.py`
- Model performance metrics: `model_deployment_xgboost/performance_metrics_*.json`

---

## ✅ Quick Start Checklist

- [ ] Install dependencies: `pip install xgboost pandas numpy scikit-learn joblib`
- [ ] Run migrations: `python manage.py migrate clients`
- [ ] Verify model files in `model_deployment_xgboost/`
- [ ] Test manual update: `python manage.py update_predictions --farmer-id 1`
- [ ] Set up automated daily updates (cron/task scheduler)
- [ ] Add prediction fields to Django admin
- [ ] Integrate predictions into frontend dashboards

---

**Last Updated**: 2025-01-17
**Model Version**: v1 (Test MAE: 4.88 days)
