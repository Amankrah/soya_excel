"""
Client Geographic Clustering Service for SoyaFlow.

This module provides clustering functionality for organizing clients
into geographic groups for optimized distribution planning.

Supports:
- DBSCAN: Density-based clustering (auto-determines cluster count)
- KMeans: Partition-based clustering (requires cluster count specification)

The clustering is based on client coordinates and helps with:
- Route optimization
- Regional distribution planning
- Warehouse assignment
- Delivery zone management
"""

import logging
from typing import List, Dict, Optional, Tuple, Any
from decimal import Decimal
from datetime import datetime

import numpy as np
from sklearn.cluster import DBSCAN, KMeans
from geopy.distance import geodesic

from django.db import transaction
from django.utils import timezone

from .models import Client

logger = logging.getLogger(__name__)


class ClientClusteringService:
    """
    Service for clustering clients by geographic proximity.
    
    Features:
    - DBSCAN clustering for density-based groupings (auto cluster count)
    - KMeans clustering for balanced groupings (fixed cluster count)
    - Automatic cluster labeling based on centroid location
    - Distance calculation from client to cluster centroid
    """
    
    # Default clustering parameters
    DEFAULT_DBSCAN_EPS_KM = 50.0  # 50km radius for clustering
    DEFAULT_DBSCAN_MIN_SAMPLES = 2  # Minimum 2 clients per cluster
    DEFAULT_KMEANS_CLUSTERS = 10  # Default number of clusters for KMeans
    
    # Earth's radius in km for haversine calculations
    EARTH_RADIUS_KM = 6371.0
    
    def __init__(self):
        """Initialize the clustering service."""
        pass
    
    def cluster_all_clients(
        self,
        method: str = 'dbscan',
        eps_km: float = None,
        min_samples: int = None,
        n_clusters: int = None,
        warehouse_id: int = None,
        active_only: bool = True
    ) -> Dict[str, Any]:
        """
        Cluster all clients with valid coordinates.
        
        Args:
            method: Clustering algorithm ('dbscan' or 'kmeans')
            eps_km: DBSCAN - max distance between points in km
            min_samples: DBSCAN - minimum points per cluster
            n_clusters: KMeans - number of clusters to create
            warehouse_id: Optional warehouse ID for regional reference
            active_only: Only cluster active clients
            
        Returns:
            Dictionary with clustering results and statistics
        """
        # Get clients with coordinates
        queryset = Client.objects.filter(
            latitude__isnull=False,
            longitude__isnull=False
        )
        
        if active_only:
            queryset = queryset.filter(is_active=True)
        
        clients = list(queryset)
        
        if len(clients) < 2:
            return {
                'success': False,
                'error': 'Need at least 2 clients with coordinates for clustering',
                'clients_found': len(clients)
            }
        
        logger.info(f"Clustering {len(clients)} clients using {method} method")
        
        # Extract coordinates
        coordinates = np.array([
            [float(c.latitude), float(c.longitude)]
            for c in clients
        ])
        
        # Perform clustering based on method
        if method.lower() == 'kmeans':
            labels = self._cluster_kmeans(
                coordinates,
                n_clusters=n_clusters or self.DEFAULT_KMEANS_CLUSTERS
            )
        else:
            # Default to DBSCAN
            labels = self._cluster_dbscan(
                coordinates,
                eps_km=eps_km or self.DEFAULT_DBSCAN_EPS_KM,
                min_samples=min_samples or self.DEFAULT_DBSCAN_MIN_SAMPLES
            )
        
        # Calculate cluster centroids and statistics
        unique_labels = set(labels)
        cluster_stats = self._calculate_cluster_statistics(
            clients, labels, coordinates
        )
        
        # Generate cluster labels based on location
        cluster_labels = self._generate_cluster_labels(cluster_stats)
        
        # Update clients in database
        updated_count = self._update_client_clusters(
            clients, labels, cluster_stats, cluster_labels, method
        )
        
        # Handle noise points (label -1 in DBSCAN)
        noise_count = np.sum(labels == -1)
        
        return {
            'success': True,
            'method': method,
            'total_clients': len(clients),
            'clustered_clients': updated_count,
            'num_clusters': len([l for l in unique_labels if l >= 0]),
            'noise_points': noise_count,
            'cluster_statistics': cluster_stats,
            'cluster_labels': cluster_labels,
            'parameters': {
                'eps_km': eps_km if method == 'dbscan' else None,
                'min_samples': min_samples if method == 'dbscan' else None,
                'n_clusters': n_clusters if method == 'kmeans' else None
            },
            'timestamp': timezone.now().isoformat()
        }
    
    def _cluster_dbscan(
        self,
        coordinates: np.ndarray,
        eps_km: float = 50.0,
        min_samples: int = 2
    ) -> np.ndarray:
        """
        Cluster coordinates using DBSCAN algorithm.
        
        DBSCAN is density-based and automatically determines cluster count.
        Good for irregular geographic distributions and detecting outliers.
        
        Args:
            coordinates: numpy array of [lat, lng] pairs
            eps_km: Maximum distance (in km) between two points
            min_samples: Minimum points required to form a cluster
            
        Returns:
            Array of cluster labels (-1 for noise/outliers)
        """
        try:
            # Convert eps from km to radians for haversine metric
            # haversine distance = 2 * arcsin(sqrt(...))
            # For small distances, eps_radians ≈ eps_km / EARTH_RADIUS_KM
            eps_radians = eps_km / self.EARTH_RADIUS_KM
            
            clustering = DBSCAN(
                eps=eps_radians,
                min_samples=min_samples,
                metric='haversine',
                algorithm='ball_tree'
            )
            
            # Convert coordinates to radians for haversine
            coords_rad = np.radians(coordinates)
            labels = clustering.fit_predict(coords_rad)
            
            logger.info(
                f"DBSCAN clustering complete: "
                f"{len(set(labels)) - (1 if -1 in labels else 0)} clusters, "
                f"{np.sum(labels == -1)} noise points"
            )
            
            return labels
            
        except Exception as e:
            logger.error(f"Error in DBSCAN clustering: {str(e)}")
            # Fallback: assign all to single cluster
            return np.zeros(len(coordinates), dtype=int)
    
    def _cluster_kmeans(
        self,
        coordinates: np.ndarray,
        n_clusters: int = 10
    ) -> np.ndarray:
        """
        Cluster coordinates using K-Means algorithm.
        
        K-Means requires specifying cluster count but produces balanced groups.
        Good for evenly distributed clients and when cluster count is known.
        
        Args:
            coordinates: numpy array of [lat, lng] pairs
            n_clusters: Number of clusters to create
            
        Returns:
            Array of cluster labels (0 to n_clusters-1)
        """
        try:
            # Ensure n_clusters doesn't exceed number of points
            actual_clusters = min(n_clusters, len(coordinates))
            
            clustering = KMeans(
                n_clusters=actual_clusters,
                random_state=42,
                n_init=10,
                max_iter=300
            )
            
            labels = clustering.fit_predict(coordinates)
            
            logger.info(
                f"KMeans clustering complete: {actual_clusters} clusters"
            )
            
            return labels
            
        except Exception as e:
            logger.error(f"Error in K-Means clustering: {str(e)}")
            # Fallback: assign all to single cluster
            return np.zeros(len(coordinates), dtype=int)
    
    def _calculate_cluster_statistics(
        self,
        clients: List[Client],
        labels: np.ndarray,
        coordinates: np.ndarray
    ) -> Dict[int, Dict]:
        """
        Calculate statistics for each cluster.
        
        Returns dict with centroid, client count, avg distance, etc.
        """
        cluster_stats = {}
        unique_labels = set(labels)
        
        for label in unique_labels:
            if label == -1:
                # Noise points
                noise_indices = np.where(labels == label)[0]
                cluster_stats[-1] = {
                    'centroid_lat': None,
                    'centroid_lng': None,
                    'client_count': len(noise_indices),
                    'avg_distance_to_centroid_km': None,
                    'max_distance_km': None,
                    'client_ids': [clients[i].id for i in noise_indices],
                    'is_noise': True
                }
                continue
            
            # Get indices for this cluster
            cluster_indices = np.where(labels == label)[0]
            cluster_coords = coordinates[cluster_indices]
            
            # Calculate centroid
            centroid_lat = np.mean(cluster_coords[:, 0])
            centroid_lng = np.mean(cluster_coords[:, 1])
            
            # Calculate distances to centroid
            distances = []
            for i in cluster_indices:
                dist = geodesic(
                    (coordinates[i][0], coordinates[i][1]),
                    (centroid_lat, centroid_lng)
                ).kilometers
                distances.append(dist)
            
            cluster_stats[label] = {
                'centroid_lat': float(centroid_lat),
                'centroid_lng': float(centroid_lng),
                'client_count': len(cluster_indices),
                'avg_distance_to_centroid_km': float(np.mean(distances)) if distances else 0,
                'max_distance_km': float(np.max(distances)) if distances else 0,
                'client_ids': [clients[i].id for i in cluster_indices],
                'client_distances_km': {
                    clients[i].id: float(distances[j])
                    for j, i in enumerate(cluster_indices)
                },
                'is_noise': False
            }
        
        return cluster_stats
    
    def _generate_cluster_labels(
        self,
        cluster_stats: Dict[int, Dict]
    ) -> Dict[int, str]:
        """
        Generate human-readable labels for clusters based on centroid.
        
        Uses reverse geocoding or regional naming conventions.
        """
        cluster_labels = {}
        
        # Quebec region centroids (approximate)
        QUEBEC_REGIONS = [
            ('Montreal Region', 45.5017, -73.5673, 100),
            ('Quebec City Region', 46.8139, -71.2080, 100),
            ('Trois-Rivières Region', 46.3432, -72.5424, 80),
            ('Sherbrooke Region', 45.4042, -71.8929, 80),
            ('Gatineau Region', 45.4765, -75.7013, 80),
            ('Saguenay Region', 48.4280, -71.0686, 100),
            ('Rimouski Region', 48.4489, -68.5230, 100),
            ('Chicoutimi Region', 48.4272, -71.0653, 80),
            ('Drummondville Region', 45.8803, -72.4845, 60),
            ('Granby Region', 45.4001, -72.7333, 60),
            ('Saint-Hyacinthe Region', 45.6307, -72.9571, 60),
            ('Victoriaville Region', 46.0500, -71.9667, 60),
        ]
        
        for label, stats in cluster_stats.items():
            if label == -1 or stats.get('is_noise'):
                cluster_labels[-1] = 'Outlier/Noise Points'
                continue
            
            centroid_lat = stats['centroid_lat']
            centroid_lng = stats['centroid_lng']
            
            # Find closest known region
            closest_region = None
            closest_distance = float('inf')
            
            for region_name, reg_lat, reg_lng, threshold in QUEBEC_REGIONS:
                dist = geodesic(
                    (centroid_lat, centroid_lng),
                    (reg_lat, reg_lng)
                ).kilometers
                
                if dist < closest_distance and dist < threshold:
                    closest_distance = dist
                    closest_region = region_name
            
            if closest_region:
                cluster_labels[label] = closest_region
            else:
                # Fallback to generic label
                cluster_labels[label] = f"Cluster {label + 1} ({centroid_lat:.2f}, {centroid_lng:.2f})"
        
        return cluster_labels
    
    @transaction.atomic
    def _update_client_clusters(
        self,
        clients: List[Client],
        labels: np.ndarray,
        cluster_stats: Dict[int, Dict],
        cluster_labels: Dict[int, str],
        method: str
    ) -> int:
        """
        Update client records with cluster assignments.
        
        Returns count of updated clients.
        """
        updated_count = 0
        now = timezone.now()
        
        for i, client in enumerate(clients):
            label = int(labels[i])
            
            client.cluster_id = label if label >= 0 else None
            client.cluster_label = cluster_labels.get(label, '')
            client.cluster_method = method
            client.cluster_updated_at = now
            
            # Calculate distance to centroid
            if label >= 0 and label in cluster_stats:
                distances = cluster_stats[label].get('client_distances_km', {})
                client.cluster_distance_to_centroid = Decimal(
                    str(round(distances.get(client.id, 0), 4))
                )
            else:
                client.cluster_distance_to_centroid = None
            
            client.save(update_fields=[
                'cluster_id',
                'cluster_label',
                'cluster_method',
                'cluster_distance_to_centroid',
                'cluster_updated_at'
            ])
            updated_count += 1
        
        logger.info(f"Updated cluster assignments for {updated_count} clients")
        return updated_count
    
    def get_cluster_summary(self) -> Dict[str, Any]:
        """
        Get summary of current client clustering state.
        
        Returns statistics about existing clusters.
        """
        from django.db.models import Count, Avg, Max, Min
        
        # Get clients with cluster assignments
        clustered = Client.objects.filter(
            cluster_id__isnull=False,
            is_active=True
        )
        
        unclustered = Client.objects.filter(
            cluster_id__isnull=True,
            is_active=True,
            latitude__isnull=False,
            longitude__isnull=False
        )
        
        no_coordinates = Client.objects.filter(
            is_active=True,
            latitude__isnull=True
        )
        
        # Group by cluster
        cluster_breakdown = list(
            clustered.values('cluster_id', 'cluster_label', 'cluster_method')
            .annotate(
                client_count=Count('id'),
                avg_distance_to_centroid=Avg('cluster_distance_to_centroid')
            )
            .order_by('cluster_id')
        )
        
        # Get latest update time
        latest_update = clustered.aggregate(
            latest=Max('cluster_updated_at')
        )['latest']
        
        return {
            'total_clustered': clustered.count(),
            'total_unclustered': unclustered.count(),
            'no_coordinates': no_coordinates.count(),
            'cluster_count': len(set(clustered.values_list('cluster_id', flat=True))),
            'clusters': cluster_breakdown,
            'last_updated': latest_update.isoformat() if latest_update else None
        }
    
    def get_clients_by_cluster(
        self,
        cluster_id: int
    ) -> List[Dict]:
        """
        Get all clients in a specific cluster.
        
        Returns list of client details with distances.
        """
        clients = Client.objects.filter(
            cluster_id=cluster_id,
            is_active=True
        ).order_by('cluster_distance_to_centroid')
        
        return [
            {
                'id': c.id,
                'name': c.name,
                'city': c.city,
                'postal_code': c.postal_code,
                'latitude': float(c.latitude) if c.latitude else None,
                'longitude': float(c.longitude) if c.longitude else None,
                'distance_to_centroid_km': float(c.cluster_distance_to_centroid) if c.cluster_distance_to_centroid else None,
                'priority': c.priority,
                'predicted_next_order_date': c.predicted_next_order_date.isoformat() if c.predicted_next_order_date else None
            }
            for c in clients
        ]
    
    def suggest_optimal_clusters(
        self,
        max_clients_per_route: int = 10,
        max_distance_km: int = 300
    ) -> Dict[str, Any]:
        """
        Suggest optimal number of clusters based on constraints.
        
        Uses heuristics based on total clients and distance constraints.
        """
        total_clients = Client.objects.filter(
            is_active=True,
            latitude__isnull=False,
            longitude__isnull=False
        ).count()
        
        if total_clients == 0:
            return {
                'suggested_clusters': 0,
                'method': 'none',
                'reason': 'No clients with coordinates found'
            }
        
        # Calculate suggested clusters
        # Rule: enough clusters so each has ≤ max_clients_per_route clients
        min_clusters_by_count = max(1, total_clients // max_clients_per_route)
        
        # For Quebec (approx 1000km x 500km), estimate regional spread
        # Suggest 8-15 clusters for typical distribution
        suggested = max(
            min_clusters_by_count,
            min(15, max(8, total_clients // 25))
        )
        
        return {
            'total_clients': total_clients,
            'suggested_clusters': suggested,
            'suggested_method': 'dbscan' if total_clients > 50 else 'kmeans',
            'suggested_eps_km': max_distance_km / 6,  # Reasonable cluster radius
            'reasoning': {
                'by_client_count': min_clusters_by_count,
                'max_clients_per_route': max_clients_per_route,
                'max_distance_km': max_distance_km
            }
        }


# Convenience function for external use
def get_clustering_service() -> ClientClusteringService:
    """Get an instance of the ClientClusteringService."""
    return ClientClusteringService()

