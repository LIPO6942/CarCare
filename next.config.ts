import type {NextConfig} from 'next';

const withPWA = require('@ducanh2912/next-pwa').default({
    dest: 'public',
    register: true,
    skipWaiting: true, // Set to true to activate new service worker immediately
    // This is important: it tells next-pwa to not overwrite our custom firebase-messaging-sw.js and OneSignal files
    publicExcludes: ['!firebase-messaging-sw.js', '!OneSignalSDKWorker.js', '!OneSignalSDKUpdaterWorker.js'],
});

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'logo.clearbit.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default withPWA(nextConfig);
