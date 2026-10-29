// Simple PWA Service Worker
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Let network handle dynamic API and socket calls
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
