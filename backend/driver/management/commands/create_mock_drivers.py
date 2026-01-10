"""
Django management command to create mock drivers and vehicles for testing
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from driver.models import Driver, Vehicle
from decimal import Decimal


class Command(BaseCommand):
    help = 'Create mock drivers and vehicles for testing purposes'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing mock drivers and vehicles before creating new ones',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.HTTP_INFO('='*80))
        self.stdout.write(self.style.HTTP_INFO('CREATING MOCK DRIVERS & VEHICLES'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        # Clear existing mock data if requested
        if options['clear']:
            self.stdout.write('\nClearing existing mock data...')
            mock_drivers = Driver.objects.filter(staff_id__startswith='MOCK-')
            mock_vehicles = Vehicle.objects.filter(vehicle_number__startswith='MOCK-')

            driver_count = mock_drivers.count()
            vehicle_count = mock_vehicles.count()

            mock_drivers.delete()
            mock_vehicles.delete()

            self.stdout.write(self.style.SUCCESS(f'✓ Deleted {driver_count} mock drivers and {vehicle_count} mock vehicles'))

        # Create mock vehicles
        self.stdout.write('\n📦 Creating mock vehicles...')

        vehicles_data = [
            {
                'vehicle_number': 'MOCK-TRUCK-001',
                'vehicle_type': 'bulk_truck',
                'capacity_tonnes': Decimal('25.00'),
                'make_model': 'Freightliner Cascadia',
                'year': 2022,
                'license_plate': 'TEST-001',
                'status': 'active'
            },
            {
                'vehicle_number': 'MOCK-TRUCK-002',
                'vehicle_type': 'tank_oil',
                'capacity_tonnes': Decimal('30.00'),
                'make_model': 'Peterbilt 579',
                'year': 2021,
                'license_plate': 'TEST-002',
                'status': 'active'
            },
            {
                'vehicle_number': 'MOCK-TRUCK-003',
                'vehicle_type': 'box_truck',
                'capacity_tonnes': Decimal('15.00'),
                'make_model': 'International LT Series',
                'year': 2023,
                'license_plate': 'TEST-003',
                'status': 'active'
            },
        ]

        created_vehicles = []
        for vehicle_data in vehicles_data:
            vehicle, created = Vehicle.objects.get_or_create(
                vehicle_number=vehicle_data['vehicle_number'],
                defaults=vehicle_data
            )
            created_vehicles.append(vehicle)
            if created:
                self.stdout.write(self.style.SUCCESS(f'  ✓ Created vehicle: {vehicle.vehicle_number} ({vehicle.get_vehicle_type_display()})'))
            else:
                self.stdout.write(self.style.WARNING(f'  ⚠ Vehicle already exists: {vehicle.vehicle_number}'))

        # Create mock drivers
        self.stdout.write('\n👤 Creating mock drivers...')

        drivers_data = [
            {
                'staff_id': 'MOCK-DRV-001',
                'full_name': 'Emmanuel Kwofie',
                'email': 'amankrahkwofie354@gmail.com',
                'phone_number': '+15149619754',
                'license_number': 'MOCK-LIC-001',
                'vehicle': created_vehicles[0],  # Assign bulk truck
            },
            {
                'staff_id': 'MOCK-DRV-002',
                'full_name': 'Joël Mongeon',
                'email': 'joel.mongeon@mail.mcgill.ca',
                'phone_number': '+17055617381',
                'license_number': 'MOCK-LIC-002',
                'vehicle': created_vehicles[1],  # Assign tank oil
            },
            {
                'staff_id': 'MOCK-DRV-003',
                'full_name': 'Raphael Aidoo',
                'email': 'raphael.aidoo@mail.mcgill.ca',
                'phone_number': '+15146380643',
                'license_number': 'MOCK-LIC-003',
                'vehicle': created_vehicles[2],  # Assign box truck
            },
        ]

        for driver_data in drivers_data:
            # Create or get user account
            email = driver_data.pop('email')
            username = email.split('@')[0]
            assigned_vehicle = driver_data.pop('vehicle')

            user, user_created = User.objects.get_or_create(
                username=username,
                defaults={
                    'email': email,
                    'first_name': driver_data['full_name'].split()[0],
                    'last_name': ' '.join(driver_data['full_name'].split()[1:]),
                }
            )

            # Create driver profile
            driver, created = Driver.objects.get_or_create(
                staff_id=driver_data['staff_id'],
                defaults={
                    **driver_data,
                    'user': user,
                    'assigned_vehicle': assigned_vehicle,
                    'can_drive_vehicle_types': ['bulk_truck', 'tank_oil', 'box_truck'],
                    'is_available': True,
                }
            )

            if created:
                self.stdout.write(self.style.SUCCESS(f'  ✓ Created driver: {driver.full_name} ({driver.staff_id})'))
                self.stdout.write(f'    📧 Email: {email}')
                self.stdout.write(f'    📱 Phone: {driver.phone_number}')
                self.stdout.write(f'    🚚 Vehicle: {assigned_vehicle.vehicle_number}')
            else:
                self.stdout.write(self.style.WARNING(f'  ⚠ Driver already exists: {driver.full_name}'))

        # Summary
        self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
        self.stdout.write(self.style.SUCCESS('✅ MOCK DATA CREATION COMPLETE'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        total_drivers = Driver.objects.filter(staff_id__startswith='MOCK-').count()
        total_vehicles = Vehicle.objects.filter(vehicle_number__startswith='MOCK-').count()

        self.stdout.write(f'\n📊 Summary:')
        self.stdout.write(f'   • Mock Drivers: {total_drivers}')
        self.stdout.write(f'   • Mock Vehicles: {total_vehicles}')
        self.stdout.write(f'\n💡 Note: All mock data is prefixed with "MOCK-" for easy identification')
        self.stdout.write(f'   Run with --clear to remove all mock data\n')
