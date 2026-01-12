'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

type User = {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  mfa_enabled?: boolean;
};

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard,
  Users,
  Package,
  LogOut,
  Menu,
  Navigation2,
  BarChart3,
  Radio,
  ChevronRight,
  ExternalLink,
  Lock,
  Shield,
  ShieldOff,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { MFASetupModal } from '@/components/auth/mfa-setup-modal';
import { MFADisableModal } from '@/components/auth/mfa-disable-modal';
import { PasswordChangeModal } from '@/components/auth/password-change-modal';

// Soya Excel Core Values from https://soyaexcel.com/en/values/
const coreValues = [
  {
    title: 'Agricultural Development',
    subtitle: 'Rooted in Québec',
    description: 'Supporting local agriculture and the soybean value chain',
    icon: '🌱',
    color: 'from-green-500 to-emerald-600',
  },
  {
    title: 'Sustainability',
    subtitle: '99.8% Efficiency',
    description: 'Minimal waste, maximum value from every harvest',
    icon: '♻️',
    color: 'from-teal-500 to-cyan-600',
  },
  {
    title: 'Social Responsibility',
    subtitle: 'Community First',
    description: 'Supporting causes that matter to our team and families',
    icon: '🤝',
    color: 'from-blue-500 to-indigo-600',
  },
  {
    title: 'Respect & Teamwork',
    subtitle: 'People Built This',
    description: 'Rewarding dedication and commitment to excellence',
    icon: '💪',
    color: 'from-yellow-500 to-orange-500',
  },
  {
    title: 'Local Processing',
    subtitle: 'Made in Québec',
    description: 'From our lands, with our people — valuing means processing',
    icon: '🏭',
    color: 'from-purple-500 to-pink-500',
  },
];

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, description: 'Overview & KPIs', color: 'from-green-500 to-emerald-600' },
  { name: 'Clients', href: '/dashboard/clients', icon: Users, description: 'AI Predictions', color: 'from-blue-500 to-indigo-600' },
  { name: 'Orders', href: '/dashboard/orders', icon: Package, description: 'Order Management', color: 'from-yellow-500 to-orange-500' },
  { name: 'Routes', href: '/dashboard/routes', icon: Navigation2, description: 'Route Planning', color: 'from-purple-500 to-pink-500' },
  { name: 'Live Tracking', href: '/dashboard/live-tracking', icon: Radio, description: 'Real-time GPS', color: 'from-red-500 to-rose-600' },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, description: 'Reports & Insights', color: 'from-cyan-500 to-teal-600' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentValueIndex, setCurrentValueIndex] = useState(0);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showMFASetupModal, setShowMFASetupModal] = useState(false);
  const [showMFADisableModal, setShowMFADisableModal] = useState(false);
  const { user, logout, checkAuth } = useAuthStore();

  // Cycle through core values every 5 seconds
  useEffect(() => {
    const valueTimer = setInterval(() => {
      setCurrentValueIndex((prev) => (prev + 1) % coreValues.length);
    }, 5000);
    return () => clearInterval(valueTimer);
  }, []);


  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleSecuritySuccess = async () => {
    // Refresh user data to get updated MFA status
    await checkAuth();
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getFullName = (user: User | null): string => {
    if (!user) return 'Manager';
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    if (user.first_name) return user.first_name;
    if (user.last_name) return user.last_name;
    return user.username || 'Manager';
  };

  const getCurrentPageName = () => {
    const currentNav = navigation.find(item => item.href === pathname);
    return currentNav?.name || 'Dashboard';
  };

  const getCurrentPageDescription = () => {
    const currentNav = navigation.find(item => item.href === pathname);
    return currentNav?.description || 'Overview & KPIs';
  };

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#0f1419] via-[#0a0f14] to-[#050a0f]">
      {/* Brand Header */}
      <div className="p-5 border-b border-white/5">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/30 to-yellow-500/30 rounded-xl blur-md group-hover:blur-lg transition-all"></div>
            <div className="relative bg-white rounded-xl p-1.5 shadow-xl">
              <Image
                src="/LOGO-SoyaExcel.png"
                alt="SoyaFlow Logo"
                width={40}
                height={40}
                className="w-10 h-10 object-contain"
              />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0f1419] animate-pulse"></div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight group-hover:text-green-400 transition-colors">SoyaFlow</h2>
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Distribution Platform</p>
          </div>
        </Link>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 px-3 py-6 overflow-y-auto">
        <div className="mb-6">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600 mb-3">
            Navigation
          </p>
        </div>
        <div className="space-y-1">
          {navigation.map((item, index) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => isMobile && setIsMobileMenuOpen(false)}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 ${
                  isActive
                    ? 'bg-gradient-to-r from-green-500/20 to-green-600/10 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-green-400 to-green-600 rounded-r-full shadow-lg shadow-green-500/50"></div>
                )}
                
                <div className={`p-2 rounded-lg transition-all duration-300 ${
                  isActive 
                    ? `bg-gradient-to-br ${item.color} shadow-lg` 
                    : 'bg-white/5 group-hover:bg-white/10'
                }`}>
                  <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block truncate font-medium">{item.name}</span>
                  {!isMobile && (
                    <span className={`text-[10px] truncate block transition-all duration-300 ${
                      isActive ? 'text-green-400/70' : 'text-transparent group-hover:text-gray-500'
                    }`}>
                      {item.description}
                    </span>
                  )}
                </div>
                {isActive && (
                  <ChevronRight className="h-4 w-4 text-green-400" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
      
      {/* Core Values Carousel */}
      <div className="px-4 py-3 border-t border-white/5">
        <p className="px-1 text-[9px] font-bold uppercase tracking-[0.15em] text-gray-600 mb-2">
          Our Values
        </p>
        <div 
          className={`relative overflow-hidden rounded-xl bg-gradient-to-r ${coreValues[currentValueIndex].color} p-[1px]`}
        >
          <div className="bg-[#0a0f14] rounded-xl p-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{coreValues[currentValueIndex].icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {coreValues[currentValueIndex].title}
                </p>
                <p className="text-[10px] text-yellow-400 font-medium">
                  {coreValues[currentValueIndex].subtitle}
                </p>
                <p className="text-[9px] text-gray-500 mt-1 line-clamp-2">
                  {coreValues[currentValueIndex].description}
                </p>
              </div>
            </div>
            {/* Progress dots */}
            <div className="flex justify-center gap-1.5 mt-3">
              {coreValues.map((value, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentValueIndex(idx)}
                  title={`View ${value.title}`}
                  aria-label={`Navigate to core value: ${value.title}`}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentValueIndex 
                      ? 'bg-white w-4' 
                      : 'bg-white/30 hover:bg-white/50'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
        {/* Link to values page */}
        <a
          href="https://soyaexcel.com/en/values/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 mt-2 text-[9px] text-gray-500 hover:text-green-400 transition-colors"
        >
          Learn more about our values <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
      
      {/* Sidebar Footer */}
      <div className="p-4 border-t border-white/5">
        <div className="flex items-center justify-between px-2 py-2 rounded-lg bg-white/5">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
            </div>
            <span className="text-[10px] text-gray-500 font-medium">System Online</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
            <div className="w-2 h-2 bg-gray-800 rounded-full border border-gray-600"></div>
          </div>
        </div>
        <p className="text-center text-[9px] text-gray-600 mt-2 font-medium">SoyaFlow v2.1 • Soya Excel</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-xl border-b border-gray-200/50">
        <div className="flex h-16 items-center px-4 lg:px-6">
          {/* Mobile Menu */}
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden hover:bg-gray-100 mr-2 rounded-xl">
                <Menu className="h-5 w-5 text-gray-600" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 border-0">
              <SidebarContent isMobile={true} />
            </SheetContent>
          </Sheet>

          <div className="flex flex-1 items-center justify-between">
            {/* Logo - visible on mobile */}
            <div className="flex items-center gap-3 lg:hidden">
              <Image
                src="/LOGO-SoyaExcel.png"
                alt="SoyaFlow Logo"
                width={32}
                height={32}
                className="w-8 h-8 object-contain"
              />
              <span className="text-lg font-bold text-gray-900">SoyaFlow</span>
            </div>

            {/* Page Title - Desktop */}
            <div className="hidden lg:flex items-center gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{getCurrentPageName()}</h1>
                <p className="text-xs text-gray-500">{getCurrentPageDescription()}</p>
              </div>
            </div>
            
            {/* Right side actions */}
            <div className="flex items-center gap-2">
              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="relative flex items-center gap-3 h-10 pl-2 pr-3 rounded-xl hover:bg-gray-100 transition-all duration-200"
                  >
                    <div className="relative">
                      <Avatar className="h-8 w-8 ring-2 ring-green-500/30 ring-offset-2 ring-offset-white">
                        <AvatarImage src="/avatar.png" alt={getFullName(user)} />
                        <AvatarFallback className="bg-gradient-to-br from-green-600 to-green-700 text-white font-bold text-sm">
                          {getInitials(getFullName(user))}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                    </div>
                    <div className="hidden lg:block text-left">
                      <p className="text-sm font-semibold text-gray-900">{getFullName(user)}</p>
                      <p className="text-[10px] text-gray-500 font-medium">Manager</p>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64 rounded-2xl shadow-xl border-gray-200 p-2" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal p-3 rounded-xl bg-gradient-to-br from-green-50 to-yellow-50">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12 ring-2 ring-green-500/20">
                        <AvatarFallback className="bg-gradient-to-br from-green-600 to-green-700 text-white font-bold text-lg">
                          {getInitials(getFullName(user))}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{getFullName(user)}</p>
                        <p className="text-xs text-gray-500">{user?.email}</p>
                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded-full">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                          Active
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="my-2" />

                  {/* Security Settings */}
                  <div className="px-2 py-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Security</p>
                  </div>

                  <DropdownMenuItem
                    onClick={() => setShowPasswordModal(true)}
                    className="hover:bg-blue-50 rounded-xl p-3 cursor-pointer"
                  >
                    <Lock className="mr-3 h-4 w-4 text-blue-600" />
                    <span className="font-medium">Change Password</span>
                  </DropdownMenuItem>

                  {user?.mfa_enabled ? (
                    <DropdownMenuItem
                      onClick={() => setShowMFADisableModal(true)}
                      className="hover:bg-red-50 rounded-xl p-3 cursor-pointer"
                    >
                      <ShieldOff className="mr-3 h-4 w-4 text-red-600" />
                      <div className="flex items-center justify-between flex-1">
                        <span className="font-medium">Disable MFA</span>
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                          Active
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => setShowMFASetupModal(true)}
                      className="hover:bg-green-50 rounded-xl p-3 cursor-pointer"
                    >
                      <Shield className="mr-3 h-4 w-4 text-green-600" />
                      <span className="font-medium">Enable MFA</span>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator className="my-2" />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="hover:bg-red-50 text-red-600 rounded-xl p-3 cursor-pointer"
                  >
                    <LogOut className="mr-3 h-4 w-4" />
                    <span className="font-medium">Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar - Desktop */}
        <aside className="hidden lg:flex w-64 flex-col border-r border-gray-200/50">
          <SidebarContent />
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="min-h-full bg-gradient-to-br from-gray-50 via-white to-gray-50">
            <div className="container mx-auto p-6 max-w-7xl">
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* Security Modals */}
      {showPasswordModal && (
        <PasswordChangeModal
          onClose={() => setShowPasswordModal(false)}
          onSuccess={handleSecuritySuccess}
        />
      )}

      {showMFASetupModal && (
        <MFASetupModal
          onClose={() => setShowMFASetupModal(false)}
          onSuccess={handleSecuritySuccess}
        />
      )}

      {showMFADisableModal && (
        <MFADisableModal
          onClose={() => setShowMFADisableModal(false)}
          onSuccess={handleSecuritySuccess}
        />
      )}
    </div>
  );
}
