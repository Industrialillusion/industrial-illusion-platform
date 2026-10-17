/* ============================================================
   K-MEH-20 · MOTEUR DE RENDU CYBER-PHYSIQUE v3.0
   Pyramide Tronquée Interactive · Skids Modulaires · Télémétrie Live
   Industrial Illusion SARL · Deep Tech Systems · Marrakech

   ⚠️  TECHNOLOGIE PROPRIÉTAIRE
   ─────────────────────────────────────────────────────────────
   Architecture cyber-physique K-MEH-20 (Kemet Modular Eco Hub 20)
   en phase de développement et de préparation au dépôt auprès de
   l'OMPIC (Office Marocain de la Propriété Industrielle et
   Commerciale).

   Ce code implémente une REPRÉSENTATION VISUELLE des concepts
   architecturaux K-MEH-20 destinés à la Data Room institutionnelle
   et à la présentation investisseurs. Il ne contient AUCUNE
   spécification technique propriétaire (P&ID, formules de réaction,
   schémas de câblage, dimensions internes des modules).

   Toute reproduction, décompilation ou diffusion non autorisée est
   strictement interdite sans NDA préalable signé avec la Direction
   Générale de Industrial Illusion SARL.

   Copyright © 2026 Industrial Illusion SARL. Tous droits réservés.
   ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // SECTION 1 · RÉFÉRENCE AU CANVAS ET ÉTAT GLOBAL
  // ============================================================

  var canvas = document.getElementById('kmehPyramidCanvas');
  if (!canvas) {
    // Sortie silencieuse : le canvas n'est pas présent sur cette page.
    return;
  }

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    console.warn('[K-MEH-20] Contexte 2D indisponible.');
    return;
  }

  // Détection des préférences utilisateur (respect accessibilité)
  var reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reducedMotion = reducedMotionQuery.matches;
  if (reducedMotionQuery.addEventListener) {
    reducedMotionQuery.addEventListener('change', function (e) {
      reducedMotion = e.matches;
    });
  }

  // ============================================================
  // SECTION 2 · PALETTE CYBER-KEMET (identité de marque)
  // ============================================================

  var PALETTE = {
    // Fonds
    bgDeep:        '#050A0D',      // fond spatial profond
    bgMid:         '#0A1218',      // halo de transition
    bgVignette:    'rgba(0,0,0,0)',

    // Cyber Green (niveau base)
    cyberCore:     '#00FFA3',
    cyberMid:      '#00B871',
    cyberDeep:     '#059669',

    // Kemet Gold (niveaux hauts)
    kemetBright:   '#E8C86A',
    kemetMid:      '#C5A059',
    kemetDeep:     '#8B6F2A',

    // Neutres
    whitePure:     '#FFFFFF',
    whiteSoft:     '#F1F5F9',
    slateLight:    '#94A3B8',
    slateMid:      '#64748B',
    slateDark:     '#334155',

    // Auxiliaires
    danger:        '#F87171',
    warning:       '#E6CA86',
    info:          '#60A5FA'
  };

  // ============================================================
  // SECTION 3 · CONSTANTES GÉOMÉTRIQUES DE LA PYRAMIDE
  // ============================================================
  //
  // La pyramide tronquée K-MEH-20 est définie par :
  //   - 4 niveaux volumétriques principaux (numérotés 1 à 4)
  //   - 5 anneaux géométriques (base, transitions, sommet)
  //   - Une hauteur normalisée (1.5 unité) et une base normalisée (2.0 unité)
  //
  // Les proportions respectent la spécification officielle :
  //   Base 56m × 56m → 3 136 m²
  //   Niveau 2 : 1 400 m² (emprise réduite)
  //   Niveau 3 : 600 m² (emprise réduite)
  //   Niveau 4 : 150 m² (sommet, "Œil d'Horus")
  //
  // Le ratio hauteur / demi-base = 0.75, soit une pente de ~37°,
  // proche de la pyramide de Khéops (~51°) mais volontairement
  // adoucie pour faciliter l'accès des skids et la maintenance.

  var PYRAMID = {
    halfBase:       1.000,   // demi-largeur à la base (normalisée)
    halfTop:        0.220,   // demi-largeur au sommet
    height:         1.500,   // hauteur totale normalisée
    ringsCount:     5,       // 5 anneaux = 4 niveaux
    facesCount:     4,       // 4 faces visibles (pyramide carrée)
    levelsCount:    4,       // 4 niveaux fonctionnels

    // Métriques officielles (pour affichage HUD)
    realBase:       56,      // mètres
    realHeight:     32,      // mètres
    surfaceBase:    3136,    // m²
    surfaceL2:      1400,
    surfaceL3:      600,
    surfaceL4:      150,
    capacityTons:   20000    // t/an
  };

  // Configuration des 4 niveaux (couleurs, noms, fonctions)
  var LEVELS_CONFIG = [
    {
      index:       0,
      key:         'base',
      color:       PALETTE.cyberCore,
      colorDim:    PALETTE.cyberMid,
      accent:      PALETTE.cyberDeep,
      label:       'NIVEAU 1 · BASE',
      subtitle:    'Réception Matière',
      area:        '3 136 m²',
      function:    'Tri optique · Presses · Réception',
      metric:      '20 000 t/an',
      description: 'Quai d\'alimentation étanche en dépression, trémies de réception primaires, lignes de tri optoélectronique NIR à haute vitesse, presses à balles 500 kN.'
    },
    {
      index:       1,
      key:         'centre',
      color:       PALETTE.cyberMid,
      colorDim:    PALETTE.cyberDeep,
      accent:      PALETTE.cyberDeep,
      label:       'NIVEAU 2 · CENTRE',
      subtitle:    'Système Nerveux',
      area:        '1 400 m²',
      function:    'd-HVAC · Serveurs Edge · Fluides',
      metric:      'SIL-3',
      description: 'Centre névralgique : unités d-HVAC à récupération enthalpique, pompes de surpression, salle serveurs blindée Faraday hébergeant les nœuds Edge.'
    },
    {
      index:       2,
      key:         'elev',
      color:       PALETTE.kemetMid,
      colorDim:    PALETTE.kemetDeep,
      accent:      PALETTE.kemetBright,
      label:       'NIVEAU 3 · ÉLÉVATION',
      subtitle:    'Cerveau Algorithmique',
      area:        '600 m²',
      function:    'Cluster Maat OS · Data Lake',
      metric:      'SHA-256',
      description: 'Cluster de calcul temps réel Maat OS, traitement télémétrie SIL-3, optimisation convoyeurs, passerelle notarisation blockchain vers Maat Data Lake.'
    },
    {
      index:       3,
      key:         'top',
      color:       PALETTE.kemetBright,
      colorDim:    PALETTE.kemetMid,
      accent:      PALETTE.whitePure,
      label:       'NIVEAU 4 · SOMMET',
      subtitle:    'Œil d\'Horus',
      area:        '150 m²',
      function:    'Control Room · Observatoire 360°',
      metric:      '24/7',
      description: 'Tour de contrôle à vision panoramique 360°, console SCADA, pilotage d\'urgence, liaison satellitaire continue avec la Direction Générale et les partenaires publics.'
    }
  ];

  // ============================================================
  // SECTION 4 · SYSTÈME DE SKIDS MODULAIRES
  // ============================================================
  //
  // Chaque niveau de la pyramide est desservi par une constellation
  // de skids modulaires qui orbitent autour de l'anneau correspondant.
  // Ces skids représentent les modules pré-assemblés en zone franche
  // et acheminés vers le hub pour assemblage Plug & Process.
  //
  // 3 types de skids :
  //   - MATTER : skids de matière (flux entrants / sortants)
  //   - DATA   : skids de données (paquets cryptographiques)
  //   - ENERGY : skids d'énergie (flux Kemet Loop)

  var SKID_TYPES = {
    MATTER: {
      key:        'MATTER',
      color:      PALETTE.kemetBright,
      colorGlow:  'rgba(232, 200, 106, 0.4)',
      size:       0.055,
      speed:      0.32,
      icon:       '◧',
      label:      'Matière'
    },
    DATA: {
      key:        'DATA',
      color:      PALETTE.cyberCore,
      colorGlow:  'rgba(0, 255, 163, 0.45)',
      size:       0.045,
      speed:      0.52,
      icon:       '◈',
      label:      'Données'
    },
    ENERGY: {
      key:        'ENERGY',
      color:      PALETTE.kemetMid,
      colorGlow:  'rgba(197, 160, 89, 0.45)',
      size:       0.040,
      speed:      0.78,
      icon:       '◉',
      label:      'Énergie'
    }
  };

  // Distribution des skids par niveau (configuration par défaut)
  // Chaque entrée = { level, type, angleOffset }
  var SKIDS_CONFIG = [
    // Niveau 1 (base) — flux matière abondant
    { level: 0, type: 'MATTER', angleOffset: 0.00 },
    { level: 0, type: 'MATTER', angleOffset: 0.42 },
    { level: 0, type: 'MATTER', angleOffset: 0.84 },
    { level: 0, type: 'MATTER', angleOffset: 1.26 },
    { level: 0, type: 'DATA',   angleOffset: 0.21 },
    { level: 0, type: 'ENERGY', angleOffset: 0.63 },

    // Niveau 2 (centre) — flux data + énergie
    { level: 1, type: 'DATA',   angleOffset: 0.10 },
    { level: 1, type: 'DATA',   angleOffset: 0.52 },
    { level: 1, type: 'DATA',   angleOffset: 0.94 },
    { level: 1, type: 'ENERGY', angleOffset: 0.31 },
    { level: 1, type: 'ENERGY', angleOffset: 0.73 },
    { level: 1, type: 'MATTER', angleOffset: 0.00 },

    // Niveau 3 (élévation) — data dominant
    { level: 2, type: 'DATA',   angleOffset: 0.15 },
    { level: 2, type: 'DATA',   angleOffset: 0.57 },
    { level: 2, type: 'DATA',   angleOffset: 0.99 },
    { level: 2, type: 'ENERGY', angleOffset: 0.36 },

    // Niveau 4 (sommet) — data et énergie
    { level: 3, type: 'DATA',   angleOffset: 0.00 },
    { level: 3, type: 'DATA',   angleOffset: 0.50 },
    { level: 3, type: 'ENERGY', angleOffset: 0.25 }
  ];

  // ============================================================
  // SECTION 5 · MANIFESTE ARCHITECTONIQUE
  // ============================================================
  //
  // Textes courts utilisés dans le HUD du canvas pour expliciter
  // les avantages de la pyramide tronquée K-MEH-20 par rapport
  // aux hangars industriels traditionnels (Industrie 4.0).
  //
  // Ces textes sont volontairement synthétiques pour rester lisibles
  // en overlay canvas. Les versions longues sont disponibles dans
  // la section HTML "Manifeste" de la page.

  var ARCHITECTURAL_ADVANTAGES = [
    {
      code:     'A-01',
      title:    'Ratio volume / empreinte',
      short:    '−42% d\'emprise au sol vs hangar équivalent'
    },
    {
      code:     'A-02',
      title:    'Convection naturelle',
      short:    'Effet cheminée passif, −28% HVAC'
    },
    {
      code:     'A-03',
      title:    'Résilience sismique',
      short:    'Base large = dissipation d\'ondes optimale'
    },
    {
      code:     'A-04',
      title:    'Modularité skid',
      short:    '5 niveaux de plug & process'
    }
  ];

  // ============================================================
  // SECTION 6 · ÉTAT INTERNE DU MOTEUR
  // ============================================================

  var engine = {
    // Dimensions physiques
    W: 0,
    H: 0,
    DPR: 1,

    // Timing
    lastFrameTime: 0,
    elapsedTime: 0,
    deltaTime: 0,
    fps: 60,
    fpsAccumulator: 0,
    fpsFrames: 0,

    // Visibilité (pause quand tab caché)
    paused: false,
    initialized: false,

    // Rendu
    renderRequestId: 0
  };

  // ============================================================
  // SECTION 7 · ÉTAT DE LA CAMÉRA
  // ============================================================
  //
  // Caméra orbitale libre avec 3 degrés de liberté :
  //   - rotation Y (azimut)    : drag horizontal / flèches G-D
  //   - tilt X (élévation)     : drag vertical / flèches H-B
  //   - zoom                   : wheel / pinch / boutons
  //
  // Contraintes :
  //   - tilt : entre -0.15π et 0.42π (empêche de passer sous la base)
  //   - zoom : entre 0.6 et 1.8
  //
  // L'auto-rotation est activée par défaut, désactivée au premier drag.

  var camera = {
    rotation:        0.6,
    targetRotation:  0.6,
    tilt:            0.32,
    targetTilt:      0.32,
    zoom:            1.0,
    targetZoom:      1.0,

    autoRotate:      true,
    autoRotateSpeed: 0.12,

    velocity:        0,
    velocityDamping: 0.92,

    isDragging:      false,
    hasDragged:      false,
    lastX:           0,
    lastY:           0,
    dragStartTime:   0
  };

  // ============================================================
  // SECTION 8 · ÉTAT DE SÉLECTION ET HOVER
  // ============================================================

  var selection = {
    level:         -1,      // niveau sélectionné (-1 = aucun)
    levelTarget:   -1,      // pour transition douce
    hoveredLevel:  -1,      // niveau survolé
    skid:          -1,      // skid sélectionné
    hoveredSkid:   -1,      // skid survolé
    panelVisible:  true,    // panneau d'info visible
    showManifest:  false,   // mode manifeste activé
    showCompass:   true,    // boussole visible
    showTelemetry: true,    // télémétrie visible
    showGrid:      true,    // grille blueprint visible
    showLabels:    true     // étiquettes de niveau visibles
  };

  // ============================================================
  // SECTION 9 · UTILITAIRES MATHÉMATIQUES
  // ============================================================

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function normalizeAngle(angle) {
    while (angle < 0) angle += Math.PI * 2;
    while (angle >= Math.PI * 2) angle -= Math.PI * 2;
    return angle;
  }

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function hashString(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return Math.abs(hash);
  }

  // ============================================================
  // SECTION 10 · PROJECTION 3D → 2D (algorithme isométrique)
  // ============================================================
  //
  // La projection transforme un point 3D (x, y, z) en un point
  // 2D (sx, sy) sur le canvas, en appliquant :
  //   1. Rotation azimut autour de l'axe Y (rotation)
  //   2. Inclinaison autour de l'axe X (tilt)
  //   3. Perspective légère (facteur 500 / (500 + z * 100))
  //   4. Mise à l'échelle par le zoom et la taille du canvas
  //
  // Les coordonnées 3D sont normalisées :
  //   - y = 0 → centre de la pyramide (mi-hauteur)
  //   - y = -PYRAMID.height/2 → base
  //   - y = +PYRAMID.height/2 → sommet
  //   - x, z ∈ [-halfBase, +halfBase]

  function projectPoint(x, y, z) {
    // Rotation Y (azimut)
    var cosR = Math.cos(camera.rotation);
    var sinR = Math.sin(camera.rotation);
    var rx = x * cosR - z * sinR;
    var rz = x * sinR + z * cosR;

    // Rotation X (tilt)
    var cosT = Math.cos(camera.tilt);
    var sinT = Math.sin(camera.tilt);
    var ry = y * cosT - rz * sinT;
    var rz2 = y * sinT + rz * cosT;

    // Perspective
    var perspFactor = 500 / (500 + rz2 * 120);

    // Échelle globale (zoom + adaptation viewport)
    var baseScale = Math.min(engine.W, engine.H) / 3.8;
    var scale = baseScale * camera.zoom;

    return {
      x: engine.W / 2 + rx * scale * perspFactor,
      y: engine.H / 2 + ry * scale * perspFactor,
      z: rz2,
      depth: rz2,
      scale: scale * perspFactor
    };
  }

  // ============================================================
  // SECTION 11 · PROJECTION D'UN ANNEAU DE PYRAMIDE
  // ============================================================
  //
  // Un anneau correspond à une "tranche" horizontale de la pyramide.
  // Chaque anneau a 4 sommets (pyramide carrée).
  //
  // Paramètre `t` ∈ [0, 1] :
  //   t = 0   → base
  //   t = 1   → sommet
  //
  // Retourne un tableau de 4 points 3D projetés.

  function projectRing(t) {
    // Interpolation de la demi-largeur au niveau t
    var halfWidth = lerp(PYRAMID.halfBase, PYRAMID.halfTop, t);

    // Position verticale (base = -height/2, sommet = +height/2)
    var y = -PYRAMID.height / 2 + t * PYRAMID.height;

    // 4 sommets du carré (dans le sens horaire vu du dessus)
    var corners = [
      { x: -halfWidth, z: -halfWidth }, // avant-gauche
      { x: +halfWidth, z: -halfWidth }, // avant-droit
      { x: +halfWidth, z: +halfWidth }, // arrière-droit
      { x: -halfWidth, z: +halfWidth }  // arrière-gauche
    ];

    return corners.map(function (c) {
      return projectPoint(c.x, y, c.z);
    });
  }

  // ============================================================
  // SECTION 12 · UTILITAIRES DE DESSIN CANVAS
  // ============================================================

  function clearCanvas() {
    ctx.clearRect(0, 0, engine.W, engine.H);
  }

  function drawRadialBackground(cx, cy, radius, colorInner, colorOuter) {
    var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grd.addColorStop(0, colorInner);
    grd.addColorStop(0.55, colorOuter);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, engine.W, engine.H);
  }

  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function drawGlowPath(path, color, lineWidth, glowBlur) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    if (glowBlur > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glowBlur;
    }
    ctx.stroke(path);
    ctx.shadowBlur = 0;
  }

  // ============================================================
  // FIN DE LA PARTIE 1
  // La partie 2 continue avec : génération scène, skids, particules
  // La partie 3 termine avec : rendu, boucle, interactions, API
  // ============================================================

  // Exporte les modules internes pour la partie 2 et 3 via un objet
  // partagé en closure (les parties 2 et 3 sont concaténées dans le
  // même IIFE).
  window.__KMEH_INTERNAL__ = {
    canvas: canvas,
    ctx: ctx,
    engine: engine,
    camera: camera,
    selection: selection,
    PYRAMID: PYRAMID,
    LEVELS_CONFIG: LEVELS_CONFIG,
    SKID_TYPES: SKID_TYPES,
    SKIDS_CONFIG: SKIDS_CONFIG,
    PALETTE: PALETTE,
    ARCHITECTURAL_ADVANTAGES: ARCHITECTURAL_ADVANTAGES,
    projectPoint: projectPoint,
    projectRing: projectRing,
    clearCanvas: clearCanvas,
    drawRadialBackground: drawRadialBackground,
    hexToRgba: hexToRgba,
    drawGlowPath: drawGlowPath,
    clamp: clamp,
    lerp: lerp,
    smoothstep: smoothstep,
    easeOutCubic: easeOutCubic,
    easeInOutQuad: easeInOutQuad,
    normalizeAngle: normalizeAngle,
    randomRange: randomRange,
    hashString: hashString,
    reducedMotion: function () { return reducedMotion; }
  };

  // NOTE POUR LA PARTIE 2 :
  // La suite du fichier (génération scène + skids + particules)
  // reprendra l'objet window.__KMEH_INTERNAL__ et continuera
  // dans le même IIFE. Ne pas fermer l'IIFE ici.

  // ============================================================
  // SEZIONE 13 · RIFERIMENTI INTERNI (ripresi dalla PARTE 1)
  // ============================================================

  var I = window.__KMEH_INTERNAL__;
  if (!I) {
    console.error('[K-MEH-20] PARTE 1 mancante o corrotta. Impossibile proseguire.');
    return;
  }

  var canvas        = I.canvas;
  var ctx           = I.ctx;
  var engine        = I.engine;
  var camera        = I.camera;
  var selection     = I.selection;
  var PYRAMID       = I.PYRAMID;
  var LEVELS_CONFIG = I.LEVELS_CONFIG;
  var SKID_TYPES    = I.SKID_TYPES;
  var SKIDS_CONFIG  = I.SKIDS_CONFIG;
  var PALETTE       = I.PALETTE;

  var projectPoint        = I.projectPoint;
  var projectRing         = I.projectRing;
  var clearCanvas         = I.clearCanvas;
  var drawRadialBackground= I.drawRadialBackground;
  var hexToRgba           = I.hexToRgba;
  var drawGlowPath        = I.drawGlowPath;
  var clamp               = I.clamp;
  var lerp                = I.lerp;
  var smoothstep          = I.smoothstep;
  var easeOutCubic        = I.easeOutCubic;
  var easeInOutQuad       = I.easeInOutQuad;
  var randomRange         = I.randomRange;

  // ============================================================
  // SEZIONE 14 · GENERAZIONE DELLA SCENA
  // ============================================================
  //
  // La scena è composta da:
  //   - skidsList : array di skid orbitali (uno per SKIDS_CONFIG)
  //   - energyParticles : particelle energetiche che salgono lungo i bordi
  //   - dataParticles : pacchetti di dati che scendono (telemetria)
  //   - ringsCache : cache degli anelli proiettati (aggiornata ogni frame)
  //   - annotations : linee guida architettoniche
  //
  // La generazione è deterministica in base alla config. Viene
  // richiamata una sola volta all'inizializzazione e poi
  // aggiornata frame per frame.

  var scene = {
    skids: [],
    energyParticles: [],
    dataParticles: [],
    ringsCache: [],
    annotations: [],
    scanLineY: 0,
    scanLineActive: true
  };

  // ------------------------------------------------------------
  // 14.1 · Creazione degli skids orbitali
  // ------------------------------------------------------------
  //
  // Ogni skid è un piccolo cuboide volumetrico che orbita
  // intorno al proprio livello. Parametri:
  //   - level       : indice livello (0-3)
  //   - type        : MATTER | DATA | ENERGY
  //   - angle       : angolo corrente intorno all'asse Y
  //   - angleOffset : offset iniziale (per distribuire i skid)
  //   - radius      : raggio orbitale (calcolato in base al livello)
  //   - y           : altezza verticale del livello (calcolata)
  //   - speed       : velocità angolare (rad/frame)
  //   - phase       : fase per oscillazione verticale
  //   - bobAmp      : ampiezza oscillazione verticale
  //   - scale       : dimensione relativa
  //   - trail       : array di posizioni precedenti per scia
  //   - docking     : true se in fase di avvicinamento al livello
  //   - dockingT    : progresso docking (0-1)

  function createSkid(config, idx) {
    var type = SKID_TYPES[config.type];
    var level = config.level;
    var levelCfg = LEVELS_CONFIG[level];

    // Calcolo geometria verticale del livello
    var tMid = (level + 0.5) / PYRAMID.levelsCount;
    var yMid = -PYRAMID.height / 2 + tMid * PYRAMID.height;

    // Raggio orbitale: appena fuori dalla superficie della piramide
    // al livello dato, più un piccolo margine per evitare clipping
    var halfWidthAtLevel = lerp(PYRAMID.halfBase, PYRAMID.halfTop, tMid);
    var orbitRadius = halfWidthAtLevel * 1.45 + 0.08;

    return {
      id: idx,
      level: level,
      levelCfg: levelCfg,
      type: type,
      typeKey: config.type,
      angle: config.angleOffset * Math.PI * 2,
      angleOffset: config.angleOffset * Math.PI * 2,
      radius: orbitRadius,
      y: yMid,
      speed: type.speed * (0.85 + Math.random() * 0.3),
      phase: Math.random() * Math.PI * 2,
      bobAmp: 0.025 + Math.random() * 0.02,
      scale: type.size,
      trail: [],
      trailMax: 12,
      docking: false,
      dockingT: 0,
      dockingDuration: 1.2,
      lastDockTime: 0,
      hover: false,
      selected: false
    };
  }

  function rebuildSkids() {
    scene.skids = SKIDS_CONFIG.map(function (cfg, idx) {
      return createSkid(cfg, idx);
    });
  }

  // ------------------------------------------------------------
  // 14.2 · Creazione particelle energetiche
  // ------------------------------------------------------------
  //
  // Le particelle energetiche rappresentano il flusso del Kemet Loop
  // che sale lungo i bordi della piramide, dalla base verso il sommet.
  // Ogni particella ha:
  //   - level    : livello di appartenenza (0-3)
  //   - corner   : angolo del bordo (0-3, uno dei 4 spigoli)
  //   - t        : progresso verticale nel livello (0-1)
  //   - speed    : velocità di salita
  //   - color    : colore basato sul livello
  //   - size     : dimensione base
  //   - pulse    : fase per pulsazione luminosa

  function createEnergyParticles() {
    var particles = [];
    var countPerLevel = 8;

    for (var lvl = 0; lvl < PYRAMID.levelsCount; lvl++) {
      for (var p = 0; p < countPerLevel; p++) {
        var corner = p % PYRAMID.facesCount;
        particles.push({
          level: lvl,
          corner: corner,
          t: Math.random(),
          speed: 0.0035 + Math.random() * 0.0025,
          color: LEVELS_CONFIG[lvl].color,
          size: 1.4 + Math.random() * 1.2,
          pulse: Math.random() * Math.PI * 2,
          reset: false
        });
      }
    }
    return particles;
  }

  // ------------------------------------------------------------
  // 14.3 · Creazione particelle di dati
  // ------------------------------------------------------------
  //
  // Le particelle dati rappresentano pacchetti crittografici
  // (hash SHA-256) che scendono dal sommet verso la base (telemetria
  // che viene notarizzata nel Data Lake al suolo). Questo crea un
  // flusso bidirezionale visivamente interessante:
  //   - energia sale (Kemet Loop)
  //   - dati scendono (notarizzazione)

  function createDataParticles() {
    var particles = [];
    var count = 18;

    for (var i = 0; i < count; i++) {
      particles.push({
        level: Math.floor(Math.random() * PYRAMID.levelsCount),
        corner: Math.floor(Math.random() * PYRAMID.facesCount),
        t: Math.random(),
        speed: -0.0028 - Math.random() * 0.0022, // negativo = scende
        color: PALETTE.cyberCore,
        size: 1.0 + Math.random() * 0.8,
        pulse: Math.random() * Math.PI * 2,
        blinkInterval: 0.3 + Math.random() * 0.6,
        blinkPhase: Math.random(),
        reset: false
      });
    }
    return particles;
  }

  // ------------------------------------------------------------
  // 14.4 · Creazione annotazioni architettoniche
  // ------------------------------------------------------------
  //
  // Le annotazioni sono linee guida che partono dal centro dei
  // livelli selezionati (o tutti) e si estendono verso l'esterno
  // per mostrare metriche e label.
  //
  // Ogni annotazione ha:
  //   - level    : livello associato
  //   - label    : testo da mostrare
  //   - metric   : metrica (es. "3136 m²")
  //   - side     : 'left' o 'right' (per evitare overlap)
  //   - offsetX  : offset orizzontale finale
  //   - offsetY  : offset verticale finale

  function createAnnotations() {
    var annotations = [];

    for (var i = 0; i < PYRAMID.levelsCount; i++) {
      var cfg = LEVELS_CONFIG[i];
      // Alterna left/right per non sovrapporre
      var side = (i % 2 === 0) ? 'left' : 'right';

      annotations.push({
        level: i,
        label: cfg.label,
        subtitle: cfg.subtitle,
        metric: cfg.area,
        side: side,
        offsetX: side === 'left' ? -0.55 : 0.55,
        offsetY: (i - 1.5) * 0.35,
        alpha: 1.0
      });
    }

    return annotations;
  }

  // ------------------------------------------------------------
  // 14.5 · Inizializzazione completa della scena
  // ------------------------------------------------------------

  function initializeScene() {
    rebuildSkids();
    scene.energyParticles = createEnergyParticles();
    scene.dataParticles = createDataParticles();
    scene.annotations = createAnnotations();
    scene.ringsCache = [];
  }

  // ============================================================
  // SEZIONE 15 · GESTIONE SKIDS (aggiornamento frame)
  // ============================================================

  function updateSkids(dt) {
    var timeSec = engine.elapsedTime;

    for (var i = 0; i < scene.skids.length; i++) {
      var skid = scene.skids[i];

      // Auto-rotazione intorno al livello
      if (!reducedMotion()) {
        skid.angle += skid.speed * dt;
        skid.angle = skid.angle % (Math.PI * 2);
      }

      // Oscillazione verticale (bob)
      var bob = Math.sin(skid.phase + timeSec * 1.2) * skid.bobAmp;

      // Calcolo posizione 3D
      var px3d = Math.cos(skid.angle) * skid.radius;
      var pz3d = Math.sin(skid.angle) * skid.radius;
      var py3d = skid.y + bob;

      // Proiezione 2D
      var projected = projectPoint(px3d, py3d, pz3d);
      skid.px = projected.x;
      skid.py = projected.y;
      skid.pz = projected.depth;
      skid.projScale = projected.scale;

      // Aggiorna trail
      skid.trail.push({ x: projected.x, y: projected.y, depth: projected.depth });
      if (skid.trail.length > skid.trailMax) {
        skid.trail.shift();
      }

      // Hover detection: se il puntatore è vicino allo skid proiettato
      if (engine.pointer) {
        var dx = engine.pointer.x - projected.x;
        var dy = engine.pointer.y - projected.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        skid.hover = dist < 22;
      } else {
        skid.hover = false;
      }
    }
  }

  // ============================================================
  // SEZIONE 16 · GESTIONE PARTICELLE ENERGIA E DATI
  // ============================================================

  function updateParticles(dt) {
    var timeSec = engine.elapsedTime;

    // Energia: sale dal livello verso l'alto
    for (var i = 0; i < scene.energyParticles.length; i++) {
      var p = scene.energyParticles[i];
      p.t += p.speed * dt * 60;

      if (p.t > 1) {
        // Reset: ricomincia dal basso dello stesso livello
        p.t = 0;
        p.pulse = Math.random() * Math.PI * 2;
      }

      // Pulsazione per effetto glow
      p.currentPulse = 0.7 + 0.3 * Math.sin(timeSec * 3 + p.pulse);
    }

    // Dati: scendono
    for (var j = 0; j < scene.dataParticles.length; j++) {
      var dp = scene.dataParticles[j];
      dp.t += dp.speed * dt * 60;

      if (dp.t < 0) {
        // Reset: ricomincia dall'alto
        dp.t = 1;
        dp.level = Math.floor(Math.random() * PYRAMID.levelsCount);
        dp.corner = Math.floor(Math.random() * PYRAMID.facesCount);
      }

      // Blink per effetto pacchetto dati
      dp.blinkPhase += dt * dp.blinkInterval * 6;
      if (dp.blinkPhase > 1) dp.blinkPhase -= 1;
      dp.currentBlink = dp.blinkPhase < 0.15 ? 1 : 0.5;
    }
  }

  // ============================================================
  // SEZIONE 17 · CACHE DEGLI ANELLI
  // ============================================================
  //
  // Gli anelli (tranche orizzontali della piramide) vengono
  // ricalcolati ad ogni frame per riflettere la rotazione della
  // camera. Vengono memorizzati in scene.ringsCache per riuso
  // nel rendering.

  function updateRingsCache() {
    scene.ringsCache = [];
    for (var i = 0; i <= PYRAMID.ringsCount; i++) {
      var t = i / PYRAMID.ringsCount;
      scene.ringsCache.push(projectRing(t));
    }
  }

  // ============================================================
  // SEZIONE 18 · RENDERING DEI LIVELLI DELLA PIRAMIDE
  // ============================================================
  //
  // Ogni livello è una fascia tra due anelli consecutivi.
  // Viene renderizzato come 4 facce quadrilatere (una per lato).
  //
  // Strategia di rendering:
  //   1. Calcola la profondità media di ogni faccia
  //   2. Ordina le facce dalla più lontana alla più vicina
  //   3. Disegna ogni faccia con riempimento semi-trasparente
  //   4. Aggiunge bordo luminoso

  function drawPyramidLevels() {
    if (scene.ringsCache.length < PYRAMID.ringsCount + 1) return;

    // Costruisci array di tutte le facce con la loro profondità
    var faces = [];

    for (var lvl = 0; lvl < PYRAMID.levelsCount; lvl++) {
      var ringTop = scene.ringsCache[lvl];
      var ringBot = scene.ringsCache[lvl + 1];

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

    // Ordina: prima le facce più lontane (depth maggiore)
    faces.sort(function (a, b) { return b.depth - a.depth; });

    // Disegna in ordine
    for (var i = 0; i < faces.length; i++) {
      drawPyramidFace(faces[i]);
    }
  }

  // ------------------------------------------------------------
  // 18.1 · Disegno di una singola faccia
  // ------------------------------------------------------------

  function drawPyramidFace(face) {
    var cfg = face.config;
    var isSelected = selection.level === face.level;
    var isHovered = selection.hoveredLevel === face.level;

    // Calcolo alpha in base allo stato
    var baseAlpha, strokeAlpha, glowBlur, lineWidth;

    if (isSelected) {
      baseAlpha = 0.38;
      strokeAlpha = 1.0;
      glowBlur = 18;
      lineWidth = 2.2;
    } else if (isHovered) {
      baseAlpha = 0.22;
      strokeAlpha = 0.85;
      glowBlur = 10;
      lineWidth = 1.6;
    } else {
      baseAlpha = 0.10;
      strokeAlpha = 0.42;
      glowBlur = 0;
      lineWidth = 0.9;
    }

    // Pulsazione per selezione
    if (isSelected && !reducedMotion()) {
      var pulse = 0.12 + 0.08 * Math.sin(engine.elapsedTime * 4);
      baseAlpha += pulse;
    }

    // === Riempimento faccia ===
    var fillGrd = ctx.createLinearGradient(
      face.pts[0].x, face.pts[0].y,
      face.pts[2].x, face.pts[2].y
    );
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

    // === Griglia blueprint sulla faccia (se attiva) ===
    if (selection.showGrid && (isSelected || isHovered)) {
      drawBlueprintGridOnFace(face, cfg, strokeAlpha * 0.4);
    }

    // === Bordo faccia ===
    if (glowBlur > 0) {
      ctx.shadowColor = cfg.color;
      ctx.shadowBlur = glowBlur;
    }
    ctx.strokeStyle = hexToRgba(cfg.color, strokeAlpha);
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ------------------------------------------------------------
  // 18.2 · Griglia blueprint su una faccia
  // ------------------------------------------------------------
  //
  // La griglia blueprint simula il "wireframe tecnico" delle facce,
  // aggiungendo righe diagonali che suggeriscono la struttura dei
  // pannelli modulari.

  function drawBlueprintGridOnFace(face, cfg, alpha) {
    var p0 = face.pts[0];
    var p1 = face.pts[1];
    var p2 = face.pts[2];
    var p3 = face.pts[3];

    ctx.strokeStyle = hexToRgba(cfg.color, alpha);
    ctx.lineWidth = 0.5;

    // Linee verticali (2 per lato)
    for (var i = 1; i <= 2; i++) {
      var t = i / 3;
      var xa = lerp(p0.x, p1.x, t);
      var ya = lerp(p0.y, p1.y, t);
      var xb = lerp(p3.x, p2.x, t);
      var yb = lerp(p3.y, p2.y, t);

      ctx.beginPath();
      ctx.moveTo(xa, ya);
      ctx.lineTo(xb, yb);
      ctx.stroke();
    }

    // Linee orizzontali (1 per livello)
    for (var j = 1; j <= 1; j++) {
      var tj = j / 2;
      var xc = lerp(p0.x, p3.x, tj);
      var yc = lerp(p0.y, p3.y, tj);
      var xd = lerp(p1.x, p2.x, tj);
      var yd = lerp(p1.y, p2.y, tj);

      ctx.beginPath();
      ctx.moveTo(xc, yc);
      ctx.lineTo(xd, yd);
      ctx.stroke();
    }
  }

  // ============================================================
  // SEZIONE 19 · RENDERING DEL SOMMET (tetto superiore)
  // ============================================================

  function drawPyramidTopFace() {
    var topRing = scene.ringsCache[PYRAMID.ringsCount];
    if (!topRing) return;

    var cfg = LEVELS_CONFIG[3];
    var isSelected = selection.level === 3;
    var isHovered = selection.hoveredLevel === 3;

    var alpha = isSelected ? 0.42 : (isHovered ? 0.22 : 0.08);
    var strokeAlpha = isSelected ? 1.0 : (isHovered ? 0.7 : 0.35);

    // Riempimento
    ctx.fillStyle = hexToRgba(cfg.color, alpha);
    ctx.beginPath();
    ctx.moveTo(topRing[0].x, topRing[0].y);
    for (var i = 1; i < 4; i++) ctx.lineTo(topRing[i].x, topRing[i].y);
    ctx.closePath();
    ctx.fill();

    // Bordo con glow
    if (isSelected || isHovered) {
      ctx.shadowColor = cfg.color;
      ctx.shadowBlur = isSelected ? 16 : 8;
    }
    ctx.strokeStyle = hexToRgba(cfg.color, strokeAlpha);
    ctx.lineWidth = isSelected ? 2.2 : 1.2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Croce centrale sul tetto (simbolo dell'Occhio di Horus)
    var cx = 0, cy = 0;
    for (var k = 0; k < 4; k++) { cx += topRing[k].x; cy += topRing[k].y; }
    cx /= 4; cy /= 4;

    var crossSize = isSelected ? 14 : 8;
    ctx.strokeStyle = hexToRgba(cfg.color, strokeAlpha);
    ctx.lineWidth = isSelected ? 2 : 1;
    if (isSelected) {
      ctx.shadowColor = cfg.color;
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.moveTo(cx - crossSize, cy);
    ctx.lineTo(cx + crossSize, cy);
    ctx.moveTo(cx, cy - crossSize);
    ctx.lineTo(cx, cy + crossSize);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Cerchio orbitale intorno al centro
    if (isSelected || isHovered) {
      ctx.strokeStyle = hexToRgba(cfg.color, strokeAlpha * 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, crossSize * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ============================================================
  // SEZIONE 20 · RENDERING DEI VERTICI (angoli della piramide)
  // ============================================================
  //
  // Ogni vertice degli anelli è marcato con un piccolo punto
  // luminoso per enfatizzare la struttura geometrica.

  function drawPyramidVertices() {
    for (var lvl = 0; lvl < scene.ringsCache.length; lvl++) {
      var ring = scene.ringsCache[lvl];
      var cfg = LEVELS_CONFIG[Math.min(lvl, 3)];

      for (var side = 0; side < ring.length; side++) {
        var pt = ring[side];
        var isLevelActive = (selection.level === lvl - 1) || (selection.level === lvl);
        var size = isLevelActive ? 3.2 : 1.8;
        var alpha = isLevelActive ? 0.9 : 0.5;

        ctx.fillStyle = hexToRgba(cfg.color, alpha);
        if (isLevelActive) {
          ctx.shadowColor = cfg.color;
          ctx.shadowBlur = 8;
        }
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  // ============================================================
  // SEZIONE 21 · RENDERING DELLE PARTICELLE ENERGETICHE
  // ============================================================
  //
  // Le particelle energetiche sono renderizzate come piccoli
  // cerchi luminosi con scia, lungo i 4 angoli della piramide.

  function drawEnergyParticles() {
    for (var i = 0; i < scene.energyParticles.length; i++) {
      var p = scene.energyParticles[i];
      var ringTop = scene.ringsCache[p.level];
      var ringBot = scene.ringsCache[p.level + 1];

      if (!ringTop || !ringBot) continue;

      // Posizione lungo il bordo specifico
      var top = ringTop[p.corner];
      var bot = ringBot[p.corner];

      var x = lerp(bot.x, top.x, p.t);
      var y = lerp(bot.y, top.y, p.t);

      var alpha = p.currentPulse * 0.9;
      var size = p.size * (0.8 + p.currentPulse * 0.4);

      // Glow
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = hexToRgba(p.color, alpha);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();

      // Scia (linea verticale breve)
      ctx.shadowBlur = 0;
      ctx.strokeStyle = hexToRgba(p.color, alpha * 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 8);
      ctx.stroke();
    }
  }

  // ============================================================
  // SEZIONE 22 · RENDERING DELLE PARTICELLE DI DATI
  // ============================================================

  function drawDataParticles() {
    for (var i = 0; i < scene.dataParticles.length; i++) {
      var p = scene.dataParticles[i];
      var ringTop = scene.ringsCache[p.level];
      var ringBot = scene.ringsCache[p.level + 1];

      if (!ringTop || !ringBot) continue;

      var top = ringTop[p.corner];
      var bot = ringBot[p.corner];

      var x = lerp(top.x, bot.x, p.t);
      var y = lerp(top.y, bot.y, p.t);

      var alpha = p.currentBlink * 0.8;
      var size = p.size;

      // Blink bianco quando appare
      var col = p.currentBlink > 0.9 ? PALETTE.whitePure : p.color;

      ctx.shadowColor = PALETTE.cyberCore;
      ctx.shadowBlur = 6;
      ctx.fillStyle = hexToRgba(col, alpha);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // ============================================================
  // SEZIONE 23 · RENDERING DEGLI SKIDS
  // ============================================================
  //
  // Ogni skid è renderizzato come:
  //   1. Scia (trail) sfumata
  //   2. Corpo volumetrico (cuboide in prospettiva)
  //   3. Glow del colore del tipo
  //   4. Etichetta (se hover o selected)

  function drawSkids() {
    // Ordina per profondità (più lontani prima)
    var sorted = scene.skids.slice().sort(function (a, b) {
      return (b.pz || 0) - (a.pz || 0);
    });

    for (var i = 0; i < sorted.length; i++) {
      drawSkid(sorted[i]);
    }
  }

  function drawSkid(skid) {
    if (!skid.px || !skid.py) return;

    var type = skid.type;
    var isActive = skid.hover || skid.selected || (selection.level === skid.level);

    // === Scia ===
    if (skid.trail.length > 1) {
      for (var t = 0; t < skid.trail.length - 1; t++) {
        var p1 = skid.trail[t];
        var p2 = skid.trail[t + 1];
        var trailAlpha = (t / skid.trail.length) * 0.35;
        ctx.strokeStyle = hexToRgba(type.color, trailAlpha);
        ctx.lineWidth = (t / skid.trail.length) * 2;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    // === Corpo volumetrico ===
    var size = type.size * 120 * (skid.projScale || 1);
    if (isActive) size *= 1.4;

    // Glow
    ctx.shadowColor = type.color;
    ctx.shadowBlur = isActive ? 14 : 6;

    // Cuboide in prospettiva isometrica (semplificato)
    var x = skid.px;
    var y = skid.py;

    ctx.fillStyle = hexToRgba(type.color, 0.85);
    ctx.strokeStyle = type.color;
    ctx.lineWidth = isActive ? 1.5 : 0.8;

    // Faccia frontale
    ctx.beginPath();
    ctx.moveTo(x - size / 2, y - size / 2);
    ctx.lineTo(x + size / 2, y - size / 2);
    ctx.lineTo(x + size / 2, y + size / 2);
    ctx.lineTo(x - size / 2, y + size / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Faccia superiore (leggera prospettiva)
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

    // === Simbolo del tipo all'interno ===
    if (isActive) {
      ctx.fillStyle = PALETTE.whitePure;
      ctx.font = 'bold ' + Math.max(8, size * 0.6) + 'px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(type.icon, x, y);
    }

    // === Etichetta on hover ===
    if (skid.hover && selection.showLabels) {
      drawSkidLabel(skid, x, y - size);
    }
  }

  function drawSkidLabel(skid, x, y) {
    var text = skid.type.label + ' · L' + (skid.level + 1);
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    var textWidth = ctx.measureText(text).width;

    var padding = 6;
    var boxW = textWidth + padding * 2;
    var boxH = 18;

    // Sfondo
    ctx.fillStyle = 'rgba(5, 10, 13, 0.95)';
    ctx.strokeStyle = skid.type.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x - boxW / 2, y - boxH, boxW, boxH, 4);
    } else {
      ctx.rect(x - boxW / 2, y - boxH, boxW, boxH);
    }
    ctx.fill();
    ctx.stroke();

    // Testo
    ctx.fillStyle = skid.type.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - boxH / 2);

    // Connettore verso lo skid
    ctx.strokeStyle = skid.type.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 2);
    ctx.stroke();
  }

  // ============================================================
  // SEZIONE 24 · RENDERING DELLE ANNOTAZIONI ARCHITETTONICHE
  // ============================================================
  //
  // Le annotazioni collegano i livelli della piramide a etichette
  // esterne con metriche e descrizioni. Sono disegnate come linee
  // guida che partono dal centro del livello e si estendono
  // orizzontalmente verso l'esterno.
  //
  // Vengono mostrate solo per il livello selezionato o hovered
  // per evitare disordine visivo.

  function drawAnnotations() {
    if (!selection.showLabels) return;

    var activeLevel = selection.level >= 0 ? selection.level : selection.hoveredLevel;
    if (activeLevel < 0) return;

    var cfg = LEVELS_CONFIG[activeLevel];
    var annotation = scene.annotations[activeLevel];
    if (!annotation) return;

    // Centro del livello (media dei 4 vertici degli anelli top e bot)
    var ringTop = scene.ringsCache[activeLevel];
    var ringBot = scene.ringsCache[activeLevel + 1];
    if (!ringTop || !ringBot) return;

    var cx = 0, cy = 0;
    for (var i = 0; i < 4; i++) {
      cx += ringTop[i].x + ringBot[i].x;
      cy += ringTop[i].y + ringBot[i].y;
    }
    cx /= 8;
    cy /= 8;

    // Posizione etichetta (fuori dalla piramide)
    var baseScale = Math.min(engine.W, engine.H) / 3.8 * camera.zoom;
    var lx = engine.W / 2 + (annotation.side === 'left' ? -1 : 1) * baseScale * 0.95;
    var ly = cy + annotation.offsetY * baseScale * 0.5;

    // Linea guida dal centro del livello all'etichetta
    ctx.strokeStyle = hexToRgba(cfg.color, 0.6);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    ctx.setLineDash([]);

    // Punto sul centro del livello
    ctx.fillStyle = cfg.color;
    ctx.shadowColor = cfg.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Etichetta
    drawAnnotationLabel(annotation, lx, ly, cfg, annotation.side);
  }

  function drawAnnotationLabel(annotation, x, y, cfg, side) {
    var textAlign = side === 'left' ? 'right' : 'left';
    var boxPadding = 10;
    var labelX = side === 'left' ? x - 8 : x + 8;

    ctx.textAlign = textAlign;
    ctx.textBaseline = 'middle';

    // Label principale
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    var labelWidth = ctx.measureText(annotation.label).width;

    // Subtitle
    ctx.font = '10px "Plus Jakarta Sans", sans-serif';
    var subtitleWidth = ctx.measureText(annotation.subtitle).width;

    // Metric
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    var metricWidth = ctx.measureText(annotation.metric).width;

    var maxWidth = Math.max(labelWidth, subtitleWidth, metricWidth);
    var boxW = maxWidth + boxPadding * 2;
    var boxH = 62;
    var boxX = side === 'left' ? labelX - boxW : labelX;

    // Sfondo
    ctx.fillStyle = 'rgba(5, 10, 13, 0.92)';
    ctx.strokeStyle = hexToRgba(cfg.color, 0.7);
    ctx.lineWidth = 1.2;
    if (ctx.roundRect) {
      ctx.roundRect(boxX, y - boxH / 2, boxW, boxH, 8);
    } else {
      ctx.rect(boxX, y - boxH / 2, boxW, boxH);
    }
    ctx.fill();
    ctx.stroke();

    // Bordo colorato sul lato verso la piramide
    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (side === 'left') {
      ctx.moveTo(boxX + boxW, y - boxH / 2 + 4);
      ctx.lineTo(boxX + boxW, y + boxH / 2 - 4);
    } else {
      ctx.moveTo(boxX, y - boxH / 2 + 4);
      ctx.lineTo(boxX, y + boxH / 2 - 4);
    }
    ctx.stroke();

    // Testo: label
    ctx.fillStyle = cfg.color;
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = textAlign;
    ctx.fillText(annotation.label, labelX, y - 18);

    // Testo: subtitle
    ctx.fillStyle = PALETTE.slateLight;
    ctx.font = '10px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(annotation.subtitle, labelX, y + 2);

    // Testo: metric
    ctx.fillStyle = PALETTE.whiteSoft;
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillText(annotation.metric, labelX, y + 20);
  }

  // ============================================================
  // SEZIONE 25 · RENDERING DELLA SCANLINE ORIZZONTALE
  // ============================================================
  //
  // Sottile effetto "scanner telemetrico" che attraversa
  // verticalmente il canvas, per aggiungere movimento.

  function drawScanLine(dt) {
    if (!selection.showTelemetry) return;

    scene.scanLineY += dt * 80;
    if (scene.scanLineY > engine.H + 50) {
      scene.scanLineY = -50;
    }

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

  // ============================================================
  // SEZIONE 26 · AGGIORNAMENTO COMPLETO DELLO STATO DI SCENA
  // ============================================================

  function updateScene(dt) {
    updateRingsCache();
    updateSkids(dt);
    updateParticles(dt);
  }

  // ============================================================
  // FINE DELLA PARTE 2
  // La parte 3 conterrà: HUD/telemetria, bussola, gestione input,
  // animazione principale, API pubblica.
  // ============================================================

  // Esporta gli oggetti di scena e le funzioni di update per la parte 3
  window.__KMEH_SCENE__ = {
    scene: scene,
    initializeScene: initializeScene,
    updateScene: updateScene,
    drawPyramidLevels: drawPyramidLevels,
    drawPyramidTopFace: drawPyramidTopFace,
    drawPyramidVertices: drawPyramidVertices,
    drawEnergyParticles: drawEnergyParticles,
    drawDataParticles: drawDataParticles,
    drawSkids: drawSkids,
    drawAnnotations: drawAnnotations,
    drawScanLine: drawScanLine,
    rebuildSkids: rebuildSkids
  };

  // ============================================================
  // SEZIONE 27 · HUD TELEMETRIA
  // ============================================================
  //
  // L'HUD mostra in overlay sul canvas:
  //   - FPS corrente
  //   - Coordinate camera (rotation, tilt, zoom)
  //   - Livello attivo
  //   - Numero skid visibili
  //   - Stato docking
  //   - Timestamp UTC (simulato)
  //
  // Viene disegnato nell'angolo in alto a sinistra del canvas.

  var telemetry = {
    visible: true,
    padding: 14,
    lineHeight: 15,
    fontSize: 10,
    font: '10px "JetBrains Mono", monospace',
    accentFont: 'bold 11px "JetBrains Mono", monospace',
    lastUpdate: 0,
    updateInterval: 200 // ms
  };

  function drawTelemetryHUD() {
    if (!selection.showTelemetry) return;

    var x = telemetry.padding;
    var y = telemetry.padding;
    var now = performance.now();

    // Aggiorna valori solo ogni 200ms per ridurre flicker
    if (now - telemetry.lastUpdate > telemetry.updateInterval) {
      telemetry.lastUpdate = now;
    }

    // Sfondo semi-trasparente
    var boxW = 210;
    var boxH = 148;
    ctx.fillStyle = 'rgba(5, 10, 13, 0.82)';
    ctx.strokeStyle = 'rgba(0, 255, 163, 0.3)';
    ctx.lineWidth = 1;
    if (ctx.roundRect) {
      ctx.roundRect(x, y, boxW, boxH, 8);
    } else {
      ctx.rect(x, y, boxW, boxH);
    }
    ctx.fill();
    ctx.stroke();

    // Titolo
    var lx = x + 12;
    var ly = y + 20;

    ctx.fillStyle = PALETTE.cyberCore;
    ctx.font = telemetry.accentFont;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('▸ K-MEH-20 LIVE', lx, ly);

    // Separatore
    ctx.strokeStyle = 'rgba(0, 255, 163, 0.2)';
    ctx.beginPath();
    ctx.moveTo(lx, ly + 8);
    ctx.lineTo(x + boxW - 12, ly + 8);
    ctx.stroke();

    ly += telemetry.lineHeight + 8;
    ctx.font = telemetry.font;

    // L1: FPS
    var fpsColor = engine.fps >= 55 ? PALETTE.cyberCore :
                   engine.fps >= 40 ? PALETTE.kemetBright :
                   PALETTE.danger;
    drawHudLine('FPS', engine.fps.toFixed(0), lx, ly, fpsColor);
    ly += telemetry.lineHeight;

    // L2: Rotation
    var rotDeg = ((camera.rotation * 180 / Math.PI) % 360).toFixed(1);
    drawHudLine('Azimuth', rotDeg + '°', lx, ly, PALETTE.whiteSoft);
    ly += telemetry.lineHeight;

    // L3: Tilt
    var tiltDeg = (camera.tilt * 180 / Math.PI).toFixed(1);
    drawHudLine('Tilt', tiltDeg + '°', lx, ly, PALETTE.whiteSoft);
    ly += telemetry.lineHeight;

    // L4: Zoom
    drawHudLine('Zoom', camera.zoom.toFixed(2) + '×', lx, ly, PALETTE.whiteSoft);
    ly += telemetry.lineHeight;

    // L5: Livello attivo
    var activeLvl = selection.level >= 0 ? selection.level : selection.hoveredLevel;
    var activeLvlStr = activeLvl >= 0 ? 'N' + (activeLvl + 1) : '—';
    var activeLvlColor = activeLvl >= 0 ? LEVELS_CONFIG[activeLvl].color : PALETTE.slateMid;
    drawHudLine('Niveau', activeLvlStr, lx, ly, activeLvlColor);
    ly += telemetry.lineHeight;

    // L6: Skids visibili
    var visSkids = 0;
    for (var i = 0; i < scene.skids.length; i++) {
      var sk = scene.skids[i];
      if (sk.pz !== undefined && sk.pz < 1.5) visSkids++;
    }
    drawHudLine('Skids', visSkids + '/' + scene.skids.length, lx, ly, PALETTE.kemetBright);
    ly += telemetry.lineHeight;

    // L7: Particelle energia
    drawHudLine('⚡ Énergie', String(scene.energyParticles.length), lx, ly, PALETTE.kemetBright);

    // Badge OMPIC in basso a destra dell'HUD
    var badgeY = y + boxH - 22;
    ctx.fillStyle = 'rgba(197, 160, 89, 0.15)';
    ctx.strokeStyle = 'rgba(197, 160, 89, 0.5)';
    ctx.lineWidth = 1;
    var badgeX = x + 12;
    var badgeW = 90;
    var badgeH = 16;
    if (ctx.roundRect) {
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
    } else {
      ctx.rect(badgeX, badgeY, badgeW, badgeH);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.kemetBright;
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OMPIC · PENDING', badgeX + badgeW / 2, badgeY + badgeH / 2);
  }

  function drawHudLine(label, value, x, y, valueColor) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PALETTE.slateMid;
    ctx.font = telemetry.font;
    ctx.fillText(label + ':', x, y);

    ctx.fillStyle = valueColor;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText(value, x + 72, y);
  }

  // ============================================================
  // SEZIONE 28 · BUSSOLA
  // ============================================================
  //
  // Bussola in basso a destra che mostra l'orientamento della camera
  // rispetto ai 4 punti cardinali cyber (Nord = cyber, Sud = kemet,
  // Est = data, Ovest = energy).

  var compass = {
    size: 54,
    padding: 14,
    labels: ['N', 'E', 'S', 'W'],
    colors: [PALETTE.cyberCore, PALETTE.cyberMid, PALETTE.kemetBright, PALETTE.kemetMid]
  };

  function drawCompass() {
    if (!selection.showCompass) return;

    var cx = engine.W - compass.padding - compass.size / 2;
    var cy = engine.H - compass.padding - compass.size / 2;
    var r = compass.size / 2;

    // Cerchio esterno
    ctx.fillStyle = 'rgba(5, 10, 13, 0.82)';
    ctx.strokeStyle = 'rgba(0, 255, 163, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Anello interno
    ctx.strokeStyle = 'rgba(0, 255, 163, 0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // Ago della bussola (ruota con la camera)
    var rot = -camera.rotation;
    for (var i = 0; i < 4; i++) {
      var angle = rot + (i * Math.PI / 2);
      var endR = r * 0.75;
      var ex = cx + Math.cos(angle - Math.PI / 2) * endR;
      var ey = cy + Math.sin(angle - Math.PI / 2) * endR;

      ctx.strokeStyle = compass.colors[i];
      ctx.lineWidth = i === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Etichetta lettera
      var labelR = r * 0.9;
      var lx = cx + Math.cos(angle - Math.PI / 2) * labelR;
      var ly = cy + Math.sin(angle - Math.PI / 2) * labelR;

      ctx.fillStyle = compass.colors[i];
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(compass.labels[i], lx, ly);
    }

    // Punto centrale
    ctx.fillStyle = PALETTE.cyberCore;
    ctx.shadowColor = PALETTE.cyberCore;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ============================================================
  // SEZIONE 29 · GESTIONE INPUT COMPLETA
  // ============================================================
  //
  // Supporta:
  //   - Mouse: drag orbitale, click su livello, hover, wheel zoom
  //   - Touch: drag orbitale, tap su livello, pinch zoom
  //   - Tastiera: frecce per rotazione, + / - per zoom, 1-4 per livelli,
  //     R per reset, M per manifeste, G per griglia, C per bussola
  //
  // Tutti gli input sono throttled tramite requestAnimationFrame.

  // 29.1 · Hit-test livello (basato su y proiettata)
  function hitTestLevel(clientX, clientY) {
    if (!engine.rect) engine.rect = canvas.getBoundingClientRect();
    var mx = clientX - engine.rect.left;
    var my = clientY - engine.rect.top;

    // Calcola la bounding box della piramide proiettata
    if (scene.ringsCache.length === 0) return -1;

    var baseRing = scene.ringsCache[0];
    var topRing = scene.ringsCache[PYRAMID.ringsCount];
    if (!baseRing || !topRing) return -1;

    // Trova la y min e max della piramide
    var minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < 4; i++) {
      if (baseRing[i].y < minY) minY = baseRing[i].y;
      if (baseRing[i].y > maxY) maxY = baseRing[i].y;
      if (topRing[i].y < minY) minY = topRing[i].y;
      if (topRing[i].y > maxY) maxY = topRing[i].y;
    }

    if (my < minY || my > maxY) return -1;

    // Mappa y lineare a livello (0 = top, 1 = base)
    var relY = (my - minY) / (maxY - minY);

    // Inverti: top → livello 3, base → livello 0
    if (relY < 0.25) return 3;
    if (relY < 0.50) return 2;
    if (relY < 0.75) return 1;
    return 0;
  }

  // 29.2 · Hit-test skid (basato su distanza proiettata)
  function hitTestSkid(clientX, clientY) {
    if (!engine.rect) engine.rect = canvas.getBoundingClientRect();
    var mx = clientX - engine.rect.left;
    var my = clientY - engine.rect.top;

    var closest = -1;
    var minDist = 22;

    for (var i = 0; i < scene.skids.length; i++) {
      var sk = scene.skids[i];
      if (!sk.px || !sk.py) continue;
      var dx = mx - sk.px;
      var dy = my - sk.py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    return closest;
  }

  // 29.3 · Mouse events
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

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        camera.hasDragged = true;
      }

      camera.targetRotation += dx * 0.012;
      camera.targetTilt = clamp(camera.targetTilt + dy * 0.008, -0.15, 1.32);

      camera.velocity = dx * 0.008;
      camera.lastX = e.clientX;
      camera.lastY = e.clientY;
    } else {
      // Hover detection
      var lvl = hitTestLevel(e.clientX, e.clientY);
      if (lvl !== selection.hoveredLevel) {
        selection.hoveredLevel = lvl;
      }
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

    // Click (nessun drag) → selezione
    if (!camera.hasDragged && dragDuration < 500) {
      var skidIdx = hitTestSkid(e.clientX, e.clientY);
      if (skidIdx >= 0) {
        selectSkid(skidIdx);
      } else {
        var lvl = hitTestLevel(e.clientX, e.clientY);
        if (lvl >= 0) {
          selectLevel(lvl);
        }
      }
    } else {
      // Riprende auto-rotate dopo 4s di inattività
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

  // 29.4 · Wheel zoom
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var delta = e.deltaY > 0 ? -0.05 : 0.05;
    camera.targetZoom = clamp(camera.targetZoom + delta, 0.6, 1.8);
  }, { passive: false });

  // 29.5 · Touch events
  var touchState = {
    active: false,
    pinchStartDistance: 0,
    pinchStartZoom: 1,
    touches: 0
  };

  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      camera.isDragging = true;
      camera.hasDragged = false;
      camera.lastX = e.touches[0].clientX;
      camera.lastY = e.touches[0].clientY;
      camera.dragStartTime = Date.now();
      camera.autoRotate = false;
      touchState.active = true;
      touchState.touches = 1;
    } else if (e.touches.length === 2) {
      touchState.touches = 2;
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

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        camera.hasDragged = true;
      }

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
      touchState.touches = 0;
      touchState.pinchStartDistance = 0;

      var dragDuration = Date.now() - camera.dragStartTime;

      if (!camera.hasDragged && dragDuration < 500 && e.changedTouches[0]) {
        var t = e.changedTouches[0];
        var skidIdx = hitTestSkid(t.clientX, t.clientY);
        if (skidIdx >= 0) {
          selectSkid(skidIdx);
        } else {
          var lvl = hitTestLevel(t.clientX, t.clientY);
          if (lvl >= 0) selectLevel(lvl);
        }
      } else {
        setTimeout(function () {
          if (!camera.isDragging) camera.autoRotate = true;
        }, 4000);
      }
    } else if (e.touches.length === 1) {
      // Ripasso da 2 a 1 dito
      camera.lastX = e.touches[0].clientX;
      camera.lastY = e.touches[0].clientY;
      touchState.touches = 1;
      touchState.pinchStartDistance = 0;
    }
  }, { passive: true });

  // 29.6 · Keyboard shortcuts
  window.addEventListener('keydown', function (e) {
    // Ignora se focus su input/textarea
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case 'ArrowLeft':
        camera.targetRotation -= 0.15;
        camera.autoRotate = false;
        break;
      case 'ArrowRight':
        camera.targetRotation += 0.15;
        camera.autoRotate = false;
        break;
      case 'ArrowUp':
        camera.targetTilt = clamp(camera.targetTilt - 0.08, -0.15, 1.32);
        break;
      case 'ArrowDown':
        camera.targetTilt = clamp(camera.targetTilt + 0.08, -0.15, 1.32);
        break;
      case '+':
      case '=':
        camera.targetZoom = clamp(camera.targetZoom + 0.1, 0.6, 1.8);
        break;
      case '-':
      case '_':
        camera.targetZoom = clamp(camera.targetZoom - 0.1, 0.6, 1.8);
        break;
      case '1': selectLevel(0); break;
      case '2': selectLevel(1); break;
      case '3': selectLevel(2); break;
      case '4': selectLevel(3); break;
      case 'r':
      case 'R':
        resetCamera();
        break;
      case 'g':
      case 'G':
        selection.showGrid = !selection.showGrid;
        break;
      case 'c':
      case 'C':
        selection.showCompass = !selection.showCompass;
        break;
      case 't':
      case 'T':
        selection.showTelemetry = !selection.showTelemetry;
        break;
      case 'Escape':
        selection.level = -1;
        selection.levelTarget = -1;
        selection.skid = -1;
        break;
    }
  });

  // 29.7 · Selezione livello
  function selectLevel(idx) {
    if (idx < 0 || idx >= PYRAMID.levelsCount) return;

    // Toggle: se già selezionato, deseleziona
    if (selection.level === idx) {
      selection.level = -1;
      selection.levelTarget = -1;
    } else {
      selection.level = idx;
      selection.levelTarget = idx;
    }

    // Callback esterna per HTML
    if (typeof window.onKmehLevelSelect === 'function') {
      try {
        window.onKmehLevelSelect(selection.level);
      } catch (err) {
        console.warn('[K-MEH-20] onKmehLevelSelect callback error:', err);
      }
    }
  }

  // 29.8 · Selezione skid
  function selectSkid(idx) {
    if (idx < 0) {
      selection.skid = -1;
      scene.skids.forEach(function (s) { s.selected = false; });
      return;
    }
    selection.skid = idx;
    scene.skids.forEach(function (s, i) { s.selected = (i === idx); });

    if (typeof window.onKmehSkidSelect === 'function') {
      try {
        window.onKmehSkidSelect(idx, scene.skids[idx]);
      } catch (err) {
        console.warn('[K-MEH-20] onKmehSkidSelect callback error:', err);
      }
    }
  }

  // 29.9 · Reset camera
  function resetCamera() {
    camera.targetRotation = 0.6;
    camera.targetTilt = 0.32;
    camera.targetZoom = 1.0;
    camera.autoRotate = true;
    camera.velocity = 0;
  }

  // ============================================================
  // SEZIONE 30 · LOOP ANIMAZIONE PRINCIPALE
  // ============================================================
  //
  // Il loop viene eseguito tramite requestAnimationFrame.
  // Ordine delle operazioni per frame:
  //   1. Calcolo deltaTime / FPS
  //   2. Aggiornamento camera (lerp verso target)
  //   3. Aggiornamento scena (ringsCache, skids, particelle)
  //   4. Clear canvas
  //   5. Sfondo radiale
  //   6. Disegno piramide (facce, top face, vertici)
  //   7. Disegno particelle energia + dati
  //   8. Disegno skids
  //   9. Disegno annotazioni
  //  10. Disegno scan line
  //  11. Disegno HUD + bussola
  //  12. requestAnimationFrame(loop)

  function animate(now) {
    engine.renderRequestId = requestAnimationFrame(animate);

    if (engine.paused) return;

    // Delta time (clampato a 50ms per evitare salti su tab riattivato)
    if (!engine.lastFrameTime) {
      engine.lastFrameTime = now;
      return;
    }
    var rawDt = (now - engine.lastFrameTime) / 1000;
    engine.deltaTime = Math.min(rawDt, 0.05);
    engine.lastFrameTime = now;
    engine.elapsedTime += engine.deltaTime;

    // FPS counter (media su 500ms)
    engine.fpsAccumulator += engine.deltaTime;
    engine.fpsFrames++;
    if (engine.fpsAccumulator >= 0.5) {
      engine.fps = engine.fpsFrames / engine.fpsAccumulator;
      engine.fpsAccumulator = 0;
      engine.fpsFrames = 0;
    }

    var dt = engine.deltaTime;

    // Camera auto-rotate
    if (camera.autoRotate && !reducedMotion()) {
      camera.targetRotation += camera.autoRotateSpeed * dt;
    }

    // Smooth camera interpolation
    camera.rotation += (camera.targetRotation - camera.rotation) * 0.12;
    camera.rotation += camera.velocity;
    camera.velocity *= camera.velocityDamping;

    camera.tilt += (camera.targetTilt - camera.tilt) * 0.10;
    camera.zoom += (camera.targetZoom - camera.zoom) * 0.12;

    // Aggiorna scena
    updateScene(dt);

    // ============================================================
    // RENDERING
    // ============================================================

    clearCanvas();

    // Sfondo radiale
    drawRadialBackground(
      engine.W / 2,
      engine.H / 2,
      Math.min(engine.W, engine.H) * 0.7,
      'rgba(0, 255, 163, 0.04)',
      'rgba(0, 0, 0, 0)'
    );

    // Livelli piramide
    drawPyramidLevels();

    // Top face
    drawPyramidTopFace();

    // Vertici (sopra i livelli, sotto particelle)
    drawPyramidVertices();

    // Particelle dati (dietro agli skids)
    drawDataParticles();

    // Skids
    drawSkids();

    // Particelle energia (sopra agli skids per glow)
    drawEnergyParticles();

    // Annotazioni (solo se livello selezionato)
    drawAnnotations();

    // Scan line
    drawScanLine(dt);

    // HUD + bussola
    drawTelemetryHUD();
    drawCompass();
  }

  // ============================================================
  // SEZIONE 31 · RESIZE E ADATTAMENTO RESPONSIVE
  // ============================================================

  function resizeCanvas() {
    if (!canvas.parentElement) return;

    var rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Evita resize continui da scroll mobile (blocca se larghezza invariata)
    if (Math.abs(engine.W - rect.width) < 20 && engine.W > 0) return;

    engine.W = rect.width;
    engine.H = rect.height;
    engine.DPR = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = rect.width * engine.DPR;
    canvas.height = rect.height * engine.DPR;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    ctx.setTransform(engine.DPR, 0, 0, engine.DPR, 0, 0);

    engine.rect = canvas.getBoundingClientRect();

    // Ridisegna immediatamente
    if (engine.initialized) {
      updateRingsCache();
    }
  }

  // ============================================================
  // SEZIONE 32 · API PUBBLICA
  // ============================================================
  //
  // Funzioni esposte su window per interazione dall'esterno
  // (HTML, altri script).

  // 32.1 · Selezione livello (già definita)
  window.kmehPyramidSelectLevel = function (idx) {
    selectLevel(idx);
  };

  // 32.2 · Ottieni stato corrente
  window.kmehPyramidGetState = function () {
    return {
      level: selection.level,
      hoveredLevel: selection.hoveredLevel,
      skid: selection.skid,
      hoveredSkid: selection.hoveredSkid,
      camera: {
        rotation: camera.rotation,
        tilt: camera.tilt,
        zoom: camera.zoom
      },
      fps: engine.fps,
      paused: engine.paused
    };
  };

  // 32.3 · Reset completo
  window.kmehPyramidReset = function () {
    resetCamera();
    selection.level = -1;
    selection.levelTarget = -1;
    selection.skid = -1;
    selection.hoveredLevel = -1;
    selection.hoveredSkid = -1;
    scene.skids.forEach(function (s) { s.selected = false; });
  };

  // 32.4 · Toggle griglia
  window.kmehPyramidToggleGrid = function () {
    selection.showGrid = !selection.showGrid;
    return selection.showGrid;
  };

  // 32.5 · Toggle HUD
  window.kmehPyramidToggleTelemetry = function () {
    selection.showTelemetry = !selection.showTelemetry;
    return selection.showTelemetry;
  };

  // 32.6 · Toggle bussola
  window.kmehPyramidToggleCompass = function () {
    selection.showCompass = !selection.showCompass;
    return selection.showCompass;
  };

  // 32.7 · Toggle etichette
  window.kmehPyramidToggleLabels = function () {
    selection.showLabels = !selection.showLabels;
    return selection.showLabels;
  };

  // 32.8 · Zoom programmatico
  window.kmehPyramidZoom = function (delta) {
    camera.targetZoom = clamp(camera.targetZoom + delta, 0.6, 1.8);
    return camera.targetZoom;
  };

  // 32.9 · Rotazione programmatica
  window.kmehPyramidRotate = function (radians) {
    camera.targetRotation += radians;
    camera.autoRotate = false;
    setTimeout(function () {
      if (!camera.isDragging) camera.autoRotate = true;
    }, 4000);
  };

  // 32.10 · Info pubblica (per debug)
  window.kmehPyramidInfo = function () {
    return {
      version: '3.0',
      brand: 'Industrial Illusion SARL',
      product: 'K-MEH-20 · Kemet Modular Eco Hub 20',
      status: 'Technologie propriétaire · En développement · OMPIC en préparation',
      levels: LEVELS_CONFIG.map(function (l) {
        return {
          label: l.label,
          subtitle: l.subtitle,
          area: l.area,
          function: l.function
        };
      }),
      pyramid: {
        baseMeters: PYRAMID.realBase,
        heightMeters: PYRAMID.realHeight,
        surfaceBase: PYRAMID.surfaceBase,
        capacityTonsPerYear: PYRAMID.capacityTons
      },
      skids: {
        total: scene.skids.length,
        byType: {
          matter: scene.skids.filter(function (s) { return s.typeKey === 'MATTER'; }).length,
          data: scene.skids.filter(function (s) { return s.typeKey === 'DATA'; }).length,
          energy: scene.skids.filter(function (s) { return s.typeKey === 'ENERGY'; }).length
        }
      }
    };
  };

  // ============================================================
  // SEZIONE 33 · GESTIONE VISIBILITÀ PAGINA
  // ============================================================
  //
  // Sospende il loop quando la tab è nascosta per risparmiare CPU.

  document.addEventListener('visibilitychange', function () {
    engine.paused = document.hidden;
    if (!document.hidden) {
      engine.lastFrameTime = 0;
    }
  });

  // ============================================================
  // SEZIONE 34 · BOOTSTRAP
  // ============================================================
  //
  // Inizializzazione sequenziale:
  //   1. Resize canvas
  //   2. Generazione scena
  //   3. Avvio loop animazione
  //   4. Listener resize con debounce

  function bootstrap() {
    if (engine.initialized) return;

    resizeCanvas();
    initializeScene();
    updateRingsCache();

    engine.initialized = true;
    engine.lastFrameTime = 0;

    animate(performance.now());

    // Resize listener con debounce
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resizeCanvas();
      }, 150);
    });

    // Listener per il cambio di preferenza reduced motion
    reducedMotionQuery.addEventListener('change', function () {
      // il valore globale `reducedMotion` è già aggiornato dal listener
      // in PARTE 1. Nulla da fare qui se non eventualmente fermare
      // l'auto-rotate.
      if (reducedMotion) {
        camera.autoRotate = false;
      } else {
        camera.autoRotate = true;
      }
    });
  }

  // Avvio: se il DOM è già caricato, esegui subito; altrimenti attendi
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(bootstrap, 50);
    });
  } else {
    setTimeout(bootstrap, 50);
  }

  // Anche dopo il load completo per sicurezza (font caricati)
  window.addEventListener('load', function () {
    if (!engine.initialized) {
      bootstrap();
    } else {
      // Ricalcola dimensioni dopo caricamento font (metriche cambiate)
      setTimeout(resizeCanvas, 100);
    }
  });

  // ============================================================
  // SEZIONE 35 · MANIFESTE ARCHITETTONICO (per HUD esteso)
  // ============================================================
  //
  // Espone i vantaggi architettonici in un formato consumabile
  // dall'HTML per la sezione dedicata.

  window.KMEH_ARCHITECTURAL_MANIFESTO = {
    preamble: 'La pyramide tronquée K-MEH-20 inverse le paradigme industriel de l\'Industrie 4.0 : elle n\'est pas un hangar inerte optimisé pour la machine, mais un organisme cyber-physique structuré pour l\'humain, la matière et l\'énergie.',
    advantages: I.ARCHITECTURAL_ADVANTAGES,
    comparison: [
      {
        aspect: 'Empreinte au sol',
        traditional: 'Hangar linéaire 120m × 80m minimum',
        kmeh: 'Pyramide 56m × 56m · 3 136 m² seulement'
      },
      {
        aspect: 'Volume utile / empreinte',
        traditional: '1.0× (référence)',
        kmeh: '1.7× à volume de production équivalent'
      },
      {
        aspect: 'Convection thermique',
        traditional: 'HVAC forcé permanent',
        kmeh: 'Effet cheminée passif + HVAC résiduel'
      },
      {
        aspect: 'Résilience sismique',
        traditional: 'Structure métallique rigide',
        kmeh: 'Base large = dissipation d\'ondes optimale'
      },
      {
        aspect: 'Modularité',
        traditional: 'Chantier fixe 18-24 mois',
        kmeh: 'Skids pré-assemblés · assemblage < 12 semaines'
      },
      {
        aspect: 'Scalabilité',
        traditional: 'Extension = nouveau hangar',
        kmeh: 'Duplication modulaire à l\'identique'
      }
    ],
    impact: {
      asia: 'Adaptation aux contraintes foncières extrêmes des mégapoles asiatiques (Tokyo, Séoul, Singapour, Jakarta) où le m² industriel dépasse 300 USD/m². La pyramide minimise l\'emprise au sol et maximise la densité fonctionnelle.',
      middleEast: 'Alignement avec les programmes de diversification économique (Vision 2030 Arabie Saoudite, We The UAE 2031) qui cherchent des infrastructures industrielles à faible empreinte carbone et à haute valeur symbolique.',
      africa: 'Modèle exportable vers les zones franches du continent (Maroc, Sénégal, Côte d\'Ivoire, Kenya) qui bénéficient des corridors logistiques en développement.',
      sovereignty: 'Chaque module est conçu pour être assemblé localement à partir de skids pré-testés en usine, garantissant une souveraineté industrielle du pays hôte sans transfert de technologie propriétaire.'
    },
    omicStatus: {
      label: 'OMPIC · En préparation',
      description: 'Technologie propriétaire en phase de développement et de préparation au dépôt auprès de l\'Office Marocain de la Propriété Industrielle et Commerciale.',
      coverage: [
        'Architecture modulaire de la pyramide tronquée',
        'Système de skids cyber-physiques interchangeables',
        'Méthode d\'assemblage Plug & Process',
        'Intégration Maat OS / Maat Data Lake'
      ],
      legal: 'Toute divulgation, reproduction ou exploitation non autorisée est strictement interdite sans NDA préalable signé avec la Direction Générale de Industrial Illusion SARL.'
    }
  };

  // ============================================================
  // FINE DEL MOTORE K-MEH-20 · v3.0
  // ============================================================
  //
  // Riepilogo API pubblica:
  //   kmehPyramidSelectLevel(idx)      → seleziona livello 0-3
  //   kmehPyramidGetState()             → stato completo
  //   kmehPyramidReset()                → reset camera + selezione
  //   kmehPyramidToggleGrid()           → toggle griglia blueprint
  //   kmehPyramidToggleTelemetry()      → toggle HUD
  //   kmehPyramidToggleCompass()        → toggle bussola
  //   kmehPyramidToggleLabels()         → toggle etichette
  //   kmehPyramidZoom(delta)            → zoom programmatico
  //   kmehPyramidRotate(radians)        → rotazione programmatica
  //   kmehPyramidInfo()                 → info completo per debug
  //
  // Callback esterni:
  //   window.onKmehLevelSelect(idx)     → invocato al cambio livello
  //   window.onKmehSkidSelect(idx,skid) → invocato al click su skid
  //
  // Manifesto architettonico:
  //   window.KMEH_ARCHITECTURAL_MANIFESTO
  //
  // ============================================================

})();
