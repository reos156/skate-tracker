// Service worker de Skate Tracker: la app tiene que abrir sin señal en la pista.
// Estrategia: shell precacheado, red primero para el HTML, cache primero para
// los assets estáticos.

const VERSION = 'skate-v18';
const SHELL = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './src/app.js',
  './src/core.js',
  './src/data.js',
  './src/store.js',
  './src/json-import.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // El motor de lectura viene de un CDN: se guarda la primera vez y queda
  // disponible sin conexión después.
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const response = await fetch(request);
          if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
          return response;
        } catch (error) {
          return hit ?? Response.error();
        }
      }),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
