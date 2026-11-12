/* PurKemet · dashboard.js v5.3
   HUD, KPI animés, catalogue matières dynamique (source = MAAT_MATERIALS),
   Chart.js cartésien + barres détail, ESG workflow, MFA, QR, formulaires → Supabase
   ------------------------------------------------------------
   v5.3 (Fase 5):
   - MAT_META/MAT_ORDER construits depuis window.MAAT_MATERIALS (source unique)
   - boot() : await MfaGate.done (bloquant, avant chargement data)
   - renderMatCatalog() : catalogue #matCatalog rendu dynamiquement
   - Textes "11 filières" → "10 filières"
*/
(function(){
'use strict';

/* ═══════════════════ STATE ═══════════════════ */
var S = {
  sb: null, user: null, profile: null,
  clientId: null, data: null,
  esgPeriod: 'ytd',
  mfaFactorId: null,
  tickerInterval: null,
  chartInstance: null
};

/* ═══════════════════ HELPERS ═══════════════════ */
function $(id){ return document.getElementById(id); }

function getSB(){
  return (window.Maat && window.Maat.sb) || window.supabaseClient || null;
}

function toast(msg, kind){
  var box = $('toasts');
  if (!box) { console.log('[toast]', kind || '', msg); return; }
  var d = document.createElement('div');
  d.className = 'toast ' + (kind || '');
  d.textContent = msg;
  box.appendChild(d);
  setTimeout(function(){
    d.style.opacity = '0';
    setTimeout(function(){ d.remove(); }, 300);
  }, 3800);
}

function fmtNum(n, d){ return (Number(n) || 0).toFixed(d == null ? 2 : d); }

function escapeHtml(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

function animateCounter(el, target, duration, decimals){
  if (!el) return;
  var startTxt = String(el.textContent || '0').replace(/\s/g,'').replace(',','.');
  var start = parseFloat(startTxt) || 0;
  var startTime = performance.now();
  decimals = decimals == null ? 2 : decimals;
  function step(now){
    var p = Math.min((now - startTime) / (duration || 1000), 1);
    var v = start + (target - start) * easeOutCubic(p);
    el.textContent = v.toFixed(decimals);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function makeQrSvg(text, cellSize, margin){
  try {
    if (typeof qrcode !== 'function') {
      return '<div style="color:#999;font-size:10px;padding:20px;text-align:center">QR lib manquante</div>';
    }
    var qr = qrcode(0, 'M');
    qr.addData(String(text || '—'));
    qr.make();
    return qr.createSvgTag({
      cellSize: cellSize || 4,
      margin: margin == null ? 2 : margin,
      scalable: true
    });
  } catch(e){
    console.error('[qr] error', e);
    return '<div style="color:#999;font-size:10px;padding:20px;text-align:center">QR erreur</div>';
  }
}

/* ═══════════════════ MAT META (FASE 5 · source unique = window.MAAT_MATERIALS) ═══════════════════ */
var MAT_META = {};
var MAT_ORDER = [];

function buildMatIndex(){
  var list = window.MAAT_MATERIALS || [];
  MAT_META = {};
  MAT_ORDER = [];
  list.forEach(function(m){
    MAT_META[m.id] = {
      label: m.label || m.id,
      short: m.id,
      emoji: m.icon || '♻️',
      color: m.color || '#E5E7EB',
      c2: m.c2 || m.color || '#9CA3AF',
      active: m.active !== false
    };
    MAT_ORDER.push(m.id);
  });
  console.log('[dashboard] MAT_META built · ' + MAT_ORDER.length + ' matériaux');
}
buildMatIndex();

function getMatMeta(m){
  return MAT_META[m] || { label: m || '—', short: m || '—', emoji: '♻️', color: '#E5E7EB', c2: '#9CA3AF' };
}

/* ═══════════════════ CLIENT PICKER (admin sans ?client_id) ═══════════════════ */
async function showClientPicker(){
  var loader = $('loader');
  if (!loader) return;

  // Neutraliser le spinner ::before du .loader
  loader.classList.remove('loader');
  loader.style.display = 'block';
  loader.style.padding = '20px 0';
  loader.style.width = '100%';
  loader.style.minHeight = 'auto';

  loader.innerHTML =
    '<div style="max-width:1000px;margin:20px auto;padding:0 16px;width:100%">' +
      '<div style="text-align:center;margin-bottom:24px">' +
        '<div style="display:inline-flex;width:64px;height:64px;border-radius:16px;background:rgba(232,200,106,.15);border:1px solid rgba(232,200,106,.4);align-items:center;justify-content:center;font-size:32px;margin-bottom:12px">👥</div>' +
        '<h2 style="font-family:Cinzel,serif;font-size:20px;font-weight:900;color:#E8C86A;margin:0 0 6px">Sélectionnez un Client à Inspecter</h2>' +
        '<p style="font-size:12px;color:#94A3B8;font-family:\'JetBrains Mono\',monospace;margin:0">Mode Direction · Control Tower → Fiche Client</p>' +
      '</div>' +
      '<input id="clientPickerSearch" type="text" placeholder="🔍 Rechercher un client…" ' +
        'style="width:100%;max-width:400px;display:block;margin:0 auto 20px;padding:10px 14px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.15);border-radius:10px;color:#fff;font-family:inherit;font-size:13px;outline:none;transition:border-color .2s">' +
      '<div id="clientPickerGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">' +
        '<div style="grid-column:1/-1;text-align:center;color:#94A3B8;font-family:\'JetBrains Mono\',monospace;font-size:12px;padding:40px">⏳ Chargement des clients…</div>' +
      '</div>' +
      '<div style="text-align:center;margin-top:24px">' +
        '<a href="admin.html" style="color:#00FFA3;text-decoration:underline;font-family:\'JetBrains Mono\',monospace;font-size:12px">← Retour à la Control Tower</a>' +
      '</div>' +
    '</div>';

  // Masquer QR + Print (inutiles sans client)
  var qrBtn = $('btnQrBadge');
  if (qrBtn) qrBtn.style.display = 'none';
  var iconBtns = document.querySelectorAll('.top-actions .icon-btn');
  for (var i = 0; i < iconBtns.length; i++) {
    if ((iconBtns[i].getAttribute('onclick') || '').indexOf('printBadge') !== -1) {
      iconBtns[i].style.display = 'none';
    }
  }

  // Focus border sur search
  var search = $('clientPickerSearch');
  if (search) {
    search.addEventListener('focus', function(){ this.style.borderColor = '#00FFA3'; });
    search.addEventListener('blur',  function(){ this.style.borderColor = 'rgba(255,255,255,.15)'; });
  }

  try {
    var resp = await S.sb.from('clients')
      .select('id, company_name, contact_name, district, cluster, status, horeca_category')
      .order('company_name', { ascending: true })
      .limit(200);

    if (resp.error) throw resp.error;

    var allClients = resp.data || [];
    var grid = $('clientPickerGrid');
    if (!grid) return;

    function renderGrid(items){
      if (!items.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#94A3B8;font-family:\'JetBrains Mono\',monospace;font-size:12px;padding:40px">Aucun client ne correspond.</div>';
        return;
      }
      var html = '';
      for (var j = 0; j < items.length; j++) {
        var c = items[j];
        var statusColor = c.status === 'ACTIVE' ? '#00FFA3' : c.status === 'SUSPENDED' ? '#FF5C5C' : '#94A3B8';
        html += '<a href="dashboard.html?client_id=' + encodeURIComponent(c.id) + '" ' +
          'style="display:block;padding:16px;background:rgba(15,23,42,.72);border:1px solid rgba(232,200,106,.25);border-radius:12px;text-decoration:none;color:#F1F5F9;transition:all .2s;font-family:inherit" ' +
          'onmouseover="this.style.borderColor=\'#E8C86A\';this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 8px 24px -8px rgba(232,200,106,.4)\'" ' +
          'onmouseout="this.style.borderColor=\'rgba(232,200,106,.25)\';this.style.transform=\'none\';this.style.boxShadow=\'none\'">' +
          '<div style="font-weight:700;color:#E8C86A;margin-bottom:6px;font-size:14px;line-height:1.2">' + escapeHtml(c.company_name || '—') + '</div>' +
          '<div style="font-size:11px;color:#94A3B8;font-family:\'JetBrains Mono\',monospace;margin-bottom:2px">' + escapeHtml(c.contact_name || '—') + '</div>' +
          '<div style="font-size:11px;color:#94A3B8;font-family:\'JetBrains Mono\',monospace">📍 ' + escapeHtml(c.district || c.cluster || '—') + '</div>' +
          '<div style="font-size:10px;color:' + statusColor + ';margin-top:10px;font-family:\'JetBrains Mono\',monospace;font-weight:700">' + escapeHtml(c.status || '—') + ' →</div>' +
        '</a>';
      }
      grid.innerHTML = html;
    }

    renderGrid(allClients);

    // Recherche live
    if (search) {
      search.addEventListener('input', function(){
        var q = this.value.toLowerCase().trim();
        if (!q) { renderGrid(allClients); return; }
        var filtered = allClients.filter(function(c){
          return (c.company_name || '').toLowerCase().indexOf(q) !== -1 ||
                 (c.contact_name || '').toLowerCase().indexOf(q) !== -1 ||
                 (c.district || '').toLowerCase().indexOf(q) !== -1 ||
                 (c.cluster || '').toLowerCase().indexOf(q) !== -1;
        });
        renderGrid(filtered);
      });
    }
  } catch(e) {
    console.error('[client-picker] error', e);
    var grid2 = $('clientPickerGrid');
    if (grid2) {
      grid2.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#FF5C5C;font-family:\'JetBrains Mono\',monospace;font-size:12px;padding:40px">❌ Erreur : ' + escapeHtml(e.message || 'réessayez') + '</div>';
    }
  }
}

/* ═══════════════════ BOOT ═══════════════════ */
async function boot(){
  try {
    S.sb = getSB();
    if (!S.sb) { fail('Client Supabase non initialisé. Vérifiez assets/core.js'); return; }

    var sess = await S.sb.auth.getSession();
    if (!sess || !sess.data || !sess.data.session) {
      location.href = 'index.html';
      return;
    }
    S.user = sess.data.session.user;

    var prof = await S.sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
    if (prof.error || !prof.data) { fail('Profil introuvable'); return; }
    S.profile = prof.data;

    // FASE 5 · MFA gate (Promise ne reject jamais · skip si module absent)
    if (window.MfaGate && window.MfaGate.done) {
      await window.MfaGate.done;
    }

    if (S.profile.role === 'admin' || S.profile.role === 'direction') {
      var urlP = new URLSearchParams(location.search);
      S.clientId = urlP.get('client_id');
      if (!S.clientId) {
        // v5.2 · Admin sans client_id → client picker inline
        showClientPicker();
        return;
      }
    } else {
      S.clientId = S.profile.client_id;
    }

    if (!S.clientId) { fail('Aucun client associé à ce compte.'); return; }

    await loadClient();
    renderAll();
    var loader = $('loader');
    if (loader) loader.style.display = 'none';
    var content = $('content');
    if (content) content.style.display = 'flex';
    wire();
    console.log('[dashboard] boot OK', S.data);
  } catch(e) {
    console.error('[dashboard] boot error', e);
    fail('Erreur de chargement. Réessayez.');
  }
}

function fail(msg){
  var l = $('loader');
  if (l) l.innerHTML = '<div style="color:#FF5C5C;text-align:center;padding:20px;font-family:monospace">' + escapeHtml(msg) + '</div>';
}

async function loadClient(){
  var rpc = await S.sb.rpc('get_client_dashboard_data', { p_client_id: S.clientId });
  if (rpc.error) { console.error('[dashboard] RPC error', rpc.error); throw rpc.error; }
  S.data = rpc.data || {};
}

/* ═══════════════════ RENDER ALL ═══════════════════ */
function renderAll(){
  if (!S.data) return;
  renderHero();
  renderKpis();
  renderMaterials();
  renderMatCatalog();
  renderEsg();
  renderTable();
  renderQr();
  startTicker();
}

/* FASE 5 · catalogue dynamique depuis window.MAAT_MATERIALS */
function renderMatCatalog(){
  var el = $('matCatalog');
  if (!el) return;
  var list = window.MAAT_MATERIALS || [];
  if (!list.length) {
    el.innerHTML = '<div style="color:#94A3B8;font-size:11px;padding:8px;font-family:\'JetBrains Mono\',monospace">Catalogue indisponible (materials.js non chargé).</div>';
    return;
  }
  el.innerHTML = '';
  list.forEach(function(m){
    // Affiche les actifs + ORG (phase_test)
    if (m.active === false && !m.phase_test) return;
    var item = document.createElement('div');
    item.className = 'cat-item';
    item.style.setProperty('--c', m.color || '#00FFA3');
    var emoji = document.createElement('span');
    emoji.className = 'cat-emoji';
    emoji.textContent = m.icon || '♻️';
    var label = document.createElement('span');
    label.className = 'cat-label';
    label.textContent = m.label || m.id;
    item.appendChild(emoji);
    item.appendChild(label);
    el.appendChild(item);
  });
}

/* ═══════════════════ HERO ═══════════════════ */
function renderHero(){
  var c = S.data.client || {};
  var company = c.company_name || '—';
  var badge = c.badge_qr || '—';
  var cluster = c.cluster || 'Marrakech';

  var el;
  el = $('brandCompany'); if (el) el.textContent = company.toUpperCase();
  el = $('heroCompany'); if (el) el.textContent = company;
  el = $('heroCluster'); if (el) el.textContent = cluster;
  el = $('heroBadge'); if (el) el.textContent = badge;
  el = $('heroStatus'); if (el) el.textContent = c.status || 'ACTIF';
}

/* ═══════════════════ KPI ═══════════════════ */
function renderKpis(){
  var k = S.data.kpi || {};
  animateCounter($('kpiTon'), (k.year_kg || 0) / 1000, 1200, 2);
  animateCounter($('kpiCo2'), (k.year_co2_kg || 0) / 1000, 1200, 2);

  var sub = $('kpiTonSub');
  if (sub) sub.textContent = (k.year_collections || 0) + ' collecte' + ((k.year_collections || 0) > 1 ? 's' : '');

  var prog = $('kpiProgram');
  if (prog) prog.textContent = (S.data.system_status === 'ACTIVE') ? 'Actif' : 'En attente';

  var cert = S.data.certificate;
  var st = (cert && cert.status) ? cert.status : 'DRAFT';
  var labels = { DRAFT:'Brouillon', PENDING:'En attente DG', APPROVED:'Approuvé', SEALED:'Scellé', REJECTED:'Rejeté' };
  var cs = $('kpiCertStatus');
  if (cs) cs.textContent = labels[st] || st;
}

/* ═══════════════════ MATERIALS ═══════════════════ */
function renderMaterials(){
  var rawList = S.data.by_material || [];
  var byCode = {};
  for (var r = 0; r < rawList.length; r++) {
    var it = rawList[r];
    var code = it.material;
    if (!code) continue;
    if (!byCode[code]) byCode[code] = { material: code, kg: 0, co2_kg: 0, collections: 0 };
    byCode[code].kg += Number(it.kg) || 0;
    byCode[code].co2_kg += Number(it.co2_kg) || 0;
    byCode[code].collections += Number(it.collections) || 0;
  }

  var list = MAT_ORDER.map(function(code){
    return byCode[code] || { material: code, kg: 0, co2_kg: 0, collections: 0 };
  }).sort(function(a,b){ return (b.kg||0) - (a.kg||0); });

  var withData = list.filter(function(m){ return (Number(m.kg) || 0) > 0; });

  var totalKg = list.reduce(function(s,m){ return s + (Number(m.kg) || 0); }, 0);
  var totalCo2 = list.reduce(function(s,m){ return s + (Number(m.co2_kg) || 0); }, 0);
  var totalColl = list.reduce(function(s,m){ return s + (Number(m.collections) || 0); }, 0);

  var el;
  el = $('matTotalKg'); if (el) el.textContent = (totalKg/1000).toFixed(2) + ' T';
  el = $('matCount'); if (el) el.textContent = withData.length || '0';
  el = $('matCollections'); if (el) el.textContent = totalColl || '0';
  el = $('matCo2'); if (el) el.textContent = (totalCo2/1000).toFixed(2) + ' T';

  var dom = withData[0];
  el = $('matDominant');
  if (el) el.textContent = dom ? getMatMeta(dom.material).label : '—';

  renderMaterialsChart(list);

  var container = $('matBars');
  if (!container) return;

  if (!withData.length) {
    container.innerHTML =
      '<div class="mat-empty">' +
        '<div class="mat-empty-icon">📊</div>' +
        '<div class="mat-empty-title">Aucune donnée de valorisation</div>' +
        '<div class="mat-empty-sub">Vos matières apparaîtront ici après la première collecte certifiée. Les 10 filières sont déjà enregistrées dans le Data Lake.</div>' +
      '</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < withData.length; i++) {
    var m = withData[i];
    var meta = getMatMeta(m.material);
    var kg = Number(m.kg) || 0;
    var co2 = Number(m.co2_kg) || 0;
    var coll = Number(m.collections) || 0;
    var pct = totalKg > 0 ? (kg / totalKg) * 100 : 0;
    var pctStr = pct.toFixed(1);
    var barGrad = 'linear-gradient(90deg, ' + meta.color + ', ' + meta.c2 + ')';

    html +=
      '<div class="mat-row" style="animation-delay:' + (i*70) + 'ms; color:' + meta.color + '">' +
        '<div class="mat-row-head">' +
          '<span class="mat-row-emoji">' + meta.emoji + '</span>' +
          '<span class="mat-row-name">' + escapeHtml(meta.label) + '</span>' +
          '<span class="mat-row-kg">' + kg.toFixed(2) + ' kg</span>' +
          '<span class="mat-row-pct">' + pctStr + '%</span>' +
        '</div>' +
        '<div class="mat-row-bar">' +
          '<div class="mat-row-fill" data-target="' + pctStr + '" style="background:' + barGrad + '; color:' + meta.color + '"></div>' +
        '</div>' +
        '<div class="mat-row-meta">' +
          '<span>CO₂ évité · <b>' + co2.toFixed(2) + ' kg</b></span>' +
          '<span>' + coll + ' collecte' + (coll > 1 ? 's' : '') + '</span>' +
        '</div>' +
      '</div>';
  }
  container.innerHTML = html;

  requestAnimationFrame(function(){ requestAnimationFrame(function(){
    var fills = container.querySelectorAll('.mat-row-fill');
    for (var j = 0; j < fills.length; j++) {
      var target = parseFloat(fills[j].dataset.target) || 0;
      fills[j].style.width = Math.max(target, 1.5) + '%';
    }
  }); });
}

/* ═══════════════════ CHART CARTÉSIEN MATERIALI ═══════════════════ */
function renderMaterialsChart(list){
  var canvas = $('materialsChart');
  if (!canvas) return;

  if (typeof Chart === 'undefined') {
    console.warn('[chart] Chart.js non chargé — vérifier CDN');
    return;
  }

  if (S.chartInstance) {
    try { S.chartInstance.destroy(); } catch(e){}
    S.chartInstance = null;
  }

  var hasData = list && list.length > 0;
  var labels = hasData
    ? list.map(function(m){ return getMatMeta(m.material).short || getMatMeta(m.material).label.split(' ')[0]; })
    : ['—'];
  var dataKg = hasData
    ? list.map(function(m){ return Number(m.kg) || 0; })
    : [0];
  var bgColors = hasData
    ? list.map(function(m){ return getMatMeta(m.material).color; })
    : ['rgba(148,163,184,0.25)'];
  var borderColors = hasData
    ? list.map(function(m){ return getMatMeta(m.material).c2; })
    : ['rgba(148,163,184,0.5)'];

  var hoverColors = bgColors.map(function(c){
    return /^#[0-9A-Fa-f]{6}$/.test(c) ? c + 'CC' : c;
  });

  var ctx = canvas.getContext('2d');

  S.chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Matière collectée (kg)',
        data: dataKg,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 6,
        hoverBackgroundColor: hoverColors
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 1100, easing: 'easeOutCubic' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10, 15, 20, 0.95)',
          titleColor: '#E8C86A',
          bodyColor: '#00FFA3',
          titleFont: { family: 'JetBrains Mono', size: 12, weight: '700' },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          borderColor: 'rgba(232,200,106,0.4)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            title: function(items){
              var idx = items[0].dataIndex;
              return hasData ? getMatMeta(list[idx].material).label : 'Aucune collecte';
            },
            label: function(c){ return (c.parsed.y || 0).toFixed(2) + ' kg'; }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          ticks: {
            color: '#94A3B8',
            font: { family: 'JetBrains Mono', size: 10, weight: '700' },
            maxRotation: 45, minRotation: 0, autoSkip: false
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#94A3B8',
            font: { family: 'JetBrains Mono', size: 10 },
            callback: function(v){ return v + ' kg'; }
          }
        }
      }
    }
  });
}

