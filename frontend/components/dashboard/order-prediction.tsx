'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Brain, Clock, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

export interface Client {
  id: string;
  name: string;
  city: string;
  country: string;
  priority: string | null;
  predicted_next_order_days: number | null;
  predicted_next_order_date: string | null;
  days_until_predicted_order: number | null;
  is_urgent: boolean;
  prediction_confidence_lower: number | null;
  prediction_confidence_upper: number | null;
  historical_monthly_usage: number | null;
}

interface OrderPredictionProps {
  overdueClients: Client[];
  urgentClients: Client[];
}

export function OrderPrediction({ overdueClients, urgentClients }: OrderPredictionProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Overdue Card */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-t-xl">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Overdue
          </CardTitle>
          <CardDescription className="text-orange-100">
            Past their predicted order date
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-3">
            {overdueClients.length > 0 ? (
              overdueClients.slice(0, 5).map((client) => (
                <div
                  key={client.id}
                  className="flex items-center justify-between p-3 border border-orange-200 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{client.name}</p>
                    <p className="text-xs text-gray-600">
                      <MapPin className="h-3 w-3 inline mr-1" />
                      {client.city}, {client.country}
                    </p>
                    {client.predicted_next_order_date && (
                      <p className="text-xs text-gray-500 mt-1">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {format(new Date(client.predicted_next_order_date), 'MMM dd, yyyy')}
                      </p>
                    )}
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-lg font-bold text-orange-600">
                      {client.days_until_predicted_order !== null
                        ? `${Math.abs(client.days_until_predicted_order)}d`
                        : 'N/A'}
                    </p>
                    <p className="text-xs text-orange-700">overdue</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="font-medium">No overdue clients</p>
                <p className="text-sm text-gray-400 mt-1">
                  All clients are on track
                </p>
              </div>
            )}
          </div>
          {overdueClients.length > 5 && (
            <p className="text-sm text-center text-gray-500 mt-4">
              + {overdueClients.length - 5} more overdue
            </p>
          )}
          {overdueClients.length > 0 && (
            <Link href="/dashboard/clients?filter=overdue">
              <Button className="w-full mt-4 bg-orange-600 hover:bg-orange-700">
                View All Overdue ({overdueClients.length})
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Urgent Predictions Card */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-red-600 to-red-700 text-white rounded-t-xl">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Urgent
          </CardTitle>
          <CardDescription className="text-red-100">
            Will reorder within 3 days
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-3">
            {urgentClients.length > 0 ? (
              urgentClients.slice(0, 5).map((client) => (
                <div
                  key={client.id}
                  className="flex items-center justify-between p-3 border border-red-200 rounded-lg bg-red-50 hover:bg-red-100 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{client.name}</p>
                    <p className="text-xs text-gray-600">
                      <MapPin className="h-3 w-3 inline mr-1" />
                      {client.city}, {client.country}
                    </p>
                    {client.predicted_next_order_date && (
                      <p className="text-xs text-gray-500 mt-1">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {format(new Date(client.predicted_next_order_date), 'MMM dd, yyyy')}
                      </p>
                    )}
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-lg font-bold text-red-600">
                      {client.days_until_predicted_order !== null
                        ? `${client.days_until_predicted_order}d`
                        : 'N/A'}
                    </p>
                    {client.historical_monthly_usage && (
                      <p className="text-xs text-gray-500">
                        {Number(client.historical_monthly_usage).toFixed(1)} tm/mo
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="font-medium">No urgent clients</p>
                <p className="text-sm text-gray-400 mt-1">
                  All on track
                </p>
              </div>
            )}
          </div>
          {urgentClients.length > 5 && (
            <p className="text-sm text-center text-gray-500 mt-4">
              + {urgentClients.length - 5} more urgent
            </p>
          )}
          {urgentClients.length > 0 && (
            <Link href="/dashboard/clients?filter=urgent">
              <Button className="w-full mt-4 bg-red-600 hover:bg-red-700">
                View All Urgent ({urgentClients.length})
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
