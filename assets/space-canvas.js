/* ============================================================
   SPACE CANVAS · Deep Space Background + Egyptian Artifacts
   Industrial Illusion SARL · v1.0
   Riutilizzabile su tutte le pagine · Interactive · Mobile-first
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('spaceCanvas');
  if (!canvas) return;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ctx = canvas.getContext('2d');
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;
  var isMobile = window.innerWidth < 768;

  var state = {
    pointerX: 0.5, pointerY: 0.5,
    smoothedX: 0.5, smoothedY: 0.5,
    hasPointer: false,
    mouseX: 0, mouseY: 0
  };

  var starsFar = [], starsMid = [], starsNear = [];
  var nebulae = [];
  var artifacts = [];
  var shootingStars = [];
  var nextShootingStar = 5000;

  var paths = {};

  function buildPaths() {
    paths.eye = new Path2D("M -40 0 Q 0 -25 40 0 Q 0 25 -40 0 Z");
    paths.ankh = new Path2D("M 0 -30 A 10 10 0 1 1 0 -10 A 10 10 0 1 1 0 -30 Z M 0 -10 V 30 M -15 0 H 15");
    paths.scarab = new Path2D("M 0 -12 Q 12 -8 10 6 Q 6 12 0 12 Q -6 12 -10 6 Q -12 -8 0 -12 Z M -6 -10 L -10 -18 M 6 -10 L 10 -18 M -8 -4 L -14 -8 M 8 -4 L 14 -8");
    paths.pyramid = new Path2D("M 0 -22 L 20 14 L -20 14 Z");
    paths.cartouche = new Path2D("M -15 -22 Q -15 -28 -8 -28 L 8 -28 Q 15 -28 15 -22 L 15 22 Q 15 28 8 28 L -8 28 Q -15 28 -15 22 Z");
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    isMobile = W < 768;
    buildScene();
  }

  function makeStar(minR, maxR, minA, maxA, twinkleSpeedMin, parallax) {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: minR + Math.random() * (maxR - minR),
      baseAlpha: minA + Math.random() * (maxA - minA),
      twinkleSpeed: twinkleSpeedMin + Math.random() * 0.0015,
      twinklePhase: Math.random() * Math.PI * 2,
      parallax: parallax
    };
  }

  function buildScene() {
    buildPaths();

    starsFar = [];
    starsMid = [];
    starsNear = [];

    var farCount = isMobile ? 50 : 140;
    var midCount = isMobile ? 30 : 80;
    var nearCount = isMobile ? 15 : 35;

    for (var i = 0; i < farCount; i++) starsFar.push(makeStar(0.3, 0.6, 0.15, 0.45, 0.0005, 0.02));
    for (var j = 0; j < midCount; j++) starsMid.push(makeStar(0.5, 0.9, 0.35, 0.7, 0.0008, 0.06));
    for (var k = 0; k < nearCount; k++) starsNear.push(makeStar(0.8, 1.6, 0.55, 0.9, 0.0012, 0.12));

    nebulae = [];
    var nebulaCount = isMobile ? 2 : 4;
    var colors = [
      { r: 0, g: 255, b: 163 },
      { r: 197, g: 160, b: 89 },
      { r: 0, g: 184, b: 113 },
      { r: 232, g: 200, b: 106 }
    ];
    for (var n = 0; n < nebulaCount; n++) {
      nebulae.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 180 + Math.random() * 280,
        color: colors[n % colors.length],
        driftX: (Math.random() - 0.5) * 0.03,
        driftY: (Math.random() - 0.5) * 0.03
      });
    }

    artifacts = [];
    var types = ['eye', 'ankh', 'scarab', 'pyramid', 'cartouche', 'eye'];
    var artifactCount = isMobile ? 3 : 6;
    for (var a = 0; a < artifactCount; a++) {
      artifacts.push({
        type: types[a % types.length],
        x: 80 + Math.random() * (W - 160),
        y: 80 + Math.random() * (H - 160),
        size: 30 + Math.random() * 40,
        angle: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.0005,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 0.0002 + Math.random() * 0.0004,
        bobAmp: 10 + Math.random() * 15,
        opacity: 0.18 + Math.random() * 0.22,
        color: Math.random() > 0.5 ? '#00FFA3' : '#C5A059',
        parallax: 0.06 + Math.random() * 0.08
      });
    }

    shootingStars = [];
  }

  function setPointer(x, y) {
    state.pointerX = x / W;
    state.pointerY = y / H;
    state.mouseX = x;
    state.mouseY = y;
    state.hasPointer = true;
  }

  window.addEventListener('mousemove', function (e) { setPointer(e.clientX, e.clientY); }, { passive: true });
  window.addEventListener('mouseleave', function () { state.hasPointer = false; });
  window.addEventListener('touchmove', function (e) { if (e.touches[0]) setPointer(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });

  var paused = false;
  document.addEventListener('visibilitychange', function () { paused = document.hidden; });

  var lastTime = 0;

  function draw(now) {
    if (paused) { requestAnimationFrame(draw); return; }

    lastTime = now;

    var tx = state.hasPointer ? state.pointerX : 0.5;
    var ty = state.hasPointer ? state.pointerY : 0.5;
    state.smoothedX += (tx - state.smoothedX) * 0.08;
    state.smoothedY += (ty - state.smoothedY) * 0.08;

    var offsetX = (state.smoothedX - 0.5) * 2;
    var offsetY = (state.smoothedY - 0.5) * 2;

    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, W, H);

    // Nebulae
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
      var nebGrad = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.r);
      nebGrad.addColorStop(0, 'rgba(' + neb.color.r + ',' + neb.color.g + ',' + neb.color.b + ',0.05)');
      nebGrad.addColorStop(0.5, 'rgba(' + neb.color.r + ',' + neb.color.g + ',' + neb.color.b + ',0.02)');
      nebGrad.addColorStop(1, 'rgba(' + neb.color.r + ',' + neb.color.g + ',' + neb.color.b + ',0)');
      ctx.fillStyle = nebGrad;
      ctx.beginPath();
      ctx.arc(neb.x, neb.y, neb.r, 0, Math.PI * 2);
      ctx.fill();
    }

    drawStars(starsFar, now, offsetX, offsetY);
    drawStars(starsMid, now, offsetX, offsetY);
    drawStars(starsNear, now, offsetX, offsetY);

    drawArtifacts(now, offsetX, offsetY);

    // Shooting stars
    if (!reducedMotion) {
      if (now > nextShootingStar) {
        shootingStars.push({
          x: -50,
          y: 100 + Math.random() * (H * 0.4),
          vx: 8 + Math.random() * 6,
          vy: 2 + Math.random() * 2,
          life: 1,
          decay: 0.012 + Math.random() * 0.008
        });
        nextShootingStar = now + 6000 + Math.random() * 10000;
      }
      for (var s = shootingStars.length - 1; s >= 0; s--) {
        var ss = shootingStars[s];
        ss.x += ss.vx;
        ss.y += ss.vy;
        ss.life -= ss.decay;
        if (ss.life <= 0 || ss.x > W + 100) { shootingStars.splice(s, 1); continue; }
        var gradient = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * 12, ss.y - ss.vy * 12);
        gradient.addColorStop(0, 'rgba(255, 255, 255, ' + ss.life + ')');
        gradient.addColorStop(0.5, 'rgba(0, 255, 163, ' + (ss.life * 0.6) + ')');
        gradient.addColorStop(1, 'rgba(0, 255, 163, 0)');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ss.x, ss.y);
        ctx.lineTo(ss.x - ss.vx * 12, ss.y - ss.vy * 12);
        ctx.stroke();
      }
    }

    if (!reducedMotion) requestAnimationFrame(draw);
  }

  function drawStars(arr, now, offsetX, offsetY) {
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      var twinkle = reducedMotion ? 0.7 : 0.5 + 0.5 * Math.sin(now * s.twinkleSpeed + s.twinklePhase);
      var alpha = s.baseAlpha * (0.6 + 0.4 * twinkle);
      var px = s.x + offsetX * s.parallax * 30;
      var py = s.y + offsetY * s.parallax * 30;
      ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha + ')';
      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.r > 1) {
        ctx.fillStyle = 'rgba(0, 255, 163, ' + (alpha * 0.12) + ')';
        ctx.beginPath();
        ctx.arc(px, py, s.r * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawArtifacts(now, offsetX, offsetY) {
    for (var i = 0; i < artifacts.length; i++) {
      var a = artifacts[i];
      if (!reducedMotion) {
        a.angle += a.rotationSpeed;
        a.bobPhase += a.bobSpeed;
      }
      var bobX = Math.cos(a.bobPhase) * a.bobAmp;
      var bobY = Math.sin(a.bobPhase * 0.7) * a.bobAmp;
      var px = a.x + offsetX * a.parallax * 40 + bobX;
      var py = a.y + offsetY * a.parallax * 40 + bobY;

      if (state.hasPointer) {
        var dx = state.mouseX - px;
        var dy = state.mouseY - py;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var maxDist = 280;
        if (dist < maxDist) {
          var influence = (1 - dist / maxDist) * 18;
          px += (dx / dist) * influence;
          py += (dy / dist) * influence;
        }
      }

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a.angle);
      ctx.scale(a.size / 40, a.size / 40);
      ctx.globalAlpha = a.opacity;
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = a.color;
      ctx.shadowBlur = 8;

      if (a.type === 'eye') {
        ctx.stroke(paths.eye);
        var lookX = offsetX * 5;
        var lookY = offsetY * 5;
        ctx.beginPath();
        ctx.arc(lookX, lookY, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = a.color;
        ctx.beginPath();
        ctx.arc(lookX, lookY, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (a.type === 'ankh') {
        ctx.stroke(paths.ankh);
      } else if (a.type === 'scarab') {
        ctx.stroke(paths.scarab);
      } else if (a.type === 'pyramid') {
        ctx.stroke(paths.pyramid);
        ctx.beginPath();
        ctx.moveTo(0, -22);
        ctx.lineTo(0, 14);
        ctx.stroke();
      } else if (a.type === 'cartouche') {
        ctx.stroke(paths.cartouche);
        for (var d = 0; d < 3; d++) {
          ctx.fillStyle = a.color;
          ctx.beginPath();
          ctx.arc(0, -12 + d * 12, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) lastTime = performance.now();
  });

  requestAnimationFrame(function (t) {
    lastTime = t;
    requestAnimationFrame(draw);
  });

})();
