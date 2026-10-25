/* ==========================================================================
 *  assets/qr-generator.js
 *  Phase 3 · QR Generator (bag, badge, certificate)
 *  Formato: PK-{CLUSTER}-{MATERIAL}-{ANNO}-{SERIAL}
 *  Dipendenza: qrcode-generator (CDN jsdelivr, global window.qrcode)
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatQRGenLoaded) return;
  window.__MaatQRGenLoaded = true;

  const CLUSTERS = ['MED','GUEL','PALM','HIVER','AGDAL','SEM','TARGA'];
  const MATERIALS = ['PET','PEHD','LDPE','PP','CARD','ALU','FER','GLASS','ORG'];
  const COLORS = {
    green:  '#00FFA3',
    gold:   '#D4AF37',
    black:  '#090D10',
    white:  '#FFFFFF',
  };

  function generateSerial() {
    const chars = 'ABCDEF0123456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function parseBagQR(qr) {
    if (!qr || typeof qr !== 'string') return null;
    const m = qr.match(/^PK-(MED|GUEL|PALM|HIVER|AGDAL|SEM|TARGA)-(PET|PEHD|LDPE|PP|CARD|ALU|FER|GLASS|ORG)-(\d{4})-([A-Z0-9]{6})$/);
    if (!m) return null;
    return { cluster: m[1], material: m[2], year: parseInt(m[3], 10), serial: m[4], raw: qr };
  }

  function bagQRString(cluster, material, year, serial) {
    if (!CLUSTERS.includes(cluster)) throw new Error('INVALID_CLUSTER: ' + cluster);
    if (!MATERIALS.includes(material)) throw new Error('INVALID_MATERIAL: ' + material);
    if (year < 2026 || year > 2050) throw new Error('INVALID_YEAR: ' + year);
    const s = (serial || generateSerial()).toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(s)) throw new Error('INVALID_SERIAL: ' + s);
    return `PK-${cluster}-${material}-${year}-${s}`;
  }

  function badgeQRString(userId, role) {
    if (!userId) throw new Error('INVALID_USER');
    const validRoles = ['vector','client_hotel','admin','direction','fmcg','viewer'];
    if (!validRoles.includes(role)) throw new Error('INVALID_ROLE: ' + role);
    return `BDG-${role.toUpperCase()}-${userId.slice(0, 8)}-${userId.slice(-4)}`;
  }

  function certQRString(serial, hash) {
    if (!serial || !hash) throw new Error('INVALID_CERT');
    return `ESG-${serial}-${hash.slice(0, 16)}`;
  }

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

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">
<rect width="${size}" height="${size}" fill="${bg}"/>
<path d="${paths}" fill="${fg}"/>
</svg>`;

    return svg;
  }

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

  window.MaatQR = {
    CLUSTERS,
    MATERIALS,
    COLORS,
    generateSerial,
    parseBagQR,
    bagQRString,
    badgeQRString,
    certQRString,
    renderSVG,
    renderCanvas,
  };

  console.log('[QR] generator ready · v1.0.0');
})();
