"""
Reorder Prediction Model - Production Inference Pipeline
Model Version: v1_20251123_073931
Created: 2025-11-23 07:39:31

Expected Performance:
- Test MAE: 7.64 days
- Test RMSE: 16.50 days
- Test R²: 0.5746
"""

import numpy as np
import pandas as pd
import joblib
from tensorflow import keras

class ReorderPredictor:
    """Production-ready reorder prediction model"""

    def __init__(self, model_dir="."):
        """Load model and scalers"""
        self.model = keras.models.load_model(f"{model_dir}/bilstm_model_v1_20251123_073931.keras")
        self.scaler = joblib.load(f"{model_dir}/minmax_scaler_v1_20251123_073931.pkl")

        # Feature names (MUST match training order)
        self.feature_columns = ['total_amount_delivered_tm', 'order_sequence', 'order_month', 'order_quarter', 'order_day_of_week', 'is_weekend', 'days_since_last_order', 'product_encoded', 'rolling_avg_quantity_3', 'rolling_std_quantity_3', 'total_amount_delivered_tm_mean', 'total_amount_delivered_tm_std', 'total_amount_delivered_tm_count', 'days_since_last_order_mean', 'days_since_last_order_std', 'client_lifetime_days', 'order_frequency_per_month']

        print("✓ Model loaded successfully")
        print(f"  Expected input features: {len(self.feature_columns)}")

    def predict(self, X_new):
        """
        Predict days until next order

        Parameters:
        -----------
        X_new : pd.DataFrame or np.array
            Features for prediction. Must contain all required features.
            Shape: (n_samples, 17)

        Returns:
        --------
        predictions : np.array
            Predicted days until next order
        """
        # Convert to DataFrame if needed
        if isinstance(X_new, np.ndarray):
            X_new = pd.DataFrame(X_new, columns=self.feature_columns)

        # Ensure correct feature order and fill missing values
        X_new = X_new[self.feature_columns].fillna(0)

        # Scale features
        X_scaled = self.scaler.transform(X_new)

        # Reshape for LSTM (samples, timesteps, features)
        X_lstm = X_scaled.reshape((X_scaled.shape[0], 1, X_scaled.shape[1]))

        # Predict
        predictions = self.model.predict(X_lstm, verbose=0).flatten()

        return predictions

    def predict_single(self, features_dict):
        """
        Predict for a single order

        Parameters:
        -----------
        features_dict : dict
            Dictionary with feature names as keys
            Example: {'total_amount_delivered_tm': 5.0, 'order_sequence': 3, ...}

        Returns:
        --------
        days : float
            Predicted days until next order
        """
        # Create DataFrame from dict
        X_df = pd.DataFrame([features_dict])

        # Predict
        prediction = self.predict(X_df)[0]

        return prediction


# =============================================================================
# USAGE EXAMPLE
# =============================================================================

if __name__ == "__main__":
    # Load the predictor
    predictor = ReorderPredictor(model_dir=".")

    # Example 1: Single prediction
    example_features = {
        'total_amount_delivered_tm': 5.0,
        'order_sequence': 3,
        'order_month': 6,
        'order_quarter': 2,
        'order_day_of_week': 2,
        'is_weekend': 0,
        'days_since_last_order': 15.0,
        'product_encoded': 1,
        'rolling_avg_quantity_3': 4.8,
        'rolling_std_quantity_3': 0.5,
        'total_amount_delivered_tm_mean': 4.5,
        'total_amount_delivered_tm_std': 0.8,
        'total_amount_delivered_tm_count': 10,
        'days_since_last_order_mean': 20.0,
        'days_since_last_order_std': 5.0,
        'client_lifetime_days': 180,
        'order_frequency_per_month': 1.5
    }

    days_prediction = predictor.predict_single(example_features)
    print(f"\nPredicted days until next order: {days_prediction:.2f}")

    # Example 2: Batch prediction
    # Load your data
    # df_new = pd.read_csv("new_orders.csv")
    # predictions = predictor.predict(df_new[predictor.feature_columns])
