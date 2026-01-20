"""
Django management command to test and profile analytics performance
Measures computation time for advanced_analytics and identifies bottlenecks
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db.models import Sum, Count, Max, Min, Avg, F
from django.db.models.functions import TruncMonth, ExtractYear, ExtractMonth
from datetime import timedelta
from clients.models import Client, Order
from clients.models_analytics import AnalyticsCache
import time


class Command(BaseCommand):
    help = 'Test and profile advanced analytics performance'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force-refresh',
            action='store_true',
            help='Force refresh cache (bypass cache)',
        )
        parser.add_argument(
            '--clear-cache',
            action='store_true',
            help='Clear analytics cache before testing',
        )
        parser.add_argument(
            '--profile',
            action='store_true',
            help='Profile each section of analytics computation',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.HTTP_INFO('='*80))
        self.stdout.write(self.style.HTTP_INFO('ANALYTICS PERFORMANCE TEST'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        # Clear cache if requested
        if options['clear_cache']:
            self.stdout.write('\n🗑️  Clearing analytics cache...')
            AnalyticsCache.invalidate()
            self.stdout.write(self.style.SUCCESS('   ✅ Cache cleared'))

        # Check cache status
        self.stdout.write('\n📦 Cache Status:')
        cache_entries = AnalyticsCache.objects.all()
        self.stdout.write(f'   Total entries: {cache_entries.count()}')
        for cache in cache_entries:
            age = (timezone.now() - cache.updated_at).total_seconds() / 60
            self.stdout.write(f'   - {cache.cache_key}: {age:.1f} minutes old')

        # Get date range
        self.stdout.write('\n📅 Determining date range...')
        date_range = Order.objects.aggregate(
            min_date=Min('sales_order_creation_date'),
            max_date=Max('sales_order_creation_date')
        )
        start_date = date_range['min_date']
        end_date = date_range['max_date']
        self.stdout.write(f'   Start: {start_date}')
        self.stdout.write(f'   End: {end_date}')

        # Generate cache key
        cache_key = f"advanced_analytics_{start_date.date() if start_date else 'all'}_{end_date.date() if end_date else 'all'}"
        self.stdout.write(f'   Cache key: {cache_key}')

        # Check if cache exists
        cache_exists = AnalyticsCache.objects.filter(cache_key=cache_key).exists()
        self.stdout.write(f'   Cache exists: {"Yes" if cache_exists else "No"}')

        # Run computation test
        if options['profile']:
            self.stdout.write('\n' + self.style.HTTP_INFO('='*80))
            self.stdout.write(self.style.HTTP_INFO('PROFILING ANALYTICS COMPUTATION'))
            self.stdout.write(self.style.HTTP_INFO('='*80))
            self._profile_computation(start_date, end_date)
        else:
            self.stdout.write('\n' + self.style.HTTP_INFO('='*80))
            self.stdout.write(self.style.HTTP_INFO('TESTING FULL COMPUTATION'))
            self.stdout.write(self.style.HTTP_INFO('='*80))
            self._test_full_computation(cache_key, start_date, end_date, options['force_refresh'])

        self.stdout.write('\n' + self.style.HTTP_INFO('='*80))
        self.stdout.write('✅ Performance test complete')
        self.stdout.write(self.style.HTTP_INFO('='*80 + '\n'))

    def _test_full_computation(self, cache_key, start_date, end_date, force_refresh):
        """Test full analytics computation using the cache system"""

        self.stdout.write('\n⏱️  Running full analytics computation...')
        start_time = time.time()

        def compute_analytics():
            """Simplified version of the actual compute_analytics function"""
            queryset = Order.objects.filter(
                sales_order_creation_date__gte=start_date,
                sales_order_creation_date__lte=end_date
            )

            # Just compute basic metrics to test the system
            order_aggregates = queryset.values('client_order_number').annotate(
                order_delivered=Sum('total_amount_delivered_tm'),
                order_ordered=Max('total_amount_ordered_tm')
            )

            total_orders = len(order_aggregates)
            total_volume = sum(item['order_delivered'] or 0 for item in order_aggregates)

            return {
                'total_orders': total_orders,
                'total_volume': float(total_volume),
                'computation_time': time.time() - start_time
            }

        # Use the caching system
        result = AnalyticsCache.get_or_compute(
            cache_key=cache_key,
            compute_func=compute_analytics,
            force_refresh=force_refresh,
            max_age_minutes=60
        )

        elapsed = time.time() - start_time

        self.stdout.write(self.style.SUCCESS(f'\n✅ Computation complete in {elapsed:.2f} seconds'))
        self.stdout.write(f'   Total orders: {result["total_orders"]:,}')
        self.stdout.write(f'   Total volume: {result["total_volume"]:,.2f} TM')

        if elapsed < 1:
            self.stdout.write(self.style.SUCCESS(f'   ⚡ FAST: Retrieved from cache'))
        elif elapsed < 10:
            self.stdout.write(self.style.SUCCESS(f'   ✅ GOOD: {elapsed:.2f}s'))
        elif elapsed < 30:
            self.stdout.write(self.style.WARNING(f'   ⚠️  SLOW: {elapsed:.2f}s'))
        else:
            self.stdout.write(self.style.ERROR(f'   ❌ VERY SLOW: {elapsed:.2f}s'))

    def _profile_computation(self, start_date, end_date):
        """Profile each section of analytics computation to identify bottlenecks"""

        queryset = Order.objects.filter(
            sales_order_creation_date__gte=start_date,
            sales_order_creation_date__lte=end_date
        )

        sections = []

        # Section 1: Order aggregates
        self.stdout.write('\n[1/10] Computing order aggregates...')
        t_start = time.time()
        order_aggregates = list(queryset.values('client_order_number').annotate(
            order_delivered=Sum('total_amount_delivered_tm'),
            order_ordered=Max('total_amount_ordered_tm')
        ))
        total_orders = len(order_aggregates)
        total_volume = sum(item['order_delivered'] or 0 for item in order_aggregates)
        t_elapsed = time.time() - t_start
        sections.append(('Order Aggregates', t_elapsed))
        self.stdout.write(f'   ✅ {t_elapsed:.2f}s - {total_orders:,} orders, {total_volume:,.0f} TM')

        # Section 2: Monthly trends
        self.stdout.write('\n[2/10] Computing monthly trends...')
        t_start = time.time()
        monthly_data = list(queryset.annotate(
            month=TruncMonth('sales_order_creation_date')
        ).values('month').annotate(
            order_count=Count('client_order_number', distinct=True),
            month_volume=Sum('total_amount_delivered_tm'),
            unique_clients=Count('client', distinct=True)
        ).order_by('month'))
        t_elapsed = time.time() - t_start
        sections.append(('Monthly Trends', t_elapsed))
        self.stdout.write(f'   ✅ {t_elapsed:.2f}s - {len(monthly_data)} months')

        # Section 3: Client segmentation (SLOW - loops through clients)
        self.stdout.write('\n[3/10] Computing client segmentation...')
        t_start = time.time()
        client_volumes = {}
        client_ids = list(queryset.values_list('client', flat=True).distinct())
        self.stdout.write(f'   Processing {len(client_ids)} clients...')

        for i, client_id in enumerate(client_ids):
            if i % 100 == 0 and i > 0:
                self.stdout.write(f'   Progress: {i}/{len(client_ids)}')

            client_queryset = queryset.filter(client_id=client_id)
            client_aggregates = client_queryset.values('client_order_number').annotate(
                order_delivered=Sum('total_amount_delivered_tm')
            )
            client_volume = sum(item['order_delivered'] or 0 for item in client_aggregates)

            if client_volume > 0:
                client_volumes[client_id] = {
                    'total_volume': float(client_volume),
                    'order_count': len(client_aggregates),
                }

        t_elapsed = time.time() - t_start
        sections.append(('Client Segmentation', t_elapsed))
        self.stdout.write(f'   ⚠️  {t_elapsed:.2f}s - {len(client_volumes)} clients (BOTTLENECK!)')

        # Section 4: Product performance (SLOW - loops through products)
        self.stdout.write('\n[4/10] Computing product performance...')
        t_start = time.time()
        product_names = list(queryset.values_list('product_name', flat=True).distinct())
        product_volumes = {}

        for product_name in product_names:
            if not product_name:
                continue
            product_queryset = queryset.filter(product_name=product_name)
            product_order_aggregates = product_queryset.values('client_order_number').annotate(
                order_delivered=Sum('total_amount_delivered_tm')
            )
            product_volume = sum(item['order_delivered'] or 0 for item in product_order_aggregates)
            product_volumes[product_name] = float(product_volume)

        t_elapsed = time.time() - t_start
        sections.append(('Product Performance', t_elapsed))
        self.stdout.write(f'   ⚠️  {t_elapsed:.2f}s - {len(product_volumes)} products')

        # Section 5: Geographical analysis (SLOW - loops through countries)
        self.stdout.write('\n[5/10] Computing geographical analysis...')
        t_start = time.time()
        countries = list(queryset.values_list('client__country', flat=True).distinct())
        country_volumes = {}

        for country in countries:
            if not country:
                continue
            country_queryset = queryset.filter(client__country=country)
            country_aggregates = country_queryset.values('client_order_number').annotate(
                order_delivered=Sum('total_amount_delivered_tm')
            )
            country_volume = sum(item['order_delivered'] or 0 for item in country_aggregates)
            country_volumes[country] = float(country_volume)

        t_elapsed = time.time() - t_start
        sections.append(('Geographical Analysis', t_elapsed))
        self.stdout.write(f'   ⚠️  {t_elapsed:.2f}s - {len(country_volumes)} countries')

        # Section 6: Delivery performance (VERY SLOW - loops through ALL orders)
        self.stdout.write('\n[6/10] Computing delivery performance...')
        t_start = time.time()
        order_numbers = list(queryset.values_list('client_order_number', flat=True).distinct())
        fully_delivered = 0
        partially_delivered = 0
        not_delivered = 0

        self.stdout.write(f'   Processing {len(order_numbers)} orders...')
        for i, order_num in enumerate(order_numbers):
            if i % 500 == 0 and i > 0:
                self.stdout.write(f'   Progress: {i}/{len(order_numbers)}')

            order_batches = queryset.filter(client_order_number=order_num)
            total_delivered = order_batches.aggregate(Sum('total_amount_delivered_tm'))['total_amount_delivered_tm__sum'] or 0
            total_ordered = order_batches.aggregate(Max('total_amount_ordered_tm'))['total_amount_ordered_tm__max'] or 0

            if total_delivered == 0:
                not_delivered += 1
            elif total_delivered >= total_ordered:
                fully_delivered += 1
            else:
                partially_delivered += 1

        t_elapsed = time.time() - t_start
        sections.append(('Delivery Performance', t_elapsed))
        self.stdout.write(f'   ❌ {t_elapsed:.2f}s - {len(order_numbers)} orders (MAJOR BOTTLENECK!)')

        # Section 7: Order size distribution (SLOW - loops through orders)
        self.stdout.write('\n[7/10] Computing order size distribution...')
        t_start = time.time()
        small_orders = medium_orders = large_orders = 0

        for order_num in order_numbers:
            order_batches = queryset.filter(client_order_number=order_num)
            total_delivered = order_batches.aggregate(Sum('total_amount_delivered_tm'))['total_amount_delivered_tm__sum'] or 0

            if total_delivered <= 10:
                small_orders += 1
            elif total_delivered <= 50:
                medium_orders += 1
            else:
                large_orders += 1

        t_elapsed = time.time() - t_start
        sections.append(('Order Size Distribution', t_elapsed))
        self.stdout.write(f'   ⚠️  {t_elapsed:.2f}s (BOTTLENECK!)')

        # Section 8: Yearly breakdown
        self.stdout.write('\n[8/10] Computing yearly breakdown...')
        t_start = time.time()
        yearly_data = list(queryset.annotate(
            year=ExtractYear('sales_order_creation_date')
        ).values('year').annotate(
            order_count=Count('client_order_number', distinct=True),
            year_volume=Sum('total_amount_delivered_tm'),
        ).order_by('year'))
        t_elapsed = time.time() - t_start
        sections.append(('Yearly Breakdown', t_elapsed))
        self.stdout.write(f'   ✅ {t_elapsed:.2f}s - {len(yearly_data)} years')

        # Section 9: AI Predictions
        self.stdout.write('\n[9/10] Computing AI predictions...')
        t_start = time.time()
        clients_with_predictions = Client.objects.filter(
            predicted_next_order_date__isnull=False
        )
        urgent_date = timezone.now() + timedelta(days=3)
        urgent_clients = clients_with_predictions.filter(
            predicted_next_order_date__lte=urgent_date
        ).count()
        t_elapsed = time.time() - t_start
        sections.append(('AI Predictions', t_elapsed))
        self.stdout.write(f'   ✅ {t_elapsed:.2f}s')

        # Section 10: Seasonal patterns
        self.stdout.write('\n[10/10] Computing seasonal patterns...')
        t_start = time.time()
        seasonal_data = list(queryset.annotate(
            month_num=ExtractMonth('sales_order_creation_date')
        ).values('month_num').annotate(
            order_count=Count('client_order_number', distinct=True),
            total_volume=Sum('total_amount_delivered_tm')
        ).order_by('month_num'))
        t_elapsed = time.time() - t_start
        sections.append(('Seasonal Patterns', t_elapsed))
        self.stdout.write(f'   ✅ {t_elapsed:.2f}s - {len(seasonal_data)} months')

        # Summary
        self.stdout.write('\n' + self.style.HTTP_INFO('='*80))
        self.stdout.write(self.style.HTTP_INFO('PERFORMANCE SUMMARY'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        total_time = sum(t for _, t in sections)
        self.stdout.write(f'\n⏱️  Total computation time: {total_time:.2f} seconds')

        # Sort by time
        sections_sorted = sorted(sections, key=lambda x: x[1], reverse=True)

        self.stdout.write('\n🐌 Slowest sections:')
        for i, (name, elapsed) in enumerate(sections_sorted[:5], 1):
            percentage = (elapsed / total_time * 100)
            self.stdout.write(f'   {i}. {name}: {elapsed:.2f}s ({percentage:.1f}%)')

        # Identify bottlenecks
        self.stdout.write('\n' + self.style.WARNING('='*80))
        self.stdout.write(self.style.WARNING('IDENTIFIED BOTTLENECKS'))
        self.stdout.write(self.style.WARNING('='*80))

        bottlenecks = [s for s in sections if s[1] > 5]  # Sections taking > 5 seconds
        if bottlenecks:
            for name, elapsed in bottlenecks:
                self.stdout.write(self.style.ERROR(f'❌ {name}: {elapsed:.2f}s'))
                if 'Client' in name:
                    self.stdout.write('   💡 Fix: Use GROUP BY with aggregations instead of looping')
                elif 'Delivery' in name or 'Order Size' in name:
                    self.stdout.write('   💡 Fix: Use CASE WHEN in SQL aggregation instead of Python loops')
                elif 'Product' in name or 'Geographical' in name:
                    self.stdout.write('   💡 Fix: Use GROUP BY with aggregations instead of looping')
        else:
            self.stdout.write(self.style.SUCCESS('✅ No major bottlenecks detected'))

        self.stdout.write('\n💡 Recommendations:')
        self.stdout.write('   1. Replace Python loops with SQL GROUP BY aggregations')
        self.stdout.write('   2. Use Django CASE/WHEN for conditional aggregations')
        self.stdout.write('   3. Consider database indexing on frequently queried fields')
        self.stdout.write('   4. Ensure analytics cache is working properly')
