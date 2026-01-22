'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { Loading } from '@/components/ui/loading';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { clientAPI, API_BASE_URL } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { useTranslations } from 'next-intl';
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
import { 
  Search, 
  MapPin, 
  Calendar, 
  TrendingUp, 
  Users, 
  AlertTriangle, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles,
  RefreshCw,
  Eye,
  Brain,
  ArrowRight,
  Filter,
} from 'lucide-react';

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
  const t = useTranslations('clients');
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

  const fetchClients = useCallback(async () => {
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

      const response = await fetch(`${API_BASE_URL}/clients/clients/?${params.toString()}`, {
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
      toast.error(t('failedToLoad'));
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, filterPriority]);

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

  useEffect(() => {
    fetchClients();
    fetchStatistics();
  }, [currentPage, searchTerm, filterPriority, fetchClients]);

  // Handle filter change with page reset
  const handleFilterChange = (newFilter: string) => {
    if (newFilter !== filterPriority) {
      setFilterPriority(newFilter);
      setCurrentPage(1);
    }
  };

  // Handle search change with page reset
  const handleSearchChange = (newSearch: string) => {
    setSearchTerm(newSearch);
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  };

  const filteredClients = clients;

  const getPriorityBadge = (client: Client) => {
    // Check if client has a predicted order date
    if (!client.predicted_next_order_date || client.days_until_predicted_order === null) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          {t('noPrediction')}
        </span>
      );
    }

    const days = client.days_until_predicted_order;

    // Timeline-based badges matching the filter ranges
    if (days < 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">
          <AlertTriangle className="h-3 w-3" />
          {t('overdue')}
        </span>
      );
    } else if (days <= 3) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
          <AlertTriangle className="h-3 w-3" />
          {t('urgent')}
        </span>
      );
    } else if (days <= 7) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 border border-yellow-200">
          {t('high')}
        </span>
      );
    } else if (days <= 14) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
          {t('medium')}
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
          {t('low')}
        </span>
      );
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('na');
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getDaysDisplay = (client: Client) => {
    if (client.days_until_predicted_order === null) {
      return t('noPrediction');
    }

    const days = Math.round(client.days_until_predicted_order);

    if (days < 0) {
      return t('overdueBy', { days: Math.abs(days) });
    } else if (days === 0) {
      return t('expectedToday');
    } else {
      return t('inDays', { days });
    }
  };

  const viewClientDetails = (client: Client) => {
    setSelectedClient(client);
    setIsDetailOpen(true);
  };

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <Loading message={t('loadingClients')} />
      </DashboardLayout>
    );
  }

  const startIndex = (currentPage - 1) * clientsPerPage;
  const endIndex = Math.min(startIndex + clientsPerPage, totalCount);

  const filterButtons = [
    { key: 'all', label: t('allClients'), color: 'bg-gray-900 hover:bg-gray-800' },
    { key: 'overdue', label: t('overdueFilter'), color: 'bg-orange-600 hover:bg-orange-700' },
    { key: 'urgent', label: t('urgentFilter'), color: 'bg-red-600 hover:bg-red-700' },
    { key: 'high', label: t('highFilter'), color: 'bg-yellow-600 hover:bg-yellow-700' },
    { key: 'medium', label: t('mediumFilter'), color: 'bg-green-600 hover:bg-green-700' },
    { key: 'low', label: t('lowFilter'), color: 'bg-gray-500 hover:bg-gray-600' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="soya-fade-in">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-green-600 to-green-700 shadow-lg shadow-green-600/20">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div className="flex items-center gap-2 bg-yellow-100 rounded-full px-3 py-1">
                <Sparkles className="h-3.5 w-3.5 text-yellow-600" />
                <span className="text-xs font-semibold text-yellow-700">AI-Powered</span>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">{t('clientPredictions')}</h1>
            <p className="text-gray-500 mt-1">
              {t('aiPoweredReorder')}
            </p>
          </div>
          <Button
            onClick={fetchClients}
            className="soya-button-outline group soya-fade-in soya-stagger-1"
          >
            <RefreshCw className="h-4 w-4 mr-2 transition-transform group-hover:rotate-180 duration-500" />
            {t('refreshData')}
          </Button>
        </div>

        {/* Info Banner */}
        <div className="soya-fade-in soya-stagger-2">
          <div className="bg-gradient-to-r from-green-50 to-yellow-50 border border-green-200 rounded-xl p-5">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <Brain className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-green-900 mb-1">{t('aboutAIPredictions')}</h3>
                <p className="text-sm text-green-800">
                  <strong>{t('onlyValidPredictions')}</strong> {t('predictionRequirements')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 soya-fade-in soya-stagger-3">
          <Card className="soya-card border-0 overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/5 rounded-full -mr-10 -mt-10"></div>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('totalClients')}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{statistics.totalClients}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('withAIPredictions')}</p>
                </div>
                <div className="p-3 bg-gradient-to-br from-green-600 to-green-700 rounded-xl shadow-lg shadow-green-600/20">
                  <Users className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="soya-card border-0 overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/5 rounded-full -mr-10 -mt-10"></div>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('urgentOrders')}</p>
                  <p className="text-3xl font-bold text-red-600 mt-1">{statistics.urgentCount}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('within3Days')}</p>
                </div>
                <div className="p-3 bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg shadow-red-500/20">
                  <AlertTriangle className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="soya-card border-0 overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-orange-500/5 rounded-full -mr-10 -mt-10"></div>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('overdue')}</p>
                  <p className="text-3xl font-bold text-orange-600 mt-1">{statistics.overdueCount}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('pastPredictedDate')}</p>
                </div>
                <div className="p-3 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg shadow-orange-500/20">
                  <Clock className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="soya-card border-0 overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-yellow-500/5 rounded-full -mr-10 -mt-10"></div>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('highPriority')}</p>
                  <p className="text-3xl font-bold text-yellow-600 mt-1">{statistics.highCount}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('fourTo7Days')}</p>
                </div>
                <div className="p-3 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl shadow-lg shadow-yellow-500/20">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card className="soya-card border-0 soya-fade-in soya-stagger-4">
          <CardContent className="p-5">
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder={t('searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10 h-11 border-gray-200 focus:border-green-500 focus:ring-green-500/20"
                />
              </div>

              {/* Filter Buttons */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-gray-500 mr-2">
                  <Filter className="h-4 w-4" />
                  <span className="text-sm font-medium hidden sm:inline">{t('filter')}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {filterButtons.map((btn) => (
                    <Button
                      key={btn.key}
                      size="sm"
                      onClick={() => handleFilterChange(btn.key)}
                      className={`rounded-full transition-all duration-200 ${
                        filterPriority === btn.key
                          ? `${btn.color} text-white shadow-md`
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {btn.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Clients Table */}
        <Card className="soya-card border-0 shadow-lg">
          <CardHeader className="border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">{t('allClientsTable')}</CardTitle>
                <CardDescription className="mt-1">
                  {t('aiPredictedDates')}
                </CardDescription>
              </div>
              <Badge className="soya-badge-success">
                {t('clientsCount', { count: totalCount })}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className="font-semibold text-gray-700">{t('clientName')}</TableHead>
                    <TableHead className="font-semibold text-gray-700">{t('location')}</TableHead>
                    <TableHead className="font-semibold text-gray-700">{t('priority')}</TableHead>
                    <TableHead className="font-semibold text-gray-700">{t('predictedOrder')}</TableHead>
                    <TableHead className="font-semibold text-gray-700">{t('daysUntil')}</TableHead>
                    <TableHead className="font-semibold text-gray-700">{t('monthlyUsage')}</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-right">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((client, index) => (
                    <TableRow 
                      key={client.id}
                      className="hover:bg-green-50/50 transition-colors duration-150"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900">{client.name}</span>
                          {client.has_contract && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                              {t('contract')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{client.city}</p>
                            <p className="text-xs text-gray-500">{client.country}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getPriorityBadge(client)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-700">{formatDate(client.predicted_next_order_date)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`font-medium ${
                            client.days_until_predicted_order !== null &&
                            client.days_until_predicted_order < 0
                              ? 'text-orange-600'
                              : client.is_urgent
                              ? 'text-red-600'
                              : 'text-gray-700'
                          }`}
                        >
                          {getDaysDisplay(client)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-700">
                          {client.historical_monthly_usage
                            ? t('tmPerMonth', { usage: client.historical_monthly_usage })
                            : '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewClientDetails(client)}
                          className="hover:bg-green-100 hover:text-green-700 group"
                        >
                          <Eye className="h-4 w-4 mr-1.5" />
                          {t('details')}
                          <ArrowRight className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-gray-100">
                <p className="text-sm text-gray-600">
                  {t('showing')} <span className="font-medium">{startIndex + 1}</span> {t('to')}{' '}
                  <span className="font-medium">{endIndex}</span> {t('of')}{' '}
                  <span className="font-medium">{totalCount}</span> {t('allClients').toLowerCase()}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1 || loading}
                    className="rounded-lg"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    {t('previous')}
                  </Button>
                  <div className="flex items-center gap-1 px-3">
                    <span className="text-sm font-medium text-gray-900">{currentPage}</span>
                    <span className="text-sm text-gray-400">/</span>
                    <span className="text-sm text-gray-500">{totalPages}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages || loading}
                    className="rounded-lg"
                  >
                    {t('next')}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Client Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-2xl rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">{selectedClient?.name}</DialogTitle>
              <DialogDescription>{t('clientDetails')}</DialogDescription>
            </DialogHeader>
            {selectedClient && (
              <div className="space-y-6 mt-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <h4 className="font-semibold mb-3 flex items-center gap-2 text-gray-900">
                      <MapPin className="h-4 w-4 text-green-600" />
                      {t('locationInformation')}
                    </h4>
                    <div className="space-y-2 text-sm">
                      <p className="text-gray-700">{selectedClient.address || t('noAddress')}</p>
                      <p className="text-gray-600">
                        {selectedClient.city}, {selectedClient.country}
                      </p>
                      <p className="text-gray-500">{selectedClient.postal_code}</p>
                      <div className="flex items-center gap-2 mt-3">
                        {getPriorityBadge(selectedClient)}
                        {selectedClient.has_contract && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            {t('longTermContract')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <h4 className="font-semibold mb-3 flex items-center gap-2 text-gray-900">
                      <TrendingUp className="h-4 w-4 text-yellow-600" />
                      {t('businessMetrics')}
                    </h4>
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="text-gray-500">{t('monthlyUsageLabel')}</span>{' '}
                        <span className="font-medium text-gray-900">
                          {selectedClient.historical_monthly_usage
                            ? t('tonnes', { usage: selectedClient.historical_monthly_usage })
                            : t('notCalculated')}
                        </span>
                      </p>
                      <p>
                        <span className="text-gray-500">{t('totalOrders')}</span>{' '}
                        <span className="font-medium text-gray-900">{selectedClient.orders_count}</span>
                      </p>
                      <p>
                        <span className="text-gray-500">{t('predictionAccuracy')}</span>{' '}
                        <span className="font-medium text-gray-900">
                          {selectedClient.prediction_accuracy_score
                            ? `${selectedClient.prediction_accuracy_score}%`
                            : t('na')}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-yellow-50 border border-green-200 rounded-xl p-5">
                  <h4 className="font-semibold mb-4 flex items-center gap-2 text-gray-900">
                    <Brain className="h-4 w-4 text-green-600" />
                    {t('aiPrediction')}
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('predictedNextOrder')}</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        {formatDate(selectedClient.predicted_next_order_date)}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('timeUntilOrder')}</p>
                      <p className={`text-2xl font-bold mt-1 ${
                        selectedClient.days_until_predicted_order !== null && selectedClient.days_until_predicted_order < 0
                          ? 'text-orange-600'
                          : selectedClient.is_urgent
                          ? 'text-red-600'
                          : 'text-green-700'
                      }`}>
                        {getDaysDisplay(selectedClient)}
                      </p>
                    </div>
                  </div>
                  {selectedClient.prediction_confidence_lower &&
                    selectedClient.prediction_confidence_upper && (
                      <div className="mt-4 bg-white rounded-lg p-3 shadow-sm">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('confidenceInterval')}</p>
                        <p className="text-sm font-medium text-gray-700 mt-1">
                          {typeof selectedClient.prediction_confidence_lower === 'number'
                            ? selectedClient.prediction_confidence_lower.toFixed(1)
                            : selectedClient.prediction_confidence_lower} -{' '}
                          {typeof selectedClient.prediction_confidence_upper === 'number'
                            ? selectedClient.prediction_confidence_upper.toFixed(1)
                            : selectedClient.prediction_confidence_upper} {t('days')}
                        </p>
                      </div>
                    )}
                  <p className="text-xs text-gray-500 mt-4">
                    {t('lastUpdated')} {formatDate(selectedClient.last_prediction_update)}
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    className="soya-button-primary flex-1"
                    onClick={async () => {
                      try {
                        await clientAPI.updateClientPrediction(selectedClient.id);
                        toast.success(t('predictionUpdated'));
                        fetchClients();
                        setIsDetailOpen(false);
                      } catch (error: unknown) {
                        console.error('Error updating prediction:', error);
                        const errorMessage =
                          (error && typeof error === 'object' && 'response' in error)
                            ? (error as { response?: { data?: { error?: string } } }).response?.data?.error || t('failedToUpdate')
                            : t('failedToUpdate');
                        toast.error(errorMessage);
                      }
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t('updatePrediction')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsDetailOpen(false)}
                    className="flex-1"
                  >
                    {t('close')}
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
