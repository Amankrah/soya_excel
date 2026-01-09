"""
Django management command to check what the API returns for product analytics
"""

from django.core.management.base import BaseCommand
from django.db.models import Sum, Max
from clients.models import Order


class Command(BaseCommand):
    help = 'Check what the advanced_analytics API endpoint returns'

    def handle(self, *args, **options):
        queryset = Order.objects.all()

        # Calculate total volume (correct method)
        order_aggregates = queryset.values('client_order_number').annotate(
            order_delivered=Sum('total_amount_delivered_tm'),
            order_ordered=Max('total_amount_ordered_tm')
        )
        total_volume = sum(item['order_delivered'] or 0 for item in order_aggregates)

        self.stdout.write(f"\n{'='*80}")
        self.stdout.write(f"TOTAL VOLUME CHECK")
        self.stdout.write(f"{'='*80}")
        self.stdout.write(f"Total Volume (correct): {total_volume:.2f} tm")

        # Check product volumes
        self.stdout.write(f"\n{'='*80}")
        self.stdout.write(f"PRODUCT VOLUMES")
        self.stdout.write(f"{'='*80}\n")

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
            }

        # Sort by volume
        sorted_products = sorted(product_volumes.items(), key=lambda x: x[1]['total_volume'], reverse=True)

        self.stdout.write(f"{'Product':<40} {'Volume (tm)':<15} {'Market Share':<15}")
        self.stdout.write('-' * 80)

        for product_name, data in sorted_products[:5]:
            volume = data['total_volume']
            market_share = (volume / total_volume * 100) if total_volume > 0 else 0

            self.stdout.write(
                f"{product_name:<40} {volume:<15.2f} {market_share:<15.2f}%"
            )

        self.stdout.write(f"\n{'='*80}")
        self.stdout.write(f"SUM CHECK")
        self.stdout.write(f"{'='*80}")

        sum_of_products = sum(data['total_volume'] for data in product_volumes.values())
        self.stdout.write(f"Sum of all product volumes: {sum_of_products:.2f} tm")
        self.stdout.write(f"Total volume (overall): {total_volume:.2f} tm")
        self.stdout.write(f"Difference: {abs(sum_of_products - total_volume):.2f} tm")

        if abs(sum_of_products - total_volume) < 0.01:
            self.stdout.write(self.style.SUCCESS("\n✅ Volumes match!"))
        else:
            self.stdout.write(self.style.ERROR("\n❌ Volumes don't match!"))

        self.stdout.write("\n")
