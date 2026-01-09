#!/usr/bin/env python
"""Check geocoding status of clients in the database"""
import os
import sys
import django

# Setup Django environment
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'soya_excel_backend.settings')
django.setup()

from clients.models import Client

# Get geocoding statistics
total_clients = Client.objects.count()
with_coords = Client.objects.exclude(latitude__isnull=True).count()
without_coords = total_clients - with_coords
active_clients = Client.objects.filter(is_active=True).count()
active_with_coords = Client.objects.filter(is_active=True).exclude(latitude__isnull=True).count()

print("=" * 60)
print("CLIENT GEOCODING STATUS REPORT")
print("=" * 60)
print(f"\nTotal Clients: {total_clients}")
print(f"Active Clients: {active_clients}")
print(f"\nClients WITH Coordinates: {with_coords} ({with_coords/total_clients*100:.1f}%)")
print(f"Clients WITHOUT Coordinates: {without_coords} ({without_coords/total_clients*100:.1f}%)")
print(f"\nActive WITH Coordinates: {active_with_coords} ({active_with_coords/active_clients*100:.1f}% of active)")
print(f"Active WITHOUT Coordinates: {active_clients - active_with_coords}")

# Show sample clients with and without coordinates
print("\n" + "=" * 60)
print("SAMPLE CLIENTS WITH COORDINATES (First 10):")
print("=" * 60)
for client in Client.objects.exclude(latitude__isnull=True)[:10]:
    print(f"{client.id:4d} | {client.name[:40]:40s} | {client.city[:20]:20s} | ({client.latitude}, {client.longitude})")

print("\n" + "=" * 60)
print("SAMPLE CLIENTS WITHOUT COORDINATES (First 10):")
print("=" * 60)
for client in Client.objects.filter(latitude__isnull=True)[:10]:
    has_address = bool(client.city or client.postal_code)
    print(f"{client.id:4d} | {client.name[:40]:40s} | {client.city[:20]:20s} | {'Has address' if has_address else 'NO ADDRESS'}")

# Check if there are clients with predictions
with_predictions = Client.objects.exclude(predicted_next_order_date__isnull=True).count()
print(f"\n" + "=" * 60)
print(f"Clients with AI Predictions: {with_predictions}")
print(f"Clients without AI Predictions: {total_clients - with_predictions}")
print("=" * 60)
