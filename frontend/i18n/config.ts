export const locales = ['en', 'fr'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'fr'; // Default to French for Quebec

export const localeNames: Record<Locale, string> = {
  en: 'English',
  fr: 'Français'
};
