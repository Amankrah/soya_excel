import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, type Locale } from './i18n/config';

export default getRequestConfig(async ({ requestLocale }) => {
  // This typically corresponds to the `[locale]` segment
  let locale = await requestLocale;

  // Ensure that a valid locale is used
  if (!locale || !locales.includes(locale as Locale)) {
    locale = 'fr'; // fallback to default
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default
  };
});

// Re-export for convenience
export { locales, type Locale } from './i18n/config';
