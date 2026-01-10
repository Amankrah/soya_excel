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
  Settings,
  LogOut,
  Menu,
  Navigation2,
  BarChart3,
  Radio,
  Leaf,
  ChevronRight,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';
import Image from 'next/image';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, description: 'Overview & KPIs' },
  { name: 'Clients', href: '/dashboard/clients', icon: Users, description: 'AI Predictions' },
  { name: 'Orders', href: '/dashboard/orders', icon: Package, description: 'Order Management' },
  { name: 'Routes', href: '/dashboard/routes', icon: Navigation2, description: 'Route Planning' },
  { name: 'Live Tracking', href: '/dashboard/live-tracking', icon: Radio, description: 'Real-time GPS' },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, description: 'Reports & Insights' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
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

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="flex flex-col h-full soya-gradient-sidebar">
      {/* Brand Header */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-xl p-2 shadow-lg shadow-yellow-500/20">
              <Image
                src="/LOGO-SoyaExcel.png"
                alt="SoyaFlow Logo"
                width={36}
                height={36}
                className="w-9 h-9 object-contain"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900 soya-status-online"></div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">SoyaFlow</h2>
            <p className="text-xs text-yellow-400/80 font-medium">Distribution Platform</p>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="mb-4">
          <p className="px-4 text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
            Main Menu
          </p>
        </div>
        {navigation.map((item, index) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => isMobile && setIsMobileMenuOpen(false)}
              className={`group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300 ${
                isActive
                  ? 'soya-nav-item-active'
                  : 'soya-nav-item'
              }`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className={`p-1.5 rounded-lg transition-colors duration-200 ${
                isActive 
                  ? 'bg-black/10' 
                  : 'bg-white/5 group-hover:bg-white/10'
              }`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block truncate">{item.name}</span>
                {!isMobile && (
                  <span className={`text-[10px] truncate block transition-opacity duration-200 ${
                    isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-50'
                  }`}>
                    {item.description}
                  </span>
                )}
              </div>
              {isActive && (
                <ChevronRight className="h-4 w-4 opacity-50" />
              )}
            </Link>
          );
        })}
      </nav>
      
      {/* Sidebar Footer */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-gray-400">System Online</span>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 py-2 px-3 rounded-lg bg-white/5">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-sm shadow-green-500/50"></div>
          <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full shadow-sm shadow-yellow-400/50"></div>
          <div className="w-2.5 h-2.5 bg-gray-900 rounded-full border border-gray-600"></div>
          <span className="text-xs text-gray-500 ml-2">SoyaFlow v2.1</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-white border-b border-gray-200 shadow-sm">
        <div className="flex h-16 items-center px-4 lg:px-6">
          {/* Mobile Menu */}
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden hover:bg-gray-100 mr-2">
                <Menu className="h-5 w-5 text-gray-600" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SidebarContent isMobile={true} />
            </SheetContent>
          </Sheet>

          <div className="flex flex-1 items-center justify-between">
            {/* Logo - visible on mobile */}
            <div className="flex items-center gap-3 lg:hidden">
              <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-lg p-1.5">
                <Leaf className="h-5 w-5 text-yellow-400" />
              </div>
              <span className="text-lg font-bold text-gray-900">SoyaFlow</span>
            </div>

            {/* Spacer for desktop */}
            <div className="hidden lg:block" />
            
            {/* Right side actions */}
            <div className="flex items-center gap-3">
              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="relative flex items-center gap-3 h-10 pl-2 pr-4 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <Avatar className="h-8 w-8 ring-2 ring-green-500/20">
                      <AvatarImage src="/avatar.png" alt={getFullName(user)} />
                      <AvatarFallback className="bg-gradient-to-br from-green-600 to-green-700 text-white font-semibold text-sm">
                        {getInitials(getFullName(user))}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:block text-left">
                      <p className="text-sm font-semibold text-gray-900">{getFullName(user)}</p>
                      <p className="text-xs text-gray-500">Manager</p>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 rounded-xl shadow-lg" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal p-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-gradient-to-br from-green-600 to-green-700 text-white font-semibold">
                          {getInitials(getFullName(user))}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold">{getFullName(user)}</p>
                        <p className="text-xs text-gray-500">{user?.email}</p>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="hover:bg-gray-100 rounded-lg mx-1 cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleLogout} 
                    className="hover:bg-red-50 text-red-600 rounded-lg mx-1 cursor-pointer"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar - Desktop */}
        <aside className="hidden lg:flex w-64 flex-col">
          <SidebarContent />
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-gray-50 to-gray-100">
          <div className="container mx-auto p-6 max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
