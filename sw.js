// Service Worker — Car & Era PWA
const CACHE_NAME = 'caryera-v193';

// Install — cache basic shell
self.addEventListener('install', function(e) {
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
          .map(function(n) { return caches.delete(n); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', function(e) {
  // Skip non-GET and API calls
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/.netlify/') || e.request.url.includes('supabase')) return;
  if (e.request.url.includes('localhost') || e.request.url.includes('127.0.0.1')) return;
  if (e.request.url.startsWith('chrome-extension')) return;

  e.respondWith(
    fetch(e.request).then(function(res) {
      // Cache successful responses
      if (res.ok) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, clone);
        });
      }
      return res;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});

// Push notifications
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data.json(); } catch(err) { data = { title: 'Car & Era', body: e.data ? e.data.text() : 'Nueva notificación' }; }
  e.waitUntil(
    self.registration.showNotification(data.title || 'Ópticas Car & Era', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: data.url || '/',
      vibrate: [200, 100, 200]
    })
  );
});

// Click notification — open app
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.includes('optcaryera') && 'focus' in list[i]) return list[i].focus();
      }
      return clients.openWindow(e.notification.data || '/');
    })
  );
});
