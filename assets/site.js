/* ============================================================
   MAAT OS — Portal Kernel & Smart Router (site.js v8.3)
   Industrial Illusion SARL · Projet PurKemet
   ============================================================ */
(function () {
  'use strict';

  var M = window.Maat;
  if (!M) return;

  var $ = M.$, h = M.h;
  var loginModal = null;
  var routingLock = false;

  /* Router post-login per Espace Client */
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

  /* Modale Login riservato solo all'Espace Client B2B */
  function openUniversalLogin() {
    if (loginModal || routingLock) return;
    if (!M.sb) return M.toast('Service indisponible.', 'err');

    M.sb.auth.getSession().then(function (s) {
      var has = s && s.data && s.data.session && s.data.session.user;
      if (has) { M.profile().then(routeUser); return; }
      renderLoginModal();
    }).catch(renderLoginModal);
  }

  function renderLoginModal() {
    var errBox = h('p', { class: 'text-[11px] text-center font-mono font-bold text-red-400 min-h-[1rem]' });
    var emailInp = h('input', { type: 'email', class: 'inp mt-1', placeholder: 'contact@etablissement.ma' });
    var passInp = h('input', { type: 'password', class: 'inp mt-1', placeholder: '••••••••' });
    var submitBtn = h('button', {
      type: 'button', class: 'btn btn-g !py-3', text: 'Se connecter 🔓',
      onclick: async function () {
        var em = emailInp.value.trim().toLowerCase(), pw = passInp.value;
        if (!em || !pw) return errBox.textContent = 'Renseignez l\'email et le mot de passe.';
        submitBtn.disabled = true;
        var res = await M.sb.auth.signInWithPassword({ email: em, password: pw });
        submitBtn.disabled = false;
        if (res.error) return errBox.textContent = 'Identifiants incorrects.';
        var prof = await M.profile();
        routeUser(prof);
      }
    });

    var body = h('div', { class: 'space-y-4 font-mono text-xs' },
      h('p', { class: 'text-[11px] text-slate-400 text-center', text: 'Connexion Espace Partenaire ESG.' }),
      h('div', null, h('label', { class: 'lbl', text: 'Email' }), emailInp),
      h('div', null, h('label', { class: 'lbl', text: 'Mot de passe' }), passInp),
      submitBtn,
      errBox
    );
    loginModal = M.modal('Connexion Espace Membre', body);
  }

  /* Form Audit B2B dal sito pubblico */
  function bindAuditForm() {
    var form = document.querySelector('#auditForm, form[data-form="audit"]');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var company = fd.get('company') || fd.get('company_name');
      var email = (fd.get('email') || '').toLowerCase();
      var phone = fd.get('phone');
      if (!company || !email) return M.toast('Renseignez le nom et l\'email.', 'warn');
      var res = await M.sb.from('clients').insert([{ company_name: company, email: email, phone: phone, status: 'PROSPECT' }]);
      if (res.error) return M.toast(res.error.message, 'err');
      M.toast('Demande d\'audit transmise.');
      form.reset();
    });
  }

  /* Compteuri Data Lake */
  async function syncLiveCounters() {
    if (!M.sb) return;
    try {
      var res = await M.sb.from('collections').select('weight_depot_kg').eq('status', 'ANCHORED');
      var totalKg = 0;
      (res.data || []).forEach(function (r) { totalKg += Number(r.weight_depot_kg || 0); });
      var kgEl = document.querySelector('#liveKg, [data-kpi="kg"]');
      var co2El = document.querySelector('#liveCo2, [data-kpi="co2"]');
      if (kgEl) M.countUp(kgEl, totalKg, 0);
      if (co2El) M.countUp(co2El, totalKg * 1.82, 0);
    } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Solo i tasti "Connexion" aprono il modale
    document.querySelectorAll('#loginBtn, .login-btn, [data-action="login"], [href="#login"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openUniversalLogin();
      });
    });

    // NOTA: pwa.html e admin.html NAVIGANO LIBERAMENTE SENZA PREVENT DEFAULT
    bindAuditForm();
    syncLiveCounters();
  });

  window.openUniversalLogin = openUniversalLogin;
})();
