"""
Route Notification Service

Handles sending route assignments and updates to drivers via:
- Email (Django email backend)
- SMS (Twilio integration - optional)
- Push notifications (Firebase - optional)
"""

import logging
from typing import Dict, Optional
from django.core.mail import send_mail, EmailMultiAlternatives
from django.template.loader import render_to_string
from django.conf import settings
from django.utils.html import strip_tags

logger = logging.getLogger(__name__)


class RouteNotificationService:
    """
    Service for sending route notifications to drivers.
    """

    def __init__(self):
        self.email_enabled = self._check_email_configured()
        self.sms_enabled = self._check_sms_configured()

    def _check_email_configured(self) -> bool:
        """Check if email is properly configured"""
        return bool(
            getattr(settings, 'EMAIL_HOST', None) and
            getattr(settings, 'DEFAULT_FROM_EMAIL', None)
        )

    def _check_sms_configured(self) -> bool:
        """Check if SMS (Twilio) is configured"""
        return bool(
            getattr(settings, 'TWILIO_ACCOUNT_SID', None) and
            getattr(settings, 'TWILIO_AUTH_TOKEN', None) and
            getattr(settings, 'TWILIO_PHONE_NUMBER', None)
        )

    def send_route_assignment(
        self,
        driver,
        route,
        route_summary: Dict,
        method: str = 'email'
    ) -> Dict:
        """
        Send route assignment notification to driver.

        Args:
            driver: Driver instance
            route: Route instance
            route_summary: Route summary dict with navigation URLs
            method: 'email', 'sms', or 'both'

        Returns:
            Dict with notification status
        """
        results = {
            'email_sent': False,
            'sms_sent': False,
            'errors': []
        }

        # Send email
        if method in ['email', 'both']:
            email_result = self._send_email_notification(driver, route, route_summary)
            results['email_sent'] = email_result['success']
            if not email_result['success']:
                results['errors'].append(email_result.get('error'))

        # Send SMS
        if method in ['sms', 'both']:
            sms_result = self._send_sms_notification(driver, route, route_summary)
            results['sms_sent'] = sms_result['success']
            if not sms_result['success']:
                results['errors'].append(sms_result.get('error'))

        return results

    def _send_email_notification(
        self,
        driver,
        route,
        route_summary: Dict
    ) -> Dict:
        """Send email notification with route details"""
        if not self.email_enabled:
            return {
                'success': False,
                'error': 'Email not configured. Set EMAIL_HOST and DEFAULT_FROM_EMAIL in settings.'
            }

        try:
            # Get driver email
            driver_email = None
            if hasattr(driver, 'user') and driver.user:
                driver_email = driver.user.email
            elif hasattr(driver, 'email'):
                driver_email = driver.email

            if not driver_email:
                return {
                    'success': False,
                    'error': 'Driver has no email address'
                }

            # Prepare email context
            context = {
                'driver_name': driver.full_name if hasattr(driver, 'full_name') else driver.name,
                'route_name': route.name,
                'route_date': route.date,
                'total_stops': route.stops.count(),
                'total_distance_km': float(route.total_distance) if route.total_distance else 0,
                'estimated_duration_minutes': route.estimated_duration,
                'google_maps_url': route_summary.get('navigation_urls', {}).get('mobile', ''),
                'stops': route_summary.get('stops', []),
                'warehouse': route_summary.get('origin_warehouse', {}),
                'instructions': route_summary.get('instructions', {}),
            }

            # Render email templates
            subject = f'Route Assignment: {route.name}'

            # HTML email template
            html_message = self._render_email_template(context)

            # Plain text version
            plain_message = f"""
Hello {context['driver_name']},

You have been assigned a new route:

Route: {context['route_name']}
Date: {context['route_date']}
Total Stops: {context['total_stops']}
Estimated Distance: {context['total_distance_km']} km
Estimated Duration: {context['estimated_duration_minutes']} minutes

Open route in Google Maps: {context['google_maps_url']}

Please review the route details and be ready for delivery on the scheduled date.

Best regards,
Soya Excel Management
            """.strip()

            # Send email
            email = EmailMultiAlternatives(
                subject=subject,
                body=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[driver_email]
            )

            if html_message:
                email.attach_alternative(html_message, "text/html")

            email.send(fail_silently=False)

            logger.info(f"Route assignment email sent to {driver_email} for route {route.id}")

            return {
                'success': True,
                'email': driver_email,
                'message': 'Email sent successfully'
            }

        except Exception as e:
            logger.error(f"Error sending email notification: {str(e)}")
            return {
                'success': False,
                'error': f'Email error: {str(e)}'
            }

    def _render_email_template(self, context: Dict) -> Optional[str]:
        """Render HTML email template"""
        try:
            # You can create a proper HTML template in templates/emails/route_assignment.html
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: #2563eb; color: white; padding: 20px; border-radius: 5px 5px 0 0; }}
        .content {{ background: #f9fafb; padding: 20px; }}
        .button {{
            display: inline-block;
            background: #10b981;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
        }}
        .info-box {{ background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #2563eb; }}
        .stop-list {{ list-style: none; padding: 0; }}
        .stop-item {{ background: white; padding: 10px; margin: 5px 0; border-radius: 3px; }}
        .footer {{ text-align: center; color: #6b7280; padding: 20px; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚛 New Route Assignment</h1>
        </div>

        <div class="content">
            <p>Hello <strong>{context['driver_name']}</strong>,</p>

            <p>You have been assigned a new delivery route:</p>

            <div class="info-box">
                <h3>{context['route_name']}</h3>
                <p><strong>📅 Date:</strong> {context['route_date']}</p>
                <p><strong>📍 Total Stops:</strong> {context['total_stops']}</p>
                <p><strong>🛣️ Distance:</strong> {context['total_distance_km']} km</p>
                <p><strong>⏱️ Estimated Duration:</strong> {context['estimated_duration_minutes']} minutes</p>
            </div>

            <center>
                <a href="{context['google_maps_url']}" class="button">
                    🗺️ Open Route in Google Maps
                </a>
            </center>

            <h3>Pre-Departure Checklist:</h3>
            <ul>
                <li>✓ Verify all delivery paperwork is complete</li>
                <li>✓ Check vehicle fuel level and tire pressure</li>
                <li>✓ Confirm all products are loaded correctly</li>
                <li>✓ Review special delivery instructions</li>
            </ul>

            <p><em>Please review the route in Google Maps and confirm you're ready for the scheduled delivery date.</em></p>
        </div>

        <div class="footer">
            <p>Soya Excel Management System</p>
            <p>This is an automated notification. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
            """
            return html_content
        except Exception as e:
            logger.warning(f"Error rendering email template: {str(e)}")
            return None

    def _send_sms_notification(
        self,
        driver,
        route,
        route_summary: Dict
    ) -> Dict:
        """Send SMS notification via Twilio"""
        if not self.sms_enabled:
            return {
                'success': False,
                'error': 'SMS not configured. Set Twilio credentials in settings.'
            }

        try:
            # Import Twilio (optional dependency)
            try:
                from twilio.rest import Client
            except ImportError:
                return {
                    'success': False,
                    'error': 'Twilio library not installed. Run: pip install twilio'
                }

            # Get driver phone
            driver_phone = driver.phone_number if hasattr(driver, 'phone_number') else None
            if not driver_phone:
                return {
                    'success': False,
                    'error': 'Driver has no phone number'
                }

            # Format phone number (must be in E.164 format)
            if not driver_phone.startswith('+'):
                driver_phone = f'+1{driver_phone}'  # Assume North America

            # Initialize Twilio client
            client = Client(
                settings.TWILIO_ACCOUNT_SID,
                settings.TWILIO_AUTH_TOKEN
            )

            # Prepare SMS message
            google_maps_url = route_summary.get('navigation_urls', {}).get('mobile', '')
            message_body = (
                f"Route Assignment: {route.name}\n"
                f"Date: {route.date}\n"
                f"Stops: {route.stops.count()}\n"
                f"Maps: {google_maps_url}\n"
                f"- Soya Excel"
            )

            # Send SMS
            message = client.messages.create(
                body=message_body,
                from_=settings.TWILIO_PHONE_NUMBER,
                to=driver_phone
            )

            logger.info(f"SMS sent to {driver_phone} for route {route.id}, SID: {message.sid}")

            return {
                'success': True,
                'phone': driver_phone,
                'message_sid': message.sid,
                'message': 'SMS sent successfully'
            }

        except Exception as e:
            logger.error(f"Error sending SMS notification: {str(e)}")
            return {
                'success': False,
                'error': f'SMS error: {str(e)}'
            }

    def send_route_update(
        self,
        driver,
        route,
        update_type: str,
        message: str,
        method: str = 'email'
    ) -> Dict:
        """
        Send route update notification.

        Args:
            driver: Driver instance
            route: Route instance
            update_type: 'modified', 'cancelled', 'delayed', etc.
            message: Update message
            method: 'email', 'sms', or 'both'
        """
        results = {
            'email_sent': False,
            'sms_sent': False,
            'errors': []
        }

        if method in ['email', 'both'] and self.email_enabled:
            try:
                driver_email = (
                    driver.user.email if hasattr(driver, 'user') and driver.user
                    else getattr(driver, 'email', None)
                )

                if driver_email:
                    subject = f'Route Update: {route.name}'
                    send_mail(
                        subject=subject,
                        message=f"Route Update ({update_type}):\n\n{message}",
                        from_email=settings.DEFAULT_FROM_EMAIL,
                        recipient_list=[driver_email],
                        fail_silently=False
                    )
                    results['email_sent'] = True
            except Exception as e:
                results['errors'].append(f'Email: {str(e)}')

        if method in ['sms', 'both'] and self.sms_enabled:
            try:
                from twilio.rest import Client

                driver_phone = getattr(driver, 'phone_number', None)
                if driver_phone:
                    if not driver_phone.startswith('+'):
                        driver_phone = f'+1{driver_phone}'

                    client = Client(
                        settings.TWILIO_ACCOUNT_SID,
                        settings.TWILIO_AUTH_TOKEN
                    )

                    client.messages.create(
                        body=f"Route Update: {route.name}\n{message}",
                        from_=settings.TWILIO_PHONE_NUMBER,
                        to=driver_phone
                    )
                    results['sms_sent'] = True
            except Exception as e:
                results['errors'].append(f'SMS: {str(e)}')

        return results