/* ═══════════════════ ESG ═══════════════════ */
function renderEsg(){
  var k = S.data.kpi || {};
  var period = S.esgPeriod;
  var kg, co2, coll;

  if (period === 'current_month') {
    kg = k.month_kg || 0; co2 = k.month_co2_kg || 0; coll = k.month_collections || 0;
  } else if (period === 'prev_month') {
    kg = k.prev_month_kg || 0; co2 = k.prev_month_co2_kg || 0; coll = k.prev_month_collections || 0;
  } else {
    kg = k.year_kg || 0; co2 = k.year_co2_kg || 0; coll = k.year_collections || 0;
  }

  var el;
  el = $('esgKg'); if (el) el.textContent = (kg/1000).toFixed(2) + ' T';
  el = $('esgCo2'); if (el) el.textContent = (co2/1000).toFixed(2) + ' T';
  el = $('esgCount'); if (el) el.textContent = coll || 0;

  var cert = S.data.certificate;
  var st = (cert && cert.status) ? cert.status : null;
  var icon = $('esgIcon');
  var txt = $('esgStatusTxt');
  var btn = $('esgActionBtn');

  if (!cert) {
    if (icon) icon.textContent = '📄';
    if (txt) txt.innerHTML = '<strong>Période en cours · Statut : DRAFT</strong>Certificat officiel généré à la clôture mensuelle (30/31 du mois).';
    if (btn) {
      btn.textContent = 'Demander';
      btn.disabled = (coll || 0) === 0;
      if ((coll || 0) === 0) btn.textContent = 'En attente données';
    }
  } else if (st === 'PENDING') {
    if (icon) icon.textContent = '⏳';
    var dt = cert.requested_at ? new Date(cert.requested_at).toLocaleDateString('fr-FR') : '—';
    if (txt) txt.innerHTML = '<strong>En cours d\'audit · Direction Générale</strong>Demande transmise le ' + dt + '.';
    if (btn) { btn.textContent = 'En attente'; btn.disabled = true; }
  } else if (st === 'APPROVED' || st === 'SEALED') {
    if (icon) icon.textContent = '✅';
    if (txt) txt.innerHTML = '<strong>Certifié · ' + escapeHtml(cert.period_label || 'période clôturée') + '</strong>Document officiel disponible pour téléchargement.';
    if (btn) { btn.textContent = '📥 Télécharger PDF'; btn.disabled = false; }
  } else if (st === 'REJECTED') {
    if (icon) icon.textContent = '❌';
    if (txt) txt.innerHTML = '<strong>Demande rejetée</strong>' + escapeHtml(cert.rejection_reason || 'Contactez la Direction Générale.');
    if (btn) { btn.textContent = 'Nouvelle demande'; btn.disabled = false; }
  } else {
    if (icon) icon.textContent = '📝';
    if (txt) txt.innerHTML = '<strong>Brouillon · ' + escapeHtml(cert.period_label || 'en cours') + '</strong>Finalisation à la clôture mensuelle.';
    if (btn) { btn.textContent = 'Finaliser'; btn.disabled = false; }
  }
}

