/* ==========================================================================
 *  assets/pwa-scan-handlers.js
 *  Maat OS · Scanner QR Handlers
 *  Phase: 5.3.B.2 + 5.3.B.3a + 5.3.B.3b + 5.4 + 5.5-1+2
 *
 *  B.2:    Badge → validate_badge_qr · Depot → checkin_depot_station
 *  B.3a:   Weigh modal UI
 *  B.3b:   P1 → RPC reale + GPS + offline queue + hash
 *  5.4:    P2 → RPC reale register_depot_weighing_p2 + variance Δ
 *  5.5-1:  P2 offline → IndexedDB queue (drain su 'online')
 *  5.5-2:  Photo-proof → capture + resize + upload Storage + UPDATE column
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatScanHandlersLoaded) return;
  window.__MaatScanHandlersLoaded = true;

  const log  = (...a) => console.log('[ScanHandler]', ...a);
  const warn = (...a) => console.warn('[ScanHandler]', ...a);

  /* ═══════════════════════════════════════════════════════════════════════
     QUEUE · IndexedDB (P1 + P2)
     ═══════════════════════════════════════════════════════════════════════ */
  const QDB_NAME = 'maat_queue';
  const QDB_VERSION = 1;
  const QSTORE = 'pending';
  let _qdbPromise = null;

  function qOpenDb() {
    if (_qdbPromise) return _qdbPromise;
    _qdbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(QDB_NAME, QDB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(QSTORE)) {
          const store = db.createObjectStore(QSTORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('type', 'type', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _qdbPromise;
  }

  async function qEnqueue(item) {
    const db = await qOpenDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QSTORE, 'readwrite');
      const req = tx.objectStore(QSTORE).add(Object.assign({}, item, { timestamp: Date.now() }));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function qGetAll() {
    const db = await qOpenDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QSTORE, 'readonly');
      const req = tx.objectStore(QSTORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function qRemove(id) {
    const db = await qOpenDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QSTORE, 'readwrite');
      const req = tx.objectStore(QSTORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function qCount() {
    const db = await qOpenDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QSTORE, 'readonly');
      const req = tx.objectStore(QSTORE).count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  }

  async function qDrain() {
    const items = await qGetAll();
    if (items.length === 0) return { drained: 0, failed: 0 };
    const sb = getClient();
    if (!sb) { warn('drain: Supabase non disponibile'); return { drained: 0, failed: items.length }; }

    let drained = 0, failed = 0;
    for (const item of items) {
      try {
        let rpc, params;
        if (item.type === 'p1') {
          rpc = 'validate_and_claim_bag';
          params = {
            p_bag_qr_id: item.bag_qr,
            p_vector_id: item.vector_id,
            p_weight_p1: item.weight_kg,
            p_gps_lat: (item.gps && item.gps.lat != null) ? item.gps.lat : null,
            p_gps_lng: (item.gps && item.gps.lng != null) ? item.gps.lng : null,
          };
        } else if (item.type === 'p2') {
          rpc = 'register_depot_weighing_p2';
          params = {
            p_bag_qr_id: item.bag_qr,
            p_depot_qr: item.depot_code,
            p_weight_p2: item.weight_kg,
          };
        } else {
          warn('drain: tipo sconosciuto', item.type);
          continue;
        }
        const { error } = await sb.rpc(rpc, params);
        if (error) throw error;
        await qRemove(item.id);
        drained++;
        log('drained', item.type, item.bag_qr);
      } catch (e) {
        warn('drain failed for', item.id, e);
        failed++;
      }
    }
    log('drain complete:', { drained, failed });
    updateQueueBadge();
    return { drained, failed };
  }

  async function updateQueueBadge() {
    try {
      const n = await qCount();
      const badge = document.getElementById('qBadge');
      if (badge) {
        badge.textContent = String(n);
        badge.classList.toggle('hidden', n === 0);
      }
    } catch (_) {}
  }

  window.addEventListener('online', () => {
    log('online detected → drain queue');
    qDrain();
  });

  if (navigator.onLine !== false) {
    setTimeout(() => qDrain(), 2000);
  }

  window.MaatQueue = {
    enqueue: qEnqueue, getAll: qGetAll, remove: qRemove, count: qCount, drain: qDrain,
  };

  /* ═══════════════════════════════════════════════════════════════════════
     Helper generali
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

  let _vectorIdCache = null;
  let _vectorIdCacheAt = 0;

  async function getCurrentVectorId() {
    const now = Date.now();
    if (_vectorIdCache && (now - _vectorIdCacheAt) < 60000) return _vectorIdCache;
    const sb = getClient();
    if (!sb || !sb.auth || typeof sb.auth.getUser !== 'function') return null;
    try {
      const { data, error } = await sb.auth.getUser();
      if (error) { warn('auth error:', error.message); return null; }
      const uid = data && data.user && data.user.id;
      if (!uid) { warn('no auth user'); return null; }
      _vectorIdCache = uid;
      _vectorIdCacheAt = now;
      return uid;
    } catch (e) { warn('getCurrentVectorId:', e); return null; }
  }

  function getGpsPosition(timeoutMs) {
    const t = timeoutMs || 8000;
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) { resolved = true; warn('GPS timeout → null'); resolve(null); }
      }, t);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (resolved) return;
          resolved = true; clearTimeout(timer);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy || null });
        },
        (err) => {
          if (resolved) return;
          resolved = true; clearTimeout(timer);
          warn('GPS error:', err.message || err.code); resolve(null);
        },
        { enableHighAccuracy: true, timeout: t, maximumAge: 30000 }
      );
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PHOTO-PROOF helpers (5.5-2)
     ═══════════════════════════════════════════════════════════════════════ */
  const PHOTO_BUCKET = 'proofs';
  const PHOTO_MAX_DIM = 1200;
  const PHOTO_QUALITY = 0.75;

  function resizeImage(file, maxDim) {
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        const img = new Image();
        reader.onload = (e) => { img.src = e.target.result; };
        img.onload = () => {
          try {
            const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', PHOTO_QUALITY);
          } catch (e) { warn('resize canvas:', e); resolve(null); }
        };
        img.onerror = () => { warn('image load fail'); resolve(null); };
        reader.onerror = () => { warn('file read fail'); resolve(null); };
        reader.readAsDataURL(file);
      } catch (e) { warn('resizeImage:', e); resolve(null); }
    });
  }

  async function uploadPhoto(blob, bagQrId, mode) {
    const sb = getClient();
    if (!sb || !sb.storage) { warn('storage non disponibile'); return null; }
    try {
      const folder = mode === 'p1' ? 'p1' : 'p2';
      const filename = folder + '/' + bagQrId + '-' + Date.now() + '.jpg';
      const { error } = await sb.storage.from(PHOTO_BUCKET).upload(filename, blob, {
        contentType: 'image/jpeg', upsert: true
      });
      if (error) { warn('storage upload failed:', error.message); return null; }
      const { data: urlData } = sb.storage.from(PHOTO_BUCKET).getPublicUrl(filename);
      return (urlData && urlData.publicUrl) || filename;
    } catch (e) { warn('uploadPhoto exception:', e); return null; }
  }

  async function attachPhotoToCollection(bagQrId, mode, photoUrl) {
    const sb = getClient();
    if (!sb) return false;
    const column = mode === 'p1' ? 'scale_fault_photo' : 'depot_fault_photo';
    try {
      const { error } = await sb.from('collections')
        .update({ [column]: photoUrl })
        .eq('bag_qr_id', bagQrId);
      if (error) { warn('UPDATE photo column failed:', error.message); return false; }
      log('photo attached:', column, '←', photoUrl);
      return true;
    } catch (e) { warn('attachPhoto exception:', e); return false; }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     BADGE HANDLER (invariato)
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
     DEPOT HANDLER (invariato)
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
          bags: data.bags || [], started_at: Date.now(),
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
      listTitle.innerHTML = '<strong>Sac à réceptionner (P2):</strong>';
      card.appendChild(listTitle);

      const list = el('div', null);
      list.style.cssText = 'max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:6px';

      data.bags.forEach(bag => {
        const row = el('div', null);
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,163,0.2);border-radius:8px;font-family:"JetBrains Mono",monospace;font-size:0.7rem;color:#00FFA3';

        const lbl = el('span', null, bag.bag_qr_id + ' · P1 ' + bag.weight_collect_kg + ' kg');
        lbl.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

        const btn = el('button', 'maat-scan-btn maat-scan-btn--gold', 'Peser');
        btn.type = 'button';
        btn.style.cssText = 'padding:4px 10px;font-size:0.65rem';
        btn.addEventListener('click', () => {
          closeModal(modal);
          openP2WeighModal(bag.bag_qr_id, {
            depot_code: data.depot_code,
            depot_name: data.depot_name,
            cluster: data.cluster,
            weight_p1: bag.weight_collect_kg,
          });
        });

        row.appendChild(lbl);
        row.appendChild(btn);
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
    t._hideTimer = setTimeout(() => t.classList.remove('is-visible'), 3500);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     BAG P1 — RPC + queue offline + photo
     ═══════════════════════════════════════════════════════════════════════ */
  function handleBagP1(scan) {
    let clientCtx = null;
    try {
      const raw = sessionStorage.getItem('maat_current_client');
      if (raw) clientCtx = JSON.parse(raw);
    } catch (_) {}
    if (!clientCtx || !clientCtx.client_id) {
      showModalError('🏨', 'Contexte client manquant',
        'Scannez d\'abord le badge de l\'établissement (réception hôtel).');
      return;
    }

    showWeighModal({
      mode: 'p1',
      scan,
      contextLabel: 'Collecte · ' + (clientCtx.company_name || 'Client'),
      contextSub: clientCtx.cluster ? 'Cluster ' + clientCtx.cluster : '',
      onConfirm: async function (weight, photoBlob) {
        const sb = getClient();
        if (!sb) { showError('Service Supabase indisponible'); return false; }

        const vectorId = await getCurrentVectorId();
        if (!vectorId) { showError('Session introuvable · reconnectez-vous'); return false; }

        const gps = await getGpsPosition(8000);
        log('P1 GPS:', gps ? (gps.lat + ',' + gps.lng) : 'null');

        try {
          sessionStorage.setItem('maat_pending_p1', JSON.stringify({
            bag_qr: scan.token, weight_kg: weight,
            client_id: clientCtx.client_id, vector_id: vectorId,
            gps: gps, timestamp: Date.now(),
          }));
        } catch (_) {}

        const queueP1 = async (reason) => {
          if (photoBlob) warn('P1 offline → photo ignorée (buffer locale seulement)');
          await qEnqueue({
            type: 'p1', bag_qr: scan.token, vector_id: vectorId,
            weight_kg: weight, client_id: clientCtx.client_id,
            client_name: clientCtx.company_name, cluster: clientCtx.cluster,
            gps: gps, reason: reason,
          });
          await updateQueueBadge();
          log('P1 → queue (' + reason + '):', scan.token);
          try { sessionStorage.removeItem('maat_pending_p1'); } catch (_) {}
          showSuccessToast('P1 · ' + weight + ' kg · enregistré hors ligne');
          return true;
        };

        if (navigator.onLine === false) return await queueP1('offline');

        try {
          const { data, error } = await sb.rpc('validate_and_claim_bag', {
            p_bag_qr_id: scan.token,
            p_vector_id: vectorId,
            p_weight_p1: weight,
            p_gps_lat: gps ? gps.lat : null,
            p_gps_lng: gps ? gps.lng : null,
          });
          if (error) throw error;
          log('P1 RPC OK:', data);
          try { sessionStorage.removeItem('maat_pending_p1'); } catch (_) {}

          if (photoBlob) {
            const url = await uploadPhoto(photoBlob, scan.token, 'p1');
            if (url) await attachPhotoToCollection(scan.token, 'p1', url);
            else warn('photo upload skipped');
          }

          showSuccessToast('P1 · ' + weight + ' kg · ' + scan.token);
          return true;
        } catch (e) {
          const isNetwork = /network|fetch|offline|failed to fetch/i.test(String(e.message || e));
          if (isNetwork) return await queueP1('network-error');
          console.error('[ScanHandler] validate_and_claim_bag failed:', e);
          showError('Erreur: ' + (e.message || e));
          return false;
        }
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     BAG P2 — RPC + queue offline + photo (5.5-1)
     ═══════════════════════════════════════════════════════════════════════ */
  function handleBagP2(scan) {
    let depotCtx = null;
    try {
      const raw = sessionStorage.getItem('maat_active_depot_session');
      if (raw) depotCtx = JSON.parse(raw);
    } catch (_) {}
    if (!depotCtx || !depotCtx.depot_code) {
      showModalError('🏭', 'Dépôt non identifié',
        'Scannez d\'abord le QR de la station dépôt.');
      return;
    }
    openP2WeighModal(scan.token, {
      depot_code: depotCtx.depot_code,
      depot_name: depotCtx.depot_name,
      cluster: depotCtx.cluster,
      weight_p1: null,
    });
  }

  function openP2WeighModal(bagQrId, ctx) {
    showWeighModal({
      mode: 'p2',
      scan: { token: bagQrId, type: 'bag' },
      contextLabel: 'Réception · ' + (ctx.depot_name || ctx.depot_code),
      contextSub: (ctx.cluster ? 'Cluster ' + ctx.cluster : '') +
                  (ctx.weight_p1 != null ? ' · P1 ' + ctx.weight_p1 + ' kg' : ''),
      onConfirm: async function (weight, photoBlob) {
        const sb = getClient();
        if (!sb) { showError('Service Supabase indisponible'); return false; }

        log('P2 submit:', bagQrId, weight, 'kg → depot', ctx.depot_code);

        try {
          sessionStorage.setItem('maat_pending_p2', JSON.stringify({
            bag_qr: bagQrId, weight_kg: weight,
            depot_code: ctx.depot_code, timestamp: Date.now(),
          }));
        } catch (_) {}

        const queueP2 = async (reason) => {
          if (photoBlob) warn('P2 offline → photo ignorée (buffer locale seulement)');
          await qEnqueue({
            type: 'p2', bag_qr: bagQrId, weight_kg: weight,
            depot_code: ctx.depot_code, depot_name: ctx.depot_name,
            reason: reason,
          });
          await updateQueueBadge();
          log('P2 → queue (' + reason + '):', bagQrId);
          try { sessionStorage.removeItem('maat_pending_p2'); } catch (_) {}
          showSuccessToast('P2 · ' + weight + ' kg · enregistré hors ligne');
          return true;
        };

        if (navigator.onLine === false) return await queueP2('offline');

        try {
          const { data, error } = await sb.rpc('register_depot_weighing_p2', {
            p_bag_qr_id: bagQrId,
            p_depot_qr: ctx.depot_code,
            p_weight_p2: weight,
          });
          if (error) throw error;

          try { sessionStorage.removeItem('maat_pending_p2'); } catch (_) {}

          if (photoBlob) {
            const url = await uploadPhoto(photoBlob, bagQrId, 'p2');
            if (url) await attachPhotoToCollection(bagQrId, 'p2', url);
            else warn('photo upload skipped');
          }

          const p1 = data && data.weight_collect_kg != null ? Number(data.weight_collect_kg) : null;
          const p2 = data && data.weight_depot_kg != null ? Number(data.weight_depot_kg) : weight;
          const delta = (p1 != null && p1 > 0) ? ((p2 - p1) / p1 * 100) : null;
          const status = data && data.status;
          const bagQr = (data && data.bag_qr_id) || bagQrId;

          log('P2 RPC OK:', { status, p1, p2, delta });

          if (status === 'DISCREPANCY') {
            showVarianceResult(bagQr, p1, p2, delta);
          } else {
            showSuccessToast('P2 · ' + weight + ' kg · ' + bagQr + ' (ANCRÉ)');
          }
          return true;
        } catch (e) {
          const isNetwork = /network|fetch|offline|failed to fetch/i.test(String(e.message || e));
          if (isNetwork) return await queueP2('network-error');
          console.error('[ScanHandler] register_depot_weighing_p2 failed:', e);
          showError('Erreur: ' + (e.message || e));
          return false;
        }
      }
    });
  }

  function showVarianceResult(bagQrId, p1, p2, delta) {
    const { modal, card } = buildModal();
    card.appendChild(el('div', 'maat-scan-modal__icon maat-scan-modal__icon--err', '⚠️'));
    card.appendChild(el('h3', 'maat-scan-modal__title', 'Écart détecté'));
    card.appendChild(el('span', 'maat-scan-modal__badge', 'Variance > 3%'));

    const info = el('div', null);
    info.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:8px';
    info.appendChild(infoRow('Sac', bagQrId));
    if (p1 != null) info.appendChild(infoRow('P1 · Collecte', p1.toFixed(2) + ' kg'));
    if (p2 != null) info.appendChild(infoRow('P2 · Réception', p2.toFixed(2) + ' kg'));
    if (delta != null) {
      const row = infoRow('Écart', delta.toFixed(2) + ' %');
      row.lastChild.style.color = '#F87171';
      info.appendChild(row);
    }
    card.appendChild(info);

    const body = el('p', 'maat-scan-modal__body');
    body.innerHTML = 'Le sac est en <strong>DISCREPANCY</strong>. Un opérateur admin doit investiguer via <em>Control Tower → Variance</em>.';
    card.appendChild(body);

    const actions = el('div', 'maat-scan-modal__actions');
    const closeBtn = el('button', 'maat-scan-btn maat-scan-btn--primary', 'Compris');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => closeModal(modal));
    actions.appendChild(closeBtn);
    card.appendChild(actions);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Weigh modal (con photo-proof 5.5-2)
     ═══════════════════════════════════════════════════════════════════════ */
  function showWeighModal(opts) {
    const isP2 = opts.mode === 'p2';
    const overlay = el('div', 'maat-weigh-overlay');
    const card = el('div', 'maat-weigh-card' + (isP2 ? ' is-p2' : ''));

    const header = el('div', 'maat-weigh-header');
    header.appendChild(el('span', 'maat-weigh-badge', isP2 ? '🏭 Pesée P2' : '🏨 Pesée P1'));
    const closeBtn = el('button', 'maat-weigh-close', '×');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(closeBtn);
    card.appendChild(header);

    card.appendChild(el('h3', 'maat-weigh-title', 'Saisir le poids'));

    const ctx = el('div', 'maat-weigh-context');
    ctx.innerHTML = '<strong>' + esc(opts.contextLabel || '') + '</strong>' +
      (opts.contextSub ? '<br>' + esc(opts.contextSub) : '') +
      '<br>Sac: ' + esc(opts.scan.token);
    card.appendChild(ctx);

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

    /* Photo-proof optionnel */
    let capturedPhoto = null;
    const photoWrap = el('div', 'maat-weigh-photo');
    photoWrap.style.cssText = 'margin:12px 0;display:flex;flex-direction:column;gap:6px;align-items:center';

    const photoBtn = el('button', 'maat-weigh-photo-btn', '📷 Preuve photo (optionnel)');
    photoBtn.type = 'button';
    photoBtn.style.cssText = 'padding:8px 14px;border-radius:8px;border:1px dashed rgba(0,255,163,0.4);background:transparent;color:#00FFA3;font-size:0.7rem;cursor:pointer;font-family:inherit';

    const photoInput = document.createElement('input');
    photoInput.type = 'file';
    photoInput.accept = 'image/*';
    photoInput.capture = 'environment';
    photoInput.style.display = 'none';

    const photoPreview = el('div', null);
    photoPreview.style.cssText = 'text-align:center';

    photoWrap.appendChild(photoBtn);
    photoWrap.appendChild(photoInput);
    photoWrap.appendChild(photoPreview);
    card.appendChild(photoWrap);

    photoBtn.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', async () => {
      const file = photoInput.files && photoInput.files[0];
      if (!file) return;
      const original = photoBtn.textContent;
      photoBtn.textContent = '⏳ Compression…';
      photoBtn.disabled = true;
      const blob = await resizeImage(file, PHOTO_MAX_DIM);
      photoBtn.disabled = false;
      if (!blob) {
        photoBtn.textContent = original;
        showError('Impossible de traiter la photo');
        return;
      }
      capturedPhoto = blob;
      const url = URL.createObjectURL(blob);
      photoPreview.innerHTML = '';
      const img = document.createElement('img');
      img.src = url;
      img.style.cssText = 'max-width:100%;max-height:90px;border-radius:6px;display:block;margin:0 auto 4px';
      const removeBtn = el('button', null, '✕ Retirer');
      removeBtn.type = 'button';
      removeBtn.style.cssText = 'background:none;border:none;color:#F87171;font-size:0.65rem;cursor:pointer;font-family:inherit';
      removeBtn.addEventListener('click', () => {
        capturedPhoto = null;
        photoPreview.innerHTML = '';
        photoBtn.textContent = '📷 Preuve photo (optionnel)';
        photoInput.value = '';
      });
      photoPreview.appendChild(img);
      photoPreview.appendChild(removeBtn);
      photoBtn.textContent = '✅ Photo capturée · ' + Math.round(blob.size / 1024) + ' Ko';
    });

    const errBox = el('div', 'maat-weigh-error');
    errBox.hidden = true;
    card.appendChild(errBox);

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
        errBox.hidden = false; input.focus(); return;
      }
      if (val > 1000) {
        errBox.textContent = 'Poids trop élevé (max 1000 kg)';
        errBox.hidden = false; return;
      }
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Enregistrement…';
      cancelBtn.disabled = true;
      const resetBtn = () => {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirmer';
        cancelBtn.disabled = false;
      };
      Promise.resolve().then(() => opts.onConfirm(val, capturedPhoto))
        .then((result) => {
          if (result === false) { resetBtn(); return; }
          overlay.remove();
        })
        .catch((e) => {
          console.error('[ScanHandler] onConfirm error:', e);
          errBox.textContent = 'Erreur: ' + (e && e.message ? e.message : String(e));
          errBox.hidden = false;
          resetBtn();
        });
    });
    actions.appendChild(confirmBtn);
    card.appendChild(actions);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirmBtn.click(); }
    });

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    setTimeout(() => input.focus(), 100);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

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

  window.addEventListener('maat:scan', (e) => {
    if (!e || !e.detail) return;
    const scan = e.detail;
    log('received:', scan.type, scan.token);
    if (scan.type === 'badge') { e.preventDefault(); handleBadge(scan); return; }
    if (scan.type === 'depot') { e.preventDefault(); handleDepot(scan); return; }
    if (scan.type === 'bag') {
      if (scan.mode === 'p1') { e.preventDefault(); handleBagP1(scan); return; }
      if (scan.mode === 'p2') { e.preventDefault(); handleBagP2(scan); return; }
      log('bag without mode — fallback');
      return;
    }
  });

  updateQueueBadge();
  log('ready v1.5.0');
})();
