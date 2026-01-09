# XGBoost Reorder Prediction Model - Deployment Package

**Model Version:** v1_20251203_180817  
**Created:** 2025-12-03 18:08:17  
**Model Type:** XGBoost Regressor (Tuned)

---

## 📦 Package Contents

```
model_deployment_xgboost/
├── xgboost_model_v1_20251203_180817.pkl           # Trained XGBoost model
├── standard_scaler_v1_20251203_180817.pkl         # Feature scaler (StandardScaler)
├── feature_metadata_v1_20251203_180817.json       # Feature specifications
├── performance_metrics_v1_20251203_180817.json    # Model performance statistics
├── feature_importance_v1_20251203_180817.csv      # Feature importance rankings
├── predict_v1_20251203_180817.py                  # Production inference pipeline
└── README.md                                    # This file
```

---

## 🎯 Model Performance

| Metric | Training | Test | Interpretation |
|--------|----------|------|----------------|
| **MAE** | 3.86 days | **4.88 days** | Average prediction error |
| **RMSE** | 5.20 days | 6.56 days | Error with outlier penalty |
| **R²** | 0.6347 | 0.4823 | Variance explained |

**Key Insight:** On average, predictions are off by **4.9 days** on unseen data.

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install xgboost pandas numpy scikit-learn joblib
```

### 2. Basic Usage

```python
from predict_v1_20251203_180817 import XGBoostReorderPredictor

# Initialize predictor
predictor = XGBoostReorderPredictor(model_dir="model_deployment_xgboost")

# Prepare features (all 62 required)
features = {
    'days_since_last_order_mean': 20.0,
    'order_frequency_per_month': 1.5,
    'total_volume_tonnes': 100.5,
    # ... (see feature list below)
}

# Get prediction
result = predictor.predict_single(features)
print(f"Expected reorder in: {result['days_until_next_order']:.1f} days")
```

### 3. Advanced Usage with Dates

```python
from datetime import datetime

result = predictor.predict_with_date(
    features_dict=features,
    current_date=datetime(2025, 1, 15)
)

print(f"Expected reorder date: {result['expected_reorder_date']}")
```

---

## 📋 Required Features (62 features)

### Top 5 Most Important Features:
1. **days_since_last_order_mean** (19.02% importance)
2. **order_frequency_per_month** (8.82% importance)
3. **total_volume_tonnes** (7.45% importance)
4. **ordering_consistency_score** (6.21% importance)
5. **volume_per_day** (4.10% importance)

### Complete Feature List:
1. days_since_last_order
2. days_since_last_order_mean
3. days_since_last_order_std
4. days_since_last_order_expanding_mean
5. days_since_last_order_expanding_std
6. rolling_avg_days_3
7. rolling_std_days_3
8. rolling_avg_days_5
9. rolling_std_days_5
10. rolling_avg_days_7
11. rolling_std_days_7
12. rolling_avg_quantity_3
13. rolling_std_quantity_3
14. rolling_avg_quantity_5
15. rolling_std_quantity_5
16. total_volume_tonnes
17. volume_per_day
18. avg_volume_per_order
19. predicted_annual_volume
20. client_volume_tier
21. client_lifetime_days
22. order_frequency_per_month
23. order_frequency_at_time
24. ordering_consistency_score
25. order_size_consistency
26. client_maturity
27. is_high_frequency_client
28. client_cluster
29. cluster_avg_frequency
30. cluster_avg_volume
31. cluster_avg_reorder_days
32. order_frequency_trend
33. quantity_trend
34. recent_vs_historical_frequency
35. recent_vs_historical_quantity
36. is_frequency_increasing
37. recency_days
38. days_deviation_from_mean
39. is_overdue_order
40. days_since_first_order
41. client_order_count_at_time
42. order_month
43. order_quarter
44. season
45. month_sin
46. month_cos
47. day_of_week_sin
48. day_of_week_cos
49. is_month_end
50. is_quarter_end
51. is_near_holiday
52. is_weekend
53. product_encoded
54. product_client_frequency
55. product_client_avg_quantity
56. product_switched
57. product_popularity_score
58. client_product_diversity
59. total_amount_delivered_tm
60. order_sequence
61. quantity_expanding_mean
62. quantity_expanding_std

---

## 🔧 Feature Engineering Guide

### Client History Features:
- **days_since_last_order_mean**: Average days between orders
- **days_since_last_order_std**: Variability in reorder intervals
- **ordering_consistency_score**: Regularity of ordering pattern
- **client_lifetime_days**: Days since first order

### Volume-Based Features:
- **total_volume_tonnes**: Total tonnage ordered by client
- **volume_per_day**: Daily consumption rate
- **avg_volume_per_order**: Average order size
- **order_frequency_per_month**: Orders per month

### Recent Behavior:
- **rolling_avg_days_3/5/7**: Recent reorder patterns
- **days_deviation_from_mean**: Deviation from normal pattern
- **is_overdue_order**: Flag for late reorders

---

## ⚠️ Important Notes

### Feature Requirements:
1. **All 62 features must be provided**
2. **Feature order matters** - use exact order from list above
3. **Missing values**: Fill with 0 (as done in training)
4. **Scaling**: Handled automatically by the predictor

### Model Limitations:
- ❌ Not suitable for brand new clients (no history)
- ❌ Orders > 30 days capped during training
- ❌ Trained on Small/Medium orders only

---

## 📊 Use Cases

✅ **Recommended:**
- Inventory planning (when to stock up)
- Customer retention (predict churn from irregular patterns)
- Sales forecasting (expected reorder volumes)
- Production scheduling (anticipate demand)

⚠️ **Use with caution:**
- New clients without order history
- Clients with highly irregular patterns
- Product categories not in training data

---

## 🔍 API Reference

### XGBoostReorderPredictor

#### Methods:

**`__init__(model_dir=".")`**
- Loads model and scaler from specified directory

**`predict(X_new)`**
- Batch prediction for multiple samples
- Input: DataFrame or numpy array
- Returns: Array of predicted days

**`predict_single(features_dict)`**
- Single order prediction
- Input: Dictionary of features
- Returns: Dict with prediction and confidence interval

**`predict_with_date(features_dict, current_date)`**
- Prediction with expected reorder date
- Input: Features dict + current date
- Returns: Dict with dates and intervals

**`get_feature_importance(top_n=10)`**
- Get top N important features
- Returns: DataFrame with feature rankings

---

## 🐛 Troubleshooting

### Common Errors:

**"KeyError: 'feature_name'"**
- Solution: Ensure all 62 features are provided

**"ValueError: Shape mismatch"**
- Solution: Check feature order matches the list above

**"Predictions seem unreasonable"**
- Check: Feature values are in reasonable ranges
- Check: Client characteristics similar to training data
- Check: No extreme outliers in input features

---

## 📈 Model Monitoring

For production deployment, monitor:
1. **Prediction vs Actual**: Track MAE over time
2. **Feature Drift**: Monitor if input distributions change
3. **Client Coverage**: % of clients with good predictions
4. **Outliers**: Flag predictions > 30 days or < 0 days

---

## 📞 Support & Documentation

- **Feature Metadata**: `feature_metadata_v1_20251203_180817.json`
- **Performance Metrics**: `performance_metrics_v1_20251203_180817.json`
- **Feature Importance**: `feature_importance_v1_20251203_180817.csv`

---

**Model Version:** v1_20251203_180817  
**Last Updated:** 2025-12-03 18:08:17
