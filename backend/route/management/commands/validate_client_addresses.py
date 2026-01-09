"""
Management command to validate client addresses using Google Maps API.
This command checks address validity and suggests corrections.

Usage:
    python manage.py validate_client_addresses [--fix-invalid] [--country Canada]
"""

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import transaction
from clients.models import Client
from route.services import GoogleMapsService
import time
import logging
import re

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Validate client addresses using Google Maps API and suggest corrections'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix-invalid',
            action='store_true',
            help='Automatically update addresses with corrected versions from Google',
        )
        parser.add_argument(
            '--country',
            type=str,
            help='Only validate clients from specific country (Canada, USD, SPAIN)',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=50,
            help='Maximum number of addresses to validate (default: 50)',
        )
        parser.add_argument(
            '--delay',
            type=float,
            default=0.2,
            help='Delay between requests in seconds to avoid rate limiting (default: 0.2)',
        )
        parser.add_argument(
            '--only-missing-coords',
            action='store_true',
            help='Only validate addresses that are missing coordinates',
        )

    def handle(self, *args, **options):
        try:
            # Check Google Maps API configuration
            if not hasattr(settings, 'GOOGLE_MAPS_API_KEY') or not settings.GOOGLE_MAPS_API_KEY:
                raise CommandError('Google Maps API key is not configured in settings')

            if settings.GOOGLE_MAPS_API_KEY == 'YOUR_GOOGLE_MAPS_API_KEY_HERE':
                raise CommandError('Please set a valid Google Maps API key in settings')

            # Initialize service
            try:
                maps_service = GoogleMapsService()
            except ValueError as e:
                raise CommandError(f'Error initializing Google Maps service: {e}')

            # Build query
            queryset = Client.objects.filter(is_active=True)

            if options['country']:
                queryset = queryset.filter(country=options['country'])

            if options['only_missing_coords']:
                queryset = queryset.filter(
                    latitude__isnull=True
                ) | queryset.filter(
                    longitude__isnull=True
                )

            # Apply limit
            if options['limit']:
                queryset = queryset[:options['limit']]

            clients_to_validate = list(queryset)
            total_clients = len(clients_to_validate)

            if total_clients == 0:
                self.stdout.write(
                    self.style.WARNING('No clients found to validate with current criteria')
                )
                return

            self.stdout.write(
                self.style.SUCCESS(f'Validating {total_clients} client addresses...')
            )

            # Validation results
            valid_addresses = 0
            invalid_addresses = 0
            corrected_addresses = 0
            problematic_addresses = []

            for index, client in enumerate(clients_to_validate, 1):
                self.stdout.write(
                    f'\nProcessing {index}/{total_clients}: {client.name}'
                )

                address_str = f"{client.city}, {client.postal_code}, {client.country}"
                self.stdout.write(f'Current address: {address_str}')

                try:
                    # Choose appropriate validation method based on country
                    if client.country in ['USD', 'SPAIN']:
                        # Use international validation for non-Canadian clients
                        validation_result = maps_service.validate_international_address(
                            address_str,
                            client.country
                        )
                    else:
                        # Use Canadian validation for Canadian clients
                        validation_result = maps_service.validate_canadian_address(address_str)

                    if validation_result['is_valid']:
                        formatted_address = validation_result['formatted_address']

                        # Check if the formatted address is significantly different
                        is_different = self._addresses_significantly_different(
                            address_str,
                            formatted_address
                        )

                        if is_different:
                            self.stdout.write(
                                self.style.WARNING(
                                    f'  Address can be improved:'
                                )
                            )
                            self.stdout.write(f'  Current:   {address_str}')
                            self.stdout.write(f'  Suggested: {formatted_address}')

                            if options['fix_invalid']:
                                # Update with geocoded coordinates
                                with transaction.atomic():
                                    client.latitude = validation_result['latitude']
                                    client.longitude = validation_result['longitude']
                                    client.save(update_fields=['latitude', 'longitude'])

                                self.stdout.write(
                                    self.style.SUCCESS('  ✓ Coordinates updated automatically')
                                )
                                corrected_addresses += 1
                            else:
                                problematic_addresses.append({
                                    'client': client,
                                    'current': address_str,
                                    'suggested': formatted_address,
                                    'reason': 'Address format can be improved'
                                })
                        else:
                            # Address is valid and properly formatted
                            if not client.latitude or not client.longitude:
                                # Update coordinates
                                with transaction.atomic():
                                    client.latitude = validation_result['latitude']
                                    client.longitude = validation_result['longitude']
                                    client.save(update_fields=['latitude', 'longitude'])

                                self.stdout.write(
                                    self.style.SUCCESS('  ✓ Coordinates updated')
                                )

                            self.stdout.write(
                                self.style.SUCCESS('  ✓ Address is valid')
                            )

                        valid_addresses += 1

                    else:
                        # Invalid address
                        error_msg = validation_result.get('error', 'Unknown validation error')
                        self.stdout.write(
                            self.style.ERROR(f'  ✗ Invalid address: {error_msg}')
                        )

                        invalid_addresses += 1
                        problematic_addresses.append({
                            'client': client,
                            'current': address_str,
                            'suggested': None,
                            'reason': error_msg
                        })

                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f'  ✗ Error validating address: {str(e)}')
                    )
                    invalid_addresses += 1
                    problematic_addresses.append({
                        'client': client,
                        'current': address_str,
                        'suggested': None,
                        'reason': f'Validation error: {str(e)}'
                    })

                # Rate limiting delay
                if options['delay'] and index < total_clients:
                    time.sleep(options['delay'])

            # Print validation summary
            self.stdout.write('\n' + '='*60)
            self.stdout.write('ADDRESS VALIDATION SUMMARY')
            self.stdout.write('='*60)
            self.stdout.write(f'Total addresses validated: {total_clients}')
            self.stdout.write(
                self.style.SUCCESS(f'Valid addresses: {valid_addresses}')
            )
            self.stdout.write(
                self.style.ERROR(f'Invalid addresses: {invalid_addresses}')
            )

            if options['fix_invalid']:
                self.stdout.write(
                    self.style.SUCCESS(f'Addresses corrected: {corrected_addresses}')
                )

            # Show problematic addresses
            if problematic_addresses:
                self.stdout.write('\n' + self.style.WARNING('PROBLEMATIC ADDRESSES:'))

                for item in problematic_addresses[:20]:  # Show first 20
                    self.stdout.write(f'\nClient: {item["client"].name}')
                    self.stdout.write(f'Current: {item["current"]}')
                    if item['suggested']:
                        self.stdout.write(f'Suggested: {item["suggested"]}')
                    self.stdout.write(f'Issue: {item["reason"]}')

                if len(problematic_addresses) > 20:
                    self.stdout.write(f'\n... and {len(problematic_addresses) - 20} more')

            # Provide recommendations
            if invalid_addresses > 0 or problematic_addresses:
                self.stdout.write('\n' + self.style.WARNING('RECOMMENDATIONS:'))
                self.stdout.write('1. Review problematic addresses manually')
                self.stdout.write('2. Ensure addresses include city and postal code')
                self.stdout.write('3. Verify country field is correctly set')
                self.stdout.write('4. Use --fix-invalid flag to auto-correct formatting')
                self.stdout.write('5. Contact clients to verify problematic addresses')

            self.stdout.write('\n' + self.style.SUCCESS('Address validation completed!'))

        except CommandError:
            raise
        except Exception as e:
            raise CommandError(f'Unexpected error: {str(e)}')

    def _addresses_significantly_different(self, original, formatted):
        """
        Check if two addresses are significantly different.
        """
        # Normalize both addresses for comparison
        orig_norm = self._normalize_address(original)
        form_norm = self._normalize_address(formatted)

        # If they're essentially the same after normalization
        if orig_norm == form_norm:
            return False

        # Check if the formatted version adds significant information
        orig_words = set(orig_norm.split())
        form_words = set(form_norm.split())

        # If formatted version has significantly more words, it's an improvement
        if len(form_words) > len(orig_words) * 1.2:
            return True

        # Check for postal code patterns
        postal_pattern = r'[a-z]\d[a-z]\s?\d[a-z]\d'

        orig_has_postal = bool(re.search(postal_pattern, orig_norm))
        form_has_postal = bool(re.search(postal_pattern, form_norm))

        if form_has_postal and not orig_has_postal:
            return True

        return False

    def _normalize_address(self, address):
        """Normalize address for comparison"""
        # Convert to lowercase
        normalized = address.lower()

        # Remove extra whitespace
        normalized = ' '.join(normalized.split())

        # Remove common punctuation
        normalized = re.sub(r'[,\.\-#]', ' ', normalized)

        # Remove extra spaces
        normalized = ' '.join(normalized.split())

        return normalized.strip()
