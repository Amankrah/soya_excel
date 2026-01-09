"""
Django management command to pre-compute and cache analytics
Run this periodically (e.g., hourly via cron/Task Scheduler) or after bulk order imports
"""

from django.core.management.base import BaseCommand
from clients.models_analytics import AnalyticsCache


class Command(BaseCommand):
    help = 'Pre-compute and cache analytics to improve performance'

    def handle(self, *args, **options):
        self.stdout.write(self.style.HTTP_INFO('='*80))
        self.stdout.write(self.style.HTTP_INFO('ANALYTICS CACHE UPDATE'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        # Invalidate all caches to force recomputation
        AnalyticsCache.invalidate()

        self.stdout.write(self.style.SUCCESS("\n✅ Analytics cache cleared"))
        self.stdout.write(self.style.WARNING("   Analytics will be recomputed on next API request"))

        self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
        self.stdout.write(self.style.SUCCESS('CACHE UPDATE COMPLETE'))
        self.stdout.write(self.style.HTTP_INFO('='*80 + '\n'))
