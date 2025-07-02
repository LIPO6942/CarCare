'use client';

import { useEffect } from 'react';

export function PwaInstaller() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.service-worker.js.register('/service-worker.js').then(function(registration) {
          console.log('Service Worker registration successful with scope: ', registration.scope);
        }, function(err) {
          console.log('Service Worker registration failed: ', err);
        });
      });
    }
  }, []);

  return null;
}
