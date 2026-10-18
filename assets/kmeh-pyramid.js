/* ============================================================
   K-MEH-20 · MOTEUR DE RENDU CYBER-PHYSIQUE v3.2
   Industrial Illusion SARL · Deep Tech Systems · Marrakech

   ⚠️  REPRÉSENTATION VISUELLE UNIQUEMENT
   Aucune spécification technique propriétaire (P&ID, formules,
   câblage, dimensions internes) n'est incluse dans ce fichier.
   La documentation technique intégrale est réservée à la Data
   Room institutionnelle sous NDA.

   Copyright © 2026 Industrial Illusion SARL. Tous droits réservés.
   ============================================================ */

(function () {
  'use strict';

  /* §1 · CANVAS + PREFERENCES */
  var canvas = document.getElementById('kmehPyramidCanvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) { console.warn('[K-MEH-20] Contexte 2D indisponible.'); return; }

  var reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reducedMotion = reducedMotionQuery.matches;
  if (reducedMotionQuery.addEventListener) {
    reducedMotionQuery.addEventListener('change', function (e) { reducedMotion = e.matches; });
  }

  /* §2 · PALETTE */
  var PALETTE = {
    cyberCore: '#00FFA3', cyberMid: '#00B871', cyberDeep: '#059669',
    kemetBright: '#E8C86A', kemetMid: '#C5A059', kemetDeep: '#8B6F2A',
    whitePure: '#FFFFFF', whiteSoft: '#F1F5F9',
    slateLight: '#94A3B8', slateMid: '#64748B', slateDark: '#334155',
    danger: '#F87171', warning: '#E6CA86', info: '#60A5FA'
  };

  /* §3 · GEOMETRIE (données publiques — visible de l'extérieur) */
  var PYRAMID = {
    halfBase: 1.000, halfTop: 0.220, height: 1.500,
    facesCount: 4, levelsCount: 4,
    realBase: 56, realHeight: 32,
    surfaceBase: 3136
  };

  var EXPLOSION_GAP_PER_LEVEL = 0.42;

  /* §4 · LEVELS CONFIG (abstrait — pas de specs internes) */
  var LEVELS_CONFIG = [
    {
      index: 0, key: 'base',
      color: PALETTE.cyberCore, colorDim: PALETTE.cyberMid, accent: PALETTE.cyberDeep,
      label: 'NIVEAU 1 · BASE', subtitle: 'Réception & Matière', area: '3 136 m²',
      mission: 'Interface matière · Préparation'
    },
    {
      index: 1, key: 'centre',
      color: PALETTE.cyberMid, colorDim: PALETTE.cyberDeep, accent: PALETTE.cyberDeep,
      label: 'NIVEAU 2 · CENTRE', subtitle: 'Systèmes & Fluides', area: '1 400 m²',
      mission: 'Régulation · Support technique'
    },
    {
      index: 2, key: 'elev',
      color: PALETTE.kemetMid, colorDim: PALETTE.kemetDeep, accent: PALETTE.kemetBright,
      label: 'NIVEAU 3 · ÉLÉVATION', subtitle: 'Intelligence & Données', area: '600 m²',
      mission: 'Supervision · Traçabilité'
    },
    {
      index: 3, key: 'top',
      color: PALETTE.kemetBright, colorDim: PALETTE.kemetMid, accent: PALETTE.whitePure,
      label: 'NIVEAU 4 · SOMMET', subtitle: 'Vision & Commandement', area: '150 m²',
      mission: 'Gouvernance · Stratégie'
    }
  ];

  /* §5 · SKIDS (représentation abstraite de flux) */
  var SKID_TYPES = {
    MATTER: { key: 'MATTER', color: PALETTE.kemetBright, size: 0.055, speed: 0.32, icon: '◧', label: 'Matière' },
    DATA:   { key: 'DATA',   color: PALETTE.cyberCore,   size: 0.045, speed: 0.52, icon: '◈', label: 'Données' },
    ENERGY: { key: 'ENERGY', color: PALETTE.kemetMid,    size: 0.040, speed: 0.78, icon: '◉', label: 'Énergie' }
  };

  var SKIDS_CONFIG = [
    { level: 0, type: 'MATTER', angleOffset: 0.00 },
    { level: 0, type: 'MATTER', angleOffset: 0.42 },
    { level: 0, type: 'MATTER', angleOffset: 0.84 },
    { level: 0, type: 'MATTER', angleOffset: 1.26 },
    { level: 0, type: 'DATA',   angleOffset: 0.21 },
    { level: 0, type: 'ENERGY', angleOffset: 0.63 },
    { level: 1, type: 'DATA',   angleOffset: 0.10 },
    { level: 1, type: 'DATA',   angleOffset: 0.52 },
    { level: 1, type: 'DATA',   angleOffset: 0.94 },
    { level: 1, type: 'ENERGY', angleOffset: 0.31 },
    { level: 1, type: 'ENERGY', angleOffset: 0.73 },
    { level: 1, type: 'MATTER', angleOffset: 0.00 },
    { level: 2, type: 'DATA',   angleOffset: 0.15 },
    { level: 2, type: 'DATA',   angleOffset: 0.57 },
    { level: 2, type: 'DATA',   angleOffset: 0.99 },
    { level: 2, type: 'ENERGY', angleOffset: 0.36 },
    { level: 3, type: 'DATA',   angleOffset: 0.00 },
    { level: 3, type: 'DATA',   angleOffset: 0.50 },
    { level: 3, type: 'ENERGY', angleOffset: 0.25 }
  ];

  /* §6 · STATE */
  var engine = {
    W: 0, H: 0, DPR: 1,
    lastFrameTime: 0, elapsedTime: 0, deltaTime: 0,
    fps: 60, fpsAccumulator: 0, fpsFrames: 0,
    paused: false, initialized: false,
    renderRequestId: 0, pointer: null, rect: null,
    _loggedRenderError: false
  };

  var camera = {
    rotation: 0.6, targetRotation: 0.6,
    tilt: 0.32, targetTilt: 0.32,
    zoom: 1.0, targetZoom: 1.0,
    autoRotate: true, autoRotateSpeed: 0.12,
    velocity: 0, velocityDamping: 0.92,
    isDragging: false, hasDragged: false,
    lastX: 0, lastY: 0, dragStartTime: 0
  };

  var selection = {
    level: -1, levelTarget: -1,
    hoveredLevel: -1, skid: -1, hoveredSkid: -1,
    explosion: 0, explosionTarget: 0,
    showTelemetry: true, showCompass: true,
    showGrid: true, showLabels: true
  };

  /* §7 · UTILS */
  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /* §8 · PROJECTION */
  function projectPoint(x, y, z) {
    var cosR = Math.cos(camera.rotation);
    var sinR = Math.sin(camera.rotation);
    var rx = x * cosR - z * sinR;
    var rz = x * sinR + z * cosR;

    var cosT = Math.cos(camera.tilt);
    var sinT = Math.sin(camera.tilt);
    var ry = y * cosT - rz * sinT;
    var rz2 = y * sinT + rz * cosT;

    var perspFactor = 500 / (500 + rz2 * 120);
    var baseScale = Math.min(engine.W / 2.4, engine.H / 1.85);
    var scale = baseScale * camera.zoom;

    return {
      x: engine.W / 2 + rx * scale * perspFactor,
      y: engine.H / 2 + ry * scale * perspFactor,
      depth: rz2,
      scale: scale * perspFactor
    };
  }

  function projectRing(t, yOffset) {
    yOffset = yOffset || 0;
    var halfWidth = lerp(PYRAMID.halfBase, PYRAMID.halfTop, t);
    var y = -PYRAMID.height / 2 + t * PYRAMID.height + yOffset;
    var corners = [
      { x: -halfWidth, z: -halfWidth },
      { x: +halfWidth, z: -halfWidth },
      { x: +halfWidth, z: +halfWidth },
      { x: -halfWidth, z: +halfWidth }
    ];
    return corners.map(function (c) { return projectPoint(c.x, y, c.z); });
  }

  function getExplosionOffset(level) {
    return selection.explosion * level * EXPLOSION_GAP_PER_LEVEL;
  }

  /* §9 · SCENE */
  var scene = {
    skids: [], energyParticles: [], dataParticles: [], coreParticles: [],
    ringsCache: [], scanLineY: 0
  };

  function createSkid(config, idx) {
    var type = SKID_TYPES[config.type];
    var level = config.level;
    var tMid = (level + 0.5) / PYRAMID.levelsCount;
    var yMid = -PYRAMID.height / 2 + tMid * PYRAMID.height;
    var halfWidthAtLevel = lerp(PYRAMID.halfBase, PYRAMID.halfTop, tMid);
    var orbitRadius = halfWidthAtLevel * 1.45 + 0.08;
    return {
      id: idx, level: level, type: type, typeKey: config.type,
      angle: config.angleOffset * Math.PI * 2,
      angleOffset: config.angleOffset * Math.PI * 2,
      radius: orbitRadius, baseY: yMid,
      speed: type.speed * (0.85 + Math.random() * 0.3),
      phase: Math.random() * Math.PI * 2,
      bobAmp: 0.025 + Math.random() * 0.02,
      size: type.size, trail: [], trailMax: 12,
      hover: false, selected: false
    };
  }

  function createEnergyParticles() {
    var particles = [];
    var countPerLevel = 6;
    for (var lvl = 0; lvl < PYRAMID.levelsCount; lvl++) {
      for (var p = 0; p < countPerLevel; p++) {
        particles.push({
          level: lvl, corner: p % PYRAMID.facesCount,
          t: Math.random(),
          speed: 0.0035 + Math.random() * 0.0025,
          color: LEVELS_CONFIG[lvl].color,
          size: 1.4 + Math.random() * 1.2,
          pulse: Math.random() * Math.PI * 2, currentPulse: 1
        });
      }
    }
    return particles;
  }

  function createDataParticles() {
    var particles = [], count = 14;
    for (var i = 0; i < count; i++) {
      particles.push({
        level: Math.floor(Math.random() * PYRAMID.levelsCount),
        corner: Math.floor(Math.random() * PYRAMID.facesCount),
        t: Math.random(),
        speed: -0.0028 - Math.random() * 0.0022,
        color: PALETTE.cyberCore,
        size: 1.0 + Math.random() * 0.8,
        pulse: Math.random() * Math.PI * 2,
        blinkInterval: 0.3 + Math.random() * 0.6,
        blinkPhase: Math.random(), currentBlink: 1
      });
    }
    return particles;
  }

  function createCoreParticles() {
    var particles = [], count = 32;
    for (var i = 0; i < count; i++) {
      particles.push({
        progress: Math.random(),
        speed: 0.15 + Math.random() * 0.12,
        angle: Math.random() * Math.PI * 2,
        radius: 0.04 + Math.random() * 0.12,
        size: 1.2 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        color: Math.random() < 0.5 ? PALETTE.kemetBright : PALETTE.cyberCore
      });
    }
    return particles;
  }

  function rebuildSkids() {
    scene.skids = SKIDS_CONFIG.map(function (cfg, idx) { return createSkid(cfg, idx); });
  }

  function initializeScene() {
    rebuildSkids();
    scene.energyParticles = createEnergyParticles();
    scene.dataParticles = createDataParticles();
    scene.coreParticles = createCoreParticles();
    scene.ringsCache = [];
  }

  /* §10 · UPDATE RINGS */
  function updateRingsCache() {
    var cache = [];
    for (var lvl = 0; lvl < PYRAMID.levelsCount; lvl++) {
      var offset = getExplosionOffset(lvl);
      var bottomT = lvl / PYRAMID.levelsCount;
      var topT = (lvl + 1) / PYRAMID.levelsCount;
      cache.push({
        level: lvl, offsetY: offset,
        bottom: projectRing(bottomT, offset),
        top: projectRing(topT, offset)
      });
    }
    scene.ringsCache = cache;
  }

  /* §11 · UPDATE SCENE */
  function updateSkids(dt) {
    var timeSec = engine.elapsedTime;
    for (var i = 0; i < scene.skids.length; i++) {
      var skid = scene.skids[i];
      if (!reducedMotion()) {
        skid.angle += skid.speed * dt;
        skid.angle = skid.angle % (Math.PI * 2);
      }
      var bob = Math.sin(skid.phase + timeSec * 1.2) * skid.bobAmp;
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
        skid.hover = (dx * dx + dy * dy) < (22 * 22);
      } else { skid.hover = false; }
    }
  }

  function updateParticles(dt) {
    var timeSec = engine.elapsedTime;
    for (var i = 0; i < scene.energyParticles.length; i++) {
      var p = scene.energyParticles[i];
      p.t += p.speed * dt * 60;
      if (p.t > 1) { p.t = 0; p.pulse = Math.random() * Math.PI * 2; }
      p.currentPulse = 0.7 + 0.3 * Math.sin(timeSec * 3 + p.pulse);
    }
    for (var j = 0; j < scene.dataParticles.length; j++) {
      var dp = scene.dataParticles[j];
      dp.t += dp.speed * dt * 60;
      if (dp.t < 0) {
        dp.t = 1;
        dp.level = Math.floor(Math.random() * PYRAMID.levelsCount);
        dp.corner = Math.floor(Math.random() * PYRAMID.facesCount);
      }
      dp.blinkPhase += dt * dp.blinkInterval * 6;
      if (dp.blinkPhase > 1) dp.blinkPhase -= 1;
      dp.currentBlink = dp.blinkPhase < 0.15 ? 1 : 0.5;
    }
    for (var k = 0; k < scene.coreParticles.length; k++) {
      var cp = scene.coreParticles[k];
      cp.progress += cp.speed * dt;
      if (cp.progress > 1) {
        cp.progress = 0;
        cp.radius = 0.04 + Math.random() * 0.12;
        cp.color = Math.random() < 0.5 ? PALETTE.kemetBright : PALETTE.cyberCore;
      }
      cp.angle += dt * 0.6;
    }
  }

  function updateExplosion(dt) {
    var diff = selection.explosionTarget - selection.explosion;
    var step = 1.8 * dt;
    if (Math.abs(diff) < 0.001) {
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

  /* §12 · DRAW · RADIAL BG */
  function drawRadialBackground(cx, cy, radius, colorInner, colorOuter) {
    var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grd.addColorStop(0, colorInner);
    grd.addColorStop(0.55, colorOuter);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, engine.W, engine.H);
  }

  /* §13 · DRAW · HALO (VISIBILITÉ) */
  function drawPyramidHalo() {
    var cx = engine.W / 2;
    var cy = engine.H / 2;
    var radius = Math.min(engine.W, engine.H) * 0.55;
    if (radius <= 0) return;
    var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grd.addColorStop(0, 'rgba(0, 255, 163, 0.10)');
    grd.addColorStop(0.40, 'rgba(232, 200, 106, 0.06)');
    grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /* §14 · DRAW · PYRAMID LEVELS (VISIBILITÉ BOOSTÉE) */
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
        faces.push({ level: lvl, side: side, pts: [s0, s1, s2, s3], depth: avgDepth, config: LEVELS_CONFIG[lvl] });
      }
    }
    faces.sort(function (a, b) { return b.depth - a.depth; });
    for (var i = 0; i < faces.length; i++) drawPyramidFace(faces[i]);
  }

  function drawPyramidFace(face) {
    var cfg = face.config;
    var isSelected = selection.level === face.level;
    var isHovered = selection.hoveredLevel === face.level;
    var exploded = selection.explosion > 0.1;

    // VISIBILITÉ : alpha nettement augmentées
    var baseAlpha, strokeAlpha, glowBlur, lineWidth;
    if (isSelected) {
      baseAlpha = 0.50; strokeAlpha = 1.0; glowBlur = 22; lineWidth = 2.6;
    } else if (isHovered) {
      baseAlpha = 0.34; strokeAlpha = 0.95; glowBlur = 12; lineWidth = 1.8;
    } else {
      baseAlpha = exploded ? 0.26 : 0.24;
      strokeAlpha = exploded ? 0.85 : 0.78;
      glowBlur = exploded ? 8 : 5;
      lineWidth = exploded ? 1.6 : 1.4;
    }

    if (isSelected && !reducedMotion()) {
      baseAlpha += 0.12 + 0.08 * Math.sin(engine.elapsedTime * 4);
    }

    var fillGrd = ctx.createLinearGradient(face.pts[0].x, face.pts[0].y, face.pts[2].x, face.pts[2].y);
    fillGrd.addColorStop(0, hexToRgba(cfg.color, baseAlpha * 0.7));
    fillGrd.addColorStop(0.5, hexToRgba(cfg.color, baseAlpha));
    fillGrd.addColorStop(1, hexToRgba(cfg.colorDim, baseAlpha * 0.5));

    ctx.fillStyle = fillGrd;
    ctx.beginPath();
    ctx.moveTo(face.pts[0].x, face.pts[0].y);
    ctx.lineTo(face.pts[1].x, face.pts[1].y);
    ctx.lineTo(face.pts[2].x, face.pts[2].y);
    ctx.lineTo(face.pts[3].x, face.pts[3].y);
    ctx.closePath();
    ctx.fill();

    if (selection.showGrid && (isSelected || isHovered)) {
      drawBlueprintGridOnFace(face, cfg, strokeAlpha * 0.4);
    }

    ctx.shadowColor = cfg.color;
    ctx.shadowBlur = glowBlur;
    ctx.strokeStyle = hexToRgba(cfg.color, strokeAlpha);
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawBlueprintGridOnFace(face, cfg, alpha) {
    var p0 = face.pts[0], p1 = face.pts[1], p2 = face.pts[2], p3 = face.pts[3];
    ctx.strokeStyle = hexToRgba(cfg.color, alpha);
    ctx.lineWidth = 0.5;
    for (var i = 1; i <= 2; i++) {
      var t = i / 3;
      var xa = lerp(p0.x, p1.x, t), ya = lerp(p0.y, p1.y, t);
      var xb = lerp(p3.x, p2.x, t), yb = lerp(p3.y, p2.y, t);
      ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
    }
    var xc = lerp(p0.x, p3.x, 0.5), yc = lerp(p0.y, p3.y, 0.5);
    var xd = lerp(p1.x, p2.x, 0.5), yd = lerp(p1.y, p2.y, 0.5);
    ctx.beginPath(); ctx.moveTo(xc, yc); ctx.lineTo(xd, yd); ctx.stroke();
  }

  /* §15 · DRAW · TOP FACE (VISIBILITÉ BOOSTÉE) */
  function drawPyramidTopFace() {
    var topLevel = scene.ringsCache[PYRAMID.levelsCount - 1];
    if (!topLevel) return;
    var topRing = topLevel.top;
    var cfg = LEVELS_CONFIG[3];
    var isSelected = selection.level === 3;
    var isHovered = selection.hoveredLevel === 3;
    var alpha = isSelected ? 0.52 : (isHovered ? 0.34 : 0.20);
    var strokeAlpha = isSelected ? 1.0 : (isHovered ? 0.85 : 0.72);

    ctx.fillStyle = hexToRgba(cfg.color, alpha);
    ctx.beginPath();
    ctx.moveTo(topRing[0].x, topRing[0].y);
    for (var i = 1; i < 4; i++) ctx.lineTo(topRing[i].x, topRing[i].y);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = cfg.color;
    ctx.shadowBlur = isSelected ? 20 : (isHovered ? 12 : 8);
    ctx.strokeStyle = hexToRgba(cfg.color, strokeAlpha);
    ctx.lineWidth = isSelected ? 2.4 : 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /* §16 · DRAW · VERTICES */
  function drawPyramidVertices() {
    for (var lvl = 0; lvl < scene.ringsCache.length; lvl++) {
      var cache = scene.ringsCache[lvl];
      var cfg = LEVELS_CONFIG[lvl];
      var rings = [cache.bottom, cache.top];
      var isLevelActive = (selection.level === lvl) || (selection.hoveredLevel === lvl);
      for (var r = 0; r < rings.length; r++) {
        var ring = rings[r];
        for (var side = 0; side < ring.length; side++) {
          var pt = ring[side];
          var size = isLevelActive ? 3.4 : 2.0;
          var alpha = isLevelActive ? 0.95 : 0.65;
          ctx.fillStyle = hexToRgba(cfg.color, alpha);
          if (isLevelActive) { ctx.shadowColor = cfg.color; ctx.shadowBlur = 10; }
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }
  }

  /* §17 · DRAW · KEMET LOOP CORE */
  function drawKemetLoopCore() {
    var showIntensity = Math.max(selection.explosion, 0.15);
    if (showIntensity < 0.05) return;
    var bottomY = -PYRAMID.height / 2;
    var topY = -PYRAMID.height / 2 + PYRAMID.height + getExplosionOffset(3);
    var pBot = projectPoint(0, bottomY, 0);
    var pTop = projectPoint(0, topY, 0);
    if (!pBot || !pTop) return;

    var beamWidth = 26 + 18 * selection.explosion;
    var grd = ctx.createLinearGradient(pBot.x, pBot.y, pTop.x, pTop.y);
    grd.addColorStop(0, 'rgba(0, 255, 163, 0)');
    grd.addColorStop(0.18, hexToRgba(PALETTE.cyberCore, 0.15 * showIntensity));
    grd.addColorStop(0.5, hexToRgba(PALETTE.kemetBright, 0.32 * showIntensity));
    grd.addColorStop(0.82, hexToRgba(PALETTE.kemetBright, 0.15 * showIntensity));
    grd.addColorStop(1, 'rgba(232, 200, 106, 0)');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(pBot.x - beamWidth / 2, pBot.y);
    ctx.lineTo(pTop.x - beamWidth * 0.6, pTop.y);
    ctx.lineTo(pTop.x + beamWidth * 0.6, pTop.y);
    ctx.lineTo(pBot.x + beamWidth / 2, pBot.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var pulse = 0.6 + 0.4 * Math.sin(engine.elapsedTime * 2.5);
    ctx.strokeStyle = hexToRgba(PALETTE.kemetBright, 0.5 * pulse * showIntensity);
    ctx.lineWidth = 2;
    ctx.shadowColor = PALETTE.kemetBright;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(pBot.x, pBot.y);
    ctx.lineTo(pTop.x, pTop.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < scene.coreParticles.length; i++) {
      var cp = scene.coreParticles[i];
      if (cp.progress > selection.explosion + 0.2) continue;
      var y3d = -PYRAMID.height / 2 + cp.progress * PYRAMID.height;
      var levelOfParticle = Math.min(PYRAMID.levelsCount - 1, Math.floor(cp.progress * PYRAMID.levelsCount));
      var offsetY = getExplosionOffset(levelOfParticle);
      var p = projectPoint(Math.cos(cp.angle) * cp.radius, y3d + offsetY, Math.sin(cp.angle) * cp.radius);
      var alpha = (0.4 + 0.6 * Math.sin(engine.elapsedTime * 3 + cp.phase)) * showIntensity;
      ctx.fillStyle = hexToRgba(cp.color, alpha);
      ctx.shadowColor = cp.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, cp.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /* §18 · DRAW · HORUS EYE */
  function drawHorusEye() {
    var topY = -PYRAMID.height / 2 + PYRAMID.height + getExplosionOffset(3) + 0.18;
    var apex = projectPoint(0, topY, 0);
    if (!apex) return;

    var time = engine.elapsedTime;
    var pulse = 0.75 + 0.25 * Math.sin(time * 2);
    var baseScale = Math.min(engine.W / 2.4, engine.H / 1.85);
    var size = baseScale * 0.14 * (0.9 + 0.1 * pulse);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var haloR = size * 2.4;
    var haloGrd = ctx.createRadialGradient(apex.x, apex.y, 0, apex.x, apex.y, haloR);
    haloGrd.addColorStop(0, hexToRgba(PALETTE.kemetBright, 0.28 * pulse));
    haloGrd.addColorStop(0.4, hexToRgba(PALETTE.kemetBright, 0.10 * pulse));
    haloGrd.addColorStop(1, 'rgba(232, 200, 106, 0)');
    ctx.fillStyle = haloGrd;
    ctx.beginPath();
    ctx.arc(apex.x, apex.y, haloR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = hexToRgba(PALETTE.kemetBright, 0.08);
    ctx.strokeStyle = hexToRgba(PALETTE.kemetBright, 0.55);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(apex.x, apex.y, size * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(apex.x, apex.y);
    var rot1 = time * 0.5;
    ctx.rotate(rot1);
    ctx.strokeStyle = hexToRgba(PALETTE.kemetMid, 0.7);
    ctx.lineWidth = 0.9;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.6, size * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.rotate(-rot1 * 1.6);
    ctx.strokeStyle = hexToRgba(PALETTE.cyberCore, 0.6);
    ctx.lineWidth = 0.7;
    ctx.setLineDash([1.5, 2.5]);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.35, size * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.save();
    ctx.translate(apex.x, apex.y);
    var eyeW = size * 1.0, eyeH = size * 0.55;
    ctx.strokeStyle = hexToRgba(PALETTE.cyberCore, 0.95);
    ctx.lineWidth = 1.6;
    ctx.shadowColor = PALETTE.cyberCore;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(-eyeW, 0);
    ctx.quadraticCurveTo(-eyeW * 0.4, -eyeH, 0, -eyeH * 0.65);
    ctx.quadraticCurveTo(eyeW * 0.4, -eyeH, eyeW, 0);
    ctx.quadraticCurveTo(eyeW * 0.4, eyeH, 0, eyeH * 0.65);
    ctx.quadraticCurveTo(-eyeW * 0.4, eyeH, -eyeW, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = hexToRgba(PALETTE.cyberCore, 0.9 * pulse);
    ctx.shadowColor = PALETTE.cyberCore;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = hexToRgba(PALETTE.whitePure, 0.85);
    ctx.beginPath();
    ctx.arc(-size * 0.06, -size * 0.06, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(PALETTE.kemetBright, 0.9);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.55);
    ctx.lineTo(-size * 0.06, size * 1.0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, size * 0.55);
    ctx.lineTo(size * 0.12, size * 0.95);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var orbitAngle = time * 1.2;
    for (var k = 0; k < 2; k++) {
      var ang = orbitAngle + k * Math.PI;
      var satX = apex.x + Math.cos(ang) * size * 1.55;
      var satY = apex.y + Math.sin(ang) * size * 0.5;
      ctx.fillStyle = hexToRgba(k === 0 ? PALETTE.cyberCore : PALETTE.kemetBright, 0.9);
      ctx.shadowColor = k === 0 ? PALETTE.cyberCore : PALETTE.kemetBright;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(satX, satY, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /* §19 · DRAW · PARTICLES */
  function drawEnergyParticles() {
    for (var i = 0; i < scene.energyParticles.length; i++) {
      var p = scene.energyParticles[i];
      var cache = scene.ringsCache[p.level];
      if (!cache) continue;
      var top = cache.top[p.corner];
      var bot = cache.bottom[p.corner];
      if (!top || !bot) continue;
      var x = lerp(bot.x, top.x, p.t);
      var y = lerp(bot.y, top.y, p.t);
      var alpha = p.currentPulse * 0.9;
      var size = p.size * (0.8 + p.currentPulse * 0.4);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = hexToRgba(p.color, alpha);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawDataParticles() {
    for (var i = 0; i < scene.dataParticles.length; i++) {
      var p = scene.dataParticles[i];
      var cache = scene.ringsCache[p.level];
      if (!cache) continue;
      var top = cache.top[p.corner];
      var bot = cache.bottom[p.corner];
      if (!top || !bot) continue;
      var x = lerp(top.x, bot.x, p.t);
      var y = lerp(top.y, bot.y, p.t);
      var alpha = p.currentBlink * 0.8;
      var col = p.currentBlink > 0.9 ? PALETTE.whitePure : p.color;
      ctx.shadowColor = PALETTE.cyberCore;
      ctx.shadowBlur = 6;
      ctx.fillStyle = hexToRgba(col, alpha);
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  /* §20 · DRAW · SKIDS */
  function drawSkids() {
    var sorted = scene.skids.slice().sort(function (a, b) { return (b.pz || 0) - (a.pz || 0); });
    for (var i = 0; i < sorted.length; i++) drawSkid(sorted[i]);
  }

  function drawSkid(skid) {
    if (!skid.px || !skid.py) return;
    var type = skid.type;
    var isActive = skid.hover || skid.selected || (selection.level === skid.level);

    if (skid.trail.length > 1) {
      for (var t = 0; t < skid.trail.length - 1; t++) {
        var p1 = skid.trail[t], p2 = skid.trail[t + 1];
        var trailAlpha = (t / skid.trail.length) * 0.35;
        ctx.strokeStyle = hexToRgba(type.color, trailAlpha);
        ctx.lineWidth = (t / skid.trail.length) * 2;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    var size = type.size * 120 * (skid.projScale || 1);
    if (isActive) size *= 1.4;
    ctx.shadowColor = type.color;
    ctx.shadowBlur = isActive ? 14 : 6;
    var x = skid.px, y = skid.py;
    ctx.fillStyle = hexToRgba(type.color, 0.85);
    ctx.strokeStyle = type.color;
    ctx.lineWidth = isActive ? 1.5 : 0.8;
    ctx.beginPath();
    ctx.moveTo(x - size / 2, y - size / 2);
    ctx.lineTo(x + size / 2, y - size / 2);
    ctx.lineTo(x + size / 2, y + size / 2);
    ctx.lineTo(x - size / 2, y + size / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hexToRgba(type.color, 0.55);
    ctx.beginPath();
    ctx.moveTo(x - size / 2, y - size / 2);
    ctx.lineTo(x - size / 2 + size * 0.25, y - size / 2 - size * 0.25);
    ctx.lineTo(x + size / 2 + size * 0.25, y - size / 2 - size * 0.25);
    ctx.lineTo(x + size / 2, y - size / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (isActive) {
      ctx.fillStyle = PALETTE.whitePure;
      ctx.font = 'bold ' + Math.max(8, size * 0.6) + 'px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(type.icon, x, y);
    }
  }

  /* §21 · DRAW · SCANLINE + HUD + COMPASS */
  function drawScanLine(dt) {
    if (!selection.showTelemetry) return;
    scene.scanLineY += dt * 80;
    if (scene.scanLineY > engine.H + 50) scene.scanLineY = -50;
    var y = scene.scanLineY;
    var grd = ctx.createLinearGradient(0, y - 20, 0, y + 20);
    grd.addColorStop(0, 'rgba(0, 255, 163, 0)');
    grd.addColorStop(0.5, 'rgba(0, 255, 163, 0.08)');
    grd.addColorStop(1, 'rgba(0, 255, 163, 0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, y - 20, engine.W, 40);
    ctx.strokeStyle = 'rgba(0, 255, 163, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(engine.W, y);
    ctx.stroke();
  }

  function drawHudLine(label, value, x, y, valueColor) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PALETTE.slateMid;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(label + ':', x, y);
    ctx.fillStyle = valueColor;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText(value, x + 78, y);
  }

  function drawTelemetryHUD() {
    if (!selection.showTelemetry) return;
    var pad = 14, lineH = 15;
    var x = pad, y = pad;
    var boxW = 220, boxH = 172;
    ctx.fillStyle = 'rgba(5, 10, 13, 0.82)';
    ctx.strokeStyle = 'rgba(0, 255, 163, 0.3)';
    ctx.lineWidth = 1;
    if (ctx.roundRect) ctx.roundRect(x, y, boxW, boxH, 8);
    else ctx.rect(x, y, boxW, boxH);
    ctx.fill();
    ctx.stroke();
    var lx = x + 12, ly = y + 20;
    ctx.fillStyle = PALETTE.cyberCore;
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('▸ K-MEH-20 LIVE', lx, ly);
    ctx.strokeStyle = 'rgba(0, 255, 163, 0.2)';
    ctx.beginPath();
    ctx.moveTo(lx, ly + 8);
    ctx.lineTo(x + boxW - 12, ly + 8);
    ctx.stroke();
    ly += lineH + 8;
    ctx.font = '10px "JetBrains Mono", monospace';
    var fpsColor = engine.fps >= 55 ? PALETTE.cyberCore : engine.fps >= 40 ? PALETTE.kemetBright : PALETTE.danger;
    drawHudLine('FPS', engine.fps.toFixed(0), lx, ly, fpsColor); ly += lineH;
    var rotDeg = ((camera.rotation * 180 / Math.PI) % 360).toFixed(1);
    drawHudLine('Azimuth', rotDeg + '°', lx, ly, PALETTE.whiteSoft); ly += lineH;
    var tiltDeg = (camera.tilt * 180 / Math.PI).toFixed(1);
    drawHudLine('Tilt', tiltDeg + '°', lx, ly, PALETTE.whiteSoft); ly += lineH;
    drawHudLine('Zoom', camera.zoom.toFixed(2) + '×', lx, ly, PALETTE.whiteSoft); ly += lineH;
    var activeLvl = selection.level >= 0 ? selection.level : selection.hoveredLevel;
    var activeLvlStr = activeLvl >= 0 ? 'N' + (activeLvl + 1) : '—';
    var activeLvlColor = activeLvl >= 0 ? LEVELS_CONFIG[activeLvl].color : PALETTE.slateMid;
    drawHudLine('Niveau', activeLvlStr, lx, ly, activeLvlColor); ly += lineH;
    var visSkids = 0;
    for (var i = 0; i < scene.skids.length; i++) {
      if (scene.skids[i].pz !== undefined && scene.skids[i].pz < 1.5) visSkids++;
    }
    drawHudLine('Skids', visSkids + '/' + scene.skids.length, lx, ly, PALETTE.kemetBright); ly += lineH;
    var explStr = selection.explosion < 0.05 ? 'OFF' : selection.explosion > 0.95 ? 'ON' : Math.round(selection.explosion * 100) + '%';
    var explColor = selection.explosion > 0.5 ? PALETTE.kemetBright : PALETTE.slateLight;
    drawHudLine('Éclatée', explStr, lx, ly, explColor);
    var badgeY = y + boxH - 22;
    var badgeX = x + 12, badgeW = 100, badgeH = 16;
    ctx.fillStyle = 'rgba(197, 160, 89, 0.15)';
    ctx.strokeStyle = 'rgba(197, 160, 89, 0.5)';
    ctx.lineWidth = 1;
    if (ctx.roundRect) ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
    else ctx.rect(badgeX, badgeY, badgeW, badgeH);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.kemetBright;
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OMPIC · PENDING', badgeX + badgeW / 2, badgeY + badgeH / 2);
  }

  function drawCompass() {
    if (!selection.showCompass) return;
    var size = 54, pad = 14;
    var cx = engine.W - pad - size / 2;
    var cy = engine.H - pad - size / 2;
    var r = size / 2;
    ctx.fillStyle = 'rgba(5, 10, 13, 0.82)';
    ctx.strokeStyle = 'rgba(0, 255, 163, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 255, 163, 0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    var colors = [PALETTE.cyberCore, PALETTE.cyberMid, PALETTE.kemetBright, PALETTE.kemetMid];
    var labels = ['N', 'E', 'S', 'W'];
    var rot = -camera.rotation;
    for (var i = 0; i < 4; i++) {
      var angle = rot + (i * Math.PI / 2);
      var endR = r * 0.75;
      var ex = cx + Math.cos(angle - Math.PI / 2) * endR;
      var ey = cy + Math.sin(angle - Math.PI / 2) * endR;
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = i === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      var labelR = r * 0.9;
      var lx = cx + Math.cos(angle - Math.PI / 2) * labelR;
      var ly = cy + Math.sin(angle - Math.PI / 2) * labelR;
      ctx.fillStyle = colors[i];
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[i], lx, ly);
    }
    ctx.fillStyle = PALETTE.cyberCore;
    ctx.shadowColor = PALETTE.cyberCore;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  /* §22 · HIT TEST */
  function hitTestLevel(clientX, clientY) {
    if (!engine.rect) engine.rect = canvas.getBoundingClientRect();
    var mx = clientX - engine.rect.left;
    var my = clientY - engine.rect.top;
    if (!scene.ringsCache.length) return -1;
    var baseCache = scene.ringsCache[0];
    var topCache = scene.ringsCache[PYRAMID.levelsCount - 1];
    var minY = Infinity, maxY = -Infinity;
    var allPts = [baseCache.bottom, baseCache.top, topCache.bottom, topCache.top];
    for (var a = 0; a < allPts.length; a++) {
      for (var b = 0; b < allPts[a].length; b++) {
        if (allPts[a][b].y < minY) minY = allPts[a][b].y;
        if (allPts[a][b].y > maxY) maxY = allPts[a][b].y;
      }
    }
    if (my < minY || my > maxY) return -1;
    var relY = (my - minY) / (maxY - minY);
    if (relY < 0.25) return 3;
    if (relY < 0.50) return 2;
    if (relY < 0.75) return 1;
    return 0;
  }

  function hitTestSkid(clientX, clientY) {
    if (!engine.rect) engine.rect = canvas.getBoundingClientRect();
    var mx = clientX - engine.rect.left;
    var my = clientY - engine.rect.top;
    var closest = -1, minDist = 22;
    for (var i = 0; i < scene.skids.length; i++) {
      var sk = scene.skids[i];
      if (!sk.px || !sk.py) continue;
      var dx = mx - sk.px, dy = my - sk.py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    return closest;
  }

  /* §23 · INPUT · MOUSE */
  canvas.addEventListener('mousedown', function (e) {
    camera.isDragging = true;
    camera.hasDragged = false;
    camera.lastX = e.clientX;
    camera.lastY = e.clientY;
    camera.dragStartTime = Date.now();
    camera.autoRotate = false;
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('mousemove', function (e) {
    if (!engine.rect) engine.rect = canvas.getBoundingClientRect();
    var mx = e.clientX - engine.rect.left;
    var my = e.clientY - engine.rect.top;
    engine.pointer = { x: mx, y: my };
    if (camera.isDragging) {
      var dx = e.clientX - camera.lastX;
      var dy = e.clientY - camera.lastY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) camera.hasDragged = true;
      camera.targetRotation += dx * 0.012;
      camera.targetTilt = clamp(camera.targetTilt + dy * 0.008, -0.15, 1.32);
      camera.velocity = dx * 0.008;
      camera.lastX = e.clientX;
      camera.lastY = e.clientY;
    } else {
      var lvl = hitTestLevel(e.clientX, e.clientY);
      if (lvl !== selection.hoveredLevel) selection.hoveredLevel = lvl;
      var skidIdx = hitTestSkid(e.clientX, e.clientY);
      selection.hoveredSkid = skidIdx;
      canvas.style.cursor = (lvl >= 0 || skidIdx >= 0) ? 'pointer' : 'grab';
    }
  });

  window.addEventListener('mouseup', function (e) {
    if (!camera.isDragging) return;
    camera.isDragging = false;
    canvas.style.cursor = 'grab';
    var dragDuration = Date.now() - camera.dragStartTime;
    if (!camera.hasDragged && dragDuration < 500) {
      var skidIdx = hitTestSkid(e.clientX, e.clientY);
      if (skidIdx >= 0) selectSkid(skidIdx);
      else {
        var lvl = hitTestLevel(e.clientX, e.clientY);
        if (lvl >= 0) selectLevel(lvl);
      }
    } else {
      setTimeout(function () {
        if (!camera.isDragging) camera.autoRotate = true;
      }, 4000);
    }
  });

  canvas.addEventListener('mouseleave', function () {
    engine.pointer = null;
    selection.hoveredLevel = -1;
    selection.hoveredSkid = -1;
  });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var delta = e.deltaY > 0 ? -0.05 : 0.05;
    camera.targetZoom = clamp(camera.targetZoom + delta, 0.6, 1.8);
  }, { passive: false });

  /* §24 · INPUT · TOUCH */
  var touchState = { active: false, pinchStartDistance: 0, pinchStartZoom: 1 };

  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      camera.isDragging = true;
      camera.hasDragged = false;
      camera.lastX = e.touches[0].clientX;
      camera.lastY = e.touches[0].clientY;
      camera.dragStartTime = Date.now();
      camera.autoRotate = false;
      touchState.active = true;
    } else if (e.touches.length === 2) {
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      touchState.pinchStartDistance = Math.sqrt(dx * dx + dy * dy);
      touchState.pinchStartZoom = camera.zoom;
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', function (e) {
    if (e.touches.length === 1 && camera.isDragging) {
      var t = e.touches[0];
      var dx = t.clientX - camera.lastX;
      var dy = t.clientY - camera.lastY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) camera.hasDragged = true;
      camera.targetRotation += dx * 0.015;
      camera.targetTilt = clamp(camera.targetTilt + dy * 0.010, -0.15, 1.32);
      camera.lastX = t.clientX;
      camera.lastY = t.clientY;
      e.preventDefault();
    } else if (e.touches.length === 2) {
      var dx2 = e.touches[0].clientX - e.touches[1].clientX;
      var dy2 = e.touches[0].clientY - e.touches[1].clientY;
      var dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      if (touchState.pinchStartDistance > 0) {
        var scale = dist / touchState.pinchStartDistance;
        camera.targetZoom = clamp(touchState.pinchStartZoom * scale, 0.6, 1.8);
      }
      e.preventDefault();
    }
  }, { passive: false });

  canvas.addEventListener('touchend', function (e) {
    if (e.touches.length === 0) {
      camera.isDragging = false;
      touchState.active = false;
      touchState.pinchStartDistance = 0;
      var dragDuration = Date.now() - camera.dragStartTime;
      if (!camera.hasDragged && dragDuration < 500 && e.changedTouches[0]) {
        var t = e.changedTouches[0];
        var skidIdx = hitTestSkid(t.clientX, t.clientY);
        if (skidIdx >= 0) selectSkid(skidIdx);
        else {
          var lvl = hitTestLevel(t.clientX, t.clientY);
          if (lvl >= 0) selectLevel(lvl);
        }
      } else {
        setTimeout(function () {
          if (!camera.isDragging) camera.autoRotate = true;
        }, 4000);
      }
    } else if (e.touches.length === 1) {
      camera.lastX = e.touches[0].clientX;
      camera.lastY = e.touches[0].clientY;
      touchState.pinchStartDistance = 0;
    }
  }, { passive: true });

  /* §25 · INPUT · KEYBOARD */
  window.addEventListener('keydown', function (e) {
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    switch (e.key) {
      case 'ArrowLeft': camera.targetRotation -= 0.15; camera.autoRotate = false; break;
      case 'ArrowRight': camera.targetRotation += 0.15; camera.autoRotate = false; break;
      case 'ArrowUp': camera.targetTilt = clamp(camera.targetTilt - 0.08, -0.15, 1.32); break;
      case 'ArrowDown': camera.targetTilt = clamp(camera.targetTilt + 0.08, -0.15, 1.32); break;
      case '+': case '=': camera.targetZoom = clamp(camera.targetZoom + 0.1, 0.6, 1.8); break;
      case '-': case '_': camera.targetZoom = clamp(camera.targetZoom - 0.1, 0.6, 1.8); break;
      case '1': selectLevel(0); break;
      case '2': selectLevel(1); break;
      case '3': selectLevel(2); break;
      case '4': selectLevel(3); break;
      case 'e': case 'E': toggleExplosion(); break;
      case 'a': case 'A': toggleAutoRotate(); break;
      case 'r': case 'R': resetCamera(); break;
      case 'g': case 'G': selection.showGrid = !selection.showGrid; break;
      case 'c': case 'C': selection.showCompass = !selection.showCompass; break;
      case 't': case 'T': selection.showTelemetry = !selection.showTelemetry; break;
      case 'Escape': selection.level = -1; selection.levelTarget = -1; selection.skid = -1; break;
    }
  });

  /* §26 · SELECTION HELPERS */
  function selectLevel(idx) {
    if (idx < 0 || idx >= PYRAMID.levelsCount) { selection.level = -1; selection.levelTarget = -1; }
    else if (selection.level === idx) { selection.level = -1; selection.levelTarget = -1; }
    else { selection.level = idx; selection.levelTarget = idx; }
    if (typeof window.onKmehLevelSelect === 'function') {
      try { window.onKmehLevelSelect(selection.level); } catch (err) {}
    }
  }

  function selectSkid(idx) {
    if (idx < 0) { selection.skid = -1; scene.skids.forEach(function (s) { s.selected = false; }); return; }
    selection.skid = idx;
    scene.skids.forEach(function (s, i) { s.selected = (i === idx); });
    if (typeof window.onKmehSkidSelect === 'function') {
      try { window.onKmehSkidSelect(idx, scene.skids[idx]); } catch (err) {}
    }
  }

  function resetCamera() {
    camera.targetRotation = 0.6;
    camera.targetTilt = 0.32;
    camera.targetZoom = 1.0;
    camera.autoRotate = true;
    camera.velocity = 0;
  }

  function toggleExplosion() {
    selection.explosionTarget = selection.explosionTarget > 0.5 ? 0 : 1;
    if (selection.explosionTarget > 0.5) document.body.classList.add('kmeh-exploded');
    else document.body.classList.remove('kmeh-exploded');
    if (typeof window.__syncKmehButtons === 'function') window.__syncKmehButtons();
  }

  function toggleAutoRotate() {
    camera.autoRotate = !camera.autoRotate;
    if (camera.autoRotate) document.body.classList.remove('kmeh-auto-off');
    else document.body.classList.add('kmeh-auto-off');
    if (typeof window.__syncKmehButtons === 'function') window.__syncKmehButtons();
  }

  /* §27 · ANIMATION LOOP (render protégé try/catch) */
  function animate(now) {
    engine.renderRequestId = requestAnimationFrame(animate);
    if (engine.paused) return;
    if (!engine.lastFrameTime) { engine.lastFrameTime = now; return; }
    var rawDt = (now - engine.lastFrameTime) / 1000;
    engine.deltaTime = Math.min(rawDt, 0.05);
    engine.lastFrameTime = now;
    engine.elapsedTime += engine.deltaTime;
    engine.fpsAccumulator += engine.deltaTime;
    engine.fpsFrames++;
    if (engine.fpsAccumulator >= 0.5) {
      engine.fps = engine.fpsFrames / engine.fpsAccumulator;
      engine.fpsAccumulator = 0;
      engine.fpsFrames = 0;
    }
    var dt = engine.deltaTime;
    if (camera.autoRotate && !reducedMotion()) {
      camera.targetRotation += camera.autoRotateSpeed * dt;
    }
    camera.rotation += (camera.targetRotation - camera.rotation) * 0.12;
    camera.rotation += camera.velocity;
    camera.velocity *= camera.velocityDamping;
    camera.tilt += (camera.targetTilt - camera.tilt) * 0.10;
    camera.zoom += (camera.targetZoom - camera.zoom) * 0.12;

    updateScene(dt);

    try {
      ctx.clearRect(0, 0, engine.W, engine.H);
      drawRadialBackground(engine.W / 2, engine.H / 2, Math.min(engine.W, engine.H) * 0.7, 'rgba(0, 255, 163, 0.04)', 'rgba(0, 0, 0, 0)');
      drawPyramidHalo();
      drawPyramidLevels();
      drawPyramidTopFace();
      drawPyramidVertices();
      drawKemetLoopCore();
      drawDataParticles();
      drawSkids();
      drawEnergyParticles();
      drawHorusEye();
      drawScanLine(dt);
      drawTelemetryHUD();
      drawCompass();
    } catch (renderErr) {
      if (!engine._loggedRenderError) {
        console.error('[K-MEH-20] Render error:', renderErr);
        engine._loggedRenderError = true;
      }
    }
  }

  /* §28 · RESIZE (fallback chain robuste) */
  function resizeCanvas() {
    if (!canvas.parentElement) return;
    var rect = canvas.parentElement.getBoundingClientRect();

    if (rect.width < 1 || rect.height < 1) {
      var parentEl = canvas.parentElement;
      var fallbackW = parentEl.offsetWidth || parentEl.clientWidth || 0;
      var fallbackH = parentEl.offsetHeight || parentEl.clientHeight || 0;
      if (fallbackW < 1 || fallbackH < 1) {
        fallbackW = Math.max(320, Math.min(window.innerWidth - 40, 900));
        fallbackH = Math.max(400, Math.min(window.innerHeight * 0.78, 900));
        console.warn('[K-MEH-20] Using window fallback:', fallbackW, fallbackH);
      }
      rect = { width: fallbackW, height: fallbackH };
    }

    if (engine.W > 0 && Math.abs(engine.W - rect.width) < 20 && Math.abs(engine.H - rect.height) < 20) {
      return;
    }

    engine.W = rect.width;
    engine.H = rect.height;
    engine.DPR = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.max(1, Math.round(rect.width * engine.DPR));
    canvas.height = Math.max(1, Math.round(rect.height * engine.DPR));
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    ctx.setTransform(engine.DPR, 0, 0, engine.DPR, 0, 0);
    engine.rect = canvas.getBoundingClientRect();

    if (engine.initialized) updateRingsCache();

    console.info('[K-MEH-20] Canvas sized:', engine.W.toFixed(0) + '×' + engine.H.toFixed(0), 'DPR:', engine.DPR);
  }

  /* §29 · PUBLIC API */
  window.kmehPyramidSelectLevel = function (idx) { selectLevel(idx); };
  window.kmehPyramidToggleExplosion = function () { toggleExplosion(); return selection.explosionTarget > 0.5; };
  window.kmehPyramidToggleAutoRotate = function () { toggleAutoRotate(); return camera.autoRotate; };
  window.kmehPyramidGetState = function () {
    return {
      level: selection.level, hoveredLevel: selection.hoveredLevel,
      skid: selection.skid, hoveredSkid: selection.hoveredSkid,
      explosion: selection.explosion, explosionTarget: selection.explosionTarget,
      autoRotate: camera.autoRotate,
      camera: { rotation: camera.rotation, tilt: camera.tilt, zoom: camera.zoom },
      fps: engine.fps, paused: engine.paused, canvasSize: { w: engine.W, h: engine.H }
    };
  };
  window.kmehPyramidReset = function () {
    resetCamera();
    selection.level = -1; selection.levelTarget = -1;
    selection.skid = -1; selection.hoveredLevel = -1; selection.hoveredSkid = -1;
    scene.skids.forEach(function (s) { s.selected = false; });
    if (typeof window.__syncKmehButtons === 'function') window.__syncKmehButtons();
  };
  window.kmehPyramidToggleGrid = function () { selection.showGrid = !selection.showGrid; return selection.showGrid; };
  window.kmehPyramidToggleTelemetry = function () { selection.showTelemetry = !selection.showTelemetry; return selection.showTelemetry; };
  window.kmehPyramidToggleCompass = function () { selection.showCompass = !selection.showCompass; return selection.showCompass; };
  window.kmehPyramidToggleLabels = function () { selection.showLabels = !selection.showLabels; return selection.showLabels; };
  window.kmehPyramidZoom = function (delta) { camera.targetZoom = clamp(camera.targetZoom + delta, 0.6, 1.8); return camera.targetZoom; };
  window.kmehPyramidRotate = function (radians) {
    camera.targetRotation += radians;
    camera.autoRotate = false;
    setTimeout(function () { if (!camera.isDragging) camera.autoRotate = true; }, 4000);
  };
  window.kmehPyramidInfo = function () {
    return {
      version: '3.2',
      brand: 'Industrial Illusion SARL',
      product: 'K-MEH-20 · Kemet Modular Eco Hub 20',
      status: 'Technologie propriétaire avancée · En développement · OMPIC en préparation',
      levels: LEVELS_CONFIG.map(function (l) {
        return { label: l.label, subtitle: l.subtitle, area: l.area, mission: l.mission };
      })
    };
  };

  /* §30 · VISIBILITY */
  document.addEventListener('visibilitychange', function () {
    engine.paused = document.hidden;
    if (!document.hidden) engine.lastFrameTime = 0;
  });

  /* §31 · BOOTSTRAP (fallback complet) */
  function bootstrap() {
    if (engine.initialized) return;
    resizeCanvas();
    initializeScene();
    updateRingsCache();
    engine.initialized = true;
    engine.lastFrameTime = 0;
    animate(performance.now());

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resizeCanvas, 150);
    });

    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      new ResizeObserver(function () { resizeCanvas(); }).observe(canvas.parentElement);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        setTimeout(resizeCanvas, 100);
      });
    }

    setTimeout(resizeCanvas, 400);
    setTimeout(resizeCanvas, 1200);

    reducedMotionQuery.addEventListener('change', function () {
      camera.autoRotate = reducedMotion ? false : true;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(bootstrap, 50); });
  } else {
    setTimeout(bootstrap, 50);
  }
  window.addEventListener('load', function () {
    if (!engine.initialized) bootstrap();
    else setTimeout(resizeCanvas, 100);
  });

})();
