/* ============================================================
   K-MEH-20 PYRAMID ENGINE · Interactive 3D Truncated Pyramid
   Industrial Illusion SARL · v1.0
   Canvas WebGL-free · 4 interattive levels · Touch-ready
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('kmehPyramidCanvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0;

  // Pyramid geometry (normalized, truncated pyramid)
  var BASE_HALF = 1.0;
  var TOP_HALF = 0.58;
  var HEIGHT = 1.5;

  // 4 levels — colors from brand palette
  var LEVELS = [
    { color: '#00FFA3', key: 'base',     name: 'Base · Matière' },
    { color: '#0D9E8E', key: 'centre',   name: 'Centre · Réseau' },
    { color: '#C5A059', key: 'elev',     name: 'Élévation · Calcul' },
    { color: '#E8C86A', key: 'top',      name: 'Sommet · Contrôle' }
  ];

  var state = {
    rotation: 0,
    targetRotation: 0,
    velocity: 0,
    tilt: 0.32,
    targetTilt: 0.32,
    autoRotate: true,
    isDragging: false,
    dragMoved: false,
    lastX: 0,
    lastY: 0,
    hovered: -1,
    selected: -1
  };

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    if (W === 0 || H === 0) return;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  // Half-width of pyramid cross-section at height parameter t (0=base, 1=top)
  function halfWidthAt(t) {
    return BASE_HALF + (TOP_HALF - BASE_HALF) * t;
  }

  // Rotate a 3D point into camera-space
  function rotate3D(x, y, z) {
    var cos = Math.cos(state.rotation);
    var sin = Math.sin(state.rotation);
    var rx = x * cos - z * sin;
    var rz = x * sin + z * cos;

    var cosT = Math.cos(state.tilt);
    var sinT = Math.sin(state.tilt);
    var ry = y * cosT - rz * sinT;
    var rz2 = y * sinT + rz * cosT;

    var persp = 500 / (500 + rz2 * 100);

    return {
      x: W / 2 + rx * persp,
      y: H / 2 + ry * persp,
      z: rz2
    };
  }

  function projectRing(t) {
    var scale = Math.min(W, H) / 3.6;
    var hw = halfWidthAt(t) * scale;
    var yOff = HEIGHT * scale * (0.5 - t);

    return [
      rotate3D(-hw, yOff, -hw),
      rotate3D( hw, yOff, -hw),
      rotate3D( hw, yOff,  hw),
      rotate3D(-hw, yOff,  hw)
    ];
  }

  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function draw(now) {
    if (W === 0 || H === 0) {
      requestAnimationFrame(draw);
      return;
    }

    ctx.clearRect(0, 0, W, H);

    // Auto-rotate
    if (state.autoRotate && !state.isDragging && !reducedMotion) {
      state.targetRotation += 0.0035;
    }
    state.rotation += (state.targetRotation - state.rotation) * 0.08 + state.velocity;
    state.velocity *= 0.93;
    state.tilt += (state.targetTilt - state.tilt) * 0.08;

    // Compute 5 rings (0 to 4, t = 0, 0.25, 0.5, 0.75, 1.0)
    var rings = [];
    for (var i = 0; i <= 4; i++) {
      rings.push(projectRing(i / 4));
    }

    // Draw each level (side quads between rings), back to front
    var levelOrder = [0, 1, 2, 3];
    levelOrder.sort(function (a, b) {
      var za = 0, zb = 0;
      for (var k = 0; k < 4; k++) {
        za += rings[a][k].z + rings[a + 1][k].z;
        zb += rings[b][k].z + rings[b + 1][k].z;
      }
      return za - zb;
    });

    for (var d = 0; d < 4; d++) {
      var lvl = levelOrder[d];
      var r0 = rings[lvl];
      var r1 = rings[lvl + 1];
      var lc = LEVELS[lvl];
      var isSel = (state.selected === lvl);
      var isHov = (state.hovered === lvl);
      var pulse = reducedMotion ? 0 : (Math.sin(now * 0.002 + lvl) * 0.04);

      for (var side = 0; side < 4; side++) {
        var s0 = r0[side];
        var s1 = r0[(side + 1) % 4];
        var s2 = r1[(side + 1) % 4];
        var s3 = r1[side];

        var faceZ = (s0.z + s1.z + s2.z + s3.z) / 4;
        var alpha = 0.06 + (faceZ + 1) * 0.03;
        if (isSel) alpha = 0.32 + pulse;
        else if (isHov) alpha = 0.18;

        // Fill
        ctx.fillStyle = hexToRgba(lc.color, alpha);
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.lineTo(s3.x, s3.y);
        ctx.closePath();
        ctx.fill();

        // Stroke
        var strokeA = isSel ? 1 : (isHov ? 0.85 : 0.4);
        ctx.strokeStyle = hexToRgba(lc.color, strokeA);
        ctx.lineWidth = isSel ? 2.2 : (isHov ? 1.6 : 1);
        if (isSel || isHov) {
          ctx.shadowColor = lc.color;
          ctx.shadowBlur = isSel ? 14 : 8;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // Top face of truncated pyramid
    var rTop = rings[4];
    var topColor = LEVELS[3].color;
    var topAlpha = state.selected === 3 ? 0.42 : 0.14;
    ctx.fillStyle = hexToRgba(topColor, topAlpha);
    ctx.beginPath();
    ctx.moveTo(rTop[0].x, rTop[0].y);
    for (var ti = 1; ti < 4; ti++) ctx.lineTo(rTop[ti].x, rTop[ti].y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hexToRgba(topColor, state.selected === 3 ? 1 : 0.55);
    ctx.lineWidth = state.selected === 3 ? 2 : 1.2;
    ctx.stroke();

    // Rising particles along the pyramid
    if (!reducedMotion) {
      var t0 = now * 0.00025;
      for (var pi = 0; pi < 24; pi++) {
        var pt = (t0 * 2 + pi / 24) % 1;
        var lvlIdx = Math.min(3, Math.floor(pt * 4));
        var subT = pt * 4 - lvlIdx;
        var sideIdx = pi % 4;

        var a = rings[lvlIdx][sideIdx];
        var b = rings[lvlIdx + 1][sideIdx];
        var px = a.x + (b.x - a.x) * subT;
        var py = a.y + (b.y - a.y) * subT;

        ctx.fillStyle = hexToRgba(LEVELS[lvlIdx].color, 0.85);
        ctx.shadowColor = LEVELS[lvlIdx].color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(px, py, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Center label for selected level
    if (state.selected >= 0) {
      var lvl = state.selected;
      var cx = 0, cy = 0;
      for (var vi = 0; vi < 4; vi++) {
        cx += rings[lvl][vi].x + rings[lvl + 1][vi].x;
        cy += rings[lvl][vi].y + rings[lvl + 1][vi].y;
      }
      cx /= 8; cy /= 8;

      var grd = ctx.createRadialGradient(cx, cy, 4, cx, cy, 90);
      grd.addColorStop(0, hexToRgba(LEVELS[lvl].color, 0.35));
      grd.addColorStop(1, hexToRgba(LEVELS[lvl].color, 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  // Hit-test: which level was clicked
  function hitTest(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var mx = clientX - rect.left;
    var my = clientY - rect.top;

    var scale = Math.min(W, H) / 3.6;
    var halfBase = BASE_HALF * scale;
    var height = HEIGHT * scale;
    var topY = H / 2 - height * 0.5;
    var bottomY = H / 2 + height * 0.5;

    if (my < topY || my > bottomY) return -1;

    var relY = (my - topY) / height; // 0=top, 1=base
    var hw = (TOP_HALF + (BASE_HALF - TOP_HALF) * relY) * scale;

    if (mx < W / 2 - hw || mx > W / 2 + hw) return -1;

    // Reverse mapping: relY 0=top→level 3, relY 1=base→level 0
    if (relY < 0.25) return 3;
    if (relY < 0.50) return 2;
    if (relY < 0.75) return 1;
    return 0;
  }

  function selectLevel(idx) {
    state.selected = (state.selected === idx) ? -1 : idx;
    if (typeof window.onKmehLevelSelect === 'function') {
      window.onKmehLevelSelect(state.selected);
    }
  }

  // Mouse / Touch drag
  canvas.addEventListener('mousedown', function (e) {
    state.isDragging = true;
    state.dragMoved = false;
    state.lastX = e.clientX;
    state.autoRotate = false;
  });
  window.addEventListener('mousemove', function (e) {
    if (state.isDragging) {
      var dx = e.clientX - state.lastX;
      if (Math.abs(dx) > 2) state.dragMoved = true;
      state.targetRotation += dx * 0.012;
      state.velocity = dx * 0.008;
      state.lastX = e.clientX;
    } else {
      var h = hitTest(e.clientX, e.clientY);
      if (h !== state.hovered) {
        state.hovered = h;
        canvas.style.cursor = h >= 0 ? 'pointer' : 'grab';
      }
    }
  });
  window.addEventListener('mouseup', function (e) {
    if (!state.isDragging) return;
    state.isDragging = false;
    state.autoRotate = true;
    if (!state.dragMoved) {
      var lvl = hitTest(e.clientX, e.clientY);
      if (lvl >= 0) selectLevel(lvl);
    }
  });

  canvas.addEventListener('touchstart', function (e) {
    if (e.touches[0]) {
      state.isDragging = true;
      state.dragMoved = false;
      state.lastX = e.touches[0].clientX;
      state.lastY = e.touches[0].clientY;
      state.autoRotate = false;
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', function (e) {
    if (state.isDragging && e.touches[0]) {
      var dx = e.touches[0].clientX - state.lastX;
      if (Math.abs(dx) > 4) state.dragMoved = true;
      state.targetRotation += dx * 0.012;
      state.lastX = e.touches[0].clientX;
    }
  }, { passive: true });

  canvas.addEventListener('touchend', function (e) {
    if (!state.isDragging) return;
    state.isDragging = false;
    state.autoRotate = true;
    if (!state.dragMoved && e.changedTouches[0]) {
      var lvl = hitTest(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      if (lvl >= 0) selectLevel(lvl);
    }
  });

  // External API
  window.kmehPyramidSelectLevel = selectLevel;
  window.kmehPyramidGetSelected = function () { return state.selected; };

  // Boot
  var init = function () {
    resize();
    window.addEventListener('resize', resize);
    if (document.readyState === 'complete') {
      setTimeout(resize, 100);
    } else {
      window.addEventListener('load', function () {
        setTimeout(resize, 100);
        setTimeout(resize, 500);
      });
    }
    requestAnimationFrame(draw);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
