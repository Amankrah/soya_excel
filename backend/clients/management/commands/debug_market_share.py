"""
Django management command to debug market share calculations
"""

from django.core.management.base import BaseCommand
from django.db.models import Sum, Count, Max, Min
from clients.models import Order
from django.utils import timezone
from datetime import timedelta


class Command(BaseCommand):
    help = 'Debug market share calculation to identify the issue'

    def handle(self, *args, **options):
        self.stdout.write(self.style.HTTP_INFO('='*80))
        self.stdout.write(self.style.HTTP_INFO('MARKET SHARE DEBUG'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        # Get all orders
        queryset = Order.objects.all()

        # Get date range
        full_date_range = queryset.aggregate(
            min_date=Min('sales_order_creation_date'),
            max_date=Max('sales_order_creation_date')
        )

        start_date = full_date_range['min_date']
        end_date = full_date_range['max_date']

        queryset = queryset.filter(
            sales_order_creation_date__gte=start_date,
            sales_order_creation_date__lte=end_date
        )

        self.stdout.write(f"\nDate Range: {start_date.date()} to {end_date.date()}")
        self.stdout.write(f"Total Records: {queryset.count()}")

        # === CALCULATE OVERALL TOTAL VOLUME (CORRECT METHOD) ===
        self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
        self.stdout.write(self.style.HTTP_INFO('OVERALL VOLUME CALCULATION (Correct Method)'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        order_aggregates = queryset.values('client_order_number').annotate(
            order_delivered=Sum('total_amount_delivered_tm'),
            order_ordered=Max('total_amount_ordered_tm')
        )

        total_volume = sum(item['order_delivered'] or 0 for item in order_aggregates)
        total_orders = len(order_aggregates)

        self.stdout.write(f"\nUnique Orders: {total_orders}")
        self.stdout.write(f"Total Volume (Correct): {total_volume:.2f} tm")

        # === CALCULATE PRODUCT VOLUMES (NEW METHOD) ===
        self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
        self.stdout.write(self.style.HTTP_INFO('PRODUCT VOLUME CALCULATION (New Method)'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        product_volumes = {}
        for product_name in queryset.values_list('product_name', flat=True).distinct():
            product_queryset = queryset.filter(product_name=product_name)

            # Aggregate by order first (handles batches)
            product_order_aggregates = product_queryset.values('client_order_number').annotate(
                order_delivered=Sum('total_amount_delivered_tm')
            )

            product_volumes[product_name] = {
                'order_count': len(product_order_aggregates),
                'total_volume': sum(item['order_delivered'] or 0 for item in product_order_aggregates),
                'unique_clients': product_queryset.values('client').distinct().count()
            }

        # Display product volumes and calculate market shares
        self.stdout.write(f"\n{'Product':<40} {'Orders':<10} {'Volume (tm)':<15} {'Market Share':<15}")
        self.stdout.write('-' * 80)

        total_product_volume = 0
        for product_name, data in sorted(product_volumes.items(), key=lambda x: x[1]['total_volume'], reverse=True):
            volume = data['total_volume']
            total_product_volume += volume
            market_share = (volume / total_volume * 100) if total_volume > 0 else 0

            self.stdout.write(
                f"{product_name:<40} {data['order_count']:<10} {volume:<15.2f} {market_share:<15.2f}%"
            )

        # === VERIFICATION ===
        self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
        self.stdout.write(self.style.HTTP_INFO('VERIFICATION'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        self.stdout.write(f"\nTotal Volume (Overall): {total_volume:.2f} tm")
        self.stdout.write(f"Total Volume (Sum of Products): {total_product_volume:.2f} tm")
        self.stdout.write(f"Difference: {abs(total_volume - total_product_volume):.2f} tm")

        if abs(total_volume - total_product_volume) < 0.01:
            self.stdout.write(self.style.SUCCESS("\n✅ MATCH! Product volumes sum correctly to overall total"))
            self.stdout.write(self.style.SUCCESS("Market shares should now add up to 100%"))
        else:
            self.stdout.write(self.style.ERROR(f"\n❌ MISMATCH! Difference of {abs(total_volume - total_product_volume):.2f} tm"))
            self.stdout.write(self.style.ERROR("Product volume calculation still has issues"))

        # === OLD METHOD FOR COMPARISON ===
        self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
        self.stdout.write(self.style.HTTP_INFO('OLD METHOD (For Comparison - INCORRECT)'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        old_product_analytics = queryset.values('product_name').annotate(
            order_count=Count('client_order_number', distinct=True),
            total_volume=Sum('total_amount_delivered_tm'),
            unique_clients=Count('client', distinct=True)
        ).order_by('-total_volume')

        self.stdout.write(f"\n{'Product':<40} {'Orders':<10} {'Volume (tm)':<15} {'Market Share':<15}")
        self.stdout.write('-' * 80)

        old_total = 0
        for item in old_product_analytics:
            volume = float(item['total_volume'] or 0)
            old_total += volume
            market_share = (volume / float(total_volume) * 100) if total_volume > 0 else 0

            self.stdout.write(
                f"{item['product_name']:<40} {item['order_count']:<10} {volume:<15.2f} {market_share:<15.2f}%"
            )

        self.stdout.write(f"\nOld Method Total Volume: {old_total:.2f} tm")
        self.stdout.write(f"Inflation Factor: {(old_total / float(total_volume)):.2f}x")

        if old_total > float(total_volume):
            self.stdout.write(self.style.ERROR(f"\n❌ Old method INFLATES volumes by {((old_total / float(total_volume) - 1) * 100):.1f}%"))
            self.stdout.write(self.style.ERROR("This causes market shares > 100%"))

        self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
        self.stdout.write(self.style.SUCCESS('DEBUG COMPLETE'))
        self.stdout.write(self.style.HTTP_INFO('='*80 + '\n'))