function handlePeriodChange(v){
  S.esgPeriod = v || 'ytd';
  renderEsg();
}

async function handleEsgCertAction(){
  if (!S.clientId || !S.data) return;
  var cert = S.data.certificate;
  var st = cert && cert.status;

  if (st === 'APPROVED' || st === 'SEALED') {
    if (cert.pdf_url) { window.open(cert.pdf_url, '_blank'); return; }
    openEsgPdfModal();
    return;
  }
  if (st === 'PENDING') return;

  var btn = $('esgActionBtn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    var now = new Date();
    var periodLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    var resp = await S.sb.from('esg_certificates').insert([{
      client_id: S.clientId,
      period_label: periodLabel,
      status: 'PENDING',
      requested_at: now.toISOString()
    }]);

    if (resp.error) {
      if (/duplicate|unique/i.test(resp.error.message)) {
        toast('Une demande est déjà en cours pour cette période.', 'warn');
      } else {
        console.error('[esg] insert error', resp.error);
        toast('Erreur lors de la demande. Réessayez.', 'err');
      }
    } else {
      toast('✅ Demande transmise à la Direction Générale.', 'success');
    }
    await loadClient();
    renderAll();
  } catch(e) {
    console.error('[esg] exception', e);
    toast('Erreur réseau.', 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Demander'; }
  }
}

function openEsgPdfModal(){
  var cert = S.data.certificate || {};
  var client = S.data.client || {};
  var k = S.data.kpi || {};
  var modal = $('esgCertModal');
  if (!modal) return;

  var kg = (k.year_kg || 0) / 1000;
  var co2 = (k.year_co2_kg || 0) / 1000;

  var ref = cert.id ? String(cert.id).slice(0, 8).toUpperCase() : 'DRAFT-2026';
  var date = cert.requested_at ? new Date(cert.requested_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');

  var el;
  el = $('cert-ref'); if (el) el.textContent = ref;
  el = $('cert-date'); if (el) el.textContent = date;
  el = $('cert-client-name'); if (el) el.textContent = client.company_name || '—';
  el = $('cert-tonnage'); if (el) el.textContent = kg.toFixed(2) + ' T';
  el = $('cert-co2'); if (el) el.textContent = co2.toFixed(2) + ' T eq.';

  var hashEl = $('cert-hash');
  if (hashEl) {
    var hex = '';
    for (var i = 0; i < 16; i++) hex += Math.floor(Math.random()*16).toString(16);
    hashEl.textContent = '0x' + hex;
  }

  modal.classList.add('show');
}

function closeEsgPdfModal(){
  var m = $('esgCertModal');
  if (m) m.classList.remove('show');
}

function printEsgCert(){ window.print(); }

/* ═══════════════════ TABLE ═══════════════════ */
function renderTable(){
  var body = $('collectionsBody');
  if (!body) return;
  var rows = S.data.recent_collections || [];

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty-cell">Aucune pesée enregistrée · En attente du premier ramassage</td></tr>';
    return;
  }

  var html = '';
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var date = r.created_at ? new Date(r.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
    var bag = r.bag_qr_id ? escapeHtml(String(r.bag_qr_id).slice(0, 14)) : '—';
    var mat = escapeHtml(r.material_type || '—');
    var p1 = Number(r.weight_collect_kg || 0);
    var p2 = Number(r.weight_depot_kg || 0);
    var delta = (p1 && p2) ? Math.abs(p1 - p2).toFixed(2) : '—';
    var st = r.status || '—';
    var stCls = st === 'ANCHORED' ? 'status-anchored' : st === 'DISCREPANCY' ? 'status-discrepancy' : 'status-transit';
    var hash = r.blockchain_hash ? escapeHtml(String(r.blockchain_hash).slice(0, 12) + '…') : '0xPending';

    html += '<tr>' +
      '<td>' + date + '</td>' +
      '<td>' + bag + '</td>' +
      '<td>' + mat + '</td>' +
      '<td style="text-align:right">' + (p1 ? p1.toFixed(2) + ' kg' : '—') + '</td>' +
      '<td style="text-align:right">' + (p2 ? p2.toFixed(2) + ' kg' : '—') + '</td>' +
      '<td style="text-align:right">' + delta + '</td>' +
      '<td><span class="' + stCls + '">' + escapeHtml(st) + '</span></td>' +
      '<td style="text-align:right">' + hash + '</td>' +
    '</tr>';
  }
  body.innerHTML = html;
}

/* ═══════════════════ QR ═══════════════════ */
function renderQr(){
  var client = S.data.client || {};
  var badge = client.badge_qr || 'BDG-UNKNOWN';
  var company = client.company_name || '—';
  var district = client.district || client.cluster || 'Marrakech';

  var el;
  el = $('headerQrTarget'); if (el) el.innerHTML = makeQrSvg(badge, 2, 0);
  el = $('qrFullHolder'); if (el) el.innerHTML = makeQrSvg(badge, 8, 2);
  el = $('printQrTarget'); if (el) el.innerHTML = makeQrSvg(badge, 10, 2);

  el = $('qrFullCode'); if (el) el.textContent = badge;
  el = $('qrFullCompany'); if (el) el.textContent = company;
  el = $('printClientName'); if (el) el.textContent = company;
  el = $('printClientDistrict'); if (el) el.textContent = district;
  el = $('printBadgeCode'); if (el) el.textContent = badge;

  // v5.2 · Réactiver les boutons cachés par le picker
  var qrBtn = $('btnQrBadge');
  if (qrBtn) qrBtn.style.display = '';
  var iconBtns = document.querySelectorAll('.top-actions .icon-btn');
  for (var i = 0; i < iconBtns.length; i++) {
    if ((iconBtns[i].getAttribute('onclick') || '').indexOf('printBadge') !== -1) {
      iconBtns[i].style.display = '';
    }
  }
}

function openQrFullscreen(){
  var m = $('qrFullscreen');
  if (m) m.classList.add('show');
}

function closeQrFullscreen(){
  var m = $('qrFullscreen');
  if (m) m.classList.remove('show');
}

function printBadge(){
  if (S.data) renderQr();
  setTimeout(function(){ window.print(); }, 150);
}

/* ═══════════════════ MFA ═══════════════════ */
async function openMfaSetup(){
  var m = $('mfaModal');
  if (m) m.classList.add('show');
  var area = $('mfaQrArea');
  if (area) area.innerHTML = '<span style="color:#999;font-family:monospace;font-size:12px">Génération…</span>';

  try {
    var resp = await S.sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'PurKemet Client' });
    if (resp.error) throw resp.error;
    S.mfaFactorId = resp.data.id;
    var qrData = resp.data.totp && resp.data.totp.qr_code;
    if (area) {
      if (qrData && qrData.indexOf('data:') === 0) {
        area.innerHTML = '<img src="' + qrData + '" alt="QR TOTP" style="max-width:220px;height:auto">';
      } else {
        var uri = (resp.data.totp && resp.data.totp.uri) || (resp.data.totp && resp.data.totp.secret) || '';
        area.innerHTML = makeQrSvg(uri, 4, 2);
      }
    }
    toast('Scannez le QR puis saisissez le code à 6 chiffres.', 'success');
  } catch(e) {
    console.error('[mfa] enroll error', e);
    if (area) {
      area.innerHTML = '<div style="color:#c00;font-size:12px;text-align:center;padding:12px">Erreur: ' + escapeHtml(e.message || 'impossible de générer le QR') + '</div>';
    }
  }
}

