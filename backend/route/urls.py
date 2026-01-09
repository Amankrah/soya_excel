from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RouteViewSet, RouteStopViewSet, RouteOptimizationViewSet
from .analytics_views import RouteAnalyticsViewSet
from .driver_views import DriverRouteViewSet, DriverDeliveryViewSet

router = DefaultRouter()
router.register(r'routes', RouteViewSet)
router.register(r'stops', RouteStopViewSet)
router.register(r'optimizations', RouteOptimizationViewSet)
router.register(r'analytics', RouteAnalyticsViewSet, basename='route-analytics')
router.register(r'driver/routes', DriverRouteViewSet, basename='driver-routes')
router.register(r'driver/deliveries', DriverDeliveryViewSet, basename='driver-deliveries')

urlpatterns = [
    path('', include(router.urls)),
] 