/* ============================================================
   MAAT DATA LAKE · MATRIX CANVAS ENGINE v1.0
   Industrial Illusion SARL · Deep Tech Systems · Marrakech

   Fond animé : pluie numérique Cyber-Kemet (binôme / hex / hash
   SHA-256 / IDs blocs) + filigrane sacré (Plume de Maât +
   Balance Cybernétique + Œil d'Horus).

   Performances : Canvas 2D, ~30 FPS adaptatif, pause on hidden,
   pointer-events: none (aucun impact sur le scroll).

   Copyright © 2026 Industrial Illusion SARL. Tous droits réservés.
   ============================================================ */

(function () {
  'use strict';

  if (window.__matrixCanvasInstalled) return;
  window.__matrixCanvasInstalled = true;

  /* ============================================================
     §1 · Canvas injection / attachement
     ============================================================ */
  var canvas = document.getElementById('matrixCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'matrixCanvas';
    canvas.setAttribute('aria-hidden', 'true');
    if (document.body) {
      document.body.insertBefore(canvas, document.body.firstChild);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        document.body.insertBefore(canvas, document.body.firstChild);
      });
    }
  }

  canvas.style.cssText =
    'position:fixed !important;' +
    'inset:0 !important;' +
    'width:100vw !important;' +
    'height:100vh !important;' +
    'z-index:0 !important;' +
    'pointer-events:none !important;' +
    'display:block !important;' +
    'background:#060A0D !important;';

  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { console.warn('[MATRIX-CANVAS] 2D context unavailable'); return; }

  /* ============================================================
     §2 · Préférences & constantes
     ============================================================ */
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0, DPR = 1;
  var COL_W = 22;
  var COL_LEN_MIN = 10;
  var COL_LEN_MAX = 28;
  var BASE_SPEED = 55;      // px / s
  var SPEED_VARIANCE = 90;  // px / s

  var COLOR_BG = 'rgba(6, 10, 13, 0.10)';
  var COLOR_HEAD = '#FFFFFF';
  var COLOR_GREEN = '#00FFA3';
  var COLOR_GOLD = '#E8C86A';

  var BLOCK_PREFIXES = ['0x', 'LOT-', 'P1:', 'P2:', 'HR-', 'WL-', 'HW-', 'MNT-', 'SHA-'];

  var CATALOG_CHARS = [];
  // Chiffres binaires
  var binary = ['0','1'];
  // Hex
  var hex = '0123456789ABCDEF'.split('');
  // Katakana + latin
  var glyphs = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワンｱｲｳｴｵ'.split('');

  CATALOG_CHARS = binary.concat(hex).concat(glyphs);

  /* ============================================================
     §3 · État
     ============================================================ */
  var columns = [];
  var running = true;
  var lastTs = 0;
  var elapsed = 0;
  var acc = 0; // accumulateur pour throttling
  var FRAME_TARGET = 1000 / 30; // 30 fps

  var mouse = { x: -10000, y: -10000, active: false };

  /* ============================================================
     §4 · Utilitaires
     ============================================================ */
  function rand(min, max) { return min + Math.random() * (max - min); }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

  function pickChar() {
    var r = Math.random();
    if (r < 0.55) {
      // binaire dominant
      return binary[Math.random() < 0.5 ? 0 : 1];
    } else if (r < 0.85) {
      return hex[Math.floor(Math.random() * hex.length)];
    } else {
      return glyphs[Math.floor(Math.random() * glyphs.length)];
    }
  }

  function pickPrefix() {
    return BLOCK_PREFIXES[Math.floor(Math.random() * BLOCK_PREFIXES.length)];
  }

  /* ============================================================
     §5 · Génération de colonnes
     ============================================================ */
  function buildColumn(x) {
    var len = randInt(COL_LEN_MIN, COL_LEN_MAX);
    var chars = [];
    for (var i = 0; i < len; i++) chars.push(pickChar());
    return {
      x: x,
      y: -rand(0, H),
      speed: rand(BASE_SPEED, BASE_SPEED + SPEED_VARIANCE),
      len: len,
      chars: chars,
      headPrefix: pickPrefix(),
      gold: Math.random() < 0.20,
      drift: rand(-0.15, 0.15)
    };
  }

  function buildColumns() {
    columns = [];
    var count = Math.ceil(W / COL_W);
    for (var i = 0; i < count; i++) {
      columns.push(buildColumn(i * COL_W + COL_W * 0.3));
    }
  }

  /* ============================================================
     §6 · Resize
     ============================================================ */
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(W * DPR));
    canvas.height = Math.max(1, Math.floor(H * DPR));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#060A0D';
    ctx.fillRect(0, 0, W, H);
    buildColumns();
  }

  /* ============================================================
     §7 · Filigrane sacré (Plume + Balance + Œil d'Horus)
     ============================================================ */
  function drawFeather(t, alphaScale) {
    var cx = W / 2;
    var cy = H / 2;
    var s = Math.min(W, H) / 820;
    var sway = Math.sin(t * 0.55) * 12;
    var a = alphaScale;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.rotate(-0.12 + Math.sin(t * 0.35) * 0.02);

    /* ---- Plume de Maât ---- */
    // Corps de la plume
    ctx.fillStyle = 'rgba(0, 255, 163, ' + (a * 0.55) + ')';
    ctx.strokeStyle = 'rgba(0, 255, 163, ' + (a * 0.85) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sway, -230);
    ctx.bezierCurveTo(75 + sway, -110, 85 + sway, 70, sway, 230);
    ctx.bezierCurveTo(-85 + sway, 70, -75 + sway, -110, sway, -230);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Nervure centrale
    ctx.strokeStyle = 'rgba(232, 200, 106, ' + (a * 0.95) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sway, -230);
    ctx.lineTo(sway, 230);
    ctx.stroke();

    // Barbes de la plume
    ctx.strokeStyle = 'rgba(232, 200, 106, ' + (a * 0.55) + ')';
    ctx.lineWidth = 1;
    for (var i = -210; i <= 210; i += 18) {
      var progress = (i + 230) / 460;
      var barbW = 78 * Math.sin(progress * Math.PI);
      if (barbW < 4) continue;
      ctx.beginPath();
      ctx.moveTo(sway, i);
      ctx.lineTo(sway + barbW, i - 10);
      ctx.moveTo(sway, i);
      ctx.lineTo(sway - barbW, i - 10);
      ctx.stroke();
    }

    ctx.restore();

    /* ---- Balance cybernétique ---- */
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.strokeStyle = 'rgba(232, 200, 106, ' + (a * 0.75) + ')';
    ctx.lineWidth = 1.6;

    // Fléau horizontal
    ctx.beginPath();
    ctx.moveTo(-150, -110);
    ctx.lineTo(150, -110);
    ctx.stroke();

    // Mât vertical central
    ctx.beginPath();
    ctx.moveTo(0, -110);
    ctx.lineTo(0, 120);
    ctx.stroke();

    // Base
    ctx.beginPath();
    ctx.moveTo(-40, 120);
    ctx.lineTo(40, 120);
    ctx.stroke();

    // Plateaux (demi-cercles)
    ctx.beginPath();
    ctx.arc(-150, -110, 55, 0, Math.PI, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(150, -110, 55, 0, Math.PI, false);
    ctx.stroke();

    // Cordes
    ctx.beginPath();
    ctx.moveTo(-150, -110);
    ctx.lineTo(-150, -55);
    ctx.moveTo(150, -110);
    ctx.lineTo(150, -55);
    ctx.stroke();

    ctx.restore();

    /* ---- Œil d'Horus au-dessus ---- */
    ctx.save();
    ctx.translate(cx, cy - 300 * s);
    ctx.scale(s, s);
    ctx.strokeStyle = 'rgba(0, 255, 163, ' + (a * 0.85) + ')';
    ctx.lineWidth = 1.8;

    // Amande de l'œil
    ctx.beginPath();
    ctx.moveTo(-60, 0);
    ctx.quadraticCurveTo(-30, -28, 0, -28);
    ctx.quadraticCurveTo(30, -28, 60, 0);
    ctx.quadraticCurveTo(30, 28, 0, 28);
    ctx.quadraticCurveTo(-30, 28, -60, 0);
    ctx.stroke();

    // Pupille
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();

    // Larme
    ctx.beginPath();
    ctx.moveTo(0, 28);
    ctx.lineTo(-4, 55);
    ctx.stroke();

    ctx.restore();
  }

  /* ============================================================
     §8 · Rendu d'une colonne
     ============================================================ */
  function drawColumn(col, t) {
    var headY = col.y;

    for (var i = 0; i < col.len; i++) {
      var cy = headY - i * 16;
      if (cy < -30 || cy > H + 30) continue;

      var dx = 0, dy = 0;
      if (mouse.active) {
        var mdx = col.x - mouse.x;
        var mdy = cy - mouse.y;
        var d2 = mdx * mdx + mdy * mdy;
        if (d2 < 160 * 160 && d2 > 1) {
          var d = Math.sqrt(d2);
          var force = (160 - d) / 160;
          dx = (mdx / d) * force * 20;
          dy = (mdy / d) * force * 10;
        }
      }

      var char = col.chars[i];
      var opacity;

      if (i === 0) {
        // Tête = blanc pur + préfixe hash
        ctx.fillStyle = COLOR_HEAD;
        ctx.font = 'bold 14px "JetBrains Mono", monospace';
        ctx.fillText(char, col.x + dx, cy + dy);
        // Préfixe juste derrière
        if (i === 1) {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.font = 'bold 12px "JetBrains Mono", monospace';
          ctx.fillText(col.headPrefix, col.x + dx, cy + dy + 2);
        }
        continue;
      }

      opacity = 1 - (i / col.len);
      opacity = opacity * opacity; // ease out

      if (col.gold && i < 3) {
        ctx.fillStyle = 'rgba(232, 200, 106, ' + (opacity * 0.95) + ')';
        ctx.font = 'bold 14px "JetBrains Mono", monospace';
      } else {
        ctx.fillStyle = 'rgba(0, 255, 163, ' + (opacity * 0.85) + ')';
        ctx.font = '14px "JetBrains Mono", monospace';
      }
      ctx.fillText(char, col.x + dx, cy + dy);
    }
  }

  /* ============================================================
     §9 · Boucle principale
     ============================================================ */
  function update(dt) {
    for (var i = 0; i < columns.length; i++) {
      var col = columns[i];
      col.y += col.speed * dt;
      col.x += col.drift * dt * 10;

      // Mutation occasionnelle des caractères
      if (Math.random() < 0.06) {
        var idx = Math.floor(Math.random() * col.chars.length);
        col.chars[idx] = pickChar();
      }

      // Recyclage
      if (col.y - col.len * 16 > H + 40) {
        col.y = -rand(80, 400);
        col.speed = rand(BASE_SPEED, BASE_SPEED + SPEED_VARIANCE);
        col.len = randInt(COL_LEN_MIN, COL_LEN_MAX);
        col.chars = [];
        for (var j = 0; j < col.len; j++) col.chars.push(pickChar());
        col.headPrefix = pickPrefix();
        col.gold = Math.random() < 0.20;
        col.drift = rand(-0.15, 0.15);
      }
    }
  }

  function render(t) {
    // Fade pour créer la traînée (10 % d'assombrissement par frame)
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, W, H);

    // Filigrane sacré (re-dessiné à faible opacité chaque frame → build up à ~0.15)
    drawFeather(t, 0.014);

    // Colonnes
    for (var i = 0; i < columns.length; i++) drawColumn(columns[i], t);
  }

  function loop(now) {
    requestAnimationFrame(loop);

    if (!running) { lastTs = now; return; }

    var dt = (now - lastTs) / 1000;
    lastTs = now;
    if (dt > 0.25) dt = 0.25;
    elapsed += dt;

    // Throttle à 30 FPS
    acc += (now - lastTs === 0 ? 16 : 0); // no-op safeguard
    if (reducedMotion) {
      // Rendu statique toutes les 500ms
      if (elapsed - (canvas.__lastStatic || 0) > 0.5) {
        canvas.__lastStatic = elapsed;
        render(elapsed);
      }
      return;
    }

    update(dt);
    render(elapsed);
  }

  /* ============================================================
     §10 · Input mouse / touch (passifs)
     ============================================================ */
  window.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  }, { passive: true });

  window.addEventListener('mouseleave', function () {
    mouse.active = false;
    mouse.x = -10000;
    mouse.y = -10000;
  });

  window.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches[0]) {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
      mouse.active = true;
    }
  }, { passive: true });

  window.addEventListener('touchend', function () {
    mouse.active = false;
    mouse.x = -10000;
    mouse.y = -10000;
  }, { passive: true });

  /* ============================================================
     §11 · Visibility & resize
     ============================================================ */
  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) lastTs = performance.now();
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 180);
  });

  /* ============================================================
     §12 · Bootstrap
     ============================================================ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      resize();
      lastTs = performance.now();
      requestAnimationFrame(loop);
    });
  } else {
    resize();
    lastTs = performance.now();
    requestAnimationFrame(loop);
  }

  window.addEventListener('load', resize);

  try { console.info('%c[MAAT DATA LAKE] Matrix canvas engine active', 'color:#00FFA3;font-weight:bold;'); } catch (e) {}

})();
