'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { clientAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';

interface PredictionUpdateModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export function PredictionUpdateModal({ onClose, onSuccess }: PredictionUpdateModalProps) {
  const [updating, setUpdating] = useState(false);
  const [result, setResult] = useState<{
    status: string;
    message: string;
    updated_clients?: number;
    total_clients?: number;
  } | null>(null);

  const handleUpdate = async () => {
    try {
      setUpdating(true);
      const response = await clientAPI.updatePredictions();
      setResult(response);

      if (response.status === 'success') {
        toast.success(response.message);
        if (onSuccess) {
          onSuccess();
        }
      } else {
        toast.error(response.message || 'Failed to update predictions');
      }
    } catch (error: any) {
      console.error('Error updating predictions:', error);
      toast.error(error.response?.data?.message || 'Failed to update predictions');
      setResult({
        status: 'error',
        message: error.response?.data?.message || 'Failed to update predictions'
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            Update Client Predictions
          </CardTitle>
          <CardDescription>
            Run the ML model to update predicted next order dates for all clients
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!result && !updating && (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium mb-1">Important:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>This process may take several minutes depending on the number of clients</li>
                      <li>The system will be locked during the update</li>
                      <li>Predictions will be updated for all active clients</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={onClose} disabled={updating}>
                  Cancel
                </Button>
                <Button onClick={handleUpdate} disabled={updating}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Update Predictions
                </Button>
              </div>
            </div>
          )}

          {updating && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mb-4"></div>
              <p className="text-lg font-medium text-gray-700">Updating predictions...</p>
              <p className="text-sm text-gray-500 mt-2">Please wait, this may take a few minutes</p>
            </div>
          )}

          {result && !updating && (
            <div className="space-y-4">
              {result.status === 'success' ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-green-800">{result.message}</p>
                      {result.updated_clients !== undefined && (
                        <p className="text-sm text-green-700 mt-1">
                          Updated {result.updated_clients} out of {result.total_clients} clients
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-800">Error</p>
                      <p className="text-sm text-red-700 mt-1">{result.message}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
