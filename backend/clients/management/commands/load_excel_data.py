"""
Django management command to load historical data from Excel file
Cleans and imports data into Client and Order models
"""

import pandas as pd
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from decimal import Decimal
from datetime import datetime
from clients.models import Client, Order
import os


class Command(BaseCommand):
    help = 'Load historical data from Excel file into database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default='ml_training/soya_data_cleaned_2023_onwards.xlsx',
            help='Path to Excel file (relative to project root)',
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing data before loading (WARNING: deletes all clients and orders)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Perform a dry run without saving to database',
        )

    def handle(self, *args, **options):
        file_path = options['file']
        clear_data = options['clear']
        dry_run = options['dry_run']

        self.stdout.write(self.style.HTTP_INFO('='*80))
        self.stdout.write(self.style.HTTP_INFO('EXCEL DATA IMPORT'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        # Build full path
        from django.conf import settings
        full_path = os.path.join(settings.BASE_DIR.parent, file_path)

        if not os.path.exists(full_path):
            self.stdout.write(self.style.ERROR(f'\n[ERROR] File not found: {full_path}'))
            return

        self.stdout.write(f'\nFile: {full_path}')
        self.stdout.write(f'Dry run: {dry_run}')
        self.stdout.write(f'Clear existing data: {clear_data}\n')

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No data will be saved\n'))

        # Clear data if requested
        if clear_data and not dry_run:
            self.stdout.write(self.style.WARNING('\n[WARNING] Clearing existing data...'))
            Order.objects.all().delete()
            Client.objects.all().delete()
            self.stdout.write(self.style.SUCCESS('[SUCCESS] Data cleared\n'))

        # Load Excel file
        self.stdout.write('Loading Excel file...')
        try:
            df = pd.read_excel(full_path)
            self.stdout.write(self.style.SUCCESS(f'[SUCCESS] Loaded {len(df)} rows\n'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'[ERROR] Error loading Excel: {str(e)}'))
            return

        # Display column names
        self.stdout.write('Columns found:')
        for col in df.columns:
            self.stdout.write(f'  - {col}')
        self.stdout.write('')

        # Clean and import data
        stats = self._import_data(df, dry_run)

        # Display results
        self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
        self.stdout.write(self.style.HTTP_INFO('IMPORT RESULTS'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        self.stdout.write(f"\nClients:")
        self.stdout.write(self.style.SUCCESS(f"  [+] Created: {stats['clients_created']}"))
        self.stdout.write(f"  [i] Existing: {stats['clients_existing']}")

        self.stdout.write(f"\nOrders:")
        self.stdout.write(self.style.SUCCESS(f"  [+] Created: {stats['orders_created']}"))
        self.stdout.write(f"  [i] Existing: {stats['orders_existing']}")
        self.stdout.write(self.style.WARNING(f"  [-] Skipped: {stats['orders_skipped']}"))

        if stats['errors']:
            self.stdout.write(f"\n{self.style.ERROR('Errors:')}")
            for error in stats['errors'][:10]:  # Show first 10 errors
                self.stdout.write(f"  [!] {error}")
            if len(stats['errors']) > 10:
                self.stdout.write(f"  ... and {len(stats['errors']) - 10} more errors")

        self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN COMPLETE - No data was saved'))
        else:
            self.stdout.write(self.style.SUCCESS('[SUCCESS] IMPORT COMPLETE'))
        self.stdout.write(self.style.HTTP_INFO('='*80 + '\n'))

    def _import_data(self, df, dry_run=False):
        """Import data from DataFrame into database"""

        stats = {
            'clients_created': 0,
            'clients_existing': 0,
            'orders_created': 0,
            'orders_existing': 0,
            'orders_skipped': 0,
            'errors': []
        }

        # Expected Excel columns (adjust based on actual Excel file)
        # Based on the field names mentioned: city_client, postal_code_client, country_client
        column_mapping = {
            'client_name': 'client_name',
            'city_client': 'city',
            'postal_code_client': 'postal_code',
            'country_client': 'country',
            'client_order_number': 'client_order_number',
            'expedition_number': 'expedition_number',
            'product_name': 'product_name',
            'sales_order_creation_date': 'sales_order_creation_date',
            'total_amount_ordered_tm': 'total_amount_ordered_tm',
            'total_amount_delivered_tm': 'total_amount_delivered_tm',
            'promised_expedition_date': 'promised_expedition_date',
            'actual_expedition_date': 'actual_expedition_date',
        }

        self.stdout.write(f'\nProcessing {len(df)} rows...\n')

        # Track unique clients
        clients_cache = {}

        for idx, row in df.iterrows():
            if idx % 100 == 0:
                self.stdout.write(f'  Processing row {idx + 1}/{len(df)}...')

            try:
                # Extract client data
                client_name = str(row.get('client_name', '')).strip()
                if not client_name or client_name == 'nan':
                    stats['orders_skipped'] += 1
                    continue

                city = str(row.get('city_client', '')).strip()
                if city == 'nan':
                    city = ''

                postal_code = str(row.get('postal_code_client', '')).strip()
                if postal_code == 'nan':
                    postal_code = ''

                country = str(row.get('country_client', 'Canada')).strip()
                if country == 'nan':
                    country = 'Canada'

                # Get or create client
                client_key = client_name.lower()

                if client_key in clients_cache:
                    client = clients_cache[client_key]
                    stats['clients_existing'] += 1
                else:
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

                        if not created:
                            # Update address if it changed
                            if client.city != city or client.postal_code != postal_code or client.country != country:
                                client.city = city
                                client.postal_code = postal_code
                                client.country = country
                                client.save()

                        clients_cache[client_key] = client

                        if created:
                            stats['clients_created'] += 1
                        else:
                            stats['clients_existing'] += 1
                    else:
                        # Dry run - create dummy client
                        from types import SimpleNamespace
                        client = SimpleNamespace(id=idx, name=client_name)
                        clients_cache[client_key] = client
                        stats['clients_created'] += 1

                # Extract order data
                client_order_number = str(row.get('client_order_number', '')).strip()
                if not client_order_number or client_order_number == 'nan':
                    stats['orders_skipped'] += 1
                    continue

                expedition_number = str(row.get('expedition_number', '')).strip()
                if expedition_number == 'nan':
                    expedition_number = f'EXP-{idx}'

                product_name = str(row.get('product_name', '')).strip()
                if product_name == 'nan':
                    product_name = ''

                # Parse dates
                sales_order_creation_date = self._parse_date(row.get('sales_order_creation_date'))
                if not sales_order_creation_date:
                    stats['orders_skipped'] += 1
                    stats['errors'].append(f"Row {idx + 1}: Missing sales_order_creation_date for order {client_order_number}")
                    continue

                promised_expedition_date = self._parse_date(row.get('promised_expedition_date'))
                actual_expedition_date = self._parse_date(row.get('actual_expedition_date'))

                # Parse quantities
                try:
                    total_amount_ordered_tm = Decimal(str(row.get('total_amount_ordered_tm', 0)))
                    total_amount_delivered_tm = Decimal(str(row.get('total_amount_delivered_tm', 0)))
                except (ValueError, TypeError):
                    stats['orders_skipped'] += 1
                    stats['errors'].append(f"Row {idx + 1}: Invalid quantity values")
                    continue

                # Determine status
                if actual_expedition_date:
                    status = 'delivered'
                else:
                    status = 'pending'

                if not dry_run:
                    # Create or update order
                    order, created = Order.objects.get_or_create(
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
                        stats['orders_created'] += 1
                    else:
                        stats['orders_existing'] += 1
                else:
                    stats['orders_created'] += 1

            except Exception as e:
                stats['errors'].append(f"Row {idx + 1}: {str(e)}")
                continue

        return stats

    def _parse_date(self, date_value):
        """Parse date from various formats"""
        if pd.isna(date_value):
            return None

        if isinstance(date_value, datetime):
            return timezone.make_aware(date_value, timezone.get_current_timezone())

        if isinstance(date_value, str):
            try:
                # Try common date formats
                for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%Y-%m-%d %H:%M:%S']:
                    try:
                        dt = datetime.strptime(date_value, fmt)
                        return timezone.make_aware(dt, timezone.get_current_timezone())
                    except ValueError:
                        continue
            except Exception:
                pass

        return None
