"""
Management command to geocode client addresses using Google Maps API.
This command processes clients with missing coordinates or optionally re-geocodes all addresses.

Usage:
    python manage.py geocode_client_addresses [--force] [--country Canada] [--limit 100]
"""

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import transaction
from django.db import models
from clients.models import Client
from route.services import GoogleMapsService
import time
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Geocode client addresses using Google Maps API'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Re-geocode all addresses, even those that already have coordinates',
        )
        parser.add_argument(
            '--country',
            type=str,
            help='Only geocode clients from specific country (Canada, USD, SPAIN)',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=100,
            help='Maximum number of addresses to process (default: 100)',
        )
        parser.add_argument(
            '--delay',
            type=float,
            default=0.1,
            help='Delay between requests in seconds to avoid rate limiting (default: 0.1)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be processed without making changes',
        )
        parser.add_argument(
            '--async',
            action='store_true',
            dest='use_async',
            help='Use async batch geocoding for better performance',
        )

    def handle(self, *args, **options):
        try:
            # Check if Google Maps API is configured
            if not hasattr(settings, 'GOOGLE_MAPS_API_KEY') or not settings.GOOGLE_MAPS_API_KEY:
                raise CommandError('Google Maps API key is not configured in settings')

            if settings.GOOGLE_MAPS_API_KEY == 'YOUR_GOOGLE_MAPS_API_KEY_HERE':
                raise CommandError('Please set a valid Google Maps API key in settings')

            # Build query for clients to process
            queryset = Client.objects.filter(is_active=True)

            if options['country']:
                queryset = queryset.filter(country=options['country'])

            if not options['force']:
                # Only process clients without coordinates
                queryset = queryset.filter(
                    models.Q(latitude__isnull=True) | models.Q(longitude__isnull=True)
                )

            # Apply limit
            if options['limit']:
                queryset = queryset[:options['limit']]

            clients_to_process = list(queryset)
            total_clients = len(clients_to_process)

            if total_clients == 0:
                self.stdout.write(
                    self.style.WARNING('No clients found to process with current criteria')
                )
                return

            self.stdout.write(
                self.style.SUCCESS(f'Found {total_clients} clients to process')
            )

            if options['dry_run']:
                self.stdout.write(self.style.WARNING('DRY RUN - No changes will be made'))
                for client in clients_to_process:
                    address_str = f"{client.city}, {client.postal_code}, {client.country}"
                    self.stdout.write(f'Would geocode: {client.name} - {address_str}')
                return

            # Use async batch processing if requested
            if options['use_async']:
                self._process_async(clients_to_process)
            else:
                self._process_sync(clients_to_process, options)

        except CommandError:
            raise
        except Exception as e:
            raise CommandError(f'Unexpected error: {str(e)}')

    def _process_sync(self, clients_to_process, options):
        """Process clients synchronously (traditional method)"""
        try:
            # Initialize the Google Maps service
            maps_service = GoogleMapsService()
        except ValueError as e:
            raise CommandError(f'Error initializing Google Maps service: {e}')

        # Process clients
        successful_geocodes = 0
        failed_geocodes = 0
        skipped_geocodes = 0
        total_clients = len(clients_to_process)

        for index, client in enumerate(clients_to_process, 1):
            self.stdout.write(
                f'Processing {index}/{total_clients}: {client.name}'
            )

            try:
                # Check if client has valid address data
                if not client.city and not client.postal_code:
                    self.stdout.write(
                        self.style.WARNING(f'  Skipping {client.name} - No address data')
                    )
                    skipped_geocodes += 1
                    continue

                # Build address string
                address_str = f"{client.city}, {client.postal_code}, {client.country}"

                # Geocode the address
                geocode_result = maps_service.geocode_address(address_str)

                if geocode_result:
                    with transaction.atomic():
                        # Update client coordinates
                        client.latitude = geocode_result['latitude']
                        client.longitude = geocode_result['longitude']
                        client.save(update_fields=['latitude', 'longitude'])

                    self.stdout.write(
                        self.style.SUCCESS(
                            f'  ✓ Geocoded: {geocode_result["formatted_address"]}'
                        )
                    )
                    successful_geocodes += 1
                else:
                    self.stdout.write(
                        self.style.ERROR(
                            f'  ✗ Failed to geocode: {address_str}'
                        )
                    )
                    failed_geocodes += 1

            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(
                        f'  ✗ Error processing {client.name}: {str(e)}'
                    )
                )
                failed_geocodes += 1

            # Add delay to avoid rate limiting
            if options['delay'] and index < total_clients:
                time.sleep(options['delay'])

        # Print summary
        self._print_summary(total_clients, successful_geocodes, failed_geocodes, skipped_geocodes)

    def _process_async(self, clients_to_process):
        """Process clients using async batch geocoding"""
        from asgiref.sync import async_to_sync
        from route.services_async import geocode_clients_batch

        self.stdout.write(self.style.SUCCESS('Using async batch geocoding for better performance'))

        client_ids = [c.id for c in clients_to_process]

        try:
            results = async_to_sync(geocode_clients_batch)(client_ids)

            successful_geocodes = sum(1 for r in results if r['success'])
            failed_geocodes = len(results) - successful_geocodes

            for result in results:
                client = next(c for c in clients_to_process if c.id == result['client_id'])
                if result['success']:
                    geocode_data = result['geocode_result']
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'  ✓ {client.name}: {geocode_data["formatted_address"]}'
                        )
                    )
                else:
                    self.stdout.write(
                        self.style.ERROR(f'  ✗ {client.name}: Failed to geocode')
                    )

            self._print_summary(len(clients_to_process), successful_geocodes, failed_geocodes, 0)

        except Exception as e:
            raise CommandError(f'Error in async geocoding: {str(e)}')

    def _print_summary(self, total, successful, failed, skipped):
        """Print geocoding summary"""
        self.stdout.write('\n' + '='*50)
        self.stdout.write('GEOCODING SUMMARY')
        self.stdout.write('='*50)
        self.stdout.write(f'Total clients processed: {total}')
        self.stdout.write(
            self.style.SUCCESS(f'Successful geocodes: {successful}')
        )
        self.stdout.write(
            self.style.ERROR(f'Failed geocodes: {failed}')
        )
        if skipped > 0:
            self.stdout.write(
                self.style.WARNING(f'Skipped (no address): {skipped}')
            )

        success_rate = (successful / total * 100) if total > 0 else 0
        self.stdout.write(f'Success rate: {success_rate:.1f}%')

        # Provide recommendations
        if failed > 0:
            self.stdout.write('\n' + self.style.WARNING('RECOMMENDATIONS:'))
            self.stdout.write('- Review failed addresses for typos or formatting issues')
            self.stdout.write('- Ensure addresses include city and postal code')
            self.stdout.write('- Check country field is correctly set')
            self.stdout.write('- Consider using --async flag for better performance')

        self.stdout.write('\n' + self.style.SUCCESS('Geocoding completed!'))
