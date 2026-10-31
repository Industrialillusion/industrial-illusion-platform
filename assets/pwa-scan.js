
/* ==========================================================================
 *  assets/pwa-scan.js
 *  Maat OS · Scanner QR Base (Phase 5.3.B.1 + 5.3.B.2)
 *  - FAB scan (basso-sinistra)
 *  - Overlay scanner con MaatQRScanner
 *  - Riconoscimento tipo QR (badge / sacco / depot / unknown)
 *  - Feedback multimodale (audio 800/200Hz + vibrazione + flash)
 *  - Double-dip prevention
 *  - Auto-detect P1/P2 (URL → session → modal)
 *  - URL param handling (?scan=...&mode=...)
 *
 *  v1.0.1: detectType accepts DEPOT-HUB-XX prefix
 *  v1.0.2: emits 'maat:scan' CustomEvent to handlers (business logic separation)
 *          if no handler consumes event → fallback modal B.1
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatScanLoaded) return;
  window.__MaatScanLoaded = true;

  const CFG = {
    audioSuccessHz: 800,
    audioErrorHz: 200,
    audioSuccessMs: 150,
    audioErrorMs: 400,
    vibrateSuccess: 100,
    vibrateError: [150, 100, 300],
    flashSuccessColor: 'rgba(0, 255, 163, 0.65)',
    flashErrorColor: 'rgba(248, 113, 113, 0.65)',
    flashMs: 250,
    doubleDipTtlMs: 30 * 60 * 1000,
    toastMs: 2400,
    scanCooldownMs: 900,
  };

  const S = {
    audioCtx: null,
    overlay: null,
    scannerStarted: false,
    lastScanAt: 0,
    torchOn: false,
  };

  const log  = (...a) => console.log('[Scan]', ...a);
  const warn = (...a) => console.warn('[Scan]', ...a);

  /* ─── DOM helpers ────────────────────────────────────────────────────── */
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

  /* ─── Feedback: audio ────────────────────────────────────────────────── */
  function playTone(freq, durationMs) {
    try {
      if (!S.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        S.audioCtx = new Ctx();
      }
      if (S.audioCtx.state === 'suspended') S.audioCtx.resume();
      const t0 = S.audioCtx.currentTime;
      const osc = S.audioCtx.createOscillator();
      const gain = S.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
      osc.connect(gain).connect(S.audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + durationMs / 1000 + 0.02);
    } catch (e) { warn('playTone failed', e); }
  }

  /* ─── Feedback: vibrazione ───────────────────────────────────────────── */
  function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  }

  /* ─── Feedback: flash schermo ────────────────────────────────────────── */
  function flashScreen(color) {
    const f = document.createElement('div');
    f.className = 'maat-scan-flash';
    f.style.background = color;
    document.body.appendChild(f);
    setTimeout(() => { try { f.remove(); } catch (e) {} }, CFG.flashMs + 50);
  }

  /* ─── Feedback combinati ─────────────────────────────────────────────── */
  function feedbackSuccess() {
    playTone(CFG.audioSuccessHz, CFG.audioSuccessMs);
    vibrate(CFG.vibrateSuccess);
    flashScreen(CFG.flashSuccessColor);
  }

  function feedbackError() {
    playTone(CFG.audioErrorHz, CFG.audioErrorMs);
    vibrate(CFG.vibrateError);
    flashScreen(CFG.flashErrorColor);
  }

  /* ─── Detector tipo QR (v1.0.1: +HUB) ────────────────────────────────── */
  function detectType(token) {
    if (!token) return 'unknown';
    const t = String(token).trim();

    if (/^PK-(MED|GUEL|PALM|HIVER|AGDAL|SEM|TARGA)-(PET|PEHD|LDPE|PP|CARD|ALU|FER|GLASS|ORG|DIB)-\d{4}-[A-Z0-9]{6}$/i.test(t)) {
      return 'bag';
    }
    if (/^BDG-(CLIENT|OPERATOR|ADMIN|DIRECTION|FMCG|VIEWER)-/i.test(t)) {
      return 'badge';
    }
    if (/^DEPOT-(MED|GUEL|PALM|HIVER|AGDAL|SEM|TARGA|HUB)-\d{2}$/i.test(t)) {
      return 'depot';
    }
    if (/^ESG-/i.test(t)) {
      return 'cert';
    }
    return 'unknown';
  }

  /* ─── Double-dip prevention (sessionStorage) ─────────────────────────── */
  function doubleDipKey(token, mode) {
    return 'maat_scanned:' + (mode || 'any') + ':' + token;
  }

  function isDuplicate(token, mode) {
    try {
      const key = doubleDipKey(token, mode);
      const ts = sessionStorage.getItem(key);
      if (!ts) return false;
      if (Date.now() - parseInt(ts, 10) > CFG.doubleDipTtlMs) {
        sessionStorage.removeItem(key);
        return false;
      }
      return true;
    } catch (e) { return false; }
  }

  function markScanned(token, mode) {
    try {
      sessionStorage.setItem(doubleDipKey(token, mode), String(Date.now()));
    } catch (e) {}
  }

  /* ─── Mode detection ─────────────────────────────────────────────────── */
  function determineModeFromContext() {
    if (window.MaatQR && typeof window.MaatQR.extractScanMode === 'function') {
      const urlMode = window.MaatQR.extractScanMode(window.location.href);
      if (urlMode) return urlMode;
    }
    try {
      if (sessionStorage.getItem('maat_active_pickup')) return 'p1';
      if (sessionStorage.getItem('maat_active_depot_session')) return 'p2';
    } catch (e) {}
    return null;
  }

  /* ─── Toast feedback ─────────────────────────────────────────────────── */
  function showToast(msg, isError) {
    let t = document.getElementById('maat-scan-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'maat-scan-toast';
      t.className = 'maat-scan-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.toggle('maat-scan-toast--err', !!isError);
    t.classList.add('is-visible');
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => {
      t.classList.remove('is-visible');
    }, CFG.toastMs);
  }

  /* ─── FAB ────────────────────────────────────────────────────────────── */
  function ensureFab() {
    if (document.getElementById('maat-scan-fab')) return;
    const btn = document.createElement('button');
    btn.id = 'maat-scan-fab';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Scanner un QR code');
    btn.title = 'Scanner un QR code';
    btn.innerHTML = '📷';
    btn.addEventListener('click', openScanner);
    document.body.appendChild(btn);
    log('FAB created');
  }

  /* ─── Overlay scanner ────────────────────────────────────────────────── */
  function ensureOverlay() {
    if (S.overlay) return S.overlay;

    const ov = document.createElement('div');
    ov.className = 'maat-scan-overlay';
    ov.hidden = true;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Scanner QR');

    const header = el('div', 'maat-scan-header');
    header.appendChild(el('div', 'maat-scan-title', 'Scanner QR'));

    const torch = el('button', 'maat-scan-torch', '🔦');
    torch.type = 'button';
    torch.setAttribute('aria-label', 'Torche');
    torch.addEventListener('click', async () => {
      try {
        const on = await window.MaatQRScanner.toggleTorch();
        torch.classList.toggle('is-on', !!on);
        S.torchOn = !!on;
      } catch (e) {}
    });

    const closeBtn = el('button', 'maat-scan-close', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.addEventListener('click', closeScanner);

    const actions = el('div', null);
    actions.style.cssText = 'display:flex;align-items:center;gap:8px';
    actions.appendChild(torch);
    actions.appendChild(closeBtn);
    header.appendChild(actions);

    const videoWrap = el('div', 'maat-scan-video-wrap');
    videoWrap.id = 'maat-scan-video-wrap';

    const frame = el('div', 'maat-scan-frame');
    const square = el('div', 'maat-scan-frame__square');
    const scanline = el('div', 'maat-scan-frame__scanline');
    square.appendChild(scanline);
    frame.appendChild(square);
    videoWrap.appendChild(frame);

    const hint = el('div', 'maat-scan-hint');
    hint.innerHTML = 'Alignez le QR dans le cadre · <strong>Focus auto</strong>';
    videoWrap.appendChild(hint);

    ov.appendChild(header);
    ov.appendChild(videoWrap);
    document.body.appendChild(ov);
    S.overlay = ov;
    return ov;
  }

  /* ─── Apertura scanner ───────────────────────────────────────────────── */
  async function openScanner() {
    if (S.scannerStarted) return;

    const ov = ensureOverlay();
    ov.hidden = false;
    document.body.style.overflow = 'hidden';

    const videoWrap = document.getElementById('maat-scan-video-wrap');
    if (!videoWrap) { warn('videoWrap assente'); return; }

    if (!window.MaatQRScanner) {
      warn('MaatQRScanner non caricato');
      showToast('Scanner non disponible. Rechargez la page.', true);
      closeScanner();
      return;
    }

    try {
      S.scannerStarted = true;
      await window.MaatQRScanner.start({
        onScan: (text) => {
          handleScanResult(text, { from: 'scanner' });
        },
        onError: (err) => {
          console.error('[Scan] scanner error:', err);
          showToast('Erreur caméra: ' + (err.message || err), true);
          S.scannerStarted = false;
          closeScanner();
        },
      });
      window.MaatQRScanner.attachTo(videoWrap);

      const torchBtn = ov.querySelector('.maat-scan-torch');
      if (torchBtn) {
        const hasTorch = window.MaatQRScanner.hasTorch && window.MaatQRScanner.hasTorch();
        if (!hasTorch) torchBtn.style.display = 'none';
      }

      log('scanner started');
    } catch (err) {
      console.error('[Scan] start failed:', err);
      S.scannerStarted = false;
      showToast('Impossible d\'accéder à la caméra', true);
      closeScanner();
    }
  }

  function closeScanner() {
    try {
      if (window.MaatQRScanner && S.scannerStarted) {
        window.MaatQRScanner.stop();
      }
    } catch (e) {}
    S.scannerStarted = false;
    if (S.overlay) S.overlay.hidden = true;
    document.body.style.overflow = '';
  }

  /* ─── Handler centrale ───────────────────────────────────────────────── */
  function handleScanResult(rawText, opts) {
    opts = opts || {};
    const now = Date.now();
    if (now - S.lastScanAt < CFG.scanCooldownMs) {
      log('scan too fast, ignored');
      return;
    }
    S.lastScanAt = now;

    if (opts.from === 'scanner') {
      try { window.MaatQRScanner.stop(); } catch (e) {}
      S.scannerStarted = false;
      if (S.overlay) S.overlay.hidden = true;
      document.body.style.overflow = '';
    }

    if (!window.MaatQR || typeof window.MaatQR.normalizeScannedPayload !== 'function') {
      feedbackError();
      showToast('Module QR non disponible', true);
      return;
    }

    const token = window.MaatQR.normalizeScannedPayload(rawText);
    if (!token) {
      feedbackError();
      showToast('QR vide ou illisible', true);
      return;
    }

    const type = detectType(token);
    log('detected:', token, 'type:', type);

    const urlMode = window.MaatQR.extractScanMode && window.MaatQR.extractScanMode(window.location.href);
    let mode = opts.mode || urlMode || determineModeFromContext();

    // ── Unknown type ──────────────────────────────────────────────────
    if (type === 'unknown') {
      feedbackError();
      showToast('QR non reconnu: ' + token.slice(0, 30), true);
      return;
    }

    // ── Cert (future Phase 6) ─────────────────────────────────────────
    if (type === 'cert') {
      feedbackSuccess();
      showToast('Certificat ESG détecté (Phase 6)', false);
      return;
    }

    // ── Bag senza mode → disambig ─────────────────────────────────────
    if (type === 'bag' && (!mode || (mode !== 'p1' && mode !== 'p2'))) {
      feedbackSuccess();
      showDisambiguation(token);
      return;
    }

    // ── Doppio-dip check ──────────────────────────────────────────────
    const dupKey = type === 'bag' ? mode : type;
    if (isDuplicate(token, dupKey)) {
      feedbackError();
      showToast(
        type === 'bag' ? 'Sac déjà scanné en mode ' + mode.toUpperCase()
        : type === 'badge' ? 'Badge déjà scanné dans cette session'
        : 'Dépôt déjà check-in dans cette session',
        true
      );
      return;
    }
    markScanned(token, dupKey);
    feedbackSuccess();

    // ═══ v1.0.2: emit event → handlers (pwa-scan-handlers.js) ═════════
    const scanPayload = {
      token,
      type,
      mode: mode || null,
      raw: rawText,
      timestamp: Date.now(),
    };

    const event = new CustomEvent('maat:scan', {
      detail: scanPayload,
      cancelable: true,
    });

    // dispatchEvent ritorna false se un handler ha chiamato preventDefault
    const consumed = !window.dispatchEvent(event);

    if (!consumed) {
      // ── Fallback: nessun handler → mostra modal B.1 ────────────────
      log('no handler consumed event, fallback modal');
      showResultModal(type, token, mode);
    } else {
      log('event consumed by handler:', type, token);
    }
  }

  /* ─── Result modal (fallback B.1) ────────────────────────────────────── */
  function showResultModal(type, token, mode) {
    const typeLabels = {
      bag:    { label: 'Sac', icon: '📦', cls: 'bag' },
      badge:  { label: 'Badge', icon: '🪪', cls: 'badge' },
      depot:  { label: 'Dépôt', icon: '🏭', cls: 'depot' },
    };
    const meta = typeLabels[type] || { label: 'Unknown', icon: '❓', cls: '' };

    const modal = el('div', 'maat-scan-modal');
    modal.id = 'maat-scan-result-modal';
    const card = el('div', 'maat-scan-modal__card');

    card.appendChild(el('div', 'maat-scan-modal__icon', meta.icon));
    card.appendChild(el('h3', 'maat-scan-modal__title', 'QR reconnu'));
    card.appendChild(el('p', 'maat-scan-modal__body',
      'Aucun handler actif pour ce type de QR. Affichage brut du token.'));

    card.appendChild(el('span', 'maat-scan-modal__badge maat-scan-modal__badge--' + meta.cls, meta.label));
    card.appendChild(el('div', 'maat-scan-modal__token', token));

    if (mode) {
      const modeInfo = el('p', 'maat-scan-modal__body');
      modeInfo.innerHTML = 'Mode détecté: <strong style="color:#00FFA3">' +
        (mode === 'p1' ? 'P1 · Collecte' : mode === 'p2' ? 'P2 · Réception' : mode) +
        '</strong>';
      card.appendChild(modeInfo);
    }

    const actions = el('div', 'maat-scan-modal__actions');
    const closeBtn = el('button', 'maat-scan-btn maat-scan-btn--ghost', 'Fermer');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => modal.remove());

    const rescanBtn = el('button', 'maat-scan-btn maat-scan-btn--primary', 'Scanner un autre');
    rescanBtn.type = 'button';
    rescanBtn.addEventListener('click', () => {
      modal.remove();
      openScanner();
    });

    actions.appendChild(rescanBtn);
    actions.appendChild(closeBtn);
    card.appendChild(actions);

    modal.appendChild(card);
    document.body.appendChild(modal);

    const autoClose = setTimeout(() => {
      if (document.body.contains(modal)) modal.remove();
    }, 6000);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        clearTimeout(autoClose);
        modal.remove();
      }
    });
  }

  /* ─── Disambiguation modal ───────────────────────────────────────────── */
  function showDisambiguation(token) {
    const modal = el('div', 'maat-scan-modal');
    modal.id = 'maat-scan-disambig-modal';
    const card = el('div', 'maat-scan-modal__card');

    card.appendChild(el('div', 'maat-scan-modal__icon', '❓'));
    card.appendChild(el('h3', 'maat-scan-modal__title', 'Contexte requis'));
    card.appendChild(el('p', 'maat-scan-modal__body',
      'Sac détecté. Sélectionnez le contexte opérationnel.'));
    card.appendChild(el('div', 'maat-scan-modal__token', token));

    const actions = el('div', 'maat-scan-modal__actions');

    const btnP1 = el('button', 'maat-scan-btn maat-scan-btn--primary', '🏨 P1 · Collecte hôtel');
    btnP1.type = 'button';
    btnP1.addEventListener('click', () => {
      modal.remove();
      handleScanResult(token, { mode: 'p1' });
    });

    const btnP2 = el('button', 'maat-scan-btn maat-scan-btn--gold', '🏭 P2 · Réception dépôt');
    btnP2.type = 'button';
    btnP2.addEventListener('click', () => {
      modal.remove();
      handleScanResult(token, { mode: 'p2' });
    });

    const btnCancel = el('button', 'maat-scan-btn maat-scan-btn--ghost', 'Annuler');
    btnCancel.type = 'button';
    btnCancel.addEventListener('click', () => modal.remove());

    actions.appendChild(btnP1);
    actions.appendChild(btnP2);
    actions.appendChild(btnCancel);
    card.appendChild(actions);

    modal.appendChild(card);
    document.body.appendChild(modal);
  }

  /* ─── URL param handling ─────────────────────────────────────────────── */
  function handleUrlScanParam() {
    try {
      const params = new URLSearchParams(window.location.search);
      const scan = params.get('scan');
      const mode = params.get('mode');
      if (!scan) return;

      log('URL scan param detected:', scan, 'mode:', mode);

      try {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      } catch (e) {}

      let attempts = 0;
      const tryProcess = () => {
        attempts++;
        if (window.MaatQR && typeof window.MaatQR.normalizeScannedPayload === 'function') {
          setTimeout(() => {
            handleScanResult(scan, { from: 'url', mode: mode });
          }, 300);
        } else if (attempts < 20) {
          setTimeout(tryProcess, 200);
        } else {
          warn('MaatQR non disponibile dopo 4s');
        }
      };
      tryProcess();
    } catch (e) {
      warn('URL param handling failed:', e);
    }
  }

  /* ─── Init ───────────────────────────────────────────────────────────── */
  function init() {
    ensureFab();
    ensureOverlay();
    handleUrlScanParam();
    log('ready v1.0.2');
  }

  /* ─── Public API ─────────────────────────────────────────────────────── */
  window.MaatScan = {
    init,
    open: openScanner,
    close: closeScanner,
    trigger: (text) => handleScanResult(text, { from: 'api' }),
    detectType,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
