import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

// Type definitions for Soya Excel
interface WeeklyDistributionPlanData {
  plan_name: string;
  planning_week: string;
  week_start_date: string;
  week_end_date: string;
  total_quantity_planned: number;
  notes?: string;
}

interface SoybeanMealOrderData {
  farmer: string;
  order_number?: string; // Made optional since backend auto-generates this
  quantity: number;
  delivery_method: string;
  order_type: string;
  priority?: string; // Made optional for backward compatibility
  expected_delivery_date: string;
  notes?: string;
}

interface DeliveryData {
  driver: string;
  vehicle: string;
  route: number;
  items: Array<{
    order: string;
    farmer: string;
    quantity_planned: number;
    delivery_method: string;
  }>;
  notes?: string;
}

interface RouteData {
  name: string;
  date: string;
  route_type?: string;
  stops: Array<{
    client: number;
    sequence_number?: number;
  }>;
}

// Create axios instance with default config
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  login: async (username: string, password: string) => {
    const response = await api.post('/auth/login/', { username, password });
    return response.data;
  },
  logout: async () => {
    await api.post('/auth/logout/');
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  },
  getCurrentUser: async () => {
    const response = await api.get('/auth/user/');
    return response.data;
  },
};

// Manager APIs for Soya Excel
export const managerAPI = {
  getDashboard: async () => {
    const response = await api.get('/manager/managers/dashboard/');
    return response.data;
  },
  getManagers: async () => {
    const response = await api.get('/manager/managers/');
    return response.data.results || response.data;
  },
  
  // Soybean meal products
  getSoybeanProducts: async () => {
    const response = await api.get('/manager/soybean-products/');
    return response.data.results || response.data;
  },
  
  // Supply inventory (soybean meal)
  getSupplyInventory: async () => {
    const response = await api.get('/manager/supply-inventory/');
    return response.data.results || response.data;
  },
  
  // Weekly distribution plans
  getWeeklyPlans: async () => {
    const response = await api.get('/manager/weekly-plans/');
    return response.data.results || response.data;
  },
  createWeeklyPlan: async (data: WeeklyDistributionPlanData) => {
    const response = await api.post('/manager/weekly-plans/', data);
    return response.data;
  },
  approveWeeklyPlan: async (planId: number) => {
    const response = await api.post(`/manager/weekly-plans/${planId}/approve/`);
    return response.data;
  },
  
  // Monthly distribution plans
  getMonthlyPlans: async () => {
    const response = await api.get('/manager/monthly-plans/');
    return response.data.results || response.data;
  },
  
  // KPI Metrics - Soya Excel's priority metrics
  getKPIMetrics: async (periodType: 'weekly' | 'monthly' = 'weekly') => {
    const response = await api.get(`/manager/kpi-metrics/soya_excel_kpis/?period_type=${periodType}`);
    return response.data;
  },
  getForecastAccuracy: async () => {
    const response = await api.get('/manager/kpi-metrics/forecast_accuracy/');
    return response.data;
  },
  getAllKPIMetrics: async () => {
    const response = await api.get('/manager/kpi-metrics/');
    return response.data.results || response.data;
  },
};

