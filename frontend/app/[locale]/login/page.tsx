'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/lib/store';
import { useAuth } from '@/lib/hooks/useAuth';
import Image from 'next/image';
import { Leaf, Lock, User, ArrowRight, Truck, MapPin, BarChart3, Shield, ArrowLeft } from 'lucide-react';
import { LanguageSwitcher } from '@/components/ui/language-switcher';

type LoginFormData = {
  username: string;
  password: string;
};

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const locale = params?.locale || 'fr';
  const { isLoading: authLoading } = useAuth(false);

  const loginSchema = z.object({
    username: z.string().min(1, t('auth.usernameRequired')),
    password: z.string().min(1, t('auth.passwordRequired')),
  });
  const [isLoading, setIsLoading] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const login = useAuthStore((state) => state.login);
  const mfaRequired = useAuthStore((state) => state.mfaRequired);
  const mfaUsername = useAuthStore((state) => state.mfaUsername);
  const clearMFA = useAuthStore((state) => state.clearMFA);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const result = await login(data.username, data.password);

      if (result.mfaRequired) {
        toast.success(result.message || t('auth.pleaseEnterMFA'));
        return;
      }

      toast.success(t('auth.welcomeBackMessage'));
      router.push(`/${locale}/dashboard`);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('auth.invalidCredentials');
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const onMFASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaCode || mfaCode.length !== 6) {
      toast.error(t('auth.enterValid6Digit'));
      return;
    }

    setIsLoading(true);
    try {
      const { authAPI } = await import('@/lib/api');
      const response = await authAPI.verifyMFALogin(mfaUsername!, mfaCode);

      // Store token
      const token = response.access || response.token;
      localStorage.setItem('authToken', token);

      // Update store
      const { setUser, setToken } = useAuthStore.getState();
      setUser(response.user);
      setToken(token);
      clearMFA();

      toast.success(t('auth.welcomeBackMessage'));
      router.push(`/${locale}/dashboard`);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('auth.invalidMFACode');
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    clearMFA();
    setMfaCode('');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center soya-gradient-animated">
        <div className="text-center soya-fade-in">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-yellow-400 to-yellow-500 flex items-center justify-center mx-auto shadow-2xl shadow-yellow-500/30">
              <Leaf className="h-10 w-10 text-gray-900" />
            </div>
            <div className="absolute inset-0 rounded-2xl bg-yellow-400/20 animate-ping"></div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{t('brand.name')}</h2>
          <p className="text-gray-400">{t('auth.loadingYourDashboard')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex soya-gradient-animated relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-yellow-500/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-green-500/5 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2"></div>
        <div className="absolute top-1/2 left-1/4 w-[300px] h-[300px] bg-yellow-500/3 rounded-full blur-3xl"></div>
        
        {/* Geometric patterns */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 left-20 w-32 h-32 border border-white/20 rounded-2xl transform rotate-12"></div>
          <div className="absolute top-40 right-40 w-24 h-24 border border-white/20 rounded-xl transform -rotate-12"></div>
          <div className="absolute bottom-32 left-1/3 w-20 h-20 border border-white/20 rounded-lg transform rotate-45"></div>
        </div>
      </div>

      {/* Left Side - Branding & Features */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10 flex-col justify-between p-12">
        {/* Logo & Brand */}
        <div className="soya-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-2xl p-3 shadow-xl shadow-yellow-500/20">
                <Image
                  src="/LOGO-SoyaExcel.png"
                  alt="SoyaFlow Logo"
                  width={48}
                  height={48}
                  className="w-12 h-12 object-contain"
                />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">{t('brand.name')}</h1>
                <p className="text-yellow-400 font-medium">{t('brand.tagline')}</p>
              </div>
            </div>
            <LanguageSwitcher />
          </div>
        </div>

        {/* Hero Content */}
        <div className="flex-1 flex flex-col justify-center max-w-lg">
          <h2 className="text-5xl font-bold text-white mb-6 leading-tight soya-fade-in soya-stagger-1">
            {t('loginPage.heroTitle')}
            <span className="block text-gradient-gold">{t('loginPage.heroTitleAccent')}</span>
          </h2>
          <p className="text-xl text-gray-300 mb-10 soya-fade-in soya-stagger-2">
            {t('loginPage.heroDescription')}
          </p>

          {/* Feature Pills */}
          <div className="flex flex-wrap gap-3 soya-fade-in soya-stagger-3">
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2">
              <Truck className="h-4 w-4 text-yellow-400" />
              <span className="text-sm text-white font-medium">{t('features.routeOptimization')}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2">
              <MapPin className="h-4 w-4 text-green-400" />
              <span className="text-sm text-white font-medium">{t('features.liveTracking')}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2">
              <BarChart3 className="h-4 w-4 text-yellow-400" />
              <span className="text-sm text-white font-medium">{t('features.aiPredictions')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative z-10">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8 soya-fade-in">
            <div className="flex justify-center mb-4">
              <div className="bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-2xl p-4 shadow-xl shadow-yellow-500/30">
                <Image
                  src="/LOGO-SoyaExcel.png"
                  alt="SoyaFlow Logo"
                  width={64}
                  height={64}
                  className="w-16 h-16 object-contain"
                />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-1">{t('brand.name')}</h1>
            <p className="text-yellow-400/80">{t('brand.tagline')}</p>
            <div className="mt-4">
              <LanguageSwitcher />
            </div>
          </div>
          
          {/* Login Card */}
          <Card className="soya-card-glass border-0 shadow-2xl soya-scale-in">
            <CardHeader className="text-center pb-2 pt-8">
              <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center mb-4 shadow-lg shadow-green-600/30">
                {mfaRequired ? <Shield className="h-6 w-6 text-white" /> : <Lock className="h-6 w-6 text-white" />}
              </div>
              <CardTitle className="text-2xl font-bold text-gray-900">
                {mfaRequired ? t('auth.mfaTitle') : t('auth.welcomeBack')}
              </CardTitle>
              <CardDescription className="text-gray-600">
                {mfaRequired
                  ? t('auth.mfaDescription')
                  : t('auth.signInDescription')
                }
              </CardDescription>
            </CardHeader>

            <CardContent className="p-8 pt-6">
              {mfaRequired ? (
                <form onSubmit={onMFASubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="mfaCode" className="text-gray-700 font-medium flex items-center gap-2">
                      <Shield className="h-4 w-4 text-gray-400" />
                      {t('auth.authenticationCode')}
                    </Label>
                    <Input
                      id="mfaCode"
                      type="text"
                      placeholder={t('auth.mfaCodePlaceholder')}
                      className="soya-input h-12 text-center text-2xl tracking-widest"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      disabled={isLoading}
                      autoFocus
                    />
                    <p className="text-xs text-gray-500 text-center">
                      {t('auth.checkAuthenticator')}
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full soya-button-primary h-12 text-base"
                    disabled={isLoading || mfaCode.length !== 6}
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="soya-spinner w-5 h-5 border-2"></div>
                        <span>{t('auth.verifying')}</span>
                      </div>
                    ) : (
                      t('auth.verifyAndSignIn')
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-12"
                    onClick={handleBackToLogin}
                    disabled={isLoading}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t('auth.backToLogin')}
                  </Button>
                </form>
              ) : (
                <>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-gray-700 font-medium flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    {t('auth.username')}
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder={t('auth.usernamePlaceholder')}
                    className="soya-input h-12"
                    {...register('username')}
                    disabled={isLoading}
                  />
                  {errors.username && (
                    <p className="text-sm text-red-600 flex items-center gap-2 mt-1">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                      {errors.username.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-gray-700 font-medium flex items-center gap-2">
                    <Lock className="h-4 w-4 text-gray-400" />
                    {t('auth.password')}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder={t('auth.passwordPlaceholder')}
                    className="soya-input h-12"
                    {...register('password')}
                    disabled={isLoading}
                  />
                  {errors.password && (
                    <p className="text-sm text-red-600 flex items-center gap-2 mt-1">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full soya-button-primary h-12 text-base group"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="soya-spinner w-5 h-5 border-2"></div>
                      <span>{t('common.signingIn')}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <span>{t('common.signIn')}</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  )}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-4 text-xs text-gray-400 uppercase tracking-wider">
                    {t('auth.secureLogin')}
                  </span>
                </div>
              </div>

              {/* Brand Colors */}
              <div className="flex items-center justify-center gap-3">
                <div className="w-3 h-3 bg-green-600 rounded-full shadow-sm shadow-green-600/50"></div>
                <div className="w-3 h-3 bg-yellow-400 rounded-full shadow-sm shadow-yellow-400/50"></div>
                <div className="w-3 h-3 bg-gray-900 rounded-full"></div>
              </div>
              </>
              )}
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center mt-8">
            <p className="text-white/50 text-sm">
              {t('brand.copyright')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
