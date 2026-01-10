import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from 'react-hot-toast';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SoyaFlow | Smart Feed Distribution Platform",
  description: "AI-powered feed distribution management platform for Soya Excel. Optimize routes, predict orders, and track deliveries in real-time across Canada, USA & Spain.",
  keywords: ["SoyaFlow", "Soya Excel", "feed distribution", "soybean meal", "route optimization", "AI predictions", "logistics management", "agriculture tech"],
  authors: [{ name: "Soya Excel" }],
  creator: "Soya Excel",
  publisher: "Soya Excel",
  openGraph: {
    title: "SoyaFlow | Smart Feed Distribution Platform",
    description: "AI-powered feed distribution management for efficient soybean meal delivery",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} antialiased font-sans`}
      >
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
      </body>
    </html>
  );
}
