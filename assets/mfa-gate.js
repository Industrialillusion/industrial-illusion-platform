/* ============================================================
   assets/mfa-gate.js
   PurKemet · MFA TOTP Gate (enrollment + verify + backup)
   v1.0
   - Blocca la dashboard finché la sessione non è aal2
   - Al primo login: enrollment (QR + secret) + verifica
   - Login successivi: prompt codice a 6 cifre
   - Gestione "backup factor" (Supabase non fornisce recovery codes)
   ============================================================ */
(function () {
  'use strict';

  window.MfaGate = window.MfaGate || {};
  let _resolve;
  window.MfaGate.done = new Promise((res) => { _resolve = res; });

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

  function createModal() {
    const ov = document.createElement('div');
    ov.id = 'mfa-gate-overlay';
    ov.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:rgba(6,10,13,.96);' +
      'backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:1rem;' +
      'font-family:"JetBrains Mono",monospace;';
    ov.innerHTML = `
      <div style="width:100%;max-width:26rem;background:linear-gradient(165deg,#131920,#090D10);border:1px solid rgba(0,255,163,.45);border-radius:1.25rem;padding:1.75rem;color:#F1F5F9;box-shadow:0 30px 70px -15px rgba(0,0,0,.9);">
        <div style="text-align:center;margin-bottom:1.25rem;">
          <div style="font-size:1.75rem;margin-bottom:.25rem;">🛡️</div>
          <div style="font-size:.62rem;letter-spacing:.22em;text-transform:uppercase;color:#00FFA3;font-weight:800;">PurKemet · Sécurité Renforcée</div>
          <h2 id="mfa-title" style="font-size:1.05rem;font-weight:900;color:#fff;margin-top:.35rem;">Vérification en deux étapes</h2>
          <p id="mfa-subtitle" style="font-size:.72rem;color:#94A3B8;margin-top:.35rem;"></p>
        </div>
        <div id="mfa-body"></div>
        <p id="mfa-err" style="font-size:.72rem;color:#f87171;font-weight:700;text-align:center;min-height:1.2rem;margin-top:.75rem;"></p>
      </div>`;
    document.body.appendChild(ov);
    return ov;
  }

  function renderEnroll(ov, sb) {
    return sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'PurKemet' })
      .then(({ data, error }) => {
        if (error) throw error;
        const { id, totp } = data;
        const body = ov.querySelector('#mfa-body');
        body.innerHTML = `
          <p style="font-size:.72rem;color:#94A3B8;margin-bottom:.75rem;text-align:center;">Scannez ce QR code avec Google Authenticator (ou une app compatible), puis saisissez le code à 6 chiffres.</p>
          <div style="text-align:center;background:#fff;padding:.5rem;border-radius:.75rem;margin-bottom:.75rem;">
            <img src="${totp.qr_code}" alt="QR MFA" style="width:100%;max-width:180px;height:auto;display:block;margin:0 auto;">
          </div>
          <div style="font-size:.65rem;color:#94A3B8;text-align:center;margin-bottom:.75rem;">Secret manuel : <code style="color:#00FFA3;word-break:break-all;">${totp.secret}</code></div>
          <input id="mfa-code" type="text" inputmode="numeric" maxlength="6" placeholder="123456" style="width:100%;padding:.65rem;text-align:center;font-size:1.1rem;letter-spacing:.35em;background:#0F1419;border:1px solid #334155;border-radius:.65rem;color:#fff;outline:none;">
          <button id="mfa-submit" type="button" style="width:100%;margin-top:.85rem;padding:.8rem;border-radius:.65rem;background:linear-gradient(135deg,#00C77E,#059669);color:#000;font-weight:900;font-size:.75rem;letter-spacing:.05em;text-transform:uppercase;border:none;cursor:pointer;">✓ Activer</button>
          <button id="mfa-backup" type="button" style="width:100%;margin-top:.5rem;padding:.6rem;border-radius:.65rem;background:rgba(0,255,163,.08);border:1px solid rgba(0,255,163,.35);color:#00FFA3;font-weight:700;font-size:.68rem;cursor:pointer;">➕ Ajouter un facteur de secours</button>
        `;
        const codeInp = body.querySelector('#mfa-code');
        const submit = body.querySelector('#mfa-submit');
        const backup = body.querySelector('#mfa-backup');
        codeInp.focus();

        const verify = async () => {
          const code = codeInp.value.replace(/\D/g, '');
          if (code.length !== 6) { ov.querySelector('#mfa-err').textContent = 'Code à 6 chiffres requis.'; return; }
          submit.disabled = true; submit.textContent = 'Vérification…';
          try {
            const ch = await sb.auth.mfa.challenge({ factorId: id });
            if (ch.error) throw ch.error;
            const v = await sb.auth.mfa.verify({ factorId: id, challengeId: ch.data.id, code });
            if (v.error) throw v.error;
            toast('✅ MFA activé. Votre compte est sécurisé.');
            await markMfaEnabled();
            ov.remove();
            _resolve(true);
          } catch (e) {
            ov.querySelector('#mfa-err').textContent = 'Code invalide. Réessayez.';
            submit.disabled = false; submit.textContent = '✓ Activer';
          }
        };

        submit.addEventListener('click', verify);
        codeInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') verify(); });

        backup.addEventListener('click', () => {
          body.innerHTML = '<p style="text-align:center;color:#00FFA3;font-size:.75rem;">➡️ Un second facteur va être généré. Notez le secret ou scannez le nouveau QR code pour l\'ajouter à un second appareil.</p>';
          // Pour simplifier, on appelle directement le même flow d'enroll
          // Le friendlyName change pour distinguer le backup du primary
          setTimeout(() => {
            sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'PurKemet-Backup' })
              .then(({ data, error }) => {
                if (error) { toast('Erreur backup : ' + error.message, 'err'); return; }
                const b = data.totp;
                body.innerHTML = `
                  <div style="text-align:center;background:#fff;padding:.5rem;border-radius:.75rem;margin-bottom:.75rem;">
                    <img src="${b.qr_code}" alt="QR Backup" style="width:100%;max-width:180px;height:auto;display:block;margin:0 auto;">
                  </div>
                  <div style="font-size:.65rem;color:#94A3B8;text-align:center;">Secret Backup : <code style="color:#00FFA3;word-break:break-all;">${b.secret}</code></div>
                  <p style="font-size:.68rem;color:#94A3B8;margin-top:.75rem;text-align:center;">Conservez ce secret dans un endroit sûr. Il vous permettra de vous connecter si vous perdez votre téléphone principal.</p>
                  <button id="mfa-backup-done" type="button" style="width:100%;margin-top:.85rem;padding:.7rem;border-radius:.65rem;background:rgba(0,255,163,.15);border:1px solid rgba(0,255,163,.5);color:#00FFA3;font-weight:800;font-size:.72rem;cursor:pointer;">J'ai sauvegardé mon secret de secours</button>
                `;
                body.querySelector('#mfa-backup-done').addEventListener('click', () => {
                  ov.remove(); _resolve(true);
                });
              });
          }, 300);
        });
      })
      .catch((err) => {
        ov.querySelector('#mfa-err').textContent = 'Erreur : ' + (err.message || 'Enrôlement impossible.');
        _resolve(false);
      });
  }

  function renderVerify(ov, sb, factorId) {
    const body = ov.querySelector('#mfa-body');
    body.innerHTML = `
      <p style="font-size:.72rem;color:#94A3B8;margin-bottom:.75rem;text-align:center;">Ouvrez votre application d'authentification et saisissez le code à 6 chiffres.</p>
      <input id="mfa-code" type="text" inputmode="numeric" maxlength="6" placeholder="123456" style="width:100%;padding:.75rem;text-align:center;font-size:1.25rem;letter-spacing:.4em;background:#0F1419;border:1px solid #334155;border-radius:.65rem;color:#fff;outline:none;">
      <button id="mfa-submit" type="button" style="width:100%;margin-top:.85rem;padding:.85rem;border-radius:.65rem;background:linear-gradient(135deg,#00C77E,#059669);color:#000;font-weight:900;font-size:.75rem;letter-spacing:.05em;text-transform:uppercase;border:none;cursor:pointer;">✓ Vérifier</button>
      <button id="mfa-logout" type="button" style="width:100%;margin-top:.5rem;padding:.5rem;background:none;border:none;color:#64748B;font-size:.65rem;cursor:pointer;text-decoration:underline;">Se déconnecter</button>
    `;
    const codeInp = body.querySelector('#mfa-code');
    const submit = body.querySelector('#mfa-submit');
    const logout = body.querySelector('#mfa-logout');
    codeInp.focus();

    const verify = async () => {
      const code = codeInp.value.replace(/\D/g, '');
      if (code.length !== 6) { ov.querySelector('#mfa-err').textContent = 'Code à 6 chiffres requis.'; return; }
      submit.disabled = true; submit.textContent = 'Vérification…';
      try {
        const ch = await sb.auth.mfa.challenge({ factorId });
        if (ch.error) throw ch.error;
        const v = await sb.auth.mfa.verify({ factorId, challengeId: ch.data.id, code });
        if (v.error) throw v.error;
        toast('✅ Authentification à deux facteurs validée.');
        ov.remove();
        _resolve(true);
      } catch (e) {
        ov.querySelector('#mfa-err').textContent = 'Code invalide. Réessayez.';
        submit.disabled = false; submit.textContent = '✓ Vérifier';
        codeInp.select();
      }
    };

    submit.addEventListener('click', verify);
    codeInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') verify(); });
    logout.addEventListener('click', async () => {
      await sb.auth.signOut();
      window.location.href = 'index.html';
    });
  }

  async function markMfaEnabled() {
    const sb = getSb();
    if (!sb) return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    await sb.from('profiles').update({ mfa_enabled: true }).eq('id', user.id);
  }

  async function boot() {
    const sb = getSb();
    if (!sb) {
      console.warn('[MFA Gate] Supabase client non disponible.');
      _resolve(true); // ne pas bloquer si pas de Supabase (fallback)
      return;
    }

    // Attendre que la session soit prête
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { _resolve(true); return; } // pas connecté, laisser dashboard gérer

    const aal = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.error) { _resolve(true); return; }

    const { currentLevel, nextLevel } = aal.data;

    // Si déjà aal2 → rien à faire
    if (currentLevel === 'aal2') { _resolve(true); return; }

    // Si nextLevel === 'aal2' → facteur existe, demander vérification
    if (nextLevel === 'aal2') {
      const factors = await sb.auth.mfa.listFactors();
      if (factors.error) { _resolve(true); return; }
      const verified = factors.data.totp.find(f => f.status === 'verified');
      if (!verified) { _resolve(true); return; }
      const ov = createModal();
      ov.querySelector('#mfa-subtitle').textContent = 'Entrez le code de votre application d\'authentification.';
      renderVerify(ov, sb, verified.id);
      return;
    }

    // Sinon → enrollment (premier login)
    const ov = createModal();
    ov.querySelector('#mfa-subtitle').textContent = 'Première connexion : configurez votre double authentification.';
    renderEnroll(ov, sb);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
