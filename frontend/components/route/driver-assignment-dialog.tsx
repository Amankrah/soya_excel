'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Truck, Mail, MessageSquare, QrCode, ExternalLink, Check, AlertCircle } from 'lucide-react';
import { routeAPI, driverAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';

interface Driver {
  id: number;
  full_name: string;
  phone_number?: string;
  is_available: boolean;
  assigned_vehicle?: {
    id: number;
    vehicle_number: string;
    vehicle_type: string;
  };
}

interface Vehicle {
  id: number;
  vehicle_number: string;
  vehicle_type: string;
  capacity_tonnes: number;
  is_available: boolean;
}

interface Route {
  id: string;
  name: string;
  date: string;
  status?: string;
  driver_name?: string | null;
  vehicle_number?: string | null;
  total_distance?: number;
  estimated_duration?: number;
  stops: {
    id: number;
    address: string;
    latitude?: number;
    longitude?: number;
    sequence_order: number;
  }[];
}

interface GoogleMapsUrls {
  web: string;
  mobile: string;
  android: string;
  ios: string;
}

interface DriverAssignmentDialogProps {
  route: Route | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssignmentComplete?: () => void;
}

export function DriverAssignmentDialog({
  route,
  open,
  onOpenChange,
  onAssignmentComplete
}: DriverAssignmentDialogProps) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [sendNotification, setSendNotification] = useState(true);
  const [notificationMethod, setNotificationMethod] = useState<'email' | 'sms' | 'both'>('email');
  const [reassignmentReason, setReassignmentReason] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Check if this is a reassignment (route already has a driver assigned)
  const isReassignment = !!route?.driver_name;
  const [assignmentResult, setAssignmentResult] = useState<{
    message: string;
    route_id: number;
    driver_id: number;
    vehicle_id: number;
    google_maps_urls: GoogleMapsUrls;
    notification?: {
      sent: boolean;
      method: string;
      message?: string;
      email_sent?: boolean;
      sms_sent?: boolean;
      errors?: string[];
    };
  } | null>(null);
  const [googleMapsUrls, setGoogleMapsUrls] = useState<GoogleMapsUrls | null>(null);
  const [activeTab, setActiveTab] = useState<'assign' | 'result'>('assign');

  // Load drivers and vehicles
  useEffect(() => {
    if (open) {
      loadDriversAndVehicles();
      setActiveTab('assign');
      setAssignmentResult(null);
      setGoogleMapsUrls(null);
    }
  }, [open]);

  const loadDriversAndVehicles = async () => {
    setLoadingData(true);
    try {
      const [driversData, vehiclesData] = await Promise.all([
        driverAPI.getDrivers(),
        driverAPI.getVehicles()
      ]);
      setDrivers(driversData);
      setVehicles(vehiclesData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load drivers and vehicles');
    } finally {
      setLoadingData(false);
    }
  };

  const handleAssign = async () => {
    if (!route || !selectedDriverId) {
      toast.error('Please select a driver');
      return;
    }

    // Validate reassignment reason if this is a reassignment
    if (isReassignment && !reassignmentReason.trim()) {
      toast.error('Please provide a reason for reassignment');
      return;
    }

    setLoading(true);
    try {
      const result = await routeAPI.assignRouteToDriver(route.id, {
        driver_id: parseInt(selectedDriverId),
        vehicle_id: selectedVehicleId ? parseInt(selectedVehicleId) : undefined,
        send_notification: sendNotification,
        notification_method: notificationMethod,
        reassignment_reason: isReassignment ? reassignmentReason : undefined
      });

      setAssignmentResult(result);
      setGoogleMapsUrls(result.google_maps_urls);
      setActiveTab('result');

      toast.success(result.message || 'Route assigned successfully!');

    } catch (error: unknown) {
      console.error('Error assigning route:', error);
      let errorMessage = 'Failed to assign route';
      if (error instanceof Error) {
        errorMessage = error.message;
        if ('response' in error && error.response && typeof error.response === 'object') {
          const response = error.response as { data?: { error?: string } };
          errorMessage = response.data?.error || error.message;
        }
      }
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (assignmentResult && onAssignmentComplete) {
      onAssignmentComplete();
    }
    onOpenChange(false);
    setSelectedDriverId('');
    setSelectedVehicleId('');
    setAssignmentResult(null);
    setGoogleMapsUrls(null);
  };

  const selectedDriver = drivers.find(d => d.id === parseInt(selectedDriverId));
  const selectedVehicle = vehicles.find(v => v.id === parseInt(selectedVehicleId));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            {isReassignment ? 'Reassign Route to Driver' : 'Assign Route to Driver'}
          </DialogTitle>
          <DialogDescription>
            {route && `${route.name} - ${route.date}`}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'assign' | 'result')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="assign">Assignment</TabsTrigger>
            <TabsTrigger value="result" disabled={!assignmentResult}>Result & Sharing</TabsTrigger>
          </TabsList>

          {/* Assignment Tab */}
          <TabsContent value="assign" className="space-y-4 mt-4">
            {loadingData ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : (
              <>
                {/* Driver Selection */}
                <div className="space-y-2">
                  <Label htmlFor="driver">Select Driver *</Label>
                  <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                    <SelectTrigger id="driver">
                      <SelectValue placeholder="Choose a driver" />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers.map((driver) => (
                        <SelectItem key={driver.id} value={driver.id.toString()}>
                          <div className="flex items-center gap-2">
                            <span>{driver.full_name}</span>
                            {!driver.is_available && (
                              <span className="text-xs text-gray-500">(Busy)</span>
                            )}
                            {driver.assigned_vehicle && (
                              <span className="text-xs text-blue-600">
                                ({driver.assigned_vehicle.vehicle_number})
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedDriver && selectedDriver.phone_number && (
                    <p className="text-xs text-gray-500">
                      📱 {selectedDriver.phone_number}
                    </p>
                  )}
                </div>

                {/* Reassignment Warning & Reason */}
                {isReassignment && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-medium text-yellow-900 text-sm">Reassignment Required</h4>
                        <p className="text-xs text-yellow-700 mt-1">
                          This route is already assigned to <strong>{route?.driver_name}</strong>.
                          Please provide a reason for reassignment.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reassignment-reason">Reassignment Reason *</Label>
                      <textarea
                        id="reassignment-reason"
                        className="w-full min-h-[80px] px-3 py-2 text-sm border border-yellow-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        placeholder="e.g., Driver unavailable, vehicle breakdown, schedule conflict..."
                        value={reassignmentReason}
                        onChange={(e) => setReassignmentReason(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* Vehicle Selection */}
                <div className="space-y-2">
                  <Label htmlFor="vehicle">Select Vehicle (Optional)</Label>
                  <Select value={selectedVehicleId || "default"} onValueChange={(value) => setSelectedVehicleId(value === "default" ? "" : value)}>
                    <SelectTrigger id="vehicle">
                      <SelectValue placeholder="Choose a vehicle or use driver's vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Use driver&apos;s assigned vehicle</SelectItem>
                      {vehicles.filter(v => v.is_available).map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                          {vehicle.vehicle_number} - {vehicle.vehicle_type} ({vehicle.capacity_tonnes}t)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedVehicle && (
                    <p className="text-xs text-gray-500">
                      Capacity: {selectedVehicle.capacity_tonnes} tonnes
                    </p>
                  )}
                </div>

                {/* Notification Settings */}
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="notification"
                      checked={sendNotification}
                      onCheckedChange={(checked: boolean) => setSendNotification(checked)}
                    />
                    <Label htmlFor="notification" className="cursor-pointer">
                      Send notification to driver
                    </Label>
                  </div>

                  {sendNotification && (
                    <div className="ml-6 space-y-2">
                      <Label>Notification Method</Label>
                      <RadioGroup value={notificationMethod} onValueChange={(v: 'email' | 'sms' | 'both') => setNotificationMethod(v)}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="email" id="email" />
                          <Label htmlFor="email" className="cursor-pointer flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            Email
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="sms" id="sms" />
                          <Label htmlFor="sms" className="cursor-pointer flex items-center gap-1">
                            <MessageSquare className="w-4 h-4" />
                            SMS
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="both" id="both" />
                          <Label htmlFor="both" className="cursor-pointer">
                            Both Email & SMS
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                  )}
                </div>

                {/* Route Summary */}
                {route && (
                  <div className="bg-gray-50 p-3 rounded-lg text-sm space-y-1">
                    <h4 className="font-medium">Route Summary</h4>
                    <p>📍 Stops: {route.stops?.length || 0}</p>
                    {route.total_distance && (
                      <p>🛣️ Distance: {route.total_distance} km</p>
                    )}
                    {route.estimated_duration && (
                      <p>⏱️ Duration: {Math.floor(route.estimated_duration / 60)}h {route.estimated_duration % 60}m</p>
                    )}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Result & Sharing Tab */}
          <TabsContent value="result" className="space-y-4 mt-4">
            {assignmentResult && (
              <>
                {/* Success Message */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-600 mt-0.5" />
                    <div>
                      <h3 className="font-medium text-green-900">Route Assigned Successfully!</h3>
                      <p className="text-sm text-green-700 mt-1">
                        {assignmentResult.message}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Notification Status */}
                {sendNotification && assignmentResult.notification && (
                  <div className={`border rounded-lg p-4 ${
                    assignmentResult.notification.sent
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-yellow-50 border-yellow-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      {assignmentResult.notification.sent ? (
                        <Check className="w-5 h-5 text-blue-600 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">Notification Status</h4>
                        <p className="text-xs mt-1">{assignmentResult.notification.message}</p>
                        {assignmentResult.notification.email_sent && (
                          <p className="text-xs text-green-600 mt-1">✓ Email sent</p>
                        )}
                        {assignmentResult.notification.sms_sent && (
                          <p className="text-xs text-green-600 mt-1">✓ SMS sent</p>
                        )}
                        {assignmentResult.notification.errors && assignmentResult.notification.errors.length > 0 && (
                          <div className="text-xs text-red-600 mt-2 space-y-1">
                            {assignmentResult.notification.errors.map((error, idx) => (
                              <p key={idx}>✗ {error}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Google Maps Links */}
                {googleMapsUrls && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Google Maps Navigation Links</h4>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start"
                        onClick={() => window.open(googleMapsUrls.web, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Open in Web
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start"
                        onClick={() => window.open(googleMapsUrls.mobile, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Mobile Web
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start"
                        onClick={() => navigator.clipboard.writeText(googleMapsUrls.android)}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Copy Android Link
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start"
                        onClick={() => navigator.clipboard.writeText(googleMapsUrls.ios)}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Copy iOS Link
                      </Button>
                    </div>

                    {/* QR Code */}
                    <div className="border rounded-lg p-4 flex flex-col items-center">
                      <div className="flex items-center gap-2 mb-3">
                        <QrCode className="w-4 h-4" />
                        <span className="text-sm font-medium">Scan to Open Route</span>
                      </div>
                      <QRCodeSVG
                        value={googleMapsUrls.web}
                        size={200}
                        level="H"
                        includeMargin
                      />
                      <p className="text-xs text-gray-500 mt-2 text-center">
                        Driver can scan this QR code to open the route in Google Maps with all stops
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          {activeTab === 'assign' ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleAssign} disabled={loading || !selectedDriverId}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isReassignment ? 'Reassigning...' : 'Assigning...'}
                  </>
                ) : (
                  isReassignment ? 'Reassign Route' : 'Assign Route'
                )}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
