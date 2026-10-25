/* ==========================================================================
 *  assets/admin-mfa.js
 *  Phase 1 · Security & MFA Super-Admin (REV 2 · orphan-cleanup)
 *  Fix: cleanup fattori unverified + persistenza factorId + challengeAndVerify
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatMfaLoaded) return;
  window.__MaatMfaLoaded = true;

  const CFG = {
    appName: 'Industrial Illusion · Control Tower',
    issuer:  'Maat OS',
    clientWaitMs: 8000,
    recoveryCodeCount: 10,
    pendingKey: 'maat_mfa_pending_enroll',
  };

  const S = {
    client: null,
    factors: [],
    pendingFactorId: null,
    $overlay: null,
    booted: false,
  };

  const log  = (...a) => console.log('[MFA]', ...a);
  const warn = (...a) => console.warn('[MFA]', ...a);

  function getClient() {
    if (S.client) return S.client;
    const cands = [window.Maat && window.Maat.sb, window.maatSupabase,
                   window.supabaseClient, window.sb];
    for (const c of cands) {
      if (c && typeof c.auth === 'object' && c.auth && typeof c.auth.mfa === 'object') {
        S.client = c; return c;
      }
    }
    try {
      if (window.Maat && typeof window.Maat.init === 'function') {
        window.Maat.init();
        if (window.Maat.sb && window.Maat.sb.auth && window.Maat.sb.auth.mfa) {
          S.client = window.Maat.sb; return S.client;
        }
      }
    } catch (_) {}
    return null;
  }

  async function waitForClient(deadline) {
    return new Promise((resolve) => {
      const tick = () => {
        if (getClient()) return resolve(true);
        if (Date.now() > deadline) return resolve(false);
        setTimeout(tick, 200);
      };
      tick();
    });
  }

  function getPendingEnroll() {
    try {
      const raw = sessionStorage.getItem(CFG.pendingKey);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.id || !obj.totp || !obj.totp.secret) return null;
      return obj;
    } catch (_) { return null; }
  }

  function savePendingEnroll(enrollData) {
    try {
      sessionStorage.setItem(CFG.pendingKey, JSON.stringify(enrollData));
    } catch (_) {}
  }

  function clearPendingEnroll() {
    try { sessionStorage.removeItem(CFG.pendingKey); } catch (_) {}
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  async function cleanupOrphanFactors(sb) {
    try {
      const { data, error } = await sb.auth.mfa.listFactors();
      if (error) { warn('listFactors failed:', error.message); return; }

      const all = (data && data.all) || [];
      const orphans = all.filter(f => f.status === 'unverified');
      if (!orphans.length) return;

      log(`Cleaning up ${orphans.length} orphan factor(s)`);
      await Promise.all(orphans.map(f =>
        sb.auth.mfa.unenroll({ factorId: f.id })
          .then(() => log(`Unenrolled orphan ${f.id}`))
          .catch(e => warn(`Failed to unenroll ${f.id}:`, e.message))
      ));
    } catch (e) {
      warn('cleanupOrphanFactors exception:', e.message);
    }
  }

  async function checkState() {
    const sb = getClient();
    if (!sb) return { step: 'no-session' };

    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.user) return { step: 'no-session' };

    const { data: aal, error: aalErr } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalErr) return { step: 'no-session', message: aalErr.message };

    log('AAL:', aal.currentLevel, '→', aal.nextLevel);

    if (aal.currentLevel === 'aal2') return { step: 'ready' };

    const { data: factorsData, error: fErr } = await sb.auth.mfa.listFactors();
    if (fErr) {
      warn('listFactors failed, falling back to session.user.factors');
    }
    const all = (factorsData && factorsData.all)
             || (session.user.factors || []);
    const verified   = all.filter(f => f.status === 'verified');
    const unverified = all.filter(f => f.status === 'unverified');

    if (verified.length > 0) {
      if (unverified.length > 0) {
        warn(`${unverified.length} orphan unverified factor(s) coexisting with verified. ` +
             `Run SQL reset if verification keeps failing.`);
      }
      return { step: 'challenge', factor: verified[0] };
    }

    const pending = getPendingEnroll();
    if (pending) {
      const stillValid = unverified.some(f => f.id === pending.id);
      if (stillValid) {
        log('Resuming pending enrollment:', pending.id);
        return { step: 'enroll', resume: pending };
      }
      log('Pending enrollment is stale on server, discarding');
      clearPendingEnroll();
    }

    return { step: 'enroll', resume: null };
  }

  function ensureOverlay() {
    if (S.$overlay) return S.$overlay;
    const o = document.createElement('div');
    o.id = 'mfa-gate';
    o.className = 'mfa-gate';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.setAttribute('aria-label', 'MFA Super-Admin');
    o.hidden = true;
    document.body.appendChild(o);
    S.$overlay = o;
    return o;
  }

  function showOverlay() {
    const o = ensureOverlay();
    o.hidden = false;
    document.body.classList.add('mfa-locked');
  }

  function hideOverlay() {
    if (S.$overlay) S.$overlay.hidden = true;
    document.body.classList.remove('mfa-locked');
  }

  function clearOverlay() {
    if (S.$overlay) S.$overlay.replaceChildren();
  }

  function appendHeader(card, subtitle) {
    const h = el('div', 'mfa-gate__header');
    h.appendChild(el('div', 'mfa-gate__logo', '⚖'));
    h.appendChild(el('h1', 'mfa-gate__title', 'Maat OS · Control Tower'));
    h.appendChild(el('p', 'mfa-gate__subtitle', subtitle || ''));
    card.appendChild(h);
  }

  async function renderEnroll(state) {
    const sb = getClient();
    clearOverlay();
    showOverlay();

    const card = el('div', 'mfa-gate__card');
    appendHeader(card, state && state.resume
      ? 'Ripresa configurazione MFA'
      : 'Configurazione Autenticazione a Due Fattori');

    card.appendChild(el('p', 'mfa-gate__text',
      'Prima di accedere alla Control Tower devi attivare MFA TOTP con Google Authenticator, Authy o 1Password.'));

    const body = el('div', 'mfa-gate__body');
    body.appendChild(el('p', 'mfa-gate__text mfa-gate__text--dim', 'Preparazione…'));
    card.appendChild(body);
    S.$overlay.appendChild(card);

    let enroll;
    if (state && state.resume) {
      enroll = state.resume;
      log('Using resumed enrollment:', enroll.id);
    } else {
      await cleanupOrphanFactors(sb);

      try {
        const { data, error } = await sb.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: CFG.appName,
          issuer: CFG.issuer,
        });
        if (error) throw error;
        enroll = data;
        savePendingEnroll(enroll);
        log('New enrollment ID:', enroll.id);
      } catch (err) {
        console.error('[MFA] enroll failed:', err);
        body.replaceChildren();
        body.appendChild(el('p', 'mfa-gate__err', 'Errore: ' + (err.message || err)));
        return;
      }
    }

    S.pendingFactorId = enroll.id;

    body.replaceChildren();

    const qr = el('div', 'mfa-gate__qr');
    qr.innerHTML = enroll.totp.qr_code;
    body.appendChild(qr);

    const secretBox = el('div', 'mfa-gate__secret');
    secretBox.appendChild(el('span', 'mfa-gate__secret-label', 'Chiave manuale:'));
    secretBox.appendChild(el('code', 'mfa-gate__secret-code', enroll.totp.secret));

    const copySecretBtn = el('button', 'mfa-gate__link', '📋 Copia chiave');
    copySecretBtn.type = 'button';
    copySecretBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(enroll.totp.secret).then(
        () => { copySecretBtn.textContent = '✓ Copiata'; setTimeout(() => {
          copySecretBtn.textContent = '📋 Copia chiave'; }, 2000); },
        () => alert('Copia manuale: ' + enroll.totp.secret)
      );
    });
    secretBox.appendChild(copySecretBtn);
    body.appendChild(secretBox);

    const form = el('form', 'mfa-gate__form');
    const input = el('input', 'mfa-gate__input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 6;
    input.placeholder = '000000';
    input.autocomplete = 'one-time-code';
    input.pattern = '\\d{6}';
    input.required = true;
    form.appendChild(input);

    const btn = el('button', 'mfa-gate__btn', 'Verifica e attiva');
    btn.type = 'submit';
    form.appendChild(btn);

    const errBox = el('p', 'mfa-gate__err');
    errBox.hidden = true;
    form.appendChild(errBox);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.hidden = true;
      const raw = input.value || '';
      const cleanCode = raw.replace(/\s+/g, '');
      if (!/^\d{6}$/.test(cleanCode)) {
        errBox.textContent = 'Inserisci un codice di 6 cifre';
        errBox.hidden = false;
        return;
      }
      log('Code submitted for factor:', enroll.id);

      btn.disabled = true;
      btn.textContent = 'Verifica…';

      try {
        const { data, error } = await sb.auth.mfa.challengeAndVerify({
          factorId: enroll.id,
          code: cleanCode,
        });
        if (error) {
          console.error('[MFA] verify error:', error);
          throw error;
        }
        log('Verify OK. Session AAL2 active.');

        clearPendingEnroll();

        const { data: codes, error: codesErr } =
          await sb.rpc('admin_generate_recovery_codes', { p_count: CFG.recoveryCodeCount });

        if (codesErr) {
          console.error('[MFA] recovery codes generation failed:', codesErr);
          alert('MFA attivato, ma la generazione dei codici di recupero è fallita.\n' +
                'Errore: ' + codesErr.message +
                '\n\nLa pagina verrà ricaricata.');
          window.location.reload();
          return;
        }

        renderRecoveryCodes(codes);
      } catch (err) {
        console.error('[MFA] enrollment verify failed:', err);
        btn.disabled = false;
        btn.textContent = 'Verifica e attiva';
        input.value = '';
        input.focus();
        errBox.textContent = 'Codice non valido: ' + (err.message || err);
        errBox.hidden = false;
      }
    });

    body.appendChild(form);
    setTimeout(() => input.focus(), 150);
  }

  function renderRecoveryCodes(codes) {
    clearOverlay();
    const card = el('div', 'mfa-gate__card');
    appendHeader(card, 'Codici di Recupero · Salva Subito');

    card.appendChild(el('p', 'mfa-gate__text',
      'Questi 10 codici ti permettono di recuperare l\'accesso se perdi il telefono. ' +
      'Ogni codice è monouso. Salvali in un posto sicuro.'));

    const grid = el('div', 'mfa-gate__codes');
    codes.forEach(c => grid.appendChild(el('code', 'mfa-gate__code', c)));
    card.appendChild(grid);

    const copyBtn = el('button', 'mfa-gate__btn mfa-gate__btn--ghost', '📋 Copia tutti');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(codes.join('\n')).then(
        () => { copyBtn.textContent = '✓ Copiati'; setTimeout(() =>
          copyBtn.textContent = '📋 Copia tutti', 2000); },
        () => alert('Copia manuale: seleziona e copia i codici')
      );
    });
    card.appendChild(copyBtn);

    const doneBtn = el('button', 'mfa-gate__btn', 'Li ho salvati, continua →');
    doneBtn.type = 'button';
    doneBtn.addEventListener('click', () => {
      doneBtn.disabled = true;
      doneBtn.textContent = 'Ricaricamento…';
      setTimeout(() => window.location.reload(), 200);
    });
    card.appendChild(doneBtn);

    S.$overlay.appendChild(card);
  }

  function renderChallenge(factor) {
    clearOverlay();
    showOverlay();
    const card = el('div', 'mfa-gate__card');
    appendHeader(card, 'Verifica MFA · Inserisci codice');

    const body = el('div', 'mfa-gate__body');
    body.appendChild(el('p', 'mfa-gate__text',
      'Apri l\'app Authenticator e inserisci il codice a 6 cifre.'));

    const form = el('form', 'mfa-gate__form');
    const input = el('input', 'mfa-gate__input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 6;
    input.placeholder = '000000';
    input.autocomplete = 'one-time-code';
    input.pattern = '\\d{6}';
    input.required = true;
    form.appendChild(input);

    const btn = el('button', 'mfa-gate__btn', 'Verifica');
    btn.type = 'submit';
    form.appendChild(btn);

    const errBox = el('p', 'mfa-gate__err');
    errBox.hidden = true;
    form.appendChild(errBox);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.hidden = true;
      const cleanCode = (input.value || '').replace(/\s+/g, '');
      if (!/^\d{6}$/.test(cleanCode)) {
        errBox.textContent = 'Inserisci un codice di 6 cifre';
        errBox.hidden = false;
        return;
      }
      log('Daily login · code submitted for factor:', factor.id);

      btn.disabled = true;
      btn.textContent = 'Verifica…';

      try {
        const sb = getClient();
        const { data, error } = await sb.auth.mfa.challengeAndVerify({
          factorId: factor.id,
          code: cleanCode,
        });
        if (error) throw error;
        log('Daily login OK. AAL2.');
        hideOverlay();
        window.location.reload();
      } catch (err) {
        console.error('[MFA] challenge failed:', err);
        btn.disabled = false;
        btn.textContent = 'Verifica';
        input.value = '';
        input.focus();
        errBox.textContent = 'Codice non valido. Riprova.';
        errBox.hidden = false;
      }
    });
    body.appendChild(form);

    const recLink = el('button', 'mfa-gate__link',
      'Ho perso il telefono · usa codice di recupero');
    recLink.type = 'button';
    recLink.addEventListener('click', () => renderRecovery(factor));
    body.appendChild(recLink);

    card.appendChild(body);
    S.$overlay.appendChild(card);
    setTimeout(() => input.focus(), 100);
  }

  function renderRecovery(factor) {
    clearOverlay();
    const card = el('div', 'mfa-gate__card');
    appendHeader(card, 'Recupero Accesso · Codice Monouso');

    const body = el('div', 'mfa-gate__body');
    body.appendChild(el('p', 'mfa-gate__text',
      'Inserisci uno dei 10 codici di recupero salvati. ' +
      'Dopo il recupero dovrai ri-configurare l\'app Authenticator.'));

    const form = el('form', 'mfa-gate__form');
    const input = el('input', 'mfa-gate__input mfa-gate__input--wide');
    input.type = 'text';
    input.placeholder = 'XXXX-XXXX-XXXX-XXXX';
    input.autocomplete = 'one-time-code';
    input.required = true;
    form.appendChild(input);

    const btn = el('button', 'mfa-gate__btn', 'Verifica codice');
    btn.type = 'submit';
    form.appendChild(btn);

    const errBox = el('p', 'mfa-gate__err');
    errBox.hidden = true;
    form.appendChild(errBox);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.hidden = true;
      const code = (input.value || '').trim();
      if (code.length < 10) {
        errBox.textContent = 'Codice non valido';
        errBox.hidden = false;
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Verifica…';
      try {
        const sb = getClient();
        const { data: ok, error } = await sb.rpc(
          'admin_consume_recovery_code', { p_code: code });
        if (error) throw error;
        if (!ok) throw new Error('Codice non riconosciuto o già usato');

        if (factor) {
          try { await sb.auth.mfa.unenroll({ factorId: factor.id }); } catch (_) {}
        }
        alert('Codice valido. Verrai reindirizzato alla configurazione di un nuovo Authenticator.');
        window.location.reload();
      } catch (err) {
        console.error('[MFA] recovery failed:', err);
        btn.disabled = false;
        btn.textContent = 'Verifica codice';
        input.value = '';
        input.focus();
        errBox.textContent = 'Errore: ' + (err.message || err);
        errBox.hidden = false;
      }
    });
    body.appendChild(form);

    const backLink = el('button', 'mfa-gate__link', '← Torna al codice TOTP');
    backLink.type = 'button';
    backLink.addEventListener('click', () => renderChallenge(factor));
    body.appendChild(backLink);

    card.appendChild(body);
    S.$overlay.appendChild(card);
    setTimeout(() => input.focus(), 100);
  }

  async function init() {
    if (S.booted) return;
    const ready = await waitForClient(Date.now() + CFG.clientWaitMs);
    if (!ready) { warn('client Supabase assente — MFA gate in standby'); return; }
    S.booted = true;

    const state = await checkState();
    log('boot state:', state.step);

    switch (state.step) {
      case 'no-session': return;
      case 'ready':      hideOverlay(); return;
      case 'enroll':     await renderEnroll(state); return;
      case 'challenge':  renderChallenge(state.factor); return;
    }
  }

  window.MaatMfa = {
    init,
    recheck: async () => { S.booted = false; await init(); },
    reset: () => { clearPendingEnroll(); window.location.reload(); },
    get step() { return S.factors.length ? 'challenge' : 'enroll'; },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else { init(); }
})();
