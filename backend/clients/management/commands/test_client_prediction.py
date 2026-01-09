"""
Management command to test and diagnose client prediction issues.

This command helps understand:
1. Total delivered orders vs small/medium orders
2. Whether feature engineering succeeds or fails
3. What the actual prediction would be if successful
4. Why a prediction might fail

Usage:
    python manage.py test_client_prediction <client_id>
    python manage.py test_client_prediction --name "Client Name"
"""

from django.core.management.base import BaseCommand
from clients.models import Client
from clients.services import get_prediction_service
from clients.services.feature_engineering import ClientFeatureEngineer
import pandas as pd


class Command(BaseCommand):
    help = 'Test and diagnose client prediction generation'

    def add_arguments(self, parser):
        parser.add_argument(
            'client_id',
            nargs='?',
            type=int,
            help='Client ID to test',
        )
        parser.add_argument(
            '--name',
            type=str,
            help='Client name (alternative to client_id)',
        )

    def handle(self, *args, **options):
        client_id = options.get('client_id')
        client_name = options.get('name')

        # Get client
        try:
            if client_id:
                client = Client.objects.get(id=client_id)
            elif client_name:
                client = Client.objects.get(name__icontains=client_name)
            else:
                self.stdout.write(self.style.ERROR('Please provide either client_id or --name'))
                return
        except Client.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'Client not found'))
            return
        except Client.MultipleObjectsReturned:
            self.stdout.write(self.style.ERROR(f'Multiple clients found with name "{client_name}". Please be more specific or use client_id.'))
            return

        self.stdout.write(self.style.SUCCESS(f'\n{"="*80}'))
        self.stdout.write(self.style.SUCCESS(f'CLIENT PREDICTION DIAGNOSTIC TEST'))
        self.stdout.write(self.style.SUCCESS(f'{"="*80}\n'))

        # Step 1: Client Information
        self.stdout.write(self.style.WARNING('STEP 1: Client Information'))
        self.stdout.write(f'  Client Name: {client.name}')
        self.stdout.write(f'  Client ID: {client.id}')
        self.stdout.write(f'  Location: {client.city}, {client.country}')
        self.stdout.write(f'  Is Active: {client.is_active}')

        # Step 2: Order Analysis
        self.stdout.write(f'\n{"-"*80}')
        self.stdout.write(self.style.WARNING('STEP 2: Order History Analysis'))

        from clients.models import Order

        total_orders = client.orders.count()
        delivered_orders = client.orders.filter(status='delivered').count()

        self.stdout.write(f'  Total Orders: {total_orders}')
        self.stdout.write(f'  Delivered Orders: {delivered_orders}')

        if delivered_orders == 0:
            self.stdout.write(self.style.ERROR('\n  ✗ No delivered orders found!'))
            self.stdout.write('    Client needs at least 3 delivered orders for predictions.')
            return

        # Get order size breakdown
        orders = Order.objects.filter(
            client=client,
            status='delivered',
            actual_expedition_date__isnull=False
        ).values('client_order_number', 'total_amount_delivered_tm', 'actual_expedition_date')

        if not orders:
            self.stdout.write(self.style.ERROR('\n  ✗ No delivered orders with dates found!'))
            return

        df = pd.DataFrame(list(orders))
        df['total_amount_delivered_tm'] = df['total_amount_delivered_tm'].astype(float)

        # Combine batches
        df_combined = df.groupby('client_order_number', as_index=False).agg({
            'actual_expedition_date': 'max',
            'total_amount_delivered_tm': 'sum'
        })

        total_unique_orders = len(df_combined)
        small_orders = len(df_combined[df_combined['total_amount_delivered_tm'] <= 5])
        medium_orders = len(df_combined[(df_combined['total_amount_delivered_tm'] > 5) &
                                        (df_combined['total_amount_delivered_tm'] <= 10)])
        large_orders = len(df_combined[(df_combined['total_amount_delivered_tm'] > 10) &
                                       (df_combined['total_amount_delivered_tm'] <= 20)])
        xlarge_orders = len(df_combined[df_combined['total_amount_delivered_tm'] > 20])

        small_medium_orders = small_orders + medium_orders

        self.stdout.write(f'\n  Order Size Breakdown (after combining batches):')
        self.stdout.write(f'    Total Unique Orders: {total_unique_orders}')
        self.stdout.write(f'    Small (0-5 tonnes): {small_orders}')
        self.stdout.write(f'    Medium (5-10 tonnes): {medium_orders}')
        self.stdout.write(f'    Large (10-20 tonnes): {large_orders}')
        self.stdout.write(f'    X-Large (>20 tonnes): {xlarge_orders}')
        self.stdout.write(f'    Small + Medium (≤10 tonnes): {small_medium_orders}')

        # Step 3: Prediction Model Requirements
        self.stdout.write(f'\n{"-"*80}')
        self.stdout.write(self.style.WARNING('STEP 3: Prediction Model Requirements'))
        self.stdout.write('  The prediction model was trained ONLY on small/medium orders (≤10 tonnes)')
        self.stdout.write('  Requirement: At least 3 small/medium orders')

        if small_medium_orders < 3:
            self.stdout.write(self.style.ERROR(f'\n  ✗ INSUFFICIENT SMALL/MEDIUM ORDERS'))
            self.stdout.write(f'    Client has {small_medium_orders} small/medium order(s), needs 3')
            self.stdout.write('\n  Reason for failure:')
            self.stdout.write('    This client primarily orders in large quantities (>10 tonnes)')
            self.stdout.write('    The ML model cannot make accurate predictions for bulk orders')
            return
        else:
            self.stdout.write(self.style.SUCCESS(f'\n  ✓ SUFFICIENT ORDERS: {small_medium_orders} small/medium orders'))

        # Step 4: Feature Engineering Test
        self.stdout.write(f'\n{"-"*80}')
        self.stdout.write(self.style.WARNING('STEP 4: Feature Engineering Test'))

        feature_engineer = ClientFeatureEngineer()

        try:
            features_dict = feature_engineer.prepare_client_data(client)

            if features_dict is None:
                self.stdout.write(self.style.ERROR('  ✗ Feature engineering returned None'))
                self.stdout.write('    This should not happen given the order counts above')
                self.stdout.write('    There may be an issue with order data quality')
                return

            self.stdout.write(self.style.SUCCESS('  ✓ Feature engineering successful'))

            # Validate features
            is_valid, missing = feature_engineer.validate_features(features_dict)

            if not is_valid:
                self.stdout.write(self.style.ERROR(f'\n  ✗ Feature validation failed'))
                self.stdout.write(f'    Missing features: {missing}')
                return

            self.stdout.write(self.style.SUCCESS('  ✓ Feature validation passed'))

            # Show some key features
            self.stdout.write('\n  Key Features:')
            key_features = [
                'days_since_last_order', 'quantity', 'avg_order_quantity_7',
                'avg_days_between_orders_7', 'order_frequency_30d'
            ]
            for feat in key_features:
                if feat in features_dict:
                    self.stdout.write(f'    {feat}: {features_dict[feat]:.2f}')

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'  ✗ Feature engineering failed with exception:'))
            self.stdout.write(f'    {str(e)}')
            import traceback
            self.stdout.write(f'\n{traceback.format_exc()}')
            return

        # Step 5: Prediction Test
        self.stdout.write(f'\n{"-"*80}')
        self.stdout.write(self.style.WARNING('STEP 5: Prediction Generation Test'))

        prediction_service = get_prediction_service()

        if not prediction_service.model_loaded:
            self.stdout.write(self.style.ERROR('  ✗ Prediction model not loaded'))
            self.stdout.write('    Run: python manage.py check_prediction_model')
            return

        self.stdout.write(self.style.SUCCESS('  ✓ Prediction model loaded'))

        try:
            features_df = feature_engineer.get_features_dataframe(features_dict)
            prediction = prediction_service.predict_single(features_df)

            if prediction is None:
                self.stdout.write(self.style.ERROR('  ✗ Prediction generation returned None'))
                return

            self.stdout.write(self.style.SUCCESS('  ✓ Prediction generated successfully'))

            self.stdout.write('\n  Prediction Results:')
            self.stdout.write(f'    Days Until Next Order: {prediction["days_until_next_order"]:.1f}')
            self.stdout.write(f'    Confidence Interval: {prediction["confidence_interval_lower"]:.1f} - {prediction["confidence_interval_upper"]:.1f} days')
            self.stdout.write(f'    Expected Reorder Date: {prediction["expected_reorder_date"].strftime("%Y-%m-%d")}')
            self.stdout.write(f'    Earliest Date: {prediction["earliest_reorder_date"].strftime("%Y-%m-%d")}')
            self.stdout.write(f'    Latest Date: {prediction["latest_reorder_date"].strftime("%Y-%m-%d")}')

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'  ✗ Prediction generation failed:'))
            self.stdout.write(f'    {str(e)}')
            return

        # Step 6: Current Database State
        self.stdout.write(f'\n{"-"*80}')
        self.stdout.write(self.style.WARNING('STEP 6: Current Database State'))

        client.refresh_from_db()

        if client.predicted_next_order_date:
            self.stdout.write('  Current Prediction in Database:')
            self.stdout.write(f'    Predicted Days: {client.predicted_next_order_days}')
            self.stdout.write(f'    Predicted Date: {client.predicted_next_order_date.strftime("%Y-%m-%d")}')
            self.stdout.write(f'    Last Updated: {client.last_prediction_update.strftime("%Y-%m-%d %H:%M") if client.last_prediction_update else "Never"}')

            # Compare with new prediction
            if prediction:
                days_diff = abs(prediction["days_until_next_order"] - float(client.predicted_next_order_days))
                self.stdout.write(f'\n  Difference from New Prediction: {days_diff:.1f} days')

                if days_diff > 5:
                    self.stdout.write(self.style.WARNING('    ⚠ Significant difference - consider updating'))
                else:
                    self.stdout.write(self.style.SUCCESS('    ✓ Predictions are similar'))
        else:
            self.stdout.write('  No prediction currently in database')

        # Step 7: Summary
        self.stdout.write(f'\n{"-"*80}')
        self.stdout.write(self.style.WARNING('STEP 7: Summary'))

        if small_medium_orders >= 3 and prediction:
            self.stdout.write(self.style.SUCCESS('\n  ✓ PREDICTION SYSTEM WORKING CORRECTLY'))
            self.stdout.write('')
            self.stdout.write('  This client CAN receive predictions because:')
            self.stdout.write(f'    1. Has {delivered_orders} delivered orders')
            self.stdout.write(f'    2. Has {small_medium_orders} small/medium orders (≤10 tonnes)')
            self.stdout.write('    3. Feature engineering succeeded')
            self.stdout.write('    4. Prediction model generated valid results')
            self.stdout.write('')
            self.stdout.write('  To update this client\'s prediction in the database:')
            self.stdout.write('    - Use the "Update Prediction" button in the UI')
            self.stdout.write(f'    - Or run: python manage.py update_predictions --client-id {client.id}')
        else:
            self.stdout.write(self.style.ERROR('\n  ✗ PREDICTION CANNOT BE GENERATED'))
            self.stdout.write('')
            self.stdout.write('  This client CANNOT receive predictions because:')
            if small_medium_orders < 3:
                self.stdout.write(f'    - Only {small_medium_orders} small/medium orders (needs 3)')
                self.stdout.write('    - Client primarily orders in bulk (>10 tonnes)')
                self.stdout.write('    - Model not trained on large order patterns')

        self.stdout.write(f'\n{"="*80}')
        self.stdout.write(self.style.SUCCESS('TEST COMPLETE'))
        self.stdout.write(f'{"="*80}\n')
