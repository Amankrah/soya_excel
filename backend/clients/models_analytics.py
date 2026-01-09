"""
Analytics caching models to avoid recalculating on every page load
"""

from django.db import models
from django.utils import timezone


class AnalyticsCache(models.Model):
    """
    Stores pre-calculated analytics to avoid expensive recalculation on every request.
    Analytics are only recalculated when:
    1. New orders are created/updated
    2. Manager manually clicks "Update Analytics"
    3. Cache is older than a certain threshold
    """

    # Metadata
    cache_key = models.CharField(max_length=255, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Analytics data (stored as JSON)
    data = models.JSONField()

    # Tracking
    order_count_at_cache = models.IntegerField(help_text="Number of orders when cache was generated")
    last_order_date = models.DateTimeField(null=True, blank=True, help_text="Latest order date when cache was generated")

    class Meta:
        db_table = 'analytics_cache'
        indexes = [
            models.Index(fields=['cache_key', 'updated_at']),
        ]

    def __str__(self):
        return f"Analytics Cache: {self.cache_key} (updated {self.updated_at})"

    def is_stale(self, max_age_minutes=60):
        """Check if cache is older than specified minutes"""
        age = timezone.now() - self.updated_at
        return age.total_seconds() > (max_age_minutes * 60)

    @classmethod
    def get_or_compute(cls, cache_key, compute_func, force_refresh=False, max_age_minutes=60):
        """
        Get cached analytics or compute if missing/stale

        Args:
            cache_key: Unique identifier for this analytics type
            compute_func: Function that computes the analytics (should return dict)
            force_refresh: If True, always recompute
            max_age_minutes: Maximum age before cache is considered stale

        Returns:
            dict: Analytics data
        """
        from clients.models import Order

        # Get current order stats
        current_order_count = Order.objects.count()
        latest_order = Order.objects.order_by('-sales_order_creation_date').first()
        latest_order_date = latest_order.sales_order_creation_date if latest_order else None

        try:
            cache = cls.objects.get(cache_key=cache_key)

            # Check if cache needs refresh
            needs_refresh = (
                force_refresh or
                cache.is_stale(max_age_minutes) or
                cache.order_count_at_cache != current_order_count or
                (latest_order_date and cache.last_order_date != latest_order_date)
            )

            if not needs_refresh:
                # Cache is fresh, return it
                return cache.data

            # Cache is stale, recompute
            print(f"♻️  Analytics cache stale for {cache_key}, recomputing...")
            data = compute_func()

            cache.data = data
            cache.order_count_at_cache = current_order_count
            cache.last_order_date = latest_order_date
            cache.save()

            return data

        except cls.DoesNotExist:
            # No cache exists, compute and create
            print(f"🔄 No analytics cache found for {cache_key}, computing...")
            data = compute_func()

            cls.objects.create(
                cache_key=cache_key,
                data=data,
                order_count_at_cache=current_order_count,
                last_order_date=latest_order_date
            )

            return data

    @classmethod
    def invalidate(cls, cache_key=None):
        """
        Invalidate cache(s)

        Args:
            cache_key: Specific cache to invalidate, or None to invalidate all
        """
        if cache_key:
            cls.objects.filter(cache_key=cache_key).delete()
            print(f"🗑️  Invalidated cache: {cache_key}")
        else:
            count = cls.objects.count()
            cls.objects.all().delete()
            print(f"🗑️  Invalidated all {count} analytics caches")
