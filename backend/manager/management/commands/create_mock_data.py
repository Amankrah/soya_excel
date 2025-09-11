from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import datetime, timedelta
import random
import time
from decimal import Decimal

# Import all the updated models
from manager.models import Manager, SoybeanMealProduct, SupplyInventory, WeeklyDistributionPlan, KPIMetrics
from clients.models import Farmer, FeedStorage, Order
from driver.models import Driver, Vehicle, Delivery, DeliveryItem, DeliveryPerformanceMetrics
from route.models import Route, RouteStop, WeeklyRoutePerformance


class Command(BaseCommand):
    help = 'Creates realistic mock data for Soya Excel operations'
    
    def __init__(self):
        super().__init__()
        # Global counter to ensure unique order numbers
        from clients.models import Order as OrderModel
        existing_count = OrderModel.objects.count()
        self.order_counter = existing_count + 1000  # Start well above existing orders

    def handle(self, *args, **options):
        self.stdout.write('Creating Soya Excel mock data...\n')
        
        # Create users and managers
        managers = self.create_managers()
        
        # Create soybean meal products
        products = self.create_soybean_products()
        
        # Create supply inventory
        self.create_supply_inventory(products)
        
        # Create farmers (clients) with realistic distribution
        farmers = self.create_farmers()
        
        # Create vehicles and drivers
        vehicles, drivers = self.create_vehicles_and_drivers()
        
        # Create realistic orders
        orders = self.create_realistic_orders(farmers, products, managers[0])
        
        # Create weekly distribution plans
        self.create_weekly_plans(managers[0], orders)
        
        # Create routes and deliveries
        routes = self.create_routes_with_kpi_tracking(managers[0].user, farmers, orders, vehicles, drivers)
        
        # Create KPI metrics
        self.create_kpi_metrics()
        
        self.stdout.write(self.style.SUCCESS('\nSoya Excel mock data created successfully!'))
        self.print_summary()

    def create_managers(self):
        """Create Soya Excel managers"""
        managers = []
        
        # Create main manager if not exists
        try:
            user = User.objects.get(username='soya_manager')
            manager = Manager.objects.get(user=user)
            managers.append(manager)
        except (User.DoesNotExist, Manager.DoesNotExist):
            user = User.objects.create_user(
                username='soya_manager',
                password='SoyaExcel_2024',
                email='manager@soyaexcel.com',
                first_name='Pierre',
                last_name='Dubois'
            )
            manager = Manager.objects.create(
                user=user,
                employee_id='SE-MGR001',
                full_name='Pierre Dubois',
                phone_number='+15141234567',
                email='manager@soyaexcel.com',
                can_approve_plans=True,
                can_manage_contracts=True,
                managed_provinces=['QC']
            )
            managers.append(manager)
            self.stdout.write(f'Created manager: {manager.full_name}')
        
        return managers

    def create_supply_inventory(self, products):
        """Create supply inventory for soybean meal products"""
        for product in products:
            inventory, created = SupplyInventory.objects.get_or_create(
                product=product,
                silo_number=f'SILO-{product.product_code[-2:]}',
                defaults={
                    'current_stock': Decimal(random.randint(500, 2000)),
                    'minimum_stock': Decimal(200),
                    'maximum_stock': Decimal(3000),
                    'storage_location': f'Silo {product.product_code[-2:]}',
                    'current_batch_number': f'BATCH{random.randint(1000, 9999)}',
                    'batch_received_date': timezone.now() - timedelta(days=random.randint(1, 15)),
                    'quality_grade': random.choice(['A', 'B', 'Premium']),
                    'alix_inventory_id': f'ALIX-{product.product_code}'
                }
            )
            if created:
                self.stdout.write(f'Created inventory: {inventory}')
    
    def create_weekly_plans(self, manager, orders):
        """Create weekly distribution plans"""
        # Current week and next 3 weeks
        for week_offset in range(4):
            week_start = timezone.now().date() + timedelta(weeks=week_offset)
            week_start = week_start - timedelta(days=week_start.weekday())  # Monday
            
            plan, created = WeeklyDistributionPlan.objects.get_or_create(
                planning_week=f'week_{week_offset}' if week_offset > 0 else 'current',
                week_start_date=week_start,
                defaults={
                    'plan_name': f'Week Plan {week_start.strftime("%Y-W%V")}',
                    'week_end_date': week_start + timedelta(days=6),
                    'total_quantity_planned': Decimal(random.randint(200, 800)),
                    'total_contract_deliveries': Decimal(random.randint(100, 400)),
                    'total_on_demand_deliveries': Decimal(random.randint(50, 200)),
                    'planned_routes': random.randint(5, 15),
                    'estimated_total_km': Decimal(random.randint(800, 2500)),
                    'forecasted_demand': Decimal(random.randint(180, 750)),
                    'status': 'approved' if week_offset <= 1 else 'draft',
                    'created_by': manager,
                    'planned_on_tuesday': True,
                    'finalized_by_friday': week_offset <= 1
                }
            )
            if created:
                self.stdout.write(f'Created weekly plan: {plan.plan_name}')
    
    def create_routes_with_kpi_tracking(self, created_by, farmers, orders, vehicles, drivers):
        """Create routes with KPI tracking and realistic stops"""
        routes = []
        
        for day in range(7):  # Next 7 days
            route_date = timezone.now().date() + timedelta(days=day)
            
            # Select vehicle and driver
            vehicle = random.choice(vehicles)
            available_drivers = [d for d in drivers if vehicle.vehicle_type in d.can_drive_vehicle_types]
            driver = random.choice(available_drivers) if available_drivers else drivers[0]
            
            route = Route.objects.create(
                name=f'Route {route_date.strftime("%Y-%m-%d")} - {vehicle.vehicle_number}',
                date=route_date,
                route_type=random.choice(['contract', 'mixed', 'on_demand']),
                status='active' if day == 0 else 'planned',
                planned_during_week=f'{timezone.now().year}-W{timezone.now().isocalendar()[1]}',
                total_distance=Decimal(random.randint(120, 350)),
                estimated_duration=random.randint(240, 480),
                assigned_vehicle_type=vehicle.vehicle_type,
                total_capacity_used=Decimal(random.uniform(20.0, float(vehicle.capacity_tonnes))),
                created_by=created_by
            )
            
            # Create realistic route stops with orders
            selected_farmers = random.sample(farmers, min(random.randint(3, 8), len(farmers)))
            for i, farmer in enumerate(selected_farmers):
                # Create a unique order for this farmer and route
                unique_order_number = f'ORD{timezone.now().year}{self.order_counter:05d}'
                self.order_counter += 1
                
                # Calculate realistic quantity based on farmer type and capacity
                max_quantity = min(38.0, float(farmer.historical_monthly_usage) / 2)  # Half monthly usage per delivery
                order_quantity = Decimal(str(random.uniform(5.0, max_quantity)))
                
                order = Order.objects.create(
                    farmer=farmer,
                    order_number=unique_order_number,
                    quantity=order_quantity,
                    delivery_method='bulk_38tm' if farmer.client_type != 'oil' else 'tank_compartment',
                    order_type=route.route_type,
                    status='confirmed',
                    expected_delivery_date=timezone.make_aware(datetime.combine(route_date, datetime.min.time())),
                    planning_week=route.planned_during_week,
                    priority='high' if route.route_type == 'emergency' else 'medium',
                    created_by=created_by
                )
                
                # Update order status and assignments now that it's assigned to a route
                order.status = 'planned'
                order.assigned_route = route
                order.assigned_driver = driver
                order.assigned_vehicle = vehicle
                order.save()
                
                # Create route stop with realistic delivery times
                estimated_arrival = timezone.now().replace(
                    hour=8 + (i * 2),  # Start at 8 AM, 2 hours between stops
                    minute=random.randint(0, 59),
                    second=0,
                    microsecond=0
                ) + timedelta(days=day)
                
                stop = RouteStop.objects.create(
                    route=route,
                    farmer=farmer,
                    order=order,
                    sequence_number=i + 1,
                    estimated_arrival_time=estimated_arrival,
                    estimated_service_time=random.randint(20, 45),
                    location_latitude=farmer.latitude,
                    location_longitude=farmer.longitude,
                    quantity_to_deliver=order.quantity,
                    delivery_method='silo_to_silo' if farmer.client_type != 'oil' else 'compartment_delivery',
                    is_completed=day < 0 or (day == 0 and i < len(selected_farmers) // 2)  # Some stops completed for today's route
                )
                
                # For completed stops, add actual delivery data
                if stop.is_completed:
                    stop.actual_arrival_time = stop.estimated_arrival_time + timedelta(minutes=random.randint(-15, 30))
                    stop.actual_service_time = stop.estimated_service_time + random.randint(-10, 15)
                    stop.quantity_delivered = stop.quantity_to_deliver * Decimal(str(random.uniform(0.95, 1.0)))
                    stop.customer_signature_captured = True
                    stop.delivery_rating = random.randint(4, 5)
                    stop.save()
            
            # Add realistic performance data for completed routes
            if day == 0:  # Today's route
                route.actual_distance = route.total_distance * Decimal(random.uniform(0.95, 1.15))
                route.actual_duration = int(route.estimated_duration * random.uniform(0.9, 1.2))
                route.fuel_consumed = route.actual_distance * Decimal('0.35')  # 35L/100km
                route.co2_emissions = route.fuel_consumed * Decimal('2.31')  # CO2 factor
                route.km_per_tonne = route.actual_distance / route.total_capacity_used
                route.save()
            
            routes.append(route)
            
            # Create delivery connecting driver, vehicle, and route
            delivery = Delivery.objects.create(
                driver=driver,
                vehicle=vehicle,
                route=route,
                status='in_progress' if day == 0 else 'assigned',
                start_time=timezone.now().replace(hour=7, minute=0) + timedelta(days=day) if day == 0 else None,
                total_quantity_delivered=route.total_capacity_used,
                actual_distance_km=route.actual_distance if day == 0 else None,
                actual_duration_minutes=route.actual_duration if day == 0 else None,
                co2_emissions_kg=route.co2_emissions if day == 0 else None
            )
            
            # Create delivery items for each route stop/order
            for stop in route.stops.all():
                DeliveryItem.objects.create(
                    delivery=delivery,
                    order=stop.order,
                    farmer=stop.farmer,
                    quantity_planned=stop.quantity_to_deliver,
                    quantity_delivered=stop.quantity_delivered if stop.is_completed else None,
                    delivery_method=stop.delivery_method,
                    delivery_time=stop.actual_arrival_time if stop.is_completed else None,
                    quality_check_passed=True if stop.is_completed else None,
                    customer_rating=stop.delivery_rating if stop.is_completed else None,
                    notes=stop.delivery_notes or ''
                )
            
        self.stdout.write(f'Created {len(routes)} routes with realistic stops and KPI tracking')
        return routes
    
    def create_kpi_metrics(self):
        """Create KPI metrics for different product types"""
        kpi_types = ['km_per_tonne_trituro_44', 'km_per_tonne_dairy_trituro', 'km_per_tonne_oil']
        
        for kpi_type in kpi_types:
            # Weekly metrics
            KPIMetrics.objects.create(
                metric_type=kpi_type,
                period_type='weekly',
                period_start=timezone.now().date() - timedelta(days=7),
                period_end=timezone.now().date(),
                metric_value=Decimal(random.uniform(8.5, 15.2)),
                target_value=Decimal('12.0'),
                total_distance_km=Decimal(random.randint(1200, 2800)),
                total_tonnes_delivered=Decimal(random.randint(150, 350)),
                number_of_deliveries=random.randint(15, 35),
                trend_direction='improving'
            )
            
            # Monthly metrics
            KPIMetrics.objects.create(
                metric_type=kpi_type,
                period_type='monthly',
                period_start=timezone.now().date().replace(day=1),
                period_end=timezone.now().date(),
                metric_value=Decimal(random.uniform(9.2, 14.8)),
                target_value=Decimal('11.5'),
                total_distance_km=Decimal(random.randint(4500, 8500)),
                total_tonnes_delivered=Decimal(random.randint(600, 1200)),
                number_of_deliveries=random.randint(60, 120),
                trend_direction=random.choice(['improving', 'stable', 'declining'])
            )
        
        self.stdout.write('Created KPI metrics for all product types')

    def print_summary(self):
        """Print summary of created Soya Excel data"""
        self.stdout.write('\n' + '='*60)
        self.stdout.write('SOYA EXCEL MOCK DATA SUMMARY')
        self.stdout.write('='*60)
        self.stdout.write(f'Managers: {Manager.objects.count()}')
        self.stdout.write(f'Farmers (Clients): {Farmer.objects.count()}')
        self.stdout.write(f'  - All Quebec-based: {Farmer.objects.filter(province="QC").count()}')
        self.stdout.write(f'  - Dairy Trituro: {Farmer.objects.filter(client_type="dairy_trituro").count()}')
        self.stdout.write(f'  - Trituro 44%: {Farmer.objects.filter(client_type="trituro_44").count()}')
        self.stdout.write(f'  - Oil Processing: {Farmer.objects.filter(client_type="oil").count()}')
        self.stdout.write(f'Vehicles: {Vehicle.objects.count()}')
        self.stdout.write(f'Drivers: {Driver.objects.count()}')
        self.stdout.write(f'Soybean Products: {SoybeanMealProduct.objects.count()}')
        self.stdout.write(f'Supply Inventory: {SupplyInventory.objects.count()}')
        self.stdout.write(f'Orders: {Order.objects.count()}')
        self.stdout.write(f'  - Assigned to routes: {Order.objects.filter(assigned_route__isnull=False).count()}')
        self.stdout.write(f'  - With driver assignment: {Order.objects.filter(assigned_driver__isnull=False).count()}')
        self.stdout.write(f'  - Pending/unassigned: {Order.objects.filter(status="pending").count()}')
        self.stdout.write(f'Routes: {Route.objects.count()}')
        self.stdout.write(f'  - With delivery assignments: {Route.objects.filter(deliveries__isnull=False).distinct().count()}')
        self.stdout.write(f'Route Stops: {RouteStop.objects.count()}')
        self.stdout.write(f'Deliveries: {Delivery.objects.count()}')
        self.stdout.write(f'Delivery Items: {DeliveryItem.objects.count()}')
        self.stdout.write(f'Weekly Plans: {WeeklyDistributionPlan.objects.count()}')
        self.stdout.write(f'KPI Metrics: {KPIMetrics.objects.count()}')
        self.stdout.write('='*60)
        
        self.stdout.write('\nLogin Credentials:')
        self.stdout.write('Manager: soya_manager')
        self.stdout.write('Drivers: driver_martin_bulk, driver_sophie_tank, etc.')
        self.stdout.write('Password for all: SoyaExcel_2024')
        self.stdout.write('\nKey Features:')
        self.stdout.write('• Valid Quebec addresses across 8 agricultural regions')
        self.stdout.write('• Google Maps compatible coordinates for routing')
        self.stdout.write('• Complete order-route-driver-vehicle relationships')
        self.stdout.write('• Soybean meal products (not generic feed)')
        self.stdout.write('• Realistic vehicle fleet (bulk trucks, tank trucks)')
        self.stdout.write('• BinConnect sensor integration')
        self.stdout.write('• Weekly planning cycles (Tuesday-Friday)')
        self.stdout.write('• KM/TM KPI tracking by product type')
        self.stdout.write('• Emergency alert system (1 tm or 80%)')
        self.stdout.write('• Complete delivery tracking with items')
        self.stdout.write('• Integration points for ZOHO CRM and ALIX')
        
    def create_farmers(self):
        """Create farmers representing Quebec agricultural regions with valid addresses"""
        farmers = []
        
        # Valid Quebec addresses across major agricultural regions
        farmer_data = [
            # Montérégie Region - Major agricultural area
            {'name': 'Ferme Laitière Saint-Jean', 'address': '2550 Boulevard du Séminaire, Saint-Jean-sur-Richelieu, QC J3A 1E5', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 45.3077, 'lng': -73.2627, 'capacity': 40.0, 'monthly_usage': 22.3},
            {'name': 'Producteurs Granby', 'address': '139 Rue Principale, Granby, QC J2G 2T8', 'province': 'QC', 'client_type': 'trituro_44', 'lat': 45.4048, 'lng': -72.7342, 'capacity': 60.0, 'monthly_usage': 35.2},
            {'name': 'Ferme Avicole Farnham', 'address': '524 Rue de l\'Église, Farnham, QC J2N 2R1', 'province': 'QC', 'client_type': 'trituro_44', 'lat': 45.2845, 'lng': -72.9814, 'capacity': 55.0, 'monthly_usage': 32.1},
            {'name': 'Élevage Belœil', 'address': '970 Chemin des Patriotes, Belœil, QC J3G 0E2', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 45.5668, 'lng': -73.2079, 'capacity': 35.0, 'monthly_usage': 28.7},
            {'name': 'Ferme Laitière Sorel', 'address': '3800 Chemin des Patriotes, Sorel-Tracy, QC J3P 5K8', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 46.0378, 'lng': -73.1041, 'capacity': 42.0, 'monthly_usage': 31.5},
            
            # Centre-du-Québec Region
            {'name': 'Ferme des Bois-Francs', 'address': '405 Rue Notre-Dame, Victoriaville, QC G6P 1T1', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 46.0526, 'lng': -71.9643, 'capacity': 45.0, 'monthly_usage': 33.8},
            {'name': 'Producteurs Drummondville', 'address': '1395 Rue Saint-Pierre, Drummondville, QC J2C 2Z8', 'province': 'QC', 'client_type': 'trituro_44', 'lat': 45.8835, 'lng': -72.4841, 'capacity': 38.0, 'monthly_usage': 27.9},
            {'name': 'Coopérative Nicolet', 'address': '3211 Boulevard Louis-Fréchette, Nicolet, QC J3T 1M8', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 46.2278, 'lng': -72.6136, 'capacity': 32.0, 'monthly_usage': 24.6},
            
            # Beauce Region
            {'name': 'Ferme Laitière Beauce', 'address': '11500 1re Avenue, Saint-Georges, QC G5Y 2C8', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 46.1158, 'lng': -70.6675, 'capacity': 28.0, 'monthly_usage': 18.5},
            {'name': 'Éleveurs Sainte-Marie', 'address': '427 Avenue Marguerite-Bourgeoys, Sainte-Marie, QC G6E 3S8', 'province': 'QC', 'client_type': 'trituro_44', 'lat': 46.4346, 'lng': -71.0093, 'capacity': 35.0, 'monthly_usage': 26.3},
            {'name': 'Ferme Scott', 'address': '2505 Route 173, Scott, QC G0S 3G0', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 46.2667, 'lng': -70.8333, 'capacity': 30.0, 'monthly_usage': 21.8},
            
            # Capitale-Nationale Region
            {'name': 'Ferme Portneuf', 'address': '600 Rue Saint-Charles, Portneuf, QC G0A 2Y0', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 46.6908, 'lng': -71.8850, 'capacity': 25.0, 'monthly_usage': 17.4},
            {'name': 'Producteurs Pont-Rouge', 'address': '88 Avenue Cantin, Pont-Rouge, QC G3H 1J6', 'province': 'QC', 'client_type': 'trituro_44', 'lat': 46.7528, 'lng': -71.6911, 'capacity': 40.0, 'monthly_usage': 29.7},
            {'name': 'Élevage Cap-Santé', 'address': '32 Rue du Quai, Cap-Santé, QC G0A 1L0', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 46.6708, 'lng': -71.7881, 'capacity': 33.0, 'monthly_usage': 23.9},
            
            # Laurentides Region
            {'name': 'Coopérative Laurentides', 'address': '360 Rue Principale, Lachute, QC J8H 1Y2', 'province': 'QC', 'client_type': 'trituro_44', 'lat': 45.6525, 'lng': -74.3376, 'capacity': 50.0, 'monthly_usage': 31.2},
            {'name': 'Ferme Saint-Eustache', 'address': '235 Rue Saint-Eustache, Saint-Eustache, QC J7R 2L7', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 45.5650, 'lng': -73.9010, 'capacity': 36.0, 'monthly_usage': 25.8},
            {'name': 'Producteurs Mirabel', 'address': '14005 Rue Saint-Vincent, Mirabel, QC J7J 2H7', 'province': 'QC', 'client_type': 'trituro_44', 'lat': 45.6558, 'lng': -74.0825, 'capacity': 48.0, 'monthly_usage': 34.2},
            
            # Laval Region
            {'name': 'Ferme des Mille-Îles', 'address': '4600 Boulevard Sainte-Rose, Laval, QC H7R 1V5', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 45.6066, 'lng': -73.7853, 'capacity': 28.0, 'monthly_usage': 21.4},
            
            # Mauricie Region
            {'name': 'Producteurs Mauricie', 'address': '1882 5e Rue, Shawinigan, QC G9N 1E9', 'province': 'QC', 'client_type': 'trituro_44', 'lat': 46.5569, 'lng': -72.7414, 'capacity': 42.0, 'monthly_usage': 27.9},
            {'name': 'Ferme Trois-Rivières', 'address': '3731 Boulevard des Forges, Trois-Rivières, QC G8Y 1W1', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 46.3432, 'lng': -72.5530, 'capacity': 37.0, 'monthly_usage': 26.5},
            {'name': 'Élevage Louiseville', 'address': '220 Avenue Saint-Laurent, Louiseville, QC J5V 1J6', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 46.2581, 'lng': -72.9407, 'capacity': 31.0, 'monthly_usage': 22.7},
            
            # Estrie Region
            {'name': 'Ferme Sherbrooke', 'address': '2665 Chemin de Sainte-Catherine, Sherbrooke, QC J1R 0C5', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 45.4042, 'lng': -71.8929, 'capacity': 34.0, 'monthly_usage': 25.1},
            {'name': 'Producteurs Magog', 'address': '2847 Chemin d\'Ayer\'s Cliff, Magog, QC J1X 0B7', 'province': 'QC', 'client_type': 'trituro_44', 'lat': 45.2669, 'lng': -72.1403, 'capacity': 44.0, 'monthly_usage': 30.8},
            {'name': 'Coopérative Coaticook', 'address': '150 Rue Main, Coaticook, QC J1A 1R1', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 45.1361, 'lng': -71.8000, 'capacity': 29.0, 'monthly_usage': 20.3},
            
            # Saguenay-Lac-Saint-Jean Region  
            {'name': 'Ferme Laitière Saguenay', 'address': '1805 Avenue du Pont Nord, Alma, QC G8B 5G2', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 48.5500, 'lng': -71.6491, 'capacity': 38.0, 'monthly_usage': 29.3},
            {'name': 'Producteurs Chicoutimi', 'address': '1855 Boulevard Saint-Jean-Baptiste, Chicoutimi, QC G7H 5B4', 'province': 'QC', 'client_type': 'trituro_44', 'lat': 48.4284, 'lng': -71.0570, 'capacity': 41.0, 'monthly_usage': 28.6},
            {'name': 'Élevage Roberval', 'address': '755 Boulevard Saint-Joseph, Roberval, QC G8H 2L4', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 48.5167, 'lng': -72.2261, 'capacity': 32.0, 'monthly_usage': 24.2},
            
            # Bas-Saint-Laurent Region
            {'name': 'Ferme Rivière-du-Loup', 'address': '298 Rue Lafontaine, Rivière-du-Loup, QC G5R 3A4', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 47.8408, 'lng': -69.5336, 'capacity': 26.0, 'monthly_usage': 18.9},
            {'name': 'Producteurs Kamouraska', 'address': '117 Avenue Morel, Kamouraska, QC G0L 1M0', 'province': 'QC', 'client_type': 'dairy_trituro', 'lat': 47.5667, 'lng': -69.8667, 'capacity': 24.0, 'monthly_usage': 17.6},
            
            # Oil processing facilities
            {'name': 'Trituration Bécancour', 'address': '1700 Boulevard Bécancour, Bécancour, QC G9H 2L4', 'province': 'QC', 'client_type': 'oil', 'lat': 46.3408, 'lng': -72.4069, 'capacity': 75.0, 'monthly_usage': 45.8},
            {'name': 'Usine Huiles Montréal', 'address': '7635 Boulevard Maurice-Duplessis, Montréal, QC H1E 1N1', 'province': 'QC', 'client_type': 'oil', 'lat': 45.6496, 'lng': -73.5108, 'capacity': 85.0, 'monthly_usage': 52.3},
        ]
        
        for i, data in enumerate(farmer_data):
            farmer, created = Farmer.objects.get_or_create(
                name=data['name'],
                defaults={
                    'phone_number': f'+1{random.randint(4000000000, 9999999999)}',
                    'email': f"{data['name'].lower().replace(' ', '_').replace('é', 'e').replace('ñ', 'n')}@farm.com",
                    'address': data['address'],
                    'latitude': data['lat'],
                    'longitude': data['lng'],
                    'province': data['province'],
                    'client_type': data['client_type'],
                    'priority': 'high' if data['client_type'] == 'dairy_trituro' else 'medium',
                    'has_contract': random.choice([True, False]),
                    'historical_monthly_usage': Decimal(str(data['monthly_usage'])),
                    'is_active': True
                }
            )
            farmers.append(farmer)
            
            # Create realistic silo storage (3-80 tm range)
            try:
                feed_storage = FeedStorage.objects.get(farmer=farmer)
                created = False
            except FeedStorage.DoesNotExist:
                feed_storage = FeedStorage.objects.create(
                    farmer=farmer,
                    capacity=Decimal(str(data['capacity'])),
                    current_quantity=Decimal(str(random.uniform(0.5, data['capacity'] * 0.8))),
                    sensor_type='binconnect',
                    sensor_id=f'BINCONNECT{farmer.id}_{i+1:03d}',
                    low_stock_threshold_tonnes=Decimal('1.0'),
                    low_stock_threshold_percentage=Decimal('80.0'),
                    reporting_frequency=60,  # BinConnect reports hourly
                    is_connected=True
                )
                created = True
            
            if created:
                self.stdout.write(f'Created farmer: {farmer.name} ({farmer.province}) - {data["capacity"]} tm silo')
        
        return farmers

    def create_vehicles_and_drivers(self):
        """Create Soya Excel's specific fleet"""
        # Create vehicles first
        vehicles = []
        vehicle_data = [
            {'number': 'SE-BULK-001', 'type': 'bulk_truck', 'capacity': 38.0, 'fuel_efficiency': 35.0},
            {'number': 'SE-BULK-002', 'type': 'bulk_truck', 'capacity': 38.0, 'fuel_efficiency': 33.5},
            {'number': 'SE-TANK-OIL-001', 'type': 'tank_oil', 'capacity': 28.0, 'fuel_efficiency': 30.0},
            {'number': 'SE-TANK-OIL-002', 'type': 'tank_oil', 'capacity': 28.0, 'fuel_efficiency': 31.2},
            {'number': 'SE-TANK-BLOWER-001', 'type': 'tank_blower', 'capacity': 25.0, 'fuel_efficiency': 32.1},
            {'number': 'SE-BOX-001', 'type': 'box_truck', 'capacity': 5.0, 'fuel_efficiency': 12.5},  # For tote bags
        ]
        
        for data in vehicle_data:
            vehicle, created = Vehicle.objects.get_or_create(
                vehicle_number=data['number'],
                defaults={
                    'vehicle_type': data['type'],
                    'capacity_tonnes': Decimal(str(data['capacity'])),
                    'fuel_efficiency_l_per_100km': Decimal(str(data['fuel_efficiency'])),
                    'has_gps_tracking': True,
                    'electronic_log_device': f"ELD_{data['number'][-3:]}",
                    'status': 'active'
                }
            )
            vehicles.append(vehicle)
            if created:
                self.stdout.write(f'Created vehicle: {vehicle.vehicle_number} ({vehicle.get_vehicle_type_display()})')
        
        # Create drivers
        drivers = []
        driver_data = [
            {'username': 'driver_martin_bulk', 'full_name': 'Martin Tremblay', 'staff_id': 'SE-DRV001', 'vehicle_types': ['bulk_truck']},
            {'username': 'driver_sophie_tank', 'full_name': 'Sophie Dubois', 'staff_id': 'SE-DRV002', 'vehicle_types': ['tank_oil', 'tank_blower']},
            {'username': 'driver_jean_multi', 'full_name': 'Jean-Claude Morin', 'staff_id': 'SE-DRV003', 'vehicle_types': ['bulk_truck', 'tank_oil']},
            {'username': 'driver_marie_box', 'full_name': 'Marie Blanchard', 'staff_id': 'SE-DRV004', 'vehicle_types': ['box_truck', 'tank_blower']},
        ]
        
        for data in driver_data:
            try:
                user = User.objects.get(username=data['username'])
            except User.DoesNotExist:
                user = User.objects.create_user(
                    username=data['username'],
                    password='SoyaExcel_2024',
                    email=f"{data['username']}@soyaexcel.com",
                    first_name=data['full_name'].split()[0],
                    last_name=' '.join(data['full_name'].split()[1:])
                )
            
            # Find suitable vehicle for driver
            suitable_vehicle = None
            for vehicle in vehicles:
                if vehicle.vehicle_type in data['vehicle_types'] and not vehicle.assigned_drivers.exists():
                    suitable_vehicle = vehicle
                    break
            
            driver, created = Driver.objects.get_or_create(
                user=user,
                defaults={
                    'staff_id': data['staff_id'],
                    'full_name': data['full_name'],
                    'phone_number': f'+1{random.randint(4000000000, 9999999999)}',
                    'license_number': f'QC{random.randint(1000000, 9999999)}',
                    'assigned_vehicle': suitable_vehicle,
                    'can_drive_vehicle_types': data['vehicle_types']
                }
            )
            drivers.append(driver)
            if created:
                self.stdout.write(f'Created driver: {driver.full_name} - {driver.assigned_vehicle}')
        
        return vehicles, drivers

    def create_soybean_products(self):
        """Create Soya Excel's soybean meal products"""
        products = []
        product_data = [
            {'name': 'Soybean Meal 44% - Canadian', 'code': 'SBM44-CA', 'type': 'soybean_meal_44', 'protein': 44.0, 'origin': 'canada', 'price': 485.00},
            {'name': 'Soybean Meal 48% - US Premium', 'code': 'SBM48-US', 'type': 'soybean_meal_48', 'protein': 48.0, 'origin': 'usa', 'price': 525.00},
            {'name': 'Soybean Hulls - Premium Grade', 'code': 'SBH-PG', 'type': 'soybean_hulls', 'protein': 12.0, 'origin': 'canada', 'price': 285.00},
            {'name': 'Soybean Oil - Refined', 'code': 'SBO-REF', 'type': 'soybean_oil', 'protein': 0.0, 'origin': 'canada', 'price': 1250.00},
            {'name': 'Dairy Trituro Blend', 'code': 'DTB-SPEC', 'type': 'specialty_blend', 'protein': 46.0, 'origin': 'canada', 'price': 510.00},
        ]
        
        for data in product_data:
            product, created = SoybeanMealProduct.objects.get_or_create(
                product_code=data['code'],
                defaults={
                    'product_name': data['name'],
                    'product_type': data['type'],
                    'protein_percentage': Decimal(str(data['protein'])),
                    'primary_origin': data['origin'],
                    'base_price_per_tonne': Decimal(str(data['price'])),
                    'sustainability_certified': random.choice([True, False]),
                    'is_active': True
                }
            )
            products.append(product)
            if created:
                self.stdout.write(f'Created product: {product.product_name}')
        
        return products

    def create_realistic_orders(self, farmers, products, manager):
        """Create additional orders with realistic Soya Excel patterns (beyond route-specific orders)"""
        orders = []
        
        # Contract deliveries (planned for future weeks)
        contract_farmers = [f for f in farmers if f.has_contract]
        for farmer in contract_farmers[:3]:  # First 3 contract farmers for future orders
            for week_offset in range(2, 6):  # Weeks 2-5 (beyond current planning)
                order_number = f'ORD{timezone.now().year}{self.order_counter:05d}'
                self.order_counter += 1
                
                order = Order.objects.create(
                    farmer=farmer,
                    order_number=order_number,
                    quantity=Decimal(str(random.uniform(15.0, float(farmer.historical_monthly_usage)))),
                    delivery_method='bulk_38tm' if farmer.client_type != 'oil' else 'tank_compartment',
                    order_type='contract',
                    status='confirmed',
                    planning_week=f'{timezone.now().year}-W{timezone.now().isocalendar()[1] + week_offset}',
                    forecast_based=True,
                    expected_delivery_date=timezone.now() + timedelta(weeks=week_offset, days=random.randint(1, 5)),
                    priority='medium',
                    created_by=manager.user
                )
                orders.append(order)
        
        # Emergency/low stock orders (not yet assigned to routes)
        low_stock_farmers = [f for f in farmers if hasattr(f, 'feed_storage') and f.feed_storage.is_emergency_level]
        for farmer in low_stock_farmers[:2]:  # Only 2 emergency orders
            order_number = f'ORD{timezone.now().year}{self.order_counter:05d}'
            self.order_counter += 1
            
            order = Order.objects.create(
                farmer=farmer,
                order_number=order_number,
                quantity=Decimal(str(min(38.0, float(farmer.feed_storage.capacity) * 0.8))),
                delivery_method='bulk_38tm',
                order_type='emergency',
                status='pending',
                priority='urgent',
                is_urgent=True,
                requires_approval=True,
                expected_delivery_date=timezone.now() + timedelta(days=1),
                created_by=manager.user
            )
            orders.append(order)
        
        self.stdout.write(f'Created {len(orders)} additional orders (future planning + emergency)')
        return orders 