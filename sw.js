/* ============================================================
   MAAT OS — Service Worker
   Industrial Illusion SARL · Projet PurKemet
   ------------------------------------------------------------
   v8.2.0 (2026-10-21) :
     - FIX CRITIQUE : addAll() → Promise.allSettled()
       (résilient aux 404, installe toujours le SW)
     - Stratégie network-first pour HTML (jamais de HTML stale)
     - Cache-first pour assets statiques (css, js, png)
     - Stale-while-revalidate pour le reste
     - Logs détaillés en console ([Maat SW])
     - Bump de version pour forcer l'invalidation
   ------------------------------------------------------------
   ⚠️ À chaque modification des fichiers du SHELL :
      incrémenter V pour forcer la purge du cache.
   ============================================================ */

const V = 'maatos-v8.2.0'; // ← bump à chaque release
const SHELL = [
  'index.html',
  'purkemet.html',
  'kmeh20.html',
  'datalake.html',
  'carrieres.html',
  'apropos.html',
  'dashboard.html',
  'pwa.html',
  'admin.html',
  'assets/maat.css',
  'assets/core.js',
  'assets/config.js',
  'assets/monitoring.js',
  'assets/tw-config.js',
  'assets/site.js',
  'assets/pwa.js',
  'assets/admin.js',
  'assets/dashboard.js',
  'manifest.webmanifest',
  'admin.webmanifest'
];

/* ------------------------------------------------------------
   INSTALL — cache résilient : chaque fichier est indépendant.
   Si un asset manque (404), on continue quand même.
   ------------------------------------------------------------ */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(V).then((cache) => {
      const results = SHELL.map((url) =>
        fetch(url, { cache: 'no-store' })
          .then((res) => {
            if (res && (res.ok || res.type === 'opaque')) {
              return cache.put(url, res).then(() => ({ url, ok: true }));
            }
            return { url, ok: false, status: res ? res.status : 'no-res' };
          })
          .catch((err) => ({ url, ok: false, error: err && err.message }))
      );

      return Promise.allSettled(results).then((settled) => {
        const ok = [];
        const failed = [];
        settled.forEach((s) => {
          if (s.status === 'fulfilled' && s.value) {
            if (s.value.ok) ok.push(s.value.url);
            else failed.push(s.value.url + ' (' + (s.value.status || s.value.error) + ')');
          }
        });

        console.info(
          '%c[Maat SW] Install OK · ' + ok.length + '/' + SHELL.length + ' fichiers cachés · v=' + V,
          'color:#00FFA3;font-weight:bold;'
        );
        if (failed.length) {
          console.warn('[Maat SW] Fichiers manquants (ignorés) :', failed);
        }
      });
    }).then(() => self.skipWaiting())
  );
});

/* ------------------------------------------------------------
   ACTIVATE — purge des anciennes versions + claim immédiat.
   ------------------------------------------------------------ */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== V)
            .map((k) => {
              console.info('[Maat SW] Suppression cache obsolète :', k);
              return caches.delete(k);
            })
        )
      )
      .then(() => self.clients.claim())
      .then(() => {
        console.info('%c[Maat SW] Activate OK · v=' + V, 'color:#00FFA3;font-weight:bold;');
      })
  );
});

/* ------------------------------------------------------------
   FETCH — stratégie par type de ressource.
   ------------------------------------------------------------ */
self.addEventListener('fetch', (e) => {
  const r = e.request;
  const u = new URL(r.url);

  /* Ignore tout sauf GET. */
  if (r.method !== 'GET') return;

  /* Ignore les domaines non-cacheables (API, CDN dynamiques). */
  if (
    u.hostname.endsWith('supabase.co') ||
    u.hostname.endsWith('googleapis.com') ||
    u.hostname.endsWith('gstatic.com') ||
    u.hostname.endsWith('jsdelivr.net') ||
    u.hostname.endsWith('tailwindcss.com') ||
    u.hostname.endsWith('sentry.io') ||
    u.hostname.endsWith('sentry-cdn.com')
  ) return;

  /* ── Stratégie 1 : HTML → NETWORK-FIRST ────────────────────
     Pour ne JAMAIS servir une vieille version du HTML.
     Fallback sur cache si offline. */
  const isHTML =
    r.mode === 'navigate' ||
    (r.headers.get('accept') || '').indexOf('text/html') >= 0 ||
    u.pathname.endsWith('.html') ||
    u.pathname === '/';

  if (isHTML) {
    e.respondWith(
      fetch(r)
        .then((res) => {
          if (res && res.ok) {
            const cp = res.clone();
            caches.open(V).then((c) => c.put(r, cp));
          }
          return res;
        })
        .catch(() =>
          caches.match(r, { ignoreSearch: true }).then((hit) => {
            if (hit) return hit;
            if (r.mode === 'navigate') return caches.match('index.html');
            return Response.error();
          })
        )
    );
    return;
  }

  /* ── Stratégie 2 : Assets statiques → CACHE-FIRST ──────────
     css, js, png, ico, woff, manifest : rarement modifiés.
     Fallback réseau si absent du cache. */
  const isStatic =
    /\.(css|js|mjs|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|otf|webmanifest)$/i.test(u.pathname);

  if (isStatic) {
    e.respondWith(
      caches.match(r, { ignoreSearch: true }).then((hit) => {
        if (hit) return hit;
        return fetch(r)
          .then((res) => {
            if (res && (res.ok || res.type === 'opaque')) {
              const cp = res.clone();
              caches.open(V).then((c) => c.put(r, cp));
            }
            return res;
          })
          .catch(() => Response.error());
      })
    );
    return;
  }

  /* ── Stratégie 3 : Autres → STALE-WHILE-REVALIDATE ───────── */
  e.respondWith(
    caches.match(r, { ignoreSearch: true }).then((hit) => {
      const net = fetch(r)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const cp = res.clone();
            caches.open(V).then((c) => c.put(r, cp));
          }
          return res;
        })
        .catch(() => (hit ? hit : Response.error()));

      if (hit) {
        e.waitUntil(net.catch(() => {}));
        return hit;
      }
      return net;
    })
  );
});

/* ------------------------------------------------------------
   MESSAGE — skip waiting à la demande.
   ------------------------------------------------------------ */
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'CLEAR_CACHE') {
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => {
      if (e.source && e.source.postMessage) {
        e.source.postMessage({ type: 'CACHE_CLEARED', v: V });
      }
    });
  }
});
