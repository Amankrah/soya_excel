'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus,
  Package,
  Search,
  MapPin,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Eye,
  ArrowRight,
  X,
  Calendar,
  Truck,
  Filter,
  Clock,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';

interface Order {
  id: string;
  client_order_number: string;
  client: {
    id: string;
    name: string;
    city: string;
    country: string;
  } | null;
  product_name: string;
  total_amount_delivered_tm: number | string;
  status: string;
  sales_order_creation_date: string;
  delivery_date?: string | null;
}

export function OrderManagement() {
  const t = useTranslations('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statistics, setStatistics] = useState({
    total_orders: 0,
    pending_orders: 0,
    delivered_orders: 0,
    total_volume: 0,
  });
  const ordersPerPage = 10;

  // Load statistics (all-time totals)
  const loadStatistics = useCallback(async () => {
    try {
      const params = new URLSearchParams();

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await fetch(`${API_BASE_URL}/clients/orders/statistics/?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load statistics');
      }

      const data = await response.json();
      setStatistics(data);
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  }, [statusFilter, searchQuery]);

  // Load orders with server-side pagination
  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);

      // Build query parameters
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('page_size', ordersPerPage.toString());
      params.append('ordering', '-actual_expedition_date,-sales_order_creation_date'); // Sort by latest delivery date

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await fetch(`${API_BASE_URL}/clients/orders/?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load orders');
      }

      const data = await response.json();

      // Handle paginated response
      setOrders(data.results || []);
      setTotalCount(data.count || 0);
      setTotalPages(Math.ceil((data.count || 0) / ordersPerPage));
    } catch (error) {
      console.error('Error loading orders:', error);
      toast.error(t('failedToLoad'));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, searchQuery, t]);

  useEffect(() => {
    loadOrders();
    loadStatistics();
  }, [loadOrders, loadStatistics]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  // Get status color
  const getStatusBadge = (status: string) => {
    const variants: Record<string, { className: string; label: string }> = {
      pending: { className: 'bg-yellow-100 text-yellow-700 border-yellow-200 font-semibold', label: t('pending') },
      delivered: { className: 'bg-green-100 text-green-700 border-green-200 font-semibold', label: t('delivered') },
      cancelled: { className: 'bg-red-100 text-red-700 border-red-200 font-semibold', label: t('cancelled') },
      in_progress: { className: 'bg-blue-100 text-blue-700 border-blue-200 font-semibold', label: t('inProgress') },
    };

    const variant = variants[status] || { className: 'bg-gray-100 text-gray-700 border-gray-200', label: status };

    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border ${variant.className}`}>
        {variant.label}
      </span>
    );
  };

  // Use server-side statistics for all-time totals
  const stats = {
    total: statistics.total_orders,
    pending: statistics.pending_orders,
    delivered: statistics.delivered_orders,
    totalVolume: statistics.total_volume,
  };

  const startIndex = (currentPage - 1) * ordersPerPage;
  const endIndex = Math.min(startIndex + ordersPerPage, totalCount);

  const filterButtons = [
    { key: 'all', label: t('allOrders'), color: 'bg-gray-900 hover:bg-gray-800' },
    { key: 'pending', label: t('pendingFilter'), color: 'bg-yellow-600 hover:bg-yellow-700' },
    { key: 'delivered', label: t('deliveredFilter'), color: 'bg-green-600 hover:bg-green-700' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 soya-fade-in">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-green-600 to-green-700 shadow-lg shadow-green-600/20">
              <Package className="h-5 w-5 text-white" />
            </div>
            <div className="flex items-center gap-2 bg-yellow-100 rounded-full px-3 py-1">
              <Truck className="h-3.5 w-3.5 text-yellow-600" />
              <span className="text-xs font-semibold text-yellow-700">{t('feedDistribution')}</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{t('orderManagement')}</h1>
          <p className="mt-1 text-gray-500">
            {t('manageOrders')}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => { loadOrders(); loadStatistics(); }}
            className="soya-button-outline group"
          >
            <RefreshCw className="h-4 w-4 mr-2 transition-transform group-hover:rotate-180 duration-500" />
            {t('refresh')}
          </Button>
          <Button className="soya-button-primary">
            <Plus className="h-4 w-4 mr-2" />
            {t('createOrder')}
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 soya-fade-in soya-stagger-1">
        <Card className="soya-card border-0 overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/5 rounded-full -mr-10 -mt-10"></div>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{t('totalOrders')}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {statusFilter !== 'all' ? t('statusOrders', { status: statusFilter }) : t('allTime')}
                </p>
              </div>
              <div className="p-3 bg-gradient-to-br from-green-600 to-green-700 rounded-xl shadow-lg shadow-green-600/20">
                <Package className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="soya-card border-0 overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-yellow-500/5 rounded-full -mr-10 -mt-10"></div>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{t('pending')}</p>
                <p className="text-3xl font-bold text-yellow-600 mt-1">{stats.pending.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">{t('awaitingDelivery')}</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl shadow-lg shadow-yellow-500/20">
                <Clock className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="soya-card border-0 overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/5 rounded-full -mr-10 -mt-10"></div>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{t('delivered')}</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{stats.delivered.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">{t('successfullyCompleted')}</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-lg shadow-emerald-500/20">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="soya-card border-0 overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gray-500/5 rounded-full -mr-10 -mt-10"></div>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{t('totalVolume')}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {Number(stats.totalVolume || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </p>
                <p className="text-xs text-gray-400 mt-1">{t('tonnesAllTime')}</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl shadow-lg shadow-gray-700/20">
                <Package className="h-6 w-6 text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card className="soya-card border-0 soya-fade-in soya-stagger-2">
        <CardContent className="p-5">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={t('searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-11 border-gray-200 focus:border-green-500 focus:ring-green-500/20"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-gray-500 mr-2">
                <Filter className="h-4 w-4" />
                <span className="text-sm font-medium hidden sm:inline">{t('status')}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {filterButtons.map((btn) => (
                  <Button
                    key={btn.key}
                    size="sm"
                    onClick={() => setStatusFilter(btn.key)}
                    className={`rounded-full transition-all duration-200 ${
                      statusFilter === btn.key
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

      {/* Orders Table */}
      <Card className="soya-card border-0 shadow-lg soya-fade-in soya-stagger-3">
        <CardHeader className="border-b border-gray-100">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Package className="h-5 w-5 text-green-600" />
              {t('orders')}
            </CardTitle>
            <Badge className="soya-badge-success">
              {t('ordersCount', { count: totalCount })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="soya-spinner mx-auto mb-4"></div>
                <p className="text-gray-500">{t('loadingOrders')}</p>
              </div>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-4">
                <Package className="h-8 w-8 text-gray-400" />
              </div>
              <p className="font-semibold text-gray-900">{t('noOrdersFound')}</p>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                {searchQuery || statusFilter !== 'all'
                  ? t('adjustFilters')
                  : t('createFirstOrder')}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                      <TableHead className="font-semibold text-gray-700">{t('orderNumber')}</TableHead>
                      <TableHead className="font-semibold text-gray-700">{t('client')}</TableHead>
                      <TableHead className="font-semibold text-gray-700">{t('location')}</TableHead>
                      <TableHead className="font-semibold text-gray-700">{t('product')}</TableHead>
                      <TableHead className="font-semibold text-gray-700 text-right">{t('quantity')}</TableHead>
                      <TableHead className="font-semibold text-gray-700">{t('statusLabel')}</TableHead>
                      <TableHead className="font-semibold text-gray-700">{t('orderDate')}</TableHead>
                      <TableHead className="font-semibold text-gray-700">{t('delivery')}</TableHead>
                      <TableHead className="font-semibold text-gray-700 text-right">{t('actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order, index) => (
                      <TableRow 
                        key={order.id} 
                        className="hover:bg-green-50/50 transition-colors duration-150"
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        <TableCell className="font-semibold text-gray-900">
                          {order.client_order_number}
                        </TableCell>
                        <TableCell className="font-medium text-gray-700">
                          {order.client?.name || t('na')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm text-gray-600">
                            <MapPin className="h-3.5 w-3.5 text-gray-400" />
                            {order.client?.city || t('na')}, {order.client?.country || t('na')}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {order.product_name}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-semibold text-gray-900">
                            {Number(order.total_amount_delivered_tm || 0).toFixed(1)}
                          </span>
                          <span className="text-gray-500 text-sm ml-1">{t('tm')}</span>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(order.status)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm text-gray-600">
                            <Calendar className="h-3.5 w-3.5 text-gray-400" />
                            {format(new Date(order.sales_order_creation_date), 'MMM dd, yyyy')}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {order.delivery_date
                            ? format(new Date(order.delivery_date), 'MMM dd, yyyy')
                            : <span className="text-gray-400">{t('notScheduled')}</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedOrder(order)}
                            className="hover:bg-green-100 hover:text-green-700 group rounded-lg"
                          >
                            <Eye className="h-4 w-4 mr-1.5" />
                            {t('view')}
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
                    <span className="font-medium">{totalCount.toLocaleString()}</span> {t('orders').toLowerCase()}
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl soya-card-glass border-0 shadow-2xl max-h-[90vh] overflow-y-auto soya-scale-in">
            <CardHeader className="border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-green-600 to-green-700">
                    <Package className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">{t('orderDetails')}</CardTitle>
                    <p className="text-sm text-gray-500">{selectedOrder.client_order_number}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedOrder(null)}
                  className="rounded-full hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Order Information */}
              <div className="bg-gray-50 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Package className="h-4 w-4 text-green-600" />
                  {t('orderInformation')}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('orderNumberLabel')}</p>
                    <p className="font-semibold text-gray-900 mt-1">{selectedOrder.client_order_number}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('statusLabel')}</p>
                    <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('orderDateLabel')}</p>
                    <p className="font-medium text-gray-900 mt-1">
                      {format(new Date(selectedOrder.sales_order_creation_date), 'MMM dd, yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('deliveryDate')}</p>
                    <p className="font-medium text-gray-900 mt-1">
                      {selectedOrder.delivery_date
                        ? format(new Date(selectedOrder.delivery_date), 'MMM dd, yyyy')
                        : <span className="text-gray-400">{t('notScheduled')}</span>}
                    </p>
                  </div>
                </div>
              </div>

              {/* Client Information */}
              <div className="bg-gradient-to-br from-green-50 to-yellow-50 border border-green-100 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-green-600" />
                  {t('clientInformation')}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('clientName')}</p>
                    <p className="font-semibold text-gray-900 mt-1">{selectedOrder.client?.name || t('na')}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('locationLabel')}</p>
                    <p className="font-medium text-gray-900 mt-1">
                      {selectedOrder.client?.city || t('na')}, {selectedOrder.client?.country || t('na')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Product Information */}
              <div className="bg-gray-50 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-yellow-600" />
                  {t('productInformation')}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('productLabel')}</p>
                    <p className="font-medium text-gray-900 mt-1">{selectedOrder.product_name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('quantityLabel')}</p>
                    <p className="text-2xl font-bold text-green-700 mt-1">
                      {Number(selectedOrder.total_amount_delivered_tm || 0).toFixed(1)}
                      <span className="text-sm font-medium text-gray-500 ml-1">{t('tonnes')}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedOrder(null)}
                  className="flex-1 rounded-lg"
                >
                  {t('close')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