// Client APIs for Soya Excel
export const clientAPI = {
  getFarmers: async () => {
    const response = await api.get('/clients/farmers/');
    return response.data.results || response.data;
  },
  getFarmer: async (id: string) => {
    const response = await api.get(`/clients/farmers/${id}/`);
    return response.data;
  },
  
  // Filter farmers by province or client type
  getFarmersByProvince: async (province: string) => {
    const response = await api.get(`/clients/farmers/?province=${province}`);
    return response.data.results || response.data;
  },
  getFarmersByClientType: async (clientType: string) => {
    const response = await api.get(`/clients/farmers/?client_type=${clientType}`);
    return response.data.results || response.data;
  },
  
  // Orders (soybean meal) - Enhanced with complete management
  getOrders: async (filters?: {
    status?: string;
    order_type?: string;
    delivery_method?: string;
    priority?: string;
    urgency?: string;
    requires_approval?: boolean;
    start_date?: string;
    end_date?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      });
    }
    
    const response = await api.get(`/clients/orders/?${params.toString()}`);
    return response.data.results || response.data;
  },
  
  getOrdersByType: async (orderType: string) => {
    const response = await api.get(`/clients/orders/?order_type=${orderType}`);
    return response.data.results || response.data;
  },
  
  getOrder: async (id: string) => {
    const response = await api.get(`/clients/orders/${id}/`);
    return response.data;
  },
  
  createOrder: async (data: SoybeanMealOrderData) => {
    const response = await api.post('/clients/orders/', data);
    return response.data;
  },
  
  updateOrder: async (id: string, data: Partial<SoybeanMealOrderData>) => {
    const response = await api.patch(`/clients/orders/${id}/`, data);
    return response.data;
  },
  
  deleteOrder: async (id: string) => {
    const response = await api.delete(`/clients/orders/${id}/`);
    return response.data;
  },
  
  // Order status management
  approveOrder: async (id: string) => {
    const response = await api.post(`/clients/orders/${id}/approve/`);
    return response.data;
  },
  
  confirmOrder: async (id: string) => {
    const response = await api.post(`/clients/orders/${id}/confirm/`);
    return response.data;
  },
  
  planOrder: async (id: string, planningWeek: string) => {
    const response = await api.post(`/clients/orders/${id}/plan/`, {
      planning_week: planningWeek
    });
    return response.data;
  },
  
  assignOrderToRoute: async (id: string, routeId: string, driverId?: string, vehicleId?: string) => {
    const response = await api.post(`/clients/orders/${id}/assign_route/`, {
      route_id: routeId,
      driver_id: driverId,
      vehicle_id: vehicleId
    });
    return response.data;
  },
  
  updateOrderStatus: async (id: string, status: string) => {
    const response = await api.post(`/clients/orders/${id}/update_status/`, {
      status: status
    });
    return response.data;
  },
  
  // Specialized order queries
  getPendingOrders: async () => {
    const response = await api.get('/clients/orders/pending/');
    return response.data.results || response.data;
  },
  
  getOrdersRequiringApproval: async () => {
    const response = await api.get('/clients/orders/requires_approval/');
    return response.data.results || response.data;
  },
  
  getUrgentOrders: async () => {
    const response = await api.get('/clients/orders/urgent/');
    return response.data.results || response.data;
  },
  
  getOverdueOrders: async () => {
    const response = await api.get('/clients/orders/overdue/');
    return response.data.results || response.data;
  },
  
  getOrderSummary: async () => {
    const response = await api.get('/clients/orders/summary/');
    return response.data;
  },

  // Advanced Order Analytics
  getOrderStatistics: async (filters?: { status?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    const response = await api.get(`/clients/orders/statistics/?${params.toString()}`);
    return response.data;
  },

  getAdvancedAnalytics: async (filters?: { start_date?: string; end_date?: string; year?: number }) => {
    const params = new URLSearchParams();
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    if (filters?.year) params.append('year', filters.year.toString());
    const response = await api.get(`/clients/orders/advanced_analytics/?${params.toString()}`);
    return response.data;
  },

  getDeliveryReport: async (filters?: { start_date?: string; end_date?: string }) => {
    const params = new URLSearchParams();
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    const response = await api.get(`/clients/orders/delivery_report/?${params.toString()}`);
    return response.data;
  },

  // Address management and validation
  geocodeFarmerAddress: async (farmerId: string) => {
    const response = await api.post(`/clients/farmers/${farmerId}/geocode_address/`);
    return response.data;
  },
  validateFarmerAddress: async (farmerId: string) => {
    const response = await api.post(`/clients/farmers/${farmerId}/validate_address/`);
    return response.data;
  },
  validateNewAddress: async (address: string, province?: string) => {
    const response = await api.post('/clients/farmers/validate_new_address/', {
      address,
      province
    });
    return response.data;
  },
  getAddressQualityReport: async () => {
    const response = await api.get('/clients/farmers/address_quality_report/');
    return response.data;
  },
  
  // AI Prediction APIs - Replace sensor-based feed storage
  getClients: async (pageSize: number = 1000) => {
    const response = await api.get(`/clients/clients/?page_size=${pageSize}`);
    return response.data.results || response.data;
  },
  getClient: async (id: string) => {
    const response = await api.get(`/clients/clients/${id}/`);
    return response.data;
  },

  // Prediction-based alerts
  getClientPredictions: async () => {
    const response = await api.get('/clients/clients/predictions/');
    return response.data.results || response.data;
  },
  getUpcomingReorders: async (days: number = 7) => {
    const response = await api.get(`/clients/clients/upcoming_reorders/?days=${days}`);
    return response.data.results || response.data;
  },
  getOverduePredictions: async () => {
    const response = await api.get('/clients/clients/overdue_predictions/');
    return response.data.results || response.data;
  },
  getUrgentClients: async () => {
    const response = await api.get('/clients/clients/urgent/');
    return response.data.results || response.data;
  },
  getClientStatistics: async () => {
    const response = await api.get('/clients/clients/statistics/');
    return response.data;
  },

  updatePredictions: async () => {
    const response = await api.post('/clients/clients/update_predictions/');
    return response.data;
  },
  updateClientPrediction: async (clientId: string) => {
    const response = await api.post(`/clients/clients/${clientId}/update_prediction/`);
    return response.data;
  },

  // Timeline-based client filtering
  getClientsByDaysRange: async (daysMin?: number, daysMax?: number, pageSize: number = 100) => {
    const params = new URLSearchParams();
    if (daysMin !== undefined) params.append('days_min', daysMin.toString());
    if (daysMax !== undefined) params.append('days_max', daysMax.toString());
    params.append('page_size', pageSize.toString());

    const response = await api.get(`/clients/clients/?${params.toString()}`);
    return response.data.results || [];
  },
  getOverdueClients: async (pageSize: number = 100) => {
    return clientAPI.getClientsByDaysRange(undefined, -1, pageSize);
  },
  getUrgentClientsByDays: async (pageSize: number = 100) => {
    return clientAPI.getClientsByDaysRange(0, 3, pageSize);
  },
  getHighPriorityClients: async (pageSize: number = 100) => {
    return clientAPI.getClientsByDaysRange(4, 7, pageSize);
  },
};

