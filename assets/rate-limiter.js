/* ==========================================================================
 *  assets/rate-limiter.js
 *  Phase 0 · Anti-spam client-side + RPC check_rate_limit su Supabase
 *  Fail-silent · auto-detect Supabase client
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatRateLimiterLoaded) return;
  window.__MaatRateLimiterLoaded = true;

  const CFG = {
    endpoint: 'form_submit',
    maxAttempts: 5,
    windowSeconds: 600,
  };

  const log  = (...a) => { if (window.__MAAT_DEBUG__) console.log('[rate-limiter]', ...a); };
  const warn = (...a) => console.warn('[rate-limiter]', ...a);

  /* ─── Fingerprint canvas-based ────────────────────────────────────────── */
  function fingerprint() {
    try {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 40;
      const ctx = c.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px "Arial"';
      ctx.fillStyle = '#f60';
      ctx.fillRect(100, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Maat OS · fp · 2026', 2, 15);
      ctx.fillStyle = 'rgba(102,204,0,0.7)';
      ctx.fillText('Industrial Illusion', 4, 17);
      const dataUrl = c.toDataURL();
      // Hash semplice djb2
      let hash = 5381;
      for (let i = 0; i < dataUrl.length; i++) {
        hash = ((hash << 5) + hash) ^ dataUrl.charCodeAt(i);
      }
      const canvasHash = (hash >>> 0).toString(36);

      const ua = (navigator.userAgent || '').slice(0, 80);
      const lang = navigator.language || '';
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';

      return [canvasHash, ua, lang, tz].join('|').slice(0, 200);
    } catch (_) {
      return 'fallback|' + (navigator.userAgent || '').slice(0, 100);
    }
  }

  /* ─── Client Supabase (multi-pattern) ─────────────────────────────────── */
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

  /* ─── Check rate limit ────────────────────────────────────────────────── */
  async function checkLimit() {
    const sb = getClient();
    if (!sb) { log('no Supabase client, skip'); return { allowed: true }; }
    try {
      const fp = fingerprint();
      const { data, error } = await sb.rpc('check_rate_limit', {
        p_key_type: 'fingerprint',
        p_key_value: fp,
        p_endpoint: CFG.endpoint,
        p_max_attempts: CFG.maxAttempts,
        p_window_seconds: CFG.windowSeconds,
      });
      if (error) { warn('RPC error:', error.message); return { allowed: true }; }
      return { allowed: !!data, fp };
    } catch (err) {
      warn('check failed:', err.message);
      return { allowed: true };
    }
  }

  /* ─── Wrap form submit handlers ───────────────────────────────────────── */
  function wrapForm(formEl) {
    if (!formEl || formEl.__maatWrapped) return;
    formEl.__maatWrapped = true;

    formEl.addEventListener('submit', async (e) => {
      // Non blocchiamo l'evento, ma aspettiamo il check prima di lasciarlo andare
      // Se rate-limited, cancelliamo il submit con preventDefault + stopImmediatePropagation
      if (formEl.__maatChecking) return;

      formEl.__maatChecking = true;
      e.preventDefault();
      e.stopImmediatePropagation();

      try {
        const { allowed } = await checkLimit();
        if (!allowed) {
          if (window.Maat && typeof window.Maat.toast === 'function') {
            window.Maat.toast('Troppe richieste. Riprova tra qualche minuto.', 'warn');
          } else {
            alert('Troppe richieste. Riprova tra qualche minuto.');
          }
          formEl.__maatChecking = false;
          return;
        }
      } catch (_) {}

      formEl.__maatChecking = false;

      // Re-dispatch del submit (bypassa il wrapper)
      const evt = new Event('submit', { bubbles: true, cancelable: true });
      formEl.dispatchEvent(evt);
    }, true);  // capture phase
  }

  function scanForms() {
    document.querySelectorAll('form').forEach(wrapForm);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(scanForms, 200), { once: true });
  } else {
    setTimeout(scanForms, 200);
  }

  /* MutationObserver per form aggiunti dinamicamente */
  try {
    const obs = new MutationObserver(() => scanForms());
    obs.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}

  window.MaatRateLimiter = {
    checkLimit,
    fingerprint,
    recheck: scanForms,
  };

  log('ready');
})();
