'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, MapPin, CheckCircle, Clock, Navigation2, RefreshCw, AlertCircle, Package } from 'lucide-react';
import { routeAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';

interface DeliveryProgressStop {
  id: number;
  sequence: number;
  client: string;
  arrival_time: string | null;
  departure_time: string | null;
  service_time_minutes: number | null;
}

interface DeliveryProgressData {
  route_id: string;
  route_name: string;
  status: string;
  total_stops: number;
  completed_stops: number;
  pending_stops: number;
  progress_percentage: number;
  current_position: {
    latitude: number;
    longitude: number;
    speed: number;
    timestamp: string;
  } | null;
  next_stop: {
    id: number;
    sequence: number;
    client: string;
    eta_minutes: number | null;
  } | null;
  completed_stops_details: DeliveryProgressStop[];
}

interface DeliveryProgressProps {
  routeId: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // in seconds
}

export function DeliveryProgress({
  routeId,
  autoRefresh = true,
  refreshInterval = 30,
}: DeliveryProgressProps) {
  const [loading, setLoading] = useState(true);
  const [progressData, setProgressData] = useState<DeliveryProgressData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Load progress data
  const loadProgressData = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      else setIsRefreshing(true);

      const data = await routeAPI.getDeliveryProgress(routeId);
      setProgressData(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading progress data:', error);
      const errorMessage = error instanceof Error && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      if (errorMessage) {
        toast.error(errorMessage);
      } else if (showLoader) {
        toast.error('Failed to load delivery progress');
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [routeId]);

  // Initialize
  useEffect(() => {
    loadProgressData(true);
  }, [loadProgressData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadProgressData(false);
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, loadProgressData]);

  const handleRefresh = () => {
    loadProgressData(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'planned':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTimeSinceUpdate = () => {
    if (!lastUpdate) return 'Never';
    const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </CardContent>
      </Card>
    );
  }

  if (!progressData) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="w-12 h-12 text-gray-400 mb-3" />
          <p className="text-gray-600 font-medium">No progress data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                {progressData.route_name}
              </CardTitle>
              <CardDescription>
                Route delivery progress and timeline
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={getStatusColor(progressData.status)}>
                {progressData.status}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {progressData.completed_stops} of {progressData.total_stops} stops completed
              </span>
              <span className="text-gray-600">
                {progressData.progress_percentage.toFixed(0)}%
              </span>
            </div>
            <Progress value={progressData.progress_percentage} className="h-2" />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-green-600 font-medium text-lg">
                {progressData.completed_stops}
              </p>
              <p className="text-gray-600 text-xs">Completed</p>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <p className="text-yellow-600 font-medium text-lg">
                {progressData.pending_stops}
              </p>
              <p className="text-gray-600 text-xs">Pending</p>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-blue-600 font-medium text-lg">
                {progressData.total_stops}
              </p>
              <p className="text-gray-600 text-xs">Total</p>
            </div>
          </div>

          {/* Last Update */}
          <p className="text-xs text-gray-500 text-center">
            Last updated: {getTimeSinceUpdate()}
          </p>
        </CardContent>
      </Card>

      {/* Next Stop */}
      {progressData.next_stop && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Navigation2 className="w-4 h-4" />
              Next Stop
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center font-bold text-sm">
                {progressData.next_stop.sequence}
              </div>
              <div className="flex-1">
                <p className="font-medium">{progressData.next_stop.client}</p>
                {progressData.next_stop.eta_minutes !== null && (
                  <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                    <Clock className="w-3 h-3" />
                    ETA: ~{Math.round(progressData.next_stop.eta_minutes)} minutes
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Position */}
      {progressData.current_position && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Current Position
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Speed</p>
                <p className="font-medium">
                  {progressData.current_position.speed.toFixed(0)} km/h
                </p>
              </div>
              <div>
                <p className="text-gray-600">Last Update</p>
                <p className="font-medium">
                  {new Date(progressData.current_position.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed Stops Timeline */}
      {progressData.completed_stops_details.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Completed Deliveries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {progressData.completed_stops_details.map((stop) => (
                <div
                  key={stop.id}
                  className="flex items-start gap-3 pb-3 border-b last:border-b-0"
                >
                  <div className="flex-shrink-0 w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold text-sm">
                    {stop.sequence}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{stop.client}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-600 mt-1">
                      {stop.arrival_time && (
                        <span>
                          Arrived: {new Date(stop.arrival_time).toLocaleTimeString()}
                        </span>
                      )}
                      {stop.service_time_minutes !== null && (
                        <span>
                          Service: {stop.service_time_minutes}min
                        </span>
                      )}
                    </div>
                  </div>
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {progressData.completed_stops === 0 && progressData.status === 'active' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Clock className="w-12 h-12 text-gray-400 mb-3" />
            <p className="text-gray-600 font-medium">Route started</p>
            <p className="text-sm text-gray-500 mt-1">
              Deliveries will appear here as they are completed
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
