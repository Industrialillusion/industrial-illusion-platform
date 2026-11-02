/* ============================================================
   MAAT OS v8.1 — Client ESG Dashboard v2.0
   Industrial Illusion SARL · PurKemet Phase 1
   ZERO MOCK · RPC agrégée · badge header + fullscreen + print
   ============================================================ */
(function () {
  'use strict';

  if (!window.Maat) return;
  var M = window.Maat, $ = M.$;

  var S = {
    P: null,
    isStaff: false,
    allClients: [],
    clientId: null,
    data: null,
    qrSvg: null
  };

  /* ─── Utils ─────────────────────────────────────────────────────── */
  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
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

  /* ─── QR génération SVG ────────────────────────────────────────── */
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

  /* ─── Boot ─────────────────────────────────────────────────────── */
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
        tag.textContent = 'SUPER-ADMIN (DG)';
        tag.className = 'font-bold text-kemetGoldBright bg-kemetGold/20 px-2 py-0.5 rounded border border-kemetGold/40';
      }
      var rClients = await M.sb.from('clients').select('id, company_name, horeca_category').order('company_name');
      S.allClients = rClients.data || [];
      var sel = $('dg-client-selector');
      if (sel) {
        if (!S.allClients.length) {
          sel.innerHTML = '<option value="">Aucun client en base</option>';
        } else {
          sel.innerHTML = S.allClients.map(function (c) {
            return '<option value="' + c.id + '">' + escapeHtml(c.company_name) + ' [' + escapeHtml(c.horeca_category || 'B2B') + ']</option>';
          }).join('');
        }
      }
      var defaultId = S.allClients.length ? S.allClients[0].id : null;
      await loadClient(defaultId);
    } else {
      if (!p.client_id) {
        toast('Votre compte n\'est pas associé à un établissement. Contactez la Direction.', 'warn');
        if ($('client-company-name')) $('client-company-name').textContent = p.full_name || p.email;
        return;
      }
      await loadClient(p.client_id);
    }
  }

  /* ─── Chargement via RPC ───────────────────────────────────────── */
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

  /* ─── Rendering principal ──────────────────────────────────────── */
  function renderAll() {
    var d = S.data;
    if (!d || !d.client) { renderEmpty(); return; }

    // Header
    if ($('client-company-name')) $('client-company-name').textContent = d.client.company_name || '—';

    // KPI
    var yearKg = Number(d.kpi.year_kg || 0);
    var yearCo2 = Number(d.kpi.year_co2_kg || 0);
    var tTonnage = (yearKg / 1000).toFixed(2);
    var tCo2 = (yearCo2 / 1000).toFixed(2);

    if ($('kpi-tonnage')) $('kpi-tonnage').innerHTML = tTonnage + ' <span class="text-xs font-normal">T</span>';
    if ($('kpi-co2')) $('kpi-co2').innerHTML = tCo2 + ' <span class="text-xs font-normal">T eq.</span>';

    var schedEl = $('kpi-schedule');
    if (schedEl) {
      schedEl.textContent = d.system_status === 'READY_FIRST_COLLECTION'
        ? 'Prêt pour 1ère collecte' : 'Programme actif';
    }

    // Badge QR (header + print + fullscreen)
    renderBadgeWidget(d.client);

    // Certificat ESG
    renderCertStatus(d.certificate, d.client);

    // Tableau pesées
    renderCollectionsTable(d.recent_collections || []);

    // Répartition matières
    renderByMaterial(d.by_material || []);
  }

  /* ─── Badge QR : header + fullscreen + print ───────────────────── */
  function renderBadgeWidget(client) {
    var widget = $('header-badge-widget');
    var qrContainer = $('header-badge-qr');
    var printQr = $('print-qr-container');

    if (!client.badge_qr) {
      // Pas de badge : masquer le widget
      if (widget) widget.classList.remove('ready');
      if (qrContainer) qrContainer.innerHTML = '';
      return;
    }

    var svg = generateQrSvg(client.badge_qr, 4);
    S.qrSvg = svg;

    // Header widget
    if (widget) widget.classList.add('ready');
    if (qrContainer) {
      qrContainer.innerHTML = svg
        ? svg.replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" ')
        : '<span style="font-size:8px;color:#666">—</span>';
      // Forcer la taille dans le widget
      var svgEl = qrContainer.querySelector('svg');
      if (svgEl) {
        svgEl.setAttribute('width', '40');
        svgEl.setAttribute('height', '40');
      }
    }

    // Print QR (grand format)
    if (printQr) printQr.innerHTML = svg || '';

    // Remplir le printable
    if ($('print-client-name')) $('print-client-name').textContent = client.company_name || '—';
    if ($('print-client-district')) $('print-client-district').textContent = (client.district || client.cluster || '—');
    if ($('print-badge-code')) $('print-badge-code').textContent = client.badge_qr;

    // Fullscreen modal pre-rempli
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

  /* ─── Certificat ESG ───────────────────────────────────────────── */
  function renderCertStatus(cert, client) {
    var statusEl = $('kpi-cert-status');
    var btn = $('btn-cert-action');

    // Pré-remplir le modal
    if ($('cert-client-title')) $('cert-client-title').textContent = (client.company_name || '').toUpperCase();
    if ($('cert-ref-id')) $('cert-ref-id').textContent = cert && cert.certificate_serial
      ? cert.certificate_serial
      : 'ESG-' + new Date().getFullYear() + '-' + (client.id || '').slice(0, 8).toUpperCase();
    if ($('cert-date-now')) $('cert-date-now').textContent = new Date().toLocaleDateString('fr-FR');
    if ($('cert-tonnage-val')) $('cert-tonnage-val').textContent = ((Number(S.data.kpi.year_kg) || 0) / 1000).toFixed(2) + ' T';
    if ($('cert-co2-val')) $('cert-co2-val').textContent = ((Number(S.data.kpi.year_co2_kg) || 0) / 1000).toFixed(2) + ' T';
    if ($('cert-hash-master')) $('cert-hash-master').textContent = cert && cert.certificate_hash
      ? cert.certificate_hash
      : '0xPending — En attente de clôture mensuelle';

    if (!cert) {
      if (statusEl) statusEl.textContent = 'DRAFT · Aucune demande';
      if (btn) {
        btn.className = 'w-full mt-2 btn btn-o !py-2 !text-[10px] flex items-center justify-center space-x-1';
        btn.innerHTML = '<span>📜 Demander clôture certifiée</span>';
      }
      return;
    }
    if (cert.status === 'APPROVED' || cert.status === 'SEALED') {
      if (statusEl) statusEl.textContent = 'DÉLIVRÉ · ' + (cert.period_label || '');
      if (btn) {
        btn.className = 'w-full mt-2 btn btn-g !py-2 !text-[10px] flex items-center justify-center space-x-1';
        btn.innerHTML = '<span>🖨️ Voir Certificat Officiel</span>';
      }
    } else if (cert.status === 'PENDING' || cert.status === 'DRAFT') {
      if (statusEl) statusEl.textContent = 'EN COURS · ' + (cert.period_label || '');
      if (btn) {
        btn.className = 'w-full mt-2 btn btn-au !py-2 !text-[10px] flex items-center justify-center space-x-1';
        btn.innerHTML = '<span>⏳ Audit Direction en cours</span>';
      }
    } else if (cert.status === 'REJECTED') {
      if (statusEl) statusEl.textContent = 'REJETÉ';
      if (btn) {
        btn.className = 'w-full mt-2 btn btn-o !py-2 !text-[10px] flex items-center justify-center space-x-1';
        btn.innerHTML = '<span>📜 Nouvelle demande</span>';
      }
    }
  }

  /* ─── Tableau pesées ───────────────────────────────────────────── */
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
        '<td class="py-3 px-2 font-bold text-white">' + escapeHtml(p.bag_qr_id) + '</td>' +
        '<td class="py-3 px-2 text-cyberGreen font-bold">' + escapeHtml(p.material_type) + '</td>' +
        '<td class="py-3 px-2 text-right">' + (w1 > 0 ? w1.toFixed(2) + ' kg' : '—') + '</td>' +
        '<td class="py-3 px-2 text-right font-bold text-white">' + (w2 != null ? w2.toFixed(2) + ' kg' : '—') + '</td>' +
        '<td class="py-3 px-2 text-right text-kemetGoldBright">' + deltaStr + '</td>' +
        '<td class="py-3 px-2 text-slate-300">' + escapeHtml(p.operator_email || '—') + '</td>' +
        '<td class="py-3 px-2 text-center"><span class="inline-block px-2 py-0.5 rounded border text-[10px] font-bold ' + statusClass + '">' + escapeHtml(p.status) + '</span></td>' +
        '<td class="py-3 px-2 text-right text-slate-400 text-[10px]">' + hashShort + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ─── Répartition matières ─────────────────────────────────────── */
  function renderByMaterial(materials) {
    var container = $('client-materials-section');
    if (!container) return;

    if (!materials.length) {
      container.innerHTML =
        '<div class="glass-card p-6 text-center font-mono text-xs text-slate-400">' +
        '📊 Aucune donnée de matériaux enregistrée · En attente de la première collecte' +
        '</div>';
      return;
    }

    var maxKg = Math.max.apply(null, materials.map(function (m) { return Number(m.kg) || 0; })) || 1;

    container.innerHTML =
      '<div class="glass-card p-6 space-y-4">' +
      '  <h3 class="font-kemetTitle text-lg font-bold text-white border-b border-white/10 pb-3">Répartition par Matière (Année en cours)</h3>' +
      '  <div class="space-y-3 font-mono text-xs">' +
      materials.map(function (m) {
        var kg = Number(m.kg) || 0;
        var pct = (kg / maxKg * 100).toFixed(0);
        var co2 = Number(m.co2_kg) || 0;
        return '<div>' +
          '<div class="flex justify-between mb-1">' +
          '<span class="font-bold text-cyberGreen">' + escapeHtml(m.material) + '</span>' +
          '<span class="text-slate-300">' + kg.toFixed(2) + ' kg · ' + co2.toFixed(2) + ' kg CO₂</span>' +
          '</div>' +
          '<div class="w-full bg-black/40 rounded-full h-2"><div class="bg-cyberGreen h-2 rounded-full" style="width:' + pct + '%"></div></div>' +
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

  /* ─── Actions globales ─────────────────────────────────────────── */
  window.switchInspectedClient = function (clientId) {
    loadClient(clientId);
  };

  window.reloadCurrentInspectedData = function () {
    var sel = $('dg-client-selector');
    loadClient(sel ? sel.value : S.clientId);
    toast('Données rafraîchies.');
  };

  window.handleClientLogout = function () {
    M.signOut().then(function () { window.location.replace('index.html'); });
  };

  /* ─── Form enlèvement ponctuel ─────────────────────────────────── */
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
      materials: ($('pickup_materials').value || '') +
        ' (~' + $('pickup_bags').value + ' sacs, ' + $('pickup_type').value +
        ', Quiet: ' + $('pickup_quiet_window').value + ')',
      status: 'PLANNED',
      contact_person: $('pickup_contact').value || (S.data && S.data.client.contact_name) || null,
      contact_phone: (S.data && S.data.client.phone) || null
    };

    var res = await M.sb.from('pickups').insert([payload]);
    btn.disabled = false;
    btn.textContent = origText;

    if (res.error) {
      toast('Erreur : ' + res.error.message, 'err');
      return;
    }
    toast('✅ Demande d\'enlèvement enregistrée.');
    e.target.reset();
  };

  /* ─── Form récurrent ───────────────────────────────────────────── */
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

  /* ─── Certificat ESG ───────────────────────────────────────────── */
  window.handleEsgCertAction = async function () {
    if (!S.clientId) return;
    var cert = S.data && S.data.certificate;
    if (cert && (cert.status === 'APPROVED' || cert.status === 'SEALED')) {
      $('esgCertModal').classList.remove('hidden');
      return;
    }
    if (cert && (cert.status === 'PENDING' || cert.status === 'DRAFT')) {
      toast('Votre demande est en cours d\'audit par la Direction.', 'warn');
      return;
    }
    var resp = await M.sb.from('esg_certificates').insert([{
      client_id: S.clientId,
      period_label: 'Bilan ' + new Date().getFullYear(),
      status: 'PENDING',
      requested_at: new Date().toISOString()
    }]);
    if (resp.error) { toast('Erreur : ' + resp.error.message, 'err'); return; }
    toast('✅ Demande de certificat transmise à la Direction.');
    loadClient(S.clientId);
  };

  window.closeEsgPdfModal = function () { $('esgCertModal').classList.add('hidden'); };
  window.printEsgCert = function () { window.print(); };

  /* ─── Init ─────────────────────────────────────────────────────── */
  window.addEventListener('load', function () {
    M.init();
    boot();
  });
})();
