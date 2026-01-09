"""
Reorder Prediction Service
Uses XGBoost model to predict when clients will reorder
"""

import pickle
import joblib
import os
from datetime import datetime, timedelta
from django.conf import settings
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


class ReorderPredictionService:
    """
    Service to predict when clients will place their next order
    Uses the trained XGBoost model from ml_training
    """

    def __init__(self):
        """Initialize the prediction service by loading model and scaler"""
        self.model = None
        self.scaler = None
        self.model_loaded = False
        self.model_dir = os.path.join(settings.BASE_DIR, 'model_deployment_xgboost')

        self._load_model()

    def _load_model(self):
        """Load the XGBoost model and scaler from disk"""
        try:
            # Find the latest model files
            model_files = [f for f in os.listdir(self.model_dir) if f.startswith('xgboost_model_') and f.endswith('.pkl')]
            scaler_files = [f for f in os.listdir(self.model_dir) if f.startswith('standard_scaler_') and f.endswith('.pkl')]

            if not model_files or not scaler_files:
                logger.error(f"No model or scaler files found in {self.model_dir}")
                return

            # Use the most recent file (assuming timestamp in filename)
            model_file = sorted(model_files)[-1]
            scaler_file = sorted(scaler_files)[-1]

            model_path = os.path.join(self.model_dir, model_file)
            scaler_path = os.path.join(self.model_dir, scaler_file)

            # Load model
            with open(model_path, 'rb') as f:
                self.model = pickle.load(f)

            # Load scaler
            self.scaler = joblib.load(scaler_path)

            self.model_loaded = True
            logger.info(f"✅ XGBoost model loaded successfully from {model_file}")

        except Exception as e:
            logger.error(f"❌ Error loading XGBoost model: {str(e)}")
            self.model_loaded = False

    def predict_single(self, features_df):
        """
        Predict days until next order for a single client

        Parameters:
        -----------
        features_df : pd.DataFrame
            Single-row DataFrame with all required features

        Returns:
        --------
        dict or None
            {
                'days_until_next_order': float,
                'confidence_interval_lower': float,
                'confidence_interval_upper': float,
                'expected_reorder_date': datetime,
                'earliest_reorder_date': datetime,
                'latest_reorder_date': datetime
            }
        """
        if not self.model_loaded:
            logger.error("Model not loaded. Cannot make prediction.")
            return None

        try:
            # Scale features
            X_scaled = self.scaler.transform(features_df)

            # Predict
            days_prediction = float(self.model.predict(X_scaled)[0])

            # Calculate confidence intervals (±RMSE from training)
            # Based on model performance: Test RMSE = 6.56 days
            rmse = 6.56
            confidence_lower = max(0, days_prediction - rmse)
            confidence_upper = days_prediction + rmse

            # Calculate dates
            current_date = timezone.now()
            expected_date = current_date + timedelta(days=days_prediction)
            earliest_date = current_date + timedelta(days=confidence_lower)
            latest_date = current_date + timedelta(days=confidence_upper)

            return {
                'days_until_next_order': round(days_prediction, 2),
                'confidence_interval_lower': round(confidence_lower, 2),
                'confidence_interval_upper': round(confidence_upper, 2),
                'expected_reorder_date': expected_date,
                'earliest_reorder_date': earliest_date,
                'latest_reorder_date': latest_date,
                'prediction_timestamp': current_date
            }

        except Exception as e:
            logger.error(f"Error making prediction: {str(e)}")
            return None

    def update_client_prediction(self, client):
        """
        Update prediction for a single client

        Parameters:
        -----------
        client : Client model instance
            The client to update predictions for

        Returns:
        --------
        bool
            True if prediction was successfully updated, False otherwise
        """
        from clients.services.feature_engineering import ClientFeatureEngineer

        try:
            # Engineer features
            feature_engineer = ClientFeatureEngineer()
            features_dict = feature_engineer.prepare_client_data(client)

            if features_dict is None:
                logger.warning(f"Insufficient data for {client.name}. Need at least 3 orders.")
                return False

            # Validate features
            is_valid, missing = feature_engineer.validate_features(features_dict)
            if not is_valid:
                logger.error(f"Missing features for {client.name}: {missing}")
                return False

            # Convert to DataFrame
            features_df = feature_engineer.get_features_dataframe(features_dict)

            # Make prediction
            prediction = self.predict_single(features_df)

            if prediction is None:
                return False

            # Update client model with predictions
            client.predicted_next_order_days = prediction['days_until_next_order']
            client.predicted_next_order_date = prediction['expected_reorder_date']
            client.prediction_confidence_lower = prediction['confidence_interval_lower']
            client.prediction_confidence_upper = prediction['confidence_interval_upper']
            client.last_prediction_update = timezone.now()

            # Auto-calculate monthly usage (sets fields but doesn't save yet)
            try:
                monthly_usage = client.calculate_monthly_usage(save=False)
                if monthly_usage > 0:
                    client.historical_monthly_usage = round(monthly_usage, 2)
                    client.last_usage_calculation = timezone.now()
            except Exception as e:
                logger.warning(f"Failed to calculate monthly usage for {client.name}: {str(e)}")

            # Auto-calculate priority based on predicted reorder date
            try:
                calculated_priority = client.calculate_priority()
                if calculated_priority:
                    client.priority = calculated_priority
            except Exception as e:
                logger.warning(f"Failed to calculate priority for {client.name}: {str(e)}")

            client.save(update_fields=[
                'predicted_next_order_days',
                'predicted_next_order_date',
                'prediction_confidence_lower',
                'prediction_confidence_upper',
                'last_prediction_update',
                'historical_monthly_usage',
                'last_usage_calculation',
                'priority'
            ])

            logger.info(f"✅ Updated prediction for {client.name}: {prediction['days_until_next_order']:.1f} days, Priority: {client.priority}")
            return True

        except Exception as e:
            logger.error(f"Error updating prediction for {client.name}: {str(e)}")
            return False

    # Legacy method name for backward compatibility
    def update_farmer_prediction(self, farmer):
        """Legacy method - redirects to update_client_prediction"""
        return self.update_client_prediction(farmer)

    def update_all_predictions(self, verbose=False, clear_stale=False):
        """
        Update predictions for all active clients with sufficient order history

        Parameters:
        -----------
        verbose : bool
            If True, log detailed information about failures
        clear_stale : bool
            If True, automatically clear predictions that fail to update

        Returns:
        --------
        dict
            {
                'total_clients': int,
                'successful_predictions': int,
                'failed_predictions': int,
                'skipped': int (insufficient data),
                'cleared_stale': int (predictions cleared),
                'failed_clients': list of dicts with client details
            }
        """
        from clients.models import Client

        results = {
            'total_clients': 0,
            'successful_predictions': 0,
            'failed_predictions': 0,
            'skipped': 0,
            'cleared_stale': 0,
            'failed_clients': []
        }

        # Get all active clients
        clients = Client.objects.filter(is_active=True)
        results['total_clients'] = clients.count()

        logger.info(f"Starting prediction update for {results['total_clients']} clients...")

        for client in clients:
            # Check if client has at least 3 delivered orders
            order_count = client.orders.filter(status='delivered').count()

            if order_count < 3:
                results['skipped'] += 1
                logger.debug(f"Skipping {client.name}: only {order_count} orders")
                continue

            # Count small/medium orders (≤10 tonnes)
            small_medium_count = client.orders.filter(
                status='delivered',
                total_amount_delivered_tm__lte=10
            ).count()

            # Check if client had a previous prediction
            had_previous_prediction = client.predicted_next_order_date is not None
            previous_prediction_date = client.last_prediction_update

            # Update prediction
            success = self.update_client_prediction(client)

            if success:
                results['successful_predictions'] += 1
            else:
                results['failed_predictions'] += 1

                # Track failure details
                failure_info = {
                    'client_id': client.id,
                    'client_name': client.name,
                    'total_orders': order_count,
                    'small_medium_orders': small_medium_count,
                    'had_previous_prediction': had_previous_prediction,
                    'last_prediction_update': previous_prediction_date.strftime('%Y-%m-%d %H:%M') if previous_prediction_date else 'Never',
                    'reason': 'Insufficient small/medium orders' if small_medium_count < 3 else 'Unknown error'
                }
                results['failed_clients'].append(failure_info)

                # Auto-clear stale predictions if enabled
                if clear_stale and had_previous_prediction:
                    client.predicted_next_order_days = None
                    client.predicted_next_order_date = None
                    client.prediction_confidence_lower = None
                    client.prediction_confidence_upper = None
                    client.last_prediction_update = None
                    client.save(update_fields=[
                        'predicted_next_order_days',
                        'predicted_next_order_date',
                        'prediction_confidence_lower',
                        'prediction_confidence_upper',
                        'last_prediction_update'
                    ])
                    results['cleared_stale'] += 1
                    logger.info(f"🗑️ Cleared stale prediction for {client.name}")

                if verbose:
                    logger.warning(
                        f"❌ Failed to update {client.name}: "
                        f"{order_count} total orders, {small_medium_count} small/medium orders, "
                        f"Previous prediction: {'Yes' if had_previous_prediction else 'No'}"
                    )

        logger.info(f"✅ Prediction update complete: {results['successful_predictions']} successful, "
                   f"{results['failed_predictions']} failed, {results['skipped']} skipped")

        return results

    def get_upcoming_reorders(self, days_ahead=7):
        """
        Get clients predicted to reorder within the next N days

        Parameters:
        -----------
        days_ahead : int
            Number of days to look ahead (default: 7)

        Returns:
        --------
        QuerySet
            Clients expected to reorder soon, ordered by predicted date
        """
        from clients.models import Client

        cutoff_date = timezone.now() + timedelta(days=days_ahead)

        return Client.objects.filter(
            is_active=True,
            predicted_next_order_date__isnull=False,
            predicted_next_order_date__lte=cutoff_date,
            predicted_next_order_date__gte=timezone.now()
        ).order_by('predicted_next_order_date')

    def get_overdue_predictions(self):
        """
        Get clients whose predicted reorder date has passed

        Returns:
        --------
        QuerySet
            Clients who are overdue based on predictions
        """
        from clients.models import Client

        return Client.objects.filter(
            is_active=True,
            predicted_next_order_date__isnull=False,
            predicted_next_order_date__lt=timezone.now()
        ).order_by('predicted_next_order_date')


# Singleton instance
_prediction_service = None

def get_prediction_service():
    """Get the singleton prediction service instance"""
    global _prediction_service
    if _prediction_service is None:
        _prediction_service = ReorderPredictionService()
    return _prediction_service
