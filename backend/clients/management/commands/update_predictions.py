"""
Django management command to update reorder predictions for all clients
Can be run manually or scheduled as a cron job
"""

from django.core.management.base import BaseCommand
from clients.services import get_prediction_service
from django.utils import timezone


class Command(BaseCommand):
    help = 'Update reorder predictions for all active clients using XGBoost AI model'

    def add_arguments(self, parser):
        parser.add_argument(
            '--client-id',
            type=int,
            help='Update prediction for a specific client ID only',
        )
        parser.add_argument(
            '--show-upcoming',
            type=int,
            default=0,
            help='Show upcoming reorders in the next N days',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed information about failed predictions',
        )
        parser.add_argument(
            '--clear-stale',
            action='store_true',
            help='Automatically clear predictions that fail to update (remove stale predictions)',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.HTTP_INFO('='*80))
        self.stdout.write(self.style.HTTP_INFO('REORDER PREDICTION UPDATE'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        prediction_service = get_prediction_service()

        if not prediction_service.model_loaded:
            self.stdout.write(self.style.ERROR('\n❌ Prediction model not loaded!'))
            self.stdout.write(self.style.ERROR('   Please ensure the model files are in model_deployment_xgboost/'))
            return

        # Single client update
        if options['client_id']:
            from clients.models import Client
            try:
                client = Client.objects.get(id=options['client_id'])
                self.stdout.write(f"\nUpdating prediction for: {client.name}")

                success = prediction_service.update_client_prediction(client)

                if success:
                    self.stdout.write(self.style.SUCCESS(f"\n✅ Prediction updated successfully!"))
                    self.stdout.write(f"   Expected reorder in: {client.predicted_next_order_days:.1f} days")
                    self.stdout.write(f"   Expected date: {client.predicted_next_order_date.strftime('%Y-%m-%d')}")
                    self.stdout.write(f"   Confidence interval: {client.prediction_confidence_lower:.1f} - {client.prediction_confidence_upper:.1f} days")
                else:
                    self.stdout.write(self.style.ERROR(f"\n❌ Failed to update prediction"))

            except Client.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"\n❌ Client with ID {options['client_id']} not found"))

        # Update all clients
        else:
            self.stdout.write(f"\nStarting prediction update for all active clients...")
            self.stdout.write(f"Timestamp: {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

            verbose = options.get('verbose', False)
            clear_stale = options.get('clear_stale', False)
            results = prediction_service.update_all_predictions(verbose=verbose, clear_stale=clear_stale)

            # Display results
            self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
            self.stdout.write(self.style.HTTP_INFO('RESULTS'))
            self.stdout.write(self.style.HTTP_INFO('='*80))

            self.stdout.write(f"\nTotal clients: {results['total_clients']}")
            self.stdout.write(self.style.SUCCESS(f"[+] Successful predictions: {results['successful_predictions']}"))
            self.stdout.write(self.style.ERROR(f"[-] Failed predictions: {results['failed_predictions']}"))
            self.stdout.write(self.style.WARNING(f"[!] Skipped (insufficient data): {results['skipped']}"))

            if results.get('cleared_stale', 0) > 0:
                self.stdout.write(self.style.WARNING(f"[🗑️] Cleared stale predictions: {results['cleared_stale']}"))

            success_rate = (results['successful_predictions'] / results['total_clients'] * 100) if results['total_clients'] > 0 else 0
            self.stdout.write(f"\nSuccess rate: {success_rate:.1f}%")

            # Show detailed failure information
            if results['failed_predictions'] > 0:
                self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
                self.stdout.write(self.style.HTTP_INFO('FAILED PREDICTIONS ANALYSIS'))
                self.stdout.write(self.style.HTTP_INFO('='*80))

                failed_clients = results.get('failed_clients', [])

                # Categorize failures
                stale_predictions = [f for f in failed_clients if f['had_previous_prediction']]
                never_predicted = [f for f in failed_clients if not f['had_previous_prediction']]

                self.stdout.write(f"\n📊 Failure Breakdown:")
                self.stdout.write(f"   - Stale predictions (had prediction before): {len(stale_predictions)}")
                self.stdout.write(f"   - Never had prediction: {len(never_predicted)}")

                # Show stale predictions
                if stale_predictions:
                    self.stdout.write(self.style.WARNING(f"\n⚠️  STALE PREDICTIONS ({len(stale_predictions)} clients):"))
                    self.stdout.write("   These clients HAD predictions before but can't be updated now.\n")

                    for i, client_info in enumerate(stale_predictions[:10], 1):
                        self.stdout.write(f"   {i}. {client_info['client_name']} (ID: {client_info['client_id']})")
                        self.stdout.write(f"      Total Orders: {client_info['total_orders']}")
                        self.stdout.write(f"      Small/Medium Orders (≤10t): {client_info['small_medium_orders']}")
                        self.stdout.write(f"      Last Prediction: {client_info['last_prediction_update']}")
                        self.stdout.write(f"      Reason: {client_info['reason']}\n")

                    if len(stale_predictions) > 10:
                        self.stdout.write(f"   ... and {len(stale_predictions) - 10} more")

                # Explain the situation
                self.stdout.write(self.style.HTTP_INFO('\n' + '-'*80))
                self.stdout.write(self.style.WARNING('💡 EXPLANATION:\n'))
                self.stdout.write("   Frontend shows 173 clients with predictions because:")
                self.stdout.write(f"   - {results['successful_predictions']} clients just got fresh predictions")
                self.stdout.write(f"   - {len(stale_predictions)} clients have OLD predictions that can't be refreshed")
                self.stdout.write(f"   - Total: {results['successful_predictions']} + {len(stale_predictions)} = {results['successful_predictions'] + len(stale_predictions)} (approximately)")
                self.stdout.write("")
                self.stdout.write("   Why stale predictions exist:")
                self.stdout.write("   - Client used to order small/medium quantities (≤10 tonnes)")
                self.stdout.write("   - They received predictions during that time")
                self.stdout.write("   - Now they order in bulk (>10 tonnes)")
                self.stdout.write("   - Model can't update predictions for bulk orders")
                self.stdout.write("")

                if clear_stale:
                    self.stdout.write(self.style.SUCCESS("   ✓ AUTO-CLEAR ENABLED:"))
                    self.stdout.write(f"     {results.get('cleared_stale', 0)} stale predictions were automatically removed")
                    self.stdout.write("     UI will now show only clients with fresh predictions")
                else:
                    self.stdout.write("   Options:")
                    self.stdout.write("   1. Keep old predictions (conservative - shows last known pattern)")
                    self.stdout.write("   2. Clear old predictions (aggressive - only show current clients)")
                    self.stdout.write("      Run with: python manage.py update_predictions --clear-stale")
                    self.stdout.write("   3. Flag them as 'outdated' in the UI")

        # Show upcoming reorders if requested
        if options['show_upcoming'] > 0:
            days_ahead = options['show_upcoming']
            self.stdout.write(self.style.HTTP_INFO(f"\n{'='*80}"))
            self.stdout.write(self.style.HTTP_INFO(f'UPCOMING REORDERS (Next {days_ahead} days)'))
            self.stdout.write(self.style.HTTP_INFO('='*80))

            upcoming = prediction_service.get_upcoming_reorders(days_ahead=days_ahead)

            if upcoming.exists():
                self.stdout.write(f"\nFound {upcoming.count()} clients expected to reorder soon:\n")

                for client in upcoming:
                    days_until = (client.predicted_next_order_date - timezone.now()).days
                    self.stdout.write(f"  • {client.name}")
                    self.stdout.write(f"    Expected: {client.predicted_next_order_date.strftime('%Y-%m-%d')} ({days_until} days)")
                    self.stdout.write(f"    Confidence: ±{(client.prediction_confidence_upper - client.predicted_next_order_days):.1f} days\n")
            else:
                self.stdout.write(self.style.WARNING(f"\nNo clients expected to reorder in the next {days_ahead} days"))

            # Show overdue
            overdue = prediction_service.get_overdue_predictions()
            if overdue.exists():
                self.stdout.write(self.style.ERROR(f"\n[!] OVERDUE PREDICTIONS: {overdue.count()} clients"))
                for client in overdue[:5]:  # Show first 5
                    days_overdue = (timezone.now() - client.predicted_next_order_date).days
                    self.stdout.write(f"  - {client.name}: {days_overdue} days overdue")

        self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
        self.stdout.write(self.style.SUCCESS('[+] Prediction update complete!'))
        self.stdout.write(self.style.HTTP_INFO('='*80 + '\n'))
