'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  Truck,
  Globe,
  BarChart3,
  Shield,
  Brain,
  Package,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-green-600 rounded-lg p-2">
                <Image
                  src="/LOGO-SoyaExcel.png"
                  alt="Soya Excel Logo"
                  width={32}
                  height={32}
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Soya Excel</h1>
                <p className="text-xs text-gray-500">Soybean Meal Distribution Platform</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button className="bg-green-600 hover:bg-green-700 text-white">
                  Access Platform
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-green-50 via-white to-yellow-50 py-20">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-green-200/30 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-yellow-200/30 rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 container mx-auto px-4 text-center">
          <div className="flex justify-center mb-8">
            <div className="bg-white rounded-3xl p-6 shadow-2xl">
              <Image
                src="/LOGO-SoyaExcel.png"
                alt="Soya Excel Logo"
                width={120}
                height={120}
                className="w-24 h-24 object-contain"
              />
            </div>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Soya Excel
            <span className="block text-4xl md:text-5xl text-green-600 mt-2">
              Distribution Management Platform
            </span>
          </h1>

          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8 leading-relaxed">
            Internal platform for managing soybean meal distribution operations across Canada, USA & Spain.
            AI-powered predictions, real-time tracking, and optimized route planning.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link href="/login">
              <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white text-lg px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200">
                Access Dashboard
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>

          {/* Brand Colors */}
          <div className="flex justify-center items-center gap-3">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
            <div className="w-3 h-3 bg-black rounded-full"></div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Platform Capabilities
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Comprehensive tools for managing your soybean meal distribution operations
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 - AI Predictions */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 p-8 rounded-2xl border border-green-200 hover:shadow-lg transition-all duration-300">
              <div className="w-16 h-16 bg-green-600 rounded-xl flex items-center justify-center mb-6">
                <Brain className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">AI Reorder Predictions</h3>
              <p className="text-gray-600 leading-relaxed">
                XGBoost ML model predicts client reorder dates with 95% accuracy using 62 features, replacing $110K sensor systems.
              </p>
            </div>

            {/* Feature 2 - Multi-Region */}
            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-8 rounded-2xl border border-yellow-200 hover:shadow-lg transition-all duration-300">
              <div className="w-16 h-16 bg-yellow-500 rounded-xl flex items-center justify-center mb-6">
                <Globe className="h-8 w-8 text-black" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Multi-Region Operations</h3>
              <p className="text-gray-600 leading-relaxed">
                Manage clients across Canada (QC, ON, NB, BC), USA, and Spain from a unified platform.
              </p>
            </div>

            {/* Feature 3 - Inventory */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-8 rounded-2xl border border-gray-200 hover:shadow-lg transition-all duration-300">
              <div className="w-16 h-16 bg-gray-700 rounded-xl flex items-center justify-center mb-6">
                <Package className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Inventory Management</h3>
              <p className="text-gray-600 leading-relaxed">
                Track soybean meal inventory by product type (Trituro 44%, Dairy Trituro, Oil) with quality grades and silo locations.
              </p>
            </div>

            {/* Feature 4 - Route Optimization */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 p-8 rounded-2xl border border-green-200 hover:shadow-lg transition-all duration-300">
              <div className="w-16 h-16 bg-green-600 rounded-xl flex items-center justify-center mb-6">
                <Truck className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Smart Route Planning</h3>
              <p className="text-gray-600 leading-relaxed">
                Google Maps integration for geocoding, route optimization, and live driver tracking with delivery updates.
              </p>
            </div>

            {/* Feature 5 - KPI Tracking */}
            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-8 rounded-2xl border border-yellow-200 hover:shadow-lg transition-all duration-300">
              <div className="w-16 h-16 bg-yellow-500 rounded-xl flex items-center justify-center mb-6">
                <TrendingUp className="h-8 w-8 text-black" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">KPI Dashboard</h3>
              <p className="text-gray-600 leading-relaxed">
                Monitor KM/TM efficiency by product type, forecast accuracy (90-95% target), and weekly distribution plans.
              </p>
            </div>

            {/* Feature 6 - Analytics */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-8 rounded-2xl border border-gray-200 hover:shadow-lg transition-all duration-300">
              <div className="w-16 h-16 bg-gray-700 rounded-xl flex items-center justify-center mb-6">
                <BarChart3 className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Analytics & Insights</h3>
              <p className="text-gray-600 leading-relaxed">
                Track monthly usage trends, delivery performance, client priority alerts, and prediction confidence intervals.
              </p>
            </div>
          </div>
        </div>
      </section>


      {/* Key Modules Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Core Modules
            </h2>
            <p className="text-xl text-gray-600">
              Everything you need in one integrated platform
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="bg-white p-6 rounded-xl border-2 border-gray-200 hover:border-green-500 transition-all">
              <h3 className="font-bold text-lg text-gray-900 mb-2">Client Management</h3>
              <p className="text-gray-600 text-sm">AI predictions, priority alerts, geocoding, monthly usage tracking</p>
            </div>

            <div className="bg-white p-6 rounded-xl border-2 border-gray-200 hover:border-green-500 transition-all">
              <h3 className="font-bold text-lg text-gray-900 mb-2">Order Processing</h3>
              <p className="text-gray-600 text-sm">Batch tracking, delivery status, expedition dates, quantity monitoring</p>
            </div>

            <div className="bg-white p-6 rounded-xl border-2 border-gray-200 hover:border-green-500 transition-all">
              <h3 className="font-bold text-lg text-gray-900 mb-2">Inventory Control</h3>
              <p className="text-gray-600 text-sm">Stock levels, quality grades, silo management, low-stock alerts</p>
            </div>

            <div className="bg-white p-6 rounded-xl border-2 border-gray-200 hover:border-green-500 transition-all">
              <h3 className="font-bold text-lg text-gray-900 mb-2">Route Planning</h3>
              <p className="text-gray-600 text-sm">Driver assignment, GPS tracking, delivery optimization, completion updates</p>
            </div>

            <div className="bg-white p-6 rounded-xl border-2 border-gray-200 hover:border-green-500 transition-all">
              <h3 className="font-bold text-lg text-gray-900 mb-2">Weekly Distribution</h3>
              <p className="text-gray-600 text-sm">Tuesday planning, Friday finalization, forecast accuracy tracking</p>
            </div>

            <div className="bg-white p-6 rounded-xl border-2 border-gray-200 hover:border-green-500 transition-all">
              <h3 className="font-bold text-lg text-gray-900 mb-2">Performance Metrics</h3>
              <p className="text-gray-600 text-sm">KM/TM by product, delivery rates, trend analysis, target monitoring</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto bg-gradient-to-br from-green-50 to-yellow-50 p-12 rounded-3xl border-2 border-green-200">
            <Shield className="h-16 w-16 text-green-600 mx-auto mb-6" />
            <h2 className="text-4xl font-bold text-gray-900 mb-6">
              Authorized Access Only
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              This platform is for internal use by Soya Excel team members.
              Log in with your credentials to access the management dashboard.
            </p>
            <Link href="/login">
              <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white text-lg px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200">
                Employee Login
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-green-600 rounded-lg p-2">
                  <Image
                    src="/LOGO-SoyaExcel.png"
                    alt="Soya Excel Logo"
                    width={32}
                    height={32}
                    className="w-8 h-8 object-contain"
                  />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Soya Excel</h3>
                  <p className="text-sm text-gray-400">Internal Platform</p>
                </div>
              </div>
              <p className="text-gray-400 text-sm">
                Soybean meal distribution management system for team operations across Canada, USA, and Spain.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Key Features</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>AI-Powered Reorder Predictions</li>
                <li>Real-time Order Tracking</li>
                <li>Route Optimization</li>
                <li>Inventory Management</li>
                <li>KPI Analytics Dashboard</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Products Managed</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>Trituro 44% (Soybean Meal)</li>
                <li>Dairy Trituro (Premium Grade)</li>
                <li>Soybean Oil Products</li>
              </ul>
              <div className="mt-6">
                <Link href="/login">
                  <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                    Access Platform
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-8 pt-8 text-center">
            <p className="text-gray-400 text-sm">
              © {new Date().getFullYear()} Soya Excel. Internal distribution management platform.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
