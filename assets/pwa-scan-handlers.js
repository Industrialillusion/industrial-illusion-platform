/* ==========================================================================
 *  assets/pwa-scan-handlers.js
 *  Maat OS · Scanner QR Handlers
 *  ------------------------------------------------------------
 *  v2.0.0 (FASE 6 · cleanup finale):
 *
 *  Rimosso (dead code che chiamava RPC inesistenti in DB):
 *  - handleBagP1 / handleBagP2 / openP2WeighModal / showVarianceResult / showWeighModal
 *  - showModalError / showSuccessToast / esc (utilisé uniquement par weigh modal)
 *  - resizeImage / uploadPhoto / attachPhotoToCollection
 *  - getCurrentVectorId / getGpsPosition
 *  - Queue IndexedDB (maat_queue): qOpenDb / qEnqueue / qGetAll / qRemove / qCount /
 *    qDrain / updateQueueBadge / window.MaatQueue / listener online / boot drain
 *    → ces chemins appelaient validate_and_claim_bag et register_depot_weighing_p2
 *      qui N'EXISTENT PAS dans Supabase (crash silencieux + warnings console).
 *
 *  Conservé:
 *  - handleBadge · validate_badge_qr RPC + GPS Point B + emit 'maat:client-context'
 *  - handleDepot · checkin_depot_station RPC
 *  - showBadgeResult / showDepotResult / showError
 *  - Listener 'maat:scan' · badge + depot uniquement
 *    (bag → vues vCollect / vDepot dans pwa.js via S.onBagScan)
 *
 *  ⚠️ GPS Point B fonctionne uniquement si window.S.activePickupId est défini
 *     (pwa.js Fase 3a). Silencieux sinon.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatScanHandlersLoaded) return;
  window.__MaatScanHandlersLoaded = true;

  const log  = (...a) => console.log('[ScanHandler]', ...a);
  const warn = (...a) => console.warn('[ScanHandler]', ...a);

  /* ═══════════════════════════════════════════════════════════════════════
     Client Supabase (lazy)
     ═══════════════════════════════════════════════════════════════════════ */
  function getClient() {
    const cands = [window.Maat && window.Maat.sb, window.maatSupabase,
                   window.supabaseClient, window.sb];
    for (const c of cands) {
      if (c && typeof c.rpc === 'function') return c;
    }
    try {
      if (window.Maat && typeof window.Maat.init === 'function') {
        window.Maat.init();
        if (window.Maat.sb) return window.Maat.sb;
      }
    } catch (_) {}
    return null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Helper DOM
     ═══════════════════════════════════════════════════════════════════════ */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function buildModal() {
    const modal = el('div', 'maat-scan-modal');
    const card = el('div', 'maat-scan-modal__card');
    modal.appendChild(card);
    document.body.appendChild(modal);
    return { modal, card };
  }

  function closeModal(modal) { try { modal.remove(); } catch (e) {} }

  function infoRow(label, value) {
    const row = el('div', null);
    row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;font-family:"JetBrains Mono",monospace;font-size:0.72rem';
    const l = el('span', null, label + ':');
    l.style.color = '#64748B';
    const v = el('span', null, String(value));
    v.style.color = '#E2E8F0';
    v.style.fontWeight = '700';
    v.style.textAlign = 'right';
    row.appendChild(l);
    row.appendChild(v);
    return row;
  }

  function showError(msg) {
    if (window.Maat && typeof window.Maat.toast === 'function') {
      window.Maat.toast(msg, 'err'); return;
    }
    let t = document.getElementById('maat-scan-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'maat-scan-toast';
      t.className = 'maat-scan-toast maat-scan-toast--err';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('is-visible');
    setTimeout(() => t.classList.remove('is-visible'), 3000);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     BADGE HANDLER · validate_badge_qr + GPS Point B + maat:client-context
     ═══════════════════════════════════════════════════════════════════════ */
  async function handleBadge(scan) {
    const sb = getClient();
    if (!sb) { showError('Service Supabase indisponible'); return; }

    const { modal, card } = buildModal();
    card.appendChild(el('div', 'maat-scan-modal__icon', '⏳'));
    card.appendChild(el('h3', 'maat-scan-modal__title', 'Validation badge…'));

    try {
      const { data, error } = await sb.rpc('validate_badge_qr', { p_qr_code: scan.token });
      if (error) throw error;
      if (!data || !data.valid) { closeModal(modal); showError('Badge invalide ou révoqué'); return; }

      log('badge valid:', data);
      closeModal(modal);

      if (data.owner_type === 'client') {
        try {
          sessionStorage.setItem('maat_current_client', JSON.stringify({
            client_id: data.client_id,
            company_name: data.company_name,
            cluster: data.cluster,
            contact_name: data.contact_name,
            phone: data.phone,
            timestamp: Date.now()
          }));
          log('client context saved:', data.company_name);
        } catch (e) {}

        // GPS Point B (client) sur la mission active
        // ⚠️ window.S exposé par pwa.js (Fase 3a). Silencieux sinon.
        try {
          var activeId = window.S && window.S.activePickupId;
          if (activeId && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              async function (pos) {
                try {
                  await sb.from('pickups').update({
                    gps_client_lat: pos.coords.latitude,
                    gps_client_lng: pos.coords.longitude,
                    badge_scanned_at: new Date().toISOString()
                  }).eq('id', activeId);
                  log('GPS Point B saved on pickup', activeId);
                } catch (e) { warn('GPS Point B update failed:', e); }
              },
              function () { /* GPS refusé → fallback trigger DB côté serveur */ },
              { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 }
            );
          }
        } catch (e) {}

        // Notify vues vCollect (refresh header client)
        try {
          window.dispatchEvent(new CustomEvent('maat:client-context', {
            detail: {
              client_id: data.client_id,
              company_name: data.company_name,
              cluster: data.cluster
            }
          }));
        } catch (e) {}
      }
      showBadgeResult(data);
    } catch (err) {
      console.error('[ScanHandler] validate_badge_qr failed:', err);
      closeModal(modal);
      showError('Erreur: ' + (err.message || err));
    }
  }

  function showBadgeResult(data) {
    const isClient = data.owner_type === 'client';
    const { modal, card } = buildModal();
    card.appendChild(el('div', 'maat-scan-modal__icon', isClient ? '🏨' : '🪪'));
    card.appendChild(el('h3', 'maat-scan-modal__title', data.company_name || data.full_name || '—'));
    card.appendChild(el('span', 'maat-scan-modal__badge maat-scan-modal__badge--badge',
      isClient ? 'Établissement' : 'Utilisateur'));
    const info = el('div', null);
    info.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    if (isClient) {
      if (data.contact_name) info.appendChild(infoRow('Contact', data.contact_name));
      if (data.phone) info.appendChild(infoRow('Téléphone', data.phone));
      if (data.email) info.appendChild(infoRow('Email', data.email));
      if (data.city) info.appendChild(infoRow('Ville', data.city));
      if (data.cluster) info.appendChild(infoRow('Cluster', data.cluster));
    } else {
      if (data.email) info.appendChild(infoRow('Email', data.email));
      if (data.phone) info.appendChild(infoRow('Téléphone', data.phone));
      if (data.wallet_mad != null) info.appendChild(infoRow('Kemet Wallet', data.wallet_mad + ' MAD'));
    }
    card.appendChild(info);
    card.appendChild(el('div', 'maat-scan-modal__token', data.qr_code || '—'));
    const actions = el('div', 'maat-scan-modal__actions');
    const closeBtn = el('button', 'maat-scan-btn maat-scan-btn--primary', 'Fermer');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => closeModal(modal));
    actions.appendChild(closeBtn);
    card.appendChild(actions);
    setTimeout(() => { if (document.body.contains(modal)) closeModal(modal); }, 10000);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     DEPOT HANDLER · checkin_depot_station
     ═══════════════════════════════════════════════════════════════════════ */
  async function handleDepot(scan) {
    const sb = getClient();
    if (!sb) { showError('Service Supabase indisponible'); return; }
    const { modal, card } = buildModal();
    card.appendChild(el('div', 'maat-scan-modal__icon', '⏳'));
    card.appendChild(el('h3', 'maat-scan-modal__title', 'Check-in dépôt…'));
    try {
      const { data, error } = await sb.rpc('checkin_depot_station', { p_depot_qr: scan.token });
      if (error) throw error;
      log('depot checkin:', data);
      closeModal(modal);
      try {
        sessionStorage.setItem('maat_active_depot_session', JSON.stringify({
          depot_id: data.depot_id, depot_code: data.depot_code,
          depot_name: data.depot_name, cluster: data.cluster,
          bags: data.bags || [], started_at: Date.now()
        }));
      } catch (e) {}
      showDepotResult(data);
    } catch (err) {
      console.error('[ScanHandler] checkin_depot_station failed:', err);
      closeModal(modal);
      showError('Erreur: ' + (err.message || err));
    }
  }

  function showDepotResult(data) {
    const { modal, card } = buildModal();
    card.appendChild(el('div', 'maat-scan-modal__icon', '🏭'));
    card.appendChild(el('h3', 'maat-scan-modal__title', data.depot_name || '—'));
    card.appendChild(el('span', 'maat-scan-modal__badge maat-scan-modal__badge--depot', 'Dépôt actif'));
    card.appendChild(el('div', 'maat-scan-modal__token', data.depot_code));

    const info = el('div', null);
    info.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    info.appendChild(infoRow('Cluster', data.cluster || '—'));
    info.appendChild(infoRow('Sacs en transit', String(data.bag_count || 0)));
    card.appendChild(info);

    if (data.bags && data.bags.length > 0) {
      const listTitle = el('p', 'maat-scan-modal__body');
      listTitle.innerHTML = '<strong>Sacs en transit · ouvrez l\'onglet « Dépôt » pour la P2 :</strong>';
      card.appendChild(listTitle);

      const list = el('div', null);
      list.style.cssText = 'max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:6px';

      data.bags.forEach(bag => {
        const row = el('div', null);
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,163,0.2);border-radius:8px;font-family:"JetBrains Mono",monospace;font-size:0.7rem;color:#00FFA3';

        const lbl = el('span', null, bag.bag_qr_id + ' · P1 ' + bag.weight_collect_kg + ' kg');
        lbl.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

        row.appendChild(lbl);
        list.appendChild(row);
      });
      card.appendChild(list);
    } else {
      card.appendChild(el('p', 'maat-scan-modal__body', 'Aucun sac en transit à réceptionner.'));
    }

    const actions = el('div', 'maat-scan-modal__actions');
    const closeBtn = el('button', 'maat-scan-btn maat-scan-btn--primary', 'Fermer');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => closeModal(modal));
    actions.appendChild(closeBtn);
    card.appendChild(actions);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LISTENER maat:scan · badge + depot (bag → vues pwa.js)
     ═══════════════════════════════════════════════════════════════════════ */
  window.addEventListener('maat:scan', (e) => {
    if (!e || !e.detail) return;
    const scan = e.detail;
    log('received:', scan.type, scan.token);
    if (scan.type === 'badge') { e.preventDefault(); handleBadge(scan); return; }
    if (scan.type === 'depot') { e.preventDefault(); handleDepot(scan); return; }
    // bag → S.onBagScan (vCollect / vDepot dans pwa.js)
  });

  log('ready v2.0.0 · Phase 6 cleanup · badge + depot only');
})();
