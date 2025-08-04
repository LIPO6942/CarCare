import type {NextConfig} from 'next';

const withPWA = require('@ducanh2912/next-pwa').default({
    dest: 'public',
    register: true,
    skipWaiting: true, // Set to true to activate new service worker immediately
    workboxOptions: {
        disableDevLogs: true,
        // Exclude OneSignal service workers from being managed by next-pwa
        exclude: [/OneSignalSDKWorker\.js$/, /OneSignalSDKUpdaterWorker\.js$/],
    }
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
  env: {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  }
};

export default withPWA(nextConfig);
