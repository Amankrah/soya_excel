'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

// Import User type from store
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
  Bell,
  Navigation2,
  BarChart3,
  Radio,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';
import Image from 'next/image';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Clients', href: '/dashboard/clients', icon: Users },
  { name: 'Orders', href: '/dashboard/orders', icon: Package },
  { name: 'Routes', href: '/dashboard/routes', icon: Navigation2 },
  { name: 'Live Tracking', href: '/dashboard/live-tracking', icon: Radio },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white shadow-sm">
        <div className="flex h-16 items-center px-4">
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden hover:bg-gray-100">
                <Menu className="h-5 w-5 text-gray-600" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-white">
              <div className="flex flex-col h-full">
                <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-green-600 to-green-700">
                  <div className="flex items-center gap-3">
                    <div className="bg-white rounded-lg p-2">
                      <Image
                        src="/LOGO-SoyaExcel.png"
                        alt="Soya Excel Logo"
                        width={32}
                        height={32}
                        className="w-8 h-8 object-contain"
                      />
                    </div>
                    <h2 className="text-lg font-bold text-white">Soya Excel</h2>
                  </div>
                </div>
                <nav className="flex-1 p-4">
                  {navigation.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          pathname === item.href
                            ? 'bg-green-100 text-green-700 border-l-4 border-green-600'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {item.name}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex flex-1 items-center justify-between">
            {/* Logo and Title */}
            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center gap-3">
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
                  <p className="text-xs text-gray-500">Distribution Platform</p>
                </div>
              </div>
              <h1 className="text-xl font-semibold text-gray-900 lg:hidden">Soya Excel</h1>
            </div>
            
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="relative hover:bg-gray-100">
                <Bell className="h-5 w-5 text-gray-600" />
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center">
                  3
                </span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full hover:bg-gray-100">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src="/avatar.png" alt={getFullName(user)} />
                      <AvatarFallback className="bg-green-600 text-white font-semibold">
                        {getInitials(getFullName(user))}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{getFullName(user)}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="hover:bg-gray-100">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="hover:bg-red-50 text-red-600">
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
        {/* Sidebar - hidden on mobile */}
        <aside className="hidden lg:flex w-64 flex-col border-r border-gray-200 bg-white shadow-sm">
          <div className="p-4 border-b border-gray-200 bg-gradient-to-b from-green-600 to-green-700">
            <div className="flex items-center gap-3">
              <div className="bg-white rounded-lg p-2">
                <Image
                  src="/LOGO-SoyaExcel.png"
                  alt="Soya Excel Logo"
                  width={32}
                  height={32}
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Soya Excel</h2>
                <p className="text-xs text-green-100">Distribution Platform</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 p-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                    pathname === item.href
                      ? 'bg-green-100 text-green-700 border-l-4 border-green-600 shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 hover:border-l-4 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          
          {/* Sidebar Footer */}
          <div className="p-4 border-t border-gray-200">
            <div className="text-center">
              <div className="flex justify-center items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <p className="text-xs text-gray-500">Soya Excel v2.0</p>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="container mx-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
} 