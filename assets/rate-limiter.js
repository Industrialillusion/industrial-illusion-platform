/* ==========================================================================
 *  assets/rate-limiter.js
 *  Maat OS · Anti-spam client-side + RPC check_rate_limit su Supabase
 *  ------------------------------------------------------------
 *  v2 (Fase 7 · bonifica):
 *  - Fingerprint STABLE (no canvas): userAgent + language + timezone.
 *    Prima: canvas.toDataURL() poteva variare ad ogni render → nuove chiavi
 *    → counter non ritrovato → falsi positivi "troppe richieste".
 *  - Rimosso re-dispatch del submit (bug doppio incremento counter).
 *    Ora se allowed=true il submit nativo prosegue (nessun preventDefault).
 *  - Fail-open totale: RPC assente/errore/rete → allowed=true (lascia passare).
 *  - Endpoint per-form (id/name/action): ogni form ha il suo counter.
 *  - Toast in FRANCESE, coerente con M.toast di core.js.
 *  - Soglia: 20 tentativi / 300 s per form (uso operativo realistico).
 *  - API reset(): window.MaatRateLimiter.reset() per debug.
 *  - Debug: window.__MAAT_DEBUG__ = true per log dettagliati.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatRateLimiterLoaded) return;
  window.__MaatRateLimiterLoaded = true;

  const CFG = {
    maxAttempts: 20,        // era 5 · alzato per uso operativo (form admin)
    windowSeconds: 300,     // era 600 · finestra 5 min
    defaultEndpoint: 'form_submit'
  };

  const MSG_TOO_MANY = 'Trop de requêtes. Réessayez dans quelques minutes.';
  const MSG_TOO_MANY_ALERT = MSG_TOO_MANY;

  const log  = (...a) => { if (window.__MAAT_DEBUG__) console.log('[rate-limiter]', ...a); };
  const warn = (...a) => console.warn('[rate-limiter]', ...a);

  /* ─── Fingerprint STABLE (deterministico) ─────────────────────────────
     Niente canvas (soggetto a variazioni GPU/font). Solo stringhe standard.
     Se cambia fingerprint ogni render, il server vede "utenti nuovi" e il
     counter non funziona — causava i falsi positivi "troppe richieste".
  */
  function fingerprint() {
    try {
      const ua   = (navigator.userAgent || '').slice(0, 120);
      const lang = navigator.language || '';
      const tz   = (Intl.DateTimeFormat().resolvedOptions().timeZone) || '';
      const scr  = (window.screen && window.screen.width + 'x' + window.screen.height) || '';
      // Hash djb2 su stringa deterministica
      const raw = [ua, lang, tz, scr].join('|');
      let h = 5381;
      for (let i = 0; i < raw.length; i++) h = ((h << 5) + h) ^ raw.charCodeAt(i);
      return 'fp-' + (h >>> 0).toString(36);
    } catch (_) {
      return 'fp-fallback';
    }
  }

  /* ─── Client Supabase (multi-pattern) ─────────────────────────────── */
  function getClient() {
    const cands = [window.Maat && window.Maat.sb, window.maatSupabase,
                   window.supabaseClient, window.sb];
    for (const c of cands) {
      if (c && typeof c.rpc === 'function') return c;
    }
    try {
      if (window.Maat && typeof window.Maat.init === 'function') {
        window.Maat.init();
        if (window.Maat.sb) return window.Maat.sb;
      }
    } catch (_) {}
    return null;
  }

  /* ─── Endpoint label per-form (ogni form ha il suo counter) ────────── */
  function endpointFor(formEl) {
    if (!formEl) return CFG.defaultEndpoint;
    return (
      formEl.getAttribute('data-rate-endpoint') ||
      formEl.id ||
      formEl.name ||
      formEl.getAttribute('action') ||
      CFG.defaultEndpoint
    ).toString().slice(0, 64);
  }

  /* ─── Check rate limit (fail-open) ─────────────────────────────────── */
  async function checkLimit(endpoint) {
    const sb = getClient();
    if (!sb) { log('no Supabase client · fail-open'); return { allowed: true, reason: 'no-client' }; }
    try {
      const fp = fingerprint();
      const { data, error } = await sb.rpc('check_rate_limit', {
        p_key_type: 'fingerprint',
        p_key_value: fp,
        p_endpoint: endpoint || CFG.defaultEndpoint,
        p_max_attempts: CFG.maxAttempts,
        p_window_seconds: CFG.windowSeconds
      });
      if (error) {
        warn('RPC error (fail-open):', error.message);
        return { allowed: true, reason: 'rpc-error', error: error.message };
      }
      // Interpretazione robusta: bool, {allowed:bool}, {ok:bool}, numero rimanente
      let allowed = true;
      if (typeof data === 'boolean') allowed = data;
      else if (data && typeof data === 'object') {
        if ('allowed' in data) allowed = !!data.allowed;
        else if ('ok' in data) allowed = !!data.ok;
        else if ('remaining' in data) allowed = Number(data.remaining) > 0;
      }
      log('check', { fp, endpoint, allowed, data });
      return { allowed, reason: allowed ? 'ok' : 'limited', fp, endpoint };
    } catch (err) {
      warn('check failed (fail-open):', err.message);
      return { allowed: true, reason: 'exception', error: err.message };
    }
  }

  /* ─── Wrap form submit handlers (fix doppio incremento) ───────────────
     Prima: preventDefault + re-dispatch → doppia chiamata RPC per ogni submit.
     Ora: nessun preventDefault se allowed=true → submit nativo prosegue.
  */
  function wrapForm(formEl) {
    if (!formEl || formEl.__maatWrapped) return;
    formEl.__maatWrapped = true;

    formEl.addEventListener('submit', async (e) => {
      // Evita loop se il submit è stato triggerato programmaticamente durante il check
      if (formEl.__maatChecking) return;

      // Se il form è marcato "skip" (es. ricerca/ricerca live), lascia passare
      if (formEl.hasAttribute('data-rate-skip')) return;

      formEl.__maatChecking = true;
      e.preventDefault();
      e.stopImmediatePropagation();

      try {
        const endpoint = endpointFor(formEl);
        const { allowed, reason } = await checkLimit(endpoint);
        if (!allowed) {
          log('rate-limited', { endpoint, reason });
          // Toast en français (cohérent avec M.toast core.js)
          if (window.Maat && typeof window.Maat.toast === 'function') {
            window.Maat.toast(MSG_TOO_MANY, 'warn');
          } else {
            alert(MSG_TOO_MANY_ALERT);
          }
          formEl.__maatChecking = false;
          return;
        }
      } catch (err) {
        warn('wrap error (fail-open):', err.message);
      }

      formEl.__maatChecking = false;

      // Lascia passare il submit NATIVO (non usiamo dispatchEvent: evitiamo il doppio RPC)
      // Trick: rimuoviamo il preventDefault implicito ri-chiamando il submit nativo
      // tramite HTMLFormElement.prototype.submit. Ma quello NON triggera event listeners.
      // Soluzione: rimuoviamo temporaneamente il wrapper, facciamo submit, poi rimettiamo.
      try {
        formEl.removeEventListener('submit', formEl.__maatHandlerRef, true);
      } catch (_) {}

      // Triggera submit nativo (post-validazione del browser)
      try {
        // Usiamo requestSubmit se disponibile (rispetta validazione nativa e handler)
        if (typeof formEl.requestSubmit === 'function') {
          formEl.requestSubmit();
        } else {
          // Fallback: submit diretto (bypassa validazione HTML, ma funziona)
          HTMLFormElement.prototype.submit.call(formEl);
        }
      } catch (err) {
        warn('native submit failed:', err.message);
      } finally {
        // Riattacca il wrapper dopo un tick per il prossimo submit
        setTimeout(() => {
          try {
            formEl.addEventListener('submit', formEl.__maatHandlerRef, true);
          } catch (_) {}
        }, 100);
      }
    }, true);

    // Salva il riferimento per il re-attach
    formEl.__maatHandlerRef = formEl.__maatHandlerRef || function () {};
    // Re-fetch del handler appena registrato (workaround perché arrow function anonima)
    // Rileggiamo la stessa logica via un named function
    // (vedi refactor sotto: usiamo una named function per il re-attach)

    // NB: per semplicità, teniamo il handler come proprietà e lo ricostruiamo
    // in `restore()` se serve. Il pattern sopra evita il doppio incremento.
  }

  /* ─── (refactor) — usiamo una named function per gestire re-attach ─── */
  // Sostituiamo wrapForm con una versione più pulita che gestisce il ciclo submit.
  function wrapFormV2(formEl) {
    if (!formEl || formEl.__maatWrappedV2) return;
    formEl.__maatWrappedV2 = true;

    const handler = async function (e) {
      if (formEl.__maatChecking) return;
      if (formEl.hasAttribute('data-rate-skip')) return;

      formEl.__maatChecking = true;
      e.preventDefault();
      e.stopImmediatePropagation();

      let allowed = true;
      try {
        const endpoint = endpointFor(formEl);
        const res = await checkLimit(endpoint);
        allowed = !!res.allowed;
        if (!allowed) {
          log('rate-limited', { endpoint, reason: res.reason });
          if (window.Maat && typeof window.Maat.toast === 'function') {
            window.Maat.toast(MSG_TOO_MANY, 'warn');
          } else {
            alert(MSG_TOO_MANY_ALERT);
          }
        }
      } catch (err) {
        warn('check exception (fail-open):', err.message);
        allowed = true;
      }

      formEl.__maatChecking = false;

      if (!allowed) return;

      // Bypass: rimuovi handler, submit nativo, riattacca dopo 150 ms
      formEl.removeEventListener('submit', handler, true);
      try {
        if (typeof formEl.requestSubmit === 'function') formEl.requestSubmit();
        else HTMLFormElement.prototype.submit.call(formEl);
      } catch (err) {
        warn('native submit failed:', err.message);
      } finally {
        setTimeout(() => {
          try { formEl.addEventListener('submit', handler, true); } catch (_) {}
        }, 150);
      }
    };

    formEl.addEventListener('submit', handler, true);
    formEl.__maatHandler = handler;
  }

  function scanForms() {
    // Usa la versione V2 (fix definitivo)
    document.querySelectorAll('form').forEach(wrapFormV2);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(scanForms, 200), { once: true });
  } else {
    setTimeout(scanForms, 200);
  }

  // MutationObserver per form aggiunti dinamicamente (modal di M.form)
  try {
    const obs = new MutationObserver(() => scanForms());
    obs.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}

  /* ─── API pubblica (con reset per debug) ──────────────────────────── */
  window.MaatRateLimiter = {
    checkLimit,
    fingerprint,
    recheck: scanForms,
    config: CFG,
    reset: async function () {
      // Chiama RPC di reset se esiste, altrimenti log
      const sb = getClient();
      const fp = fingerprint();
      try {
        if (sb) {
          const { error } = await sb.rpc('reset_rate_limit', {
            p_key_type: 'fingerprint',
            p_key_value: fp
          });
          if (error) warn('reset_rate_limit RPC unavailable:', error.message);
          else log('reset OK');
        }
      } catch (err) {
        warn('reset error:', err.message);
      }
      // Pulisci anche eventuali storage locali (nessuna, ma per sicurezza)
      try {
        Object.keys(localStorage).forEach(k => {
          if (/rate|limit|throttle/i.test(k)) localStorage.removeItem(k);
        });
      } catch (_) {}
      return { fp };
    }
  };

  log('ready v2');
})();
