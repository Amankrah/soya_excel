"""
Django management command to validate prediction pipeline
Tests feature engineering and model predictions
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from clients.models import Client, Order
from clients.services import get_prediction_service, ClientFeatureEngineer
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Validate prediction pipeline - test feature engineering and model'

    def add_arguments(self, parser):
        parser.add_argument(
            '--client-id',
            type=int,
            help='Test specific client ID',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed feature values',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.HTTP_INFO('='*80))
        self.stdout.write(self.style.HTTP_INFO('PREDICTION PIPELINE VALIDATION'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        # Test 1: Check model loading
        self.stdout.write('\n' + self.style.HTTP_INFO('[1] Testing Model Loading...'))
        prediction_service = get_prediction_service()

        if not prediction_service.model_loaded:
            self.stdout.write(self.style.ERROR('   ❌ FAILED: Model not loaded'))
            self.stdout.write('   Check that model files exist in model_deployment_xgboost/')
            return

        self.stdout.write(self.style.SUCCESS('   ✅ Model loaded successfully'))

        # Test 2: Check feature engineering completeness
        self.stdout.write('\n' + self.style.HTTP_INFO('[2] Testing Feature Engineering...'))
        feature_engineer = ClientFeatureEngineer()

        expected_feature_count = 62
        actual_feature_count = len(feature_engineer.required_features)

        if actual_feature_count != expected_feature_count:
            self.stdout.write(self.style.ERROR(
                f'   ❌ FAILED: Expected {expected_feature_count} features, got {actual_feature_count}'
            ))
            return

        self.stdout.write(self.style.SUCCESS(
            f'   ✅ Feature list complete: {actual_feature_count} features'
        ))

        # Test 3: Find a suitable test client
        self.stdout.write('\n' + self.style.HTTP_INFO('[3] Finding Test Clients...'))

        if options['client_id']:
            test_clients = Client.objects.filter(id=options['client_id'])
        else:
            # Find clients with enough order history
            test_clients = Client.objects.filter(
                is_active=True,
                orders__status='delivered'
            ).distinct()

        if not test_clients.exists():
            self.stdout.write(self.style.ERROR('   ❌ No suitable test clients found'))
            return

        # Select up to 3 test clients
        test_clients = test_clients[:3]
        self.stdout.write(self.style.SUCCESS(
            f'   ✅ Found {test_clients.count()} test client(s)'
        ))

        # Test 4: Test feature generation and prediction
        self.stdout.write('\n' + self.style.HTTP_INFO('[4] Testing Feature Generation & Predictions...'))

        test_results = {
            'total_tested': 0,
            'successful': 0,
            'failed': 0,
            'insufficient_data': 0,
            'feature_issues': []
        }

        for client in test_clients:
            test_results['total_tested'] += 1

            self.stdout.write(f'\n   Testing: {client.name}')

            # Check order count
            order_count = client.orders.filter(status='delivered').count()
            self.stdout.write(f'   - Orders: {order_count}')

            if order_count < 3:
                self.stdout.write(self.style.WARNING('   ⏭️  Skipped: Need at least 3 orders'))
                test_results['insufficient_data'] += 1
                continue

            # Test feature engineering
            try:
                features_dict = feature_engineer.prepare_client_data(client)

                if features_dict is None:
                    self.stdout.write(self.style.WARNING('   ⏭️  Skipped: Feature engineering returned None'))
                    test_results['insufficient_data'] += 1
                    continue

                # Validate all features present
                is_valid, missing = feature_engineer.validate_features(features_dict)

                if not is_valid:
                    self.stdout.write(self.style.ERROR(
                        f'   ❌ Missing features: {missing}'
                    ))
                    test_results['feature_issues'].append({
                        'client': client.name,
                        'missing': missing
                    })
                    test_results['failed'] += 1
                    continue

                self.stdout.write(self.style.SUCCESS(
                    f'   ✅ All {len(features_dict)} features generated'
                ))

                # Show feature values if verbose
                if options['verbose']:
                    self.stdout.write('   Feature values:')
                    for feat_name in sorted(features_dict.keys())[:10]:  # Show first 10
                        self.stdout.write(f'      {feat_name}: {features_dict[feat_name]:.3f}')
                    if len(features_dict) > 10:
                        self.stdout.write(f'      ... and {len(features_dict) - 10} more')

                # Test prediction
                success = prediction_service.update_client_prediction(client)

                if success:
                    self.stdout.write(self.style.SUCCESS(
                        f'   ✅ Prediction successful: {client.predicted_next_order_days:.1f} days'
                    ))
                    self.stdout.write(
                        f'   - Expected date: {client.predicted_next_order_date.strftime("%Y-%m-%d")}'
                    )
                    self.stdout.write(
                        f'   - Confidence: {client.prediction_confidence_lower:.1f} - '
                        f'{client.prediction_confidence_upper:.1f} days'
                    )
                    self.stdout.write(f'   - Priority: {client.priority or "Not set"}')
                    test_results['successful'] += 1
                else:
                    self.stdout.write(self.style.ERROR('   ❌ Prediction failed'))
                    test_results['failed'] += 1

            except Exception as e:
                self.stdout.write(self.style.ERROR(f'   ❌ Exception: {str(e)}'))
                test_results['failed'] += 1
                import traceback
                if options['verbose']:
                    self.stdout.write(traceback.format_exc())

        # Test 5: Summary
        self.stdout.write('\n' + self.style.HTTP_INFO('='*80))
        self.stdout.write(self.style.HTTP_INFO('VALIDATION SUMMARY'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        self.stdout.write(f'\nClients tested: {test_results["total_tested"]}')
        self.stdout.write(self.style.SUCCESS(f'✅ Successful: {test_results["successful"]}'))
        self.stdout.write(self.style.ERROR(f'❌ Failed: {test_results["failed"]}'))
        self.stdout.write(self.style.WARNING(f'⏭️  Insufficient data: {test_results["insufficient_data"]}'))

        if test_results['feature_issues']:
            self.stdout.write('\n' + self.style.ERROR('Feature Issues Detected:'))
            for issue in test_results['feature_issues']:
                self.stdout.write(f'  - {issue["client"]}: Missing {len(issue["missing"])} features')

        # Overall verdict
        self.stdout.write('\n' + self.style.HTTP_INFO('='*80))

        if test_results['successful'] > 0 and test_results['failed'] == 0:
            self.stdout.write(self.style.SUCCESS('✅ VALIDATION PASSED'))
            self.stdout.write('   Prediction pipeline is working correctly')
        elif test_results['successful'] > 0:
            self.stdout.write(self.style.WARNING('⚠️  VALIDATION PARTIALLY PASSED'))
            self.stdout.write('   Some predictions succeeded, but some failed')
        else:
            self.stdout.write(self.style.ERROR('❌ VALIDATION FAILED'))
            self.stdout.write('   No successful predictions. Check errors above.')

        self.stdout.write(self.style.HTTP_INFO('='*80 + '\n'))

        # Return exit code
        if test_results['failed'] > 0:
            exit(1)
