"""
Django management command to sync data from ALIX ERP system
Fetches orders and client data in near real-time
"""

import requests
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from decimal import Decimal
from datetime import datetime, timedelta
from clients.models import Client, Order
import json
import time


class Command(BaseCommand):
    help = 'Sync data from ALIX ERP system to database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--since',
            type=str,
            help='Sync data since date (YYYY-MM-DD). Default: last 7 days',
        )
        parser.add_argument(
            '--full-sync',
            action='store_true',
            help='Perform full sync (all data)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Perform dry run without saving to database',
        )
        parser.add_argument(
            '--update-predictions',
            action='store_true',
            help='Update AI predictions after sync',
        )

    def handle(self, *args, **options):
        since_date = options.get('since')
        full_sync = options['full_sync']
        dry_run = options['dry_run']
        update_predictions = options['update_predictions']

        self.stdout.write(self.style.HTTP_INFO('='*80))
        self.stdout.write(self.style.HTTP_INFO('ALIX ERP SYNC'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        if dry_run:
            self.stdout.write(self.style.WARNING('\nDRY RUN MODE - No data will be saved\n'))

        # Initialize ALIX API client
        alix_client = AlixAPIClient()

        if not alix_client.is_configured():
            self.stdout.write(self.style.ERROR('\n❌ ALIX API not configured'))
            self.stdout.write('Please set the following environment variables:')
            self.stdout.write('  - ALIX_API_URL')
            self.stdout.write('  - ALIX_API_KEY')
            self.stdout.write('  - ALIX_COMPANY_ID')
            return

        # Determine sync date range
        if full_sync:
            since = None
            self.stdout.write('\nMode: Full sync (all data)')
        elif since_date:
            since = datetime.strptime(since_date, '%Y-%m-%d')
            self.stdout.write(f'\nMode: Incremental sync since {since_date}')
        else:
            since = timezone.now() - timedelta(days=7)
            self.stdout.write(f'\nMode: Incremental sync (last 7 days)')

        self.stdout.write('')

        # Sync data
        stats = {
            'clients_created': 0,
            'clients_updated': 0,
            'orders_created': 0,
            'orders_updated': 0,
            'errors': []
        }

        try:
            # Sync clients
            self.stdout.write('Fetching clients from ALIX...')
            clients_data = alix_client.get_clients(since=since)
            self.stdout.write(self.style.SUCCESS(f'✅ Fetched {len(clients_data)} clients\n'))

            self.stdout.write('Processing clients...')
            client_stats = self._sync_clients(clients_data, dry_run)
            stats['clients_created'] = client_stats['created']
            stats['clients_updated'] = client_stats['updated']
            stats['errors'].extend(client_stats['errors'])

            # Sync orders
            self.stdout.write('\nFetching orders from ALIX...')
            orders_data = alix_client.get_orders(since=since)
            self.stdout.write(self.style.SUCCESS(f'✅ Fetched {len(orders_data)} orders\n'))

            self.stdout.write('Processing orders...')
            order_stats = self._sync_orders(orders_data, dry_run)
            stats['orders_created'] = order_stats['created']
            stats['orders_updated'] = order_stats['updated']
            stats['errors'].extend(order_stats['errors'])

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\n❌ Sync failed: {str(e)}'))
            return

        # Display results
        self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
        self.stdout.write(self.style.HTTP_INFO('SYNC RESULTS'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        self.stdout.write(f"\nClients:")
        self.stdout.write(self.style.SUCCESS(f"  ✅ Created: {stats['clients_created']}"))
        self.stdout.write(f"  🔄 Updated: {stats['clients_updated']}")

        self.stdout.write(f"\nOrders:")
        self.stdout.write(self.style.SUCCESS(f"  ✅ Created: {stats['orders_created']}"))
        self.stdout.write(f"  🔄 Updated: {stats['orders_updated']}")

        if stats['errors']:
            self.stdout.write(f"\n{self.style.ERROR('Errors:')}")
            for error in stats['errors'][:10]:
                self.stdout.write(f"  ❌ {error}")
            if len(stats['errors']) > 10:
                self.stdout.write(f"  ... and {len(stats['errors']) - 10} more errors")

        # Update predictions if requested
        if update_predictions and not dry_run:
            self.stdout.write('\n' + self.style.HTTP_INFO('Updating AI predictions...'))
            from clients.services import get_prediction_service
            service = get_prediction_service()

            if service.model_loaded:
                pred_results = service.update_all_predictions()
                self.stdout.write(self.style.SUCCESS(
                    f"✅ Updated {pred_results['successful_predictions']} predictions"
                ))
            else:
                self.stdout.write(self.style.WARNING('⚠️  Prediction model not loaded'))

        self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN COMPLETE - No data was saved'))
        else:
            self.stdout.write(self.style.SUCCESS('✅ SYNC COMPLETE'))
        self.stdout.write(self.style.HTTP_INFO('='*80 + '\n'))

    def _sync_clients(self, clients_data, dry_run=False):
        """Sync clients from ALIX data"""
        stats = {'created': 0, 'updated': 0, 'errors': []}

        for client_data in clients_data:
            try:
                client_name = client_data.get('name', '').strip()
                if not client_name:
                    continue

                # Extract address components
                city = client_data.get('city', '').strip()
                postal_code = client_data.get('postal_code', '').strip()
                country = client_data.get('country', 'Canada').strip()

                # ALIX customer ID for reference
                alix_customer_id = client_data.get('customer_id', '')

                if not dry_run:
                    client, created = Client.objects.get_or_create(
                        name=client_name,
                        defaults={
                            'city': city,
                            'postal_code': postal_code,
                            'country': country,
                            'is_active': True
                        }
                    )

                    if created:
                        stats['created'] += 1
                    else:
                        # Update if data changed
                        updated = False
                        if client.city != city:
                            client.city = city
                            updated = True
                        if client.postal_code != postal_code:
                            client.postal_code = postal_code
                            updated = True
                        if client.country != country:
                            client.country = country
                            updated = True

                        if updated:
                            client.save()
                            stats['updated'] += 1
                else:
                    stats['created'] += 1

            except Exception as e:
                stats['errors'].append(f"Client '{client_data.get('name')}': {str(e)}")

        return stats

    def _sync_orders(self, orders_data, dry_run=False):
        """Sync orders from ALIX data"""
        stats = {'created': 0, 'updated': 0, 'errors': []}

        for order_data in orders_data:
            try:
                # Get client
                client_name = order_data.get('client_name', '').strip()
                if not client_name:
                    continue

                if not dry_run:
                    try:
                        client = Client.objects.get(name=client_name)
                    except Client.DoesNotExist:
                        # Create client if doesn't exist
                        client = Client.objects.create(
                            name=client_name,
                            city=order_data.get('client_city', ''),
                            postal_code=order_data.get('client_postal_code', ''),
                            country=order_data.get('client_country', 'Canada'),
                            is_active=True
                        )
                        stats['errors'].append(f"Created missing client: {client_name}")

                # Extract order data
                client_order_number = order_data.get('order_number', '').strip()
                if not client_order_number:
                    continue

                expedition_number = order_data.get('expedition_number', '').strip()
                if not expedition_number:
                    expedition_number = f"EXP-{order_data.get('order_id', '')}"

                product_name = order_data.get('product_name', '').strip()

                # Parse dates
                sales_order_creation_date = self._parse_alix_date(
                    order_data.get('order_date')
                )
                if not sales_order_creation_date:
                    stats['errors'].append(
                        f"Order {client_order_number}: Missing order_date"
                    )
                    continue

                promised_expedition_date = self._parse_alix_date(
                    order_data.get('promised_date')
                )
                actual_expedition_date = self._parse_alix_date(
                    order_data.get('delivery_date')
                )

                # Parse quantities
                total_amount_ordered_tm = Decimal(str(order_data.get('quantity_ordered', 0)))
                total_amount_delivered_tm = Decimal(str(order_data.get('quantity_delivered', 0)))

                # Determine status
                if actual_expedition_date:
                    status = 'delivered'
                elif order_data.get('status') == 'cancelled':
                    status = 'cancelled'
                else:
                    status = 'pending'

                if not dry_run:
                    order, created = Order.objects.update_or_create(
                        client_order_number=client_order_number,
                        expedition_number=expedition_number,
                        defaults={
                            'client': client,
                            'product_name': product_name,
                            'sales_order_creation_date': sales_order_creation_date,
                            'promised_expedition_date': promised_expedition_date,
                            'actual_expedition_date': actual_expedition_date,
                            'total_amount_ordered_tm': total_amount_ordered_tm,
                            'total_amount_delivered_tm': total_amount_delivered_tm,
                            'status': status
                        }
                    )

                    if created:
                        stats['created'] += 1
                    else:
                        stats['updated'] += 1
                else:
                    stats['created'] += 1

            except Exception as e:
                stats['errors'].append(
                    f"Order '{order_data.get('order_number')}': {str(e)}"
                )

        return stats

    def _parse_alix_date(self, date_value):
        """Parse date from ALIX API format"""
        if not date_value:
            return None

        if isinstance(date_value, datetime):
            if timezone.is_naive(date_value):
                return timezone.make_aware(date_value, timezone.get_current_timezone())
            return date_value

        if isinstance(date_value, str):
            # Try ISO format first (most common in APIs)
            try:
                dt = datetime.fromisoformat(date_value.replace('Z', '+00:00'))
                if timezone.is_naive(dt):
                    return timezone.make_aware(dt, timezone.get_current_timezone())
                return dt
            except Exception:
                pass

            # Try other formats
            for fmt in ['%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%d/%m/%Y']:
                try:
                    dt = datetime.strptime(date_value, fmt)
                    return timezone.make_aware(dt, timezone.get_current_timezone())
                except ValueError:
                    continue

        return None


class AlixAPIClient:
    """
    Client for ALIX ERP API

    IMPORTANT: This is a template. You need to:
    1. Get actual API documentation from ALIX
    2. Update the endpoints and authentication
    3. Set environment variables for credentials
    """

    def __init__(self):
        import os

        # Get configuration from environment variables
        self.api_url = os.getenv('ALIX_API_URL', '')  # e.g., 'https://api.alix.com/v1'
        self.api_key = os.getenv('ALIX_API_KEY', '')
        self.company_id = os.getenv('ALIX_COMPANY_ID', '')

        self.session = requests.Session()

        # Set up authentication headers
        # ADJUST THIS based on actual ALIX API authentication method
        self.session.headers.update({
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
            'X-Company-ID': self.company_id
        })

    def is_configured(self):
        """Check if API is properly configured"""
        return bool(self.api_url and self.api_key and self.company_id)

    def get_clients(self, since=None, max_retries=3):
        """
        Fetch clients/customers from ALIX with retry logic

        ADJUST THIS based on actual ALIX API endpoints
        """
        endpoint = f'{self.api_url}/customers'

        params = {}
        if since:
            params['modified_since'] = since.isoformat()

        for attempt in range(max_retries):
            try:
                response = self.session.get(endpoint, params=params, timeout=30)
                response.raise_for_status()

                data = response.json()

                # Transform ALIX response to expected format
                # ADJUST THIS based on actual ALIX response structure
                clients = []
                for customer in data.get('customers', []):
                    clients.append({
                        'name': customer.get('name'),
                        'customer_id': customer.get('id'),
                        'city': customer.get('address', {}).get('city', ''),
                        'postal_code': customer.get('address', {}).get('postal_code', ''),
                        'country': customer.get('address', {}).get('country', 'Canada'),
                    })

                return clients

            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 5  # Exponential backoff: 5, 10, 15 seconds
                    print(f"⚠️  Attempt {attempt + 1} failed: {str(e)}")
                    print(f"   Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                else:
                    raise Exception(f"Failed to fetch clients from ALIX after {max_retries} attempts: {str(e)}")

    def get_orders(self, since=None, max_retries=3):
        """
        Fetch sales orders from ALIX with retry logic

        ADJUST THIS based on actual ALIX API endpoints
        """
        endpoint = f'{self.api_url}/sales_orders'

        params = {}
        if since:
            params['created_since'] = since.isoformat()

        for attempt in range(max_retries):
            try:
                response = self.session.get(endpoint, params=params, timeout=30)
                response.raise_for_status()

                data = response.json()

                # Transform ALIX response to expected format
                # ADJUST THIS based on actual ALIX response structure
                orders = []
                for order in data.get('orders', []):
                    # Handle batches/expeditions
                    for expedition in order.get('expeditions', []):
                        orders.append({
                            'order_id': order.get('id'),
                            'order_number': order.get('order_number'),
                            'expedition_number': expedition.get('expedition_number'),
                            'client_name': order.get('customer', {}).get('name'),
                            'client_city': order.get('customer', {}).get('address', {}).get('city', ''),
                            'client_postal_code': order.get('customer', {}).get('address', {}).get('postal_code', ''),
                            'client_country': order.get('customer', {}).get('address', {}).get('country', 'Canada'),
                            'product_name': expedition.get('product_name'),
                            'order_date': order.get('created_at'),
                            'promised_date': expedition.get('promised_delivery_date'),
                            'delivery_date': expedition.get('actual_delivery_date'),
                            'quantity_ordered': expedition.get('quantity_ordered'),
                            'quantity_delivered': expedition.get('quantity_delivered'),
                            'status': expedition.get('status'),
                        })

                return orders

            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 5  # Exponential backoff: 5, 10, 15 seconds
                    print(f"⚠️  Attempt {attempt + 1} failed: {str(e)}")
                    print(f"   Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                else:
                    raise Exception(f"Failed to fetch orders from ALIX after {max_retries} attempts: {str(e)}")

    def test_connection(self):
        """Test connection to ALIX API"""
        try:
            # ADJUST THIS to actual ALIX health check endpoint
            response = self.session.get(f'{self.api_url}/health', timeout=10)
            return response.status_code == 200
        except Exception:
            return False
