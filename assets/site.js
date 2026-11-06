/* ============================================================
   MAAT OS — Portal Kernel & Smart Router (site.js v8.5)
   Industrial Illusion SARL · Projet PurKemet
   v8.5 · login toujours explicite (jamais d'auto-login silencieux)
        - openUniversalLogin : ferme la session existante avant d'afficher le form
        - sécurité anti-modale stantia (élément détaché du DOM)
   ============================================================ */
(function () {
  'use strict';

  var M = window.Maat;
  if (!M) return;

  var $ = M.$, h = M.h;
  var loginModal = null;
  var routingLock = false;

  // Garanzia di inizializzazione kernel Supabase
  function ensureInit() {
    if (!M.sb && typeof M.init === 'function') {
      M.init();
    }
  }

  function routeUser(profile) {
    if (!profile) return;
    if (profile.status && profile.status !== 'ACTIVE' && profile.role !== 'admin') {
      if (loginModal) { loginModal.close(); loginModal = null; }
      M.toast('Compte en attente de validation par la Direction.', 'warn');
      return;
    }
    var target = null;
    if (profile.role === 'admin') target = 'admin.html';
    else if (profile.role === 'operator') target = 'pwa.html';
    else if (profile.role === 'client') target = 'dashboard.html';

    if (target) {
      if (loginModal) { loginModal.close(); loginModal = null; }
      routingLock = true;
      M.toast('Redirection vers votre espace…');
      setTimeout(function () { window.location.href = target; }, 200);
      setTimeout(function () { routingLock = false; }, 3000);
    }
  }

  function openUniversalLogin() {
    ensureInit();

    // Sécurité : si une modale précédente a été fermée manuellement (élément
    // retiré du DOM par close()) mais que la référence JS est encore en mémoire,
    // on la nettoie. Sinon le click suivant serait bloqué silencieusement.
    if (loginModal && loginModal.el && !document.body.contains(loginModal.el)) {
      loginModal = null;
    }
    if (loginModal || routingLock) return;

    if (!M.sb) {
      M.toast('Initialisation de la session sécurisée...', 'warn');
      return;
    }

    // FIX v8.5 · JAMAIS d'auto-login silencieux.
    // Si une session existe déjà (résidu de test, ancien compte, ou utilisateur
    // qui veut changer de compte), on la ferme proprement PUIS on affiche le
    // formulaire. L'utilisateur choisit explicitement son compte à chaque
    // connexion — c'est le comportement attendu sur un portail unique.
    M.sb.auth.getSession().then(function (s) {
      var has = s && s.data && s.data.session && s.data.session.user;
      if (has) {
        M.sb.auth.signOut().then(function () {
          try { sessionStorage.clear(); } catch (e) {}
          renderLoginModal();
        }).catch(function () {
          // même si signOut échoue (réseau), on affiche le formulaire :
          // un nouveau signInWithPassword écrasera la session précédente.
          renderLoginModal();
        });
        return;
      }
      renderLoginModal();
    }).catch(renderLoginModal);
  }

  function renderLoginModal() {
    // Sécurité redondante : ne jamais empiler deux modales de login.
    if (loginModal && loginModal.el && document.body.contains(loginModal.el)) {
      var firstInput = loginModal.el.querySelector('input');
      if (firstInput) firstInput.focus();
      return;
    }
    loginModal = null;

    var errBox = h('p', { class: 'text-[11px] text-center font-mono font-bold text-red-400 min-h-[1.2rem]' });
    var emailInp = h('input', { id: 'site_login_email', type: 'email', class: 'inp mt-1', placeholder: 'direction@etablissement.ma', autocomplete: 'username' });
    var passInp = h('input', { id: 'site_login_pass', type: 'password', class: 'inp mt-1', placeholder: '••••••••', autocomplete: 'current-password' });

    var submitBtn = h('button', {
      type: 'button', class: 'btn btn-g !py-3 w-full font-bold', text: 'Se connecter 🔓',
      onclick: async function () {
        var em = emailInp.value.trim().toLowerCase(), pw = passInp.value;
        if (!em || !pw) return errBox.textContent = 'Renseignez l\'email et le mot de passe.';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Vérification…';
        var res = await M.sb.auth.signInWithPassword({ email: em, password: pw });
        submitBtn.disabled = false;
        submitBtn.textContent = 'Se connecter 🔓';
        if (res.error) return errBox.textContent = 'Identifiants incorrects.';
        var prof = await M.profile();
        routeUser(prof);
      }
    });

    passInp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitBtn.click();
    });

    var body = h('div', { class: 'space-y-4 font-mono text-xs' },
      h('p', { class: 'text-[11px] text-slate-400 text-center', text: 'Portail d\'authentification unique Industrial Illusion.' }),
      h('div', null, h('label', { class: 'lbl', text: 'Identifiant / Email' }), emailInp),
      h('div', null, h('label', { class: 'lbl', text: 'Mot de passe' }), passInp),
      submitBtn,
      errBox
    );
    loginModal = M.modal('Espace Partenaires & Direction', body);

    // Si l'utilisateur ferme la modale (X, backdrop, Escape), on nettoie la
    // référence pour que le prochain click sur « Connexion » rouvre le form.
    // M.modal ne l'expose pas directement → on observe la disparition du DOM.
    var observed = loginModal;
    var cleanup = function () {
      if (loginModal === observed && observed.el && !document.body.contains(observed.el)) {
        loginModal = null;
      }
    };
    observed.el.addEventListener('DOMNodeRemoved', cleanup);
    // Fallback MutationObserver (DOMNodeRemoved n'est pas standard partout)
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () {
        cleanup();
        if (loginModal === null) mo.disconnect();
      });
      mo.observe(document.body, { childList: true });
    }
  }

  function bindAuditForm() {
    var form = document.querySelector('#auditForm');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      ensureInit();
      var fd = new FormData(form);
      var company = fd.get('company');
      var email = (fd.get('email') || '').toLowerCase();
      var phone = fd.get('phone');
      var cat = fd.get('cat');
      var notes = fd.get('notes');

      if (!company || !email) return M.toast('Renseignez le nom et l\'email.', 'warn');

      var res = await M.sb.from('clients').insert([{
        company_name: company,
        email: email,
        phone: phone,
        horeca_category: cat,
        address: notes,
        status: 'PROSPECT'
      }]);

      if (res.error) return M.toast('Erreur : ' + res.error.message, 'err');
      M.toast('Demande d\'audit 0 MAD transmise au siège.');
      form.reset();
      if (window.closeAuditModal) window.closeAuditModal();
    });
  }

  async function syncLiveCounters() {
    ensureInit();
    if (!M.sb) return;
    try {
      var res = await M.sb.from('collections').select('weight_depot_kg').eq('status', 'ANCHORED');
      var totalKg = 0;
      (res.data || []).forEach(function (r) { totalKg += Number(r.weight_depot_kg || 0); });
      var totalCo2 = totalKg * 1.82;

      var kgEl = document.querySelector('#liveKg');
      var co2El = document.querySelector('#liveCo2');
      if (kgEl) M.countUp(kgEl, totalKg, 0);
      if (co2El) M.countUp(co2El, totalCo2, 0);
    } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureInit();
    document.querySelectorAll('#loginBtn, .login-btn, [data-action="login"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openUniversalLogin();
      });
    });
    bindAuditForm();
    syncLiveCounters();
  });

  window.openUniversalLogin = openUniversalLogin;
  window.ensureInit = ensureInit;
})();