// Driver APIs for Soya Excel fleet
export const driverAPI = {
  getDrivers: async () => {
    const response = await api.get('/drivers/drivers/');
    return response.data.results || response.data;
  },
  getDriver: async (id: string) => {
    const response = await api.get(`/drivers/drivers/${id}/`);
    return response.data;
  },
  getAvailableDrivers: async () => {
    const response = await api.get('/drivers/drivers/?is_available=true');
    return response.data.results || response.data;
  },
  
  // Driver management actions
  toggleDriverAvailability: async (driverId: string) => {
    const response = await api.post(`/drivers/drivers/${driverId}/toggle_availability/`);
    return response.data;
  },
  assignVehicleToDriver: async (driverId: string, vehicleId: string) => {
    const response = await api.post(`/drivers/drivers/${driverId}/assign_vehicle/`, {
      vehicle_id: vehicleId
    });
    return response.data;
  },
  unassignVehicleFromDriver: async (driverId: string) => {
    const response = await api.post(`/drivers/drivers/${driverId}/unassign_vehicle/`);
    return response.data;
  },
  
  // Driver performance and metrics
  getDriverDeliveries: async (driverId: string) => {
    const response = await api.get(`/drivers/drivers/${driverId}/deliveries/`);
    return response.data;
  },
  getDriverPerformanceMetrics: async (driverId: string) => {
    const response = await api.get(`/drivers/drivers/${driverId}/performance_metrics/`);
    return response.data;
  },
  getDriverAssignedOrders: async (driverId: string) => {
    const response = await api.get(`/drivers/drivers/${driverId}/assigned_orders/`);
    return response.data;
  },
  getDriverPerformanceSummary: async () => {
    const response = await api.get('/drivers/drivers/performance_summary/');
    return response.data;
  },
  
  // Vehicle fleet management
  getVehicles: async () => {
    const response = await api.get('/drivers/vehicles/');
    return response.data.results || response.data;
  },
  getVehicle: async (id: string) => {
    const response = await api.get(`/drivers/vehicles/${id}/`);
    return response.data;
  },
  getVehiclesByType: async (vehicleType: string) => {
    const response = await api.get(`/drivers/vehicles/?vehicle_type=${vehicleType}`);
    return response.data.results || response.data;
  },
  getAvailableVehicles: async () => {
    const response = await api.get('/drivers/vehicles/available/');
    return response.data;
  },
  getVehiclesMaintenanceDue: async () => {
    const response = await api.get('/drivers/vehicles/maintenance_due/');
    return response.data;
  },
  getVehiclePerformanceSummary: async () => {
    const response = await api.get('/drivers/vehicles/performance_summary/');
    return response.data;
  },
  updateVehicleMaintenance: async (vehicleId: string, maintenanceData: {
    last_maintenance?: string;
    next_maintenance_due?: string;
    odometer_km?: number;
  }) => {
    const response = await api.post(`/drivers/vehicles/${vehicleId}/update_maintenance/`, maintenanceData);
    return response.data;
  },
  
  // Deliveries with enhanced tracking
  getDeliveries: async (filters?: {
    driver_id?: string;
    route_id?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      });
    }
    
    const response = await api.get(`/drivers/deliveries/?${params.toString()}`);
    return response.data.results || response.data;
  },
  getDelivery: async (id: string) => {
    const response = await api.get(`/drivers/deliveries/${id}/`);
    return response.data;
  },
  assignDelivery: async (data: DeliveryData) => {
    const response = await api.post('/drivers/deliveries/', data);
    return response.data;
  },
  startDelivery: async (deliveryId: string) => {
    const response = await api.post(`/drivers/deliveries/${deliveryId}/start_delivery/`);
    return response.data;
  },
  completeDelivery: async (deliveryId: string, completionData?: {
    actual_distance_km?: number;
    actual_duration_minutes?: number;
  }) => {
    const response = await api.post(`/drivers/deliveries/${deliveryId}/complete_delivery/`, completionData || {});
    return response.data;
  },
  updateDeliveryLocation: async (deliveryId: string, locationData: {
    latitude?: number;
    longitude?: number;
    gps_data?: object;
  }) => {
    const response = await api.post(`/drivers/deliveries/${deliveryId}/update_location/`, locationData);
    return response.data;
  },
  
  // Delivery queries
  getActiveDeliveries: async () => {
    const response = await api.get('/drivers/deliveries/active/');
    return response.data;
  },
  getOverdueDeliveries: async () => {
    const response = await api.get('/drivers/deliveries/overdue/');
    return response.data;
  },
  getTodayDeliveries: async () => {
    const response = await api.get('/drivers/deliveries/today/');
    return response.data;
  },
  
  // Performance metrics
  getDeliveryPerformance: async () => {
    const response = await api.get('/drivers/delivery-performance-metrics/');
    return response.data.results || response.data;
  },
  getDeliveryPerformanceSummary: async (days: number = 30) => {
    const response = await api.get(`/drivers/deliveries/performance_summary/?days=${days}`);
    return response.data;
  },
};

