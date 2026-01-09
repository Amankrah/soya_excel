"""
XGBoost Reorder Prediction Model - Production Inference Pipeline
Model Version: v1_20251203_180817
Created: 2025-12-03 18:08:17

Expected Performance:
- Test MAE: 4.88 days
- Test RMSE: 6.56 days
- Test R²: 0.4823

Model: XGBoost Regressor (Tuned)
Features: 62
"""

import numpy as np
import pandas as pd
import pickle
import joblib

class XGBoostReorderPredictor:
    """Production-ready XGBoost reorder prediction model"""

    def __init__(self, model_dir="."):
        """
        Load XGBoost model and scaler

        Parameters:
        -----------
        model_dir : str
            Directory containing model files
        """
        # Load model
        with open(f"{model_dir}/xgboost_model_v1_20251203_180817.pkl", 'rb') as f:
            self.model = pickle.load(f)

        # Load scaler
        self.scaler = joblib.load(f"{model_dir}/standard_scaler_v1_20251203_180817.pkl")

        # Feature names (MUST match training order)
        self.feature_columns = ['days_since_last_order', 'days_since_last_order_mean', 'days_since_last_order_std', 'days_since_last_order_expanding_mean', 'days_since_last_order_expanding_std', 'rolling_avg_days_3', 'rolling_std_days_3', 'rolling_avg_days_5', 'rolling_std_days_5', 'rolling_avg_days_7', 'rolling_std_days_7', 'rolling_avg_quantity_3', 'rolling_std_quantity_3', 'rolling_avg_quantity_5', 'rolling_std_quantity_5', 'total_volume_tonnes', 'volume_per_day', 'avg_volume_per_order', 'predicted_annual_volume', 'client_volume_tier', 'client_lifetime_days', 'order_frequency_per_month', 'order_frequency_at_time', 'ordering_consistency_score', 'order_size_consistency', 'client_maturity', 'is_high_frequency_client', 'client_cluster', 'cluster_avg_frequency', 'cluster_avg_volume', 'cluster_avg_reorder_days', 'order_frequency_trend', 'quantity_trend', 'recent_vs_historical_frequency', 'recent_vs_historical_quantity', 'is_frequency_increasing', 'recency_days', 'days_deviation_from_mean', 'is_overdue_order', 'days_since_first_order', 'client_order_count_at_time', 'order_month', 'order_quarter', 'season', 'month_sin', 'month_cos', 'day_of_week_sin', 'day_of_week_cos', 'is_month_end', 'is_quarter_end', 'is_near_holiday', 'is_weekend', 'product_encoded', 'product_client_frequency', 'product_client_avg_quantity', 'product_switched', 'product_popularity_score', 'client_product_diversity', 'total_amount_delivered_tm', 'order_sequence', 'quantity_expanding_mean', 'quantity_expanding_std']

        print("[OK] XGBoost model loaded successfully")
        print(f"  Model type: XGBoost Regressor")
        print(f"  Expected input features: {len(self.feature_columns)}")
        print(f"  Expected performance: +/-4.88 days MAE")

    def predict(self, X_new):
        """
        Predict days until next order for multiple samples

        Parameters:
        -----------
        X_new : pd.DataFrame or np.array
            Features for prediction. Must contain all required features.
            Shape: (n_samples, 62)

        Returns:
        --------
        predictions : np.array
            Predicted days until next order for each sample
        """
        # Convert to DataFrame if needed
        if isinstance(X_new, np.ndarray):
            X_new = pd.DataFrame(X_new, columns=self.feature_columns)

        # Ensure correct feature order and fill missing values
        X_new = X_new[self.feature_columns].fillna(0)

        # Scale features
        X_scaled = self.scaler.transform(X_new)

        # Predict
        predictions = self.model.predict(X_scaled)

        return predictions

    def predict_single(self, features_dict):
        """
        Predict for a single order

        Parameters:
        -----------
        features_dict : dict
            Dictionary with feature names as keys
            Example: {
                'days_since_last_order_mean': 20.0,
                'order_frequency_per_month': 1.5,
                'total_volume_tonnes': 100.5,
                ...
            }

        Returns:
        --------
        prediction : dict
            {
                'days_until_next_order': float,
                'confidence_interval_lower': float,  # Approx lower bound
                'confidence_interval_upper': float   # Approx upper bound
            }
        """
        # Create DataFrame from dict
        X_df = pd.DataFrame([features_dict])

        # Predict
        days = self.predict(X_df)[0]

        # Approximate confidence interval (±1 RMSE)
        rmse = 6.56

        return {
            'days_until_next_order': float(days),
            'confidence_interval_lower': float(max(0, days - rmse)),
            'confidence_interval_upper': float(days + rmse),
            'expected_reorder_date': None  # Can be calculated if current_date is provided
        }

    def predict_with_date(self, features_dict, current_date):
        """
        Predict reorder date given current date

        Parameters:
        -----------
        features_dict : dict
            Feature dictionary
        current_date : datetime or str
            Current date or last order date

        Returns:
        --------
        prediction : dict
            Includes predicted reorder date
        """
        from datetime import datetime, timedelta

        # Convert string to datetime if needed
        if isinstance(current_date, str):
            current_date = datetime.fromisoformat(current_date)

        # Get prediction
        result = self.predict_single(features_dict)

        # Calculate expected reorder date
        result['expected_reorder_date'] = (
            current_date + timedelta(days=result['days_until_next_order'])
        ).isoformat()

        result['earliest_reorder_date'] = (
            current_date + timedelta(days=result['confidence_interval_lower'])
        ).isoformat()

        result['latest_reorder_date'] = (
            current_date + timedelta(days=result['confidence_interval_upper'])
        ).isoformat()

        return result

    def get_feature_importance(self, top_n=10):
        """
        Get top N most important features

        Parameters:
        -----------
        top_n : int
            Number of top features to return

        Returns:
        --------
        pd.DataFrame
            Feature importance ranking
        """
        importance_df = pd.DataFrame({
            'feature': self.feature_columns,
            'importance': self.model.feature_importances_
        }).sort_values('importance', ascending=False)

        return importance_df.head(top_n)


