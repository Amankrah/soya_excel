import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "../globals.css";
import { Toaster } from 'react-hot-toast';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SoyaFlow | AI-Powered Feed Distribution Platform",
  description: "Smart feed distribution management platform for Soya Excel. AI-powered reorder predictions, optimized route planning, and real-time tracking across Canada, USA & Spain. Developed by SASEL Lab at McGill University.",
  keywords: [
    "SoyaFlow",
    "Soya Excel",
    "feed distribution",
    "soybean meal",
    "route optimization",
    "AI predictions",
    "logistics management",
    "agriculture tech",
    "SASEL Lab",
    "McGill University",
    "sustainable food systems",
    "RITA Consortium"
  ],
  authors: [
    { name: "Emmanuel Amankrah Kwofie", url: "https://www.eakwofie.com/" },
    { name: "SASEL Lab", url: "https://sasellab.com/" }
  ],
  creator: "SASEL Lab - McGill University",
  publisher: "Soya Excel",
  openGraph: {
    title: "SoyaFlow | AI-Powered Feed Distribution Platform",
    description: "Smart feed distribution management with AI predictions, route optimization, and real-time tracking. Developed by SASEL Lab at McGill University.",
    type: "website",
    siteName: "SoyaFlow",
  },
  twitter: {
    card: "summary_large_image",
    title: "SoyaFlow | AI-Powered Feed Distribution",
    description: "Smart soybean meal distribution management platform",
  },
  robots: {
    index: false, // Internal platform
    follow: false,
  },
};

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!locales.includes(locale as any)) {
    notFound();
  }

  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages({ locale });

  return (
    <html lang={locale} className="scroll-smooth">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased font-sans bg-white`}
        style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}
      >
        <NextIntlClientProvider messages={messages}>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#171717',
                color: '#fff',
                borderRadius: '16px',
                border: '1px solid #404040',
                padding: '16px',
                fontSize: '14px',
                fontWeight: 500,
                boxShadow: '0 10px 40px -10px rgba(0,0,0,0.4)',
              },
              success: {
                duration: 3000,
                style: {
                  background: 'linear-gradient(135deg, #2D5016 0%, #22420d 100%)',
                  border: '1px solid #4A7C59',
                },
                iconTheme: {
                  primary: '#FFD700',
                  secondary: '#2D5016',
                },
              },
              error: {
                duration: 4000,
                style: {
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  border: '1px solid #ef4444',
                },
              },
              loading: {
                style: {
                  background: 'linear-gradient(135deg, #FFD700 0%, #e6b800 100%)',
                  color: '#171717',
                  border: '1px solid #ffe033',
                },
              },
            }}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
