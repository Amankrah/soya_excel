'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { 
  Truck, 
  Globe, 
  BarChart3, 
  Shield, 
  Zap, 
  Package,
  ArrowRight,
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
                <p className="text-xs text-gray-500">Feed Distribution Management System</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button variant="outline" className="border-green-600 text-green-600 hover:bg-green-600 hover:text-white">
                  Login
                </Button>
              </Link>
              <Link href="/login">
                <Button className="bg-green-600 hover:bg-green-700 text-white">
                  Get Started
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
              Feed Distribution Management System
            </span>
          </h1>
          
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8 leading-relaxed">
            Sustainable soybean meal distribution management across Canada, USA & Spain. 
            Streamline operations, monitor inventory, and optimize delivery routes.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link href="/login">
              <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white text-lg px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200">
                Start Managing
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="#features">
              <Button variant="outline" size="lg" className="border-2 border-gray-300 text-gray-700 hover:bg-gray-50 text-lg px-8 py-4 rounded-xl">
                Learn More
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
              Comprehensive Management Solutions
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Everything you need to manage your soybean meal distribution business efficiently
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 p-8 rounded-2xl border border-green-200 hover:shadow-lg transition-all duration-300">
              <div className="w-16 h-16 bg-green-600 rounded-xl flex items-center justify-center mb-6">
                <Globe className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Multi-Region Management</h3>
              <p className="text-gray-600 leading-relaxed">
                Manage operations across Canada, USA, and Spain from a single unified platform.
              </p>
            </div>
            
            {/* Feature 2 */}
            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-8 rounded-2xl border border-yellow-200 hover:shadow-lg transition-all duration-300">
              <div className="w-16 h-16 bg-yellow-500 rounded-xl flex items-center justify-center mb-6">
                <Package className="h-8 w-8 text-black" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Inventory Tracking</h3>
              <p className="text-gray-600 leading-relaxed">
                Real-time monitoring of soybean meal inventory levels with automated alerts.
              </p>
            </div>
            
            {/* Feature 3 */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-8 rounded-2xl border border-gray-200 hover:shadow-lg transition-all duration-300">
              <div className="w-16 h-16 bg-gray-700 rounded-xl flex items-center justify-center mb-6">
                <Truck className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Route Optimization</h3>
              <p className="text-gray-600 leading-relaxed">
                Optimize delivery routes and manage driver assignments efficiently.
              </p>
            </div>
            
            {/* Feature 4 */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 p-8 rounded-2xl border border-green-200 hover:shadow-lg transition-all duration-300">
              <div className="w-16 h-16 bg-green-600 rounded-xl flex items-center justify-center mb-6">
                <Zap className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Real-time Monitoring</h3>
              <p className="text-gray-600 leading-relaxed">
                Live updates from BinConnect sensors for instant silo level monitoring.
              </p>
            </div>
            
            {/* Feature 5 */}
            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-8 rounded-2xl border border-yellow-200 hover:shadow-lg transition-all duration-300">
              <div className="w-16 h-16 bg-yellow-500 rounded-xl flex items-center justify-center mb-6">
                <BarChart3 className="h-8 w-8 text-black" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">KPI Dashboard</h3>
              <p className="text-gray-600 leading-relaxed">
                Track key performance indicators and optimize operational efficiency.
              </p>
            </div>
            
            {/* Feature 6 */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-8 rounded-2xl border border-gray-200 hover:shadow-lg transition-all duration-300">
              <div className="w-16 h-16 bg-gray-700 rounded-xl flex items-center justify-center mb-6">
                <Shield className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Secure Access</h3>
              <p className="text-gray-600 leading-relaxed">
                Role-based access control with secure authentication and data protection.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-gradient-to-r from-green-600 to-green-700">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-white mb-2">6</div>
              <div className="text-green-100">Regions Served</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white mb-2">24/7</div>
              <div className="text-green-100">Monitoring</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white mb-2">100%</div>
              <div className="text-green-100">Secure</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white mb-2">Real-time</div>
              <div className="text-green-100">Updates</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">
            Ready to Transform Your Operations?
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Join Soya Excel in revolutionizing soybean meal distribution management. 
            Get started today and experience the difference.
          </p>
          <Link href="/login">
            <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white text-lg px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200">
              Get Started Now
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
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
                  <p className="text-sm text-gray-400">Management System</p>
                </div>
              </div>
              <p className="text-gray-400 text-sm">
                Professional soybean meal distribution management across multiple regions.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Features</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>Inventory Management</li>
                <li>Route Optimization</li>
                <li>Real-time Monitoring</li>
                <li>KPI Dashboard</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Regions</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>🇨🇦 Canada (QC, ON, NB, BC)</li>
                <li>🇺🇸 United States</li>
                <li>🇪🇸 Spain</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <p className="text-gray-400 text-sm mb-4">
                Ready to get started? Login to your account or contact our team.
              </p>
              <Link href="/login">
                <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                  Login Now
                </Button>
              </Link>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center">
            <p className="text-gray-400 text-sm">
              © 2024 Soya Excel. All rights reserved. Professional feed distribution management.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