function closeMfaModal(){
  var m = $('mfaModal');
  if (m) m.classList.remove('show');
  var code = $('mfaCodeInput');
  if (code) code.value = '';
}

async function handleMfaVerify(){
  var input = $('mfaCodeInput');
  var code = input ? String(input.value || '').trim() : '';
  if (code.length !== 6) { toast('Code à 6 chiffres requis', 'warn'); return; }
  if (!S.mfaFactorId) { toast('Réessayez l\'enrôlement', 'err'); return; }

  var btn = $('mfaVerifyBtn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    var ch = await S.sb.auth.mfa.challenge({ factorId: S.mfaFactorId });
    if (ch.error) throw ch.error;
    var v = await S.sb.auth.mfa.verify({ factorId: S.mfaFactorId, challengeId: ch.data.id, code: code });
    if (v.error) throw v.error;

    try { await S.sb.from('profiles').update({ mfa_enabled: true }).eq('id', S.user.id); } catch(x){}

    toast('✅ 2FA activée avec succès.', 'success');
    closeMfaModal();
  } catch(e) {
    console.error('[mfa] verify error', e);
    toast('Code invalide. Réessayez.', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Vérifier et Activer'; }
  }
}

/* ═══════════════════ TICKER ═══════════════════ */
function startTicker(){
  var el = $('heroTicker');
  if (!el) return;
  var items = [];

  var cols = (S.data.recent_collections || []).slice(0, 5);
  if (cols.length) {
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      var mat = c.material_type || 'LOT';
      var w = (c.weight_depot_kg || c.weight_collect_kg || 0);
      items.push({ label: mat, value: (Number(w) || 0).toFixed(1) + ' kg' });
    }
  } else {
    var actives = (window.MAAT_MATERIALS || []).filter(function(m){ return m.active !== false; }).length || 10;
    items = [
      { label: 'Maat Data Lake', value: 'ONLINE' },
      { label: 'Blockchain', value: 'Fabric + BTC' },
      { label: 'Node', value: 'HUB-MRK-01' },
      { label: 'Filières actives', value: String(actives) }
    ];
  }

  function renderTicker(){
    var rows = '';
    for (var j = 0; j < items.length; j++) {
      rows += '<div class="ticker-row"><span>' + escapeHtml(items[j].label) + '</span><span>' + escapeHtml(items[j].value) + '</span></div>';
    }
    el.innerHTML = rows;
  }
  renderTicker();

  if (S.tickerInterval) clearInterval(S.tickerInterval);
  S.tickerInterval = setInterval(function(){
    if (items.length > 1) {
      items.push(items.shift());
      renderTicker();
    }
  }, 4000);
}

