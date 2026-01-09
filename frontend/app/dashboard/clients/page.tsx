'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { Loading } from '@/components/ui/loading';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { clientAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, MapPin, Calendar, TrendingUp, Users, AlertTriangle, Clock, ChevronLeft, ChevronRight, Info } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  city: string;
  postal_code: string;
  country: string;
  address: string;
  priority: string | null;
  has_contract: boolean;
  predicted_next_order_days: number | null;
  predicted_next_order_date: string | null;
  prediction_confidence_lower: number | null;
  prediction_confidence_upper: number | null;
  last_prediction_update: string | null;
  prediction_accuracy_score: number | null;
  historical_monthly_usage: number | null;
  days_until_predicted_order: number | null;
  is_urgent: boolean;
  orders_count: number;
}

export default function ClientsPage() {
  const { isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const clientsPerPage = 10;

  // Statistics state (always for ALL clients)
  const [statistics, setStatistics] = useState({
    urgentCount: 0,
    overdueCount: 0,
    highCount: 0,
    totalClients: 0,
  });

  useEffect(() => {
    fetchClients();
    fetchStatistics();
  }, [currentPage, searchTerm, filterPriority]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [searchTerm, filterPriority]);

  const fetchStatistics = async () => {
    try {
      const data = await clientAPI.getClientStatistics();
      setStatistics({
        urgentCount: data.predictions?.urgent || 0,
        overdueCount: data.predictions?.overdue || 0,
        highCount: data.predictions?.high || 0,
        totalClients: data.total_clients || 0,
      });
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  const fetchClients = async () => {
    try {
      setLoading(true);

      // Build query parameters
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('page_size', clientsPerPage.toString());

      if (searchTerm) {
        params.append('search', searchTerm);
      }

      if (filterPriority !== 'all') {
        if (filterPriority === 'overdue') {
          // Overdue: predicted date is in the past (negative days)
          params.append('days_max', '-1');
        } else if (filterPriority === 'urgent') {
          params.append('days_min', '0');
          params.append('days_max', '3');
        } else if (filterPriority === 'high') {
          params.append('days_min', '4');
          params.append('days_max', '7');
        } else if (filterPriority === 'medium') {
          params.append('days_min', '8');
          params.append('days_max', '14');
        } else if (filterPriority === 'low') {
          params.append('days_min', '15');
        }
      }

      const response = await fetch(`http://localhost:8000/api/clients/clients/?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      setClients(data.results || []);
      setTotalCount(data.count || 0);
      setTotalPages(Math.ceil((data.count || 0) / clientsPerPage));
    } catch (error) {
      toast.error('Failed to load clients');
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients;

  const getPriorityBadge = (client: Client) => {
    // Check if client has a predicted order date
    if (!client.predicted_next_order_date || client.days_until_predicted_order === null) {
      return <Badge variant="outline">No Prediction</Badge>;
    }

    const days = client.days_until_predicted_order;

    // Timeline-based badges matching the filter ranges
    if (days < 0) {
      return (
        <Badge variant="destructive" className="bg-orange-600">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Overdue
        </Badge>
      );
    } else if (days <= 3) {
      return (
        <Badge variant="destructive">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Urgent
        </Badge>
      );
    } else if (days <= 7) {
      return <Badge variant="secondary" className="bg-red-100 text-red-800">High</Badge>;
    } else if (days <= 14) {
      return <Badge variant="default">Medium</Badge>;
    } else {
      return <Badge variant="outline">Low</Badge>;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getDaysDisplay = (client: Client) => {
    if (client.days_until_predicted_order === null) {
      return 'No prediction';
    }

    const days = Math.round(client.days_until_predicted_order);

    if (days < 0) {
      return `Overdue by ${Math.abs(days)} days`;
    } else if (days === 0) {
      return 'Expected today';
    } else {
      return `In ${days} days`;
    }
  };

  const viewClientDetails = (client: Client) => {
    setSelectedClient(client);
    setIsDetailOpen(true);
  };

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <Loading message="Loading clients..." />
      </DashboardLayout>
    );
  }

  const startIndex = (currentPage - 1) * clientsPerPage;
  const endIndex = Math.min(startIndex + clientsPerPage, totalCount);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Clients</h2>
            <p className="text-muted-foreground">
              AI-powered reorder predictions for small/medium order clients (≤10 tonnes per order)
            </p>
          </div>
          <Button onClick={fetchClients} variant="outline">
            <Clock className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, city, or country..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={filterPriority === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterPriority('all')}
            >
              All
            </Button>
            <Button
              variant={filterPriority === 'overdue' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterPriority('overdue')}
              className={filterPriority === 'overdue' ? 'bg-orange-600 hover:bg-orange-700' : ''}
            >
              Overdue
            </Button>
            <Button
              variant={filterPriority === 'urgent' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterPriority('urgent')}
            >
              Urgent (&le;3d)
            </Button>
            <Button
              variant={filterPriority === 'high' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterPriority('high')}
            >
              High (&le;7d)
            </Button>
            <Button
              variant={filterPriority === 'medium' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterPriority('medium')}
            >
              Medium (&le;14d)
            </Button>
            <Button
              variant={filterPriority === 'low' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterPriority('low')}
            >
              Low (&gt;14d)
            </Button>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">About AI Predictions</h3>
              <p className="text-sm text-blue-800">
                <strong>Only clients with valid predictions are shown below.</strong> Predictions are generated for clients with at least 3 small/medium orders (≤10 tonnes each).
                The AI model was trained specifically on small and medium order patterns.
                Clients who primarily order in bulk (&gt;10 tonnes) cannot receive predictions and are not displayed.
              </p>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clients with Predictions</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCount}</div>
              <p className="text-xs text-muted-foreground">Small/medium order clients</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Urgent Orders</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{statistics.urgentCount}</div>
              <p className="text-xs text-muted-foreground">Ordering within 3 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{statistics.overdueCount}</div>
              <p className="text-xs text-muted-foreground">Past predicted date</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High Priority</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.highCount}</div>
              <p className="text-xs text-muted-foreground">Ordering in 4-7 days</p>
            </CardContent>
          </Card>
        </div>

        {/* Clients Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Clients</CardTitle>
            <CardDescription>
              AI-predicted next order dates based on historical ordering patterns for small/medium orders (≤10 tonnes). Predictions shown only for clients with ≥3 qualifying orders.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Predicted Next Order</TableHead>
                  <TableHead>Days Until Order</TableHead>
                  <TableHead>Monthly Usage</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {client.name}
                        {client.has_contract && (
                          <Badge variant="outline" className="text-xs">
                            Contract
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <div>
                          <p className="text-sm">{client.city}</p>
                          <p className="text-xs text-muted-foreground">{client.country}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getPriorityBadge(client)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(client.predicted_next_order_date)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          client.days_until_predicted_order !== null &&
                          client.days_until_predicted_order < 0
                            ? 'text-orange-600 font-semibold'
                            : client.is_urgent
                            ? 'text-red-600 font-semibold'
                            : ''
                        }
                      >
                        {getDaysDisplay(client)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {client.historical_monthly_usage
                        ? `${client.historical_monthly_usage} tm/mo`
                        : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => viewClientDetails(client)}>
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t">
                <div className="text-sm text-gray-600">
                  Showing {startIndex + 1}-{endIndex} of {totalCount} clients
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <div className="text-sm text-gray-600">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages || loading}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Client Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedClient?.name}</DialogTitle>
              <DialogDescription>Client details and prediction information</DialogDescription>
            </DialogHeader>
            {selectedClient && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Location Information</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 mt-0.5" />
                        <div>
                          <p>{selectedClient.address || 'No address'}</p>
                          <p className="text-muted-foreground">
                            {selectedClient.city}, {selectedClient.country}
                          </p>
                          <p className="text-muted-foreground">{selectedClient.postal_code}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getPriorityBadge(selectedClient)}
                        {selectedClient.has_contract && (
                          <Badge variant="outline">Long-term Contract</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Business Metrics</h4>
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="font-medium">Monthly Usage:</span>{' '}
                        {selectedClient.historical_monthly_usage
                          ? `${selectedClient.historical_monthly_usage} tonnes`
                          : 'Not calculated'}
                      </p>
                      <p>
                        <span className="font-medium">Total Orders:</span> {selectedClient.orders_count}
                      </p>
                      <p>
                        <span className="font-medium">Prediction Accuracy:</span>{' '}
                        {selectedClient.prediction_accuracy_score
                          ? `${selectedClient.prediction_accuracy_score}%`
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">AI Prediction</h4>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Predicted Next Order:</span>
                      <span className="text-lg font-bold">
                        {formatDate(selectedClient.predicted_next_order_date)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Time Until Order:</span>
                      <span className="text-lg font-semibold">{getDaysDisplay(selectedClient)}</span>
                    </div>
                    {selectedClient.prediction_confidence_lower &&
                      selectedClient.prediction_confidence_upper && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Confidence Interval:</span>
                          <span className="text-sm">
                            {typeof selectedClient.prediction_confidence_lower === 'number'
                              ? selectedClient.prediction_confidence_lower.toFixed(1)
                              : selectedClient.prediction_confidence_lower} -{' '}
                            {typeof selectedClient.prediction_confidence_upper === 'number'
                              ? selectedClient.prediction_confidence_upper.toFixed(1)
                              : selectedClient.prediction_confidence_upper} days
                          </span>
                        </div>
                      )}
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Last Updated:</span>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(selectedClient.last_prediction_update)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-2">
                  <Button
                    onClick={async () => {
                      try {
                        await clientAPI.updateClientPrediction(selectedClient.id);
                        toast.success('Prediction updated successfully');
                        fetchClients();
                        setIsDetailOpen(false);
                      } catch (error: any) {
                        console.error('Error updating prediction:', error);
                        const errorMessage = error?.response?.data?.error || 'Failed to update prediction';
                        toast.error(errorMessage);
                      }
                    }}
                  >
                    Update Prediction
                  </Button>
                  <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
