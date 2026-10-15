/* ============================================================
   MAAT OS — Portal Kernel & Smart Router (site.js v8.4)
   Industrial Illusion SARL · Projet PurKemet
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
    if (loginModal || routingLock) return;
    if (!M.sb) {
      M.toast('Initialisation de la session sécurisée...', 'warn');
      return;
    }

    M.sb.auth.getSession().then(function (s) {
      var has = s && s.data && s.data.session && s.data.session.user;
      if (has) { M.profile().then(routeUser); return; }
      renderLoginModal();
    }).catch(renderLoginModal);
  }

  function renderLoginModal() {
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
