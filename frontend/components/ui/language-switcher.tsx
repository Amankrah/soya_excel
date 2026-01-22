'use client';

import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { locales, localeNames, type Locale } from '@/i18n/config';

interface LanguageSwitcherProps {
  variant?: 'light' | 'dark';
}

export function LanguageSwitcher({ variant = 'dark' }: LanguageSwitcherProps) {
  const params = useParams();
  const pathname = usePathname();
  const currentLocale = (params?.locale as Locale) || 'fr';

  // Get the path without the locale prefix
  const getPathWithoutLocale = () => {
    const segments = pathname.split('/').filter(Boolean);
    // Remove the first segment if it's a locale
    if (locales.includes(segments[0] as Locale)) {
      return '/' + segments.slice(1).join('/');
    }
    return pathname;
  };

  const pathWithoutLocale = getPathWithoutLocale();

  // Different styles based on variant
  const buttonStyles = variant === 'dark'
    ? 'flex items-center gap-2 bg-white/10 border-white/20 hover:bg-white/20 text-white hover:text-white rounded-xl backdrop-blur-sm transition-all duration-200'
    : 'flex items-center gap-2 bg-gray-100 border-gray-200 hover:bg-gray-200 text-gray-700 hover:text-gray-900 rounded-xl transition-all duration-200';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={buttonStyles}
        >
          <Globe className="h-4 w-4" />
          <span className="text-sm font-semibold uppercase">
            {currentLocale}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-xl shadow-lg">
        {locales.map((locale) => (
          <DropdownMenuItem key={locale} asChild>
            <Link
              href={`/${locale}${pathWithoutLocale}`}
              className={`flex items-center justify-between px-3 py-2.5 cursor-pointer rounded-lg transition-colors ${
                currentLocale === locale
                  ? 'bg-green-50 text-green-700 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="font-medium">{localeNames[locale]}</span>
              <span className="text-xs text-gray-400 uppercase font-semibold">{locale}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
