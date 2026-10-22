/* ==========================================================================
 *  assets/admin-mfa.js
 *  Phase 1 · Security & MFA Super-Admin
 *  Gate TOTP + recovery codes · Supabase Auth MFA
 *  Stati: no-session | enroll | challenge | recovery | ready
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
  };

  const S = {
    client: null,
    step: null,
    factors: [],
    pendingFactorId: null,
    $overlay: null,
    booted: false,
  };

  const log  = (...a) => { if (window.__MAAT_DEBUG__) console.log('[mfa]', ...a); };
  const warn = (...a) => console.warn('[mfa]', ...a);

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

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
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

  async function checkState() {
    const sb = getClient();
    if (!sb) return { step: 'no-session', message: 'Client Supabase non disponibile' };

    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.user) return { step: 'no-session' };

    const { data: aal, error: aalErr } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalErr) return { step: 'no-session', message: aalErr.message };

    const factors = (session.user.factors || []).filter(f => f.status === 'verified');

    if (aal.currentLevel === 'aal2') return { step: 'ready', factors };
    if (factors.length === 0)       return { step: 'enroll',  factors: [] };
    return { step: 'challenge', factors };
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
    const logo = el('div', 'mfa-gate__logo', '⚖');
    h.appendChild(logo);
    h.appendChild(el('h1', 'mfa-gate__title', 'Maat OS · Control Tower'));
    h.appendChild(el('p', 'mfa-gate__subtitle', subtitle || ''));
    card.appendChild(h);
  }

  async function renderEnroll() {
    const sb = getClient();
    clearOverlay();
    showOverlay();
    const card = el('div', 'mfa-gate__card');
    appendHeader(card, 'Configurazione Autenticazione a Due Fattori');

    card.appendChild(el('p', 'mfa-gate__text',
      'Prima di accedere alla Control Tower devi attivare MFA TOTP con Google Authenticator, Authy o 1Password.'));

    const body = el('div', 'mfa-gate__body');
    body.appendChild(el('p', 'mfa-gate__text mfa-gate__text--dim', 'Generazione QR…'));
    card.appendChild(body);
    S.$overlay.appendChild(card);

    let enroll;
    try {
      const { data, error } = await sb.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: CFG.appName,
        issuer: CFG.issuer,
      });
      if (error) throw error;
      enroll = data;
      S.pendingFactorId = data.id;
    } catch (err) {
      body.replaceChildren();
      body.appendChild(el('p', 'mfa-gate__err', 'Errore: ' + (err.message || err)));
      return;
    }

    body.replaceChildren();
    const qr = el('div', 'mfa-gate__qr');
    qr.innerHTML = enroll.totp.qr_code;
    body.appendChild(qr);

    const secretBox = el('div', 'mfa-gate__secret');
    secretBox.appendChild(el('span', 'mfa-gate__secret-label', 'Chiave manuale:'));
    const code = el('code', 'mfa-gate__secret-code', enroll.totp.secret);
    secretBox.appendChild(code);
    body.appendChild(secretBox);

    const form = el('form', 'mfa-gate__form');
    const input = el('input', 'mfa-gate__input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 6;
    input.placeholder = '000000';
    input.autocomplete = 'one-time-code';
    input.required = true;
    form.appendChild(input);

    const btn = el('button', 'mfa-gate__btn', 'Verifica e attiva');
    btn.type = 'submit';
    form.appendChild(btn);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = input.value.trim();
      if (!/^\d{6}$/.test(code)) {
        alert('Inserisci un codice di 6 cifre');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Verifica…';
      try {
        const { data: ch, error: cerr } = await sb.auth.mfa.challenge({
          factorId: S.pendingFactorId,
        });
        if (cerr) throw cerr;
        const { error: verr } = await sb.auth.mfa.verify({
          factorId: S.pendingFactorId,
          challengeId: ch.id,
          code,
        });
        if (verr) throw verr;

        const { data: codes, error: codesErr } = await sb.rpc(
          'admin_generate_recovery_codes', { p_count: CFG.recoveryCodeCount });
        if (codesErr) throw codesErr;

        renderRecoveryCodes(codes);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Verifica e attiva';
        alert('Codice non valido: ' + (err.message || err));
      }
    });
    body.appendChild(form);

    S.$overlay.appendChild(card);
  }

  function renderRecoveryCodes(codes) {
    clearOverlay();
    const card = el('div', 'mfa-gate__card');
    appendHeader(card, 'Codici di Recupero · Salva Subito');

    card.appendChild(el('p', 'mfa-gate__text',
      'Questi 10 codici ti permettono di recuperare l\'accesso se perdi il telefono. ' +
      'Ogni codice è monouso. Salvali in un posto sicuro (stampati o password manager).'));

    const grid = el('div', 'mfa-gate__codes');
    codes.forEach(c => grid.appendChild(el('code', 'mfa-gate__code', c)));
    card.appendChild(grid);

    const copyBtn = el('button', 'mfa-gate__btn mfa-gate__btn--ghost', '📋 Copia tutti');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(codes.join('\n')).then(
        () => { copyBtn.textContent = '✓ Copiati'; setTimeout(() => copyBtn.textContent = '📋 Copia tutti', 2000); },
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

  function renderChallenge() {
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
    input.required = true;
    form.appendChild(input);

    const btn = el('button', 'mfa-gate__btn', 'Verifica');
    btn.type = 'submit';
    form.appendChild(btn);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = input.value.trim();
      if (!/^\d{6}$/.test(code)) { alert('Codice non valido'); return; }
      btn.disabled = true;
      btn.textContent = 'Verifica…';
      try {
        const sb = getClient();
        const factor = S.factors[0];
        const { data: ch, error: cerr } = await sb.auth.mfa.challenge({ factorId: factor.id });
        if (cerr) throw cerr;
        const { error: verr } = await sb.auth.mfa.verify({
          factorId: factor.id,
          challengeId: ch.id,
          code,
        });
        if (verr) throw verr;
        hideOverlay();
        window.location.reload();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Verifica';
        input.value = '';
        alert('Codice non valido');
      }
    });
    body.appendChild(form);

    const recLink = el('button', 'mfa-gate__link', 'Ho perso il telefono · usa codice di recupero');
    recLink.type = 'button';
    recLink.addEventListener('click', () => renderRecovery());
    body.appendChild(recLink);

    card.appendChild(body);
    S.$overlay.appendChild(card);
    setTimeout(() => input.focus(), 100);
  }

  function renderRecovery() {
    clearOverlay();
    const card = el('div', 'mfa-gate__card');
    appendHeader(card, 'Recupero Accesso · Codice Monouso');

    const body = el('div', 'mfa-gate__body');
    body.appendChild(el('p', 'mfa-gate__text',
      'Inserisci uno dei 10 codici di recupero salvati durante l\'attivazione. ' +
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

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = input.value.trim();
      if (code.length < 10) { alert('Codice non valido'); return; }
      btn.disabled = true;
      btn.textContent = 'Verifica…';
      try {
        const sb = getClient();
        const { data: ok, error } = await sb.rpc(
          'admin_consume_recovery_code', { p_code: code });
        if (error) throw error;
        if (!ok) throw new Error('Codice non riconosciuto o già usato');

        const factor = S.factors[0];
        if (factor) {
          await sb.auth.mfa.unenroll({ factorId: factor.id });
        }
        alert('Codice valido. Verrai reindirizzato alla configurazione di un nuovo Authenticator.');
        window.location.reload();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Verifica codice';
        input.value = '';
        alert('Errore: ' + (err.message || err));
      }
    });
    body.appendChild(form);

    const backLink = el('button', 'mfa-gate__link', '← Torna al codice TOTP');
    backLink.type = 'button';
    backLink.addEventListener('click', () => renderChallenge());
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
    log('state', state.step);
    S.factors = state.factors || [];

    switch (state.step) {
      case 'no-session': return;
      case 'ready':      hideOverlay(); return;
      case 'enroll':     await renderEnroll(); return;
      case 'challenge':  renderChallenge(); return;
    }
  }

  window.MaatMfa = {
    init,
    recheck: async () => { S.booted = false; await init(); },
    get step() { return S.step; },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else { init(); }
})();
