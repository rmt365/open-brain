const CACHE_NAME = 'open-brain-v2';
const STATIC_ASSETS = [
  '/open-brain/ui/static/js/components/open-brain-chat.js',
  'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean old caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // API calls: network-only (thoughts, documents, preferences, topics)
  const isApi = event.request.url.includes('/thoughts')
    || event.request.url.includes('/documents')
    || event.request.url.includes('/preferences')
    || event.request.url.includes('/topics')
    || event.request.method !== 'GET';

  if (isApi) {
    event.respondWith(
      fetch(event.request).catch(() => {
        if (event.request.method === 'POST') {
          return new Response(
            JSON.stringify({ success: false, offline: true }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 503,
            }
          );
        }
        return new Response('Offline', { status: 503 });
      })
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
