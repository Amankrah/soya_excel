"""
Django management command to extract unique products from order history
and create Product records from them.
"""

from django.core.management.base import BaseCommand
from django.db.models import Count
from clients.models import Product, Order


class Command(BaseCommand):
    help = 'Extract unique products from order history and create Product records'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be created without actually creating products',
        )
        parser.add_argument(
            '--clear-generic',
            action='store_true',
            help='Delete generic products (SM48, SM46, TRI-STD, TRI-DRY, OIL) before creating',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        clear_generic = options['clear_generic']

        self.stdout.write(self.style.HTTP_INFO('='*60))
        self.stdout.write(self.style.HTTP_INFO('EXTRACT PRODUCTS FROM ORDER HISTORY'))
        self.stdout.write(self.style.HTTP_INFO('='*60))

        if dry_run:
            self.stdout.write(self.style.WARNING('\nDRY RUN MODE - No data will be saved\n'))

        # Get unique product names from orders
        unique_products = Order.objects.values('product_name').annotate(
            count=Count('id')
        ).filter(product_name__isnull=False).exclude(product_name='').order_by('-count')

        self.stdout.write('\nProduct names found in orders:')
        self.stdout.write('-'*60)
        for item in unique_products:
            self.stdout.write(f"  {item['product_name']}: {item['count']} orders")

        self.stdout.write(f"\nTotal unique products: {len(unique_products)}")

        if clear_generic and not dry_run:
            self.stdout.write('\n' + '-'*60)
            self.stdout.write('Deleting old generic products...')
            deleted = Product.objects.filter(
                code__in=['SM48', 'SM46', 'TRI-STD', 'TRI-DRY', 'OIL']
            ).delete()
            self.stdout.write(f"Deleted {deleted[0]} generic products")

        self.stdout.write('\n' + '-'*60)
        self.stdout.write('Creating Product records from order data...')
        self.stdout.write('-'*60)

        created_count = 0
        skipped_count = 0

        for item in unique_products:
            product_name = item['product_name'].strip()
            if not product_name:
                continue

            category = self._get_category(product_name)

            if dry_run:
                self.stdout.write(f"  Would create: {product_name} [{category}]")
                created_count += 1
            else:
                product, was_created = Product.objects.get_or_create(
                    name=product_name,
                    defaults={
                        'category': category,
                        'unit': 'tonnes' if category != 'oil' else 'liters',
                        'is_active': True,
                        'description': f'Imported from order history ({item["count"]} orders)'
                    }
                )

                if was_created:
                    created_count += 1
                    self.stdout.write(self.style.SUCCESS(f"  Created: {product_name} [{category}]"))
                else:
                    skipped_count += 1
                    self.stdout.write(f"  Exists:  {product_name}")

        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.HTTP_INFO('RESULTS'))
        self.stdout.write('='*60)
        
        if dry_run:
            self.stdout.write(f"Would create: {created_count} products")
        else:
            self.stdout.write(self.style.SUCCESS(f"Created: {created_count} products"))
            self.stdout.write(f"Skipped (already exist): {skipped_count} products")
            self.stdout.write(f"Total products in database: {Product.objects.count()}")

        self.stdout.write('='*60 + '\n')

    def _get_category(self, name):
        """Determine product category based on product name"""
        name_lower = name.lower()
        
        if 'trituro' in name_lower and ('laitier' in name_lower or 'dairy' in name_lower):
            return 'dairy_trituro'
        elif 'trituro' in name_lower:
            return 'trituro'
        elif 'huile' in name_lower or 'oil' in name_lower:
            return 'oil'
        elif 'soya' in name_lower or 'soy' in name_lower or 'écales' in name_lower:
            return 'soya_meal'
        else:
            return 'other'

