/* ==========================================================================
 *  sw.js · Service Worker unificato
 *  Maat OS · Industrial Illusion SARL · v1.0.2
 *
 *  Strategie:
 *  - HTML       → network-first con fallback cache
 *  - JS / CSS   → network-first con fallback cache  (deploy visibile al F5)
 *  - img/font   → cache-first
 *  - Supabase   → bypass totale
 *
 *  v1.0.2: JS/CSS ora network-first → fine bump manuali VERSION.
 * ========================================================================== */

const VERSION      = 'maat-v1.0.2-pre-pwa';
const SHELL_CACHE  = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';

const SHELL_URLS = [
  '/pwa.html',
  '/pwa.webmanifest',
  '/icons/icon-192.png',
  '/assets/maat.css',
  '/assets/pwa-badges.css',
  '/assets/pwa-scan.css',
  '/assets/pwa-weigh.css',
  '/assets/config.js',
  '/assets/core.js',
  '/assets/monitoring.js',
  '/assets/pwa.js',
  '/assets/pwa-badges.js',
  '/assets/pwa-scan.js',
  '/assets/pwa-scan-handlers.js',
  '/assets/qr-generator.js',
  '/assets/qr-scanner.js'
];

/* ─── Install ────────────────────────────────────────────────────────── */
self.addEventListener('install', function (event) {
  console.log('[SW] install', VERSION);
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function (cache) {
        return Promise.allSettled(
          SHELL_URLS.map(function (url) { return cache.add(url); })
        );
      })
      .then(function () { return self.skipWaiting(); })
  );
});

/* ─── Activate ───────────────────────────────────────────────────────── */
self.addEventListener('activate', function (event) {
  console.log('[SW] activate', VERSION);
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return !k.startsWith(VERSION); })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

/* ─── Fetch ──────────────────────────────────────────────────────────── */
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  if (url.hostname.indexOf('supabase.co') !== -1) return;
  if (url.hostname.indexOf('fonts.googleapis.com') !== -1) return;
  if (url.hostname.indexOf('fonts.gstatic.com') !== -1) return;

  // HTML → network-first
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE, '/pwa.html'));
    return;
  }

  // JS / CSS → network-first (sempre freschi online, cache offline)
  if (/\.(js|css)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE));
    return;
  }

  // img / font / manifest → cache-first
  if (/\.(png|jpg|jpeg|svg|webp|woff2?|ico|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});

/* ─── network-first ──────────────────────────────────────────────────── */
function networkFirst(req, cacheName, fallbackUrl) {
  return fetch(req).then(function (fresh) {
    if (fresh && fresh.ok) {
      var clone = fresh.clone();
      caches.open(cacheName).then(function (cache) {
        cache.put(req, clone).catch(function (e) {
          console.warn('[SW] cache.put failed:', e.message);
        });
      });
    }
    return fresh;
  }).catch(function () {
    return caches.match(req).then(function (cached) {
      if (cached) return cached;
      if (fallbackUrl) return caches.match(fallbackUrl);
      return new Response('', { status: 503 });
    });
  });
}

/* ─── cache-first ────────────────────────────────────────────────────── */
function cacheFirst(req) {
  return caches.match(req).then(function (cached) {
    if (cached) return cached;
    return fetch(req).then(function (fresh) {
      if (fresh && fresh.ok) {
        var clone = fresh.clone();
        caches.open(SHELL_CACHE).then(function (cache) {
          cache.put(req, clone).catch(function (e) {
            console.warn('[SW] cache.put asset failed:', e.message);
          });
        });
      }
      return fresh;
    }).catch(function () {
      return new Response('', { status: 503 });
    });
  });
}

/* ─── stale-while-revalidate ─────────────────────────────────────────── */
function staleWhileRevalidate(req) {
  return caches.match(req).then(function (cached) {
    var networkPromise = fetch(req).then(function (fresh) {
      if (fresh && fresh.ok) {
        var clone = fresh.clone();
        caches.open(RUNTIME_CACHE).then(function (cache) {
          cache.put(req, clone).catch(function (e) {
            console.warn('[SW] cache.put runtime failed:', e.message);
          });
        });
      }
      return fresh;
    }).catch(function () { return cached; });
    return cached || networkPromise;
  });
}

/* ─── Messaggi ───────────────────────────────────────────────────────── */
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
