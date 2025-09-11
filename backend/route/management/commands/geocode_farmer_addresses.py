"""
Management command to geocode farmer addresses using Google Maps API.
This command will process all farmers with missing coordinates or
optionally re-geocode all addresses.

Usage:
    python manage.py geocode_farmer_addresses [--force] [--province QC] [--limit 100]
"""

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import transaction
from django.db import models
from clients.models import Farmer
from route.services import GoogleMapsService
import time
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Geocode farmer addresses using Google Maps API'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Re-geocode all addresses, even those that already have coordinates',
        )
        parser.add_argument(
            '--province',
            type=str,
            help='Only geocode farmers from specific province (QC, ON, NB, BC, USD, SPAIN)',
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

    def handle(self, *args, **options):
        try:
            # Check if Google Maps API is configured
            if not hasattr(settings, 'GOOGLE_MAPS_API_KEY') or not settings.GOOGLE_MAPS_API_KEY:
                raise CommandError('Google Maps API key is not configured in settings')
            
            if settings.GOOGLE_MAPS_API_KEY == 'YOUR_GOOGLE_MAPS_API_KEY_HERE':
                raise CommandError('Please set a valid Google Maps API key in settings')

            # Initialize the Google Maps service
            try:
                maps_service = GoogleMapsService()
            except ValueError as e:
                raise CommandError(f'Error initializing Google Maps service: {e}')

            # Build query for farmers to process
            queryset = Farmer.objects.filter(is_active=True)
            
            if options['province']:
                queryset = queryset.filter(province=options['province'])
            
            if not options['force']:
                # Only process farmers without coordinates
                queryset = queryset.filter(
                    models.Q(latitude__isnull=True) | models.Q(longitude__isnull=True)
                )
            
            # Apply limit
            if options['limit']:
                queryset = queryset[:options['limit']]
            
            farmers_to_process = list(queryset)
            total_farmers = len(farmers_to_process)

            if total_farmers == 0:
                self.stdout.write(
                    self.style.WARNING('No farmers found to process with current criteria')
                )
                return

            self.stdout.write(
                self.style.SUCCESS(f'Found {total_farmers} farmers to process')
            )

            if options['dry_run']:
                self.stdout.write(self.style.WARNING('DRY RUN - No changes will be made'))
                for farmer in farmers_to_process:
                    self.stdout.write(f'Would geocode: {farmer.name} - {farmer.address}')
                return

            # Process farmers
            successful_geocodes = 0
            failed_geocodes = 0
            skipped_geocodes = 0

            for index, farmer in enumerate(farmers_to_process, 1):
                self.stdout.write(
                    f'Processing {index}/{total_farmers}: {farmer.name}'
                )

                try:
                    # Check if farmer has a valid address
                    if not farmer.address or farmer.address.strip() == '':
                        self.stdout.write(
                            self.style.WARNING(f'  Skipping {farmer.name} - No address')
                        )
                        skipped_geocodes += 1
                        continue

                    # Geocode the address
                    geocode_result = maps_service.geocode_address(
                        farmer.address, 
                        farmer.province
                    )

                    if geocode_result:
                        with transaction.atomic():
                            # Update farmer coordinates
                            farmer.latitude = geocode_result['latitude']
                            farmer.longitude = geocode_result['longitude']
                            farmer.save(update_fields=['latitude', 'longitude'])

                        self.stdout.write(
                            self.style.SUCCESS(
                                f'  ✓ Geocoded: {geocode_result["formatted_address"]}'
                            )
                        )
                        successful_geocodes += 1
                    else:
                        self.stdout.write(
                            self.style.ERROR(
                                f'  ✗ Failed to geocode: {farmer.address}'
                            )
                        )
                        failed_geocodes += 1

                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(
                            f'  ✗ Error processing {farmer.name}: {str(e)}'
                        )
                    )
                    failed_geocodes += 1

                # Add delay to avoid rate limiting
                if options['delay'] and index < total_farmers:
                    time.sleep(options['delay'])

            # Print summary
            self.stdout.write('\n' + '='*50)
            self.stdout.write('GEOCODING SUMMARY')
            self.stdout.write('='*50)
            self.stdout.write(f'Total farmers processed: {total_farmers}')
            self.stdout.write(
                self.style.SUCCESS(f'Successful geocodes: {successful_geocodes}')
            )
            self.stdout.write(
                self.style.ERROR(f'Failed geocodes: {failed_geocodes}')
            )
            self.stdout.write(
                self.style.WARNING(f'Skipped (no address): {skipped_geocodes}')
            )
            
            success_rate = (successful_geocodes / total_farmers * 100) if total_farmers > 0 else 0
            self.stdout.write(f'Success rate: {success_rate:.1f}%')

            # Provide recommendations based on results
            if failed_geocodes > 0:
                self.stdout.write('\n' + self.style.WARNING('RECOMMENDATIONS:'))
                self.stdout.write('- Review failed addresses for typos or formatting issues')
                self.stdout.write('- Consider using more specific addresses with postal codes')
                self.stdout.write('- Check if addresses are actually in Canada')
                
                # Show farmers that failed (for debugging)
                failed_farmers = []
                for farmer in farmers_to_process:
                    if farmer.latitude is None or farmer.longitude is None:
                        failed_farmers.append(f'{farmer.name}: {farmer.address}')
                
                if failed_farmers and len(failed_farmers) <= 10:
                    self.stdout.write('\nFailed addresses:')
                    for failed in failed_farmers:
                        self.stdout.write(f'  - {failed}')

            self.stdout.write('\n' + self.style.SUCCESS('Geocoding completed!'))

        except CommandError:
            raise
        except Exception as e:
            raise CommandError(f'Unexpected error: {str(e)}')


    def validate_google_maps_setup(self):
        """Validate that Google Maps API is properly set up"""
        try:
            maps_service = GoogleMapsService()
            
            # Test with a simple address
            test_result = maps_service.geocode_address('Montreal, QC, Canada')
            
            if test_result:
                self.stdout.write(
                    self.style.SUCCESS('✓ Google Maps API is working correctly')
                )
                return True
            else:
                self.stdout.write(
                    self.style.ERROR('✗ Google Maps API test failed')
                )
                return False
                
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'✗ Google Maps API error: {str(e)}')
            )
            return False
