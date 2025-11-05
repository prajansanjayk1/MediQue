const CACHE_NAME = 'medique-v2';
const FILES_TO_CACHE = [
  '/',
  'index.html',
  'patient.html',
  'doctor.html',
  'logo.jpg',
  'icon-192x192.png',
  'icon-512x512.png',
  'offline.html'
];

// Install
self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keyList) =>
      Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch
self.addEventListener('fetch', (evt) => {
  evt.respondWith(
    fetch(evt.request)
      .then((response) => {
        // Update cache
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(evt.request, clone));
        return response;
      })
      .catch(() =>
        caches.match(evt.request).then((resp) => resp || caches.match('offline.html'))
      )
  );
});
