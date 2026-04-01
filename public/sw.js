const CACHE_NAME = 'dt-base-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simple fetch handler for PWA requirements
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request));
  } else {
    event.respondWith(fetch(event.request));
  }
});
