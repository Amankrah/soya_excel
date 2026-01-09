# Field Mapping Reference - Order Model

## Database Schema (models_new.py)

### Order Model Fields

| Field Name | Type | Description |
|------------|------|-------------|
| `client` | ForeignKey | Reference to Client model |
| `client_order_number` | CharField | Order number (multiple batches may share) |
| `expedition_number` | CharField | Unique expedition/delivery number |
| `product_name` | CharField | Product delivered |
| `sales_order_creation_date` | DateTimeField | When order was created |
| `total_amount_ordered_tm` | DecimalField | Total ordered in tonnes |
| `total_amount_delivered_tm` | DecimalField | Total delivered in tonnes |
| `promised_expedition_date` | DateTimeField | Promised delivery date |
| `actual_expedition_date` | DateTimeField | Actual delivery date |
| `status` | CharField | 'pending', 'delivered', 'cancelled' |

---

## Feature Engineering Field Mapping

The `ClientFeatureEngineer` service queries the database using the **new field names**, then renames them internally to match the ML model's expected column names.

### Database Query → Feature Engineering Mapping

```python
# Query from database (NEW field names)
orders = Order.objects.filter(
    client=client,
    status='delivered',
    actual_expedition_date__isnull=False  # ← NEW
).order_by('actual_expedition_date').values(
    'client_order_number',                 # ← NEW
    'total_amount_delivered_tm',           # ← NEW
    'actual_expedition_date',              # ← NEW
    'sales_order_creation_date',           # ← NEW
    'product_name'                         # ← NEW
)

# Rename for feature engineering (internal processing)
df = df.rename(columns={
    'total_amount_delivered_tm': 'quantity',           # For ML feature calculations
    'actual_expedition_date': 'actual_delivery_date',  # For ML feature calculations
    'sales_order_creation_date': 'order_date',         # For ML feature calculations
    'product_name': 'delivery_method'                  # For ML feature calculations
})
```

**Why this approach?**
- The database uses descriptive field names matching the Excel data
- The ML model was trained with shorter, simpler column names
- Feature engineering maintains backward compatibility with trained model
- Clean separation: database schema vs ML processing

---

## Client Model Methods

### calculate_monthly_usage()

```python
# Uses NEW field names directly
delivered_orders = self.orders.filter(
    status='delivered',
    actual_expedition_date__isnull=False  # ← NEW field
)

total_quantity = delivered_orders.aggregate(
    total=Sum('total_amount_delivered_tm')  # ← NEW field
)['total']

first_order = delivered_orders.order_by('actual_expedition_date').first()  # ← NEW field
last_order = delivered_orders.order_by('actual_expedition_date').last()    # ← NEW field
```

### calculate_priority()

```python
# Uses prediction fields (no order fields referenced)
days_until_order = (self.predicted_next_order_date - timezone.now()).days
```

---

## Prediction Service

The `ReorderPredictionService` doesn't directly access Order fields. It:

1. Calls `ClientFeatureEngineer.prepare_client_data(client)`
   - Feature engineer handles the field mapping
2. Gets prediction from XGBoost model
3. Calls `client.calculate_monthly_usage(save=False)`
   - Client method uses correct NEW field names
4. Calls `client.calculate_priority()`
   - Client method uses prediction fields only
5. Saves all fields to Client model

**No field mapping needed in prediction_service.py** - it just orchestrates the calls.

---

## Old vs New Field Comparison

| Purpose | OLD Field Name | NEW Field Name |
|---------|---------------|----------------|
| Delivery date | `actual_delivery_date` | `actual_expedition_date` |
| Quantity | `quantity` | `total_amount_delivered_tm` |
| Order creation | `order_date` | `sales_order_creation_date` |
| Order ID | `order_number` | `client_order_number` |
| Product | `delivery_method` | `product_name` |

---

## Summary

✅ **models_new.py**: Uses NEW field names matching Excel data
✅ **feature_engineering.py**: Queries with NEW names, renames internally for ML processing
✅ **prediction_service.py**: Calls Client methods (no direct field access)
✅ **Client.calculate_monthly_usage()**: Uses NEW field names
✅ **Client.calculate_priority()**: Uses prediction fields only

**Everything is properly aligned!** 🎯

---

**Last Updated**: 2025-01-17
