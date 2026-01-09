import json

# Load notebook
with open('reorder_prediction_model.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

# Update cell 61 - Save only the 2 models that are used
new_cell61_source = """import os
import pickle
from datetime import datetime

# Create models directory
models_dir = 'saved_models'
os.makedirs(models_dir, exist_ok=True)

# Generate timestamp
timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

print("="*80)
print("SAVING MODELS AND COMPONENTS")
print("="*80)

# 1. Save XGBoost V2
xgb_path = os.path.join(models_dir, f'xgboost_v2_{timestamp}.json')
best_xgb_v2.save_model(xgb_path)
print(f"XGBoost V2 saved: {xgb_path}")

# 2. Save LSTM (Unidirectional LSTM V1 - the best performer)
lstm_path = os.path.join(models_dir, f'lstm_{timestamp}.keras')
lstm_v2_model.save(lstm_path)
print(f"LSTM saved: {lstm_path}")

# 3. Save scalers
scaler_path = os.path.join(models_dir, f'scalers_{timestamp}.pkl')
with open(scaler_path, 'wb') as f:
    pickle.dump({
        'standard_scaler': scaler,
        'minmax_scaler': minmax_scaler
    }, f)
print(f"Scalers saved: {scaler_path}")

# 4. Save feature columns
features_path = os.path.join(models_dir, f'feature_columns_{timestamp}.pkl')
with open(features_path, 'wb') as f:
    pickle.dump(feature_columns, f)
print(f"Feature columns saved: {features_path}")

# 5. Save ensemble configuration (2-model ensemble)
ensemble_config = {
    'xgboost_v2_weight': best_final_ensemble['XGB_V2'],
    'lstm_weight': best_final_ensemble['LSTM_V2'],
    'test_mae': best_final_ensemble['Test_MAE'],
    'test_r2': best_final_ensemble['Test_R2'],
    'mae_gap': best_final_ensemble['MAE_Gap'],
    'r2_gap': best_final_ensemble['R2_Gap'],
    'timestamp': timestamp
}

config_path = os.path.join(models_dir, f'ensemble_config_{timestamp}.pkl')
with open(config_path, 'wb') as f:
    pickle.dump(ensemble_config, f)
print(f"Ensemble config saved: {config_path}")

print("\\n" + "="*80)
print("ALL MODELS SAVED SUCCESSFULLY!")
print("="*80)

print(f"\\nSaved to directory: {os.path.abspath(models_dir)}")
print(f"\\nOptimal 2-Model Ensemble:")
print(f"  - XGBoost V2: {best_final_ensemble['XGB_V2']:.0%}")
print(f"  - LSTM:       {best_final_ensemble['LSTM_V2']:.0%}")
print(f"\\nPerformance:")
print(f"  - Test MAE: {best_final_ensemble['Test_MAE']:.2f} days")
print(f"  - MAE Gap:  {best_final_ensemble['MAE_Gap']:.2f} days")
print(f"  - Test R²:  {best_final_ensemble['Test_R2']:.4f}")

print("\\n" + "="*80)
"""

# Update cell 63 - ReorderPredictor for 2-model ensemble
new_cell63_source = """import os
import pickle
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from xgboost import XGBRegressor
from tensorflow import keras
import glob

class ReorderPredictor:
    \"\"\"
    Production-ready predictor for client reorder dates.
    Uses optimized 2-model ensemble: XGBoost V2 + LSTM
    \"\"\"

    def __init__(self, models_dir='saved_models', timestamp=None):
        \"\"\"Load all saved model components\"\"\"

        # Auto-detect latest timestamp if not provided
        if timestamp is None:
            xgb_files = glob.glob(os.path.join(models_dir, 'xgboost_v2_*.json'))
            if not xgb_files:
                raise FileNotFoundError(f"No XGBoost models found in {models_dir}")
            latest_xgb = max(xgb_files, key=os.path.getmtime)
            timestamp = os.path.basename(latest_xgb).replace('xgboost_v2_', '').replace('.json', '')
            print(f"Auto-detected latest models with timestamp: {timestamp}")

        print(f"Loading models with timestamp: {timestamp}...")

        # Load XGBoost V2
        xgb_path = os.path.join(models_dir, f'xgboost_v2_{timestamp}.json')
        self.xgb_model = XGBRegressor()
        self.xgb_model.load_model(xgb_path)
        print(f"  XGBoost V2 loaded")

        # Load LSTM
        lstm_path = os.path.join(models_dir, f'lstm_{timestamp}.keras')
        self.lstm_model = keras.models.load_model(lstm_path)
        print(f"  LSTM loaded")

        # Load scalers
        scaler_path = os.path.join(models_dir, f'scalers_{timestamp}.pkl')
        with open(scaler_path, 'rb') as f:
            scalers = pickle.load(f)
        self.standard_scaler = scalers['standard_scaler']
        self.minmax_scaler = scalers['minmax_scaler']
        print(f"  Scalers loaded")

        # Load feature columns
        features_path = os.path.join(models_dir, f'feature_columns_{timestamp}.pkl')
        with open(features_path, 'rb') as f:
            self.feature_columns = pickle.load(f)
        print(f"  Feature columns loaded ({len(self.feature_columns)} features)")

        # Load ensemble config
        config_path = os.path.join(models_dir, f'ensemble_config_{timestamp}.pkl')
        with open(config_path, 'rb') as f:
            self.ensemble_config = pickle.load(f)
        self.xgb_weight = self.ensemble_config['xgboost_v2_weight']
        self.lstm_weight = self.ensemble_config['lstm_weight']
        print(f"  Ensemble weights: XGB={self.xgb_weight:.0%}, LSTM={self.lstm_weight:.0%}")

        print(f"\\nAll models loaded successfully!")
        print(f"Test MAE: {self.ensemble_config['test_mae']:.2f} days")
        print(f"MAE Gap: {self.ensemble_config['mae_gap']:.2f} days")
        print("="*80 + "\\n")

    def predict(self, X_new):
        \"\"\"
        Predict days until next order for new data

        Parameters:
        -----------
        X_new : DataFrame or array-like
            Features for new orders (must have same columns as training)

        Returns:
        --------
        predictions : array
            Predicted days until next order
        \"\"\"
        # Ensure X_new is a DataFrame
        if not isinstance(X_new, pd.DataFrame):
            X_new = pd.DataFrame(X_new, columns=self.feature_columns)

        # Ensure correct column order
        X_new = X_new[self.feature_columns]

        # Scale features for XGBoost (StandardScaler)
        X_scaled_xgb = self.standard_scaler.transform(X_new)

        # Scale features for LSTM (MinMaxScaler)
        X_scaled_lstm = self.minmax_scaler.transform(X_new)
        X_scaled_lstm_reshaped = X_scaled_lstm.reshape((X_scaled_lstm.shape[0], 1, X_scaled_lstm.shape[1]))

        # Get predictions from both models
        xgb_pred = self.xgb_model.predict(X_scaled_xgb)
        lstm_pred = self.lstm_model.predict(X_scaled_lstm_reshaped, verbose=0).flatten()

        # 2-model ensemble prediction
        ensemble_pred = self.xgb_weight * xgb_pred + self.lstm_weight * lstm_pred

        return ensemble_pred

    def predict_reorder_dates(self, df, current_order_date_col='order_date'):
        \"\"\"
        Predict actual reorder dates (not just days)

        Parameters:
        -----------
        df : DataFrame
            Data with features and current order date
        current_order_date_col : str
            Column name containing the current order date

        Returns:
        --------
        DataFrame with predictions
        \"\"\"
        # Extract features
        X_new = df[self.feature_columns]

        # Predict days until next order
        days_pred = self.predict(X_new)

        # Calculate predicted reorder dates
        current_dates = pd.to_datetime(df[current_order_date_col])
        predicted_dates = current_dates + pd.to_timedelta(days_pred, unit='D')

        # Create results DataFrame
        results = df.copy()
        results['predicted_days_until_reorder'] = days_pred.round(1)
        results['predicted_reorder_date'] = predicted_dates
        results['confidence'] = self._calculate_confidence(days_pred)

        return results

    def _calculate_confidence(self, predictions):
        \"\"\"
        Calculate confidence scores based on prediction stability
        (simplified version - can be enhanced with prediction intervals)
        \"\"\"
        # Simple confidence: inverse of prediction magnitude (normalized)
        confidence = np.clip(1 - (predictions - predictions.mean()) / (predictions.std() * 2), 0.5, 1.0)
        return confidence.round(2)

# Initialize predictor (auto-detects latest models)
print("="*80)
print("INITIALIZING 2-MODEL ENSEMBLE PREDICTOR")
print("="*80)
predictor = ReorderPredictor(models_dir='saved_models')

print("PREDICTOR READY FOR USE")
print("="*80)
"""

# Update cells
nb['cells'][61]['source'] = new_cell61_source
nb['cells'][63]['source'] = new_cell63_source

# Save
with open('reorder_prediction_model.ipynb', 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1, ensure_ascii=False)

print("Updated to 2-model ensemble:")
print("  Cell 61: Saves XGBoost V2 + LSTM with optimal weights")
print("  Cell 63: ReorderPredictor loads and uses 2 models")
print("\\nOptimal weights: 40% XGBoost V2 + 60% LSTM")
