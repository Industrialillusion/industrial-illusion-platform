/* ============================================================
   MAAT OS v8.2 — Control Tower (Direction Générale)
   Industrial Illusion SARL · Projet PurKemet Phase 1
   ------------------------------------------------------------
   Nouveautés v8.2 :
     - Vue "🔐 Data Lake Accréditations" (datalake_access_requests)
     - Badge PENDING sur l'onglet Data Lake
     - Approbation → génération token MAAT-LK-XXXX-XXXX
     - Rejet → motif interne
   ============================================================ */
(function () {
  'use strict';
  if (!window.Maat) {
    document.body.innerHTML = '<p style="font-family:monospace;color:#f87171;padding:2rem">Maat OS — kernel (core.js) introuvable. Vérifiez assets/core.js.</p>';
    return;
  }
  var M = window.Maat, $ = M.$, h = M.h, root = $('root');
  var A = null, cur = 'overview', timer = null, chan = null, badgeTimer = null;

  var VIEWS = [
    ['overview', '📊', 'Vue d\'ensemble'],
    ['users', '👥', 'Utilisateurs & permissions'],
    ['clients', '🏨', 'Clients B2B'],
    ['pickups', '🗓️', 'Ritiri programmés'],
    ['weigh', '⚖️', 'Registre des pesées'],
    ['contracts', '🤝', 'Contrats ambassadeurs'],
    ['cash', '💰', 'Caisse & virements'],
    ['factors', '🌱', 'Facteurs CO₂'],
    ['datalake', '🔐', 'Data Lake Accréditations'],
    ['audit', '🧾', 'Journal d\'audit']
  ];

  var CATS = [
    ['RIAD', 'Riad / maison d\'hôtes'],
    ['RESTAURANT', 'Restaurant / rooftop'],
    ['HOTEL_RESORT', 'Hôtel / resort'],
    ['CLINIQUE', 'Clinique'],
    ['ECOLE', 'École'],
    ['COMMERCE', 'Commerce / artisan'],
    ['SUPERMARCHE', 'Supermarché']
  ];

  var GRADES = [
    ['', '— aucun —'],
    ['Bronze', 'Bronze'],
    ['Silver', 'Silver'],
    ['Gold', 'Gold'],
    ['Kemet Elite', 'Kemet Elite']
  ];

  var TIME_FILTERS = [
    ['ALL', 'Toute la période'],
    ['TODAY', 'Aujourd\'hui'],
    ['7D', '7 derniers jours'],
    ['30D', '30 derniers jours'],
    ['365D', '1 an']
  ];

  var DL_CATEGORIES = {
    FMCG_CORPORATE: 'FMCG / Packaging',
    ESG_AUDITOR: 'Auditeur ESG',
    INVESTOR: 'Investisseur',
    PUBLIC_INSTITUTION: 'Institution Publique',
    RESEARCHER: 'Chercheur',
    OTHER: 'Autre'
  };

  var BD = {
    ACTIVE: 'bd-g', ANCHORED: 'bd-g', VALIDATED: 'bd-g', DONE: 'bd-g', PAID: 'bd-g',
    PENDING: 'bd-au', PROSPECT: 'bd-au', SUBMITTED: 'bd-au', IN_TRANSIT: 'bd-au', PLANNED: 'bd-au', ASSIGNED: 'bd-au',
    APPROVED: 'bd-au', IN_PROGRESS: 'bd-g',
    DISPUTED: 'bd-r', REJECTED: 'bd-r', CANCELLED: 'bd-r', PAUSED: 'bd-n'
  };
  var badge = function (s) { return h('span', { class: 'bd ' + (BD[s] || 'bd-n'), text: s }); };

  /* ---------- Feedback vocal (accessibilité terrain & direction, §4.5.4) ---------- */
  function voice(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR'; u.rate = 1.05;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ---------- Briques d'interface réutilisables ---------- */
  function tbl(cols, rows, empty) {
    if (!rows.length) return h('div', { class: 'p-6 text-center text-xs font-mono text-slate-500', text: empty || 'Aucune donnée.' });
    return h('div', { class: 'overflow-x-auto' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { text: c.t }); }))),
      h('tbody', null, rows.map(function (r, i) {
        return h('tr', { style: 'animation-delay:' + Math.min(i, 20) * 25 + 'ms' },
          cols.map(function (c) {
            var v = c.f(r);
            return h('td', null, v == null ? '—' : (typeof v === 'object' ? v : String(v)));
          }));
      }))));
  }

  function head(t, sub, actions) {
    return h('div', { class: 'flex flex-wrap justify-between items-end gap-3 mb-4' },
      h('div', null, h('h2', { class: 'font-kemetTitle text-xl font-black text-white', text: t }), sub ? h('p', { class: 'text-[11px] text-slate-400', text: sub }) : null),
      h('div', { class: 'flex flex-wrap gap-2 items-center' }, actions || []));
  }

  function btn(t, fn, cls) { return h('button', { type: 'button', class: 'btn sm ' + (cls || 'btn-o'), text: t, onclick: fn }); }
  function sel(opts, val, fn) {
    var s = h('select', { class: 'inp !w-auto !py-1.5 !px-2 text-[11px]', onchange: function () { fn(s.value); } },
      opts.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    s.value = val; return s;
  }
  function fail(r, ctx) { if (r && r.error) { M.toast((ctx || 'Erreur') + ' : ' + r.error.message, 'err'); return true; } return false; }
  var short = function (id) { return id ? String(id).slice(0, 8) : '—'; };

  function applyTimeFilter(query, col, tf) {
    if (tf === 'ALL') return query;
    var now = new Date();
    if (tf === 'TODAY') {
      now.setHours(0, 0, 0, 0);
      return query.gte(col, now.toISOString());
    }
    var days = tf === '7D' ? 7 : tf === '30D' ? 30 : 365;
    now.setDate(now.getDate() - days);
    return query.gte(col, now.toISOString());
  }

  /* ---------- Authentification autonome Control Tower ---------- */
  function login() {
    $('out').classList.add('hidden'); root.innerHTML = '';
    var out = h('p', { class: 'text-[11px] text-center font-mono font-bold min-h-[1rem]', role: 'alert' }), say = function (t) { out.textContent = t; out.style.color = '#f87171'; };
    var em = h('input', { id: 'l_em', type: 'email', class: 'inp mt-1', autocomplete: 'username' }), pw = h('input', { id: 'l_pw', type: 'password', class: 'inp mt-1', autocomplete: 'current-password' });
    var go = h('button', {
      type: 'button', class: 'btn btn-g', text: '👑 Accéder à la Control Tower', onclick: async function () {
        if (!M.sb) return say('Supabase non configuré (assets/config.js).');
        go.disabled = true; var r = await M.sb.auth.signInWithPassword({ email: em.value.trim().toLowerCase(), password: pw.value }); go.disabled = false;
        if (r.error) return say('Identifiants incorrects.'); boot();
      }
    });
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') go.click(); });
    root.appendChild(h('section', { class: 'card g relative overflow-hidden space-y-4 !p-6 max-w-sm mx-auto mt-10' },
      h('div', { class: 'beam' }),
      h('div', { class: 'text-center space-y-1' }, h('div', { class: 'w-12 h-12 mx-auto rounded-2xl bg-cyberGreen/10 border border-cyberGreen/30 flex items-center justify-center text-xl', text: '👑' }), h('h2', { class: 'font-mono font-bold uppercase tracking-wider text-sm', text: 'Control Tower — Direction' }), h('p', { class: 'text-[11px] text-slate-400', text: 'Réservé aux comptes administrateurs vérifiés.' })),
      h('div', { class: 'font-mono space-y-3' }, h('div', null, h('label', { class: 'lbl', for: 'l_em', text: 'Email *' }), em), h('div', null, h('label', { class: 'lbl', for: 'l_pw', text: 'Mot de passe *' }), pw), go), out));
  }

  async function boot() {
    var p = await M.profile(); if (!p) return login();
    if (p.role !== 'admin' || p.status !== 'ACTIVE') { await M.sb.auth.signOut(); login(); return M.toast('Ce compte n\'a pas les droits d\'administration.', 'err'); }
    A = p; $('who').textContent = (p.full_name || p.email) + ' — Direction Générale'; $('out').classList.remove('hidden'); $('out').onclick = M.signOut; shell(); M.flush(); live();
  }

  /* ---------- Structure & Navigation dynamique ---------- */
  function shell() {
    root.innerHTML = '';
    var nav = h('nav', { class: 'flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 lg:sticky lg:top-20', 'aria-label': 'Modules' }, VIEWS.map(function (v) {
      return h('button', {
        type: 'button',
        class: 'tab !text-left lg:w-full flex items-center gap-2 !px-3',
        'data-v': v[0],
        'aria-label': 'Module ' + v[2],
        onclick: function () { open(v[0]); }
      },
        h('span', { text: v[1] }),
        h('span', { text: v[2] }),
        h('span', { class: 'ml-auto hidden bd bd-au', 'data-b': v[0] }));
    }));
    root.appendChild(h('div', { class: 'grid lg:grid-cols-[15rem_1fr] gap-4' }, h('aside', null, nav), h('main', { id: 'view', class: 'min-w-0' })));
    open(cur);
  }

  async function open(v) {
    cur = v;
    var lbl = (VIEWS.filter(function (x) { return x[0] === v; })[0] || [])[2] || 'Control Tower';
    document.title = 'Maat OS · ' + lbl + ' — Control Tower';
    document.querySelectorAll('[data-v]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.v === v);
      if (b.dataset.v === v) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    var el = $('view'); el.innerHTML = ''; el.appendChild(h('div', { class: 'card skel h-40' }));
    var box = h('div', { class: 'space-y-4' });
    try {
      await ({
        overview: vOverview,
        users: vUsers,
        clients: vClients,
        pickups: vPickups,
        weigh: vWeigh,
        contracts: vContracts,
        cash: vCash,
        factors: vFactors,
        datalake: vDatalake,
        audit: vAudit
      })[v](box);
    }
    catch (e) { box.appendChild(h('div', { class: 'card text-xs text-red-400 font-mono', text: 'Erreur de chargement : ' + (e.message || e) })); }
    el.innerHTML = ''; el.appendChild(box); scheduleBadges();
  }

  /* Badges débouncés à 800ms pour préserver le quota de requêtes DB */
  function scheduleBadges() {
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(badges, 800);
  }

  async function badges() {
    var c = function (t, f) { return M.sb.from(t).select('id', { count: 'exact', head: true }).match(f); };
    try {
      var r = await Promise.all([
        c('profiles', { status: 'PENDING' }),
        c('ambassador_contracts', { status: 'SUBMITTED' }),
        c('payout_requests', { status: 'PENDING' }),
        c('collections', { status: 'DISPUTED' }),
        c('clients', { status: 'PROSPECT' }),
        c('datalake_access_requests', { status: 'PENDING' })
      ]);
      [
        ['users', r[0]],
        ['contracts', r[1]],
        ['cash', r[2]],
        ['weigh', r[3]],
        ['clients', r[4]],
        ['datalake', r[5]]
      ].forEach(function (x) {
        var b = document.querySelector('[data-b="' + x[0] + '"]');
        if (b) { b.textContent = x[1].count || 0; b.classList.toggle('hidden', !x[1].count); }
      });
    } catch (e) {}
  }

  function live() {
    if (chan) return; chan = M.sb.channel('tower');
    ['collections', 'pickups', 'payout_requests', 'ambassador_contracts', 'profiles', 'clients', 'datalake_access_requests'].forEach(function (t) {
      chan.on('postgres_changes', { event: '*', schema: 'public', table: t }, function (e) {
        clearTimeout(timer);
        timer = setTimeout(function () {
          var active = document.activeElement;
          var isInput = active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA');
          var isModal = document.querySelector('.ov, [role="dialog"]:not(.hidden)');
          if (!isInput && !isModal) open(cur);
        }, 1200);
        if (e.eventType === 'INSERT') { M.toast('🔔 Nouveau : ' + t.replace('_', ' ')); M.buzz(40); }
      });
    }); chan.subscribe();
  }

  /* ---------- 1. Vue d'ensemble ---------- */
  async function vOverview(box) {
    var head0 = function (t) { return M.sb.from(t.t).select('id', { count: 'exact', head: true }).match(t.f || {}); };
    var today = new Date(); today.setHours(0, 0, 0, 0); var tm = new Date(today); tm.setDate(tm.getDate() + 1);
    var weekIso = new Date(Date.now() - 14 * 86400000).toISOString();
    var res = await Promise.all([
      M.sb.from('collections').select('status,weight_collect_kg,weight_depot_kg,created_at').gte('created_at', weekIso).limit(3000),
      head0({ t: 'clients', f: { status: 'ACTIVE' } }),
      M.sb.from('pickups').select('id', { count: 'exact', head: true }).gte('scheduled_at', today.toISOString()).lt('scheduled_at', tm.toISOString()).neq('status', 'CANCELLED'),
      head0({ t: 'profiles', f: { role: 'operator', status: 'ACTIVE' } }),
      M.sb.from('audit_log').select('*').order('id', { ascending: false }).limit(8)
    ]);
    var col = res[0].data || [], transit = 0, anchored = 0, days = {};
    col.forEach(function (c) {
      if (c.status === 'IN_TRANSIT') transit += Number(c.weight_collect_kg);
      if (c.status === 'ANCHORED') anchored += Number(c.weight_depot_kg || 0);
      var d = c.created_at.slice(0, 10); days[d] = (days[d] || 0) + Number(c.weight_collect_kg);
    });
    box.appendChild(head('Vue d\'ensemble', 'Pilotage en temps réel de l\'écosystème Maat OS — 14 derniers jours.'));
    var kp = [
      ['En transit (kg)', transit, 0, 'text-kemetGoldBright'],
      ['Ancré (kg)', anchored, 0, 'text-cyberGreen'],
      ['Clients actifs', res[1].count, 0, 'text-white'],
      ['Ritiri aujourd\'hui', res[2].count, 0, 'text-white'],
      ['Opérateurs actifs', res[3].count, 0, 'text-cyberGreen'],
      ['Pesées (14 j)', col.length, 0, 'text-white']
    ];
    box.appendChild(h('div', { class: 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3' }, kp.map(function (k, i) {
      var v = h('div', { class: 'font-mono text-2xl font-black skel ' + k[3], text: '0000' });
      setTimeout(function () { M.countUp(v, k[1], k[2]); }, 100);
      return h('div', { class: 'card', style: '--i:' + i }, h('span', { class: 'text-[9px] text-slate-400 uppercase font-mono block', text: k[0] }), v);
    })));

    var keys = []; for (var i = 13; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate() - i); keys.push(d.toISOString().slice(0, 10)); }
    var max = Math.max.apply(null, keys.map(function (k) { return days[k] || 0; }).concat([1])), bars = '';
    keys.forEach(function (k, i) {
      var v = days[k] || 0, hh = Math.round(v / max * 110);
      bars += '<g><rect class="chart-bar" style="animation-delay:' + i * 40 + 'ms" x="' + (i * 40 + 10) + '" y="' + (130 - hh) + '" width="26" height="' + hh + '" rx="4" fill="url(#bg)"/><text x="' + (i * 40 + 23) + '" y="146" text-anchor="middle" font-size="8" fill="#94a3b8" font-family="JetBrains Mono">' + k.slice(8) + '</text></g>';
    });
    var chart = h('div', { class: 'card' }, h('p', { class: 'lbl au mb-2', text: 'Tonnage collecté par jour (kg)' }));
    var svg = h('div', { class: 'overflow-x-auto' });
    svg.innerHTML = '<svg viewBox="0 0 580 150" class="w-full min-w-[520px]" role="img" aria-label="Histogramme du tonnage collecté sur 14 jours"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00FFA3"/><stop offset="1" stop-color="#C5A059"/></linearGradient></defs>' + bars + '</svg>';
    chart.appendChild(svg); box.appendChild(chart);

    box.appendChild(h('div', { class: 'card' }, h('p', { class: 'lbl au mb-2', text: 'Activité récente' }),
      tbl([
        { t: 'Quand', f: function (r) { return M.fmt.dt(r.created_at); } },
        { t: 'Action', f: function (r) { return r.action; } },
        { t: 'Entité', f: function (r) { return r.entity; } },
        { t: 'Réf.', f: function (r) { return short(r.entity_id); } }
      ], res[4].data || [], 'Aucune activité.')));
  }

  /* ---------- 2. Utilisateurs & permissions ---------- */
  async function vUsers(box) {
    var f = { role: 'ALL', status: 'ALL', q: '' }, list = h('div', { class: 'card !p-2' });

    var perm = function (u, forceStatus) {
      var has = function (c) { return (u.capabilities || []).indexOf(c) >= 0; };
      M.form('Permissions — ' + (u.full_name || u.email), [
        { k: 'role', label: 'Type de compte', type: 'select', options: [['public', 'Public / investisseur'], ['client', 'Client B2B'], ['operator', 'Opérateur'], ['admin', 'Administrateur']], value: u.role },
        { k: 'vector', label: 'Modalité Vecteur logistique (collectes, double pesée)', type: 'checkbox', value: has('vector') },
        { k: 'ambassador', label: 'Modalité Ambassadeur B2B (contrats, primes)', type: 'checkbox', value: has('ambassador') },
        { k: 'status', label: 'Statut', type: 'select', options: [['ACTIVE', 'Actif'], ['PENDING', 'En attente'], ['REJECTED', 'Bloqué']], value: forceStatus || u.status },
        { k: 'grade', label: 'Échelon', type: 'select', options: GRADES, value: u.grade || '' },
        { k: 'merit', label: 'Score de mérite Maat (0-100)', type: 'number', min: 0, max: 100, step: '0.1', value: u.merit_score },
        { k: 'cluster', label: 'Cluster affecté', value: u.cluster || '' },
        { k: 'vehicle', label: 'Véhicule', value: u.vehicle || '' }
      ], 'Enregistrer', async function (v) {
        if (u.id === A.id && (v.role !== 'admin' || v.status !== 'ACTIVE')) return 'Vous ne pouvez pas retirer vos propres droits d\'administration.';
        var caps = []; if (v.vector) caps.push('vector'); if (v.ambassador) caps.push('ambassador');
        if (v.role === 'operator' && v.status === 'ACTIVE' && !caps.length) return 'Un opérateur actif doit avoir au moins une modalité (vecteur et/ou ambassadeur).';
        var r = await M.sb.from('profiles').update({
          role: v.role, capabilities: v.role === 'operator' ? caps : [], status: v.status,
          grade: v.grade || null, merit_score: v.merit === '' ? null : Number(v.merit), cluster: v.cluster || null, vehicle: v.vehicle || null
        }).eq('id', u.id);
        if (r.error) return r.error.message;
        M.toast('Permissions mises à jour.');
        voice('Permissions enregistrées');
        load(); scheduleBadges();
      });
    };

    var load = async function () {
      var q = M.sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(500);
      if (f.role !== 'ALL') q = q.eq('role', f.role);
      if (f.status !== 'ALL') q = q.eq('status', f.status);
      var r = await q; if (fail(r, 'Utilisateurs')) return;
      var rows = (r.data || []).filter(function (u) { return !f.q || (u.email + ' ' + (u.full_name || '')).toLowerCase().indexOf(f.q) >= 0; });
      list.innerHTML = '';
      list.appendChild(tbl([
        { t: 'Utilisateur', f: function (u) { return h('div', null, h('div', { class: 'font-bold text-white', text: u.full_name || u.email }), h('div', { class: 'text-[10px] text-slate-400', text: u.email })); } },
        { t: 'Rôle', f: function (u) { return u.role; } },
        { t: 'Modalités', f: function (u) { return h('div', { class: 'flex gap-1' }, (u.capabilities || []).map(function (c) { return h('span', { class: 'bd bd-g', text: c === 'vector' ? 'Vecteur' : 'Ambassadeur' }); })); } },
        { t: 'Statut', f: function (u) { return badge(u.status); } },
        { t: 'Grade / score', f: function (u) { return (u.grade || '—') + ' / ' + (u.merit_score != null ? u.merit_score : '—'); } },
        { t: 'Actions', f: function (u) {
          return h('div', { class: 'flex gap-1 flex-wrap' },
            u.status === 'PENDING' ? btn('Activer (Onboarding)', function () {
              M.form('Activer Nouvel Opérateur — ' + (u.full_name || u.email), [
                { k: 'cap', label: 'Modalités opérationnelles', type: 'select', options: [['vector', 'Vecteur Logistique'], ['ambassador', 'Ambassadeur B2B'], ['vector,ambassador', 'Les deux (Kemet Elite)']] },
                { k: 'cluster', label: 'Cluster d\'affectation', placeholder: 'Ex: Marrakech Médina', required: true },
                { k: 'vehicle', label: 'Véhicule assigné', placeholder: 'Ex: Triporteur K-MEH 01' }
              ], 'Activer le compte', async function (v) {
                var caps = v.cap.split(',');
                var res = await M.sb.from('profiles').update({ status: 'ACTIVE', capabilities: caps, cluster: v.cluster, vehicle: v.vehicle || null }).eq('id', u.id);
                if (res.error) return res.error.message;
                M.toast('Opérateur activé.'); voice('Opérateur activé'); load(); scheduleBadges();
              });
            }, 'btn-g') : null,
            btn('Permissions', function () { perm(u); }),
            u.id !== A.id ? btn('Supprimer', async function () {
              if (await M.confirm('⚠️ Supprimer définitivement ' + u.email + ' ? Suppression irréversible conforme Loi CNDP 09-08.')) {
                var res = await M.sb.rpc('admin_delete_user', { p_user_id: u.id });
                if (res.error) return M.toast('Erreur suppression : ' + res.error.message, 'err');
                M.toast('Utilisateur supprimé du registre.'); voice('Utilisateur supprimé'); load(); scheduleBadges();
              }
            }, 'btn-r') : null
          );
        } }
      ], rows, 'Aucun utilisateur.'));
    };

    box.appendChild(head('Utilisateurs & permissions', 'Attribuez les rôles. Un opérateur peut être vecteur, ambassadeur, ou les deux.', [
      sel([['ALL', 'Tous les rôles'], ['operator', 'Opérateurs'], ['client', 'Clients'], ['public', 'Public'], ['admin', 'Admins']], f.role, function (v) { f.role = v; load(); }),
      sel([['ALL', 'Tous statuts'], ['PENDING', 'En attente'], ['ACTIVE', 'Actifs'], ['REJECTED', 'Bloqués']], f.status, function (v) { f.status = v; load(); }),
      h('input', { class: 'inp !w-44 !py-1.5 text-[11px]', placeholder: 'Rechercher…', 'aria-label': 'Rechercher', oninput: function (e) { f.q = e.target.value.toLowerCase(); load(); } })
    ]));
    box.appendChild(list); await load();
  }

  /* ---------- 3. Clients & prospects ---------- */
  async function vClients(box) {
    var f = 'ACTIVE', list = h('div', { class: 'card !p-2' }), data = [];
    var form = function (c) {
      var e = !!c; c = c || {};
      M.form(e ? 'Modifier le client' : 'Ajouter un client', [
        { k: 'company', label: 'Raison sociale', required: true, value: c.company_name },
        { k: 'cat', label: 'Catégorie', type: 'select', options: CATS, value: c.horeca_category || 'HOTEL_RESORT' },
        { k: 'contact', label: 'Contact', value: c.contact_name },
        { k: 'phone', label: 'Téléphone', type: 'tel', value: c.phone },
        { k: 'email', label: 'Email', type: 'email', value: c.email },
        { k: 'address', label: 'Adresse (pour l\'itinéraire des vecteurs)', value: c.address },
        { k: 'city', label: 'Ville', value: c.city || 'Marrakech' },
        { k: 'cluster', label: 'Cluster / zone', value: c.cluster },
        { k: 'status', label: 'Statut', type: 'select', options: [['ACTIVE', 'Actif'], ['PROSPECT', 'Prospect'], ['PAUSED', 'En pause']], value: c.status || 'ACTIVE' }
      ], e ? 'Enregistrer' : 'Créer le client', async function (v) {
        var row = {
          company_name: v.company, horeca_category: v.cat, contact_name: v.contact || null,
          phone: v.phone || null, email: v.email || null, address: v.address || null, city: v.city || null,
          cluster: v.cluster || null, status: v.status
        };
        var r = e ? await M.sb.from('clients').update(row).eq('id', c.id) : await M.sb.from('clients').insert([row]);
        if (r.error) return r.error.message; M.toast(e ? 'Client mis à jour.' : 'Client créé.'); load(); scheduleBadges();
      }, true);
    };

    var load = async function () {
      var q = M.sb.from('clients').select('*').order('created_at', { ascending: false }).limit(500);
      if (f !== 'ALL') q = q.eq('status', f);
      var r = await q; if (fail(r, 'Clients')) return; data = r.data || [];
      list.innerHTML = '';
      list.appendChild(tbl([
        { t: 'Établissement', f: function (c) { return h('div', null, h('div', { class: 'font-bold text-white', text: c.company_name }), h('div', { class: 'text-[10px] text-slate-400', text: [c.contact_name, c.phone].filter(Boolean).join(' · ') })); } },
        { t: 'Catégorie', f: function (c) { return c.horeca_category; } },
        { t: 'Adresse', f: function (c) { return [c.address, c.city].filter(Boolean).join(', '); } },
        { t: 'Cluster', f: function (c) { return c.cluster || '—'; } },
        { t: 'Statut', f: function (c) { return badge(c.status); } },
        { t: 'Reçu le', f: function (c) { return M.fmt.d(c.created_at); } },
        { t: 'Actions', f: function (c) {
          return h('div', { class: 'flex gap-1 flex-wrap' },
            c.status === 'PROSPECT' ? btn('Convertir en Client', function () {
              M.form('Onboarding Client — ' + c.company_name, [
                { k: 'cluster', label: 'Cluster logistique d\'affectation', placeholder: 'Ex: Hivernage', required: true }
              ], 'Activer le client', async function (v) {
                var res = await M.sb.from('clients').update({ status: 'ACTIVE', cluster: v.cluster }).eq('id', c.id);
                if (res.error) return res.error.message;
                M.toast('Prospect converti en client actif.'); voice('Client activé'); load(); scheduleBadges();
              });
            }, 'btn-g') : null,
            btn('Modifier', function () { form(c); }));
        } }
      ], data, 'Aucun client dans cette vue.'));
    };

    box.appendChild(head('Clients & prospects', 'Les demandes d\'audit du site arrivent ici en « Prospect ». Activez-les pour les rendre visibles aux vecteurs.', [
      sel([['ACTIVE', 'Actifs'], ['PROSPECT', 'Prospects (site)'], ['PAUSED', 'En pause'], ['ALL', 'Tous']], f, function (v) { f = v; load(); }),
      btn('⬇ CSV', function () {
        M.csv(data.map(function (c) {
          return { societe: c.company_name, categorie: c.horeca_category, contact: c.contact_name, telephone: c.phone, email: c.email, adresse: c.address, ville: c.city, cluster: c.cluster, statut: c.status };
        }), 'clients');
      }),
      btn('+ Ajouter un client', function () { form(); }, 'btn-g')
    ]));
    box.appendChild(list); await load();
  }

  /* ---------- 4. Ritiri programmés ---------- */
  async function vPickups(box) {
    var cl = (await M.sb.from('clients').select('id,company_name').eq('status', 'ACTIVE').order('company_name')).data || [], by = {};
    cl.forEach(function (c) { by[c.id] = c.company_name; });
    var vec = (await M.sb.from('profiles').select('id,full_name,email,capabilities').eq('role', 'operator').eq('status', 'ACTIVE')).data || [];
    vec = vec.filter(function (p) { return (p.capabilities || []).indexOf('vector') >= 0; });
    var vopts = [['', '— non assigné —']].concat(vec.map(function (p) { return [p.id, p.full_name || p.email]; }));
    var list = h('div', { class: 'card !p-2' });

    var load = async function () {
      var from = new Date(); from.setDate(from.getDate() - 7);
      var r = await M.sb.from('pickups').select('*').gte('scheduled_at', from.toISOString()).order('scheduled_at').limit(400);
      if (fail(r, 'Ritiri')) return;
      list.innerHTML = '';
      list.appendChild(tbl([
        { t: 'Date & heure', f: function (p) { return M.fmt.dt(p.scheduled_at); } },
        { t: 'Client', f: function (p) { return by[p.client_id] || short(p.client_id); } },
        { t: 'Matières', f: function (p) { return p.materials; } },
        { t: 'Vecteur', f: function (p) {
          return sel(vopts, p.vector_id || '', async function (v) {
            var r = await M.sb.from('pickups').update({ vector_id: v || null, status: v ? 'ASSIGNED' : 'PLANNED' }).eq('id', p.id);
            if (!fail(r)) { M.toast(v ? 'Ritiro assigné — le vecteur est notifié.' : 'Assignation retirée.'); load(); }
          });
        } },
        { t: 'Statut', f: function (p) { return badge(p.status); } },
        { t: 'Actions', f: function (p) {
          return p.status === 'DONE' || p.status === 'CANCELLED' ? null : btn('Annuler', async function () {
            if (await M.confirm('Annuler ce ritiro ?')) {
              var r = await M.sb.from('pickups').update({ status: 'CANCELLED' }).eq('id', p.id);
              if (!fail(r)) load();
            }
          }, 'btn-r');
        } }
      ], r.data || [], 'Aucun ritiro programmé.'));
    };

    box.appendChild(head('Ritiri programmés', 'Planifiez les passages, assignez un vecteur : il reçoit la notification en direct sur son téléphone.', [
      btn('+ Programmer un ritiro', function () {
        if (!cl.length) return M.toast('Ajoutez d\'abord un client actif.', 'warn');
        M.form('Programmer un ritiro', [
          { k: 'client', label: 'Client', type: 'select', options: cl.map(function (c) { return [c.id, c.company_name]; }), required: true },
          { k: 'when', label: 'Date et heure', type: 'datetime-local', required: true },
          { k: 'win', label: 'Fenêtre (minutes)', type: 'number', min: 15, max: 480, value: 60 },
          { k: 'mat', label: 'Matières attendues (ex. carton, verre)' },
          { k: 'notes', label: 'Consignes (accès, étage, contact…)', type: 'textarea' },
          { k: 'vec', label: 'Vecteur', type: 'select', options: vopts },
          { k: 'rec', label: 'Récurrence', type: 'select', options: [['0', 'Ponctuel'], ['7', 'Chaque semaine'], ['14', 'Toutes les 2 semaines']] },
          { k: 'n', label: 'Nombre d\'occurrences (si récurrent)', type: 'number', min: 1, max: 26, value: 8 }
        ], 'Programmer', async function (v) {
          var base = new Date(v.when); if (isNaN(base)) return 'Date invalide.';
          var rows = [], step = parseInt(v.rec, 10), n = step ? v.n : 1;
          for (var i = 0; i < n; i++) {
            var d = new Date(base); d.setDate(d.getDate() + i * step);
            rows.push({
              client_id: v.client, scheduled_at: d.toISOString(), window_minutes: v.win,
              materials: v.mat || null, notes: v.notes || null, vector_id: v.vec || null,
              status: v.vec ? 'ASSIGNED' : 'PLANNED'
            });
          }
          var r = await M.sb.from('pickups').insert(rows); if (r.error) return r.error.message;
          M.toast(rows.length + ' ritiro(s) programmé(s).'); load();
        }, true);
      }, 'btn-g')
    ]));
    box.appendChild(list); await load();
  }

  /* ---------- 5. Registre des pesées ---------- */
  async function vWeigh(box) {
    var f = 'ALL', tf = 'ALL', list = h('div', { class: 'card !p-2' }), data = [];
    var cl = (await M.sb.from('clients').select('id,company_name')).data || [], by = {};
    cl.forEach(function (c) { by[c.id] = c.company_name; });

    var inspectBag = async function (c) {
      var body = h('div', { class: 'space-y-3 font-mono text-xs' });
      body.appendChild(h('div', { class: 'p-3 bg-black/60 rounded-xl border border-white/10 space-y-1' },
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Sac QR :' }), h('strong', { class: 'text-cyberGreen', text: c.bag_qr_id })),
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Client :' }), h('strong', { class: 'text-white', text: by[c.client_id] || '—' })),
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Matière :' }), h('strong', { class: 'text-kemetGoldBright', text: c.material_type })),
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Opérateur :' }), h('strong', { class: 'text-white', text: c.operator_email || '—' })),
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'GPS Location :' }), h('strong', { class: 'text-slate-200', text: c.gps_location || 'Non renseigné' }))
      ));

      if (c.blockchain_hash) {
        body.appendChild(h('div', { class: 'p-2 bg-cyberGreen/10 rounded-lg border border-cyberGreen/30 text-[10px] space-y-1' },
          h('span', { class: 'text-cyberGreen font-bold block', text: '🔗 Hash de Notarisation Blockchain :' }),
          h('code', { class: 'text-white break-all block', text: c.blockchain_hash }),
          btn('📋 Copier le Hash', function () {
            navigator.clipboard.writeText(c.blockchain_hash);
            M.toast('Hash copié dans le presse-papier.');
          }, 'btn-o !py-1 !text-[9px]')
        ));
      }

      if (c.scale_fault_photo || c.depot_fault_photo) {
        var photos = h('div', { class: 'grid grid-cols-2 gap-2 pt-2' });
        if (c.scale_fault_photo) {
          var u1 = await M.signed('proofs', c.scale_fault_photo);
          if (u1) photos.appendChild(h('div', null, h('span', { class: 'text-[9px] text-slate-400 block mb-1', text: 'Photo P1' }), h('img', { src: u1, class: 'rounded-lg border border-white/10' })));
        }
        if (c.depot_fault_photo) {
          var u2 = await M.signed('proofs', c.depot_fault_photo);
          if (u2) photos.appendChild(h('div', null, h('span', { class: 'text-[9px] text-slate-400 block mb-1', text: 'Photo P2' }), h('img', { src: u2, class: 'rounded-lg border border-white/10' })));
        }
        body.appendChild(photos);
      }

      M.modal('Inspection du sac — ' + c.bag_qr_id, body);
    };

    var load = async function () {
      var q = M.sb.from('collections').select('*').order('created_at', { ascending: false }).limit(300);
      if (f !== 'ALL') q = q.eq('status', f);
      q = applyTimeFilter(q, 'created_at', tf);
      var r = await q; if (fail(r, 'Pesées')) return; data = r.data || [];
      var dl = function (c) { return c.weight_depot_kg ? Math.abs(c.weight_depot_kg - c.weight_collect_kg) / c.weight_collect_kg * 100 : null; };
      list.innerHTML = '';
      list.appendChild(tbl([
        { t: 'Date', f: function (c) { return M.fmt.dt(c.created_at); } },
        { t: 'Sac', f: function (c) { return h('button', { type: 'button', class: 'font-bold text-cyberGreen hover:underline', text: c.bag_qr_id, onclick: function () { inspectBag(c); } }); } },
        { t: 'Client', f: function (c) { return by[c.client_id] || '—'; } },
        { t: 'Matériau', f: function (c) { return c.material_type; } },
        { t: 'P1 kg', f: function (c) { return M.fmt.n(c.weight_collect_kg, 2); } },
        { t: 'P2 kg', f: function (c) { return c.weight_depot_kg ? M.fmt.n(c.weight_depot_kg, 2) : '—'; } },
        { t: 'Écart', f: function (c) {
          var d = dl(c); return d == null ? '—' : h('span', { class: d > 3 ? 'text-red-400 font-bold' : 'text-cyberGreen', text: d.toFixed(1) + ' %' });
        } },
        { t: 'Statut', f: function (c) { return badge(c.status); } },
        { t: 'Méthode', f: function (c) { return c.weighing_method === 'PHOTO_PROOF' ? '📸 photo' : '📶 BT'; } },
        { t: 'Ancrage', f: function (c) { return c.blockchain_hash ? c.blockchain_hash.slice(0, 12) + '…' : '—'; } },
        { t: 'Actions', f: function (c) {
          return h('div', { class: 'flex gap-1 flex-wrap' },
            btn('🔍 Détail', function () { inspectBag(c); }),
            c.status === 'DISPUTED' ? btn('Valider', async function () {
              if (await M.confirm('Valider cet écart et ancrer la pesée ?')) {
                var r = await M.sb.from('collections').update({ status: 'ANCHORED' }).eq('id', c.id);
                if (!fail(r)) { M.toast('Pesée validée.'); load(); scheduleBadges(); }
              }
            }, 'btn-g') : null);
        } }
      ], data, 'Aucune pesée.'));
    };

    box.appendChild(head('Registre des pesées', 'Double pesée collecte / dépôt. Un écart supérieur à 3 % place la pesée en litige.', [
      sel(TIME_FILTERS, tf, function (v) { tf = v; load(); }),
      sel([['ALL', 'Toutes'], ['IN_TRANSIT', 'En transit'], ['ANCHORED', 'Ancrées'], ['DISPUTED', 'Litiges']], f, function (v) { f = v; load(); }),
      btn('⬇ CSV', function () {
        M.csv(data.map(function (c) {
          return { date: c.created_at, sac: c.bag_qr_id, client: by[c.client_id], materiau: c.material_type, p1_kg: c.weight_collect_kg, p2_kg: c.weight_depot_kg, statut: c.status, methode: c.weighing_method, hash: c.blockchain_hash, operateur: c.operator_email };
        }), 'pesees');
      })
    ]));
    box.appendChild(list); await load();
  }

  /* ---------- 6. Contrats ambassadeurs ---------- */
  async function vContracts(box) {
    var f = 'SUBMITTED', tf = 'ALL', list = h('div', { class: 'card !p-2' });
    var look = async function (c) {
      var u = await M.signed('contracts', c.photo_path); if (!u) return M.toast('Photo introuvable.', 'err');
      M.modal('Contrat — ' + c.company_name, h('img', { src: u, alt: 'Contrat signé', class: 'w-full rounded-lg' }), true);
    };

    var load = async function () {
      var q = M.sb.from('ambassador_contracts').select('*').order('created_at', { ascending: false }).limit(300);
      if (f !== 'ALL') q = q.eq('status', f);
      q = applyTimeFilter(q, 'created_at', tf);
      var r = await q; if (fail(r, 'Contrats')) return;
      list.innerHTML = '';
      list.appendChild(tbl([
        { t: 'Reçu le', f: function (c) { return M.fmt.dt(c.created_at); } },
        { t: 'Ambassadeur', f: function (c) { return c.ambassador_email; } },
        { t: 'Établissement', f: function (c) { return h('div', null, h('div', { class: 'font-bold text-white', text: c.company_name }), h('div', { class: 'text-[10px] text-slate-400', text: [c.category, c.contact_name, c.phone].filter(Boolean).join(' · ') })); } },
        { t: 'Statut', f: function (c) { return badge(c.status); } },
        { t: 'Prime', f: function (c) { return c.status === 'VALIDATED' ? M.fmt.n(c.bonus_mad, 2) + ' MAD' : '—'; } },
        { t: 'Actions', f: function (c) {
          return h('div', { class: 'flex gap-1 flex-wrap' },
            c.photo_path ? btn('👁 Contrat', function () { look(c); }) : null,
            c.status === 'SUBMITTED' ? btn('Valider', function () {
              M.form('Valider — ' + c.company_name, [
                { k: 'bonus', label: 'Prime ambassadeur (MAD) — fixée par la Direction', type: 'number', min: 0, step: '0.01', value: 250, required: true }
              ], 'Valider, créer le client & créditer', async function (v) {
                var r = await M.sb.rpc('validate_contract', { p_id: c.id, p_bonus: Number(v.bonus) });
                if (r.error) return r.error.message;
                M.toast('Contrat validé : client créé et prime créditée.');
                voice('Contrat validé, prime créditée');
                load(); scheduleBadges();
              });
            }, 'btn-g') : null,
            c.status === 'SUBMITTED' ? btn('Refuser', function () {
              M.form('Refuser — ' + c.company_name, [
                { k: 'note', label: 'Motif (visible en interne)', type: 'textarea', required: true }
              ], 'Refuser le contrat', async function (v) {
                var r = await M.sb.from('ambassador_contracts').update({ status: 'REJECTED', review_note: v.note, reviewed_by: A.id, reviewed_at: new Date().toISOString() }).eq('id', c.id);
                if (r.error) return r.error.message;
                M.toast('Contrat refusé.'); load(); scheduleBadges();
              });
            }, 'btn-r') : null);
        } }
      ], r.data || [], 'Aucun contrat dans cette vue.'));
    };

    box.appendChild(head('Contrats ambassadeurs', 'Contrôlez le contrat signé. La validation crée le client et crédite la prime que vous fixez.', [
      sel(TIME_FILTERS, tf, function (v) { tf = v; load(); }),
      sel([['SUBMITTED', 'À valider'], ['VALIDATED', 'Validés'], ['REJECTED', 'Refusés'], ['ALL', 'Tous']], f, function (v) { f = v; load(); })
    ]));
    box.appendChild(list); await load();
  }

  /* ---------- 7. Caisse, virements, wallet ---------- */
  async function vCash(box) {
    var pay = h('div', { class: 'card !p-2' }), rec = h('div', { class: 'card !p-2' });
    var us = (await M.sb.from('profiles').select('id,full_name,email').eq('role', 'operator').eq('status', 'ACTIVE')).data || [], un = {};
    us.forEach(function (u) { un[u.id] = u.full_name || u.email; });

    var load = async function () {
      var a = await M.sb.from('payout_requests').select('*').order('created_at', { ascending: false }).limit(200),
          b = await M.sb.from('cash_receipts').select('*').order('created_at', { ascending: false }).limit(100);
      if (fail(a, 'Virements')) return;

      pay.innerHTML = '';
      pay.appendChild(tbl([
        { t: 'Demande', f: function (p) { return M.fmt.dt(p.created_at); } },
        { t: 'Opérateur', f: function (p) { return p.operator || un[p.user_id]; } },
        { t: 'Montant', f: function (p) { return M.fmt.n(p.amount_mad, 2) + ' MAD'; } },
        { t: 'Mode', f: function (p) { return p.method + (p.cash_slot ? ' · ' + p.cash_slot : ''); } },
        { t: 'Bénéficiaire', f: function (p) { return p.details; } },
        { t: 'Statut', f: function (p) { return badge(p.status); } },
        { t: 'Actions', f: function (p) {
          return p.status === 'PAID' || p.status === 'REJECTED' ? null : h('div', { class: 'flex gap-1 flex-wrap' },
            p.status === 'PENDING' ? btn('Approuver', async function () {
              var r = await M.sb.from('payout_requests').update({ status: 'APPROVED', reviewed_by: A.id }).eq('id', p.id);
              if (!fail(r)) { load(); scheduleBadges(); }
            }) : null,
            btn('Marquer payé', async function () {
              if (await M.confirm('Confirmer le paiement de ' + M.fmt.n(p.amount_mad, 2) + ' MAD ? Le solde sera débité.')) {
                var r = await M.sb.rpc('settle_payout', { p_id: p.id });
                if (r.error) return M.toast(r.error.message, 'err');
                M.toast('Paiement enregistré au registre.');
                voice('Paiement enregistré');
                load(); scheduleBadges();
              }
            }, 'btn-g'),
            btn('Rejeter', async function () {
              var r = await M.sb.from('payout_requests').update({ status: 'REJECTED', reviewed_by: A.id }).eq('id', p.id);
              if (!fail(r)) { load(); scheduleBadges(); }
            }, 'btn-r'));
        } }
      ], a.data || [], 'Aucune demande.'));

      rec.innerHTML = '';
      rec.appendChild(tbl([
        { t: 'Date', f: function (c) { return M.fmt.dt(c.created_at); } },
        { t: 'Opérateur', f: function (c) { return un[c.user_id] || short(c.user_id); } },
        { t: 'Montant', f: function (c) { return M.fmt.n(c.amount_mad, 2) + ' MAD'; } },
        { t: 'Motif', f: function (c) { return c.motif; } },
        { t: 'Réf. reçu', f: function (c) { return c.ref; } }
      ], (b.data || []), 'Aucun reçu espèces.'));
    };

    box.appendChild(head('Caisse & virements', 'Validez les règlements, suivez les reçus espèces et créditez le wallet des opérateurs.', [
      btn('+ Mouvement wallet', function () {
        if (!us.length) return M.toast('Aucun opérateur actif.', 'warn');
        M.form('Mouvement wallet', [
          { k: 'u', label: 'Opérateur', type: 'select', options: us.map(function (u) { return [u.id, u.full_name || u.email]; }), required: true },
          { k: 'kind', label: 'Type', type: 'select', options: [['COURSE', 'Course'], ['BONUS', 'Prime / bonus de mérite'], ['DIVIDEND', 'Dividende Actions de Classe B'], ['ADVANCE', 'Avance (négatif)'], ['ADJUST', 'Ajustement']] },
          { k: 'label', label: 'Libellé', required: true },
          { k: 'amt', label: 'Montant (MAD, négatif pour un débit)', type: 'number', step: '0.01', required: true }
        ], 'Inscrire au registre', async function (v) {
          if (!(await M.confirm('Inscrire le mouvement de ' + M.fmt.n(v.amt, 2) + ' MAD sur le wallet de cet opérateur ?'))) return;
          var r = await M.sb.from('wallet_ledger').insert([{ user_id: v.u, kind: v.kind, label: v.label, amount_mad: Number(v.amt), notarized: true }]);
          if (r.error) return r.error.message;
          M.toast('Mouvement inscrit.');
          voice('Mouvement inscrit');
          load();
        });
      }, 'btn-g')
    ]));
    box.append(h('p', { class: 'lbl au', text: 'Demandes de règlement' }), pay, h('p', { class: 'lbl au', text: 'Reçus espèces' }), rec); await load();
  }

  /* ---------- 8. Facteurs d'émission CO2 ---------- */
  async function vFactors(box) {
    var list = h('div', { class: 'card !p-2' });
    var load = async function () {
      var r = await M.sb.from('emission_factors').select('*').order('material_type');
      if (fail(r, 'Facteurs CO₂')) return;
      var rows = r.data || [];
      list.innerHTML = '';
      list.appendChild(tbl([
        { t: 'Matériau', f: function (e) { return h('span', { class: 'font-bold text-cyberGreen', text: e.material_type }); } },
        { t: 'Facteur (kg CO₂ / kg)', f: function (e) { return M.fmt.n(e.kg_co2_per_kg, 3); } },
        { t: 'Actions', f: function (e) {
          return btn('Modifier', function () {
            M.form('Modifier facteur CO₂ — ' + e.material_type, [
              { k: 'factor', label: 'kg CO₂ évité par kg recyclé', type: 'number', step: '0.001', min: 0, value: e.kg_co2_per_kg, required: true }
            ], 'Enregistrer', async function (v) {
              var res = await M.sb.from('emission_factors').upsert({ material_type: e.material_type, kg_co2_per_kg: Number(v.factor) });
              if (res.error) return res.error.message;
              M.toast('Facteur CO₂ mis à jour.'); load();
            });
          });
        } }
      ], rows, 'Aucun facteur CO₂ configuré.'));
    };

    box.appendChild(head('Facteurs d\'émission CO₂', 'Configurez le ratio de réduction d\'émission par matériau pour alimenter les compteurs ESG du Data Lake.', [
      btn('+ Nouveau facteur', function () {
        M.form('Nouveau facteur CO₂', [
          { k: 'mat', label: 'Type de matériau (ex: PET_CLEAR)', required: true },
          { k: 'factor', label: 'kg CO₂ évité par kg recyclé', type: 'number', step: '0.001', min: 0, value: 1.82, required: true }
        ], 'Ajouter', async function (v) {
          var res = await M.sb.from('emission_factors').upsert({ material_type: v.mat.trim().toUpperCase(), kg_co2_per_kg: Number(v.factor) });
          if (res.error) return res.error.message;
          M.toast('Facteur CO₂ ajouté.'); load();
        });
      }, 'btn-g')
    ]));
    box.appendChild(list); await load();
  }

  /* ---------- 9. Data Lake — Accréditations (NOUVEAU v8.2) ---------- */
  async function vDatalake(box) {
    var list = h('div', { class: 'card !p-2' });
    var statsBox = h('div', { class: 'grid grid-cols-2 md:grid-cols-4 gap-3' });

    function generateToken() {
      var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      function block() {
        var s = '';
        for (var i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
        return s;
      }
      return 'MAAT-LK-' + block() + '-' + block();
    }

    function showTokenModal(req, token) {
      var body = h('div', { class: 'space-y-3 font-mono text-xs' });
      body.appendChild(h('p', { class: 'text-xs text-slate-300', text: 'Transmettez ce token à ' + (req.email || '—') + ' :' }));
      body.appendChild(h('code', {
        class: 'block p-3 bg-black/60 rounded-lg border border-cyberGreen/40 text-cyberGreen font-mono text-center text-base font-bold break-all',
        text: token
      }));
      body.appendChild(h('p', { class: 'text-[10px] text-slate-500 text-center', text: 'Le demandeur se connecte sur datalake.html → "Connexion Institutionnelle".' }));
      var copyBtn = h('button', {
        type: 'button', class: 'btn btn-g w-full !py-2 !text-[11px]', text: '📋 Copier le token',
        onclick: function () {
          try { navigator.clipboard.writeText(token); M.toast('Token copié.'); }
          catch (e) { prompt('Copiez manuellement :', token); }
        }
      });
      body.appendChild(copyBtn);
      M.modal('✓ Token généré — ' + (req.full_name || '—'), body);
    }

    function approve(req) {
      M.form('Approuver — ' + (req.full_name || '—'), [
        { k: 'token', label: 'Token (généré automatiquement, modifiable)', value: generateToken(), required: true },
        { k: 'note', label: 'Note interne (optionnel)', type: 'textarea' }
      ], 'Approuver et générer le token', async function (v) {
        var token = String(v.token || '').trim().toUpperCase();
        if (!/^MAAT-LK-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(token)) {
          return 'Format attendu : MAAT-LK-XXXX-XXXX (lettres/chiffres, sans I/O/0/1).';
        }
        var res = await M.sb.from('datalake_access_requests').update({
          status: 'APPROVED',
          access_token: token,
          reviewed_at: new Date().toISOString(),
          reviewed_by: A.id,
          notes: v.note || null
        }).eq('id', req.id);
        if (res.error) return res.error.message;
        M.toast('Demande approuvée · token généré.');
        voice('Demande approuvée');
        showTokenModal(req, token);
        load();
        scheduleBadges();
      });
    }

    function reject(req) {
      M.form('Rejeter — ' + (req.full_name || '—'), [
        { k: 'note', label: 'Motif du rejet (visible en interne)', type: 'textarea', required: true }
      ], 'Rejeter la demande', async function (v) {
        var res = await M.sb.from('datalake_access_requests').update({
          status: 'REJECTED',
          reviewed_at: new Date().toISOString(),
          reviewed_by: A.id,
          notes: v.note
        }).eq('id', req.id);
        if (res.error) return res.error.message;
        M.toast('Demande rejetée.');
        load();
        scheduleBadges();
      });
    }

    var load = async function () {
      // === Statistiques globales ===
      var rStats = await M.sb.from('datalake_access_requests').select('status');
      if (!rStats.error && rStats.data) {
        var counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
        rStats.data.forEach(function (r) {
          var s = (r.status || '').toUpperCase();
          if (counts[s] != null) counts[s]++;
        });
        statsBox.innerHTML = '';
        [
          ['En attente', counts.PENDING, 'text-cyberGreen', 'bd-g'],
          ['Approuvées', counts.APPROVED, 'text-kemetGoldBright', 'bd-au'],
          ['Rejetées', counts.REJECTED, 'text-red-400', 'bd-r'],
          ['Total', rStats.data.length, 'text-white', 'bd-n']
        ].forEach(function (s) {
          statsBox.appendChild(h('div', { class: 'card !p-3 text-center' },
            h('span', { class: 'text-[9px] text-slate-400 uppercase font-mono block', text: s[0] }),
            h('div', { class: 'font-mono text-2xl font-black mt-1 ' + s[2], text: String(s[1]) })
          ));
        });
      }

      // === Liste des demandes ===
      var r = await M.sb.from('datalake_access_requests').select('*').order('created_at', { ascending: false }).limit(100);
      if (fail(r, 'Data Lake')) return;
      var rows = r.data || [];

      list.innerHTML = '';
      if (!rows.length) {
        list.appendChild(h('div', { class: 'p-6 text-center text-xs font-mono text-slate-500', text: 'Aucune demande d\'accréditation reçue.' }));
        return;
      }

      list.appendChild(tbl([
        { t: 'Reçue le', f: function (x) { return M.fmt.dt(x.created_at); } },
        { t: 'Demandeur', f: function (x) {
          return h('div', null,
            h('div', { class: 'font-bold text-white', text: x.full_name || '—' }),
            h('div', { class: 'text-[10px] text-slate-400', text: x.organization || '—' }),
            h('div', { class: 'text-[10px] text-cyberGreen', text: x.email || '—' }),
            h('div', { class: 'text-[10px] text-slate-500', text: x.phone || '—' })
          );
        } },
        { t: 'Catégorie', f: function (x) {
          return h('span', { class: 'bd bd-au', text: DL_CATEGORIES[x.category] || x.category || '—' });
        } },
        { t: 'Motivation', f: function (x) {
          var m = x.motivation || '—';
          return h('div', { class: 'text-[10px] text-slate-400 max-w-xs', text: m.length > 120 ? m.slice(0, 120) + '…' : m });
        } },
        { t: 'NDA', f: function (x) { return x.nda_accepted ? '✓' : '✗'; } },
        { t: 'Statut', f: function (x) { return badge(x.status); } },
        { t: 'Token', f: function (x) {
          if (!x.access_token) return '—';
          return h('button', {
            type: 'button',
            class: 'font-mono text-[10px] text-cyberGreen hover:underline break-all text-left',
            text: x.access_token,
            title: 'Cliquer pour copier',
            onclick: function () {
              try { navigator.clipboard.writeText(x.access_token); M.toast('Token copié.'); }
              catch (e) {}
            }
          });
        } },
        { t: 'Actions', f: function (x) {
          if (x.status === 'PENDING') {
            return h('div', { class: 'flex gap-1 flex-wrap' },
              btn('✓ Approuver', function () { approve(x); }, 'btn-g'),
              btn('✕ Rejeter', function () { reject(x); }, 'btn-r')
            );
          }
          if (x.status === 'APPROVED' && x.access_token) {
            return btn('📧 Renvoyer', function () { showTokenModal(x, x.access_token); }, 'btn-o');
          }
          return null;
        } }
      ], rows, 'Aucune demande.'));
    };

    box.appendChild(head(
      'Data Lake — Accréditations',
      'Contrôlez les demandes d\'accès institutionnel au registre notarié. Chaque approbation génère un token MAAT-LK-XXXX-XXXX.',
      [ btn('⟳ Rafraîchir', function () { load(); }) ]
    ));
    box.appendChild(statsBox);
    box.appendChild(list);
    await load();
  }

  /* ---------- 10. Journal d'audit ---------- */
  async function vAudit(box) {
    var r = await M.sb.from('audit_log').select('*').order('id', { ascending: false }).limit(150);
    if (fail(r, 'Audit')) return;
    box.appendChild(head('Journal d\'audit', 'Traçabilité des opérations sensibles (comptes, clients, ritiri, pesées, contrats, virements, wallet, accréditations Data Lake).', [
      btn('⬇ CSV', function () {
        M.csv((r.data || []).map(function (a) {
          return { date: a.created_at, acteur: a.actor, action: a.action, entite: a.entity, ref: a.entity_id };
        }), 'audit');
      })
    ]));
    box.appendChild(h('div', { class: 'card !p-2' }, tbl([
      { t: 'Date', f: function (a) { return M.fmt.dt(a.created_at); } },
      { t: 'Acteur', f: function (a) { return short(a.actor); } },
      { t: 'Action', f: function (a) { return a.action; } },
      { t: 'Entité', f: function (a) { return a.entity; } },
      { t: 'Réf.', f: function (a) { return short(a.entity_id); } }
    ], r.data || [], 'Journal vide.')));
  }

  window.addEventListener('load', function () {
    M.init(); M.netInit($('netDot'), $('qBadge')); M.sw();
    if (!M.sb) { login(); return; } boot();
  });
})();
