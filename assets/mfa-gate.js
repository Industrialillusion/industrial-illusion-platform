/* ============================================================
   assets/mfa-gate.js
   PurKemet · MFA TOTP Gate (enrollment + verify + backup)
   v2.0 — robuste, idempotente, sans blocage utilisateur
   ------------------------------------------------------------
   Changements v2.0 vs v1.0:
   - Pré-enrollment cleanup: supprime les facteurs "PurKemet*" non vérifiés
     (fix bug "A factor with the friendly name 'PurKemet' already exists")
   - Si un facteur verified existe déjà → aller directement au verify
   - Fallback avec friendly_name unique si collision résiduelle
   - Backup factor avec nom unique (PurKemet-Backup-<timestamp>)
   - Timeout de sécurité 20s (pas de lockout total)
   - markMfaEnabled: try/catch silencieux
   - Retry automatique en cas d'erreur réseau sur enroll
   - Logs [MFA] sur chaque étape critique
   ============================================================ */
(function () {
  'use strict';

  window.MfaGate = window.MfaGate || {};
  let _resolve;
  let _resolved = false;

  window.MfaGate.done = new Promise((res) => {
    _resolve = (val) => { if (!_resolved) { _resolved = true; res(val); } };
  });

  // Timeout de sécurité: si le boot ne se termine pas (réseau, API, etc.),
  // on libère la dashboard après 20s pour éviter un lockout total.
  const SAFETY_TIMEOUT_MS = 20000;
  let safetyTimer = setTimeout(() => {
    console.warn('[MFA] Safety timeout reached — releasing dashboard');
    _resolve(true);
    const ov = document.getElementById('mfa-gate-overlay');
    if (ov) ov.remove();
  }, SAFETY_TIMEOUT_MS);

  function getSb() {
    return (window.Maat && window.Maat.sb) || window.supabaseClient;
  }

  function toast(msg, kind) {
    if (window.Maat && typeof window.Maat.toast === 'function') {
      window.Maat.toast(msg, kind || 'ok');
    } else {
      console.log('[MFA]', msg);
    }
  }

  function log(...args) {
    console.log('[MFA]', ...args);
  }

  function createModal() {
    const ov = document.createElement('div');
    ov.id = 'mfa-gate-overlay';
    ov.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:rgba(6,10,13,.96);' +
      'backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:1rem;' +
      'font-family:"JetBrains Mono",monospace;overflow-y:auto;';
    ov.innerHTML = `
      <div style="width:100%;max-width:26rem;margin:auto;background:linear-gradient(165deg,#131920,#090D10);border:1px solid rgba(0,255,163,.45);border-radius:1.25rem;padding:1.75rem;color:#F1F5F9;box-shadow:0 30px 70px -15px rgba(0,0,0,.9);">
        <div style="text-align:center;margin-bottom:1.25rem;">
          <div style="font-size:1.75rem;margin-bottom:.25rem;">🛡️</div>
          <div style="font-size:.62rem;letter-spacing:.22em;text-transform:uppercase;color:#00FFA3;font-weight:800;">PurKemet · Sécurité Renforcée</div>
          <h2 id="mfa-title" style="font-size:1.05rem;font-weight:900;color:#fff;margin-top:.35rem;">Vérification en deux étapes</h2>
          <p id="mfa-subtitle" style="font-size:.72rem;color:#94A3B8;margin-top:.35rem;"></p>
        </div>
        <div id="mfa-body"></div>
        <p id="mfa-err" style="font-size:.72rem;color:#f87171;font-weight:700;text-align:center;min-height:1.2rem;margin-top:.75rem;"></p>
        <button id="mfa-logout-global" type="button" style="width:100%;margin-top:.5rem;padding:.5rem;background:none;border:none;color:#64748B;font-size:.65rem;cursor:pointer;text-decoration:underline;">Se déconnecter et revenir à l'accueil</button>
      </div>`;
    document.body.appendChild(ov);

    const logoutBtn = ov.querySelector('#mfa-logout-global');
    logoutBtn.addEventListener('click', async () => {
      const sb = getSb();
      try { if (sb) await sb.auth.signOut(); } catch (e) { /* ignore */ }
      window.location.href = 'index.html';
    });

    return ov;
  }

  /* ─── Nettoyage des facteurs "PurKemet*" non vérifiés ─── */
  async function cleanupUnverifiedFactors(sb) {
    try {
      const { data, error } = await sb.auth.mfa.listFactors();
      if (error) { log('listFactors error:', error.message); return { removed: 0, verified: null }; }

      const allTotp = (data && data.totp) || [];
      const verified = allTotp.find(f => f.status === 'verified' && (f.friendly_name || '').startsWith('PurKemet'));
      const unverified = allTotp.filter(f => f.status === 'unverified' && (f.friendly_name || '').startsWith('PurKemet'));

      let removed = 0;
      for (const f of unverified) {
        try {
          const u = await sb.auth.mfa.unenroll({ factorId: f.id });
          if (!u.error) { removed++; log('unenrolled unverified factor:', f.friendly_name || f.id); }
          else { log('unenroll error:', u.error.message); }
        } catch (e) { log('unenroll exception:', e); }
      }
      return { removed, verified };
    } catch (e) {
      log('cleanup exception:', e);
      return { removed: 0, verified: null };
    }
  }

  /* ─── Enroll avec fallback nom unique ─── */
  async function safeEnroll(sb, friendlyName) {
    // 1er essai: nom standard
    let res = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName });
    if (!res.error) return res;

    const msg = (res.error.message || '').toLowerCase();
    log('enroll 1st attempt failed:', res.error.message);

    // Si collision de nom → retry avec nom unique
    if (msg.includes('friendly name') && msg.includes('already exists')) {
      const uniqueName = friendlyName + '-' + Date.now();
      log('retrying enroll with unique name:', uniqueName);
      res = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: uniqueName });
    }
    return res;
  }

  /* ─── Enrôlement (QR + verify) ─── */
  async function renderEnroll(ov, sb) {
    const subtitle = ov.querySelector('#mfa-subtitle');
    const errEl = ov.querySelector('#mfa-err');
    const body = ov.querySelector('#mfa-body');

    subtitle.textContent = 'Première connexion : configurez votre double authentification.';
    errEl.textContent = '';
    body.innerHTML = '<p style="text-align:center;color:#94A3B8;font-size:.75rem;padding:1rem;">Préparation de l\'enrôlement…</p>';

    // 1. Cleanup des facteurs orphelins
    const { removed, verified } = await cleanupUnverifiedFactors(sb);
    if (removed > 0) log('cleaned', removed, 'orphan factor(s)');

    // 2. Si un facteur verified existe déjà (rare mais possible: état incohérent)
    //    → basculer sur le flow de vérification plutôt que d'essayer d'enrôler
    if (verified) {
      log('verified factor exists, switching to verify flow');
      return renderVerify(ov, sb, verified.id);
    }

    // 3. Enrôlement (avec fallback)
    const { data, error } = await safeEnroll(sb, 'PurKemet');

    if (error) {
      log('enroll fatal error:', error.message);
      errEl.textContent = 'Erreur : ' + (error.message || 'Enrôlement impossible.');
      body.innerHTML = `
        <p style="text-align:center;color:#f87171;font-size:.72rem;margin-bottom:.75rem;">Impossible de générer le QR code.</p>
        <button id="mfa-retry" type="button" style="width:100%;padding:.8rem;border-radius:.65rem;background:rgba(0,255,163,.15);border:1px solid rgba(0,255,163,.5);color:#00FFA3;font-weight:800;font-size:.72rem;cursor:pointer;">↻ Réessayer</button>
      `;
      body.querySelector('#mfa-retry').addEventListener('click', () => renderEnroll(ov, sb));
      return;
    }

    const { id, totp } = data;

    body.innerHTML = `
      <p style="font-size:.72rem;color:#94A3B8;margin-bottom:.75rem;text-align:center;">Scannez ce QR code avec Google Authenticator (ou une app compatible), puis saisissez le code à 6 chiffres.</p>
      <div style="text-align:center;background:#fff;padding:.5rem;border-radius:.75rem;margin-bottom:.75rem;">
        <img src="${totp.qr_code}" alt="QR MFA" style="width:100%;max-width:180px;height:auto;display:block;margin:0 auto;">
      </div>
      <div style="font-size:.65rem;color:#94A3B8;text-align:center;margin-bottom:.75rem;">Secret manuel : <code style="color:#00FFA3;word-break:break-all;">${totp.secret}</code></div>
      <input id="mfa-code" type="text" inputmode="numeric" maxlength="6" placeholder="123456" autocomplete="one-time-code" style="width:100%;padding:.65rem;text-align:center;font-size:1.1rem;letter-spacing:.35em;background:#0F1419;border:1px solid #334155;border-radius:.65rem;color:#fff;outline:none;">
      <button id="mfa-submit" type="button" style="width:100%;margin-top:.85rem;padding:.8rem;border-radius:.65rem;background:linear-gradient(135deg,#00C77E,#059669);color:#000;font-weight:900;font-size:.75rem;letter-spacing:.05em;text-transform:uppercase;border:none;cursor:pointer;">✓ Activer</button>
      <button id="mfa-backup" type="button" style="width:100%;margin-top:.5rem;padding:.6rem;border-radius:.65rem;background:rgba(0,255,163,.08);border:1px solid rgba(0,255,163,.35);color:#00FFA3;font-weight:700;font-size:.68rem;cursor:pointer;">➕ Ajouter un facteur de secours (optionnel)</button>
    `;

    const codeInp = body.querySelector('#mfa-code');
    const submit = body.querySelector('#mfa-submit');
    const backup = body.querySelector('#mfa-backup');
    codeInp.focus();

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
        clearTimeout(safetyTimer);
        ov.remove();
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

  /* ─── Backup factor (nom unique, non bloquant) ─── */
  async function renderBackup(ov, sb) {
    const body = ov.querySelector('#mfa-body');
    const errEl = ov.querySelector('#mfa-err');
    body.innerHTML = '<p style="text-align:center;color:#00FFA3;font-size:.75rem;">Génération du facteur de secours…</p>';

    const uniqueName = 'PurKemet-Backup-' + Date.now();
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: uniqueName });

    if (error) {
      log('backup enroll error:', error.message);
      errEl.textContent = 'Backup indisponible : ' + (error.message || 'réessayez plus tard.');
      body.innerHTML = `
        <p style="text-align:center;color:#94A3B8;font-size:.72rem;">Le facteur principal reste actif. Vous pouvez ignorer le backup.</p>
        <button id="mfa-backup-skip" type="button" style="width:100%;margin-top:.75rem;padding:.7rem;border-radius:.65rem;background:rgba(0,255,163,.15);border:1px solid rgba(0,255,163,.5);color:#00FFA3;font-weight:800;font-size:.72rem;cursor:pointer;">Continuer sans backup</button>
      `;
      body.querySelector('#mfa-backup-skip').addEventListener('click', () => {
        clearTimeout(safetyTimer);
        ov.remove(); _resolve(true);
      });
      return;
    }

    const b = data.totp;
    errEl.textContent = '';
    body.innerHTML = `
      <p style="font-size:.72rem;color:#94A3B8;margin-bottom:.75rem;text-align:center;">Scannez ce QR code avec un second appareil, ou notez le secret ci-dessous dans un gestionnaire de mots de passe.</p>
      <div style="text-align:center;background:#fff;padding:.5rem;border-radius:.75rem;margin-bottom:.75rem;">
        <img src="${b.qr_code}" alt="QR Backup" style="width:100%;max-width:180px;height:auto;display:block;margin:0 auto;">
      </div>
      <div style="font-size:.65rem;color:#94A3B8;text-align:center;">Secret Backup : <code style="color:#00FFA3;word-break:break-all;">${b.secret}</code></div>
      <p style="font-size:.68rem;color:#94A3B8;margin-top:.75rem;text-align:center;">Conservez ce secret en lieu sûr. Il vous permettra de vous connecter si vous perdez votre téléphone principal.</p>
      <button id="mfa-backup-done" type="button" style="width:100%;margin-top:.85rem;padding:.7rem;border-radius:.65rem;background:rgba(0,255,163,.15);border:1px solid rgba(0,255,163,.5);color:#00FFA3;font-weight:800;font-size:.72rem;cursor:pointer;">J'ai sauvegardé mon secret de secours</button>
    `;
    body.querySelector('#mfa-backup-done').addEventListener('click', () => {
      clearTimeout(safetyTimer);
      ov.remove(); _resolve(true);
    });
  }

  /* ─── Vérification (login suivant) ─── */
  function renderVerify(ov, sb, factorId) {
    const body = ov.querySelector('#mfa-body');
    const errEl = ov.querySelector('#mfa-err');
    ov.querySelector('#mfa-subtitle').textContent = 'Entrez le code de votre application d\'authentification.';

    body.innerHTML = `
      <p style="font-size:.72rem;color:#94A3B8;margin-bottom:.75rem;text-align:center;">Ouvrez votre application d'authentification et saisissez le code à 6 chiffres.</p>
      <input id="mfa-code" type="text" inputmode="numeric" maxlength="6" placeholder="123456" autocomplete="one-time-code" style="width:100%;padding:.75rem;text-align:center;font-size:1.25rem;letter-spacing:.4em;background:#0F1419;border:1px solid #334155;border-radius:.65rem;color:#fff;outline:none;">
      <button id="mfa-submit" type="button" style="width:100%;margin-top:.85rem;padding:.85rem;border-radius:.65rem;background:linear-gradient(135deg,#00C77E,#059669);color:#000;font-weight:900;font-size:.75rem;letter-spacing:.05em;text-transform:uppercase;border:none;cursor:pointer;">✓ Vérifier</button>
    `;

    const codeInp = body.querySelector('#mfa-code');
    const submit = body.querySelector('#mfa-submit');
    codeInp.focus();

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
        clearTimeout(safetyTimer);
        ov.remove();
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

  /* ─── Marque profiles.mfa_enabled = true (non bloquant) ─── */
  async function markMfaEnabled() {
    try {
      const sb = getSb();
      if (!sb) return;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { error } = await sb.from('profiles').update({ mfa_enabled: true }).eq('id', user.id);
      if (error) log('markMfaEnabled warning:', error.message);
    } catch (e) {
      log('markMfaEnabled exception:', e);
    }
  }

  /* ─── Boot ─── */
  async function boot() {
    try {
      const sb = getSb();
      if (!sb) {
        log('Supabase client indisponible — fallback');
        clearTimeout(safetyTimer);
        _resolve(true);
        return;
      }

      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        log('Pas de session — dashboard gère');
        clearTimeout(safetyTimer);
        _resolve(true);
        return;
      }

      const aal = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal.error) {
        log('getAAL error:', aal.error.message);
        clearTimeout(safetyTimer);
        _resolve(true);
        return;
      }

      const { currentLevel, nextLevel } = aal.data;
      log('AAL:', currentLevel, '→', nextLevel);

      // Déjà vérifié
      if (currentLevel === 'aal2') {
        clearTimeout(safetyTimer);
        _resolve(true);
        return;
      }

      const ov = createModal();

      // Filtre les facteurs pour décider: verify ou enroll
      const { data: factorsData } = await sb.auth.mfa.listFactors();
      const totp = (factorsData && factorsData.totp) || [];
      const verified = totp.find(f => f.status === 'verified');

      if (nextLevel === 'aal2' && verified) {
        // Facteur vérifié existe → demander le code
        log('verified factor found, verify flow');
        renderVerify(ov, sb, verified.id);
      } else {
        // Pas de facteur vérifié → enrollment (cleanup + enroll)
        log('no verified factor, enroll flow');
        renderEnroll(ov, sb);
      }
    } catch (e) {
      console.error('[MFA] boot fatal:', e);
      clearTimeout(safetyTimer);
      _resolve(true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
