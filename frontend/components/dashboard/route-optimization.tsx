'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Truck, MapPin, Navigation, TrendingUp, Clock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface RouteOptimizationProps {
  activeRoutes?: number;
  availableDrivers?: number;
  totalClients?: number;
}

export function RouteOptimization({
  activeRoutes = 0,
  availableDrivers = 0,
  totalClients = 0,
}: RouteOptimizationProps) {
  const t = useTranslations('routes');

  return (
    <div className="space-y-6">
      {/* Route Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('activeRoutes')}</CardTitle>
            <Navigation className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{activeRoutes}</div>
            <p className="text-xs text-muted-foreground">{t('currentlyInProgress')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('availableDrivers')}</CardTitle>
            <Truck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{availableDrivers}</div>
            <p className="text-xs text-muted-foreground">{t('readyForDelivery')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('totalClients')}</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClients}</div>
            <p className="text-xs text-muted-foreground">{t('activeClientLocations')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Route Optimization Features */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Google Maps Integration */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-t-xl">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {t('smartRoutePlanning')}
            </CardTitle>
            <CardDescription className="text-green-100">
              {t('googleMapsPowered')}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Navigation className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{t('automatedGeocoding')}</p>
                  <p className="text-sm text-gray-600">
                    {t('geocodingDescription')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{t('distanceOptimization')}</p>
                  <p className="text-sm text-gray-600">
                    {t('distanceOptimizationDescription')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Clock className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{t('realTimeTracking')}</p>
                  <p className="text-sm text-gray-600">
                    {t('realTimeTrackingDescription')}
                  </p>
                </div>
              </div>
            </div>

            <Link href="/dashboard/routes">
              <Button className="w-full mt-6 bg-green-600 hover:bg-green-700">
                {t('viewAllRoutes')}
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Fleet Management */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-t-xl">
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              {t('fleetManagement')}
            </CardTitle>
            <CardDescription className="text-gray-300">
              {t('driverVehicleCoordination')}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-gray-50">
                <div>
                  <p className="font-semibold text-gray-800">{t('availableDrivers')}</p>
                  <p className="text-sm text-gray-600">{t('readyForAssignment')}</p>
                </div>
                <Badge className="bg-green-100 text-green-700 border-green-200">
                  {availableDrivers} {t('active')}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-gray-50">
                <div>
                  <p className="font-semibold text-gray-800">{t('activeRoutes')}</p>
                  <p className="text-sm text-gray-600">{t('currentlyInProgress')}</p>
                </div>
                <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                  {activeRoutes} {t('routes')}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-gray-50">
                <div>
                  <p className="font-semibold text-gray-800">{t('clientCoverage')}</p>
                  <p className="text-sm text-gray-600">{t('geographicDistribution')}</p>
                </div>
                <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                  3 {t('countries')}
                </Badge>
              </div>
            </div>

            <Link href="/dashboard/drivers">
              <Button className="w-full mt-6 bg-gray-700 hover:bg-gray-800" variant="outline">
                {t('manageFleet')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
