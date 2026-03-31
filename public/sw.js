const CACHE_NAME = 'dt-base-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://img.icons8.com/color/192/truck.png',
  'https://img.icons8.com/color/512/truck.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
