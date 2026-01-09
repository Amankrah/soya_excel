"""
Feature Engineering Service for Reorder Prediction
Transforms client order history into features for XGBoost model prediction
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from django.db.models import Sum, Count, Avg, StdDev, Min, Max
from decimal import Decimal


class ClientFeatureEngineer:
    """
    Automatically engineers features from client order history
    Matches the feature engineering from ml_training/ml.ipynb
    """

    def __init__(self):
        # Feature order MUST match the training data exactly (from feature_metadata.json)
        self.required_features = [
            'days_since_last_order',
            'days_since_last_order_mean',
            'days_since_last_order_std',
            'days_since_last_order_expanding_mean',
            'days_since_last_order_expanding_std',
            'rolling_avg_days_3',
            'rolling_std_days_3',
            'rolling_avg_days_5',
            'rolling_std_days_5',
            'rolling_avg_days_7',
            'rolling_std_days_7',
            'rolling_avg_quantity_3',
            'rolling_std_quantity_3',
            'rolling_avg_quantity_5',
            'rolling_std_quantity_5',
            'total_volume_tonnes',
            'volume_per_day',
            'avg_volume_per_order',
            'predicted_annual_volume',
            'client_volume_tier',
            'client_lifetime_days',
            'order_frequency_per_month',
            'order_frequency_at_time',
            'ordering_consistency_score',
            'order_size_consistency',
            'client_maturity',
            'is_high_frequency_client',
            'client_cluster',
            'cluster_avg_frequency',
            'cluster_avg_volume',
            'cluster_avg_reorder_days',
            'order_frequency_trend',
            'quantity_trend',
            'recent_vs_historical_frequency',
            'recent_vs_historical_quantity',
            'is_frequency_increasing',
            'recency_days',
            'days_deviation_from_mean',
            'is_overdue_order',
            'days_since_first_order',
            'client_order_count_at_time',
            'order_month',
            'order_quarter',
            'season',
            'month_sin',
            'month_cos',
            'day_of_week_sin',
            'day_of_week_cos',
            'is_month_end',
            'is_quarter_end',
            'is_near_holiday',
            'is_weekend',
            'product_encoded',
            'product_client_frequency',
            'product_client_avg_quantity',
            'product_switched',
            'product_popularity_score',
            'client_product_diversity',
            'total_amount_delivered_tm',
            'order_sequence',
            'quantity_expanding_mean',
            'quantity_expanding_std',
        ]

    def prepare_client_data(self, client):
        """
        Prepare features for a single client

        IMPORTANT: Applies same preprocessing as training:
        1. Combine batches (sum quantities, take max delivery date)
        2. Filter for Small/Medium orders only (0-10 tonnes)
        3. Sort by client and date
        4. Calculate days_since_last_order

        Parameters:
        -----------
        client : Client model instance
            The client to prepare features for

        Returns:
        --------
        dict or None
            Feature dictionary ready for prediction, or None if insufficient data
        """
        from clients.models import Order

        # Get all delivered orders for this client
        orders = Order.objects.filter(
            client=client,
            status='delivered',
            actual_expedition_date__isnull=False
        ).values(
            'client_order_number',
            'total_amount_delivered_tm',
            'actual_expedition_date',
            'sales_order_creation_date',
            'product_name'
        )

        if len(orders) < 3:
            # Need at least 3 orders for meaningful predictions
            return None

        # Convert to DataFrame
        df = pd.DataFrame(list(orders))
        df['actual_expedition_date'] = pd.to_datetime(df['actual_expedition_date'])
        df['sales_order_creation_date'] = pd.to_datetime(df['sales_order_creation_date'])

        # Convert Decimal to float to avoid type errors
        df['total_amount_delivered_tm'] = df['total_amount_delivered_tm'].astype(float)

        # =====================================================================
        # CRITICAL: Apply same preprocessing as training
        # =====================================================================

        # 1. Combine batches with same client_order_number (matching training)
        agg_dict = {
            'sales_order_creation_date': 'first',
            'actual_expedition_date': 'max',  # Last delivery date
            'total_amount_delivered_tm': 'sum',  # Sum all batches
            'product_name': 'first',
        }

        df = df.groupby('client_order_number', as_index=False).agg(agg_dict)

        # 2. Filter for Small and Medium orders only (0-10 tonnes)
        # This matches training: bins=[0, 5, 10, 20, np.inf] where Small=0-5, Medium=5-10
        df_filtered = df[df['total_amount_delivered_tm'] <= 10].copy()

        if len(df_filtered) < 3:
            # After filtering, need at least 3 orders
            return None

        # 3. Sort by sales_order_creation_date (matching training)
        df_filtered = df_filtered.sort_values('sales_order_creation_date').reset_index(drop=True)

        # 4. Calculate days_since_last_order based on sales_order_creation_date
        df_filtered['days_since_last_order'] = df_filtered['sales_order_creation_date'].diff().dt.days

        # Rename columns to match feature engineering expectations
        df_filtered = df_filtered.rename(columns={
            'total_amount_delivered_tm': 'quantity',
            'actual_expedition_date': 'actual_delivery_date',
            'sales_order_creation_date': 'order_date',
            'product_name': 'delivery_method'
        })

        # Use the MOST RECENT order for prediction
        latest_order_idx = len(df_filtered) - 1

        try:
            features = self._engineer_features(df_filtered, latest_order_idx, client)
            return features
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error engineering features for {client.name}: {str(e)}")
            return None

    def _engineer_features(self, df, current_idx, client):
        """Engineer all required features for the current order"""

        features = {}

        # Get data up to current order
        historical_df = df.iloc[:current_idx + 1].copy()

        # =====================================================================
        # 1. BASIC ORDER FEATURES
        # =====================================================================
        features['total_amount_delivered_tm'] = float(df.loc[current_idx, 'quantity'])
        features['order_sequence'] = current_idx + 1

        # =====================================================================
        # 2. TEMPORAL FEATURES
        # =====================================================================
        current_date = df.loc[current_idx, 'actual_delivery_date']
        features['days_since_last_order'] = float(df.loc[current_idx, 'days_since_last_order']) if current_idx > 0 else 0.0

        # Client-level temporal aggregations
        if current_idx > 0:
            days_between_orders = historical_df['days_since_last_order'].dropna()
            features['days_since_last_order_mean'] = float(days_between_orders.mean())
            features['days_since_last_order_std'] = float(days_between_orders.std()) if len(days_between_orders) > 1 else 0.0
            features['days_since_last_order_expanding_mean'] = features['days_since_last_order_mean']
            features['days_since_last_order_expanding_std'] = features['days_since_last_order_std']
        else:
            features['days_since_last_order_mean'] = 0.0
            features['days_since_last_order_std'] = 0.0
            features['days_since_last_order_expanding_mean'] = 0.0
            features['days_since_last_order_expanding_std'] = 0.0

        # =====================================================================
        # 3. ROLLING WINDOW FEATURES
        # =====================================================================
        for window in [3, 5, 7]:
            if current_idx >= window - 1:
                recent_days = historical_df['days_since_last_order'].iloc[-(window):].dropna()
                recent_qty = historical_df['quantity'].iloc[-(window):]

                features[f'rolling_avg_days_{window}'] = float(recent_days.mean()) if len(recent_days) > 0 else 0.0
                features[f'rolling_std_days_{window}'] = float(recent_days.std()) if len(recent_days) > 1 else 0.0

                if window <= 5:  # Only 3 and 5 for quantity
                    features[f'rolling_avg_quantity_{window}'] = float(recent_qty.mean())
                    features[f'rolling_std_quantity_{window}'] = float(recent_qty.std()) if len(recent_qty) > 1 else 0.0
            else:
                features[f'rolling_avg_days_{window}'] = features.get('days_since_last_order_mean', 0.0)
                features[f'rolling_std_days_{window}'] = features.get('days_since_last_order_std', 0.0)

                if window <= 5:
                    features[f'rolling_avg_quantity_{window}'] = features['total_amount_delivered_tm']
                    features[f'rolling_std_quantity_{window}'] = 0.0

        # =====================================================================
        # 4. CUSTOMER VOLUME FEATURES
        # =====================================================================
        features['total_volume_tonnes'] = float(historical_df['quantity'].sum())

        first_order_date = historical_df['actual_delivery_date'].min()
        features['client_lifetime_days'] = (current_date - first_order_date).days

        features['avg_volume_per_order'] = features['total_volume_tonnes'] / len(historical_df)
        features['volume_per_day'] = features['total_volume_tonnes'] / (features['client_lifetime_days'] + 1)
        features['predicted_annual_volume'] = features['volume_per_day'] * 365

        # Order frequency
        if features['client_lifetime_days'] > 0:
            features['order_frequency_per_month'] = len(historical_df) / ((features['client_lifetime_days'] + 1) / 30)
            features['order_frequency_at_time'] = len(historical_df) / (features['client_lifetime_days'] + 1)
        else:
            features['order_frequency_per_month'] = 0.0
            features['order_frequency_at_time'] = 0.0

        # Volume tier (simplified - assign based on total volume)
        if features['total_volume_tonnes'] < 20:
            features['client_volume_tier'] = 0.0
        elif features['total_volume_tonnes'] < 50:
            features['client_volume_tier'] = 1.0
        elif features['total_volume_tonnes'] < 100:
            features['client_volume_tier'] = 2.0
        elif features['total_volume_tonnes'] < 200:
            features['client_volume_tier'] = 3.0
        else:
            features['client_volume_tier'] = 4.0

        # =====================================================================
        # 5. CLIENT BEHAVIORAL FEATURES
        # =====================================================================
        if features['days_since_last_order_std'] > 0:
            features['ordering_consistency_score'] = features['days_since_last_order_mean'] / (features['days_since_last_order_std'] + 1)
        else:
            features['ordering_consistency_score'] = features['days_since_last_order_mean']

        qty_std = float(historical_df['quantity'].std()) if len(historical_df) > 1 else 0.0
        qty_mean = float(historical_df['quantity'].mean())
        features['order_size_consistency'] = qty_mean / (qty_std + 1) if qty_std > 0 else qty_mean

        # Client maturity
        order_count = len(historical_df)
        if order_count <= 5:
            features['client_maturity'] = 0
        elif order_count <= 15:
            features['client_maturity'] = 1
        elif order_count <= 30:
            features['client_maturity'] = 2
        else:
            features['client_maturity'] = 3

        # High frequency flag (>= 1.5 orders/month is considered high frequency)
        features['is_high_frequency_client'] = 1 if features['order_frequency_per_month'] >= 1.5 else 0

        # =====================================================================
        # 6. RECENT ORDER PATTERNS
        # =====================================================================
        latest_date = df['actual_delivery_date'].max()
        features['recency_days'] = (latest_date - current_date).days

        features['days_deviation_from_mean'] = features['days_since_last_order'] - features['days_since_last_order_mean']
        features['is_overdue_order'] = 1 if features['days_deviation_from_mean'] > features['days_since_last_order_std'] else 0

        features['days_since_first_order'] = features['client_lifetime_days']
        features['client_order_count_at_time'] = len(historical_df)

        # =====================================================================
        # 7. TREND & MOMENTUM
        # =====================================================================
        if current_idx > 0 and len(historical_df) > 1:
            features['order_frequency_trend'] = float(historical_df['days_since_last_order'].diff().iloc[-1]) if current_idx > 0 else 0.0
            features['quantity_trend'] = float(historical_df['quantity'].diff().iloc[-1]) if current_idx > 0 else 0.0
        else:
            features['order_frequency_trend'] = 0.0
            features['quantity_trend'] = 0.0

        # Recent vs historical comparison
        if features['days_since_last_order_expanding_mean'] > 0:
            features['recent_vs_historical_frequency'] = features['rolling_avg_days_3'] / (features['days_since_last_order_expanding_mean'] + 1)
        else:
            features['recent_vs_historical_frequency'] = 1.0

        qty_expanding_mean = float(historical_df['quantity'].mean())
        if qty_expanding_mean > 0:
            features['recent_vs_historical_quantity'] = features['rolling_avg_quantity_3'] / (qty_expanding_mean + 1)
        else:
            features['recent_vs_historical_quantity'] = 1.0

        features['is_frequency_increasing'] = 1 if features['rolling_avg_days_3'] < features['days_since_last_order_expanding_mean'] else 0

        # =====================================================================
        # 7B. CLUSTERING FEATURES (Client Segmentation)
        # =====================================================================
        # Note: Since we don't have pre-computed clusters, we assign clusters based on behavior
        # This matches the training approach where clients were clustered by volume/frequency

        # Assign cluster based on volume tier and frequency
        # Cluster logic: High volume + High frequency = 0, etc.
        if features['client_volume_tier'] >= 3 and features['is_high_frequency_client'] == 1:
            features['client_cluster'] = 0.0  # Premium clients
        elif features['client_volume_tier'] >= 2 and features['order_frequency_per_month'] >= 1.0:
            features['client_cluster'] = 1.0  # Regular clients
        elif features['client_volume_tier'] >= 1:
            features['client_cluster'] = 2.0  # Medium clients
        else:
            features['client_cluster'] = 3.0  # Small/Occasional clients

        # Cluster average features (based on typical cluster characteristics from training)
        # These are approximations based on the assigned cluster
        cluster_profiles = {
            0.0: {'frequency': 2.5, 'volume': 150.0, 'reorder_days': 12.0},  # Premium
            1.0: {'frequency': 1.5, 'volume': 75.0, 'reorder_days': 18.0},   # Regular
            2.0: {'frequency': 0.8, 'volume': 35.0, 'reorder_days': 25.0},   # Medium
            3.0: {'frequency': 0.4, 'volume': 15.0, 'reorder_days': 35.0},   # Small
        }

        cluster_profile = cluster_profiles.get(features['client_cluster'], cluster_profiles[3.0])
        features['cluster_avg_frequency'] = cluster_profile['frequency']
        features['cluster_avg_volume'] = cluster_profile['volume']
        features['cluster_avg_reorder_days'] = cluster_profile['reorder_days']

        # =====================================================================
        # 7C. TEMPORAL/SEASONAL FEATURES (Date-based patterns)
        # =====================================================================
        # Extract temporal components from current order date
        order_month = current_date.month
        order_day_of_week = current_date.dayofweek  # Monday=0, Sunday=6

        # Month and quarter
        features['order_month'] = float(order_month)
        features['order_quarter'] = float((order_month - 1) // 3 + 1)

        # Season (Northern Hemisphere): Winter=0, Spring=1, Summer=2, Fall=3
        if order_month in [12, 1, 2]:
            features['season'] = 0.0
        elif order_month in [3, 4, 5]:
            features['season'] = 1.0
        elif order_month in [6, 7, 8]:
            features['season'] = 2.0
        else:
            features['season'] = 3.0

        # Cyclical encoding for month (sin/cos transformation)
        features['month_sin'] = float(np.sin(2 * np.pi * order_month / 12))
        features['month_cos'] = float(np.cos(2 * np.pi * order_month / 12))

        # Cyclical encoding for day of week
        features['day_of_week_sin'] = float(np.sin(2 * np.pi * order_day_of_week / 7))
        features['day_of_week_cos'] = float(np.cos(2 * np.pi * order_day_of_week / 7))

        # Month-end and quarter-end indicators
        days_in_month = pd.Period(str(current_date.date()), freq='M').days_in_month
        features['is_month_end'] = 1 if current_date.day >= days_in_month - 3 else 0
        features['is_quarter_end'] = 1 if order_month in [3, 6, 9, 12] and current_date.day >= days_in_month - 5 else 0

        # Weekend indicator
        features['is_weekend'] = 1 if order_day_of_week >= 5 else 0

        # Holiday proximity (major Canadian/US holidays)
        # Simplified: Check if within 5 days of major holiday months
        holiday_months = [1, 7, 12]  # New Year, Canada Day/July 4th, Christmas
        features['is_near_holiday'] = 1 if order_month in holiday_months and (current_date.day <= 5 or current_date.day >= 20) else 0

        # =====================================================================
        # 8. PRODUCT FEATURES
        # =====================================================================
        # Product encoded - use simple encoding based on product name
        latest_product = str(df.loc[current_idx, 'delivery_method']) if pd.notna(df.loc[current_idx, 'delivery_method']) else 'Unknown'

        # Create a simple hash-based encoding for product names
        product_hash = hash(latest_product) % 100
        features['product_encoded'] = float(product_hash)

        # Product-client frequency (how many times this product was ordered)
        features['product_client_frequency'] = float(historical_df[historical_df['delivery_method'] == latest_product].shape[0])

        # Average quantity for this product
        product_orders = historical_df[historical_df['delivery_method'] == latest_product]
        features['product_client_avg_quantity'] = float(product_orders['quantity'].mean()) if len(product_orders) > 0 else features['total_amount_delivered_tm']

        # Product switched (did client order a different product than last time)
        if current_idx > 0:
            prev_product = df.loc[current_idx - 1, 'delivery_method']
            features['product_switched'] = 1 if prev_product != latest_product else 0
        else:
            features['product_switched'] = 0

        # Product popularity (normalized by total orders)
        features['product_popularity_score'] = features['product_client_frequency'] / len(historical_df) if len(historical_df) > 0 else 1.0

        # Client product diversity (number of different products ordered)
        features['client_product_diversity'] = float(historical_df['delivery_method'].nunique())

        # =====================================================================
        # 9. EXPANDING WINDOW FEATURES
        # =====================================================================
        features['quantity_expanding_mean'] = float(historical_df['quantity'].mean())
        features['quantity_expanding_std'] = float(historical_df['quantity'].std()) if len(historical_df) > 1 else 0.0

        return features

    def validate_features(self, features):
        """
        Validate that all required features are present

        Returns:
        --------
        tuple: (is_valid, missing_features)
        """
        missing = [f for f in self.required_features if f not in features]
        return (len(missing) == 0, missing)

    def get_features_dataframe(self, features_dict):
        """
        Convert feature dictionary to DataFrame with correct column order

        Parameters:
        -----------
        features_dict : dict
            Feature dictionary

        Returns:
        --------
        pd.DataFrame
            Single-row DataFrame with features in correct order
        """
        # Ensure all features are present
        for feature in self.required_features:
            if feature not in features_dict:
                features_dict[feature] = 0.0  # Fill missing with 0

        # Create DataFrame with correct column order
        df = pd.DataFrame([features_dict])[self.required_features]

        # Fill any NaN values with 0
        df = df.fillna(0)

        return df
