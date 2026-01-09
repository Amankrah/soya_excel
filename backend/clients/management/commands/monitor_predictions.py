"""
Django management command to monitor prediction health
Checks for stale predictions, failures, and system issues
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from datetime import timedelta
from clients.models import Client
from clients.services import get_prediction_service
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Monitor prediction system health and send alerts'

    def add_arguments(self, parser):
        parser.add_argument(
            '--send-email',
            action='store_true',
            help='Send email alerts if issues found',
        )
        parser.add_argument(
            '--alert-threshold',
            type=int,
            default=70,
            help='Alert if success rate below this percentage (default: 70)',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.HTTP_INFO('='*80))
        self.stdout.write(self.style.HTTP_INFO('PREDICTION SYSTEM HEALTH MONITORING'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        issues = []
        warnings = []
        stats = {}

        # Check 1: Model status
        self.stdout.write('\n' + self.style.HTTP_INFO('[1] Checking Model Status...'))
        prediction_service = get_prediction_service()

        if not prediction_service.model_loaded:
            issue = '❌ CRITICAL: Prediction model not loaded'
            issues.append(issue)
            self.stdout.write(self.style.ERROR(f'   {issue}'))
        else:
            self.stdout.write(self.style.SUCCESS('   ✅ Model loaded successfully'))

        # Check 2: Stale predictions
        self.stdout.write('\n' + self.style.HTTP_INFO('[2] Checking for Stale Predictions...'))

        stale_threshold = timezone.now() - timedelta(days=7)
        stale_clients = Client.objects.filter(
            is_active=True,
            last_prediction_update__lt=stale_threshold
        ).exclude(last_prediction_update__isnull=True)

        never_predicted = Client.objects.filter(
            is_active=True,
            last_prediction_update__isnull=True,
            orders__status='delivered'
        ).distinct()

        stats['stale_predictions'] = stale_clients.count()
        stats['never_predicted'] = never_predicted.count()

        if stats['stale_predictions'] > 0:
            warning = f'⚠️  {stats["stale_predictions"]} clients with stale predictions (>7 days)'
            warnings.append(warning)
            self.stdout.write(self.style.WARNING(f'   {warning}'))
        else:
            self.stdout.write(self.style.SUCCESS('   ✅ No stale predictions'))

        if stats['never_predicted'] > 0:
            warning = f'⚠️  {stats["never_predicted"]} active clients never predicted'
            warnings.append(warning)
            self.stdout.write(self.style.WARNING(f'   {warning}'))

        # Check 3: Prediction coverage
        self.stdout.write('\n' + self.style.HTTP_INFO('[3] Checking Prediction Coverage...'))

        total_active = Client.objects.filter(is_active=True).count()
        with_predictions = Client.objects.filter(
            is_active=True,
            predicted_next_order_date__isnull=False
        ).count()

        if total_active > 0:
            coverage_rate = (with_predictions / total_active) * 100
            stats['coverage_rate'] = coverage_rate
            stats['total_active'] = total_active
            stats['with_predictions'] = with_predictions

            self.stdout.write(f'   Active clients: {total_active}')
            self.stdout.write(f'   With predictions: {with_predictions}')
            self.stdout.write(f'   Coverage rate: {coverage_rate:.1f}%')

            if coverage_rate < 80:
                warning = f'⚠️  Low prediction coverage: {coverage_rate:.1f}% (target: 80%)'
                warnings.append(warning)
                self.stdout.write(self.style.WARNING(f'   {warning}'))
            else:
                self.stdout.write(self.style.SUCCESS(f'   ✅ Good coverage: {coverage_rate:.1f}%'))
        else:
            self.stdout.write(self.style.WARNING('   ⚠️  No active clients found'))

        # Check 4: Recent prediction success rate
        self.stdout.write('\n' + self.style.HTTP_INFO('[4] Checking Recent Success Rate...'))

        recent_threshold = timezone.now() - timedelta(hours=24)
        recently_updated = Client.objects.filter(
            last_prediction_update__gte=recent_threshold
        ).count()

        stats['recently_updated'] = recently_updated

        if recently_updated == 0:
            issue = '❌ CRITICAL: No predictions updated in last 24 hours'
            issues.append(issue)
            self.stdout.write(self.style.ERROR(f'   {issue}'))
        else:
            self.stdout.write(self.style.SUCCESS(f'   ✅ {recently_updated} clients updated in last 24h'))

        # Check 5: Urgent clients
        self.stdout.write('\n' + self.style.HTTP_INFO('[5] Checking Urgent Clients...'))

        urgent_threshold = timezone.now() + timedelta(days=3)
        urgent_clients = Client.objects.filter(
            is_active=True,
            predicted_next_order_date__isnull=False,
            predicted_next_order_date__lte=urgent_threshold
        ).order_by('predicted_next_order_date')

        overdue_clients = Client.objects.filter(
            is_active=True,
            predicted_next_order_date__isnull=False,
            predicted_next_order_date__lt=timezone.now()
        )

        stats['urgent_count'] = urgent_clients.count()
        stats['overdue_count'] = overdue_clients.count()

        self.stdout.write(f'   Urgent (≤3 days): {stats["urgent_count"]}')
        self.stdout.write(f'   Overdue: {stats["overdue_count"]}')

        if stats['overdue_count'] > 0:
            self.stdout.write(self.style.WARNING(f'   ⚠️  {stats["overdue_count"]} overdue predictions'))
            # Show top 5 overdue
            for client in overdue_clients[:5]:
                days_overdue = (timezone.now() - client.predicted_next_order_date).days
                self.stdout.write(f'      • {client.name}: {days_overdue} days overdue')

        # Check 6: Data quality issues
        self.stdout.write('\n' + self.style.HTTP_INFO('[6] Checking Data Quality...'))

        clients_with_orders = Client.objects.filter(
            is_active=True,
            orders__status='delivered'
        ).distinct()

        insufficient_data = []
        for client in clients_with_orders:
            order_count = client.orders.filter(status='delivered').count()
            if order_count < 3 and client.predicted_next_order_date is None:
                insufficient_data.append(client)

        stats['insufficient_data'] = len(insufficient_data)

        if stats['insufficient_data'] > 0:
            self.stdout.write(self.style.WARNING(
                f'   ⚠️  {stats["insufficient_data"]} clients with insufficient data (<3 orders)'
            ))
        else:
            self.stdout.write(self.style.SUCCESS('   ✅ All eligible clients have sufficient data'))

        # Summary
        self.stdout.write('\n' + self.style.HTTP_INFO('='*80))
        self.stdout.write(self.style.HTTP_INFO('MONITORING SUMMARY'))
        self.stdout.write(self.style.HTTP_INFO('='*80))

        # Overall health score
        health_score = 100
        if issues:
            health_score -= len(issues) * 30
        if warnings:
            health_score -= len(warnings) * 10
        health_score = max(0, health_score)

        self.stdout.write(f'\n📊 System Health Score: {health_score}/100')

        if issues:
            self.stdout.write('\n' + self.style.ERROR('🔴 CRITICAL ISSUES:'))
            for issue in issues:
                self.stdout.write(f'   {issue}')

        if warnings:
            self.stdout.write('\n' + self.style.WARNING('⚠️  WARNINGS:'))
            for warning in warnings:
                self.stdout.write(f'   {warning}')

        if not issues and not warnings:
            self.stdout.write('\n' + self.style.SUCCESS('✅ All systems operational'))

        # Send email alert if requested
        if options['send_email'] and (issues or health_score < options['alert_threshold']):
            self._send_alert_email(issues, warnings, stats, health_score)

        self.stdout.write('\n' + self.style.HTTP_INFO('='*80))
        self.stdout.write('💡 TIP: Run this command daily via cron to monitor system health')
        self.stdout.write(self.style.HTTP_INFO('='*80 + '\n'))

        # Exit with error code if critical issues
        if issues:
            exit(1)

    def _send_alert_email(self, issues, warnings, stats, health_score):
        """Send email alert about system health"""
        try:
            subject = f'🚨 Soya Excel Prediction System Alert - Health Score: {health_score}/100'

            message = f"""
