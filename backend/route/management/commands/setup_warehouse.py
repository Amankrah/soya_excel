"""
Management command to set up the Soya Excel primary warehouse.
Usage: python manage.py setup_warehouse
"""

from django.core.management.base import BaseCommand
from route.models import Warehouse
from route.services import GoogleMapsService


class Command(BaseCommand):
    help = 'Set up the primary Soya Excel warehouse with geocoding'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Setting up Soya Excel warehouse...'))

        # Warehouse details
        warehouse_data = {
            'name': 'Soya Excel Main Warehouse',
            'code': 'SOYA-01',
            'address': '2457 4e Rang S',
            'city': 'Saint-Charles-sur-Richelieu',
            'province': 'QC',
            'postal_code': 'J0H 2G0',
            'country': 'Canada',
            'capacity_tonnes': 5000.00,
            'current_stock_tonnes': 0.00,
            'is_primary': True,
            'is_active': True,
            'manager_name': '',
            'phone_number': '',
            'email': ''
        }

        # Check if warehouse already exists
        existing_warehouse = Warehouse.objects.filter(code='SOYA-01').first()

        if existing_warehouse:
            self.stdout.write(self.style.WARNING(
                f'Warehouse with code {warehouse_data["code"]} already exists.'
            ))
            self.stdout.write(f'  Name: {existing_warehouse.name}')
            self.stdout.write(f'  Address: {existing_warehouse.full_address}')

            if existing_warehouse.has_coordinates:
                self.stdout.write(f'  Coordinates: {existing_warehouse.latitude}, {existing_warehouse.longitude}')
            else:
                self.stdout.write(self.style.WARNING('  No coordinates - will geocode now'))
                self._geocode_warehouse(existing_warehouse)

            return

        # Create new warehouse
        warehouse = Warehouse.objects.create(**warehouse_data)
        self.stdout.write(self.style.SUCCESS(f'Created warehouse: {warehouse.name}'))
        self.stdout.write(f'  Address: {warehouse.full_address}')

        # Geocode the address
        self._geocode_warehouse(warehouse)

    def _geocode_warehouse(self, warehouse):
        """Geocode warehouse address using Google Maps API"""
        try:
            self.stdout.write('Geocoding warehouse address...')

            maps_service = GoogleMapsService()
            full_address = f"{warehouse.address}, {warehouse.city}, {warehouse.province} {warehouse.postal_code}, {warehouse.country}"

            geocode_result = maps_service.geocode_address(full_address)

            if geocode_result:
                warehouse.latitude = geocode_result['latitude']
                warehouse.longitude = geocode_result['longitude']
                warehouse.has_coordinates = True
                warehouse.save()

                self.stdout.write(self.style.SUCCESS(
                    f'✓ Successfully geocoded warehouse address'
                ))
                self.stdout.write(f'  Coordinates: {warehouse.latitude}, {warehouse.longitude}')
                self.stdout.write(f'  Formatted address: {geocode_result["formatted_address"]}')
            else:
                self.stdout.write(self.style.ERROR(
                    f'✗ Failed to geocode warehouse address: {full_address}'
                ))
                self.stdout.write(self.style.WARNING(
                    'You can manually set coordinates later in the Django admin.'
                ))

        except ValueError as e:
            self.stdout.write(self.style.ERROR(
                f'✗ Google Maps API not configured: {str(e)}'
            ))
            self.stdout.write(self.style.WARNING(
                'Please configure GOOGLE_MAPS_API_KEY in your settings.'
            ))
        except Exception as e:
            self.stdout.write(self.style.ERROR(
                f'✗ Error geocoding warehouse: {str(e)}'
            ))
