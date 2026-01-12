'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, CheckCircle2, AlertCircle, QrCode, Smartphone } from 'lucide-react';
import { authAPI } from '@/lib/api';
import { toast } from 'react-hot-toast';
import Image from 'next/image';

interface MFASetupModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export function MFASetupModal({ onClose, onSuccess }: MFASetupModalProps) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'initial' | 'qr' | 'verify' | 'success'>('initial');
  const [qrCode, setQrCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState('');

  const handleSetupMFA = async () => {
    try {
      setLoading(true);
      const response = await authAPI.setupMFA();
      setQrCode(response.qr_code);
      setSecret(response.secret);
      setStep('qr');
    } catch (error) {
      console.error('Error setting up MFA:', error);
      const errorMessage = error instanceof Error && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to setup MFA'
        : 'Failed to setup MFA';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySetup = async () => {
    if (verificationCode.length !== 6) {
      toast.error('Please enter a valid 6-digit code');
      return;
    }

    try {
      setLoading(true);
      await authAPI.verifyMFASetup(verificationCode);
      setStep('success');
      toast.success('MFA enabled successfully!');

      // Wait 2 seconds before closing to show success message
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        }
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Error verifying MFA:', error);
      const errorMessage = error instanceof Error && 'response' in error
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Invalid verification code'
        : 'Invalid verification code';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToVerify = () => {
    setStep('verify');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-600" />
            Enable Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Add an extra layer of security to your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Initial Step */}
          {step === 'initial' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-2">What is Two-Factor Authentication?</p>
                    <p className="mb-3">
                      Two-Factor Authentication (2FA) adds an extra layer of security to your account.
                      After entering your password, you&apos;ll need to enter a 6-digit code from your authenticator app.
                    </p>
                    <p className="font-medium mb-1">You&apos;ll need:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>An authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.)</li>
                      <li>Your smartphone or tablet</li>
                      <li>2-3 minutes to complete the setup</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium mb-1">Important:</p>
                    <p>Once enabled, you&apos;ll need your authenticator app to log in. Make sure you have it installed and accessible.</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={onClose} disabled={loading}>
                  Cancel
                </Button>
                <Button onClick={handleSetupMFA} disabled={loading}>
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Smartphone className="h-4 w-4 mr-2" />
                      Begin Setup
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* QR Code Step */}
          {step === 'qr' && (
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="text-center space-y-4">
                  <div className="flex justify-center">
                    <QrCode className="h-8 w-8 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Scan QR Code</h3>
                  <p className="text-sm text-gray-600">
                    Open your authenticator app and scan this QR code
                  </p>

                  {qrCode && (
                    <div className="flex justify-center my-6">
                      <div className="bg-white p-4 rounded-lg border-2 border-gray-300">
                        <Image
                          src={qrCode}
                          alt="MFA QR Code"
                          width={200}
                          height={200}
                          className="w-64 h-64"
                        />
                      </div>
                    </div>
                  )}

                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-600 mb-2">Can&apos;t scan? Enter this key manually:</p>
                    <code className="text-sm font-mono bg-white px-3 py-2 rounded border border-gray-200 break-all">
                      {secret}
                    </code>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-2">Popular Authenticator Apps:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Google Authenticator (iOS & Android)</li>
                    <li>Microsoft Authenticator (iOS & Android)</li>
                    <li>Authy (iOS, Android & Desktop)</li>
                    <li>1Password (with TOTP support)</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={handleProceedToVerify}>
                  Next: Verify Code
                </Button>
              </div>
            </div>
          )}

          {/* Verify Step */}
          {step === 'verify' && (
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="text-center space-y-4">
                  <div className="flex justify-center">
                    <Smartphone className="h-8 w-8 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Enter Verification Code</h3>
                  <p className="text-sm text-gray-600">
                    Enter the 6-digit code from your authenticator app to complete setup
                  </p>

                  <div className="max-w-xs mx-auto space-y-2">
                    <Label htmlFor="verificationCode" className="text-gray-700">
                      Verification Code
                    </Label>
                    <Input
                      id="verificationCode"
                      type="text"
                      placeholder="000000"
                      className="text-center text-2xl tracking-widest h-14"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      disabled={loading}
                      autoFocus
                    />
                    <p className="text-xs text-gray-500 text-center">
                      The code refreshes every 30 seconds
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setStep('qr')} disabled={loading}>
                  Back
                </Button>
                <Button
                  onClick={handleVerifySetup}
                  disabled={loading || verificationCode.length !== 6}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Verifying...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Enable MFA
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Success Step */}
          {step === 'success' && (
            <div className="py-12">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="bg-green-100 rounded-full p-4">
                    <CheckCircle2 className="h-12 w-12 text-green-600" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900">MFA Enabled Successfully!</h3>
                <p className="text-gray-600">
                  Your account is now protected with two-factor authentication.
                </p>
                <p className="text-sm text-gray-500">
                  You&apos;ll need your authenticator app the next time you log in.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
