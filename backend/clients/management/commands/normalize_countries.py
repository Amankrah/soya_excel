from django.core.management.base import BaseCommand
from clients.models import Client


class Command(BaseCommand):
    help = 'Normalize country names to proper capitalization'

    def handle(self, *args, **options):
        # Normalize country names
        country_mapping = {
            'canada': 'Canada',
            'usa': 'USA',
            'spain': 'Spain',
            'mexico': 'Mexico',
            'france': 'France',
            'germany': 'Germany',
            'uk': 'UK',
            'united kingdom': 'United Kingdom',
            'united states': 'United States',
        }

        total_updated = 0

        for old_name, new_name in country_mapping.items():
            # Update all clients with lowercase or incorrect capitalization
            updated = Client.objects.filter(country__iexact=old_name).update(country=new_name)
            if updated > 0:
                self.stdout.write(
                    self.style.SUCCESS(f'Updated {updated} clients from "{old_name}" to "{new_name}"')
                )
                total_updated += updated

        self.stdout.write(
            self.style.SUCCESS(f'\nTotal: Normalized {total_updated} client country names')
        )
