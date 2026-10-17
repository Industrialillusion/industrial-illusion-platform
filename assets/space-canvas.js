/* ============================================================
   SPACE CANVAS · Deep Space & Cyber-Kemet Artifact Engine
   Industrial Illusion SARL · Deep Tech Systems
   Auto-mounting · Interactive · 60 FPS · Zero Dependencies
   ============================================================ */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. Auto-iniezione o recupero del canvas
  var canvas = document.getElementById('spaceCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'spaceCanvas';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:0;pointer-events:none;display:block;';
    var firstChild = document.body.firstChild;
    if (firstChild) {
      document.body.insertBefore(canvas, firstChild);
    } else {
      document.body.appendChild(canvas);
    }
  }

  var ctx = canvas.getContext('2d');
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;
  var lastWidth = 0;
  var isMobile = false;

  var state = {
    pointerX: 0.5, pointerY: 0.5,
    smoothedX: 0.5, smoothedY: 0.5,
    hasPointer: false,
    mouseX: -1000, mouseY: -1000,
    targetMouseX: -1000, targetMouseY: -1000
  };

  var stars = [];
  var nebulae = [];
  var artifacts = [];
  var ripples = [];
  var shootingStars = [];
  var nextShootingStar = 3000;
  var paths = {};

  // Forme Path2D sacre
  function buildPaths() {
    paths.eye = new Path2D("M -38 0 Q 0 -24 38 0 Q 0 24 -38 0 Z");
    paths.eyePupil = new Path2D("M 0 0 m -7 0 a 7 7 0 1 0 14 0 a 7 7 0 1 0 -14 0");
    paths.ankhLoop = new Path2D("M 0 -10 C -12 -10 -14 -28 0 -28 C 14 -28 12 -10 0 -10 Z");
    paths.ankhCross = new Path2D("M 0 -10 V 26 M -14 -1 H 14");
    paths.scarab = new Path2D("M 0 -14 C 10 -12 10 8 0 12 C -10 8 -10 -12 0 -14 Z M -6 -12 L -12 -18 M 6 -12 L 12 -18 M -8 0 L -15 -2 M 8 0 L 15 -2 M -6 10 L -12 16 M 6 10 L 12 16");
    paths.cartouche = new Path2D("M -14 -20 C -14 -26 -6 -26 0 -26 C 6 -26 14 -26 14 -20 V 20 C 14 26 6 26 0 26 C -6 26 -14 26 -14 20 Z M -14 28 H 14");
  }

  // Modello 3D matematico di una piramide wireframe
  var pyramid3D = {
    vertices: [
      { x: 0, y: -28, z: 0 },     // Vertice superiore (Apex)
      { x: -20, y: 16, z: -20 },  // Base front-left
      { x: 20, y: 16, z: -20 },   // Base front-right
      { x: 20, y: 16, z: 20 },    // Base back-right
      { x: -20, y: 16, z: 20 }    // Base back-left
    ],
    edges: [
      [0, 1], [0, 2], [0, 3], [0, 4], // Lati verso l'apice
      [1, 2], [2, 3], [3, 4], [4, 1]  // Perimetro della base
    ]
  };

  function resize() {
    var curW = window.innerWidth;
    var curH = window.innerHeight;

    // Blocca il resize continuo generato dallo scroll mobile
    if (Math.abs(curW - lastWidth) < 20 && W > 0 && H > 0) {
      return;
    }

    lastWidth = curW;
    W = curW;
    H = curH;
    isMobile = W < 768;

    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    buildScene();
  }

  function buildScene() {
    buildPaths();

    // 1. Campo stellare multi-strato
    stars = [];
    var starCount = isMobile ? 65 : 160;
    var colors = ['#FFFFFF', '#00FFA3', '#E8C86A', '#93C5FD', '#FDE68A'];

    for (var i = 0; i < starCount; i++) {
      var depth = Math.random(); // 0 = lontana, 1 = vicina
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        baseX: 0, baseY: 0,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        r: depth * 1.5 + 0.4,
        depth: depth,
        color: colors[Math.floor(Math.random() * colors.length)],
        baseAlpha: 0.2 + depth * 0.7,
        twinkleSpeed: 0.001 + Math.random() * 0.003,
        twinklePhase: Math.random() * Math.PI * 2,
        pulseOffset: 0
      });
    }

    // 2. Nebulose volumetriche
    nebulae = [];
    var nebCount = isMobile ? 3 : 5;
    var nebColors = [
      { r: 0, g: 255, b: 163, a: 0.045 },   // CyberGreen
      { r: 197, g: 160, b: 89, a: 0.04 },   // KemetGold
      { r: 5, g: 150, b: 105, a: 0.035 },  // Emerald
      { r: 217, g: 119, b: 6, a: 0.03 }    // Amber
    ];

    for (var n = 0; n < nebCount; n++) {
      nebulae.push({
        x: (n + 0.5) * (W / nebCount) + (Math.random() - 0.5) * 200,
        y: Math.random() * H,
        r: 180 + Math.random() * 260,
        col: nebColors[n % nebColors.length],
        driftX: (Math.random() - 0.5) * 0.05,
        driftY: (Math.random() - 0.5) * 0.05
      });
    }

    // 3. Artefatti cibernetici
    artifacts = [];
    var types = ['eye', 'pyramid3d', 'ankh', 'scarab', 'cartouche', 'pyramid3d'];
    var artCount = isMobile ? 3 : 6;

    for (var a = 0; a < artCount; a++) {
      artifacts.push({
        type: types[a % types.length],
        x: 80 + Math.random() * (W - 160),
        y: 80 + Math.random() * (H - 160),
        size: 32 + Math.random() * 32,
        rotX: Math.random() * Math.PI,
        rotY: Math.random() * Math.PI,
        rotZ: Math.random() * Math.PI,
        rotSpeedX: (Math.random() - 0.5) * 0.008,
        rotSpeedY: (Math.random() - 0.5) * 0.012,
        rotSpeedZ: (Math.random() - 0.5) * 0.005,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 0.0006 + Math.random() * 0.0008,
        bobAmp: 14 + Math.random() * 16,
        color: a % 2 === 0 ? '#00FFA3' : '#E8C86A',
        parallax: 0.05 + Math.random() * 0.07,
        alpha: 0.28 + Math.random() * 0.25
      });
    }

    shootingStars = [];
  }

  // Interazione puntatore & coordinate globali
  function handlePointerMove(clientX, clientY) {
    state.targetMouseX = clientX;
    state.targetMouseY = clientY;
    state.pointerX = clientX / (W || 1);
    state.pointerY = clientY / (H || 1);
    state.hasPointer = true;
  }

  window.addEventListener('mousemove', function (e) {
    handlePointerMove(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('touchstart', function (e) {
    if (e.touches[0]) handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  window.addEventListener('touchmove', function (e) {
    if (e.touches[0]) handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  window.addEventListener('mouseleave', function () {
    state.hasPointer = false;
    state.targetMouseX = -1000;
    state.targetMouseY = -1000;
  });

  // Shockwave al clic / tap
  window.addEventListener('pointerdown', function (e) {
    if (reducedMotion) return;
    ripples.push({
      x: e.clientX,
      y: e.clientY,
      r: 0,
      maxR: isMobile ? 180 : 320,
      speed: 6.5,
      alpha: 0.85,
      color: Math.random() > 0.5 ? '#00FFA3' : '#E8C86A'
    });
  });

  var paused = false;
  document.addEventListener('visibilitychange', function () {
    paused = document.hidden;
  });

  // Loop di rendering a 60 FPS
  function draw(now) {
    if (paused) {
      requestAnimationFrame(draw);
      return;
    }

    // Smooth lerp mouse
    state.smoothedX += (state.pointerX - state.smoothedX) * 0.06;
    state.smoothedY += (state.pointerY - state.smoothedY) * 0.06;
    state.mouseX += (state.targetMouseX - state.mouseX) * 0.1;
    state.mouseY += (state.targetMouseY - state.mouseY) * 0.1;

    var offsetX = (state.smoothedX - 0.5) * 45;
    var offsetY = (state.smoothedY - 0.5) * 45;

    // Sfondo cosmico ad alta profondità
    ctx.fillStyle = '#060A0D';
    ctx.fillRect(0, 0, W, H);

    // 1. Disegna le Nebulose
    for (var n = 0; n < nebulae.length; n++) {
      var neb = nebulae[n];
      if (!reducedMotion) {
        neb.x += neb.driftX;
        neb.y += neb.driftY;
        if (neb.x < -neb.r) neb.x = W + neb.r;
        if (neb.x > W + neb.r) neb.x = -neb.r;
        if (neb.y < -neb.r) neb.y = H + neb.r;
        if (neb.y > H + neb.r) neb.y = -neb.r;
      }
      var grad = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.r);
      grad.addColorStop(0, 'rgba(' + neb.col.r + ',' + neb.col.g + ',' + neb.col.b + ',' + neb.col.a + ')');
      grad.addColorStop(0.6, 'rgba(' + neb.col.r + ',' + neb.col.g + ',' + neb.col.b + ',' + (neb.col.a * 0.3) + ')');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(neb.x, neb.y, neb.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Shockwaves gravitazionali
    for (var rp = ripples.length - 1; rp >= 0; rp--) {
      var rip = ripples[rp];
      rip.r += rip.speed;
      rip.alpha *= 0.96;

      ctx.save();
      ctx.strokeStyle = rip.color;
      ctx.globalAlpha = Math.max(0, rip.alpha);
      ctx.lineWidth = 1.6;
      ctx.shadowColor = rip.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (rip.alpha < 0.02 || rip.r > rip.maxR) {
        ripples.splice(rp, 1);
      }
    }

    // 3. Disegna e connetti le stelle (Mesh quantica Maat)
    var activeDist = isMobile ? 85 : 120;
    var mouseDist = isMobile ? 120 : 180;

    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];

      if (!reducedMotion) {
        st.x += st.vx;
        st.y += st.vy;
        if (st.x < 0) st.x = W;
        if (st.x > W) st.x = 0;
        if (st.y < 0) st.y = H;
        if (st.y > H) st.y = 0;
      }

      var px = st.x + offsetX * st.depth;
      var py = st.y + offsetY * st.depth;

      // Reazione gravitazionale con le shockwave
      for (var rIndex = 0; rIndex < ripples.length; rIndex++) {
        var rItem = ripples[rIndex];
        var dxR = px - rItem.x;
        var dyR = py - rItem.y;
        var distR = Math.sqrt(dxR * dxR + dyR * dyR);
        if (Math.abs(distR - rItem.r) < 30) {
          var push = (1 - Math.abs(distR - rItem.r) / 30) * 12;
          px += (dxR / (distR || 1)) * push;
          py += (dyR / (distR || 1)) * push;
        }
      }

      // Reazione di attrazione magnetica col cursore
      if (state.hasPointer) {
        var mdx = state.mouseX - px;
        var mdy = state.mouseY - py;
        var mdist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mdist < mouseDist) {
          var pull = (1 - mdist / mouseDist) * 15 * st.depth;
          px += (mdx / (mdist || 1)) * pull;
          py += (mdy / (mdist || 1)) * pull;

          // Fascio di luce stellare verso il mouse
          ctx.strokeStyle = st.color;
          ctx.globalAlpha = (1 - mdist / mouseDist) * 0.35;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(state.mouseX, state.mouseY);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // Connessioni tra stelle vicine (Network a costellazione)
      if (!isMobile && i % 2 === 0) {
        for (var j = i + 1; j < stars.length; j += 3) {
          var st2 = stars[j];
          var sx2 = st2.x + offsetX * st2.depth;
          var sy2 = st2.y + offsetY * st2.depth;
          var cdx = px - sx2;
          var cdy = py - sy2;
          var cdist = Math.sqrt(cdx * cdx + cdy * cdy);

          if (cdist < activeDist) {
            ctx.strokeStyle = st.color;
            ctx.globalAlpha = (1 - cdist / activeDist) * 0.16 * st.depth;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(sx2, sy2);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      // Rendering della stella
      var twinkle = reducedMotion ? 0.7 : 0.5 + 0.5 * Math.sin(now * st.twinkleSpeed + st.twinklePhase);
      var alpha = st.baseAlpha * (0.6 + 0.4 * twinkle);

      ctx.fillStyle = st.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(px, py, st.r, 0, Math.PI * 2);
      ctx.fill();

      // Alone ottico per stelle brillanti
      if (st.r > 1.2) {
        ctx.fillStyle = st.color;
        ctx.globalAlpha = alpha * 0.18;
        ctx.beginPath();
        ctx.arc(px, py, st.r * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 4. Artefatti Egizi Cibernetici (Ologrammi 3D & Simboli)
    for (var a = 0; a < artifacts.length; a++) {
      var art = artifacts[a];

      if (!reducedMotion) {
        art.bobPhase += art.bobSpeed;
        art.rotX += art.rotSpeedX;
        art.rotY += art.rotSpeedY;
        art.rotZ += art.rotSpeedZ;
      }

      var aBobX = Math.cos(art.bobPhase) * art.bobAmp;
      var aBobY = Math.sin(art.bobPhase * 0.8) * art.bobAmp;
      var apx = art.x + offsetX * art.parallax * 30 + aBobX;
      var apy = art.y + offsetY * art.parallax * 30 + aBobY;

      // Distorsione da cursore
      if (state.hasPointer) {
        var adx = state.mouseX - apx;
        var ady = state.mouseY - apy;
        var adist = Math.sqrt(adx * adx + ady * ady) || 1;
        var repel = 260;
        if (adist < repel) {
          var force = (1 - adist / repel) * 22;
          apx -= (adx / adist) * force;
          apy -= (ady / adist) * force;
        }
      }

      ctx.save();
      ctx.translate(apx, apy);

      // Rendering specifico: Piramide 3D Wireframe
      if (art.type === 'pyramid3d') {
        ctx.strokeStyle = art.color;
        ctx.lineWidth = 1.3;
        ctx.globalAlpha = art.alpha;
        ctx.shadowColor = art.color;
        ctx.shadowBlur = 10;

        var proj = [];
        var radX = art.rotX;
        var radY = art.rotY;

        for (var v = 0; v < pyramid3D.vertices.length; v++) {
          var vert = pyramid3D.vertices[v];
          // Rotazione Y
          var x1 = vert.x * Math.cos(radY) + vert.z * Math.sin(radY);
          var z1 = -vert.x * Math.sin(radY) + vert.z * Math.cos(radY);
          // Rotazione X
          var y2 = vert.y * Math.cos(radX) - z1 * Math.sin(radX);
          var z2 = vert.y * Math.sin(radX) + z1 * Math.cos(radX);

          var scale = (art.size / 30) * (200 / (200 + z2));
          proj.push({ x: x1 * scale, y: y2 * scale });
        }

        // Traccia spigoli wireframe
        for (var e = 0; e < pyramid3D.edges.length; e++) {
          var edge = pyramid3D.edges[e];
          ctx.beginPath();
          ctx.moveTo(proj[edge[0]].x, proj[edge[0]].y);
          ctx.lineTo(proj[edge[1]].x, proj[edge[1]].y);
          ctx.stroke();
        }

        // Apice illuminato (Beacon ad emissione)
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(proj[0].x, proj[0].y, 2.5, 0, Math.PI * 2);
        ctx.fill();

      } else {
        // Artefatti 2D vettoriali (Occhio, Ankh, Scarabeo, Cartiglio)
        ctx.rotate(art.rotZ);
        ctx.scale(art.size / 35, art.size / 35);
        ctx.strokeStyle = art.color;
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = art.alpha;
        ctx.shadowColor = art.color;
        ctx.shadowBlur = 8;

        if (art.type === 'eye') {
          ctx.stroke(paths.eye);
          // Pupilla con tracciamento orbitale
          var pupX = (state.smoothedX - 0.5) * 8;
          var pupY = (state.smoothedY - 0.5) * 6;
          ctx.save();
          ctx.translate(pupX, pupY);
          ctx.fillStyle = art.color;
          ctx.fill(paths.eyePupil);
          ctx.restore();
        } else if (art.type === 'ankh') {
          ctx.stroke(paths.ankhLoop);
          ctx.stroke(paths.ankhCross);
        } else if (art.type === 'scarab') {
          ctx.stroke(paths.scarab);
        } else if (art.type === 'cartouche') {
          ctx.stroke(paths.cartouche);
        }
      }

      ctx.restore();
    }

    // 5. Meteore quantiche / Shooting Stars
    if (!reducedMotion) {
      if (now > nextShootingStar) {
        shootingStars.push({
          x: Math.random() * (W * 0.8),
          y: Math.random() * (H * 0.4),
          len: 120 + Math.random() * 90,
          speed: 12 + Math.random() * 8,
          angle: Math.PI / 4 + (Math.random() - 0.5) * 0.2,
          life: 1,
          decay: 0.016 + Math.random() * 0.012,
          color: Math.random() > 0.5 ? '#00FFA3' : '#E8C86A'
        });
        nextShootingStar = now + 4000 + Math.random() * 7000;
      }

      for (var s = shootingStars.length - 1; s >= 0; s--) {
        var met = shootingStars[s];
        met.x += Math.cos(met.angle) * met.speed;
        met.y += Math.sin(met.angle) * met.speed;
        met.life -= met.decay;

        if (met.life <= 0 || met.x > W + 200 || met.y > H + 200) {
          shootingStars.splice(s, 1);
          continue;
        }

        var tailX = met.x - Math.cos(met.angle) * met.len;
        var tailY = met.y - Math.sin(met.angle) * met.len;

        var mGrad = ctx.createLinearGradient(met.x, met.y, tailX, tailY);
        mGrad.addColorStop(0, '#FFFFFF');
        mGrad.addColorStop(0.2, met.color);
        mGrad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.save();
        ctx.strokeStyle = mGrad;
        ctx.lineWidth = 1.8;
        ctx.shadowColor = met.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(met.x, met.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
        ctx.restore();
      }
    }

    requestAnimationFrame(draw);
  }

  // Inizializzazione protetta con bootstrap
  function bootstrap() {
    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(function (t) {
      draw(t);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
