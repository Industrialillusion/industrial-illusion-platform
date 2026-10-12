
/* ============================================================
   MAAT OS — Service Worker
   Industrial Illusion SARL · Projet PurKemet
   ------------------------------------------------------------
   Stratégie :
     - Coquille applicative (HTML + assets) mise en cache au install
     - Stale-while-revalidate : réponse immédiate depuis le cache,
       mise à jour silencieuse en arrière-plan
     - API Supabase JAMAIS mise en cache (données temps réel)
     - Fallback navigation hors-ligne → pwa.html
   ------------------------------------------------------------
   ⚠️ Toute modification des fichiers du SHELL exige d'incrémenter
      la constante V pour forcer l'invalidation du cache.
   ============================================================ */

const V = 'maatos-v8.1.0';

/* Coquille mise en cache dès l'installation.
   Chemins relatifs au scope du SW (racine du repo). */
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
  'assets/tw-config.js',
  'assets/site.js',
  'assets/pwa.js',
  'assets/admin.js',
  'manifest.webmanifest',
  'admin.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

/* ------------------------------------------------------------
   INSTALL — met en cache la coquille, active immédiatement
   ------------------------------------------------------------ */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(V)
      .then((c) => c.addAll(SHELL))
      .catch((err) => {
        /* Si un fichier est absent, on log sans bloquer l'installation. */
        console.warn('[Maat SW] Shell incomplet au install :', err);
      })
      .then(() => self.skipWaiting())
  );
});

/* ------------------------------------------------------------
   ACTIVATE — purge les anciennes versions du cache
   ------------------------------------------------------------ */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== V)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ------------------------------------------------------------
   FETCH — intercepte les requêtes GET uniquement
   ------------------------------------------------------------
   - Ne touche JAMAIS : POST/PUT/DELETE (uploads, RPC)
   - Ne touche JAMAIS : supabase.co (données temps réel)
   - Ne touche JAMAIS : googleapis / gstatic (fonts CDN)
   ------------------------------------------------------------ */
self.addEventListener('fetch', (e) => {
  const r = e.request;
  const u = new URL(r.url);

  /* Ignore tout sauf GET. */
  if (r.method !== 'GET') return;

  /* Ignore les domaines non-cacheables. */
  if (
    u.hostname.endsWith('supabase.co') ||
    u.hostname.endsWith('googleapis.com') ||
    u.hostname.endsWith('gstatic.com') ||
    u.hostname.endsWith('jsdelivr.net') ||
    u.hostname.endsWith('tailwindcss.com')
  ) return;

  /* Stale-while-revalidate sur les assets same-origin. */
  e.respondWith(
    caches.match(r, { ignoreSearch: true }).then((hit) => {
      const net = fetch(r)
        .then((res) => {
          /* Met en cache uniquement les réponses valides. */
          if (res && (res.ok || res.type === 'opaque')) {
            const cp = res.clone();
            caches.open(V).then((c) => c.put(r, cp));
          }
          return res;
        })
        .catch(() => {
          /* Hors-ligne : fallback sur le cache ou pwa.html pour navigation. */
          if (hit) return hit;
          if (r.mode === 'navigate') return caches.match('pwa.html');
          return Response.error();
        });

      /* Si on a un hit, on retourne tout de suite et on laisse le
         réseau se mettre à jour en arrière-plan. */
      if (hit) {
        e.waitUntil(net.catch(() => {}));
        return hit;
      }
      return net;
    })
  );
});

/* ------------------------------------------------------------
   MESSAGE — permet à la page de forcer un skipWaiting
   ------------------------------------------------------------ */
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
