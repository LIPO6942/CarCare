import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/context/auth-context';

export const metadata: Metadata = {
  title: 'CarCare Pro',
  description: 'Gérez l\'entretien de votre véhicule en toute simplicité.',
  manifest: '/manifest.json',
  icons: {
    apple: '/apple-touch-icon.png',
    icon: '/favicon.ico',
  },
  themeColor: '#ffffff',
  other: {
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-capable': 'yes',
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <meta name="theme-color" content="#ffffff" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        ></link>
      </head>
      <body className="font-body antialiased bg-white">
        <AuthProvider>
            {children}
            <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
