/* ============================================================
   MAAT OS — Portal Kernel & Smart Router (site.js v8.3)
   Industrial Illusion SARL · Projet PurKemet
   ------------------------------------------------------------
   Responsabilités :
     - Navigation directe sans blocage vers pwa.html et admin.html
     - Modale universelle de connexion pour l'Espace Client ESG
     - Formulaires publics (Audit 0 MAD B2B & Candidatures)
     - Calcul live des compteurs Data Lake (depuis public.collections)
   ------------------------------------------------------------
   Dépendances : assets/core.js (window.Maat), assets/config.js
   ============================================================ */
(function () {
  'use strict';

  var M = window.Maat;
  if (!M) {
    console.error('[site.js] kernel Maat (core.js) introuvable — script abandonné.');
    return;
  }

  var $ = M.$, h = M.h;
  var loginModal = null;
  var routingLock = false;

  /* ==========================================================
     1. ROUTER ACCESSI
     ========================================================== */
  function routeUser(profile) {
    if (!profile) {
      M.toast('Session introuvable.', 'warn');
      return;
    }

    if (profile.status && profile.status !== 'ACTIVE' && profile.role !== 'admin') {
      if (loginModal) { loginModal.close(); loginModal = null; }
      M.toast('Votre compte est en attente de validation par la Direction.', 'warn');
      return;
    }

    var target = null;
    if (profile.role === 'admin' && profile.status === 'ACTIVE') target = 'admin.html';
    else if (profile.role === 'operator' && profile.status === 'ACTIVE') target = 'pwa.html';
    else if (profile.role === 'client') target = 'dashboard.html';

    if (target) {
      if (loginModal) { loginModal.close(); loginModal = null; }
      routingLock = true;
      M.toast('Redirection vers votre espace…');
      setTimeout(function () { window.location.href = target; }, 200);
      // Timeout di sicurezza per sbloccare routingLock se il cambio pagina fallisce
      setTimeout(function () { routingLock = false; }, 4000);
      return;
    }

    if (loginModal) { loginModal.close(); loginModal = null; }
    M.toast('Compte actif mais sans espace attribué. Contactez la Direction.', 'warn');
  }

  /* ==========================================================
     2. MODALE UNIVERSALE DI ACCESSO
     ========================================================== */
  function openUniversalLogin() {
    if (loginModal || routingLock) return;
    if (!M.sb) {
      M.toast('Service d\'authentification indisponible. Réessayez dans un instant.', 'err');
      return;
    }

    M.sb.auth.getSession().then(function (s) {
      var hasSession = s && s.data && s.data.session && s.data.session.user;
      if (hasSession) { M.profile().then(routeUser); return; }
      renderLoginModal();
    }).catch(renderLoginModal);
  }

  function renderLoginModal() {
    var errBox = h('p', {
      class: 'text-[11px] text-center font-mono font-bold text-red-400 min-h-[1rem]',
      role: 'alert'
    });
    var emailInp = h('input', {
      id: 'site_login_email', type: 'email', class: 'inp mt-1',
      placeholder: 'vous@etablissement.ma', autocomplete: 'username',
      'aria-label': 'Adresse email'
    });
    var passInp = h('input', {
      id: 'site_login_pass', type: 'password', class: 'inp mt-1',
      placeholder: '••••••••', autocomplete: 'current-password',
      'aria-label': 'Mot de passe'
    });

    var submitBtn = h('button', {
      type: 'button', class: 'btn btn-g !py-3', text: 'Se connecter 🔓'
    });

    submitBtn.addEventListener('click', async function () {
      var em = emailInp.value.trim().toLowerCase();
      var pw = passInp.value;

      if (!em || !pw) {
        errBox.style.color = '#f87171';
        errBox.textContent = 'Renseignez l\'email et le mot de passe.';
        emailInp.focus();
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        errBox.style.color = '#f87171';
        errBox.textContent = 'Adresse email invalide.';
        emailInp.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Authentification…';
      errBox.style.color = '#C5A059';
      errBox.textContent = 'Vérification des identifiants…';

      try {
        var res = await M.sb.auth.signInWithPassword({ email: em, password: pw });
        submitBtn.disabled = false;
        submitBtn.textContent = 'Se connecter 🔓';

        if (res.error) {
          errBox.style.color = '#f87171';
          errBox.textContent = 'Identifiants incorrects.';
          M.buzz([60, 40, 60]);
          return;
        }

        errBox.style.color = '#00FFA3';
        errBox.textContent = '✓ Connexion réussie. Redirection…';
        M.buzz(80);
        var prof = await M.profile();
        routeUser(prof);
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Se connecter 🔓';
        errBox.style.color = '#f87171';
        errBox.textContent = 'Erreur : ' + (err.message || 'réessayez.');
      }
    });

    passInp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitBtn.click();
    });

    var body = h('div', { class: 'space-y-4 font-mono text-xs' },
      h('p', { class: 'text-[11px] text-slate-400 text-center',
        text: 'Accédez à votre espace professionnel Industrial Illusion.' }),
      h('div', null, h('label', { class: 'lbl', for: 'site_login_email', text: 'Email' }), emailInp),
      h('div', null, h('label', { class: 'lbl', for: 'site_login_pass', text: 'Mot de passe' }), passInp),
      submitBtn,
      errBox,
      h('p', { class: 'text-[10px] text-slate-500 text-center pt-2 border-t border-white/10',
        text: 'Accès réservé aux partenaires B2B, Opérateurs et Direction.' })
    );

    loginModal = M.modal('Connexion Espace Membre', body);
  }

  /* ==========================================================
     3. FORM PUBBLICI (FormData + fallback ID)
     ========================================================== */
  function extractField(form, names) {
    var fd = new FormData(form);
    for (var i = 0; i < names.length; i++) {
      var k = names[i];
      var v = fd.get(k);
      if (typeof v === 'string' && v.trim()) return v.trim();
      var el = form.querySelector('#' + k) || form.querySelector('[name="' + k + '"]');
      if (el && el.value && el.value.trim()) return el.value.trim();
    }
    return '';
  }

  function bindAuditForm() {
    var form = document.querySelector('#auditForm, form[data-form="audit"], #b2bAuditForm');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var company = extractField(form, ['company', 'establishment', 'company_name', 'audit_company']);
      var email = extractField(form, ['email', 'audit_email']).toLowerCase();
      var phone = extractField(form, ['phone', 'telephone', 'audit_phone']) || null;
      var notes = extractField(form, ['message', 'notes', 'volume', 'audit_notes']) || null;

      if (!company || !email) {
        M.toast('Veuillez renseigner les champs obligatoires.', 'warn');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        M.toast('Adresse email invalide.', 'warn');
        return;
      }

      var res = await M.sb.from('clients').insert([{
        company_name: company, email: email, phone: phone, message: notes, status: 'PROSPECT'
      }]);
      if (res.error) return M.toast('Erreur : ' + res.error.message, 'err');
      M.toast('Demande d\'audit 0 MAD transmise au siège.');
      M.buzz(80);
      form.reset();
    });
  }

  function bindCareerForm() {
    var form = document.querySelector('#careerForm, form[data-form="career"], #candidateForm');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var name = extractField(form, ['full_name', 'name', 'nom', 'career_name']);
      var phone = extractField(form, ['phone', 'telephone', 'career_phone']);
      var email = extractField(form, ['email', 'career_email']).toLowerCase() || null;
      var vehicle = extractField(form, ['vehicle', 'vehicule', 'career_vehicle']) || null;

      if (!name || !phone) {
        M.toast('Nom et téléphone requis.', 'warn');
        return;
      }

      // Inserisce la nota candidatura tracciabile
      var res = await M.sb.from('field_notes').insert([{
        operator_email: email || 'candidat@externe',
        note_type: 'GENERAL',
        content: 'CANDIDATURE VECTEUR : ' + name + ' | Tél: ' + phone + ' | Véhicule: ' + (vehicle || 'Aucun')
      }]);
      if (res.error) return M.toast('Erreur : ' + res.error.message, 'err');
      M.toast('Candidature reçue par la Direction.');
      M.buzz(80);
      form.reset();
    });
  }

  /* ==========================================================
     4. CONTATORI LIVE DATA LAKE (Query reale senza viste fittizie)
     ========================================================== */
  async function syncLiveCounters() {
    if (!M.sb) return;
    try {
      var res = await M.sb.from('collections')
        .select('weight_depot_kg')
        .eq('status', 'ANCHORED');

      var totalKg = 0;
      (res.data || []).forEach(function (r) {
        totalKg += Number(r.weight_depot_kg || 0);
      });
      var totalCo2 = totalKg * 1.82;

      var kgEl = document.querySelector('#liveKg, [data-kpi="kg"]');
      var co2El = document.querySelector('#liveCo2, [data-kpi="co2"]');
      if (kgEl) M.countUp(kgEl, totalKg, 0);
      if (co2El) M.countUp(co2El, totalCo2, 0);
    } catch (e) {}
  }

  /* ==========================================================
     5. INIT: Navigazione Diretta per PWA & Admin
     ========================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    // 5.1 I pulsanti di login aprono la modale di accesso
    document.querySelectorAll(
      '#loginBtn, .login-btn, [data-action="login"], [href="#login"]'
    ).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openUniversalLogin();
      });
    });

    // 5.2 Se un utente clicca sulla Dashboard B2B senza essere loggato, apre il login
    document.querySelectorAll('a[href="dashboard.html"]').forEach(function (link) {
      link.addEventListener('click', async function (e) {
        if (!M.sb) return;
        var s = await M.sb.auth.getSession();
        var has = s && s.data && s.data.session && s.data.session.user;
        if (!has) {
          e.preventDefault();
          openUniversalLogin();
        }
      });
    });

    // NOTA: pwa.html e admin.html rimangono 100% liberi da intercettori
    // per permettere l'atterraggio diretto e l'installazione PWA.

    bindAuditForm();
    bindCareerForm();
    syncLiveCounters();
  });

  window.openUniversalLogin = openUniversalLogin;
  window.MaatSite = {
    routeUser: routeUser,
    openUniversalLogin: openUniversalLogin,
    syncLiveCounters: syncLiveCounters
  };
})();
