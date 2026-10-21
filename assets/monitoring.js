/* ============================================================
   MAAT · MONITORING v1.1
   Sentry integration · zero-config · fail-silent
   ─────────────────────────────────────────────────────────────
   v1.1 (2026-10-21) — Fix Sentry v8 API :
     - new BrowserTracing() → browserTracingIntegration()
     - tracePropagationTargets spostato in init()
     - fallback sicuro se integration mancante
   ============================================================ */
(function () {
  'use strict';

  /* ─── 1. Helpers fallback (avant chargement SDK) ─── */
  window.Maat = window.Maat || {};

  if (!window.Maat.captureError) {
    window.Maat.captureError = function (err, ctx) {
      console.error('[MONITORING-FALLBACK]', err, ctx || {});
    };
  }
  if (!window.Maat.captureMessage) {
    window.Maat.captureMessage = function (msg, level, ctx) {
      console.log('[MONITORING-FALLBACK:' + (level || 'info') + ']', msg, ctx || {});
    };
  }

  /* ─── 2. Lecture config (II_CONFIG prioritaire) ─── */
  var CFG = window.II_CONFIG || window.MAAT_CONFIG || {};
  var SENTRY_DSN  = CFG.SENTRY_DSN || '';
  var ENVIRONMENT = CFG.ENVIRONMENT || 'production';
  var RELEASE     = CFG.RELEASE || 'maat@1.0.0';

  if (!SENTRY_DSN) {
    console.info('[MONITORING] DSN absent — mode local, pas d\'envoi Sentry.');
    return;
  }

  /* ─── 3. Chargement SDK Sentry ─── */
  var script = document.createElement('script');
  script.src = 'https://browser.sentry-cdn.com/8.45.1/bundle.tracing.min.js';
  script.crossOrigin = 'anonymous';
  script.onload = initSentry;
  script.onerror = function () {
    console.warn('[MONITORING] Échec du chargement du SDK Sentry (CDN bloqué ?).');
  };
  document.head.appendChild(script);

  /* ─── 4. Initialisation ─── */
  function initSentry() {
    if (!window.Sentry || typeof window.Sentry.init !== 'function') {
      console.warn('[MONITORING] SDK Sentry non disponible après chargement.');
      return;
    }

    try {
      /* Construire les integrations de façon sûre (v8+ API) */
      var integrations = [];
      try {
        if (typeof window.Sentry.browserTracingIntegration === 'function') {
          integrations.push(window.Sentry.browserTracingIntegration());
        } else if (typeof window.Sentry.replayIntegration === 'function') {
          /* v8 minimal fallback : pas de tracing si indisponible */
        }
      } catch (intErr) {
        console.warn('[MONITORING] Integration Sentry ignorée:', intErr && intErr.message);
      }

      window.Sentry.init({
        dsn: SENTRY_DSN,
        environment: ENVIRONMENT,
        release: RELEASE,

        integrations: integrations,

        /* Tracing & propagation */
        tracesSampleRate: 0.1,
        tracePropagationTargets: [
          'localhost',
          /^https:\/\/[a-z0-9-]+\.supabase\.co/,
          window.location.host
        ],

        attachStacktrace: true,

        ignoreErrors: [
          'top.GLOBALS',
          'canvas.contentDocument',
          'NetworkError',
          'Failed to fetch',
          'Load failed',
          'Non-Error promise rejection captured',
          'chrome-extension://',
          'moz-extension://',
          'safari-extension://',
          'webkit-masked-url'
        ],
        denyUrls: [
          /extensions\//i,
          /^chrome:\/\//i,
          /^chrome-extension:\/\//i,
          /^moz-extension:\/\//i,
          /^safari-extension:\/\//i,
          /^safari-web-extension:\/\//i
        ],

        beforeSend: function (event) {
          try {
            event.tags = event.tags || {};
            event.tags.page     = document.title || 'unknown';
            event.tags.path     = window.location.pathname;
            event.tags.viewport = window.innerWidth + 'x' + window.innerHeight;

            var email = null;
            try { email = window.sessionStorage.getItem('maat_user_email'); } catch (e) {}
            if (email) {
              event.user = event.user || {};
              event.user.email = email;
            }
          } catch (e) {}
          return event;
        }
      });

      /* Override helpers avec Sentry réel */
      window.Maat.captureError = function (err, context) {
        try {
          window.Sentry.captureException(err, { extra: context || {} });
        } catch (e) {
          console.error('[MONITORING-CAPTURE]', err, context);
        }
      };
      window.Maat.captureMessage = function (msg, level, context) {
        try {
          window.Sentry.captureMessage(msg, {
            level: level || 'info',
            extra: context || {}
          });
        } catch (e) {}
      };

      /* Attache user context quand auth prête */
      attachAuthTracking(0);

      console.info(
        '%c[MONITORING] Sentry actif · env=' + ENVIRONMENT + ' · release=' + RELEASE,
        'color:#00FFA3;font-weight:bold;background:#0A0D10;padding:2px 6px;border-radius:3px;'
      );
    } catch (e) {
      console.warn('[MONITORING] Init Sentry échouée:', e);
    }
  }

  /* ─── 5. Attach user context (retry until Maat.sb ready) ─── */
  function attachAuthTracking(attempt) {
    attempt = attempt || 0;
    if (attempt > 10) {
      console.warn('[MONITORING] Maat.sb jamais disponible — pas de tracking auth.');
      return;
    }

    if (!window.Maat || !window.Maat.sb || !window.Maat.sb.auth) {
      setTimeout(function () { attachAuthTracking(attempt + 1); }, 300);
      return;
    }

    try {
      window.Maat.sb.auth.onAuthStateChange(function (event, session) {
        try {
          if (session && session.user) {
            window.Sentry.setUser({
              id: session.user.id,
              email: session.user.email,
              username: session.user.user_metadata && session.user.user_metadata.full_name
            });
            try { window.sessionStorage.setItem('maat_user_email', session.user.email || ''); } catch (e) {}
          } else {
            window.Sentry.setUser(null);
            try { window.sessionStorage.removeItem('maat_user_email'); } catch (e) {}
          }
        } catch (e) {}
      });
    } catch (e) {
      console.warn('[MONITORING] Attach auth failed:', e);
    }
  }
})();