# =============================================================================
# USAGE EXAMPLES
# =============================================================================

if __name__ == "__main__":
    from datetime import datetime

    print("="*80)
    print("XGBoost Reorder Prediction - Usage Examples")
    print("="*80)

    # Initialize predictor
    predictor = XGBoostReorderPredictor(model_dir=".")

    # =========================================================================
    # Example 1: Simple Prediction
    # =========================================================================
    print("\n" + "="*80)
    print("Example 1: Single Order Prediction")
    print("="*80)

    # Example client: Medium-sized dairy farm with regular ordering pattern
    example_features = {
        # 1-5: Core temporal features
        'days_since_last_order': 18.0,
        'days_since_last_order_mean': 20.0,
        'days_since_last_order_std': 3.5,
        'days_since_last_order_expanding_mean': 20.0,
        'days_since_last_order_expanding_std': 3.5,

        # 6-11: Rolling window features - days
        'rolling_avg_days_3': 19.0,
        'rolling_std_days_3': 2.8,
        'rolling_avg_days_5': 20.5,
        'rolling_std_days_5': 3.2,
        'rolling_avg_days_7': 20.0,
        'rolling_std_days_7': 3.5,

        # 12-15: Rolling window features - quantity
        'rolling_avg_quantity_3': 8.5,
        'rolling_std_quantity_3': 1.2,
        'rolling_avg_quantity_5': 8.3,
        'rolling_std_quantity_5': 1.5,

        # 16-22: Customer volume features
        'total_volume_tonnes': 100.5,
        'volume_per_day': 2.5,
        'avg_volume_per_order': 8.4,
        'predicted_annual_volume': 912.5,
        'client_volume_tier': 2.0,  # Medium tier (0-4 scale)
        'client_lifetime_days': 365.0,
        'order_frequency_per_month': 1.5,
        'order_frequency_at_time': 0.05,

        # 23-27: Client behavioral features
        'ordering_consistency_score': 0.8,
        'order_size_consistency': 0.75,
        'client_maturity': 1.0,  # 0=new, 1=established, 2=mature, 3=veteran
        'is_high_frequency_client': 1.0,  # 1=yes, 0=no

        # 28-31: Clustering features
        'client_cluster': 1.0,  # Cluster 1: Regular clients
        'cluster_avg_frequency': 1.5,
        'cluster_avg_volume': 75.0,
        'cluster_avg_reorder_days': 18.0,

        # 32-36: Trend & momentum
        'order_frequency_trend': 0.5,
        'quantity_trend': 0.3,
        'recent_vs_historical_frequency': 0.95,
        'recent_vs_historical_quantity': 1.02,
        'is_frequency_increasing': 0.0,

        # 37-41: Recent order patterns
        'recency_days': 0.0,
        'days_deviation_from_mean': -2.0,
        'is_overdue_order': 0.0,
        'days_since_first_order': 365.0,
        'client_order_count_at_time': 12.0,

        # 42-53: Temporal/Seasonal features
        'order_month': 1.0,  # January
        'order_quarter': 1.0,  # Q1
        'season': 0.0,  # Winter
        'month_sin': 0.5,  # sin(2π * 1/12)
        'month_cos': 0.866,  # cos(2π * 1/12)
        'day_of_week_sin': 0.0,  # Monday
        'day_of_week_cos': 1.0,
        'is_month_end': 0.0,
        'is_quarter_end': 0.0,
        'is_near_holiday': 0.0,
        'is_weekend': 0.0,

        # 54-59: Product interactions
        'product_encoded': 42.0,  # Hash of product name
        'product_client_frequency': 12.0,
        'product_client_avg_quantity': 8.4,
        'product_switched': 0.0,
        'product_popularity_score': 1.0,
        'client_product_diversity': 1.0,

        # 60-62: Order characteristics
        'total_amount_delivered_tm': 8.5,
        'order_sequence': 12.0,
        'quantity_expanding_mean': 8.4,
        'quantity_expanding_std': 1.5,
    }

    result = predictor.predict_single(example_features)
    print(f"\nPredicted days until next order: {result['days_until_next_order']:.2f}")
    print(f"Confidence interval: {result['confidence_interval_lower']:.2f} - {result['confidence_interval_upper']:.2f} days")

    # =========================================================================
    # Example 2: Prediction with Dates
    # =========================================================================
    print("\n" + "="*80)
    print("Example 2: Prediction with Expected Reorder Date")
    print("="*80)

    current_date = datetime(2025, 1, 15)
    result_with_date = predictor.predict_with_date(example_features, current_date)

    print(f"\nLast order date: {current_date.strftime('%Y-%m-%d')}")
    print(f"Expected reorder date: {result_with_date['expected_reorder_date']}")
    print(f"Earliest possible: {result_with_date['earliest_reorder_date']}")
    print(f"Latest possible: {result_with_date['latest_reorder_date']}")

    # =========================================================================
    # Example 3: Feature Importance
    # =========================================================================
    print("\n" + "="*80)
    print("Example 3: Top 10 Most Important Features")
    print("="*80)

    top_features = predictor.get_feature_importance(top_n=10)
    print("\n" + top_features.to_string(index=False))

    print("\n" + "="*80)
    print("[SUCCESS] Examples complete")
    print("="*80)
