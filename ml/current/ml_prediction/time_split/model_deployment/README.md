# Reorder Prediction Model - Deployment Package

**Model Version:** v1_20251123_073931  
**Created:** 2025-11-23 07:39:31  
**Model Type:** Bidirectional LSTM

---

## 📦 Package Contents

```
model_deployment/
├── bilstm_model_v1_20251123_073931.keras          # Trained BiLSTM model
├── minmax_scaler_v1_20251123_073931.pkl           # Feature scaler
├── feature_metadata_v1_20251123_073931.json       # Feature specifications
├── performance_metrics_v1_20251123_073931.json    # Model performance stats
├── predict_v1_20251123_073931.py                  # Inference pipeline
└── README.md                                    # This file
```

---

## 🎯 Model Performance

| Metric | Value |
|--------|-------|
| Test MAE | 7.64 days |
| Test RMSE | 16.50 days |
| Test R² | 0.5746 |
| Training Samples | 2819 orders |
| Test Samples | 705 orders |

**Interpretation:** On average, predictions are off by **7.6 days** for unseen clients.

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install tensorflow pandas numpy scikit-learn joblib
```

### 2. Load and Use the Model

```python
from predict_v1_20251123_073931 import ReorderPredictor

# Initialize predictor
predictor = ReorderPredictor(model_dir="model_deployment")

# Make prediction
features = {
    'total_amount_delivered_tm': 5.0,
    'order_sequence': 3,
    'order_month': 6,
    # ... (see feature list below)
}

days_until_next = predictor.predict_single(features)
print(f"Predicted reorder in {days_until_next:.1f} days")
```

---

## 📋 Required Features (in order)

1. total_amount_delivered_tm
2. order_sequence
3. order_month
4. order_quarter
5. order_day_of_week
6. is_weekend
7. days_since_last_order
8. product_encoded
9. rolling_avg_quantity_3
10. rolling_std_quantity_3
11. total_amount_delivered_tm_mean
12. total_amount_delivered_tm_std
13. total_amount_delivered_tm_count
14. days_since_last_order_mean
15. days_since_last_order_std
16. client_lifetime_days
17. order_frequency_per_month

---

## 🔧 Feature Engineering Guide

### Order-Level Features:
- **total_amount_delivered_tm**: Total quantity delivered (metric tons)
- **order_sequence**: Nth order for this client (1, 2, 3, ...)
- **order_month**: Month of order (1-12)
- **order_quarter**: Quarter of order (1-4)
- **order_day_of_week**: Day of week (0=Monday, 6=Sunday)
- **is_weekend**: 1 if weekend, 0 otherwise
- **days_since_last_order**: Days since previous order
- **product_encoded**: Product category ID
- **rolling_avg_quantity_3**: Average of last 3 orders
- **rolling_std_quantity_3**: Std deviation of last 3 orders

### Client-Level Features:
- **total_amount_delivered_tm_mean**: Client's average order size
- **total_amount_delivered_tm_std**: Client's order size variability
- **total_amount_delivered_tm_count**: Total orders from client
- **days_since_last_order_mean**: Client's average reorder interval
- **days_since_last_order_std**: Client's reorder interval variability
- **client_lifetime_days**: Days since first order
- **order_frequency_per_month**: Orders per month

---

## ⚠️ Important Notes

1. **Feature Order Matters**: Features must be in the exact order listed above
2. **Missing Values**: Fill with 0 (as done in training)
3. **New Clients**: Use reasonable defaults for client-level features
4. **Outliers**: Model trained on orders ≤365 days apart

---

## 📊 Expected Use Cases

✅ **Good for:**
- Predicting reorder dates for existing clients
- Forecasting inventory needs
- Planning production schedules

❌ **Not suitable for:**
- Brand new clients with no history
- Orders >365 days apart
- Significantly different product types

---

## 🐛 Troubleshooting

**Error: "Shape mismatch"**
- Ensure all 17 features are provided
- Check feature order matches the list above

**Error: "Model file not found"**
- Ensure `model_dir` points to correct directory
- Check all files are in the same folder

**Poor predictions:**
- Verify feature values are reasonable (no extreme outliers)
- Check if client characteristics match training data

---

## 📞 Support

For issues or questions, check:
- Feature metadata: `feature_metadata_v1_20251123_073931.json`
- Performance metrics: `performance_metrics_v1_20251123_073931.json`

---

**Last Updated:** 2025-11-23 07:39:31
