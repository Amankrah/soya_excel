"""
Django management command to update geographic clusters for all clients.

This command runs the clustering algorithm (DBSCAN or KMeans) to group
clients by geographic proximity for optimized distribution planning.

Usage:
    # Default DBSCAN clustering
    python manage.py update_clusters
    
    # KMeans with 10 clusters
    python manage.py update_clusters --method kmeans --n-clusters 10
    
    # DBSCAN with custom parameters
    python manage.py update_clusters --method dbscan --eps-km 75 --min-samples 3
    
    # Show current clustering summary
    python manage.py update_clusters --summary-only
    
    # Show suggested optimal parameters
    python manage.py update_clusters --suggest
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from clients.services_clustering import ClientClusteringService


class Command(BaseCommand):
    help = 'Update geographic clusters for all active clients'

    def add_arguments(self, parser):
        parser.add_argument(
            '--method',
            type=str,
            choices=['dbscan', 'kmeans'],
            default='dbscan',
            help='Clustering algorithm to use (default: dbscan)'
        )
        parser.add_argument(
            '--eps-km',
            type=float,
            default=50.0,
            help='DBSCAN: Maximum distance in km between points (default: 50)'
        )
        parser.add_argument(
            '--min-samples',
            type=int,
            default=2,
            help='DBSCAN: Minimum clients per cluster (default: 2)'
        )
        parser.add_argument(
            '--n-clusters',
            type=int,
            default=10,
            help='KMeans: Number of clusters to create (default: 10)'
        )
        parser.add_argument(
            '--include-inactive',
            action='store_true',
            help='Include inactive clients in clustering'
        )
        parser.add_argument(
            '--summary-only',
            action='store_true',
            help='Only show current clustering summary without updating'
        )
        parser.add_argument(
            '--suggest',
            action='store_true',
            help='Show suggested optimal clustering parameters'
        )
        parser.add_argument(
            '--show-clusters',
            action='store_true',
            help='Show detailed breakdown of each cluster after update'
        )
        parser.add_argument(
            '--cluster-id',
            type=int,
            help='Show clients in a specific cluster ID'
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.HTTP_INFO('=' * 80))
        self.stdout.write(self.style.HTTP_INFO('SOYAFLOW CLIENT GEOGRAPHIC CLUSTERING'))
        self.stdout.write(self.style.HTTP_INFO('=' * 80))
        
        service = ClientClusteringService()
        
        # Show specific cluster details
        if options['cluster_id'] is not None:
            self._show_cluster_details(service, options['cluster_id'])
            return
        
        # Show suggested parameters
        if options['suggest']:
            self._show_suggestions(service)
            return
        
        # Show summary only
        if options['summary_only']:
            self._show_summary(service)
            return
        
        # Perform clustering
        self._run_clustering(service, options)
    
    def _run_clustering(self, service, options):
        """Run the clustering algorithm and update clients."""
        method = options['method']
        
        self.stdout.write(f"\n🔄 Running {method.upper()} clustering...")
        self.stdout.write(f"   Timestamp: {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        
        if method == 'dbscan':
            self.stdout.write(f"   Parameters:")
            self.stdout.write(f"     - eps_km: {options['eps_km']} km")
            self.stdout.write(f"     - min_samples: {options['min_samples']}")
        else:
            self.stdout.write(f"   Parameters:")
            self.stdout.write(f"     - n_clusters: {options['n_clusters']}")
        
        self.stdout.write(f"     - Include inactive: {options['include_inactive']}\n")
        
        # Run clustering
        result = service.cluster_all_clients(
            method=method,
            eps_km=options['eps_km'],
            min_samples=options['min_samples'],
            n_clusters=options['n_clusters'],
            active_only=not options['include_inactive']
        )
        
        if not result['success']:
            self.stdout.write(self.style.ERROR(f"\n❌ Clustering failed: {result.get('error')}"))
            return
        
        # Display results
        self.stdout.write(self.style.HTTP_INFO('\n' + '=' * 80))
        self.stdout.write(self.style.HTTP_INFO('CLUSTERING RESULTS'))
        self.stdout.write(self.style.HTTP_INFO('=' * 80))
        
        self.stdout.write(self.style.SUCCESS(f"\n✅ Clustering completed successfully!"))
        self.stdout.write(f"\n📊 Statistics:")
        self.stdout.write(f"   Total clients processed: {result['total_clients']}")
        self.stdout.write(f"   Clients assigned to clusters: {result['clustered_clients']}")
        self.stdout.write(f"   Number of clusters created: {result['num_clusters']}")
        
        if result['noise_points'] > 0:
            self.stdout.write(self.style.WARNING(
                f"   Noise/outlier points (not clustered): {result['noise_points']}"
            ))
        
        # Show cluster breakdown
        if options['show_clusters']:
            self._show_cluster_breakdown(result)
        
        self.stdout.write(self.style.HTTP_INFO('\n' + '=' * 80))
        self.stdout.write(self.style.SUCCESS('[+] Cluster update complete!'))
        self.stdout.write(self.style.HTTP_INFO('=' * 80 + '\n'))
    
    def _show_cluster_breakdown(self, result):
        """Display detailed breakdown of each cluster."""
        self.stdout.write(self.style.HTTP_INFO('\n' + '-' * 80))
        self.stdout.write(self.style.HTTP_INFO('CLUSTER BREAKDOWN'))
        self.stdout.write(self.style.HTTP_INFO('-' * 80))
        
        cluster_stats = result.get('cluster_statistics', {})
        cluster_labels = result.get('cluster_labels', {})
        
        # Sort clusters by client count (descending)
        sorted_clusters = sorted(
            [(k, v) for k, v in cluster_stats.items() if k != -1],
            key=lambda x: x[1]['client_count'],
            reverse=True
        )
        
        for label, stats in sorted_clusters:
            cluster_name = cluster_labels.get(label, f'Cluster {label}')
            
            self.stdout.write(f"\n📍 {cluster_name} (ID: {label})")
            self.stdout.write(f"   Clients: {stats['client_count']}")
            
            if stats.get('centroid_lat') and stats.get('centroid_lng'):
                self.stdout.write(
                    f"   Centroid: ({stats['centroid_lat']:.4f}, {stats['centroid_lng']:.4f})"
                )
            
            if stats.get('avg_distance_to_centroid_km'):
                self.stdout.write(
                    f"   Avg distance to centroid: {stats['avg_distance_to_centroid_km']:.1f} km"
                )
            
            if stats.get('max_distance_km'):
                self.stdout.write(
                    f"   Max distance from centroid: {stats['max_distance_km']:.1f} km"
                )
        
        # Show noise points if any
        if -1 in cluster_stats:
            noise_stats = cluster_stats[-1]
            self.stdout.write(self.style.WARNING(
                f"\n⚠️  Noise/Outliers: {noise_stats['client_count']} clients"
            ))
            self.stdout.write("   These clients are too far from any cluster center")
    
    def _show_summary(self, service):
        """Show current clustering summary."""
        self.stdout.write("\n📊 Current Clustering Summary:\n")
        
        summary = service.get_cluster_summary()
        
        self.stdout.write(f"   Clustered clients: {summary['total_clustered']}")
        self.stdout.write(f"   Unclustered clients (with coordinates): {summary['total_unclustered']}")
        self.stdout.write(f"   Clients without coordinates: {summary['no_coordinates']}")
        self.stdout.write(f"   Total clusters: {summary['cluster_count']}")
        
        if summary['last_updated']:
            self.stdout.write(f"   Last updated: {summary['last_updated']}")
        
        if summary['clusters']:
            self.stdout.write(self.style.HTTP_INFO('\n' + '-' * 60))
            self.stdout.write("   Cluster Distribution:\n")
            
            for cluster in summary['clusters']:
                avg_dist = cluster['avg_distance_to_centroid']
                dist_str = f"{avg_dist:.1f} km" if avg_dist else "N/A"
                
                self.stdout.write(
                    f"   • {cluster['cluster_label'] or 'Cluster ' + str(cluster['cluster_id'])}: "
                    f"{cluster['client_count']} clients (avg dist: {dist_str})"
                )
        
        self.stdout.write("")
    
    def _show_suggestions(self, service):
        """Show suggested optimal clustering parameters."""
        self.stdout.write("\n💡 Suggested Clustering Parameters:\n")
        
        suggestions = service.suggest_optimal_clusters()
        
        self.stdout.write(f"   Total clients with coordinates: {suggestions['total_clients']}")
        self.stdout.write(f"   Suggested method: {suggestions['suggested_method'].upper()}")
        self.stdout.write(f"   Suggested cluster count: {suggestions['suggested_clusters']}")
        
        if suggestions.get('suggested_eps_km'):
            self.stdout.write(f"   Suggested eps_km: {suggestions['suggested_eps_km']:.1f} km")
        
        self.stdout.write("\n   Reasoning:")
        reasoning = suggestions.get('reasoning', {})
        for key, value in reasoning.items():
            self.stdout.write(f"     - {key}: {value}")
        
        self.stdout.write(self.style.HTTP_INFO('\n' + '-' * 60))
        self.stdout.write("   Example commands:\n")
        
        if suggestions['suggested_method'] == 'dbscan':
            eps = suggestions.get('suggested_eps_km', 50)
            self.stdout.write(
                f"   python manage.py update_clusters --method dbscan --eps-km {eps:.0f}"
            )
        else:
            n = suggestions['suggested_clusters']
            self.stdout.write(
                f"   python manage.py update_clusters --method kmeans --n-clusters {n}"
            )
        
        self.stdout.write("")
    
    def _show_cluster_details(self, service, cluster_id):
        """Show details for a specific cluster."""
        self.stdout.write(f"\n📍 Clients in Cluster {cluster_id}:\n")
        
        clients = service.get_clients_by_cluster(cluster_id)
        
        if not clients:
            self.stdout.write(self.style.WARNING(
                f"   No clients found in cluster {cluster_id}"
            ))
            return
        
        self.stdout.write(f"   Total clients: {len(clients)}\n")
        
        for i, client in enumerate(clients, 1):
            dist = client['distance_to_centroid_km']
            dist_str = f"{dist:.1f} km" if dist else "N/A"
            priority_str = f" [{client['priority'].upper()}]" if client['priority'] else ""
            
            self.stdout.write(
                f"   {i}. {client['name']}{priority_str}"
            )
            self.stdout.write(
                f"      {client['city']}, {client['postal_code']} | Distance: {dist_str}"
            )
            
            if client['predicted_next_order_date']:
                self.stdout.write(
                    f"      Next order: {client['predicted_next_order_date'][:10]}"
                )
            
            self.stdout.write("")

