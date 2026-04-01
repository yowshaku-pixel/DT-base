const CACHE_NAME = 'dt-base-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simplest possible fetch for localhost PWA compatibility
  event.respondWith(fetch(event.request));
});
