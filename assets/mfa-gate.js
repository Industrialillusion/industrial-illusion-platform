/* ============================================================
   assets/mfa-gate.js v3.1 — security-first MFA gate
   ------------------------------------------------------------
   v3.1 vs v3.0:
   - QR rendering 100% corrigé : SVG inline + 240px + padding 16px
     (les 3 marqueurs du QR ne sont plus coupés par le border-radius)
   - shape-rendering="crispEdges" pour un rendu net au premier scan
   - Secret manuel formaté en groupes de 4 + bouton Copier
   - Fallback complet si le scan échoue (saisie manuelle)
   - Rendu identique pour le QR backup
   - Style unifié avec la charte PurKemet (accent vert + or)

   Conservé de v3.0 :
   - AUCUN safety timeout (pas de bypass MFA après X secondes)
   - Modal plein écran OPAQUE (bloque toute interaction)
   - Erreurs dans le modal avec Retry / Logout
   - Retry 5s pour init Supabase
   - Cleanup facteurs "PurKemet*" unverified avant enroll

   ⚠️ dashboard.js DOIT await window.MfaGate.done avant de charger les données.
   ============================================================ */
(function () {
  'use strict';

  window.MfaGate = window.MfaGate || {};
  let _resolve;
  let _resolved = false;

  window.MfaGate.done = new Promise((res) => {
    _resolve = (val) => { if (!_resolved) { _resolved = true; res(val); } };
  });

  function log(...args) { console.log('[MFA]', ...args); }

  function getSb() {
    return (window.Maat && window.Maat.sb) || window.supabaseClient;
  }

  async function waitForSb(maxMs) {
    maxMs = maxMs || 5000;
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const sb = getSb();
      if (sb && sb.auth && sb.auth.mfa) return sb;
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  }

  function toast(msg, kind) {
    if (window.Maat && typeof window.Maat.toast === 'function') {
      window.Maat.toast(msg, kind || 'ok');
    } else {
      console.log('[MFA]', msg);
    }
  }

  function lockBody() {
    try {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } catch (e) {}
  }
  function unlockBody() {
    try {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════════════
     QR RENDERING — le point critique de v3.1
     ═══════════════════════════════════════════════════════════════
     On décode le data URI SVG renvoyé par Supabase et on l'injecte
     INLINE dans le DOM (pas dans un <img>) pour garantir :
       - dimensions exactes (240px)
       - shape-rendering="crispEdges" → modules nets, pas d'antialiasing
       - pas de troncature aux coins par border-radius
     Le conteneur blanc DOIT avoir un padding >= 16px pour que les
     3 marqueurs du QR (position detection patterns) restent dans
     une zone rectangulaire et ne soient pas rognés.
  */
  function renderQrCode(qrCodeDataUri, size) {
    size = size || 240;
    if (!qrCodeDataUri) return '<p style="color:#f87171;font-size:.72rem;text-align:center;padding:1rem;">QR indisponible — utilisez le secret manuel ci-dessous.</p>';

    if (typeof qrCodeDataUri === 'string' && qrCodeDataUri.indexOf('data:image/svg+xml') === 0) {
      const comma = qrCodeDataUri.indexOf(',');
      let svg = qrCodeDataUri.substring(comma + 1);

      // Décoder seulement si nécessaire (certains environnements renvoient <svg direct, d'autres %3Csvg)
      if (svg.trim().charAt(0) !== '<') {
        try { svg = decodeURIComponent(svg); } catch (e) { /* laisser tel quel */ }
      }

      // Forcer width/height explicites + crispEdges sur la balise <svg>
      svg = svg.replace(/<svg\b([^>]*)>/i, function (_match, attrs) {
        attrs = attrs
          .replace(/\swidth="[^"]*"/gi, '')
          .replace(/\sheight="[^"]*"/gi, '')
          .replace(/\sstyle="[^"]*"/gi, '');
        return '<svg' + attrs +
          ' width="' + size + '"' +
          ' height="' + size + '"' +
          ' shape-rendering="crispEdges"' +
          ' xmlns="http://www.w3.org/2000/svg">';
      });

      return '<div style="width:' + size + 'px;height:' + size + 'px;max-width:100%;line-height:0;display:block;overflow:hidden;">' + svg + '</div>';
    }

    // Fallback si jamais Supabase renvoie un PNG ou une autre forme
    return '<img src="' + qrCodeDataUri + '" width="' + size + '" height="' + size + '" alt="QR MFA" style="display:block;image-rendering:pixelated;max-width:100%;height:auto;">';
  }

  /* Formate le secret TOTP en groupes de 4 pour lisibilité manuelle */
  function formatSecret(secret) {
    if (!secret) return '';
    return String(secret).replace(/(.{4})/g, '$1 ').trim();
  }

  /* ═══════════════════════════════════════════════════════════════
     MODAL
  */
  function createModal() {
    const existing = document.getElementById('mfa-gate-overlay');
    if (existing) existing.remove();

    const ov = document.createElement('div');
    ov.id = 'mfa-gate-overlay';
    ov.setAttribute('style', [
      'position: fixed',
      'top: 0','left: 0','right: 0','bottom: 0',
      'z-index: 2147483647',
      'background: #0A0D10',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'padding: 1rem',
      'font-family: "JetBrains Mono", monospace',
      'overflow-y: auto',
      'pointer-events: auto'
    ].map(s => s + ' !important;').join(' '));

    ov.innerHTML = `
      <div style="width:100%;max-width:28rem;margin:auto;background:linear-gradient(165deg,#131920,#090D10);border:1px solid rgba(0,255,163,.45);border-radius:1.25rem;padding:1.75rem 1.5rem;color:#F1F5F9;box-shadow:0 30px 70px -15px rgba(0,0,0,.9),0 0 60px -20px rgba(0,255,163,.3);pointer-events:auto;">
        <div style="text-align:center;margin-bottom:1.25rem;">
          <div style="font-size:1.75rem;margin-bottom:.25rem;">🛡️</div>
          <div style="font-size:.62rem;letter-spacing:.22em;text-transform:uppercase;color:#00FFA3;font-weight:800;">PurKemet · Sécurité Renforcée</div>
          <h2 id="mfa-title" style="font-size:1.05rem;font-weight:900;color:#fff;margin-top:.35rem;">Vérification en deux étapes</h2>
          <p id="mfa-subtitle" style="font-size:.72rem;color:#94A3B8;margin-top:.35rem;"></p>
        </div>
        <div id="mfa-body" style="pointer-events:auto;"></div>
        <p id="mfa-err" style="font-size:.72rem;color:#f87171;font-weight:700;text-align:center;min-height:1.2rem;margin-top:.75rem;"></p>
        <button id="mfa-logout-global" type="button" style="width:100%;margin-top:.5rem;padding:.5rem;background:none;border:none;color:#64748B;font-size:.65rem;cursor:pointer;text-decoration:underline;">Se déconnecter et revenir à l'accueil</button>
      </div>`;
    document.body.appendChild(ov);
    lockBody();

    ov.querySelector('#mfa-logout-global').addEventListener('click', async () => {
      const sb = getSb();
      try { if (sb) await sb.auth.signOut(); } catch (e) {}
      window.location.href = 'index.html';
    });
    return ov;
  }

  function removeModal(ov) {
    if (ov && ov.parentNode) ov.remove();
    unlockBody();
  }

  function showFatal(ov, message) {
    ov.querySelector('#mfa-subtitle').textContent = 'Erreur';
    ov.querySelector('#mfa-body').innerHTML = `
      <p style="text-align:center;color:#f87171;font-size:.78rem;padding:1rem;line-height:1.5;">${message || 'Impossible de vérifier la sécurité. Reconnectez-vous.'}</p>
      <button id="mfa-fatal-retry" type="button" style="width:100%;margin-top:.5rem;padding:.8rem;border-radius:.65rem;background:rgba(0,255,163,.15);border:1px solid rgba(0,255,163,.5);color:#00FFA3;font-weight:800;font-size:.72rem;cursor:pointer;">↻ Réessayer</button>
    `;
    ov.querySelector('#mfa-fatal-retry').addEventListener('click', () => {
      removeModal(ov);
      boot();
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     CLEANUP + ENROLL
  */
  async function cleanupUnverifiedFactors(sb) {
    try {
      const { data, error } = await sb.auth.mfa.listFactors();
      if (error) return { removed: 0, verified: null };
      const allTotp = (data && data.totp) || [];
      const verified = allTotp.find(f => f.status === 'verified' && (f.friendly_name || '').startsWith('PurKemet'));
      const unverified = allTotp.filter(f => f.status === 'unverified' && (f.friendly_name || '').startsWith('PurKemet'));
      let removed = 0;
      for (const f of unverified) {
        try { const u = await sb.auth.mfa.unenroll({ factorId: f.id }); if (!u.error) removed++; } catch (e) {}
      }
      return { removed, verified };
    } catch (e) { return { removed: 0, verified: null }; }
  }

  async function safeEnroll(sb, friendlyName) {
    let res = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName });
    if (!res.error) return res;
    const msg = (res.error.message || '').toLowerCase();
    if (msg.indexOf('friendly name') !== -1 && msg.indexOf('already exists') !== -1) {
      return sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: friendlyName + '-' + Date.now() });
    }
    return res;
  }

  /* Bloc QR réutilisable (enroll + backup) — layout premium */
  function qrBlockHtml(qrCodeDataUri, secret) {
    const qrHtml = renderQrCode(qrCodeDataUri, 240);
    const secretFormatted = formatSecret(secret);
    return `
      <!-- QR dans conteneur blanc avec padding : les 3 marqueurs restent intacts -->
      <div style="display:flex;justify-content:center;margin-bottom:1rem;">
        <div style="display:inline-block;background:#FFFFFF;padding:16px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.55),0 0 0 2px rgba(0,255,163,.35);line-height:0;">
          ${qrHtml}
        </div>
      </div>

      <!-- Secret manuel en fallback -->
      <div style="background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.08);border-radius:.65rem;padding:.75rem .85rem;margin-bottom:.9rem;">
        <div style="font-size:.55rem;color:#64748B;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.4rem;">Ou saisissez manuellement le secret</div>
        <div style="display:flex;gap:.4rem;align-items:center;">
          <code id="mfa-secret" style="flex:1;min-width:0;font-family:'JetBrains Mono',monospace;font-size:.7rem;color:#00FFA3;word-break:break-all;line-height:1.55;letter-spacing:.06em;">${secretFormatted}</code>
          <button id="mfa-copy-secret" type="button" style="flex-shrink:0;padding:.45rem .65rem;border-radius:.45rem;background:rgba(0,255,163,.1);border:1px solid rgba(0,255,163,.35);color:#00FFA3;font-size:.6rem;font-weight:700;cursor:pointer;white-space:nowrap;transition:all .2s;">📋 Copier</button>
        </div>
      </div>
    `;
  }

  /* Branche le bouton "Copier le secret" (à appeler après injection) */
  function bindCopySecret(ov, rawSecret) {
    const copyBtn = ov.querySelector('#mfa-copy-secret');
    if (!copyBtn) return;
    copyBtn.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(rawSecret);
        } else {
          // Fallback : sélection manuelle
          const range = document.createRange();
          range.selectNodeContents(ov.querySelector('#mfa-secret'));
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range);
          document.execCommand('copy');
        }
        copyBtn.textContent = '✓ Copié';
        copyBtn.style.background = 'rgba(0,255,163,.25)';
        setTimeout(() => { copyBtn.textContent = '📋 Copier'; copyBtn.style.background = ''; }, 1600);
      } catch (e) {
        copyBtn.textContent = 'Ctrl+C';
        const range = document.createRange();
        range.selectNodeContents(ov.querySelector('#mfa-secret'));
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      }
    });
  }

  async function renderEnroll(ov, sb) {
    const subtitle = ov.querySelector('#mfa-subtitle');
    const errEl = ov.querySelector('#mfa-err');
    const body = ov.querySelector('#mfa-body');

    subtitle.textContent = 'Première connexion : configurez votre double authentification.';
    errEl.textContent = '';
    body.innerHTML = '<p style="text-align:center;color:#94A3B8;font-size:.75rem;padding:1rem;">Préparation de l\'enrôlement…</p>';

    const { verified } = await cleanupUnverifiedFactors(sb);
    if (verified) return renderVerify(ov, sb, verified.id);

    const { data, error } = await safeEnroll(sb, 'PurKemet');

    if (error) {
      log('enroll fatal error:', error.message);
      body.innerHTML = `
        <p style="text-align:center;color:#f87171;font-size:.72rem;margin-bottom:.75rem;">Impossible de générer le QR code.</p>
        <button id="mfa-retry" type="button" style="width:100%;padding:.8rem;border-radius:.65rem;background:rgba(0,255,163,.15);border:1px solid rgba(0,255,163,.5);color:#00FFA3;font-weight:800;font-size:.72rem;cursor:pointer;">↻ Réessayer</button>
      `;
      body.querySelector('#mfa-retry').addEventListener('click', () => renderEnroll(ov, sb));
      return;
    }

    const { id, totp } = data;

    body.innerHTML = `
      <p style="font-size:.72rem;color:#94A3B8;margin-bottom:1rem;text-align:center;line-height:1.55;">
        Scannez ce QR code avec <strong style="color:#fff;">Google Authenticator</strong>, puis saisissez le code à 6 chiffres.
      </p>

      ${qrBlockHtml(totp.qr_code, totp.secret)}

      <label style="display:block;font-size:.6rem;color:#64748B;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.35rem;">Code à 6 chiffres</label>
      <input id="mfa-code" type="text" inputmode="numeric" maxlength="6" placeholder="123456" autocomplete="one-time-code"
        style="width:100%;padding:.75rem;text-align:center;font-size:1.25rem;letter-spacing:.4em;background:#0F1419;border:1px solid #334155;border-radius:.65rem;color:#fff;outline:none;font-family:'JetBrains Mono',monospace;font-weight:700;transition:border-color .2s,box-shadow .2s;">

      <button id="mfa-submit" type="button" style="width:100%;margin-top:.9rem;padding:.85rem;border-radius:.65rem;background:linear-gradient(135deg,#00C77E,#059669);color:#000;font-weight:900;font-size:.75rem;letter-spacing:.05em;text-transform:uppercase;border:none;cursor:pointer;">✓ Activer</button>
      <button id="mfa-backup" type="button" style="width:100%;margin-top:.5rem;padding:.6rem;border-radius:.65rem;background:rgba(0,255,163,.08);border:1px solid rgba(0,255,163,.35);color:#00FFA3;font-weight:700;font-size:.68rem;cursor:pointer;">➕ Ajouter un facteur de secours (optionnel)</button>
    `;

    const codeInp = body.querySelector('#mfa-code');
    const submit = body.querySelector('#mfa-submit');
    const backup = body.querySelector('#mfa-backup');
    codeInp.focus();

    // Focus glow sur input
    codeInp.addEventListener('focus', () => { codeInp.style.borderColor = '#00FFA3'; codeInp.style.boxShadow = '0 0 0 3px rgba(0,255,163,.15)'; });
    codeInp.addEventListener('blur',  () => { codeInp.style.borderColor = '#334155'; codeInp.style.boxShadow = 'none'; });
    // Force numérique
    codeInp.addEventListener('input', () => { codeInp.value = codeInp.value.replace(/\D/g, '').slice(0, 6); });

    // Bouton copier secret
    bindCopySecret(ov, totp.secret);

    const verify = async () => {
      const code = codeInp.value.replace(/\D/g, '');
      if (code.length !== 6) { errEl.textContent = 'Code à 6 chiffres requis.'; return; }
      errEl.textContent = '';
      submit.disabled = true; submit.textContent = 'Vérification…';
      try {
        const ch = await sb.auth.mfa.challenge({ factorId: id });
        if (ch.error) throw ch.error;
        const v = await sb.auth.mfa.verify({ factorId: id, challengeId: ch.data.id, code });
        if (v.error) throw v.error;
        toast('✅ MFA activé. Votre compte est sécurisé.');
        await markMfaEnabled();
        removeModal(ov);
        _resolve(true);
      } catch (e) {
        log('verify error:', e.message || e);
        errEl.textContent = 'Code invalide. Réessayez.';
        submit.disabled = false; submit.textContent = '✓ Activer';
        codeInp.select();
      }
    };

    submit.addEventListener('click', verify);
    codeInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') verify(); });
    backup.addEventListener('click', () => renderBackup(ov, sb));
  }

  /* ═══════════════════════════════════════════════════════════════
     BACKUP FACTOR — même qualité de rendu QR
  */
  async function renderBackup(ov, sb) {
    const body = ov.querySelector('#mfa-body');
    const errEl = ov.querySelector('#mfa-err');
    ov.querySelector('#mfa-subtitle').textContent = 'Facteur de secours';
    body.innerHTML = '<p style="text-align:center;color:#00FFA3;font-size:.75rem;padding:1rem;">Génération du facteur de secours…</p>';

    const uniqueName = 'PurKemet-Backup-' + Date.now();
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: uniqueName });

    if (error) {
      errEl.textContent = 'Backup indisponible : ' + (error.message || 'réessayez plus tard.');
      body.innerHTML = `
        <p style="text-align:center;color:#94A3B8;font-size:.72rem;padding:.5rem;">Le facteur principal reste actif. Vous pouvez ignorer le backup.</p>
        <button id="mfa-backup-skip" type="button" style="width:100%;margin-top:.75rem;padding:.7rem;border-radius:.65rem;background:rgba(0,255,163,.15);border:1px solid rgba(0,255,163,.5);color:#00FFA3;font-weight:800;font-size:.72rem;cursor:pointer;">Continuer sans backup</button>
      `;
      body.querySelector('#mfa-backup-skip').addEventListener('click', () => { removeModal(ov); _resolve(true); });
      return;
    }

    const b = data.totp;
    errEl.textContent = '';

    body.innerHTML = `
      <p style="font-size:.72rem;color:#94A3B8;margin-bottom:1rem;text-align:center;line-height:1.55;">
        Scannez avec un <strong style="color:#fff;">second appareil</strong> ou notez le secret dans un gestionnaire de mots de passe.
      </p>

      ${qrBlockHtml(b.qr_code, b.secret)}

      <p style="font-size:.68rem;color:#94A3B8;margin-top:.75rem;text-align:center;line-height:1.5;padding:0 .5rem;">
        Conservez ce secret en lieu sûr. Il vous permettra de vous connecter si vous perdez votre téléphone principal.
      </p>
      <button id="mfa-backup-done" type="button" style="width:100%;margin-top:1rem;padding:.8rem;border-radius:.65rem;background:rgba(0,255,163,.15);border:1px solid rgba(0,255,163,.5);color:#00FFA3;font-weight:800;font-size:.72rem;cursor:pointer;">✓ J'ai sauvegardé mon secret</button>
    `;

    bindCopySecret(ov, b.secret);
    body.querySelector('#mfa-backup-done').addEventListener('click', () => { removeModal(ov); _resolve(true); });
  }

  /* ═══════════════════════════════════════════════════════════════
     VERIFY (login suivant)
  */
  function renderVerify(ov, sb, factorId) {
    const body = ov.querySelector('#mfa-body');
    const errEl = ov.querySelector('#mfa-err');
    ov.querySelector('#mfa-subtitle').textContent = 'Entrez le code de votre application d\'authentification.';
    body.innerHTML = `
      <p style="font-size:.72rem;color:#94A3B8;margin-bottom:1rem;text-align:center;line-height:1.55;">Ouvrez votre application d'authentification et saisissez le code à 6 chiffres.</p>
      <input id="mfa-code" type="text" inputmode="numeric" maxlength="6" placeholder="123456" autocomplete="one-time-code" style="width:100%;padding:.85rem;text-align:center;font-size:1.35rem;letter-spacing:.45em;background:#0F1419;border:1px solid #334155;border-radius:.65rem;color:#fff;outline:none;font-family:'JetBrains Mono',monospace;font-weight:700;transition:border-color .2s,box-shadow .2s;">
      <button id="mfa-submit" type="button" style="width:100%;margin-top:.9rem;padding:.85rem;border-radius:.65rem;background:linear-gradient(135deg,#00C77E,#059669);color:#000;font-weight:900;font-size:.75rem;letter-spacing:.05em;text-transform:uppercase;border:none;cursor:pointer;">✓ Vérifier</button>
    `;
    const codeInp = body.querySelector('#mfa-code');
    const submit = body.querySelector('#mfa-submit');
    codeInp.focus();

    codeInp.addEventListener('focus', () => { codeInp.style.borderColor = '#00FFA3'; codeInp.style.boxShadow = '0 0 0 3px rgba(0,255,163,.15)'; });
    codeInp.addEventListener('blur',  () => { codeInp.style.borderColor = '#334155'; codeInp.style.boxShadow = 'none'; });
    codeInp.addEventListener('input', () => { codeInp.value = codeInp.value.replace(/\D/g, '').slice(0, 6); });

    const verify = async () => {
      const code = codeInp.value.replace(/\D/g, '');
      if (code.length !== 6) { errEl.textContent = 'Code à 6 chiffres requis.'; return; }
      errEl.textContent = '';
      submit.disabled = true; submit.textContent = 'Vérification…';
      try {
        const ch = await sb.auth.mfa.challenge({ factorId });
        if (ch.error) throw ch.error;
        const v = await sb.auth.mfa.verify({ factorId, challengeId: ch.data.id, code });
        if (v.error) throw v.error;
        toast('✅ Authentification à deux facteurs validée.');
        removeModal(ov);
        _resolve(true);
      } catch (e) {
        log('verify error:', e.message || e);
        errEl.textContent = 'Code invalide. Réessayez.';
        submit.disabled = false; submit.textContent = '✓ Vérifier';
        codeInp.select();
      }
    };
    submit.addEventListener('click', verify);
    codeInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') verify(); });
  }

  async function markMfaEnabled() {
    try {
      const sb = getSb();
      if (!sb) return;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      await sb.from('profiles').update({ mfa_enabled: true }).eq('id', user.id);
    } catch (e) { log('markMfaEnabled error:', e); }
  }

  async function boot() {
    log('boot starting');
    try {
      const sb = await waitForSb(5000);
      if (!sb) {
        log('sb unavailable after 5s');
        const ov = createModal();
        showFatal(ov, 'Impossible d\'initialiser la sécurité. Vérifiez votre connexion.');
        return;
      }

      const { data: { session } } = await sb.auth.getSession();
      if (!session) { log('no session'); _resolve(true); return; }

      const aal = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal.error) {
        log('AAL error:', aal.error.message);
        const ov = createModal();
        showFatal(ov, 'Erreur de vérification. Reconnectez-vous.');
        return;
      }

      const { currentLevel, nextLevel } = aal.data;
      log('AAL:', currentLevel, '->', nextLevel);

      if (currentLevel === 'aal2') { log('already aal2'); _resolve(true); return; }

      const ov = createModal();
      const { data: factorsData } = await sb.auth.mfa.listFactors();
      const totp = (factorsData && factorsData.totp) || [];
      const verified = totp.find(f => f.status === 'verified');

      if (verified) { log('verify flow'); renderVerify(ov, sb, verified.id); }
      else { log('enroll flow'); renderEnroll(ov, sb); }
    } catch (e) {
      console.error('[MFA] boot fatal:', e);
      try {
        let ov = document.getElementById('mfa-gate-overlay');
        if (!ov) ov = createModal();
        showFatal(ov, 'Erreur : ' + (e.message || 'réessayez.'));
      } catch (x) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
