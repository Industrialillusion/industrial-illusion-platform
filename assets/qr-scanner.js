/* ==========================================================================
 *  assets/qr-scanner.js
 *  Phase 3 · QR Scanner (fotocamera + torcia + haptic + audio)
 *  - BarcodeDetector nativo (Chrome Android)
 *  - Fallback jsQR on-demand (iOS/Safari)
 *  - Torcia toggle via track constraints
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatQRScannerLoaded) return;
  window.__MaatQRScannerLoaded = true;

  const CFG = {
    jsqrCdn: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
    scanIntervalMs: 200,
    beepFreq: 880,
    beepDuration: 80,
    vibrateMs: 50,
  };

  const S = {
    stream: null,
    videoEl: null,
    canvasEl: null,
    ctx: null,
    detector: null,
    jsqrLoaded: false,
    scanning: false,
    torciaOn: false,
    onScan: null,
    onError: null,
    rafId: null,
    audioCtx: null,
  };

  /* ─── Carica jsQR on-demand ──────────────────────────────────────────── */
  function loadJsQR() {
    if (S.jsqrLoaded) return Promise.resolve();
    if (window.jsQR) { S.jsqrLoaded = true; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CFG.jsqrCdn;
      s.onload = () => { S.jsqrLoaded = true; resolve(); };
      s.onerror = () => reject(new Error('jsQR load failed'));
      document.head.appendChild(s);
    });
  }

  /* ─── Beep + haptic ──────────────────────────────────────────────────── */
  function beep() {
    try {
      if (!S.audioCtx) S.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = S.audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = CFG.beepFreq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + CFG.beepDuration / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + CFG.beepDuration / 1000);
    } catch (_) {}
  }

  function vibrate() {
    if (navigator.vibrate) {
      try { navigator.vibrate(CFG.vibrateMs); } catch (_) {}
    }
  }

  function feedback() {
    beep();
    vibrate();
  }

  /* ─── BarcodeDetector ────────────────────────────────────────────────── */
  function detectWithBD(video) {
    if (!S.detector) return Promise.resolve(null);
    return S.detector.detect(video).then(codes => {
      if (codes && codes.length > 0 && codes[0].rawValue) return codes[0].rawValue;
      return null;
    }).catch(() => null);
  }

  /* ─── jsQR fallback ──────────────────────────────────────────────────── */
  function detectWithJsQR(video) {
    if (!S.jsqrLoaded || typeof window.jsQR !== 'function') return null;
    const canvas = S.canvasEl;
    const ctx = S.ctx;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const code = window.jsQR(imageData.data, w, h);
    return code && code.data ? code.data : null;
  }

  /* ─── Scan loop ──────────────────────────────────────────────────────── */
  async function scanLoop() {
    if (!S.scanning) return;
    const video = S.videoEl;
    if (!video || video.readyState < 2) {
      S.rafId = requestAnimationFrame(scanLoop);
      return;
    }

    let detected = null;
    if (S.detector) {
      detected = await detectWithBD(video);
    }
    if (!detected) {
      detected = detectWithJsQR(video);
    }

    if (detected) {
      feedback();
      if (typeof S.onScan === 'function') S.onScan(detected);
      setTimeout(() => { if (S.scanning) scanLoop(); }, 800);
      return;
    }

    setTimeout(() => {
      if (S.scanning) S.rafId = requestAnimationFrame(scanLoop);
    }, CFG.scanIntervalMs);
  }

  /* ─── Start ──────────────────────────────────────────────────────────── */
  async function start(opts) {
    opts = opts || {};
    if (S.scanning) {
      console.warn('[QRScanner] già in esecuzione');
      return;
    }

    S.onScan = opts.onScan || null;
    S.onError = opts.onError || null;

    loadJsQR().catch(() => console.warn('[QRScanner] jsQR fallback non disponibile'));

    if ('BarcodeDetector' in window) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (formats.includes('qr_code')) {
          S.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          console.log('[QRScanner] BarcodeDetector nativo attivo');
        }
      } catch (_) {}
    }

    if (!S.videoEl) {
      S.videoEl = document.createElement('video');
      S.videoEl.setAttribute('playsinline', 'true');
      S.videoEl.setAttribute('muted', 'true');
      S.videoEl.muted = true;
      S.videoEl.autoplay = true;
      S.canvasEl = document.createElement('canvas');
      S.ctx = S.canvasEl.getContext('2d', { willReadFrequently: true });
    }

    try {
      S.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      S.videoEl.srcObject = S.stream;
      await S.videoEl.play();
      S.scanning = true;
      scanLoop();
      console.log('[QRScanner] scanning started');
    } catch (err) {
      console.error('[QRScanner] getUserMedia error:', err);
      if (typeof S.onError === 'function') S.onError(err);
      throw err;
    }
  }

  /* ─── Stop ───────────────────────────────────────────────────────────── */
  function stop() {
    S.scanning = false;
    if (S.rafId) { cancelAnimationFrame(S.rafId); S.rafId = null; }
    if (S.stream) {
      S.stream.getTracks().forEach(t => t.stop());
      S.stream = null;
    }
    if (S.videoEl) S.videoEl.srcObject = null;
    S.detector = null;
    S.torciaOn = false;
    console.log('[QRScanner] stopped');
  }

  /* ─── Torcia ─────────────────────────────────────────────────────────── */
  async function toggleTorch() {
    if (!S.stream) return false;
    const track = S.stream.getVideoTracks()[0];
    if (!track) return false;
    try {
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (!caps.torch) {
        console.warn('[QRScanner] torcia non supportata da questo dispositivo');
        return false;
      }
      S.torciaOn = !S.torciaOn;
      await track.applyConstraints({ advanced: [{ torch: S.torciaOn }] });
      console.log('[QRScanner] torcia', S.torciaOn ? 'ON' : 'OFF');
      return S.torciaOn;
    } catch (err) {
      console.warn('[QRScanner] torcia error:', err);
      return false;
    }
  }

  /* ─── Attach video ad un contenitore ─────────────────────────────────── */
  function attachTo(container) {
    if (!container || !S.videoEl) return;
    S.videoEl.style.cssText = 'width:100%;height:auto;display:block;border-radius:8px;background:#000';
    container.replaceChildren(S.videoEl);
  }

  /* ─── API ────────────────────────────────────────────────────────────── */
  window.MaatQRScanner = {
    start,
    stop,
    toggleTorch,
    attachTo,
    isScanning: () => S.scanning,
    hasTorch: () => {
      if (!S.stream) return false;
      const track = S.stream.getVideoTracks()[0];
      if (!track || !track.getCapabilities) return false;
      return !!track.getCapabilities().torch;
    },
  };

  console.log('[QRScanner] module ready · v1.0.0');
})();
