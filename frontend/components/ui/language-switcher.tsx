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

export function LanguageSwitcher() {
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 hover:bg-gray-100 rounded-xl"
        >
          <Globe className="h-4 w-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700 uppercase">
            {currentLocale}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 rounded-xl shadow-lg">
        {locales.map((locale) => (
          <DropdownMenuItem key={locale} asChild>
            <Link
              href={`/${locale}${pathWithoutLocale}`}
              className={`flex items-center justify-between px-3 py-2 cursor-pointer rounded-lg ${
                currentLocale === locale
                  ? 'bg-green-50 text-green-700 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{localeNames[locale]}</span>
              <span className="text-xs text-gray-400 uppercase">{locale}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
