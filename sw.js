/* ==========================================================================
 *  sw.js · Service Worker unificato
 *  Maat OS · Industrial Illusion SARL · v1.0.4
 *
 *  v1.0.4:
 *  - Aggiunti /assets/materials.js e /assets/mfa-gate.js allo shell offline.
 *  - Bump VERSION → invalidazione cache vecchie.
 *
 *  v1.0.3:
 *  - Network-first con { cache: 'reload' } senza perdere gli header originali.
 *  - Fallback offline a /pwa.html SOLO se la navigazione è per la PWA.
 *  - Dashboard & Admin escluse dal fallback dell'operatore.
 * ========================================================================== */

const VERSION       = 'maat-v1.0.4-materials-mfa';
const SHELL_CACHE   = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';

// Lo Shell offline è riservato ESCLUSIVAMENTE all'operatore PWA
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
  '/assets/qr-scanner.js',
  '/assets/materials.js',
  '/assets/mfa-gate.js'
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

  // Bypass totale per Supabase, Google Fonts, API esterne
  if (url.hostname.indexOf('supabase.co') !== -1) return;
  if (url.hostname.indexOf('fonts.googleapis.com') !== -1) return;
  if (url.hostname.indexOf('fonts.gstatic.com') !== -1) return;

  // 1. Pagine HTML
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
    var freshReq = new Request(req, { cache: 'reload' });
    var fallback = url.pathname.indexOf('pwa.html') !== -1 ? '/pwa.html' : null;
    event.respondWith(networkFirst(freshReq, RUNTIME_CACHE, fallback));
    return;
  }

  // 2. Script e Stili (JS / CSS) → download fresco obbligatorio
  if (/\.(js|css)$/i.test(url.pathname)) {
    var freshAssetReq = new Request(req, { cache: 'reload' });
    event.respondWith(networkFirst(freshAssetReq, RUNTIME_CACHE));
    return;
  }

  // 3. Asset statici pesanti (immagini, font, icone) → cache-first
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
      return new Response('Offline - Risorsa non disponibile', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
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
