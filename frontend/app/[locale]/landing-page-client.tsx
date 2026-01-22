'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { SoyaFlowDistributionMap } from '@/components/ui/soyaflow-animation';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import {
  Globe,
  BarChart3,
  Shield,
  Brain,
  Package,
  ArrowRight,
  TrendingUp,
  MapPin,
  Users,
  Clock,
  Zap,
  ChevronRight,
  ExternalLink,
  Route,
} from 'lucide-react';

export default function LandingPageClient({ locale }: { locale: string }) {
  const t = useTranslations();

  const features = [
    {
      icon: Brain,
      title: t('landing.aiReorderPredictions'),
      description: t('landing.aiReorderDescription'),
      gradient: 'from-green-500/20 to-green-600/20',
      borderColor: 'border-green-500/30',
      iconBg: 'bg-green-500',
    },
    {
      icon: Globe,
      title: t('landing.multiRegionOperations'),
      description: t('landing.multiRegionDescription'),
      gradient: 'from-yellow-500/20 to-orange-500/20',
      borderColor: 'border-yellow-500/30',
      iconBg: 'bg-yellow-500',
    },
    {
      icon: Package,
      title: t('landing.inventoryManagement'),
      description: t('landing.inventoryDescription'),
      gradient: 'from-purple-500/20 to-pink-500/20',
      borderColor: 'border-purple-500/30',
      iconBg: 'bg-purple-500',
    },
    {
      icon: Route,
      title: t('landing.smartRoutePlanning'),
      description: t('landing.routeDescription'),
      gradient: 'from-blue-500/20 to-cyan-500/20',
      borderColor: 'border-blue-500/30',
      iconBg: 'bg-blue-500',
    },
    {
      icon: TrendingUp,
      title: t('landing.kpiDashboard'),
      description: t('landing.kpiDescription'),
      gradient: 'from-emerald-500/20 to-teal-500/20',
      borderColor: 'border-emerald-500/30',
      iconBg: 'bg-emerald-500',
    },
    {
      icon: BarChart3,
      title: t('landing.analyticsInsights'),
      description: t('landing.analyticsDescription'),
      gradient: 'from-rose-500/20 to-red-500/20',
      borderColor: 'border-rose-500/30',
      iconBg: 'bg-rose-500',
    },
  ];

  const modules = [
    { title: t('landing.clientManagement'), desc: t('landing.clientManagementDesc'), icon: Users },
    { title: t('landing.orderProcessing'), desc: t('landing.orderProcessingDesc'), icon: Package },
    { title: t('landing.inventoryControl'), desc: t('landing.inventoryControlDesc'), icon: BarChart3 },
    { title: t('landing.routePlanning'), desc: t('landing.routePlanningDesc'), icon: MapPin },
    { title: t('landing.weeklyDistribution'), desc: t('landing.weeklyDistributionDesc'), icon: Clock },
    { title: t('landing.performanceMetrics'), desc: t('landing.performanceMetricsDesc'), icon: TrendingUp },
  ];

  const values = [
    {
      icon: '🌱',
      title: t('landing.agriculturalDevelopment'),
      subtitle: t('landing.agriculturalSubtitle'),
      description: t('landing.agriculturalDescription'),
      gradient: 'from-green-500 to-emerald-600',
      stat: '100%',
      statLabel: t('landing.localFocus'),
    },
    {
      icon: '♻️',
      title: t('landing.sustainability'),
      subtitle: t('landing.sustainabilitySubtitle'),
      description: t('landing.sustainabilityDescription'),
      gradient: 'from-teal-500 to-cyan-600',
      stat: '99.8%',
      statLabel: t('landing.processingRate'),
    },
    {
      icon: '⚡',
      title: t('landing.energyEfficiency'),
      subtitle: t('landing.energySubtitle'),
      description: t('landing.energyDescription'),
      gradient: 'from-yellow-500 to-orange-500',
      stat: '0.2%',
      statLabel: t('landing.productLoss'),
    },
    {
      icon: '🤝',
      title: t('landing.socialResponsibility'),
      subtitle: t('landing.socialSubtitle'),
      description: t('landing.socialDescription'),
      gradient: 'from-blue-500 to-indigo-600',
      stat: '10+',
      statLabel: t('landing.causesSupported'),
    },
    {
      icon: '💪',
      title: t('landing.respectTeamwork'),
      subtitle: t('landing.respectSubtitle'),
      description: t('landing.respectDescription'),
      gradient: 'from-purple-500 to-pink-500',
      stat: '100%',
      statLabel: t('landing.teamCommitment'),
    },
    {
      icon: '🏭',
      title: t('landing.localProcessing'),
      subtitle: t('landing.localProcessingSubtitle'),
      description: t('landing.localProcessingDescription'),
      gradient: 'from-rose-500 to-red-500',
      stat: 'QC',
      statLabel: t('landing.proudlyLocal'),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black text-white overflow-x-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-green-900/30 via-transparent to-transparent"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-yellow-900/20 via-transparent to-transparent"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-[128px] animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-yellow-500/10 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-green-500/5 to-yellow-500/5 rounded-full blur-3xl"></div>
      </div>

      {/* Header */}
      <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-slate-900/80 backdrop-blur-xl">
        <div className="container mx-auto px-6">
          <div className="flex h-20 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white rounded-xl p-2 shadow-sm">
                <Image
                  src="/LOGO-SoyaExcel.png"
                  alt="SoyaFlow Logo"
                  width={120}
                  height={50}
                  className="h-10 w-auto object-contain"
                />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                  {t('brand.name')}
                </h1>
                <p className="text-[10px] text-gray-500 font-medium tracking-wide">{t('brand.tagline')}</p>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors">{t('landing.navFeatures')}</a>
              <a href="#modules" className="text-sm text-gray-400 hover:text-white transition-colors">{t('landing.navModules')}</a>
              <a href="#values" className="text-sm text-gray-400 hover:text-white transition-colors">{t('landing.navValues')}</a>
              <a href="#about" className="text-sm text-gray-400 hover:text-white transition-colors">{t('landing.navAbout')}</a>
            </nav>

            <div className="flex items-center gap-4">
              <LanguageSwitcher />
              <Link href={`/${locale}/login`}>
                <Button className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-green-500/25 transition-all duration-300 hover:shadow-green-500/40 hover:scale-105">
                  {t('landing.accessPlatform')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section - Fully Responsive */}
      <section className="relative min-h-screen flex items-center pt-24 sm:pt-28 md:pt-32 pb-16 sm:pb-20 overflow-hidden">
        {/* Animation Background - Full coverage */}
        <div className="absolute inset-0 z-0">
          <SoyaFlowDistributionMap />
          {/* Responsive gradient overlay - less coverage on larger screens */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/95 via-slate-900/70 to-slate-900/20 md:from-slate-900/90 md:via-slate-900/50 md:to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-slate-900/40"></div>
          {/* Mobile: stronger overlay for readability */}
          <div className="absolute inset-0 bg-slate-900/30 md:bg-transparent"></div>
        </div>

        <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-12">
          <div className="max-w-xl md:max-w-2xl lg:max-w-3xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 sm:px-5 py-2 sm:py-2.5 backdrop-blur-md hover:bg-white/15 transition-colors mb-6 sm:mb-8">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs sm:text-sm font-medium text-gray-200">{t('landing.badge')}</span>
            </div>

            {/* Title - Responsive sizing */}
            <div className="mb-6 sm:mb-8">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-black mb-3 sm:mb-4 tracking-tight leading-[0.9]">
                <span className="bg-gradient-to-r from-white via-green-400 to-yellow-400 bg-clip-text text-transparent drop-shadow-2xl">
                  {t('landing.title')}
                </span>
              </h1>
              <div className="w-16 sm:w-20 lg:w-24 h-1 sm:h-1.5 bg-gradient-to-r from-green-500 to-yellow-400 rounded-full"></div>
            </div>

            {/* Subtitle - Responsive text */}
            <div className="space-y-3 sm:space-y-4 mb-8 sm:mb-10">
              <p className="text-xl sm:text-2xl lg:text-3xl text-white font-light drop-shadow-lg">
                {t('landing.subtitle')}
              </p>
              <p className="text-base sm:text-lg text-gray-300 leading-relaxed max-w-lg lg:max-w-xl drop-shadow-md">
                {t('landing.description')}{' '}
                <span className="text-green-400 font-semibold">{t('landing.canada')}</span>,{' '}
                <span className="text-yellow-400 font-semibold">{t('landing.usa')}</span> &{' '}
                <span className="text-white font-semibold">{t('landing.spain')}</span>
              </p>
            </div>

            {/* CTA Buttons - Responsive layout */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Link href={`/${locale}/login`} className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white text-base sm:text-lg px-6 sm:px-10 py-5 sm:py-6 rounded-xl sm:rounded-2xl shadow-2xl shadow-green-500/40 transition-all duration-300 hover:shadow-green-500/60 hover:scale-105 font-bold">
                  {t('landing.launchDashboard')}
                  <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </Link>
              <a href="#features" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto border-white/30 bg-white/10 hover:bg-white/20 text-white text-base sm:text-lg px-6 sm:px-10 py-5 sm:py-6 rounded-xl sm:rounded-2xl backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-white/50">
                  {t('landing.exploreFeatures')}
                  <ChevronRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </a>
            </div>
          </div>
        </div>

        {/* Scroll Indicator - Hidden on very small screens */}
        <div className="hidden sm:block absolute bottom-8 sm:bottom-12 left-1/2 -translate-x-1/2 animate-bounce z-10">
          <div className="w-6 h-10 sm:w-7 sm:h-11 border-2 border-white/30 rounded-full flex justify-center pt-2 backdrop-blur-sm">
            <div className="w-1 h-2.5 sm:w-1.5 sm:h-3 bg-green-500 rounded-full animate-pulse"></div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative py-32">
        <div className="container mx-auto px-6">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-2 mb-6">
              <Zap className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400 font-medium">{t('landing.platformCapabilities')}</span>
            </div>
            <h2 className="text-5xl md:text-6xl font-bold mb-6">
              <span className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {t('landing.featuresTitle')}
              </span>
            </h2>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto">
              {t('landing.featuresSubtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className={`group relative bg-gradient-to-br ${feature.gradient} border ${feature.borderColor} rounded-3xl p-8 backdrop-blur-sm hover:scale-[1.02] transition-all duration-300`}
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className={`w-14 h-14 ${feature.iconBg} rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform`}>
                  <feature.icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules Section */}
      <section id="modules" className="relative py-32 bg-gradient-to-b from-transparent via-green-950/20 to-transparent">
        <div className="container mx-auto px-6">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-4 py-2 mb-6">
              <Package className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-yellow-400 font-medium">{t('landing.coreModules')}</span>
            </div>
            <h2 className="text-5xl md:text-6xl font-bold mb-6">
              <span className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {t('landing.modulesTitle')}
              </span>
            </h2>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto">
              {t('landing.modulesSubtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {modules.map((module, idx) => (
              <div
                key={idx}
                className="group bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-green-500/30 transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-green-500/10 rounded-xl group-hover:bg-green-500/20 transition-colors">
                    <module.icon className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white mb-1 group-hover:text-green-400 transition-colors">{module.title}</h3>
                    <p className="text-sm text-gray-500">{module.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Core Values Section */}
      <section id="values" className="relative py-32">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-2 mb-6">
              <span className="text-lg">🌱</span>
              <span className="text-sm text-green-400 font-medium">{t('landing.ourValues')}</span>
            </div>
            <h2 className="text-5xl md:text-6xl font-bold mb-6">
              <span className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {t('landing.valuesTitle')}
              </span>
            </h2>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto">
              {t('landing.valuesSubtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {values.map((value, idx) => (
              <div
                key={idx}
                className="group relative bg-white/5 border border-white/10 rounded-3xl p-6 hover:bg-white/10 hover:border-white/20 transition-all duration-300 overflow-hidden"
              >
                {/* Gradient overlay on hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${value.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}></div>
                
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-4xl">{value.icon}</span>
                    <div className="text-right">
                      <p className={`text-2xl font-bold bg-gradient-to-r ${value.gradient} bg-clip-text text-transparent`}>
                        {value.stat}
                      </p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{value.statLabel}</p>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1 group-hover:text-green-400 transition-colors">
                    {value.title}
                  </h3>
                  <p className="text-sm text-yellow-400 font-medium mb-3">{value.subtitle}</p>
                  <p className="text-sm text-gray-400 leading-relaxed">{value.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Link to full values page */}
          <div className="text-center mt-12">
            <a
              href="https://soyaexcel.com/en/values/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-green-400 transition-colors group"
            >
              <span>{t('landing.learnMoreValues')}</span>
              <ExternalLink className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-32 bg-gradient-to-b from-transparent via-green-950/10 to-transparent">
        <div className="container mx-auto px-6">
          <div className="relative max-w-4xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-yellow-500/20 rounded-[3rem] blur-3xl"></div>
            <div className="relative bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] border border-white/10 rounded-[3rem] p-12 md:p-16 text-center">
              <Shield className="h-16 w-16 text-green-500 mx-auto mb-8" />
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                <span className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                  {t('landing.authorizedAccess')}
                </span>
              </h2>
              <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
                {t('landing.authorizedDescription')}
              </p>
              <Link href={`/${locale}/login`}>
                <Button size="lg" className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white text-lg px-12 py-6 rounded-2xl shadow-2xl shadow-green-500/30 transition-all duration-300 hover:shadow-green-500/50 hover:scale-105 font-semibold">
                  {t('landing.employeeLogin')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* About / Credits Section */}
      <section id="about" className="relative py-32 border-t border-white/10">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">
              <span className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {t('landing.developedExcellence')}
              </span>
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              {t('landing.developedDescription')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* SASEL Lab */}
            <a
              href="https://sasellab.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="group bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/10 hover:border-green-500/30 transition-all duration-300 text-center"
            >
              <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/20 group-hover:scale-110 transition-transform overflow-hidden p-2">
                <Image
                  src="/sasel_at_mcgill.webp"
                  alt="SASEL Lab at McGill University"
                  width={80}
                  height={80}
                  className="w-full h-full object-contain"
                />
              </div>
              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-green-400 transition-colors">
                {t('landing.saselLab')}
              </h3>
              <p className="text-sm text-green-400 mb-3">{t('landing.mcgillUniversity')}</p>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">
                {t('landing.saselDescription')}
              </p>
              <div className="inline-flex items-center text-xs text-gray-400 group-hover:text-green-400 transition-colors">
                {t('landing.visitLab')} <ExternalLink className="ml-1 w-3 h-3" />
              </div>
            </a>

            {/* Emmanuel Amankrah Kwofie */}
            <a
              href="https://www.eakwofie.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="group bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/10 hover:border-yellow-500/30 transition-all duration-300 text-center"
            >
              <div className="w-20 h-20 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-yellow-500/20 group-hover:scale-110 transition-transform">
                <span className="text-2xl font-bold text-white">EAK</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-yellow-400 transition-colors">
                {t('landing.emmanuelKwofie')}
              </h3>
              <p className="text-sm text-yellow-400 mb-3">{t('landing.softwareEngineer')}</p>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">
                {t('landing.emmanuelDescription')}
              </p>
              <div className="inline-flex items-center text-xs text-gray-400 group-hover:text-yellow-400 transition-colors">
                {t('landing.portfolio')} <ExternalLink className="ml-1 w-3 h-3" />
              </div>
            </a>

            {/* RITA Consortium */}
            <a
              href="https://ca.linkedin.com/company/consortium-rita"
              target="_blank"
              rel="noopener noreferrer"
              className="group bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/10 hover:border-blue-500/30 transition-all duration-300 text-center"
            >
              <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform overflow-hidden p-2">
                <Image
                  src="/consortium_rita_logo.jpg"
                  alt="Consortium RITA"
                  width={80}
                  height={80}
                  className="w-full h-full object-contain"
                />
              </div>
              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
                {t('landing.ritaConsortium')}
              </h3>
              <p className="text-sm text-blue-400 mb-3">{t('landing.researchPartnership')}</p>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">
                {t('landing.ritaDescription')}
              </p>
              <div className="inline-flex items-center text-xs text-gray-400 group-hover:text-blue-400 transition-colors">
                {t('landing.learnMore')} <ExternalLink className="ml-1 w-3 h-3" />
              </div>
            </a>
          </div>

          {/* Funding acknowledgment */}
          <div className="mt-16 text-center">
            <p className="text-sm text-gray-600">
              {t('landing.mapaqSupport')}
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/10 bg-slate-950/80">
        <div className="container mx-auto px-6 py-16">
          <div className="grid md:grid-cols-4 gap-12">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-white rounded-xl p-3 shadow-sm">
                  <Image
                    src="/LOGO-SoyaExcel.png"
                    alt="SoyaFlow Logo"
                    width={140}
                    height={60}
                    className="h-12 w-auto object-contain"
                  />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{t('brand.name')}</h3>
                  <p className="text-xs text-gray-500">{t('brand.tagline')}</p>
                </div>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed max-w-md">
                {t('landing.footerDescription')}
              </p>
            </div>

            {/* Features */}
            <div>
              <h4 className="font-semibold text-white mb-4">{t('landing.keyFeatures')}</h4>
              <ul className="space-y-3 text-sm text-gray-500">
                <li>{t('landing.aiReorderPredictionsFeature')}</li>
                <li>{t('landing.realTimeTracking')}</li>
                <li>{t('landing.routeOptimizationFeature')}</li>
                <li>{t('landing.geographicClustering')}</li>
                <li>{t('landing.kpiAnalytics')}</li>
              </ul>
            </div>

            {/* Links */}
            <div>
              <h4 className="font-semibold text-white mb-4">{t('landing.quickLinks')}</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <Link href={`/${locale}/login`} className="text-gray-500 hover:text-green-400 transition-colors">
                    {t('landing.employeeLogin')}
                  </Link>
                </li>
                <li>
                  <a href="https://sasellab.com/" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-green-400 transition-colors inline-flex items-center gap-1">
                    {t('landing.saselLab')} <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
                <li>
                  <a href="https://www.eakwofie.com/" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-yellow-400 transition-colors inline-flex items-center gap-1">
                    {t('landing.portfolio')} <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
                <li>
                  <a href="https://ca.linkedin.com/company/consortium-rita" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-blue-400 transition-colors inline-flex items-center gap-1">
                    {t('landing.ritaConsortium')} <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Footer */}
          <div className="border-t border-white/10 mt-12 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-sm text-gray-600">
                {t('landing.footerCopyright', { year: new Date().getFullYear() })}
              </p>
              <div className="flex items-center gap-6 text-xs text-gray-600">
                <span>{t('landing.developedBy')} <a href="https://sasellab.com/" target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-400">{t('landing.saselLab')}</a> {t('landing.mcgillUniversity')}</span>
                <span className="hidden md:inline">•</span>
                <span>{t('landing.engineeredBy')} <a href="https://www.eakwofie.com/" target="_blank" rel="noopener noreferrer" className="text-yellow-500 hover:text-yellow-400">{t('landing.emmanuelKwofie')}</a></span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}