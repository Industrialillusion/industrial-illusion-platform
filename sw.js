/* ==========================================================================
 *  sw.js · Service Worker unificato
 *  Maat OS · Industrial Illusion SARL · v1.0.0
 *
 *  Strategie:
 *  - App shell (pwa.html + asset core) → pre-cache all'install
 *  - HTML → network-first con fallback cache
 *  - Asset statici (CSS/JS/IMG) → cache-first
 *  - Supabase API → bypass totale (no cache)
 * ========================================================================== */

const VERSION      = 'maat-v1.0.0-pre-pwa';
const SHELL_CACHE  = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';

const SHELL_URLS = [
  '/pwa.html',
  '/pwa.webmanifest',
  '/icons/icon-192.png',
  '/assets/maat.css',
  '/assets/config.js',
  '/assets/core.js',
  '/assets/monitoring.js',
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

  // Supabase: bypass totale
  if (url.hostname.indexOf('supabase.co') !== -1) return;

  // Font Google: bypass
  if (url.hostname.indexOf('fonts.googleapis.com') !== -1) return;
  if (url.hostname.indexOf('fonts.gstatic.com') !== -1) return;

  // HTML
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
    event.respondWith(networkFirstHTML(req));
    return;
  }

  // Static assets
  if (/\.(css|js|png|jpg|jpeg|svg|webp|woff2?|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});

/* ─── Strategie ──────────────────────────────────────────────────────── */
function networkFirstHTML(req) {
  return fetch(req).then(function (fresh) {
    if (fresh && fresh.ok) {
      caches.open(RUNTIME_CACHE).then(function (cache) {
        cache.put(req, fresh.clone());
      });
    }
    return fresh;
  }).catch(function () {
    return caches.match(req).then(function (cached) {
      if (cached) return cached;
      return caches.match('/pwa.html');
    }).then(function (shell) {
      if (shell) return shell;
      return new Response(
        '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background:#060A0D;color:#F87171;font-family:monospace;padding:2rem;text-align:center"><h1>OFFLINE</h1><p>Pas de connexion et page absente du cache.</p></body></html>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
      );
    });
  });
}

function cacheFirst(req) {
  return caches.match(req).then(function (cached) {
    if (cached) return cached;
    return fetch(req).then(function (fresh) {
      if (fresh && fresh.ok) {
        caches.open(SHELL_CACHE).then(function (cache) {
          cache.put(req, fresh.clone());
        });
      }
      return fresh;
    }).catch(function () {
      return new Response('', { status: 503 });
    });
  });
}

function staleWhileRevalidate(req) {
  return caches.match(req).then(function (cached) {
    var networkPromise = fetch(req).then(function (fresh) {
      if (fresh && fresh.ok) {
        caches.open(RUNTIME_CACHE).then(function (cache) {
          cache.put(req, fresh.clone());
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
