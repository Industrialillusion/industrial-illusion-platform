/* ==========================================================================
 *  assets/dashboard.js
 *  Maat OS · Client ESG Dashboard v3.0
 *  - RPC agrégée get_client_dashboard_data
 *  - Badge QR header + fullscreen + print
 *  - Sélecteur temporel ESG (mois / prev / YTD) avec recalcul dynamique
 *  - Certificat 4 états (DRAFT / PENDING / SEALED / REJECTED)
 *  - MFA TOTP opt-in (Supabase auth.mfa)
 *  - WhatsApp dynamique avec nom client
 *  - ZERO MOCK · données réelles uniquement
 * ========================================================================== */
(function () {
  'use strict';

  if (!window.Maat) {
    console.error('[Dashboard] Maat kernel missing');
    return;
  }
  var M = window.Maat, $ = M.$;

  var WA_PHONE = '212708875960';

  var S = {
    P: null,
    isStaff: false,
    allClients: [],
    clientId: null,
    data: null,
    currentPeriod: 'ytd',
    mfa: {
      factorId: null,
      challengeId: null,
      step: 'init' // init | qr | verify | done
    }
  };

  /* ═══════════════════════════════════════════════════════════════════
     Utils
     ═══════════════════════════════════════════════════════════════════ */
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function toast(msg, kind) {
    if (M.toast) M.toast(msg, kind === 'err' ? 'err' : (kind === 'warn' ? 'warn' : undefined));
    else console.log('[Dashboard]', msg);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return '—'; }
  }

  function fmtKg(v) {
    var n = Number(v) || 0;
    return n < 1000 ? n.toFixed(0) + ' kg' : (n / 1000).toFixed(2) + ' T';
  }

  function fmtT(v) {
    var n = Number(v) || 0;
    return (n / 1000).toFixed(2);
  }

  function generateQrSvg(code, cellSize) {
    if (!code || !window.qrcode) return null;
    try {
      var qr = window.qrcode(0, 'H');
      qr.addData(code);
      qr.make();
      return qr.createSvgTag({ cellSize: cellSize || 4, margin: 2, scalable: true });
    } catch (e) {
      console.error('[Dashboard] QR error:', e);
      return null;
    }
  }

  function setWaLink(companyName) {
    var wa = document.querySelector('.float-wa');
    if (!wa) return;
    var txt = companyName
      ? 'Bonjour PurKemet, ' + companyName + ' souhaite programmer un enlèvement express.'
      : 'Bonjour PurKemet, je souhaite programmer un enlèvement express.';
    wa.href = 'https://wa.me/' + WA_PHONE + '?text=' + encodeURIComponent(txt);
  }

  /* ═══════════════════════════════════════════════════════════════════
     Boot
     ═══════════════════════════════════════════════════════════════════ */
  async function boot() {
    if (!M.sb) { window.location.replace('index.html#login'); return; }
    var p = await M.profile();
    if (!p) { window.location.replace('index.html#login'); return; }

    S.P = p;
    S.isStaff = (p.role === 'admin' || p.role === 'direction') && p.status === 'ACTIVE';

    if (S.isStaff) {
      var dgBar = $('dg-control-bar');
      if (dgBar) dgBar.classList.remove('hidden');
      var tag = $('access-role-tag');
      if (tag) {
        tag.textContent = 'SUPER-ADMIN';
        tag.className = 'font-bold text-kemetGoldBright bg-kemetGold/20 px-2 py-0.5 rounded border border-kemetGold/40';
      }
      var rClients = await M.sb.from('clients').select('id, company_name, horeca_category').order('company_name');
      S.allClients = rClients.data || [];
      var sel = $('dg-client-selector');
      if (sel) {
        if (!S.allClients.length) {
          sel.innerHTML = '<option value="">Aucun client</option>';
        } else {
          sel.innerHTML = S.allClients.map(function (c) {
            return '<option value="' + c.id + '">' + esc(c.company_name) + ' [' + esc(c.horeca_category || 'B2B') + ']</option>';
          }).join('');
        }
      }
      var defaultId = S.allClients.length ? S.allClients[0].id : null;
      await loadClient(defaultId);
    } else {
      if (!p.client_id) {
        toast('Compte non associé à un établissement. Contactez la Direction.', 'warn');
        if ($('client-company-name')) $('client-company-name').textContent = p.full_name || p.email;
        return;
      }
      await loadClient(p.client_id);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     Data loading
     ═══════════════════════════════════════════════════════════════════ */
  async function loadClient(clientId) {
    if (!clientId) { renderEmpty(); return; }
    S.clientId = clientId;

    var resp = await M.sb.rpc('get_client_dashboard_data', { p_client_id: clientId });
    if (resp.error) {
      toast('Erreur de chargement : ' + resp.error.message, 'err');
      console.error('[Dashboard] RPC error:', resp.error);
      return;
    }
    S.data = resp.data || null;
    renderAll();
  }

  /* ═══════════════════════════════════════════════════════════════════
     Rendering principal
     ═══════════════════════════════════════════════════════════════════ */
  function renderAll() {
    var d = S.data;
    if (!d || !d.client) { renderEmpty(); return; }

    if ($('client-company-name')) $('client-company-name').textContent = d.client.company_name || '—';

    // KPI global (YTD toujours sur la vue d'accueil)
    var yearKg = Number(d.kpi.year_kg || 0);
    var yearCo2 = Number(d.kpi.year_co2_kg || 0);

    if ($('kpi-tonnage')) $('kpi-tonnage').innerHTML = fmtT(yearKg) + ' <span class="text-xs font-normal">T</span>';
    if ($('kpi-co2')) $('kpi-co2').innerHTML = fmtT(yearCo2) + ' <span class="text-xs font-normal">T eq.</span>';

    if ($('kpi-schedule')) {
      $('kpi-schedule').textContent = d.system_status === 'READY_FIRST_COLLECTION'
        ? 'Prêt pour 1ère collecte' : 'Programme actif';
    }

    renderBadgeWidget(d.client);
    renderCertStatus(d.certificate, d.client);
    renderCertPreview(S.currentPeriod);
    renderCollectionsTable(d.recent_collections || []);
    renderByMaterial(d.by_material || []);
    setWaLink(d.client.company_name);

    // Init période ESG une fois
    var esgSel = $('esg-period-select');
    if (esgSel) esgSel.value = S.currentPeriod;
  }

  /* ═══════════════════════════════════════════════════════════════════
     Badge QR + Fullscreen + Print
     ═══════════════════════════════════════════════════════════════════ */
  function renderBadgeWidget(client) {
    var widget = $('header-badge-widget');
    var qrContainer = $('header-badge-qr');
    var printQr = $('print-qr-container');

    if (!client.badge_qr) {
      if (widget) widget.classList.remove('ready');
      if (qrContainer) qrContainer.innerHTML = '';
      return;
    }

    var svg = generateQrSvg(client.badge_qr, 4);

    if (widget) widget.classList.add('ready');
    if (qrContainer) {
      qrContainer.innerHTML = svg || '<span style="font-size:8px;color:#666">—</span>';
      var svgEl = qrContainer.querySelector('svg');
      if (svgEl) {
        svgEl.setAttribute('width', '40');
        svgEl.setAttribute('height', '40');
      }
    }
    if (printQr) printQr.innerHTML = svg || '';
    if ($('print-client-name')) $('print-client-name').textContent = client.company_name || '—';
    if ($('print-client-district')) $('print-client-district').textContent = (client.district || client.cluster || '—');
    if ($('print-badge-code')) $('print-badge-code').textContent = client.badge_qr;

    if ($('fullscreen-client-name')) $('fullscreen-client-name').textContent = client.company_name || '—';
    if ($('fullscreen-badge-code')) $('fullscreen-badge-code').textContent = client.badge_qr;

    var fullscreenQr = $('fullscreen-qr-container');
    if (fullscreenQr) {
      var bigSvg = generateQrSvg(client.badge_qr, 8);
      fullscreenQr.innerHTML = bigSvg || '';
      var svgBig = fullscreenQr.querySelector('svg');
      if (svgBig) {
        svgBig.setAttribute('width', '320');
        svgBig.setAttribute('height', '320');
      }
    }
  }

  window.openQrFullscreen = function () {
    if (!S.data || !S.data.client || !S.data.client.badge_qr) {
      toast('Badge non disponible', 'warn');
      return;
    }
    var m = $('qrFullscreenModal');
    if (m) m.classList.remove('hidden');
  };

  window.closeQrFullscreen = function () {
    var m = $('qrFullscreenModal');
    if (m) m.classList.add('hidden');
  };

  window.printBadge = function () {
    if (!S.data || !S.data.client || !S.data.client.badge_qr) {
      toast('Badge non disponible', 'warn');
      return;
    }
    window.print();
  };

  /* ═══════════════════════════════════════════════════════════════════
     Certificat ESG · 4 états + période dynamique
     ═══════════════════════════════════════════════════════════════════ */
  function renderCertStatus(cert, client) {
    var statusEl = $('kpi-cert-status');
    var btn = $('btn-cert-action');

    // Pré-remplir modale PDF
    if ($('cert-client-title')) $('cert-client-title').textContent = (client.company_name || '').toUpperCase();
    if ($('cert-ref-id')) $('cert-ref-id').textContent = (cert && cert.certificate_serial) || 'ESG-' + new Date().getFullYear() + '-' + (client.id || '').slice(0, 8).toUpperCase();
    if ($('cert-date-now')) $('cert-date-now').textContent = (cert && cert.approved_at)
      ? new Date(cert.approved_at).toLocaleDateString('fr-FR')
      : '—';
    if ($('cert-hash-master')) $('cert-hash-master').textContent = (cert && cert.certificate_hash) || '—';

    if (!cert) {
      if (statusEl) statusEl.textContent = 'DRAFT · Aucune demande';
      if (btn) {
        btn.className = 'w-full mt-2 btn btn-o !py-2 !text-[10px] flex items-center justify-center space-x-1';
        btn.innerHTML = '<span>📜 Demander la Certification</span>';
      }
      return;
    }
    if (cert.status === 'APPROVED' || cert.status === 'SEALED') {
      if (statusEl) statusEl.textContent = 'SEALED · ' + (cert.period_label || '');
      if (btn) {
        btn.className = 'w-full mt-2 btn btn-g !py-2 !text-[10px] flex items-center justify-center space-x-1';
        btn.innerHTML = '<span>🖨️ Voir Certificat Officiel</span>';
      }
    } else if (cert.status === 'PENDING' || cert.status === 'AUDITING' || cert.status === 'DRAFT') {
      if (statusEl) statusEl.textContent = 'PENDING · ' + (cert.period_label || '');
      if (btn) {
        btn.className = 'w-full mt-2 btn btn-au !py-2 !text-[10px] flex items-center justify-center space-x-1';
        btn.innerHTML = '<span>⏳ Audit en cours</span>';
      }
    } else if (cert.status === 'REJECTED') {
      if (statusEl) statusEl.textContent = 'REJETÉ';
      if (btn) {
        btn.className = 'w-full mt-2 btn btn-o !py-2 !text-[10px] flex items-center justify-center space-x-1';
        btn.innerHTML = '<span>📜 Nouvelle demande</span>';
      }
    }
  }

  window.handlePeriodChange = function (period) {
    S.currentPeriod = period || 'ytd';
    renderCertPreview(S.currentPeriod);
  };

  function renderCertPreview(period) {
    if (!S.data || !S.data.kpi) return;
    var k = S.data.kpi;
    var kg, co2, cnt;

    if (period === 'current_month') {
      kg = Number(k.month_kg || 0);
      co2 = Number(k.month_co2_kg || 0);
      cnt = Number(k.month_collections || 0);
    } else if (period === 'prev_month') {
      kg = Number(k.prev_month_kg || 0);
      co2 = Number(k.prev_month_co2_kg || 0);
      cnt = Number(k.prev_month_collections || 0);
    } else {
      kg = Number(k.year_kg || 0);
      co2 = Number(k.year_co2_kg || 0);
      cnt = Number(k.year_collections || 0);
    }

    if ($('cert-preview-kg')) $('cert-preview-kg').innerHTML = fmtT(kg) + ' <span class="text-xs font-normal">T</span>';
    if ($('cert-preview-co2')) $('cert-preview-co2').innerHTML = fmtT(co2) + ' <span class="text-xs font-normal">T eq.</span>';
    if ($('cert-preview-count')) $('cert-preview-count').textContent = String(cnt);

    if ($('cert-tonnage-val')) $('cert-tonnage-val').textContent = fmtT(kg) + ' T';
    if ($('cert-co2-val')) $('cert-co2-val').textContent = fmtT(co2) + ' T';

    renderCertWorkflow(S.data.certificate, kg, cnt);
  }

  function renderCertWorkflow(cert, periodKg, periodCnt) {
    var wrap = $('esg-cert-workflow');
    if (!wrap) return;

    var html = '';

    if (!cert) {
      html =
        '<div class="flex items-start gap-3">' +
        '<span class="text-2xl">📄</span>' +
        '<div class="flex-1">' +
        '<p class="text-kemetGoldBright font-bold mb-1">Statut : DRAFT · Aucune certification demandée</p>' +
        '<p class="text-slate-300">Les données ci-dessus sont une <strong>anteprima</strong>. La certification officielle, avec valeur légale Loi 28-00, est vidimée manuellement par la Direction Générale après audit.</p>' +
        (periodCnt === 0
          ? '<p class="text-slate-400 text-[10px] mt-2 italic">Aucune collecte enregistrée sur cette période.</p>'
          : '<p class="text-slate-400 text-[10px] mt-2 italic">Clôture mensuelle officielle : dernier jour du mois calendaire.</p>') +
        '</div></div>';
    } else if (cert.status === 'PENDING' || cert.status === 'AUDITING') {
      html =
        '<div class="flex items-start gap-3">' +
        '<span class="text-2xl">⏳</span>' +
        '<div class="flex-1">' +
        '<p class="text-kemetGoldBright font-bold mb-1">Demande en cours d\'audit</p>' +
        '<p class="text-slate-300">' + esc(cert.period_label || '') + ' · Les données de pesée sont en phase de <strong>vérification manuelle</strong> par la Direction Générale pour la vidimation du certificat officiel.</p>' +
        '<p class="text-slate-400 text-[10px] mt-2 italic">Vous recevrez une notification dès la signature.</p>' +
        '</div></div>';
    } else if (cert.status === 'APPROVED' || cert.status === 'SEALED') {
      html =
        '<div class="flex items-start gap-3">' +
        '<span class="text-2xl">✅</span>' +
        '<div class="flex-1">' +
        '<p class="text-cyberGreen font-bold mb-1">Certificat Vidimé &amp; Ancré</p>' +
        '<p class="text-slate-300">' + esc(cert.period_label || '') + ' · Certificat officiel signé par la Direction Générale, ancré cryptographiquement sur le Maat Data Lake.</p>' +
        '<p class="text-slate-400 text-[10px] mt-2 italic">Hash : ' + esc((cert.certificate_hash || '').slice(0, 32)) + '…</p>' +
        '</div></div>';
    } else if (cert.status === 'REJECTED') {
      html =
        '<div class="flex items-start gap-3">' +
        '<span class="text-2xl">❌</span>' +
        '<div class="flex-1">' +
        '<p class="text-red-400 font-bold mb-1">Demande rejetée</p>' +
        '<p class="text-slate-300">' + esc(cert.rejection_note || 'Motif non spécifié.') + '</p>' +
        '</div></div>';
    }
    wrap.innerHTML = html;
  }

  window.handleEsgCertAction = async function () {
    if (!S.clientId) { toast('Client non identifié', 'warn'); return; }
    var cert = S.data && S.data.certificate;

    if (cert && (cert.status === 'APPROVED' || cert.status === 'SEALED')) {
      var modal = $('esgCertModal');
      if (modal) modal.classList.remove('hidden');
      return;
    }
    if (cert && (cert.status === 'PENDING' || cert.status === 'AUDITING')) {
      toast('Votre demande est en cours d\'audit par la Direction.', 'warn');
      return;
    }

    var btn = $('btn-cert-action');
    if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }

    try {
      var now = new Date();
      var periodLabel = 'Bilan ' + now.getFullYear() + ' · ' + (now.getMonth() + 1) + '/' + now.getFullYear();
      var resp = await M.sb.from('esg_certificates').insert([{
        client_id: S.clientId,
        period_label: periodLabel,
        status: 'PENDING',
        requested_at: now.toISOString()
      }]);
      if (resp.error) {
        if (/duplicate|unique/i.test(resp.error.message)) {
          toast('Une demande existe déjà pour cette période.', 'warn');
          await loadClient(S.clientId);
          return;
        }
        console.error('[ESG] insert error:', resp.error);
        toast('Erreur lors de la demande.', 'err');
        return;
      }
      toast('✅ Demande de certification transmise à la Direction Générale.');
      await loadClient(S.clientId);
    } catch (e) {
      console.error('[ESG] exception:', e);
      toast('Erreur réseau.', 'err');
    } finally {
      if (btn) { btn.disabled = false; }
    }
  };

  window.closeEsgPdfModal = function () { var m = $('esgCertModal'); if (m) m.classList.add('hidden'); };
  window.printEsgCert = function () { window.print(); };

  /* ═══════════════════════════════════════════════════════════════════
     Tableau pesées
     ═══════════════════════════════════════════════════════════════════ */
  function renderCollectionsTable(collections) {
    var tbody = $('client-pesees-tbody');
    if (!tbody) return;

    if (!collections.length) {
      tbody.innerHTML =
        '<tr><td colspan="9" class="py-10 text-center text-slate-400 font-mono text-xs">' +
        '🕊 Aucune pesée enregistrée pour cet établissement.<br>' +
        '<span class="text-[10px] text-slate-500 mt-2 block">En attente du premier ramassage · Système prêt à recevoir les données certifiées.</span>' +
        '</td></tr>';
      return;
    }

    tbody.innerHTML = collections.map(function (p) {
      var w1 = Number(p.weight_collect_kg || 0);
      var w2 = p.weight_depot_kg != null ? Number(p.weight_depot_kg) : null;
      var delta = (w2 != null && w1 > 0) ? ((w2 - w1) / w1 * 100) : null;
      var deltaStr = delta != null ? delta.toFixed(2) + ' %' : '—';
      var hashShort = p.blockchain_hash ? p.blockchain_hash.slice(0, 12) + '…' : '—';
      var isAnchored = p.status === 'ANCHORED';
      var statusClass = isAnchored
        ? 'bg-cyberGreen/20 text-cyberGreen border-cyberGreen/40'
        : (p.status === 'DISCREPANCY' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-kemetGold/20 text-kemetGold border-kemetGold/40');

      return '<tr class="border-b border-white/5 font-mono text-xs hover:bg-white/[0.02]">' +
        '<td class="py-3 px-2 text-slate-400">' + fmtDate(p.created_at) + '</td>' +
        '<td class="py-3 px-2 font-bold text-white">' + esc(p.bag_qr_id) + '</td>' +
        '<td class="py-3 px-2 text-cyberGreen font-bold">' + esc(p.material_type) + '</td>' +
        '<td class="py-3 px-2 text-right">' + (w1 > 0 ? w1.toFixed(2) + ' kg' : '—') + '</td>' +
        '<td class="py-3 px-2 text-right font-bold text-white">' + (w2 != null ? w2.toFixed(2) + ' kg' : '—') + '</td>' +
        '<td class="py-3 px-2 text-right text-kemetGoldBright">' + deltaStr + '</td>' +
        '<td class="py-3 px-2 text-slate-300">' + esc(p.operator_email || '—') + '</td>' +
        '<td class="py-3 px-2 text-center"><span class="inline-block px-2 py-0.5 rounded border text-[10px] font-bold ' + statusClass + '">' + esc(p.status) + '</span></td>' +
        '<td class="py-3 px-2 text-right text-slate-400 text-[10px]">' + hashShort + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ═══════════════════════════════════════════════════════════════════
     Répartition matériaux
     ═══════════════════════════════════════════════════════════════════ */
  function renderByMaterial(materials) {
    var container = $('client-materials-section');
    if (!container) return;

    if (!materials.length) {
      container.innerHTML =
        '<div class="glass-card p-8 text-center font-mono text-xs text-slate-400 space-y-2">' +
        '<div class="text-3xl mb-1">📊</div>' +
        '<div class="text-cyberGreen font-bold">Aucune matière collectée pour le moment</div>' +
        '<div class="text-[10px] text-slate-500">La première collecte alimentera cette section en temps réel.</div>' +
        '</div>';
      return;
    }

    var maxKg = Math.max.apply(null, materials.map(function (m) { return Number(m.kg) || 0; })) || 1;

    container.innerHTML =
      '<div class="glass-card p-6 space-y-4">' +
      '  <h3 class="font-kemetTitle text-lg font-bold text-white border-b border-white/10 pb-3">Répartition par Matière (YTD)</h3>' +
      '  <div class="space-y-3 font-mono text-xs">' +
      materials.map(function (m) {
        var kg = Number(m.kg) || 0;
        var pct = (kg / maxKg * 100).toFixed(0);
        var co2 = Number(m.co2_kg) || 0;
        return '<div>' +
          '<div class="flex justify-between mb-1">' +
          '<span class="font-bold text-cyberGreen">' + esc(m.material) + '</span>' +
          '<span class="text-slate-300">' + fmtKg(kg) + ' · ' + fmtKg(co2) + ' CO₂</span>' +
          '</div>' +
          '<div class="w-full bg-black/40 rounded-full h-2"><div class="bg-gradient-to-r from-cyberGreen to-cyberGreen/60 h-2 rounded-full transition-all" style="width:' + pct + '%"></div></div>' +
          '</div>';
      }).join('') +
      '  </div>' +
      '</div>';
  }

  function renderEmpty() {
    if ($('client-pesees-tbody')) {
      $('client-pesees-tbody').innerHTML =
        '<tr><td colspan="9" class="py-8 text-center text-slate-500">Aucun établissement sélectionné.</td></tr>';
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     MFA TOTP · opt-in
     ═══════════════════════════════════════════════════════════════════ */
  window.openMfaSetup = async function () {
    var modal = $('mfaModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    // Reset state
    S.mfa = { factorId: null, challengeId: null, step: 'init' };

    var qrArea = $('mfa-qr-area');
    var verifyArea = $('mfa-verify-area');
    var actionBtn = $('mfa-action-btn');
    var content = $('mfa-content');

    if (qrArea) qrArea.classList.add('hidden');
    if (verifyArea) verifyArea.classList.add('hidden');
    if (actionBtn) { actionBtn.textContent = 'Configurer'; actionBtn.disabled = false; }

    // Check si déjà activé
    try {
      var aal = await M.sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.data && aal.data.currentLevel === 'aal2') {
        if (content) content.innerHTML =
          '<div class="text-center py-4"><div class="text-3xl mb-2">✅</div>' +
          '<p class="text-cyberGreen font-bold">MFA déjà activé sur votre compte</p>' +
          '<p class="text-[11px] text-slate-400 mt-2">Chaque connexion requiert un code à 6 chiffres.</p></div>';
        if (actionBtn) actionBtn.textContent = 'Fermer';
        actionBtn.onclick = window.closeMfaModal;
        return;
      }
    } catch (e) { /* ignore */ }
  };

  window.closeMfaModal = function () {
    var modal = $('mfaModal');
    if (modal) modal.classList.add('hidden');
    // restore onclick
    var actionBtn = $('mfa-action-btn');
    if (actionBtn) {
      actionBtn.textContent = 'Configurer';
      actionBtn.onclick = window.handleMfaAction;
    }
  };

  window.handleMfaAction = async function () {
    var actionBtn = $('mfa-action-btn');
    var content = $('mfa-content');
    var qrArea = $('mfa-qr-area');
    var verifyArea = $('mfa-verify-area');
    var codeInput = $('mfa-verify-code');

    if (S.mfa.step === 'init') {
      // Step 1 : enrol
      actionBtn.disabled = true;
      actionBtn.textContent = 'Génération du QR…';
      try {
        // Cleanup dangling unverified factors
        try {
          var factors = await M.sb.auth.mfa.listFactors();
          if (factors && factors.data && factors.data.totp) {
            for (var i = 0; i < factors.data.totp.length; i++) {
              var f = factors.data.totp[i];
              if (f.status === 'unverified') {
                await M.sb.auth.mfa.unenroll({ factorId: f.id });
              }
            }
          }
        } catch (e) { /* ignore */ }

        var enroll = await M.sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Maat OS · ' + (S.P && S.P.email || 'client') });
        if (enroll.error) throw enroll.error;

        S.mfa.factorId = enroll.data.id;
        S.mfa.step = 'qr';

        if (qrArea && enroll.data.totp && enroll.data.totp.qr_code) {
          qrArea.innerHTML = '<img src="' + enroll.data.totp.qr_code + '" alt="QR TOTP" style="max-width:100%;height:auto;border-radius:8px">';
          qrArea.classList.remove('hidden');
        }
        if (content) content.innerHTML =
          '<p class="text-cyberGreen font-bold mb-1">Étape 1/2 · Scanner le QR</p>' +
          '<p class="text-slate-300 text-[11px]">Ouvrez Google Authenticator (ou équivalent), ajoutez un compte, puis scannez le QR ci-dessous.</p>' +
          '<p class="text-slate-400 text-[10px] mt-1">Secret manuel : <code class="text-kemetGoldBright">' +
          esc(enroll.data.totp.secret || '') + '</code></p>';
        if (verifyArea) verifyArea.classList.remove('hidden');
        if (codeInput) { codeInput.value = ''; codeInput.focus(); }
        actionBtn.disabled = false;
        actionBtn.textContent = 'Vérifier le code';
      } catch (e) {
        console.error('[MFA] enrol error:', e);
        toast('Erreur MFA : ' + (e.message || e), 'err');
        actionBtn.disabled = false;
        actionBtn.textContent = 'Réessayer';
      }
      return;
    }

    if (S.mfa.step === 'qr') {
      var code = (codeInput && codeInput.value || '').trim();
      if (!/^\d{6}$/.test(code)) { toast('Entrez un code à 6 chiffres.', 'warn'); return; }

      actionBtn.disabled = true;
      actionBtn.textContent = 'Vérification…';
      try {
        var chal = await M.sb.auth.mfa.challenge({ factorId: S.mfa.factorId });
        if (chal.error) throw chal.error;
        S.mfa.challengeId = chal.data.id;

        var verify = await M.sb.auth.mfa.verify({
          factorId: S.mfa.factorId,
          challengeId: S.mfa.challengeId,
          code: code
        });
        if (verify.error) throw verify.error;

        S.mfa.step = 'done';
        if (content) content.innerHTML =
          '<div class="text-center py-4"><div class="text-3xl mb-2">✅</div>' +
          '<p class="text-cyberGreen font-bold">MFA activé avec succès</p>' +
          '<p class="text-[11px] text-slate-400 mt-2">À chaque connexion, un code à 6 chiffres sera requis.</p></div>';
        if (qrArea) qrArea.classList.add('hidden');
        if (verifyArea) verifyArea.classList.add('hidden');
        actionBtn.disabled = false;
        actionBtn.textContent = 'Fermer';
        actionBtn.onclick = window.closeMfaModal;
        toast('✅ MFA activé', false);
      } catch (e) {
        console.error('[MFA] verify error:', e);
        toast('Code invalide. Réessayez.', 'err');
        actionBtn.disabled = false;
        actionBtn.textContent = 'Vérifier le code';
      }
    }
  };

  /* ═══════════════════════════════════════════════════════════════════
     Actions globales
     ═══════════════════════════════════════════════════════════════════ */
  window.switchInspectedClient = function (clientId) { loadClient(clientId); };

  window.reloadCurrentInspectedData = function () {
    var sel = $('dg-client-selector');
    loadClient(sel ? sel.value : S.clientId);
    toast('Données rafraîchies.');
  };

  window.handleClientLogout = function () {
    M.signOut().then(function () { window.location.replace('index.html'); });
  };

  /* Formulaire enlèvement ponctuel */
  window.handleSinglePickupSubmit = async function (e) {
    e.preventDefault();
    if (!S.clientId) return toast('Aucun client actif.', 'err');
    var btn = $('btn-submit-single');
    btn.disabled = true;
    var origText = btn.textContent;
    btn.textContent = 'Transmission…';

    var payload = {
      client_id: S.clientId,
      scheduled_at: new Date($('pickup_datetime').value).toISOString(),
      materials: ($('pickup_materials').value || '') + ' (~' + $('pickup_bags').value + ' sacs, ' + $('pickup_type').value + ', Quiet: ' + $('pickup_quiet_window').value + ')',
      status: 'PLANNED',
      contact_person: $('pickup_contact').value || (S.data && S.data.client.contact_name) || null,
      contact_phone: (S.data && S.data.client.phone) || null
    };

    var res = await M.sb.from('pickups').insert([payload]);
    btn.disabled = false;
    btn.textContent = origText;

    if (res.error) { toast('Erreur : ' + res.error.message, 'err'); return; }
    toast('✅ Demande d\'enlèvement enregistrée.');
    e.target.reset();
  };

  /* Formulaire récurrent */
  window.handleRecurringScheduleSubmit = async function (e) {
    e.preventDefault();
    if (!S.clientId) return toast('Aucun client actif.', 'err');
    var days = Array.from(document.querySelectorAll('input[name="schedule_days"]:checked')).map(function (c) { return c.value; });
    if (!days.length) return toast('Sélectionnez au moins un jour.', 'warn');

    var btn = $('btn-submit-recurring');
    btn.disabled = true;
    var origText = btn.textContent;
    btn.textContent = 'Enregistrement…';

    var note = 'Programme Récurrent : ' + days.join(', ') + ' à ' + $('schedule_time').value + ' (' + $('schedule_materials').value + ')';
    var res = await M.sb.from('pickups').insert([{
      client_id: S.clientId,
      scheduled_at: new Date().toISOString(),
      materials: note,
      status: 'RECURRING',
      contact_person: (S.data && S.data.client.contact_name) || null,
      contact_phone: (S.data && S.data.client.phone) || null
    }]);

    btn.disabled = false;
    btn.textContent = origText;
    if (res.error) { toast('Erreur : ' + res.error.message, 'err'); return; }
    toast('✅ Programme récurrent enregistré.');
    if ($('kpi-schedule')) $('kpi-schedule').textContent = days.slice(0, 2).join(' & ') + ' · ' + $('schedule_time').value;
  };

  /* Init */
  window.addEventListener('load', function () {
    M.init();
    boot();
  });
})();
