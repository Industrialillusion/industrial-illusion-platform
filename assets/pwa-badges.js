/* ==========================================================================
 *  assets/pwa-badges.js
 *  Maat OS · Badge Phygital Module
 *  - FAB "Mon Badge" (visibile a operator/client/admin loggati)
 *  - Panel con badge papiro + neon + logo + QR + foto
 *  - Upload foto tessera su Supabase Storage
 *  - Download PNG (html2canvas on-demand)
 *  - Print CR-80 con guide di taglio
 *  - Mostra anche badge struttura se utente ha client_id
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatPwaBadgesLoaded) return;
  window.__MaatPwaBadgesLoaded = true;

  const CFG = {
    photosBucket: 'profile-photos',
    html2canvasCdn: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    clientWaitMs: 8000,
    roleLabels: {
      operator: 'Vecteur Logistique Agréé',
      client:   'Référent Établissement',
      admin:    'Direction Générale',
    },
    roleShort: {
      operator: 'VEC',
      client:   'CLI',
      admin:    'DIR',
    },
  };

  const S = {
    client: null,
    user: null,           // profiles row
    userBadge: null,      // badge_qrs row (user_id)
    clientBadge: null,    // badge_qrs row (client_id, se referente hotel)
    clientRow: null,      // clients row
    overlay: null,
    fab: null,
    html2canvasLoaded: false,
    booted: false,
    loading: false,
  };

  const log  = (...a) => console.log('[MaatBadges]', ...a);
  const warn = (...a) => console.warn('[MaatBadges]', ...a);

  /* ─── Client detection ──────────────────────────────────────────────── */
  function getClient() {
    if (S.client) return S.client;
    const cands = [window.Maat && window.Maat.sb, window.maatSupabase,
                   window.supabaseClient, window.sb];
    for (const c of cands) {
      if (c && typeof c.auth === 'object' && typeof c.from === 'function') {
        S.client = c; return c;
      }
    }
    try {
      if (window.Maat && typeof window.Maat.init === 'function') {
        window.Maat.init();
        if (window.Maat.sb) { S.client = window.Maat.sb; return S.client; }
      }
    } catch (_) {}
    return null;
  }

  function waitForClient(deadline) {
    return new Promise((resolve) => {
      const tick = () => {
        if (getClient()) return resolve(true);
        if (Date.now() > deadline) return resolve(false);
        setTimeout(tick, 200);
      };
      tick();
    });
  }

  /* ─── DOM utils ─────────────────────────────────────────────────────── */
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

  /* ─── Serial code derivation ────────────────────────────────────────── */
  function deriveSerial(badge, ownerType) {
    if (!badge) return 'PK-XXX-0000-0000';
    const role = CFG.roleShort[badge.role] || (ownerType === 'client' ? 'CLI' : 'GEN');
    const year = new Date().getFullYear();
    const hash = (badge.id || '').replace(/-/g, '').slice(0, 4).toUpperCase();
    return `PK-${role}-${year}-${hash}`;
  }

  /* ─── Load data (user + badges) ─────────────────────────────────────── */
  async function loadData() {
    const sb = getClient();
    if (!sb) throw new Error('Supabase client non disponibile');

    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.user) throw new Error('Sessione utente assente');

    // Profile
    const { data: profile, error: pErr } = await sb
      .from('profiles')
      .select('id, email, full_name, role, status, photo_url, client_id, cluster, vehicle')
      .eq('id', session.user.id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!profile) throw new Error('Profilo utente non trovato');

    S.user = profile;

    // Badge persona
    const { data: bRow } = await sb
      .from('badge_qrs')
      .select('*')
      .eq('user_id', profile.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    S.userBadge = bRow || null;

    // Se referente hotel → badge struttura + dati cliente
    if (profile.client_id) {
      const { data: cRow } = await sb
        .from('clients')
        .select('*')
        .eq('id', profile.client_id)
        .maybeSingle();
      S.clientRow = cRow || null;

      const { data: cbRow } = await sb
        .from('badge_qrs')
        .select('*')
        .eq('client_id', profile.client_id)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      S.clientBadge = cbRow || null;
    } else {
      S.clientRow = null;
      S.clientBadge = null;
    }
  }

  /* ─── Render badge DOM ──────────────────────────────────────────────── */
  function renderBadge(badge, opts) {
    opts = opts || {};
    const ownerType = opts.ownerType || 'user';
    const personName = opts.name || '—';
    const roleLabel = opts.roleLabel || '—';
    const photoUrl = opts.photoUrl || null;
    const serial = deriveSerial(badge, ownerType);
    const token = badge ? badge.qr_code : '—';

    const card = el('div', 'badge-card');
    card.dataset.ownerType = ownerType;
    card.dataset.token = token;

    // Sfondo papiro
    card.appendChild(el('div', 'badge-card__bg'));
    card.appendChild(el('div', 'badge-card__texture'));
    card.appendChild(el('div', 'badge-card__circuits'));

    // Content
    const content = el('div', 'badge-card__content');

    // HEADER
    const header = el('div', 'badge-card__header');
    const logo = el('div', 'badge-card__logo');
    logo.innerHTML = `
      <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
        <path d="M22 60 Q60 38 98 60 Q60 82 22 60 Z" stroke="#006A3E" stroke-width="3" fill="#F5E6C8"/>
        <circle cx="60" cy="60" r="14" stroke="#00B871" stroke-width="2.5" fill="#0A0D10"/>
        <circle cx="60" cy="60" r="7" fill="#00FFA3"/>
        <path d="M60 74 L58 90" stroke="#00B871" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    header.appendChild(logo);

    const brand = el('div', 'badge-card__brand');
    brand.appendChild(el('span', 'badge-card__brand-name', 'INDUSTRIAL ILLUSION'));
    brand.appendChild(el('span', 'badge-card__brand-sub', 'MAAT OS · PURKEMET'));
    header.appendChild(brand);

    content.appendChild(header);

    // LEFT: photo + name + role
    const left = el('div', 'badge-card__left');
    const photoBox = el('div', 'badge-card__photo');
    if (photoUrl) {
      const img = document.createElement('img');
      img.src = photoUrl;
      img.alt = personName;
      img.onerror = () => {
        photoBox.replaceChildren();
        photoBox.appendChild(el('span', 'badge-card__photo-placeholder', '📷'));
      };
      photoBox.appendChild(img);
    } else {
      photoBox.appendChild(el('span', 'badge-card__photo-placeholder', '📷'));
    }
    left.appendChild(photoBox);
    left.appendChild(el('div', 'badge-card__name', personName));
    left.appendChild(el('div', 'badge-card__role', roleLabel));
    content.appendChild(left);

    // RIGHT: QR + serial
    const right = el('div', 'badge-card__right');
    const qrBox = el('div', 'badge-card__qr');

    // Genera QR SVG via MaatQR
    try {
      if (window.MaatQR && typeof window.MaatQR.renderSVG === 'function' && token !== '—') {
        const svg = window.MaatQR.renderSVG(token, {
          size: 300,
          fg: '#0A0D10',
          bg: '#FFFFFF',
          errorCorrection: 'H',
          margin: 2,
        });
        qrBox.innerHTML = svg;
      } else {
        qrBox.appendChild(el('span', null, 'QR'));
      }
    } catch (e) {
      warn('renderSVG failed:', e);
      qrBox.textContent = 'QR';
    }
    right.appendChild(qrBox);

    right.appendChild(el('div', 'badge-card__serial-label', 'N° SÉRIE'));
    right.appendChild(el('div', 'badge-card__serial', serial));
    right.appendChild(el('div', 'badge-card__token', token));

    content.appendChild(right);

    // FOOTER
    const footer = el('div', 'badge-card__footer',
      'OPÉRÉ PAR INDUSTRIAL ILLUSION · ASSISTANCE B2B WHATSAPP 24/7');
    content.appendChild(footer);

    card.appendChild(content);
    return card;
  }

  /* ─── Overlay open/close ────────────────────────────────────────────── */
  function ensureOverlay() {
    if (S.overlay) return S.overlay;
    const ov = document.createElement('div');
    ov.className = 'maat-badge-overlay';
    ov.hidden = true;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Mon Badge');
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => {
      if (e.target === ov) closePanel();
    });
    S.overlay = ov;
    return ov;
  }

  function buildPanel() {
    const panel = el('div', 'maat-badge-panel');

    const head = el('div', 'maat-badge-panel__head');
    head.appendChild(el('div', 'maat-badge-panel__title', 'Mon Badge Officiel'));
    const closeBtn = el('button', 'maat-badge-panel__close', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.addEventListener('click', closePanel);
    head.appendChild(closeBtn);
    panel.appendChild(head);

    return panel;
  }

  async function openPanel() {
    if (S.loading) return;
    S.loading = true;

    const sb = getClient();
    if (!sb) {
      window.alert('Service temporairement indisponible.');
      S.loading = false;
      return;
    }

    const ov = ensureOverlay();
    ov.hidden = false;
    document.body.style.overflow = 'hidden';

    // Reset content, mostra loading
    ov.replaceChildren();
    const panel = buildPanel();
    panel.appendChild(el('div', 'maat-badge-msg maat-badge-msg--ok', 'Chargement…'));
    ov.appendChild(panel);

    try {
      await loadData();
      renderPanelContent(panel);
    } catch (err) {
      console.error('[MaatBadges] load error:', err);
      // Rimuovi loading
      const loadingMsg = panel.querySelector('.maat-badge-msg');
      if (loadingMsg) loadingMsg.remove();
      panel.appendChild(el('div', 'maat-badge-msg maat-badge-msg--err',
        'Impossible de charger le badge: ' + (err.message || err)));
    } finally {
      S.loading = false;
    }
  }

  function closePanel() {
    if (S.overlay) S.overlay.hidden = true;
    document.body.style.overflow = '';
  }

  function renderPanelContent(panel) {
    // Pulisci tutto tranne l'header
    const head = panel.querySelector('.maat-badge-panel__head');
    panel.replaceChildren();
    if (head) panel.appendChild(head);

    if (!S.user) {
      panel.appendChild(el('div', 'maat-badge-msg maat-badge-msg--err',
        'Profilo utente non disponibile.'));
      return;
    }

    if (!S.userBadge) {
      panel.appendChild(el('div', 'maat-badge-msg maat-badge-msg--err',
        'Aucun badge généré. Contactez la Direction Générale.'));
      return;
    }

    // Badge PERSONA
    const roleLabel = CFG.roleLabels[S.user.role] || S.user.role;
    const badgeEl = renderBadge(S.userBadge, {
      ownerType: 'user',
      name: S.user.full_name || S.user.email,
      roleLabel,
      photoUrl: S.user.photo_url || null,
    });
    panel.appendChild(badgeEl);

    // Upload foto
    panel.appendChild(buildUploadZone());

    // Azioni
    panel.appendChild(buildActions(badgeEl));

    // Badge STRUTTURA (se referente hotel)
    if (S.clientBadge && S.clientRow) {
      const extraWrap = el('div', 'maat-badge-extra-wrapper');
      extraWrap.style.marginTop = '8px';
      extraWrap.appendChild(el('div', 'maat-badge-panel__title', 'Badge Établissement'));
      const clientBadgeEl = renderBadge(S.clientBadge, {
        ownerType: 'client',
        name: S.clientRow.company_name || '—',
        roleLabel: 'Partenaire Hôtelier',
        photoUrl: null, // struttura senza foto
      });
      extraWrap.appendChild(clientBadgeEl);
      panel.appendChild(extraWrap);
    }
  }

  /* ─── Upload zone ───────────────────────────────────────────────────── */
  function buildUploadZone() {
    const label = el('label', 'maat-badge-upload-hint');
    label.innerHTML = (S.user.photo_url
      ? '📷 Changer la photo de profil'
      : '📷 Ajouter une photo de profil');

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/jpg,image/png,image/webp';
    input.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      await uploadPhoto(file, label);
    });
    label.appendChild(input);
    return label;
  }

  async function uploadPhoto(file, labelEl) {
    const sb = getClient();
    if (!sb) return;

    if (file.size > 2 * 1024 * 1024) {
      window.alert('Photo trop volumineuse (max 2 MB).');
      return;
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${S.user.id}/avatar-${Date.now()}.${ext}`;

    const originalText = labelEl.innerHTML;
    labelEl.innerHTML = '⏳ Upload en cours…';
    labelEl.style.pointerEvents = 'none';

    try {
      const { error: upErr } = await sb.storage
        .from(CFG.photosBucket)
        .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: pub } = sb.storage.from(CFG.photosBucket).getPublicUrl(path);
      const publicUrl = pub && pub.publicUrl;
      if (!publicUrl) throw new Error('URL publique non générée');

      const { error: upProfErr } = await sb
        .from('profiles')
        .update({ photo_url: publicUrl })
        .eq('id', S.user.id);
      if (upProfErr) throw upProfErr;

      S.user.photo_url = publicUrl;
      labelEl.innerHTML = '✅ Photo mise à jour';
      labelEl.style.pointerEvents = '';
      labelEl.style.borderColor = 'rgba(0,255,163,0.7)';

      // Riapri panel per refresh
      setTimeout(() => {
        if (S.overlay) {
          const panel = S.overlay.querySelector('.maat-badge-panel');
          if (panel) renderPanelContent(panel);
        }
      }, 600);
    } catch (err) {
      console.error('[MaatBadges] upload error:', err);
      labelEl.innerHTML = '❌ Erreur: ' + (err.message || err);
      labelEl.style.pointerEvents = '';
      setTimeout(() => {
        labelEl.innerHTML = originalText;
        labelEl.style.borderColor = '';
      }, 3000);
    }
  }

  /* ─── Actions ───────────────────────────────────────────────────────── */
  function buildActions(badgeEl) {
    const wrap = el('div', 'maat-badge-actions');

    // Download PNG
    const dlBtn = el('button', 'maat-badge-btn maat-badge-btn--primary', '📥 Télécharger PNG');
    dlBtn.type = 'button';
    dlBtn.addEventListener('click', () => downloadPNG(badgeEl, dlBtn));
    wrap.appendChild(dlBtn);

    // Print
    const printBtn = el('button', 'maat-badge-btn maat-badge-btn--gold', '🖨 Imprimer CR-80');
    printBtn.type = 'button';
    printBtn.addEventListener('click', () => {
      window.print();
    });
    wrap.appendChild(printBtn);

    return wrap;
  }

  /* ─── Download PNG via html2canvas ──────────────────────────────────── */
  function loadHtml2Canvas() {
    if (S.html2canvasLoaded) return Promise.resolve();
    if (window.html2canvas) { S.html2canvasLoaded = true; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CFG.html2canvasCdn;
      s.onload = () => { S.html2canvasLoaded = true; resolve(); };
      s.onerror = () => reject(new Error('html2canvas load failed'));
      document.head.appendChild(s);
    });
  }

  async function downloadPNG(badgeEl, btn) {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Génération…';

    try {
      await loadHtml2Canvas();
      const canvas = await window.html2canvas(badgeEl, {
        backgroundColor: null,
        scale: 3, // alta risoluzione (~300 DPI per CR-80)
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Blob generation failed');

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const token = badgeEl.dataset.token || 'badge';
      const filename = `${token.replace(/[^A-Z0-9-]/gi, '')}.png`;
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      btn.textContent = '✅ Téléchargé';
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
      }, 1800);
    } catch (err) {
      console.error('[MaatBadges] downloadPNG failed:', err);
      btn.textContent = '❌ Échec';
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
      }, 2000);
      // Fallback: consiglia print
      window.alert('Téléchargement PNG indisponible. Utilisez "Imprimer" puis "Enregistrer en PDF".');
    }
  }

  /* ─── FAB ───────────────────────────────────────────────────────────── */
  function ensureFab() {
    if (S.fab) return S.fab;
    const btn = document.createElement('button');
    btn.id = 'maat-badge-fab';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Mon Badge');
    btn.title = 'Mon Badge';
    btn.innerHTML = '🪪';
    btn.hidden = true;
    btn.addEventListener('click', openPanel);
    document.body.appendChild(btn);
    S.fab = btn;
    return btn;
  }

  async function checkSessionAndShowFab() {
    try {
      const sb = getClient();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session || !session.user) {
        if (S.fab) S.fab.hidden = true;
        return;
      }
      // Verifica profilo
      const { data: profile } = await sb
        .from('profiles')
        .select('role, status')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!profile || profile.status !== 'ACTIVE') {
        if (S.fab) S.fab.hidden = true;
        return;
      }
      if (['operator','client','admin'].includes(profile.role)) {
        if (S.fab) S.fab.hidden = false;
      } else {
        if (S.fab) S.fab.hidden = true;
      }
    } catch (e) {
      warn('checkSessionAndShowFab failed:', e.message);
    }
  }

  /* ─── Init ──────────────────────────────────────────────────────────── */
  async function init() {
    if (S.booted) return;
    const ready = await waitForClient(Date.now() + CFG.clientWaitMs);
    if (!ready) {
      warn('Supabase client non disponibile — modulo in standby');
      return;
    }
    S.booted = true;
    ensureFab();
    ensureOverlay();
    await checkSessionAndShowFab();

    // Listener cambio auth (login/logout)
    try {
      getClient().auth.onAuthStateChange(() => {
        setTimeout(checkSessionAndShowFab, 300);
      });
    } catch (_) {}

    log('ready v1.0.0');
  }

  /* ─── Public API ────────────────────────────────────────────────────── */
  window.MaatPwaBadges = {
    init,
    open: openPanel,
    close: closePanel,
    refresh: checkSessionAndShowFab,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
