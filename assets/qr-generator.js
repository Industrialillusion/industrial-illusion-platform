/* ==========================================================================
 *  assets/qr-generator.js
 *  Phase 3 + 5.3.A · QR Generator (bag, badge, certificate, DEPOT)
 *  Formati:
 *   - Bag:    PK-{CLUSTER}-{MATERIAL}-{ANNO}-{SERIAL}
 *   - Badge:  BDG-{ROLE}-{userId_short}-{userId_last4}
 *   - Cert:   ESG-{serial}-{hash_short}
 *   - Depot:  DEPOT-{CLUSTER}-{SERIAL}
 *  v1.2.0: +buildScanURL +normalizeScannedPayload +extractScanMode +DIB
 *  Dipendenza: qrcode-generator (CDN jsdelivr, global window.qrcode)
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatQRGenLoaded) return;
  window.__MaatQRGenLoaded = true;

  const CLUSTERS = ['MED','GUEL','PALM','HIVER','AGDAL','SEM','TARGA'];
  const MATERIALS = ['PET','PEHD','LDPE','PP','CARD','ALU','FER','GLASS','ORG','DIB'];
  const DEPOT_SERIALS = ['01','02','03','04','05','06','07','08','09','10'];
  const COLORS = {
    green:  '#00FFA3',
    gold:   '#D4AF37',
    black:  '#090D10',
    white:  '#FFFFFF',
  };

  function generateSerial(len) {
    len = len || 6;
    const chars = 'ABCDEF0123456789';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  /* ─── Bag QR ──────────────────────────────────────────────────────────── */
  function parseBagQR(qr) {
    if (!qr || typeof qr !== 'string') return null;
    const m = qr.match(/^PK-(MED|GUEL|PALM|HIVER|AGDAL|SEM|TARGA)-(PET|PEHD|LDPE|PP|CARD|ALU|FER|GLASS|ORG|DIB)-(\d{4})-([A-Z0-9]{6})$/);
    if (!m) return null;
    return { cluster: m[1], material: m[2], year: parseInt(m[3], 10), serial: m[4], raw: qr };
  }

  function bagQRString(cluster, material, year, serial) {
    if (!CLUSTERS.includes(cluster)) throw new Error('INVALID_CLUSTER: ' + cluster);
    if (!MATERIALS.includes(material)) throw new Error('INVALID_MATERIAL: ' + material);
    if (year < 2026 || year > 2050) throw new Error('INVALID_YEAR: ' + year);
    const s = (serial || generateSerial(6)).toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(s)) throw new Error('INVALID_SERIAL: ' + s);
    return `PK-${cluster}-${material}-${year}-${s}`;
  }

  /* ─── Badge QR ────────────────────────────────────────────────────────── */
  function badgeQRString(userId, role) {
    if (!userId) throw new Error('INVALID_USER');
    const validRoles = ['vector','client_hotel','admin','direction','fmcg','viewer'];
    if (!validRoles.includes(role)) throw new Error('INVALID_ROLE: ' + role);
    return `BDG-${role.toUpperCase()}-${userId.slice(0, 8)}-${userId.slice(-4)}`;
  }

  /* ─── Cert QR ─────────────────────────────────────────────────────────── */
  function certQRString(serial, hash) {
    if (!serial || !hash) throw new Error('INVALID_CERT');
    return `ESG-${serial}-${hash.slice(0, 16)}`;
  }

  /* ─── Depot QR ────────────────────────────────────────────────────────── */
  function parseDepotQR(qr) {
    if (!qr || typeof qr !== 'string') return null;
    const m = qr.match(/^DEPOT-(MED|GUEL|PALM|HIVER|AGDAL|SEM|TARGA)-(\d{2})$/);
    if (!m) return null;
    return { cluster: m[1], serial: m[2], raw: qr };
  }

  function depotQRString(cluster, serial) {
    if (!CLUSTERS.includes(cluster)) throw new Error('INVALID_CLUSTER: ' + cluster);
    const s = (serial || '01').toString().padStart(2, '0');
    if (!/^\d{2}$/.test(s)) throw new Error('INVALID_SERIAL: ' + s);
    return `DEPOT-${cluster}-${s}`;
  }

  /* ─── Scan URL building (badge + sacchi + depot) ──────────────────────── */
  function buildScanURL(token, opts) {
    opts = opts || {};
    var base = opts.base || 'https://www.industrialillusion.ma/pwa.html';
    var mode = opts.mode || null;
    var url = base + '?scan=' + encodeURIComponent(token);
    if (mode) url += '&mode=' + encodeURIComponent(mode);
    return url;
  }

  /* ─── Scan payload normalization (da URL o testo puro) ────────────────── */
  function normalizeScannedPayload(rawText) {
    if (!rawText) return '';
    var s = String(rawText).trim();
    if (/^https?:\/\//i.test(s)) {
      try {
        var u = new URL(s);
        var scan = u.searchParams.get('scan');
        if (scan) return decodeURIComponent(scan).trim();
        var parts = u.pathname.split('/').filter(Boolean);
        return parts.length ? decodeURIComponent(parts[parts.length - 1]) : '';
      } catch (e) {
        return s;
      }
    }
    return s;
  }

  /* ─── Scan mode extraction (p1 / p2 / depot) ──────────────────────────── */
  function extractScanMode(rawText) {
    if (!rawText) return null;
    var s = String(rawText).trim();
    if (!/^https?:\/\//i.test(s)) return null;
    try {
      var u = new URL(s);
      return u.searchParams.get('mode') || null;
    } catch (e) {
      return null;
    }
  }

  /* ─── Render SVG ──────────────────────────────────────────────────────── */
  function renderSVG(text, opts) {
    opts = opts || {};
    const size = opts.size || 240;
    const fg = opts.fg || COLORS.black;
    const bg = opts.bg || COLORS.white;
    const ec = opts.errorCorrection || 'H';
    const margin = opts.margin != null ? opts.margin : 2;

    if (typeof window.qrcode !== 'function') {
      throw new Error('qrcode library not loaded');
    }

    const qr = window.qrcode(0, ec);
    qr.addData(text);
    qr.make();

    const modCount = qr.getModuleCount();
    const totalModules = modCount + margin * 2;
    const cellSize = size / totalModules;

    let paths = '';
    for (let row = 0; row < modCount; row++) {
      for (let col = 0; col < modCount; col++) {
        if (qr.isDark(row, col)) {
          const x = (col + margin) * cellSize;
          const y = (row + margin) * cellSize;
          paths += `M${x.toFixed(2)},${y.toFixed(2)}h${cellSize.toFixed(2)}v${cellSize.toFixed(2)}h-${cellSize.toFixed(2)}z`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">
<rect width="${size}" height="${size}" fill="${bg}"/>
<path d="${paths}" fill="${fg}"/>
</svg>`;
  }

  /* ─── Render Canvas ───────────────────────────────────────────────────── */
  function renderCanvas(canvasEl, text, opts) {
    opts = opts || {};
    const size = opts.size || 240;
    const fg = opts.fg || COLORS.black;
    const bg = opts.bg || COLORS.white;
    const ec = opts.errorCorrection || 'H';
    const margin = opts.margin != null ? opts.margin : 2;

    const qr = window.qrcode(0, ec);
    qr.addData(text);
    qr.make();

    const modCount = qr.getModuleCount();
    const totalModules = modCount + margin * 2;
    const cellSize = size / totalModules;

    canvasEl.width = size;
    canvasEl.height = size;
    const ctx = canvasEl.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = fg;

    for (let row = 0; row < modCount; row++) {
      for (let col = 0; col < modCount; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(
            Math.round((col + margin) * cellSize),
            Math.round((row + margin) * cellSize),
            Math.ceil(cellSize),
            Math.ceil(cellSize)
          );
        }
      }
    }
    return canvasEl;
  }

  /* ─── API pubblica ────────────────────────────────────────────────────── */
  window.MaatQR = {
    CLUSTERS,
    MATERIALS,
    DEPOT_SERIALS,
    COLORS,
    generateSerial,
    parseBagQR,
    bagQRString,
    badgeQRString,
    certQRString,
    parseDepotQR,
    depotQRString,
    buildScanURL,
    normalizeScannedPayload,
    extractScanMode,
    renderSVG,
    renderCanvas,
  };

  console.log('[QR] generator ready · v1.2.0 · +SCAN URL helpers · +DIB');
})();
