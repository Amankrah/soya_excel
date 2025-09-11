"""
Management command to validate farmer addresses using Google Maps API.
This command will check address validity and suggest corrections.

Usage:
    python manage.py validate_addresses [--fix-invalid] [--province QC]
"""

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import transaction
from clients.models import Farmer
from route.services import GoogleMapsService
import time
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Validate farmer addresses using Google Maps API and suggest corrections'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix-invalid',
            action='store_true',
            help='Automatically update addresses with corrected versions from Google',
        )
        parser.add_argument(
            '--province',
            type=str,
            help='Only validate farmers from specific province (QC, ON, NB, BC, USD, SPAIN)',
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
            queryset = Farmer.objects.filter(is_active=True)
            
            if options['province']:
                queryset = queryset.filter(province=options['province'])
            
            if options['only_missing_coords']:
                queryset = queryset.filter(
                    latitude__isnull=True
                ).union(
                    queryset.filter(longitude__isnull=True)
                )
            
            # Apply limit
            if options['limit']:
                queryset = queryset[:options['limit']]
            
            farmers_to_validate = list(queryset)
            total_farmers = len(farmers_to_validate)

            if total_farmers == 0:
                self.stdout.write(
                    self.style.WARNING('No farmers found to validate with current criteria')
                )
                return

            self.stdout.write(
                self.style.SUCCESS(f'Validating {total_farmers} farmer addresses...')
            )

            # Validation results
            valid_addresses = 0
            invalid_addresses = 0
            corrected_addresses = 0
            problematic_addresses = []

            for index, farmer in enumerate(farmers_to_validate, 1):
                self.stdout.write(
                    f'\nProcessing {index}/{total_farmers}: {farmer.name}'
                )
                self.stdout.write(f'Current address: {farmer.address}')

                try:
                    # Choose appropriate validation method based on farmer's province
                    if farmer.province in ['USD', 'SPAIN']:
                        # Use international validation for non-Canadian farmers
                        validation_result = maps_service.validate_international_address(
                            farmer.address, 
                            farmer.province
                        )
                    else:
                        # Use Canadian validation for Canadian farmers
                        validation_result = maps_service.validate_canadian_address(farmer.address)

                    if validation_result['is_valid']:
                        formatted_address = validation_result['formatted_address']
                        
                        # Check if the formatted address is significantly different
                        is_different = self._addresses_significantly_different(
                            farmer.address, 
                            formatted_address
                        )

                        if is_different:
                            self.stdout.write(
                                self.style.WARNING(
                                    f'  Address can be improved:'
                                )
                            )
                            self.stdout.write(f'  Current:   {farmer.address}')
                            self.stdout.write(f'  Suggested: {formatted_address}')

                            if options['fix_invalid']:
                                # Update address with corrected version
                                with transaction.atomic():
                                    farmer.address = formatted_address
                                    farmer.latitude = validation_result['latitude']
                                    farmer.longitude = validation_result['longitude']
                                    farmer.save(update_fields=['address', 'latitude', 'longitude'])
                                
                                self.stdout.write(
                                    self.style.SUCCESS('  ✓ Address updated automatically')
                                )
                                corrected_addresses += 1
                            else:
                                problematic_addresses.append({
                                    'farmer': farmer,
                                    'current': farmer.address,
                                    'suggested': formatted_address,
                                    'reason': 'Address format can be improved'
                                })
                        else:
                            # Address is valid and properly formatted
                            if not farmer.latitude or not farmer.longitude:
                                # Update coordinates
                                with transaction.atomic():
                                    farmer.latitude = validation_result['latitude']
                                    farmer.longitude = validation_result['longitude']
                                    farmer.save(update_fields=['latitude', 'longitude'])
                                
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
                            'farmer': farmer,
                            'current': farmer.address,
                            'suggested': None,
                            'reason': error_msg
                        })

                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f'  ✗ Error validating address: {str(e)}')
                    )
                    invalid_addresses += 1
                    problematic_addresses.append({
                        'farmer': farmer,
                        'current': farmer.address,
                        'suggested': None,
                        'reason': f'Validation error: {str(e)}'
                    })

                # Rate limiting delay
                if options['delay'] and index < total_farmers:
                    time.sleep(options['delay'])

            # Print validation summary
            self.stdout.write('\n' + '='*60)
            self.stdout.write('ADDRESS VALIDATION SUMMARY')
            self.stdout.write('='*60)
            self.stdout.write(f'Total addresses validated: {total_farmers}')
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
                    self.stdout.write(f'\nFarmer: {item["farmer"].name}')
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
                self.stdout.write('2. Add postal codes to improve geocoding accuracy')
                self.stdout.write('3. Ensure addresses include city and province')
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
        This helps decide whether to suggest the formatted version.
        """
        # Normalize both addresses for comparison
        orig_norm = self._normalize_address(original)
        form_norm = self._normalize_address(formatted)
        
        # If they're essentially the same after normalization, not significantly different
        if orig_norm == form_norm:
            return False
        
        # Check if the formatted version adds significant information
        # (like postal code, proper formatting, etc.)
        orig_words = set(orig_norm.split())
        form_words = set(form_norm.split())
        
        # If formatted version has significantly more words, it's an improvement
        if len(form_words) > len(orig_words) * 1.2:
            return True
        
        # If there are key differences in important components
        important_additions = [
            'canada', 'qc', 'quebec', 'ontario', 'on', 'nb', 'new brunswick', 'bc', 'british columbia'
        ]
        
        for addition in important_additions:
            if addition in form_norm and addition not in orig_norm:
                return True
        
        # Check for postal code patterns
        import re
        postal_pattern = r'[a-z]\d[a-z]\s?\d[a-z]\d'
        
        orig_has_postal = bool(re.search(postal_pattern, orig_norm))
        form_has_postal = bool(re.search(postal_pattern, form_norm))
        
        if form_has_postal and not orig_has_postal:
            return True
        
        return False

    def _normalize_address(self, address):
        """Normalize address for comparison"""
        import re
        
        # Convert to lowercase
        normalized = address.lower()
        
        # Remove extra whitespace
        normalized = ' '.join(normalized.split())
        
        # Remove common punctuation
        normalized = re.sub(r'[,\.\-#]', ' ', normalized)
        
        # Remove extra spaces
        normalized = ' '.join(normalized.split())
        
        return normalized.strip()
