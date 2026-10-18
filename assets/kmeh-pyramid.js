/* ============================================================
   K-MEH-20 · MOTEUR DE RENDU 3D CYBER-PHYSIQUE v4.0.0
   Industrial Illusion SARL · Deep Tech Systems · Marrakech

   ⚠️  REPRÉSENTATION VISUELLE & CINÉTIQUE
   Modélisation géométrique bioclimatique 56m × 56m (3 136 m²).
   Architecture modulaire par skids Plug & Process.
   Aucune formule thermochimique propriétaire n'est divulguée.
   Documentation intégrale sous secret d'affaires en Data Room NDA.

   Copyright © 2026 Industrial Illusion SARL. Tous droits réservés.
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     §0 · VERSION & INITIALISATION
     ============================================================ */
  window.__KMEH_VERSION__ = '4.0.0';
  try {
    console.info(
      '%c[K-MEH-20] ★ ENGINE 3D v4.0.0 MASTER READY ★',
      'color:#00FFA3;font-weight:bold;font-size:11px;background:#060A0D;padding:4px 8px;border:1px solid #00FFA3;border-radius:4px;'
    );
  } catch (e) {}

  var canvas = document.getElementById('kmehPyramidCanvas') || document.getElementById('heroPyramidCanvas');
  if (!canvas) {
    try { console.warn('[K-MEH-20] Canvas introuvable (#kmehPyramidCanvas / #heroPyramidCanvas).'); } catch (e) {}
    return;
  }

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    try { console.warn('[K-MEH-20] Contexte 2D non disponible.'); } catch (e) {}
    return;
  }

  var reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  function reducedMotion() { return reducedMotionQuery.matches; }

  /* ============================================================
     §1 · PALETTE CHROMATIQUE OFFICIELLE
     ============================================================ */
  var PALETTE = {
    cyberCore: '#00FFA3',
    cyberMid: '#00B871',
    cyberDeep: '#059669',
    kemetBright: '#E8C86A',
    kemetMid: '#C5A059',
    kemetDeep: '#8B6F2A',
    whitePure: '#FFFFFF',
    whiteSoft: '#F1F5F9',
    slateLight: '#94A3B8',
    slateMid: '#64748B',
    slateDark: '#334155',
    danger: '#F87171',
    warning: '#E6CA86',
    info: '#60A5FA'
  };

  /* ============================================================
     §2 · GÉOMÉTRIE DE LA PYRAMIDE TRONQUÉE (56m × 56m)
     ============================================================ */
  var PYRAMID = {
    halfBase: 1.00,
    halfTop: 0.22,
    height: 1.50,
    facesCount: 4,
    levelsCount: 4,
    realBase: 56,
    surfaceBase: 3136
  };

  var EXPLOSION_GAP_PER_LEVEL = 0.40;

  /* ============================================================
     §3 · CONFIGURATION DES 4 STRATES VOLUMÉTRIQUES
     ============================================================ */
  var LEVELS_CONFIG = [
    {
      index: 0,
      key: 'base',
      color: PALETTE.cyberCore,
      colorDim: PALETTE.cyberMid,
      label: 'NIVEAU 1 · BASE (3 136 m²)',
      subtitle: 'La Bouche & l\'Estomac · Tri Optique & Compactage'
    },
    {
      index: 1,
      key: 'centre',
      color: PALETTE.cyberMid,
      colorDim: PALETTE.cyberDeep,
      label: 'NIVEAU 2 · CENTRE (1 400 m²)',
      subtitle: 'Système Nerveux · Fluidique & Climatisation d-HVAC'
    },
    {
      index: 2,
      key: 'elevation',
      color: PALETTE.kemetMid,
      colorDim: PALETTE.kemetDeep,
      label: 'NIVEAU 3 · ÉLÉVATION (600 m²)',
      subtitle: 'Cerveau Algorithmique · Cluster Maat OS & Data Lake'
    },
    {
      index: 3,
      key: 'sommet',
      color: PALETTE.kemetBright,
      colorDim: PALETTE.kemetMid,
      label: 'NIVEAU 4 · SOMMET (150 m²)',
      subtitle: 'L\'Œil d\'Horus · Tour de Contrôle & Observatoire 360°'
    }
  ];

  /* ============================================================
     §4 · SKIDS MODULAIRES ORBITAUX
     ============================================================ */
  var SKID_TYPES = {
    MATTER: { key: 'MATTER', color: PALETTE.kemetBright, size: 0.052, speed: 0.32, icon: '◧' },
    DATA:   { key: 'DATA',   color: PALETTE.cyberCore,   size: 0.044, speed: 0.50, icon: '◈' },
    ENERGY: { key: 'ENERGY', color: PALETTE.kemetMid,    size: 0.040, speed: 0.75, icon: '◉' }
  };

  var SKIDS_CONFIG = [
    { level: 0, type: 'MATTER', angleOffset: 0.00 },
    { level: 0, type: 'MATTER', angleOffset: 0.42 },
    { level: 0, type: 'MATTER', angleOffset: 0.84 },
    { level: 0, type: 'DATA',   angleOffset: 0.21 },
    { level: 0, type: 'ENERGY', angleOffset: 0.63 },
    { level: 1, type: 'DATA',   angleOffset: 0.10 },
    { level: 1, type: 'DATA',   angleOffset: 0.52 },
    { level: 1, type: 'ENERGY', angleOffset: 0.31 },
    { level: 1, type: 'MATTER', angleOffset: 0.73 },
    { level: 2, type: 'DATA',   angleOffset: 0.15 },
    { level: 2, type: 'DATA',   angleOffset: 0.57 },
    { level: 2, type: 'ENERGY', angleOffset: 0.36 },
    { level: 3, type: 'DATA',   angleOffset: 0.00 },
    { level: 3, type: 'ENERGY', angleOffset: 0.50 }
  ];

  /* ============================================================
     §5 · ÉTAT INTERNE DE L'ENGINE
     ============================================================ */
  var engine = {
    W: 0, H: 0, DPR: 1,
    lastFrameTime: 0, elapsedTime: 0, deltaTime: 0,
    fps: 60, fpsAccumulator: 0, fpsFrames: 0,
    paused: false, initialized: false,
    renderRequestId: 0, pointer: null, rect: null,
    firstRenderLogged: false
  };

  var camera = {
    rotation: -0.65, targetRotation: -0.65,
    tilt: 0.38, targetTilt: 0.38,
    zoom: 1.05, targetZoom: 1.05,
    autoRotate: true, autoRotateSpeed: 0.10,
    velocity: 0, velocityDamping: 0.92,
    isDragging: false, hasDragged: false,
    lastX: 0, lastY: 0, dragStartTime: 0
  };

  var selection = {
    level: 0,
    hoveredLevel: -1,
    skid: -1,
    hoveredSkid: -1,
    explosion: 1.0,
    explosionTarget: 1.0,
    showTelemetry: true,
    showCompass: true,
    showGrid: true
  };

  /* ============================================================
     §6 · FONCTIONS MATHÉMATIQUES & PROJECTION 3D
     ============================================================ */
  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /*
   * PROJECTION 3D ISO-PERSPECTIVE
   * Y 3D > 0 = BAS (sol/base)
   * Y 3D < 0 = HAUT (sommet/apex)
   * Ainsi la pyramide est dessinée à l'endroit, base fermement posée.
   */
  function projectPoint(x, y, z) {
    var cosR = Math.cos(camera.rotation);
    var sinR = Math.sin(camera.rotation);
    var rx = x * cosR - z * sinR;
    var rz = x * sinR + z * cosR;

    var cosT = Math.cos(camera.tilt);
    var sinT = Math.sin(camera.tilt);
    var ry = y * cosT - rz * sinT;
    var rz2 = y * sinT + rz * cosT;

    var fov = 420;
    var perspFactor = fov / (fov + rz2 * 110);
    var baseScale = Math.min(engine.W / 2.3, engine.H / 1.75);
    var scale = baseScale * camera.zoom;

    return {
      x: engine.W / 2 + rx * scale * perspFactor,
      y: engine.H / 2 + ry * scale * perspFactor,
      depth: rz2,
      scale: scale * perspFactor
    };
  }

  function getExplosionOffset(level) {
    // Les étages montent vers le haut (donc Y devient plus négatif)
    return -1 * selection.explosion * (level * EXPLOSION_GAP_PER_LEVEL);
  }

  function projectRing(t, yOffset) {
    yOffset = yOffset || 0;
    // t = 0 (base large) -> t = 1 (sommet étroit)
    var halfWidth = lerp(PYRAMID.halfBase, PYRAMID.halfTop, t);
    // Base à +height/2, sommet à -height/2
    var y3d = (PYRAMID.height / 2) - (t * PYRAMID.height) + yOffset;

    var corners = [
      { x: -halfWidth, z: -halfWidth },
      { x: +halfWidth, z: -halfWidth },
      { x: +halfWidth, z: +halfWidth },
      { x: -halfWidth, z: +halfWidth }
    ];

    return corners.map(function (c) {
      return projectPoint(c.x, y3d, c.z);
    });
  }

  /* ============================================================
     §7 · SCÈNE & PARTICULES
     ============================================================ */
  var scene = {
    skids: [],
    energyParticles: [],
    dataParticles: [],
    coreParticles: [],
    ringsCache: [],
    scanLineY: 0
  };

  function createSkid(config, idx) {
    var type = SKID_TYPES[config.type];
    var level = config.level;
    var tMid = (level + 0.5) / PYRAMID.levelsCount;
    var yMid = (PYRAMID.height / 2) - (tMid * PYRAMID.height);
    var halfWidthAtLevel = lerp(PYRAMID.halfBase, PYRAMID.halfTop, tMid);
    var orbitRadius = halfWidthAtLevel * 1.48 + 0.08;

    return {
      id: idx,
      level: level,
      type: type,
      typeKey: config.type,
      angle: config.angleOffset * Math.PI * 2,
      radius: orbitRadius,
      baseY: yMid,
      speed: type.speed * (0.85 + Math.random() * 0.3),
      phase: Math.random() * Math.PI * 2,
      bobAmp: 0.02 + Math.random() * 0.02,
      size: type.size,
      trail: [],
      trailMax: 12,
      hover: false,
      px: 0, py: 0, pz: 0, projScale: 1
    };
  }

  function createCoreParticles() {
    var list = [];
    var count = 36;
    for (var i = 0; i < count; i++) {
      list.push({
        progress: Math.random(),
        speed: 0.18 + Math.random() * 0.14,
        angle: Math.random() * Math.PI * 2,
        radius: 0.03 + Math.random() * 0.10,
        size: 1.4 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
        color: Math.random() < 0.5 ? PALETTE.cyberCore : PALETTE.kemetBright
      });
    }
    return list;
  }

  function initializeScene() {
    scene.skids = SKIDS_CONFIG.map(function (cfg, idx) { return createSkid(cfg, idx); });
    scene.coreParticles = createCoreParticles();
    scene.ringsCache = [];
  }

  function updateRingsCache() {
    var cache = [];
    for (var lvl = 0; lvl < PYRAMID.levelsCount; lvl++) {
      var offset = getExplosionOffset(lvl);
      var bottomT = lvl / PYRAMID.levelsCount;
      var topT = (lvl + 1) / PYRAMID.levelsCount;
      cache.push({
        level: lvl,
        offsetY: offset,
        bottom: projectRing(bottomT, offset),
        top: projectRing(topT, offset)
      });
    }
    scene.ringsCache = cache;
  }

  /* ============================================================
     §8 · MISES À JOUR CINÉTIQUES
     ============================================================ */
  function updateSkids(dt) {
    var timeSec = engine.elapsedTime;
    for (var i = 0; i < scene.skids.length; i++) {
      var skid = scene.skids[i];
      if (!reducedMotion()) {
        skid.angle += skid.speed * dt;
        if (skid.angle > Math.PI * 2) skid.angle -= Math.PI * 2;
      }

      var bob = Math.sin(skid.phase + timeSec * 1.5) * skid.bobAmp;
      var levelOffset = getExplosionOffset(skid.level);
      var px3d = Math.cos(skid.angle) * skid.radius;
      var pz3d = Math.sin(skid.angle) * skid.radius;
      var py3d = skid.baseY + levelOffset + bob;

      var projected = projectPoint(px3d, py3d, pz3d);
      skid.px = projected.x;
      skid.py = projected.y;
      skid.pz = projected.depth;
      skid.projScale = projected.scale;

      skid.trail.push({ x: projected.x, y: projected.y });
      if (skid.trail.length > skid.trailMax) skid.trail.shift();

      if (engine.pointer) {
        var dx = engine.pointer.x - projected.x;
        var dy = engine.pointer.y - projected.y;
        skid.hover = (dx * dx + dy * dy) < (24 * 24);
      } else {
        skid.hover = false;
      }
    }
  }

  function updateParticles(dt) {
    for (var k = 0; k < scene.coreParticles.length; k++) {
      var cp = scene.coreParticles[k];
      cp.progress += cp.speed * dt;
      if (cp.progress > 1) {
        cp.progress = 0;
        cp.radius = 0.03 + Math.random() * 0.10;
      }
      cp.angle += dt * 0.8;
    }
  }

  function updateExplosion(dt) {
    var diff = selection.explosionTarget - selection.explosion;
    var step = 1.8 * dt;
    if (Math.abs(diff) < 0.002) {
      selection.explosion = selection.explosionTarget;
    } else {
      selection.explosion += Math.sign(diff) * Math.min(Math.abs(diff), step);
    }
  }

  function updateScene(dt) {
    updateExplosion(dt);
    updateRingsCache();
    updateSkids(dt);
    updateParticles(dt);
  }

  /* ============================================================
     §9 · RENDU GRAPHIQUE (HIGH VISIBILITY)
     ============================================================ */

  // 1. Halo et fond radial
  function drawPyramidAtmosphere() {
    var cx = engine.W / 2;
    var cy = engine.H / 2;
    var r = Math.min(engine.W, engine.H) * 0.58;
    if (r <= 0) return;

    var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, 'rgba(0, 255, 163, 0.12)');
    grd.addColorStop(0.35, 'rgba(197, 160, 89, 0.06)');
    grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, engine.W, engine.H);
  }

  // 2. Facettes et structure solide
  function drawPyramidLevels() {
    var faces = [];

    for (var lvl = 0; lvl < scene.ringsCache.length; lvl++) {
      var cache = scene.ringsCache[lvl];
      var ringTop = cache.top;
      var ringBot = cache.bottom;

      for (var side = 0; side < PYRAMID.facesCount; side++) {
        var s0 = ringTop[side];
        var s1 = ringTop[(side + 1) % PYRAMID.facesCount];
        var s2 = ringBot[(side + 1) % PYRAMID.facesCount];
        var s3 = ringBot[side];
        var avgDepth = (s0.depth + s1.depth + s2.depth + s3.depth) / 4;

        faces.push({
          level: lvl,
          side: side,
          pts: [s0, s1, s2, s3],
          depth: avgDepth,
          config: LEVELS_CONFIG[lvl]
        });
      }
    }

    // Tri par profondeur Z (Painter's algorithm)
    faces.sort(function (a, b) { return b.depth - a.depth; });

    for (var f = 0; f < faces.length; f++) {
      drawFace(faces[f]);
    }
  }

  function drawFace(face) {
    var cfg = face.config;
    var isSelected = (selection.level === face.level);
    var isHovered = (selection.hoveredLevel === face.level);

    // Alpha boost pour garantir la visibilité sur fond étoilé
    var baseAlpha = isSelected ? 0.92 : (isHovered ? 0.85 : 0.74);
    var strokeAlpha = 1.0;
    var glowBlur = isSelected ? 26 : (isHovered ? 18 : 10);
    var lineWidth = isSelected ? 3.0 : 2.2;

    if (isSelected && !reducedMotion()) {
      baseAlpha += 0.06 * Math.sin(engine.elapsedTime * 4);
    }

    // Remplissage avec dégradé d'ombrage industriel
    var fillGrd = ctx.createLinearGradient(face.pts[0].x, face.pts[0].y, face.pts[2].x, face.pts[2].y);
    fillGrd.addColorStop(0, hexToRgba(cfg.color, baseAlpha * 0.85));
    fillGrd.addColorStop(0.5, hexToRgba(cfg.color, baseAlpha));
    fillGrd.addColorStop(1, hexToRgba(cfg.colorDim, baseAlpha * 0.70));

    ctx.fillStyle = fillGrd;
    ctx.beginPath();
    ctx.moveTo(face.pts[0].x, face.pts[0].y);
    ctx.lineTo(face.pts[1].x, face.pts[1].y);
    ctx.lineTo(face.pts[2].x, face.pts[2].y);
    ctx.lineTo(face.pts[3].x, face.pts[3].y);
    ctx.closePath();
    ctx.fill();

    // Grille blueprint intérieure
    if (selection.showGrid && (isSelected || isHovered)) {
      ctx.strokeStyle = hexToRgba(cfg.color, 0.35);
      ctx.lineWidth = 0.6;
      for (var g = 1; g <= 2; g++) {
        var t = g / 3;
        var xa = lerp(face.pts[0].x, face.pts[1].x, t), ya = lerp(face.pts[0].y, face.pts[1].y, t);
        var xb = lerp(face.pts[3].x, face.pts[2].x, t), yb = lerp(face.pts[3].y, face.pts[2].y, t);
        ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
      }
    }

    // Arêtes extérieures lumineuses
    ctx.shadowColor = cfg.color;
    ctx.shadowBlur = glowBlur;
    ctx.strokeStyle = hexToRgba(cfg.color, strokeAlpha);
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // 3. Plateforme supérieure et vertices
  function drawPyramidTopsAndVertices() {
    var topCache = scene.ringsCache[PYRAMID.levelsCount - 1];
    if (topCache) {
      var topRing = topCache.top;
      var cfgTop = LEVELS_CONFIG[3];
      var isTopActive = (selection.level === 3 || selection.hoveredLevel === 3);

      ctx.fillStyle = hexToRgba(cfgTop.color, isTopActive ? 0.90 : 0.75);
      ctx.beginPath();
      ctx.moveTo(topRing[0].x, topRing[0].y);
      for (var i = 1; i < 4; i++) ctx.lineTo(topRing[i].x, topRing[i].y);
      ctx.closePath();
      ctx.fill();

      ctx.shadowColor = cfgTop.color;
      ctx.shadowBlur = isTopActive ? 24 : 12;
      ctx.strokeStyle = hexToRgba(cfgTop.color, 1.0);
      ctx.lineWidth = isTopActive ? 3.2 : 2.4;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Noeuds et sommets (Vertices)
    for (var lvl = 0; lvl < scene.ringsCache.length; lvl++) {
      var cache = scene.ringsCache[lvl];
      var cfg = LEVELS_CONFIG[lvl];
      var rings = [cache.bottom, cache.top];
      var active = (selection.level === lvl || selection.hoveredLevel === lvl);

      for (var r = 0; r < rings.length; r++) {
        var ring = rings[r];
        for (var s = 0; s < ring.length; s++) {
          var pt = ring[s];
          ctx.fillStyle = hexToRgba(cfg.color, 1.0);
          ctx.shadowColor = cfg.color;
          ctx.shadowBlur = active ? 14 : 7;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, active ? 4.8 : 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }
  }

  // 4. Noyau central Kemet Loop
  function drawKemetLoopCore() {
    if (selection.explosion < 0.05) return;

    var botY = PYRAMID.height / 2;
    var topY = -PYRAMID.height / 2 + getExplosionOffset(3);
    var pBot = projectPoint(0, botY, 0);
    var pTop = projectPoint(0, topY - 0.25, 0);
    if (!pBot || !pTop) return;

    // Faisceau central de plasma
    var beamW = 28 * selection.explosion;
    var grd = ctx.createLinearGradient(pBot.x, pBot.y, pTop.x, pTop.y);
    grd.addColorStop(0, 'rgba(0, 255, 163, 0.0)');
    grd.addColorStop(0.3, hexToRgba(PALETTE.cyberCore, 0.40 * selection.explosion));
    grd.addColorStop(0.7, hexToRgba(PALETTE.kemetBright, 0.60 * selection.explosion));
    grd.addColorStop(1, 'rgba(232, 200, 106, 0.0)');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(pBot.x - beamW / 2, pBot.y);
    ctx.lineTo(pTop.x - beamW * 0.4, pTop.y);
    ctx.lineTo(pTop.x + beamW * 0.4, pTop.y);
    ctx.lineTo(pBot.x + beamW / 2, pBot.y);
    ctx.closePath();
    ctx.fill();

    // Ligne centrale ultra-brillante
    ctx.strokeStyle = hexToRgba(PALETTE.whitePure, 0.85 * selection.explosion);
    ctx.lineWidth = 2.0;
    ctx.shadowColor = PALETTE.cyberCore;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(pBot.x, pBot.y);
    ctx.lineTo(pTop.x, pTop.y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Particules d'énergie ascendantes
    for (var i = 0; i < scene.coreParticles.length; i++) {
      var cp = scene.coreParticles[i];
      // Ascension le long de Y (du bas vers le haut)
      var currentT = cp.progress;
      var curLevel = Math.min(PYRAMID.levelsCount - 1, Math.floor(currentT * PYRAMID.levelsCount));
      var y3d = (PYRAMID.height / 2) - (currentT * PYRAMID.height) + getExplosionOffset(curLevel);

      var px = Math.cos(cp.angle) * cp.radius;
      var pz = Math.sin(cp.angle) * cp.radius;
      var pt = projectPoint(px, y3d, pz);

      ctx.fillStyle = cp.color;
      ctx.shadowColor = cp.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, cp.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // 5. Œil d'Horus holographique au sommet
  function drawHorusEyeApex() {
    var topY = -PYRAMID.height / 2 + getExplosionOffset(3) - 0.28;
    var apex = projectPoint(0, topY, 0);
    if (!apex) return;

    var time = engine.elapsedTime;
    var pulse = 0.8 + 0.2 * Math.sin(time * 2.5);
    var size = 30 * camera.zoom;

    ctx.save();
    ctx.translate(apex.x, apex.y);

    // Anneaux orbitaux tournants
    ctx.strokeStyle = hexToRgba(PALETTE.kemetMid, 0.7);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 4]);
    ctx.save();
    ctx.rotate(time * 0.6);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.6, size * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = hexToRgba(PALETTE.cyberCore, 0.75);
    ctx.setLineDash([2, 3]);
    ctx.save();
    ctx.rotate(-time * 0.9);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.3, size * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);

    // Symbole vectoriel de l'Œil d'Horus
    ctx.strokeStyle = PALETTE.cyberCore;
    ctx.lineWidth = 2.0;
    ctx.shadowColor = PALETTE.cyberCore;
    ctx.shadowBlur = 14;

    ctx.beginPath();
    ctx.moveTo(-size, 0);
    ctx.quadraticCurveTo(-size * 0.35, -size * 0.65, 0, -size * 0.45);
    ctx.quadraticCurveTo(size * 0.35, -size * 0.65, size, 0);
    ctx.quadraticCurveTo(size * 0.35, size * 0.65, 0, size * 0.45);
    ctx.quadraticCurveTo(-size * 0.35, size * 0.65, -size, 0);
    ctx.closePath();
    ctx.stroke();

    // Pupille radiante
    ctx.fillStyle = PALETTE.cyberCore;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.24 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PALETTE.whitePure;
    ctx.beginPath();
    ctx.arc(-size * 0.06, -size * 0.06, size * 0.07, 0, Math.PI * 2);
    ctx.fill();

    // Larmes sacrées inférieures
    ctx.strokeStyle = PALETTE.kemetBright;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.45);
    ctx.lineTo(-size * 0.08, size * 0.95);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, size * 0.45);
    ctx.lineTo(size * 0.12, size * 0.90);
    ctx.stroke();

    ctx.restore();
  }

  // 6. Skids orbitaux
  function drawSkids() {
    var sorted = scene.skids.slice().sort(function (a, b) { return (b.pz || 0) - (a.pz || 0); });

    for (var i = 0; i < sorted.length; i++) {
      var skid = sorted[i];
      if (!skid.px || !skid.py) continue;

      var type = skid.type;
      var active = skid.hover || (selection.level === skid.level);

      // Traîne de flux
      if (skid.trail.length > 1) {
        for (var t = 0; t < skid.trail.length - 1; t++) {
          var p1 = skid.trail[t], p2 = skid.trail[t + 1];
          ctx.strokeStyle = hexToRgba(type.color, (t / skid.trail.length) * 0.35);
          ctx.lineWidth = (t / skid.trail.length) * 2.2;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      var sz = type.size * 125 * (skid.projScale || 1);
      if (active) sz *= 1.45;

      ctx.save();
      ctx.shadowColor = type.color;
      ctx.shadowBlur = active ? 18 : 8;
      ctx.fillStyle = hexToRgba(type.color, 0.92);
      ctx.strokeStyle = PALETTE.whitePure;
      ctx.lineWidth = active ? 1.6 : 0.8;

      ctx.beginPath();
      ctx.rect(skid.px - sz / 2, skid.py - sz / 2, sz, sz);
      ctx.fill();
      ctx.stroke();

      if (active) {
        ctx.fillStyle = PALETTE.whitePure;
        ctx.font = 'bold ' + Math.max(9, sz * 0.55) + 'px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(type.icon, skid.px, skid.py);
      }
      ctx.restore();
    }
  }

  // 7. HUD Telemetria e Bussola
  function drawHUD(dt) {
    if (!selection.showTelemetry) return;

    // Ligne de balayage laser
    scene.scanLineY += dt * 75;
    if (scene.scanLineY > engine.H + 40) scene.scanLineY = -40;
    ctx.strokeStyle = 'rgba(0, 255, 163, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, scene.scanLineY);
    ctx.lineTo(engine.W, scene.scanLineY);
    ctx.stroke();

    // Boîtier télémétrique supérieur gauche
    var bx = 16, by = 16, bw = 210, bh = 148;
    ctx.fillStyle = 'rgba(6, 10, 13, 0.86)';
    ctx.strokeStyle = 'rgba(0, 255, 163, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 8);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.cyberCore;
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillText('▸ K-MEH-20 TELEMETRY', bx + 12, by + 22);

    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = PALETTE.slateLight;
    ctx.fillText('FPS :', bx + 12, by + 46);
    ctx.fillStyle = engine.fps >= 50 ? PALETTE.cyberCore : PALETTE.kemetBright;
    ctx.fillText(engine.fps.toFixed(0), bx + 80, by + 46);

    ctx.fillStyle = PALETTE.slateLight;
    ctx.fillText('Azimuth :', bx + 12, by + 66);
    ctx.fillStyle = PALETTE.whiteSoft;
    ctx.fillText(((camera.rotation * 180 / Math.PI) % 360).toFixed(0) + '°', bx + 80, by + 66);

    ctx.fillStyle = PALETTE.slateLight;
    ctx.fillText('Niveau :', bx + 12, by + 86);
    ctx.fillStyle = LEVELS_CONFIG[selection.level >= 0 ? selection.level : 0].color;
    ctx.fillText('N' + ((selection.level >= 0 ? selection.level : 0) + 1), bx + 80, by + 86);

    ctx.fillStyle = PALETTE.slateLight;
    ctx.fillText('Mode :', bx + 12, by + 106);
    ctx.fillStyle = selection.explosion > 0.5 ? PALETTE.kemetBright : PALETTE.cyberCore;
    ctx.fillText(selection.explosion > 0.5 ? 'ÉCLATÉ' : 'COMPACT', bx + 80, by + 106);

    ctx.fillStyle = PALETTE.kemetBright;
    ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
    ctx.fillText('OMPIC R&D · EN DÉPÔT', bx + 12, by + 130);
  }

  /* ============================================================
     §10 · HIT-TEST & INTERACTION DIRECTE
     ============================================================ */
  function hitTestLevel(clientX, clientY) {
    if (!engine.rect) engine.rect = canvas.getBoundingClientRect();
    var my = clientY - engine.rect.top;
    if (!scene.ringsCache.length) return -1;

    // Projection ordonnée : Sommet en haut, Base en bas
    var minY = Infinity, maxY = -Infinity;
    for (var l = 0; l < scene.ringsCache.length; l++) {
      var pts = scene.ringsCache[l].top.concat(scene.ringsCache[l].bottom);
      for (var p = 0; p < pts.length; p++) {
        if (pts[p].y < minY) minY = pts[p].y;
        if (pts[p].y > maxY) maxY = pts[p].y;
      }
    }

    if (my < minY || my > maxY) return -1;
    var ratio = (my - minY) / (maxY - minY);

    // En haut (ratio faible) = Niveau 3 (Sommet)
    // En bas (ratio élevé) = Niveau 0 (Base)
    if (ratio < 0.25) return 3;
    if (ratio < 0.50) return 2;
    if (ratio < 0.75) return 1;
    return 0;
  }

  canvas.addEventListener('pointerdown', function (e) {
    camera.isDragging = true;
    camera.hasDragged = false;
    camera.lastX = e.clientX;
    camera.lastY = e.clientY;
    camera.dragStartTime = Date.now();
    camera.autoRotate = false;
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('pointermove', function (e) {
    if (!engine.rect) engine.rect = canvas.getBoundingClientRect();
    var mx = e.clientX - engine.rect.left;
    var my = e.clientY - engine.rect.top;
    engine.pointer = { x: mx, y: my };

    if (camera.isDragging) {
      var dx = e.clientX - camera.lastX;
      var dy = e.clientY - camera.lastY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) camera.hasDragged = true;

      camera.targetRotation += dx * 0.010;
      // Tilt borné pour ne jamais voir la pyramide à l'envers
      camera.targetTilt = clamp(camera.targetTilt + dy * 0.007, 0.05, 1.15);
      camera.velocity = dx * 0.006;
      camera.lastX = e.clientX;
      camera.lastY = e.clientY;
    } else {
      var lvl = hitTestLevel(e.clientX, e.clientY);
      selection.hoveredLevel = lvl;
      canvas.style.cursor = (lvl >= 0) ? 'pointer' : 'grab';
    }
  });

  window.addEventListener('pointerup', function (e) {
    if (!camera.isDragging) return;
    camera.isDragging = false;
    canvas.style.cursor = 'grab';

    var duration = Date.now() - camera.dragStartTime;
    if (!camera.hasDragged && duration < 400) {
      var lvl = hitTestLevel(e.clientX, e.clientY);
      if (lvl >= 0) selectLevel(lvl);
    } else {
      setTimeout(function () {
        if (!camera.isDragging) camera.autoRotate = true;
      }, 5000);
    }
  });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var delta = e.deltaY > 0 ? -0.06 : 0.06;
    camera.targetZoom = clamp(camera.targetZoom + delta, 0.65, 1.75);
  }, { passive: false });

  /* ============================================================
     §11 · SELECTION & SYNCHRONISATION DOM
     ============================================================ */
  function selectLevel(idx) {
    selection.level = idx;
    var config = LEVELS_CONFIG[idx];

    // Notification globale vers l'interface HTML
    if (typeof window.onKmehLevelSelect === 'function') {
      try { window.onKmehLevelSelect(idx, config); } catch (err) {}
    }
  }

  function toggleExplosion() {
    selection.explosionTarget = selection.explosionTarget > 0.5 ? 0.0 : 1.0;
    return selection.explosionTarget > 0.5;
  }

  function toggleAutoRotate() {
    camera.autoRotate = !camera.autoRotate;
    return camera.autoRotate;
  }

  /* ============================================================
     §12 · BOUCLE PRINCIPALE DE RENDU (60 FPS)
     ============================================================ */
  function animate(now) {
    engine.renderRequestId = requestAnimationFrame(animate);
    if (engine.paused) return;

    if (engine.W < 1 || engine.H < 1) {
      resizeCanvas();
      if (engine.W < 1 || engine.H < 1) return;
    }

    if (!engine.lastFrameTime) { engine.lastFrameTime = now; return; }
    var dt = Math.min((now - engine.lastFrameTime) / 1000, 0.05);
    engine.lastFrameTime = now;
    engine.elapsedTime += dt;

    engine.fpsAccumulator += dt;
    engine.fpsFrames++;
    if (engine.fpsAccumulator >= 0.5) {
      engine.fps = engine.fpsFrames / engine.fpsAccumulator;
      engine.fpsAccumulator = 0;
      engine.fpsFrames = 0;
    }

    // Caméra dynamique
    if (camera.autoRotate && !reducedMotion()) {
      camera.targetRotation += camera.autoRotateSpeed * dt;
    }
    camera.rotation += (camera.targetRotation - camera.rotation) * 0.12;
    camera.rotation += camera.velocity;
    camera.velocity *= camera.velocityDamping;
    camera.tilt += (camera.targetTilt - camera.tilt) * 0.10;
    camera.zoom += (camera.targetZoom - camera.zoom) * 0.12;

    updateScene(dt);

    // Dessin des calques
    ctx.clearRect(0, 0, engine.W, engine.H);
    drawPyramidAtmosphere();
    drawPyramidLevels();
    drawPyramidTopsAndVertices();
    drawKemetLoopCore();
    drawSkids();
    drawHorusEyeApex();
    drawHUD(dt);

    if (!engine.firstRenderLogged) {
      engine.firstRenderLogged = true;
      try {
        console.info('[K-MEH-20] 3D Scene rendered (' + engine.W.toFixed(0) + '×' + engine.H.toFixed(0) + ')');
      } catch (e) {}
    }
  }

  /* ============================================================
     §13 · REDIMENSIONNEMENT DU CANVAS
     ============================================================ */
  function resizeCanvas() {
    var parent = canvas.parentElement;
    if (!parent) return;

    var rect = parent.getBoundingClientRect();
    var curW = rect.width || 800;
    var curH = rect.height || 480;

    if (engine.W > 0 && Math.abs(engine.W - curW) < 15 && Math.abs(engine.H - curH) < 15) {
      return;
    }

    engine.W = curW;
    engine.H = curH;
    engine.DPR = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(curW * engine.DPR);
    canvas.height = Math.round(curH * engine.DPR);
    canvas.style.width = curW + 'px';
    canvas.style.height = curH + 'px';

    ctx.setTransform(engine.DPR, 0, 0, engine.DPR, 0, 0);
    engine.rect = canvas.getBoundingClientRect();

    if (engine.initialized) updateRingsCache();
  }

  /* ============================================================
     §14 · API PUBLIQUE EXPOSÉE
     ============================================================ */
  window.kmehPyramidSelectLevel = function (idx) { selectLevel(idx); };
  window.kmehSelectLevel = function (idx) { selectLevel(idx); };

  window.kmehPyramidToggleExplosion = function () { return toggleExplosion(); };
  window.kmehToggleExplode = function () { return toggleExplosion(); };

  window.kmehPyramidToggleAutoRotate = function () { return toggleAutoRotate(); };
  window.kmehToggleRotate = function () { return toggleAutoRotate(); };

  window.kmehResetCamera = function () {
    camera.targetRotation = -0.65;
    camera.targetTilt = 0.38;
    camera.targetZoom = 1.05;
    camera.autoRotate = true;
  };

  /* ============================================================
     §15 · BOOTSTRAP DU MOTEUR
     ============================================================ */
  document.addEventListener('visibilitychange', function () {
    engine.paused = document.hidden;
    if (!document.hidden) engine.lastFrameTime = 0;
  });

  function bootstrap() {
    if (engine.initialized) return;
    resizeCanvas();
    initializeScene();
    updateRingsCache();
    engine.initialized = true;
    engine.lastFrameTime = 0;
    requestAnimationFrame(animate);

    window.addEventListener('resize', function () {
      setTimeout(resizeCanvas, 100);
    });

    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      new ResizeObserver(function () { resizeCanvas(); }).observe(canvas.parentElement);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  window.addEventListener('load', function () {
    if (!engine.initialized) bootstrap();
    else setTimeout(resizeCanvas, 50);
  });

})();