Prediction System Health Report
================================

Health Score: {health_score}/100

CRITICAL ISSUES ({len(issues)}):
{chr(10).join('- ' + issue for issue in issues) if issues else 'None'}

WARNINGS ({len(warnings)}):
{chr(10).join('- ' + warning for warning in warnings) if warnings else 'None'}

STATISTICS:
- Active clients: {stats.get('total_active', 'N/A')}
- With predictions: {stats.get('with_predictions', 'N/A')}
- Coverage rate: {stats.get('coverage_rate', 0):.1f}%
- Stale predictions: {stats.get('stale_predictions', 0)}
- Never predicted: {stats.get('never_predicted', 0)}
- Recently updated (24h): {stats.get('recently_updated', 0)}
- Urgent clients: {stats.get('urgent_count', 0)}
- Overdue clients: {stats.get('overdue_count', 0)}

ACTION REQUIRED:
1. Review critical issues immediately
2. Run: python manage.py update_predictions
3. Check logs for errors
4. Verify model files are present

Timestamp: {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}
"""

            # Get recipient email from settings
            recipients = getattr(settings, 'PREDICTION_ALERT_EMAILS', [])

            if not recipients:
                self.stdout.write(self.style.WARNING(
                    '\n⚠️  No alert emails configured. Add PREDICTION_ALERT_EMAILS to settings.py'
                ))
                return

            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=recipients,
                fail_silently=False,
            )

            self.stdout.write(self.style.SUCCESS(
                f'\n✅ Alert email sent to {len(recipients)} recipient(s)'
            ))

        except Exception as e:
            self.stdout.write(self.style.ERROR(
                f'\n❌ Failed to send alert email: {str(e)}'
            ))
