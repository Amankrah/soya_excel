"""
Management command to investigate failed prediction updates.

This command shows exactly which clients failed to update and why,
helping understand the discrepancy between UI counts and update results.

Usage:
    python manage.py investigate_failed_predictions
    python manage.py investigate_failed_predictions --show-all
"""

from django.core.management.base import BaseCommand
from clients.models import Client
from clients.services import get_prediction_service
from django.utils import timezone


class Command(BaseCommand):
    help = 'Investigate why prediction updates fail for some clients'

    def add_arguments(self, parser):
        parser.add_argument(
            '--show-all',
            action='store_true',
            help='Show all failed clients (default: show first 20)',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS(f'\n{"="*80}'))
        self.stdout.write(self.style.SUCCESS('PREDICTION UPDATE FAILURE INVESTIGATION'))
        self.stdout.write(self.style.SUCCESS(f'{"="*80}\n'))

        # Get all active clients
        all_clients = Client.objects.filter(is_active=True)
        total_clients = all_clients.count()

        # Clients with predictions
        clients_with_predictions = all_clients.exclude(predicted_next_order_date__isnull=True)
        clients_with_count = clients_with_predictions.count()

        # Clients without predictions
        clients_without_predictions = all_clients.filter(predicted_next_order_date__isnull=True)
        clients_without_count = clients_without_predictions.count()

        self.stdout.write(self.style.WARNING('CURRENT DATABASE STATE:'))
        self.stdout.write(f'  Total Active Clients: {total_clients}')
        self.stdout.write(f'  Clients WITH Predictions: {clients_with_count}')
        self.stdout.write(f'  Clients WITHOUT Predictions: {clients_without_count}\n')

        # Analyze clients with predictions
        self.stdout.write(f'{"="*80}')
        self.stdout.write(self.style.WARNING('ANALYZING CLIENTS WITH PREDICTIONS:\n'))

        fresh_predictions = []  # Can still be updated
        stale_predictions = []  # Have prediction but can't update

        for client in clients_with_predictions:
            delivered_orders = client.orders.filter(status='delivered').count()
            small_medium_orders = client.orders.filter(
                status='delivered',
                total_amount_delivered_tm__lte=10
            ).count()

            client_info = {
                'id': client.id,
                'name': client.name,
                'total_orders': delivered_orders,
                'small_medium_orders': small_medium_orders,
                'last_prediction_update': client.last_prediction_update,
                'predicted_date': client.predicted_next_order_date,
                'can_update': small_medium_orders >= 3
            }

            if client_info['can_update']:
                fresh_predictions.append(client_info)
            else:
                stale_predictions.append(client_info)

        self.stdout.write(f'✅ Fresh Predictions (can be updated): {len(fresh_predictions)}')
        self.stdout.write(f'⚠️  Stale Predictions (CANNOT be updated): {len(stale_predictions)}\n')

        # Show stale predictions in detail
        if stale_predictions:
            self.stdout.write(f'{"="*80}')
            self.stdout.write(self.style.ERROR('STALE PREDICTIONS - CLIENTS THAT SHIFTED TO BULK ORDERS:\n'))

            show_all = options.get('show_all', False)
            display_limit = len(stale_predictions) if show_all else min(20, len(stale_predictions))

            for i, client_info in enumerate(stale_predictions[:display_limit], 1):
                days_since_update = 'Never'
                if client_info['last_prediction_update']:
                    days_since_update = (timezone.now() - client_info['last_prediction_update']).days

                self.stdout.write(f"{i}. {client_info['name']} (ID: {client_info['id']})")
                self.stdout.write(f"   Total Orders: {client_info['total_orders']}")
                self.stdout.write(f"   Small/Medium Orders: {client_info['small_medium_orders']}")
                self.stdout.write(f"   Last Updated: {days_since_update} days ago")
                self.stdout.write(f"   Predicted Reorder: {client_info['predicted_date'].strftime('%Y-%m-%d') if client_info['predicted_date'] else 'Unknown'}")
                self.stdout.write('')

            if len(stale_predictions) > display_limit:
                self.stdout.write(f"... and {len(stale_predictions) - display_limit} more stale predictions")
                self.stdout.write(f"(Use --show-all to see all {len(stale_predictions)} clients)\n")

        # Summary explanation
        self.stdout.write(f'{"="*80}')
        self.stdout.write(self.style.WARNING('SUMMARY:\n'))

        self.stdout.write("📊 Why UI shows 173 but only 103 updated successfully:")
        self.stdout.write(f"   - Fresh predictions that can update: {len(fresh_predictions)}")
        self.stdout.write(f"   - Stale predictions that can't update: {len(stale_predictions)}")
        self.stdout.write(f"   - Total shown in UI: {len(fresh_predictions) + len(stale_predictions)}\n")

        if stale_predictions:
            self.stdout.write(self.style.WARNING("⚠️  THE PROBLEM:"))
            self.stdout.write(f"   {len(stale_predictions)} clients have OLD predictions from when they ordered")
            self.stdout.write("   small/medium quantities. Now they order in bulk (>10 tonnes),")
            self.stdout.write("   so the model can't update their predictions.\n")

            self.stdout.write(self.style.WARNING("💡 RECOMMENDATIONS:\n"))

            self.stdout.write("   Option 1: CLEAR STALE PREDICTIONS (Recommended)")
            self.stdout.write("   - Remove predictions from clients who now order in bulk")
            self.stdout.write("   - UI will show only clients with fresh, updatable predictions")
            self.stdout.write("   - Run: python manage.py clear_stale_predictions\n")

            self.stdout.write("   Option 2: KEEP STALE PREDICTIONS")
            self.stdout.write("   - Keep old predictions as 'last known pattern'")
            self.stdout.write("   - Add a warning flag in UI: 'Prediction outdated'")
            self.stdout.write("   - User sees that prediction may not be accurate\n")

            self.stdout.write("   Option 3: AUTO-CLEAR ON UPDATE")
            self.stdout.write("   - Modify update script to clear predictions that fail to update")
            self.stdout.write("   - Clients automatically removed from prediction list when they shift to bulk")

        # Test individual client
        self.stdout.write(f'\n{"="*80}')
        self.stdout.write(self.style.WARNING('TESTING INDIVIDUAL CLIENT UPDATE:\n'))

        if stale_predictions:
            test_client_info = stale_predictions[0]
            test_client = Client.objects.get(id=test_client_info['id'])

            self.stdout.write(f"Testing update for: {test_client.name}")
            self.stdout.write(f"Expected result: FAIL (only {test_client_info['small_medium_orders']} small/medium orders)\n")

            prediction_service = get_prediction_service()
            success = prediction_service.update_client_prediction(test_client)

            if success:
                self.stdout.write(self.style.ERROR("❌ UNEXPECTED: Update succeeded! This shouldn't happen."))
            else:
                self.stdout.write(self.style.SUCCESS("✅ CONFIRMED: Update failed as expected."))
                self.stdout.write("   This client's prediction will remain stale until they order small/medium again.")

        self.stdout.write(f'\n{"="*80}')
        self.stdout.write(self.style.SUCCESS('INVESTIGATION COMPLETE'))
        self.stdout.write(f'{"="*80}\n')
