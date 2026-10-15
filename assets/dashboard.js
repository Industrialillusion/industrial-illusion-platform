/* ============================================================
   MAAT OS v8.1 — Client ESG & Waste Intelligence (dashboard.js)
   Industrial Illusion SARL · Projet PurKemet Phase 1
   ============================================================ */
(function () {
  'use strict';

  if (!window.Maat) return;
  var M = window.Maat, $ = M.$;

  var S = {
    P: null,
    client: null,
    isSuperAdmin: false,
    allClients: [],
    factors: {},
    pesees: [],
    stats: { totalKg: 0, totalCo2: 0 },
    cert: null
  };

  async function boot() {
    if (!M.sb) {
      window.location.replace('index.html#login');
      return;
    }

    var p = await M.profile();
    if (!p) {
      window.location.replace('index.html#login');
      return;
    }

    if (p.role === 'operator') {
      window.location.replace('pwa.html');
      return;
    }

    S.P = p;
    S.isSuperAdmin = (p.role === 'admin' && p.status === 'ACTIVE');

    // Carica fattori di emissione
    var rf = await M.sb.from('emission_factors').select('*');
    (rf.data || []).forEach(function (f) {
      S.factors[f.material_type] = Number(f.kg_co2_per_kg) || 1.82;
    });

    if (S.isSuperAdmin) {
      // Modalità Super-Admin: attiva la barra di ispezione DG
      var dgBar = $('dg-control-bar');
      if (dgBar) dgBar.classList.remove('hidden');

      var tag = $('access-role-tag');
      if (tag) {
        tag.textContent = 'SUPER-ADMIN (DG)';
        tag.className = 'font-bold text-kemetGoldBright bg-kemetGold/20 px-2 py-0.5 rounded border border-kemetGold/40';
      }

      // Popola selettore clienti reali
      var rClients = await M.sb.from('clients').select('*').order('company_name');
      S.allClients = rClients.data || [];
      var sel = $('dg-client-selector');
      if (sel) {
        if (!S.allClients.length) {
          sel.innerHTML = '<option value="">Aucun client en base — Créez-en un dans admin.html</option>';
        } else {
          sel.innerHTML = S.allClients.map(function (c) {
            return '<option value="' + c.id + '">' + c.company_name + ' [' + (c.horeca_category || 'B2B') + ']</option>';
          }).join('');
        }
      }

      var defaultId = S.allClients.length ? S.allClients[0].id : null;
      await loadClient(defaultId);
    } else {
      // Modalità Cliente normale: trova la scheda del cliente per email
      var rc = await M.sb.from('clients').select('*').ilike('email', p.email).maybeSingle();
      if (!rc.data) {
        M.toast('Votre compte n\'est pas encore associé à un établissement actif.', 'warn');
        if ($('client-company-name')) $('client-company-name').textContent = p.full_name || p.email;
        return;
      }
      await loadClient(rc.data.id, rc.data);
    }
  }

  async function loadClient(clientId, clientObj) {
    if (!clientId) {
      renderEmpty();
      return;
    }

    if (clientObj) {
      S.client = clientObj;
    } else {
      var r = await M.sb.from('clients').select('*').eq('id', clientId).maybeSingle();
      S.client = r.data || { id: clientId, company_name: 'Établissement B2B' };
    }

    if ($('client-company-name')) $('client-company-name').textContent = S.client.company_name;
    if ($('cert-client-title')) $('cert-client-title').textContent = S.client.company_name.toUpperCase();
    if ($('cert-ref-id')) $('cert-ref-id').textContent = 'ESG-2026-' + S.client.id.slice(0, 8).toUpperCase();
    if ($('cert-date-now')) $('cert-date-now').textContent = new Date().toLocaleDateString('fr-FR');

    // 1. Carica pesate del cliente
    var rp = await M.sb.from('collections')
      .select('*')
      .eq('client_id', S.client.id)
      .order('created_at', { ascending: false });
    S.pesees = rp.data || [];

    // 2. Carica certificato ESG attivo
    var rc = await M.sb.from('esg_certificates')
      .select('*')
      .eq('client_id', S.client.id)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    S.cert = rc.data || null;

    // 3. Calcola totali
    var totalKg = 0;
    S.pesees.forEach(function (c) {
      var w = Number(c.weight_depot_kg || c.weight_collect_kg || 0);
      totalKg += w;
    });

    var totalCo2 = 0;
    S.pesees.forEach(function (c) {
      var w = Number(c.weight_depot_kg || c.weight_collect_kg || 0);
      var factor = S.factors[c.material_type] || 1.82;
      totalCo2 += (w * factor);
    });

    S.stats.totalKg = totalKg;
    S.stats.totalCo2 = totalCo2;

    updateUI();
  }

  function updateUI() {
    var tTonnage = (S.stats.totalKg / 1000).toFixed(2);
    var tCo2 = (S.stats.totalCo2 / 1000).toFixed(2);

    if ($('kpi-tonnage')) $('kpi-tonnage').innerHTML = tTonnage + ' <span class="text-xs font-normal">T</span>';
    if ($('kpi-co2')) $('kpi-co2').innerHTML = tCo2 + ' <span class="text-xs font-normal">T eq.</span>';
    if ($('cert-tonnage-val')) $('cert-tonnage-val').textContent = tTonnage + ' T';
    if ($('cert-co2-val')) $('cert-co2-val').textContent = tCo2 + ' T';

    // Stato Certificato
    var certStatusEl = $('kpi-cert-status');
    var certBtn = $('btn-cert-action');
    if (S.cert) {
      if (S.cert.status === 'APPROVED') {
        if (certStatusEl) certStatusEl.textContent = 'DÉLIVRÉ (' + (S.cert.period_label || '2026') + ')';
        if (certBtn) {
          certBtn.className = 'w-full mt-2 btn btn-g !py-2 !text-[10px] flex items-center justify-center space-x-1';
          certBtn.innerHTML = '<span>🖨️ Télécharger Certificat PDF</span>';
        }
        if ($('cert-hash-master')) $('cert-hash-master').textContent = S.cert.certificate_hash || '0xCertifieImmuable';
        if ($('cert-ref-id') && S.cert.certificate_serial) $('cert-ref-id').textContent = S.cert.certificate_serial;
      } else {
        if (certStatusEl) certStatusEl.textContent = 'AUDIT EN COURS (DG)';
        if (certBtn) {
          certBtn.className = 'w-full mt-2 btn btn-au !py-2 !text-[10px] flex items-center justify-center space-x-1';
          certBtn.innerHTML = '<span>⏳ Examen par la Direction...</span>';
        }
      }
    } else {
      if (certStatusEl) certStatusEl.textContent = 'NON DEMANDÉ';
      if (certBtn) {
        certBtn.className = 'w-full mt-2 btn btn-o !py-2 !text-[10px] flex items-center justify-center space-x-1';
        certBtn.innerHTML = '<span>📜 Demander Attestation Officielle</span>';
      }
    }

    // Tabella Pesate
    var tbody = $('client-pesees-tbody');
    if (!tbody) return;

    if (!S.pesees.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="py-8 text-center text-slate-500 font-mono">Aucune pesée notariée pour cet établissement à ce jour.</td></tr>';
      return;
    }

    tbody.innerHTML = S.pesees.map(function (p) {
      var w1 = Number(p.weight_collect_kg || 0);
      var w2 = p.weight_depot_kg ? Number(p.weight_depot_kg) : 0;
      var deltaStr = w2 > 0 ? (w2 - w1).toFixed(2) + ' kg' : '—';
      var hashShort = p.blockchain_hash ? p.blockchain_hash.slice(0, 12) + '…' : 'En transit';
      var isAnchored = (p.status === 'ANCHORED');

      return '<tr class="border-b border-white/5 font-mono text-xs hover:bg-white/[0.02]">' +
        '<td class="py-3 px-2 text-slate-400">' + M.fmt.dt(p.created_at) + '</td>' +
        '<td class="py-3 px-2 font-bold text-white">' + p.bag_qr_id + '</td>' +
        '<td class="py-3 px-2 text-cyberGreen font-bold">' + p.material_type + '</td>' +
        '<td class="py-3 px-2 text-right">' + w1.toFixed(2) + ' kg</td>' +
        '<td class="py-3 px-2 text-right font-bold text-white">' + (w2 > 0 ? w2.toFixed(2) + ' kg' : '—') + '</td>' +
        '<td class="py-3 px-2 text-right text-kemetGoldBright">' + deltaStr + '</td>' +
        '<td class="py-3 px-2 text-slate-300 font-bold">' + (p.operator_email || 'Vecteur Assigné') + '</td>' +
        '<td class="py-3 px-2 text-center"><span class="bd ' + (isAnchored ? 'bd-g' : 'bd-au') + '">' + p.status + '</span></td>' +
        '<td class="py-3 px-2 text-right text-slate-400 text-[10px]">' + hashShort + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderEmpty() {
    var tbody = $('client-pesees-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="py-8 text-center text-slate-500">Aucun client sélectionné.</td></tr>';
  }

  // --- INTERACTION GLOBALE ---
  window.switchInspectedClient = function (clientId) {
    loadClient(clientId);
  };

  window.reloadCurrentInspectedData = function () {
    var sel = $('dg-client-selector');
    loadClient(sel ? sel.value : (S.client ? S.client.id : null));
    M.toast('Données client rafraîchies.');
  };

  window.handleClientLogout = function () {
    M.signOut().then(function () {
      window.location.replace('index.html');
    });
  };

  // Form 1: Enlèvement Ponctuel
  window.handleSinglePickupSubmit = async function (e) {
    e.preventDefault();
    if (!S.client || !S.client.id) return M.toast('Aucun client actif identifié.', 'err');

    var dt = $('pickup_datetime').value;
    var bags = $('pickup_bags').value;
    var type = $('pickup_type').value;
    var mat = $('pickup_materials').value;
    var quiet = $('pickup_quiet_window').value;
    var contact = $('pickup_contact').value;

    var btn = $('btn-submit-single');
    btn.disabled = true;
    btn.textContent = 'Transmission…';

    var res = await M.sb.from('pickups').insert([{
      client_id: S.client.id,
      scheduled_at: new Date(dt).toISOString(),
      materials: mat + ' (~' + bags + ' sacs, ' + type + ', Quiet: ' + quiet + ')',
      status: 'PLANNED',
      requested_by_client: true,
      contact_person: contact || S.client.contact_name,
      contact_phone: S.client.phone
    }]);

    btn.disabled = false;
    btn.textContent = 'Envoyer Demande d\'Enlèvement';

    if (res.error) {
      M.toast('Erreur transmission : ' + res.error.message, 'err');
      return;
    }

    M.toast('Demande d\'enlèvement enregistrée sous SLA garanti.');
    e.target.reset();
  };

  // Form 2: Programme Récurrent
  window.handleRecurringScheduleSubmit = async function (e) {
    e.preventDefault();
    if (!S.client || !S.client.id) return M.toast('Aucun client actif identifié.', 'err');

    var days = Array.from(document.querySelectorAll('input[name="schedule_days"]:checked')).map(function (c) { return c.value; });
    var time = $('schedule_time').value;
    var mat = $('schedule_materials').value;

    if (!days.length) return M.toast('Sélectionnez au moins un jour.', 'warn');

    var btn = $('btn-submit-recurring');
    btn.disabled = true;
    btn.textContent = 'Enregistrement…';

    var noteStr = 'Programme Récurrent : ' + days.join(', ') + ' à ' + time + ' (' + mat + ')';
    var res = await M.sb.from('clients').update({ cluster: (S.client.cluster || 'Marrakech') + ' · ' + days.slice(0, 2).join('&') + ' ' + time }).eq('id', S.client.id);

    btn.disabled = false;
    btn.textContent = 'Enregistrer le Programme Continu';

    if (res.error) {
      M.toast('Erreur : ' + res.error.message, 'err');
      return;
    }

    if ($('kpi-schedule')) $('kpi-schedule').textContent = days.slice(0, 2).join(' & ') + ' • ' + time;
    M.toast('Programme récurrent activé : les créneaux sont insérés dans la tournée.');
  };

  // Flusso Certificato ESG
  window.handleEsgCertAction = async function () {
    if (!S.client || !S.client.id) return;

    if (S.cert && S.cert.status === 'APPROVED') {
      $('esgCertModal').classList.remove('hidden');
      return;
    }

    if (S.cert && S.cert.status === 'PENDING') {
      M.toast('Votre demande pour la période en cours est en cours d\'audit par la Direction Générale.', 'warn');
      return;
    }

    // Nuova richiesta tramite RPC
    var period = 'Bilan Annuel ' + new Date().getFullYear();
    var res = await M.sb.rpc('request_esg_certificate', {
      p_client_id: S.client.id,
      p_period: period
    });

    if (res.error) {
      M.toast('Erreur : ' + res.error.message, 'err');
      return;
    }

    M.toast('Demande de certificat officiel transmise à la Direction.');
    loadClient(S.client.id);
  };

  window.closeEsgPdfModal = function () {
    $('esgCertModal').classList.add('hidden');
  };

  window.printEsgCert = function () {
    window.print();
  };

  window.addEventListener('load', function () {
    M.init();
    boot();
  });
})();
