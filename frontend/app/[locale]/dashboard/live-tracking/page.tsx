'use client';

import { useState, useEffect } from 'react';
import { LiveTracking } from '@/components/route/live-tracking';
import { DeliveryProgress } from '@/components/route/delivery-progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { routeAPI } from '@/lib/api';
import { Loader2, Navigation2, Package } from 'lucide-react';
import DashboardLayout from '@/components/layout/dashboard-layout';

interface Route {
  id: string;
  name: string;
  status: string;
  date: string;
}

export default function LiveTrackingPage() {
  const [activeRoutes, setActiveRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Load active routes
  useEffect(() => {
    const loadActiveRoutes = async () => {
      try {
        setLoading(true);
        const routes = await routeAPI.getActiveRoutes();
        setActiveRoutes(routes);

        // Auto-select first route if available
        if (routes.length > 0 && !selectedRouteId) {
          setSelectedRouteId(routes[0].id);
        }
      } catch (error) {
        console.error('Error loading active routes:', error);
      } finally {
        setLoading(false);
      }
    };

    loadActiveRoutes();

    // Refresh active routes every 2 minutes
    const interval = setInterval(loadActiveRoutes, 120000);
    return () => clearInterval(interval);
  }, [selectedRouteId]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Navigation2 className="w-8 h-8" />
            Live Tracking
          </h1>
          <p className="text-gray-600 mt-2">
            Real-time GPS tracking and delivery progress monitoring
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all-vehicles" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all-vehicles">
              <Navigation2 className="w-4 h-4 mr-2" />
              All Vehicles
            </TabsTrigger>
            <TabsTrigger value="route-progress">
              <Package className="w-4 h-4 mr-2" />
              Route Progress
            </TabsTrigger>
          </TabsList>

          {/* All Vehicles Tab */}
          <TabsContent value="all-vehicles" className="space-y-4">
            <LiveTracking
              autoRefresh={true}
              refreshInterval={180}
              showMap={true}
            />
          </TabsContent>

          {/* Route Progress Tab */}
          <TabsContent value="route-progress" className="space-y-4">
            {activeRoutes.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="w-12 h-12 text-gray-400 mb-3" />
                  <p className="text-gray-600 font-medium">No active routes</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Activate a route to see delivery progress
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Route Selector */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Select Route</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select value={selectedRouteId} onValueChange={setSelectedRouteId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a route" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeRoutes.map((route) => (
                          <SelectItem key={route.id} value={route.id}>
                            {route.name} - {route.date}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>

                {/* Delivery Progress */}
                {selectedRouteId && (
                  <DeliveryProgress
                    routeId={selectedRouteId}
                    autoRefresh={true}
                    refreshInterval={30}
                  />
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