/* ═══════════════════ FORM: ENLÈVEMENT PONCTUEL → SUPABASE ═══════════════════ */
async function handleSinglePickupSubmit(e){
  e.preventDefault();
  var dt = $('pickup_datetime');
  var bags = $('pickup_bags');
  var type = $('pickup_type');
  var mats = $('pickup_materials');
  var btn = e.target.querySelector('button[type="submit"]');
  var original = btn ? btn.textContent : 'Envoyer la Demande';

  var payload = {
    client_id: S.clientId,
    requested_by: S.user ? S.user.email : null,
    preferred_datetime: dt ? dt.value : null,
    bags_count: bags ? parseInt(bags.value, 10) || 0 : 0,
    priority: type ? type.value : 'STANDARD',
    materials: mats ? mats.value.trim() : '',
    status: 'PENDING',
    source: 'CLIENT_DASHBOARD',
    created_at: new Date().toISOString()
  };

  if (!payload.preferred_datetime || !payload.materials) {
    toast('Veuillez renseigner tous les champs obligatoires.', 'warn');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Envoi en cours…'; }

  try {
    var ok = false;

    var primary = await S.sb.from('pickup_requests').insert([payload]);
    if (!primary.error) {
      ok = true;
    } else if (!/does not exist|schema cache|relation/i.test(primary.error.message || '')) {
      console.warn('[pickup] primary table error', primary.error);
    }

    if (!ok) {
      var fallback = await S.sb.from('field_notes').insert([{
        note_type: 'PICKUP_REQUEST',
        content:
          '🚚 DEMANDE D\'ENLÈVEMENT PONCTUEL\n' +
          'Client ID: ' + S.clientId + '\n' +
          'Date souhaitée: ' + payload.preferred_datetime + '\n' +
          'Priorité: ' + payload.priority + '\n' +
          'Sacs/Bacs: ' + payload.bags_count + '\n' +
          'Matières: ' + payload.materials + '\n' +
          'Demandé par: ' + (payload.requested_by || '—'),
        operator_email: payload.requested_by || 'client@dashboard',
        gps_location: null
      }]);
      if (fallback.error) throw fallback.error;
      ok = true;
    }

    if (ok) {
      toast('✅ Demande transmise à la Control Tower. Confirmation sous 30 min.', 'success');
      e.target.reset();
      if (bags) bags.value = '5';
      fillDefaultDatetime();
    } else {
      toast('Envoi impossible. Réessayez.', 'err');
    }
  } catch(err) {
    console.error('[pickup] exception', err);
    toast('Erreur : ' + (err.message || 'réessayez'), 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

/* ═══════════════════ FORM: ENLÈVEMENT RÉCURRENT → SUPABASE ═══════════════════ */
async function handleRecurringScheduleSubmit(e){
  e.preventDefault();
  var checkboxes = e.target.querySelectorAll('input[name="schedule_days"]:checked');
  var days = [];
  for (var i = 0; i < checkboxes.length; i++) days.push(checkboxes[i].value);

  var time = $('schedule_time');
  var mats = $('schedule_materials');
  var btn = e.target.querySelector('button[type="submit"]');
  var original = btn ? btn.textContent : 'Enregistrer le Programme';

  if (!days.length) {
    toast('Sélectionnez au moins un jour.', 'warn');
    return;
  }

  var payload = {
    client_id: S.clientId,
    requested_by: S.user ? S.user.email : null,
    days: days,
    preferred_time: time ? time.value : '09:00',
    materials: mats ? mats.value.trim() : '',
    status: 'PENDING_APPROVAL',
    source: 'CLIENT_DASHBOARD',
    created_at: new Date().toISOString()
  };

  if (btn) { btn.disabled = true; btn.textContent = 'Envoi en cours…'; }

  try {
    var ok = false;

    var primary = await S.sb.from('recurring_schedules').insert([payload]);
    if (!primary.error) {
      ok = true;
    } else if (!/does not exist|schema cache|relation/i.test(primary.error.message || '')) {
      console.warn('[recurring] primary table error', primary.error);
    }

    if (!ok) {
      var fallback = await S.sb.from('field_notes').insert([{
        note_type: 'RECURRING_SCHEDULE',
        content:
          '📅 DEMANDE DE PROGRAMME RÉCURRENT\n' +
          'Client ID: ' + S.clientId + '\n' +
          'Jours: ' + days.join(', ') + '\n' +
          'Heure: ' + payload.preferred_time + '\n' +
          'Matières: ' + payload.materials + '\n' +
          'Demandé par: ' + (payload.requested_by || '—'),
        operator_email: payload.requested_by || 'client@dashboard',
        gps_location: null
      }]);
      if (fallback.error) throw fallback.error;
      ok = true;
    }

    if (ok) {
      toast('✅ Programme transmis. Validation DG sous 24h.', 'success');
    } else {
      toast('Envoi impossible. Réessayez.', 'err');
    }
  } catch(err) {
    console.error('[recurring] exception', err);
    toast('Erreur : ' + (err.message || 'réessayez'), 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

/* ═══════════════════ SCROLL / LOGOUT ═══════════════════ */
function scrollToMaterials(){
  var el = $('matSection');
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('highlight');
  setTimeout(function(){ el.classList.remove('highlight'); }, 3200);
}

async function handleClientLogout(){
  try { if (S.sb) await S.sb.auth.signOut(); } catch(e){}
  location.href = 'index.html';
}

/* ═══════════════════ WIRE ═══════════════════ */
function fillDefaultDatetime(){
  var dt = $('pickup_datetime');
  if (!dt || dt.value) return;
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  var iso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  dt.value = iso;
}

function wire(){
  var ovs = document.querySelectorAll('.overlay');
  for (var i = 0; i < ovs.length; i++) {
    (function(ov){
      ov.addEventListener('click', function(e){
        if (e.target === ov) ov.classList.remove('show');
      });
    })(ovs[i]);
  }

  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
    var ids = ['qrFullscreen', 'esgCertModal', 'mfaModal'];
    for (var k = 0; k < ids.length; k++) {
      var el = $(ids[k]);
      if (el) el.classList.remove('show');
    }
  });

  fillDefaultDatetime();
}

/* ═══════════════════ EXPORTS GLOBAUX ═══════════════════ */
window.openQrFullscreen = openQrFullscreen;
window.closeQrFullscreen = closeQrFullscreen;
window.printBadge = printBadge;
window.openMfaSetup = openMfaSetup;
window.closeMfaModal = closeMfaModal;
window.handleMfaVerify = handleMfaVerify;
window.handlePeriodChange = handlePeriodChange;
window.handleEsgCertAction = handleEsgCertAction;
window.openEsgPdfModal = openEsgPdfModal;
window.closeEsgPdfModal = closeEsgPdfModal;
window.printEsgCert = printEsgCert;
window.handleSinglePickupSubmit = handleSinglePickupSubmit;
window.handleRecurringScheduleSubmit = handleRecurringScheduleSubmit;
window.scrollToMaterials = scrollToMaterials;
window.handleClientLogout = handleClientLogout;
window.showClientPicker = showClientPicker;

/* ═══════════════════ GO ═══════════════════ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})();