// Route APIs for Soya Excel operations
export const routeAPI = {
  getRoutes: async () => {
    const response = await api.get('/routes/routes/');
    return response.data.results || response.data;
  },
  getRoute: async (id: string) => {
    const response = await api.get(`/routes/routes/${id}/`);
    return response.data;
  },
  getRoutesByType: async (routeType: string) => {
    const response = await api.get(`/routes/routes/?route_type=${routeType}`);
    return response.data.results || response.data;
  },
  createRoute: async (data: RouteData) => {
    const response = await api.post('/routes/routes/', data);
    return response.data;
  },
  updateRoute: async (routeId: string, data: Partial<RouteData>) => {
    const response = await api.patch(`/routes/routes/${routeId}/`, data);
    return response.data;
  },
  deleteRoute: async (routeId: string) => {
    const response = await api.delete(`/routes/routes/${routeId}/`);
    return response.data;
  },
  addStopToRoute: async (routeId: string, data: {
    client_id: number;
    order_id?: number;
    sequence_number?: number;
  }) => {
    const response = await api.post(`/routes/routes/${routeId}/add_stop/`, data);
    return response.data;
  },
  optimizeRoute: async (routeId: number, optimizationType?: string) => {
    const response = await api.post(`/routes/routes/${routeId}/optimize/`, {
      optimization_type: optimizationType || 'balanced'
    });
    return response.data;
  },
  
  // Google Maps integration endpoints
  getRouteDirections: async (routeId: string) => {
    const response = await api.get(`/routes/routes/${routeId}/directions/`);
    return response.data;
  },
  geocodeAddress: async (address: string, province?: string) => {
    const response = await api.post('/routes/routes/geocode_address/', {
      address,
      province
    });
    return response.data;
  },
  optimizeWeeklyRoutes: async (weekStart: string) => {
    const response = await api.post('/routes/routes/optimize_weekly/', {
      week_start: weekStart
    });
    return response.data;
  },
  getRouteKPIs: async (routeId: string) => {
    const response = await api.get(`/routes/routes/${routeId}/kpis/`);
    return response.data;
  },
  
  // Today's and active routes
  getTodayRoutes: async () => {
    const response = await api.get('/routes/routes/today/');
    return response.data;
  },
  getActiveRoutes: async () => {
    const response = await api.get('/routes/routes/active/');
    return response.data;
  },
  
  // Route activation and completion
  activateRoute: async (routeId: string) => {
    const response = await api.post(`/routes/routes/${routeId}/activate/`);
    return response.data;
  },
  completeRoute: async (routeId: string) => {
    const response = await api.post(`/routes/routes/${routeId}/complete/`);
    return response.data;
  },
  
  // Weekly and monthly route performance
  getWeeklyRoutePerformance: async () => {
    const response = await api.get('/routes/weekly-route-performance/');
    return response.data.results || response.data;
  },
  getMonthlyRoutePerformance: async () => {
    const response = await api.get('/routes/monthly-route-performance/');
    return response.data.results || response.data;
  },
  
  // Route stops management
  getRouteStops: async (routeId?: string) => {
    const url = routeId ? `/routes/stops/?route=${routeId}` : '/routes/stops/';
    const response = await api.get(url);
    return response.data.results || response.data;
  },
  completeRouteStop: async (stopId: string) => {
    const response = await api.post(`/routes/stops/${stopId}/complete/`);
    return response.data;
  },
  updateRouteStopNotes: async (stopId: string, notes: string) => {
    const response = await api.post(`/routes/stops/${stopId}/update_notes/`, {
      notes
    });
    return response.data;
  },
  
  // Live tracking and vehicle positions
  getLiveTracking: async (routeIds?: string[]) => {
    const params = new URLSearchParams();
    if (routeIds && routeIds.length > 0) {
      routeIds.forEach(id => params.append('route_ids', id));
    }
    const response = await api.get(`/routes/routes/live_tracking/?${params.toString()}`);
    return response.data;
  },
  
  getDeliveryProgress: async (routeId: string) => {
    const response = await api.get(`/routes/routes/${routeId}/delivery_progress/`);
    return response.data;
  },

  // Distribution Planning - Multi-client route optimization
  createDistributionPlan: async (data: {
    client_ids: number[];
    date: string;
    max_stops_per_route?: number;
    max_distance_km?: number;
    clustering_method?: 'dbscan' | 'kmeans';
    use_async?: boolean;
    create_routes?: boolean;
  }) => {
    const response = await api.post('/routes/routes/create_distribution_plan/', data);
    return response.data;
  },

  // Batch Geocoding
  batchGeocodeClients: async (data: {
    client_ids: number[];
    force_update?: boolean;
    use_async?: boolean;
  }) => {
    const response = await api.post('/routes/routes/batch_geocode/', data);
    return response.data;
  },

  // ========================================================================
  // DRIVER ASSIGNMENT & GOOGLE MAPS SHARING
  // ========================================================================

  // Assign route to driver with Google Maps navigation
  assignRouteToDriver: async (routeId: string, data: {
    driver_id: number;
    vehicle_id?: number;
    send_notification?: boolean;
    notification_method?: 'email' | 'sms' | 'both';
  }) => {
    const response = await api.post(`/routes/routes/${routeId}/assign_to_driver/`, data);
    return response.data;
  },

  // Unassign driver from route
  unassignDriver: async (routeId: string) => {
    const response = await api.post(`/routes/routes/${routeId}/unassign_driver/`);
    return response.data;
  },

  // Get Google Maps navigation links
  getGoogleMapsLinks: async (routeId: string, urlType: 'web' | 'mobile' | 'android' | 'ios' = 'mobile') => {
    const response = await api.get(`/routes/routes/${routeId}/google_maps_links/?url_type=${urlType}`);
    return response.data;
  },

  // Get comprehensive route summary for drivers
  getDriverSummary: async (routeId: string) => {
    const response = await api.get(`/routes/routes/${routeId}/driver_summary/`);
    return response.data;
  },

  // Get QR code data for route sharing
  getQRCodeData: async (routeId: string, urlType: 'web' | 'mobile' | 'android' | 'ios' = 'mobile') => {
    const response = await api.get(`/routes/routes/${routeId}/qr_code_data/?url_type=${urlType}`);
    return response.data;
  },

  // Get real-time tracking status
  getTrackingStatus: async (routeId: string) => {
    const response = await api.get(`/routes/routes/${routeId}/tracking_status/`);
    return response.data;
  },

  // ========================================================================
  // ROUTE ANALYTICS
  // ========================================================================

  // Get weekly performance metrics
  getWeeklyPerformance: async (params?: {
    week_start?: string;
    weeks?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.week_start) queryParams.append('week_start', params.week_start);
    if (params?.weeks) queryParams.append('weeks', params.weeks.toString());
    const response = await api.get(`/routes/analytics/weekly_performance/?${queryParams.toString()}`);
    return response.data;
  },

  // Get monthly performance metrics
  getMonthlyPerformance: async (params?: {
    month?: string;
    months?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.month) queryParams.append('month', params.month);
    if (params?.months) queryParams.append('months', params.months.toString());
    const response = await api.get(`/routes/analytics/monthly_performance/?${queryParams.toString()}`);
    return response.data;
  },

  // Get driver performance rankings
  getDriverRankings: async (params?: {
    start_date?: string;
    end_date?: string;
    metric?: 'on_time_rate' | 'efficiency' | 'total_deliveries';
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.start_date) queryParams.append('start_date', params.start_date);
    if (params?.end_date) queryParams.append('end_date', params.end_date);
    if (params?.metric) queryParams.append('metric', params.metric);
    const response = await api.get(`/routes/analytics/driver_rankings/?${queryParams.toString()}`);
    return response.data;
  },

  // Get vehicle efficiency metrics
  getVehicleEfficiency: async (params?: {
    start_date?: string;
    end_date?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.start_date) queryParams.append('start_date', params.start_date);
    if (params?.end_date) queryParams.append('end_date', params.end_date);
    const response = await api.get(`/routes/analytics/vehicle_efficiency/?${queryParams.toString()}`);
    return response.data;
  },

  // Get optimization savings report
  getOptimizationSavings: async (params?: {
    start_date?: string;
    end_date?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.start_date) queryParams.append('start_date', params.start_date);
    if (params?.end_date) queryParams.append('end_date', params.end_date);
    const response = await api.get(`/routes/analytics/optimization_savings/?${queryParams.toString()}`);
    return response.data;
  },

  // Get planning accuracy trend
  getPlanningAccuracyTrend: async (weeks: number = 12) => {
    const response = await api.get(`/routes/analytics/planning_accuracy_trend/?weeks=${weeks}`);
    return response.data;
  },

  // ========================================================================
  // DRIVER MOBILE APP ENDPOINTS
  // ========================================================================

  // Get driver's assigned routes with navigation
  getDriverAssignedRoutes: async (driverId: string) => {
    const response = await api.get(`/drivers/drivers/${driverId}/assigned_routes/`);
    return response.data;
  },

  // Get current route navigation for driver
  getCurrentRouteNavigation: async (driverId: string) => {
    const response = await api.get(`/drivers/drivers/${driverId}/current_route_navigation/`);
    return response.data;
  },

  // ========================================================================
  // REAL-TIME TRACKING - Driver Delivery Operations
  // ========================================================================

  // Record GPS position update (for driver mobile app)
  updateDriverPosition: async (data: {
    route_id?: string;
    latitude: number;
    longitude: number;
    speed?: number;
    heading?: number;
    accuracy?: number;
    timestamp?: string;
    battery_level?: number;
    is_moving?: boolean;
    is_ignition_on?: boolean;
  }) => {
    const response = await api.post('/routes/driver/deliveries/update_position/', data);
    return response.data;
  },

  // Start delivery at a stop
  startDelivery: async (data: {
    stop_id: number;
    arrival_latitude?: number;
    arrival_longitude?: number;
  }) => {
    const response = await api.post('/routes/driver/deliveries/start_delivery/', data);
    return response.data;
  },

  // Complete delivery at a stop
  completeDelivery: async (data: {
    stop_id: number;
    quantity_delivered?: number;
    notes?: string;
    signature_image?: string;
    proof_photo?: string;
    customer_rating?: number;
    had_issues?: boolean;
    issue_description?: string;
  }) => {
    const response = await api.post('/routes/driver/deliveries/complete_delivery/', data);
    return response.data;
  },

  // Report delivery issue
  reportDeliveryIssue: async (data: {
    stop_id: number;
    issue_type: 'access_denied' | 'client_unavailable' | 'wrong_product' | 'other';
    description: string;
    photo?: string;
  }) => {
    const response = await api.post('/routes/driver/deliveries/report_issue/', data);
    return response.data;
  },

  // Get driver's current position and route progress
  getDriverCurrentPosition: async () => {
    const response = await api.get('/routes/driver/deliveries/current_position/');
    return response.data;
  },

  // Get driver's active route (for driver mobile app)
  getDriverActiveRoute: async () => {
    const response = await api.get('/routes/driver/routes/active/');
    return response.data;
  },

  // Start a route (driver app)
  startDriverRoute: async (routeId: string) => {
    const response = await api.post(`/routes/driver/routes/${routeId}/start_route/`);
    return response.data;
  },

  // Complete a route (driver app)
  completeDriverRoute: async (routeId: string) => {
    const response = await api.post(`/routes/driver/routes/${routeId}/complete_route/`);
    return response.data;
  },
}; 