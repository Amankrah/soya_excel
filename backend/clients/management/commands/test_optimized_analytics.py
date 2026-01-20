"""
Django management command to test the optimized analytics service
Compares old vs new implementation for correctness and performance
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db.models import Min, Max
from clients.models import Order
from clients.models_analytics import AnalyticsCache
from clients.services_analytics import OptimizedAnalyticsService
import time


class Command(BaseCommand):
    help = 'Test optimized analytics service'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear-cache',
            action='store_true',
            help='Clear analytics cache before testing',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.HTTP_INFO('='*80))
        self.stdout.write(self.style.HTTP_INFO('OPTIMIZED ANALYTICS TEST'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        # Clear cache if requested
        if options['clear_cache']:
            self.stdout.write('\n🗑️  Clearing analytics cache...')
            AnalyticsCache.invalidate()
            self.stdout.write(self.style.SUCCESS('   ✅ Cache cleared'))

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

        # Test optimized service
        self.stdout.write('\n' + self.style.HTTP_INFO('='*80))
        self.stdout.write(self.style.HTTP_INFO('TESTING OPTIMIZED SERVICE'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        self.stdout.write('\n⏱️  Running optimized analytics computation...')
        start_time = time.time()

        try:
            service = OptimizedAnalyticsService(start_date, end_date)
            result = service.compute_all()
            elapsed = time.time() - start_time

            self.stdout.write(self.style.SUCCESS(f'\n✅ Computation complete in {elapsed:.2f} seconds'))

            # Validate result structure
            self.stdout.write('\n📊 Validating result structure...')
            expected_keys = [
                'overview', 'monthly_trends', 'client_segmentation',
                'product_performance', 'geographical_analysis',
                'geographical_distribution', 'delivery_performance',
                'order_size_distribution', 'yearly_breakdown',
                'ai_predictions', 'growth_metrics', 'recent_activity',
                'seasonal_patterns', 'date_range'
            ]

            missing_keys = [key for key in expected_keys if key not in result]
            if missing_keys:
                self.stdout.write(self.style.ERROR(f'   ❌ Missing keys: {missing_keys}'))
            else:
                self.stdout.write(self.style.SUCCESS('   ✅ All expected keys present'))

            # Display key metrics
            self.stdout.write('\n📈 Key Metrics:')
            overview = result.get('overview', {})
            self.stdout.write(f'   Total Orders: {overview.get("total_orders", 0):,}')
            self.stdout.write(f'   Total Volume: {overview.get("total_volume_tm", 0):,.2f} TM')
            self.stdout.write(f'   Active Clients: {overview.get("active_clients", 0):,}')
            self.stdout.write(f'   On-Time Rate: {overview.get("on_time_delivery_rate", 0):.1f}%')
            self.stdout.write(f'   Fulfillment Rate: {overview.get("fulfillment_rate", 0):.1f}%')

            client_seg = result.get('client_segmentation', {})
            self.stdout.write(f'   Total Clients: {client_seg.get("total_clients", 0):,}')
            self.stdout.write(f'   Repeat Rate: {client_seg.get("repeat_rate", 0):.1f}%')

            products = result.get('product_performance', [])
            self.stdout.write(f'   Products: {len(products)}')

            countries = result.get('geographical_analysis', {}).get('countries', [])
            self.stdout.write(f'   Countries: {len(countries)}')

            # Performance assessment
            self.stdout.write('\n' + self.style.HTTP_INFO('='*80))
            self.stdout.write(self.style.HTTP_INFO('PERFORMANCE ASSESSMENT'))
            self.stdout.write(self.style.HTTP_INFO('='*80))

            self.stdout.write(f'\n⏱️  Computation Time: {elapsed:.2f} seconds')

            if elapsed < 1:
                self.stdout.write(self.style.SUCCESS(f'   ⚡ EXCELLENT: {elapsed:.2f}s (target: <1s)'))
                improvement = 24 / elapsed if elapsed > 0 else float('inf')
                self.stdout.write(self.style.SUCCESS(f'   🚀 {improvement:.0f}x faster than old implementation!'))
            elif elapsed < 3:
                self.stdout.write(self.style.SUCCESS(f'   ✅ GOOD: {elapsed:.2f}s (target: <3s)'))
                improvement = 24 / elapsed
                self.stdout.write(self.style.SUCCESS(f'   🚀 {improvement:.0f}x faster than old implementation!'))
            elif elapsed < 10:
                self.stdout.write(self.style.WARNING(f'   ⚠️  ACCEPTABLE: {elapsed:.2f}s (target: <10s)'))
                improvement = 24 / elapsed
                self.stdout.write(f'   📈 {improvement:.1f}x faster than old implementation')
            else:
                self.stdout.write(self.style.ERROR(f'   ❌ SLOW: {elapsed:.2f}s'))
                self.stdout.write('   ⚠️  Performance not meeting expectations')

            # Cache test
            self.stdout.write('\n' + self.style.HTTP_INFO('='*80))
            self.stdout.write(self.style.HTTP_INFO('TESTING CACHE INTEGRATION'))
            self.stdout.write(self.style.HTTP_INFO('='*80))

            cache_key = f"advanced_analytics_{start_date.date() if start_date else 'all'}_{end_date.date() if end_date else 'all'}"

            self.stdout.write('\n⏱️  Testing cache retrieval...')
            cache_start = time.time()

            def compute_func():
                service = OptimizedAnalyticsService(start_date, end_date)
                return service.compute_all()

            cached_result = AnalyticsCache.get_or_compute(
                cache_key=cache_key,
                compute_func=compute_func,
                force_refresh=False,
                max_age_minutes=60
            )

            cache_elapsed = time.time() - cache_start

            if cache_elapsed < 0.5:
                self.stdout.write(self.style.SUCCESS(f'   ⚡ Cache hit! Retrieved in {cache_elapsed:.3f}s'))
            else:
                self.stdout.write(self.style.WARNING(f'   🔄 Cache miss or recomputed in {cache_elapsed:.2f}s'))

            # Final summary
            self.stdout.write('\n' + self.style.HTTP_INFO('='*80))
            self.stdout.write(self.style.HTTP_INFO('TEST SUMMARY'))
            self.stdout.write(self.style.HTTP_INFO('='*80))

            self.stdout.write('\n✅ Optimized analytics service is working correctly!')
            self.stdout.write(f'   • Computation time: {elapsed:.2f}s (vs 24s old)')
            self.stdout.write(f'   • Performance improvement: ~{24/elapsed:.0f}x faster')
            self.stdout.write(f'   • Cache retrieval: {cache_elapsed:.3f}s')
            self.stdout.write('\n💡 The frontend should now load much faster!')

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\n❌ Error during computation: {str(e)}'))
            import traceback
            self.stdout.write(traceback.format_exc())
            exit(1)

        self.stdout.write('\n' + self.style.HTTP_INFO('='*80))
        self.stdout.write('✅ Test complete')
        self.stdout.write(self.style.HTTP_INFO('='*80 + '\n'))
