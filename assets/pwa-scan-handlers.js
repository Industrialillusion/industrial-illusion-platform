/* ==========================================================================
 *  assets/pwa-scan-handlers.js
 *  Maat OS · Scanner QR Handlers (Phase 5.3.B.2 + 5.3.B.3a)
 *  Business logic per eventi 'maat:scan' emessi da pwa-scan.js
 *
 *  B.2:  Badge → validate_badge_qr · Depot → checkin_depot_station
 *  B.3a: Bag P1/P2 → weigh input modal (UI only, RPC in B.3b)
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatScanHandlersLoaded) return;
  window.__MaatScanHandlersLoaded = true;

  const log  = (...a) => console.log('[ScanHandler]', ...a);
  const warn = (...a) => console.warn('[ScanHandler]', ...a);

  /* ─── Client Supabase ────────────────────────────────────────────────── */
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

  /* ─── Helper DOM ─────────────────────────────────────────────────────── */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  /* ─── Modal factory (riusa stili .maat-scan-modal__card) ─────────────── */
  function buildModal() {
    const modal = el('div', 'maat-scan-modal');
    const card = el('div', 'maat-scan-modal__card');
    modal.appendChild(card);
    document.body.appendChild(modal);
    return { modal, card };
  }

  function closeModal(modal) {
    try { modal.remove(); } catch (e) {}
  }

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

  /* ═══════════════════════════════════════════════════════════════════════
     B.2 · HANDLERS BADGE + DEPOT
     ═══════════════════════════════════════════════════════════════════════ */

  /* ─── Handler BADGE → validate_badge_qr ──────────────────────────────── */
  async function handleBadge(scan) {
    const sb = getClient();
    if (!sb) { showError('Service Supabase indisponible'); return; }

    const { modal, card } = buildModal();
    card.appendChild(el('div', 'maat-scan-modal__icon', '⏳'));
    card.appendChild(el('h3', 'maat-scan-modal__title', 'Validation badge…'));

    try {
      const { data, error } = await sb.rpc('validate_badge_qr', { p_qr_code: scan.token });
      if (error) throw error;

      if (!data || !data.valid) {
        closeModal(modal);
        showError('Badge invalide ou révoqué');
        return;
      }

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
            timestamp: Date.now(),
          }));
          log('client context saved:', data.company_name);
        } catch (e) {}
      }

      showBadgeResult(data);
    } catch (err) {
      console.error('[ScanHandler] validate_badge_qr failed:', err);
      closeModal(modal);
      showError('Erreur: ' + (err.message || err));
    }
  }

  /* ─── Modal risultato badge ──────────────────────────────────────────── */
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
      if (data.horeca_category) info.appendChild(infoRow('Catégorie', data.horeca_category));
    } else {
      if (data.email) info.appendChild(infoRow('Email', data.email));
      if (data.phone) info.appendChild(infoRow('Téléphone', data.phone));
      if (data.cluster) info.appendChild(infoRow('Cluster', data.cluster));
      if (data.vehicle) info.appendChild(infoRow('Véhicule', data.vehicle));
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

  /* ─── Handler DEPOT → checkin_depot_station ──────────────────────────── */
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
          depot_id: data.depot_id,
          depot_code: data.depot_code,
          depot_name: data.depot_name,
          cluster: data.cluster,
          bags: data.bags || [],
          started_at: Date.now(),
        }));
        log('depot session saved:', data.depot_code);
      } catch (e) {}

      showDepotResult(data);
    } catch (err) {
      console.error('[ScanHandler] checkin_depot_station failed:', err);
      closeModal(modal);
      showError('Erreur: ' + (err.message || err));
    }
  }

  /* ─── Modal risultato depot ──────────────────────────────────────────── */
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
      listTitle.innerHTML = '<strong>Sac à réceptionner (P2):</strong>';
      card.appendChild(listTitle);

      const list = el('div', null);
      list.style.cssText = 'max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:6px';
      data.bags.forEach(bag => {
        const item = el('div', null);
        item.style.cssText = 'padding:8px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,163,0.2);border-radius:8px;font-family:"JetBrains Mono",monospace;font-size:0.7rem;color:#00FFA3';
        item.textContent = bag.bag_qr_id + ' · P1 ' + bag.weight_collect_kg + ' kg';
        list.appendChild(item);
      });
      card.appendChild(list);
    }

    const actions = el('div', 'maat-scan-modal__actions');
    const closeBtn = el('button', 'maat-scan-btn maat-scan-btn--primary', 'Fermer');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => closeModal(modal));
    actions.appendChild(closeBtn);
    card.appendChild(actions);
  }

  /* ─── Error toast ────────────────────────────────────────────────────── */
  function showError(msg) {
    if (window.Maat && typeof window.Maat.toast === 'function') {
      window.Maat.toast(msg, 'err');
      return;
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
     B.3a · WEIGH INPUT (P1 / P2) — UI only, RPC in B.3b
     ═══════════════════════════════════════════════════════════════════════ */

  /* ─── P1 · raccolta hotel ────────────────────────────────────────────── */
  function handleBagP1(scan) {
    let clientCtx = null;
    try {
      const raw = sessionStorage.getItem('maat_current_client');
      if (raw) clientCtx = JSON.parse(raw);
    } catch (_) {}

    if (!clientCtx || !clientCtx.client_id) {
      showModalError(
        '🏨',
        'Contexte client manquant',
        'Scannez d\'abord le badge de l\'établissement (réception hôtel).'
      );
      return;
    }

    showWeighModal({
      mode: 'p1',
      scan,
      contextLabel: 'Collecte · ' + (clientCtx.company_name || 'Client'),
      contextSub: clientCtx.cluster ? 'Cluster ' + clientCtx.cluster : '',
      onConfirm: function(weight) {
        try {
          sessionStorage.setItem('maat_pending_p1', JSON.stringify({
            bag_qr: scan.token,
            weight_kg: weight,
            client_id: clientCtx.client_id,
            client_name: clientCtx.company_name,
            cluster: clientCtx.cluster,
            timestamp: Date.now()
          }));
        } catch (_) {}
        log('P1 weight:', weight, 'kg for', scan.token, '(RPC pending B.3b)');
        showSuccessToast('P1 · ' + weight + ' kg enregistré · ' + scan.token);
      }
    });
  }

  /* ─── P2 · ricezione depot ───────────────────────────────────────────── */
  function handleBagP2(scan) {
    let depotCtx = null;
    try {
      const raw = sessionStorage.getItem('maat_active_depot_session');
      if (raw) depotCtx = JSON.parse(raw);
    } catch (_) {}

    if (!depotCtx || !depotCtx.depot_code) {
      showModalError(
        '🏭',
        'Dépôt non identifié',
        'Scannez d\'abord le QR de la station dépôt.'
      );
      return;
    }

    showWeighModal({
      mode: 'p2',
      scan,
      contextLabel: 'Réception · ' + (depotCtx.depot_name || depotCtx.depot_code),
      contextSub: depotCtx.cluster ? 'Cluster ' + depotCtx.cluster : '',
      onConfirm: function(weight) {
        try {
          sessionStorage.setItem('maat_pending_p2', JSON.stringify({
            bag_qr: scan.token,
            weight_kg: weight,
            depot_code: depotCtx.depot_code,
            depot_id: depotCtx.depot_id,
            cluster: depotCtx.cluster,
            timestamp: Date.now()
          }));
        } catch (_) {}
        log('P2 weight:', weight, 'kg for', scan.token, '(RPC pending B.3b)');
        showSuccessToast('P2 · ' + weight + ' kg enregistré · ' + scan.token);
      }
    });
  }

  /* ─── Modal weigh input ──────────────────────────────────────────────── */
  function showWeighModal(opts) {
    const isP2 = opts.mode === 'p2';

    const overlay = el('div', 'maat-weigh-overlay');
    const card = el('div', 'maat-weigh-card' + (isP2 ? ' is-p2' : ''));

    // Header
    const header = el('div', 'maat-weigh-header');
    header.appendChild(el('span', 'maat-weigh-badge',
      isP2 ? '🏭 Pesée P2' : '🏨 Pesée P1'));
    const closeBtn = el('button', 'maat-weigh-close', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(closeBtn);
    card.appendChild(header);

    // Titolo
    card.appendChild(el('h3', 'maat-weigh-title', 'Saisir le poids'));

    // Contesto
    const ctx = el('div', 'maat-weigh-context');
    ctx.innerHTML = '<strong>' + esc(opts.contextLabel || '') + '</strong>' +
      (opts.contextSub ? '<br>' + esc(opts.contextSub) : '') +
      '<br>Sac: ' + esc(opts.scan.token);
    card.appendChild(ctx);

    // Field input
    const field = el('div', 'maat-weigh-field');
    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'decimal';
    input.step = '0.1';
    input.min = '0.1';
    input.max = '1000';
    input.placeholder = '0.0';
    input.className = 'maat-weigh-input';
    field.appendChild(input);
    field.appendChild(el('span', 'maat-weigh-unit', 'kg'));
    card.appendChild(field);

    // Quick-add
    const quickWrap = el('div', 'maat-weigh-quickadd');
    [0.5, 1, 5, 10].forEach(val => {
      const q = el('button', 'maat-weigh-quick', '+' + val);
      q.type = 'button';
      q.addEventListener('click', () => {
        const curr = parseFloat(input.value) || 0;
        input.value = (curr + val).toFixed(1);
        input.focus();
      });
      quickWrap.appendChild(q);
    });
    card.appendChild(quickWrap);

    // Error
    const errBox = el('div', 'maat-weigh-error');
    errBox.hidden = true;
    card.appendChild(errBox);

    // Actions
    const actions = el('div', 'maat-weigh-actions');

    const cancelBtn = el('button', 'maat-weigh-btn maat-weigh-btn--ghost', 'Annuler');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => overlay.remove());
    actions.appendChild(cancelBtn);

    const confirmBtn = el('button', 'maat-weigh-btn maat-weigh-btn--primary', 'Confirmer');
    confirmBtn.type = 'button';
    confirmBtn.addEventListener('click', () => {
      errBox.hidden = true;
      const val = parseFloat(input.value);
      if (!Number.isFinite(val) || val <= 0) {
        errBox.textContent = 'Poids invalide (doit être > 0)';
        errBox.hidden = false;
        input.focus();
        return;
      }
      if (val > 1000) {
        errBox.textContent = 'Poids trop élevé (max 1000 kg)';
        errBox.hidden = false;
        return;
      }
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Enregistrement…';
      try {
        opts.onConfirm(val);
      } catch (e) {
        console.error('[ScanHandler] onConfirm error:', e);
      }
      setTimeout(() => overlay.remove(), 300);
    });
    actions.appendChild(confirmBtn);
    card.appendChild(actions);

    // Enter to confirm
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmBtn.click();
      }
    });

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    setTimeout(() => input.focus(), 100);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  /* ─── Modal errore contesto ──────────────────────────────────────────── */
  function showModalError(icon, title, body) {
    const overlay = el('div', 'maat-scan-modal');
    const card = el('div', 'maat-scan-modal__card');

    card.appendChild(el('div', 'maat-scan-modal__icon maat-scan-modal__icon--err', icon));
    card.appendChild(el('h3', 'maat-scan-modal__title', title));
    card.appendChild(el('p', 'maat-scan-modal__body', body));

    const actions = el('div', 'maat-scan-modal__actions');
    const closeBtn = el('button', 'maat-scan-btn maat-scan-btn--primary', 'OK');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => overlay.remove());
    actions.appendChild(closeBtn);
    card.appendChild(actions);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  /* ─── Toast success ──────────────────────────────────────────────────── */
  function showSuccessToast(msg) {
    let t = document.getElementById('maat-scan-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'maat-scan-toast';
      t.className = 'maat-scan-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.remove('maat-scan-toast--err');
    t.classList.add('is-visible');
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => {
      t.classList.remove('is-visible');
    }, 3500);
  }

  /* ─── Event listener principale ──────────────────────────────────────── */
  window.addEventListener('maat:scan', (e) => {
    if (!e || !e.detail) return;
    const scan = e.detail;
    log('received:', scan.type, scan.token);

    if (scan.type === 'badge') {
      e.preventDefault();
      handleBadge(scan);
      return;
    }
    if (scan.type === 'depot') {
      e.preventDefault();
      handleDepot(scan);
      return;
    }
    if (scan.type === 'bag') {
      if (scan.mode === 'p1') {
        e.preventDefault();
        handleBagP1(scan);
        return;
      }
      if (scan.mode === 'p2') {
        e.preventDefault();
        handleBagP2(scan);
        return;
      }
      log('bag without mode — fallback modal');
      return;
    }
  });

  log('ready v1.1.0');
})();
