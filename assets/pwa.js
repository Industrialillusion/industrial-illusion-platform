/* ============================================================
   MAAT OS v8.1 — Workstation opérateurs (PurKemet Phase 1)
   Tournée · double pesée certifiée · contrats ambassadeurs · wallet.
   Consomme assets/core.js (kernel M) et assets/config.js (II_CONFIG).
   ============================================================ */
(function () {
  'use strict';
  if (!window.Maat) {
    document.body.innerHTML = '<p style="font-family:monospace;color:#f87171;padding:2rem">Maat OS — kernel (core.js) introuvable. Vérifiez assets/core.js.</p>';
    return;
  }
  var M = window.Maat, $ = M.$, h = M.h;
  var DEMO = /[?&]demo=1/.test(location.search) || localStorage.getItem('ii_demo_mode') === '1';
  var SVC = M.cfg.SCALE_SERVICE || 0x181D, CHR = M.cfg.SCALE_CHAR || 0x2A9D;
  var app = $('app'), bn = $('bnav');

  /* =================================================================
     STATE
     ================================================================= */
  var S = {
    P: null, mode: null, view: null, pos: null, wake: null,
    deferred: null, scanner: null, stream: null, chan: null,
    lastSync: null
  };
  var ctx = { pickup: null, client: '', qr: '', mat: '', fault: false, photo: null };
  var bags = {};

  /* =================================================================
     CONSTANTES MÉTIER (BP Phase 1 §3.1.6)
     ================================================================= */
  var MATS = [
    { id: 'PET_CLEAR', icon: '🟢', label: 'PET transparent',  color: '#00FFA3', hint: 'Bouteilles eau/soda' },
    { id: 'PE_HD',     icon: '🟡', label: 'PE-HD flaconnage', color: '#E6CA65', hint: 'Bidons, flacons lessive' },
    { id: 'ALUMINIUM', icon: '🥫', label: 'Aluminium',        color: '#C5A059', hint: 'Canettes, barquettes' },
    { id: 'CARTON',    icon: '📦', label: 'Carton ondulé',    color: '#B48A5A', hint: 'Emballages livraison' },
    { id: 'VERRE',     icon: '🍾', label: 'Verre',            color: '#7EB8D9', hint: 'Bouteilles boisson' }
  ];

  var CATS = [
    ['RIAD', 'Riad / Maison d\'hôtes'], ['RESTAURANT', 'Restaurant / Rooftop'],
    ['HOTEL_RESORT', 'Hôtel / Resort'], ['CLINIQUE', 'Clinique'],
    ['ECOLE', 'École / Université'], ['COMMERCE', 'Commerce / Artisan'],
    ['SUPERMARCHE', 'Supermarché']
  ];

  var GRADES = {
    'Bronze':      { icon: '🥉', color: '#B48A5A' },
    'Silver':      { icon: '🥈', color: '#C0C0C0' },
    'Gold':        { icon: '🥇', color: '#E6CA65' },
    'Kemet Elite': { icon: '👑', color: '#00FFA3' }
  };

  var PAY_METHODS = [
    ['ESPECES_CAISSE', '💵 Espèces — caisse du Hub'],
    ['CIH_BANK',       '🏦 Virement CIH Bank'],
    ['ATTIJARIWAFA',   '🏦 Virement Attijariwafa'],
    ['CASH_PLUS',      '📲 Cash Plus'],
    ['WAFACASH',       '📲 Wafacash']
  ];

  function buzz(p) { M.buzz(p); }

  function voice(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR'; u.rate = 1.05; u.pitch = 1;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
      var ind = h('div', { class: 'voice-indicator', text: '🔊 ' + text });
      document.body.appendChild(ind);
      setTimeout(function () { ind.remove(); }, 2600);
    } catch (e) {}
  }

  async function hashRow(o) { return await M.sha(JSON.stringify(o)); }

  function startGPS() {
    var c = $('gpsChip'); if (!c) return;
    c.classList.remove('hidden');
    if (!navigator.geolocation) { c.textContent = 'GPS (simulé)'; S.pos = { lat: 31.6295, lng: -7.9811, acc: 10 }; return; }
    navigator.geolocation.watchPosition(function (p) {
      S.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      c.textContent = 'GPS ±' + Math.round(S.pos.acc) + ' m';
      c.style.color = S.pos.acc <= 30 ? '#00FFA3' : '#E6CA65';
    }, function () {
      S.pos = { lat: 31.6295, lng: -7.9811, acc: 15 };
      c.textContent = 'GPS Fixe (Marrakech)'; c.style.color = '#E6CA65';
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }
  function gpsStr() { return S.pos ? S.pos.lat.toFixed(6) + ', ' + S.pos.lng.toFixed(6) : '31.629500, -7.981100'; }

  function keepAwake() {
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { S.wake = w; }); } catch (e) {}
  }
  function stopStream() { if (S.stream) { S.stream.getTracks().forEach(function (t) { t.stop(); }); S.stream = null; } }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && S.P) keepAwake(); else stopStream();
  });

  function success(txt) {
    $('okTxt').textContent = txt;
    $('okOverlay').classList.add('show');
    buzz([80, 40, 120]);
    setTimeout(function () { $('okOverlay').classList.remove('show'); }, 2000);
  }

  /* =================================================================
     BALANCE BLUETOOTH & SIMULATEUR
     ================================================================= */
  function Scale(refW) {
    var s = { stable: false, w: 0, fault: false, photo: null, buf: [], ref: refW || '' };
    var el = h('div', { class: 'card g text-center space-y-3' });
    el.innerHTML =
      '<div class="flex justify-between items-center border-b border-white/10 pb-2 font-mono">' +
        '<span data-r="mode" class="text-[10px] font-bold uppercase text-cyberGreen">Balance Bluetooth</span>' +
        '<span data-r="ref" class="text-[9px] text-slate-400"></span></div>' +
      '<div class="flex items-end justify-center gap-2">' +
        '<input data-r="w" type="number" step="0.01" min="0" max="100000" readonly value="00.00" class="wnum" aria-label="Poids en kilogrammes">' +
        '<span class="font-mono text-xs text-slate-400 pb-2">Kg</span></div>' +
      '<div class="stab-wrap"><span class="text-[9px] font-mono text-slate-500" data-r="stabt">Signal</span>' +
        '<div class="stab-track"><div class="stab-fill" data-r="stabar"></div></div></div>' +
      '<p data-r="msg" class="text-[9px] font-mono text-slate-400 uppercase">Pesée connectée</p>' +
      '<p data-r="st" class="text-[10px] font-mono text-slate-500">Prêt pour la pesée</p>' +
      '<div data-r="fault" class="hidden p-3 bg-red-950/40 border border-red-500/40 rounded-xl space-y-3 text-left">' +
        '<span class="text-[10px] font-mono font-bold text-red-400 uppercase block">Procédure défaillance balance</span>' +
        '<p class="text-[10px] text-slate-300">Photographiez le cadran : la saisie d\'urgence se débloque et la photo est jointe au Data Lake.</p>' +
        '<video data-r="v" class="hidden w-full rounded-xl border border-red-500/40" playsinline muted></video>' +
        '<div class="photo-proof hidden" data-r="proofwrap"><img data-r="img" alt="Photo du cadran"><div class="meta-stamp" data-r="stamp"></div></div>' +
        '<button type="button" data-r="proof" class="btn !bg-red-600 !text-white">📸 Photographier le cadran</button></div>' +
      '<div class="space-y-2">' +
        '<button type="button" data-r="sim" class="btn btn-au !py-2.5 !text-xs font-bold">⚡ Simuler pesée stable (Test direct)</button>' +
        '<button type="button" data-r="bt" class="btn btn-o !py-2 !text-[10px]">📶 Connecter balance réelle Bluetooth</button>' +
        '<button type="button" data-r="fb" class="btn btn-r !py-1.5 !text-[9px]">⚠️ Déclarer panne balance (Preuve photo)</button>' +
      '</div>';
    var r = function (k) { return el.querySelector('[data-r="' + k + '"]'); };
    r('ref').textContent = s.ref;

    var setW = function (v, c) { r('w').value = v.toFixed(2); r('w').className = 'wnum ' + (c || ''); };
    var setStab = function (pct, warn) { var b = r('stabar'); b.style.width = Math.max(0, Math.min(100, pct)) + '%'; b.classList.toggle('warn', !!warn); };
    var setSt = function (t, c) { r('st').textContent = t; r('st').style.color = c || '#64748b'; };

    function parse(dv) {
      if (CHR === 0x2A9D) {
        var raw = dv.getUint16(1, true);
        return (dv.getUint8(0) & 1) ? raw * 0.01 * 0.45359237 : raw * 0.005;
      }
      var m = new TextDecoder().decode(dv.buffer).match(/-?\d+(?:[.,]\d+)?/);
      return m ? parseFloat(m[0].replace(',', '.')) : NaN;
    }

    function reading(w) {
      if (!(w >= 0) || s.fault) return;
      s.buf.push(w); if (s.buf.length > 8) s.buf.shift();
      var spread = s.buf.length >= 6 ? (Math.max.apply(null, s.buf) - Math.min.apply(null, s.buf)) : 99;
      var ok = s.buf.length >= 6 && w > 0.05 && spread <= 0.02;
      var stabPct = Math.max(0, 100 - (spread / 0.15) * 100);
      setStab(stabPct, spread > 0.06);
      r('stabt').textContent = ok ? '✓ Stable' : (spread > 0.06 ? 'Instable' : 'Stabilisation');
      if (ok) {
        if (!s.stable) {
          s.stable = true; setW(w, 'locked');
          r('msg').textContent = '✓ Pesée stabilisée certifiée';
          buzz(60); voice('Pesée stable, ' + w.toFixed(2) + ' kilos');
        } else setW(w);
        s.w = w;
      } else {
        s.stable = false; setW(w, 'settling');
        r('msg').textContent = 'Stabilisation en cours…';
      }
      if (s.onchange) s.onchange(s);
    }

    r('sim').onclick = function () {
      var target = Math.round((8.5 + Math.random() * 24.5) * 100) / 100;
      s.buf = [target, target, target, target, target, target];
      s.stable = true; s.w = target;
      setW(target, 'locked');
      setStab(100, false);
      r('stabt').textContent = '✓ Stable';
      r('msg').textContent = '✓ Pesée stabilisée (Simulateur certifié)';
      setSt('Simulateur actif : ' + target + ' kg', '#00FFA3');
      buzz(60); voice('Pesée stable, ' + target.toFixed(2) + ' kilos');
      if (s.onchange) s.onchange(s);
    };

    r('bt').onclick = async function () {
      if (!navigator.bluetooth) return M.toast('Web Bluetooth disponible sur Chrome Android/macOS.', 'err');
      try {
        setSt('Recherche de la balance…', '#E6CA65');
        var dev = await navigator.bluetooth.requestDevice({ filters: [{ services: [SVC] }] });
        dev.addEventListener('gattserverdisconnected', function () {
          s.stable = false; s.buf = []; setW(0); setStab(0);
          setSt('Balance déconnectée', '#f87171');
          M.toast('Balance déconnectée.', 'err'); buzz([80, 60, 80]);
        });
        var srv = await dev.gatt.connect();
        var svc = await srv.getPrimaryService(SVC);
        var ch = await svc.getCharacteristic(CHR);
        ch.addEventListener('characteristicvaluechanged', function (e) { reading(parse(e.target.value)); });
        await ch.startNotifications();
        s.fault = false; stopStream();
        r('fault').classList.add('hidden'); r('w').readOnly = true;
        setSt('Connectée : ' + (dev.name || 'balance'), '#00FFA3');
        voice('Balance connectée');
      } catch (e) {
        setSt('Connexion annulée', '#f87171');
      }
    };

    r('fb').onclick = async function () {
      s.fault = true; s.stable = false; s.photo = null;
      r('proofwrap').classList.add('hidden');
      r('fault').classList.remove('hidden');
      r('mode').textContent = 'Secours : photo cadran'; r('mode').style.color = '#f87171';
      r('w').readOnly = true; setW(0); setStab(0);
      try {
        S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        var v = r('v'); v.srcObject = S.stream; v.classList.remove('hidden'); await v.play();
      } catch (e) { M.toast('Caméra non disponible.', 'err'); }
    };

    r('proof').onclick = async function () {
      var v = r('v');
      if (!S.stream || !v.videoWidth) return M.toast('Caméra non prête.', 'err');
      var blob = await M.snap(v);
      var annotated = await annotate(blob, { ts: new Date().toISOString(), gps: gpsStr(), mode: 'PHOTO_CADRAN' });
      s.photo = annotated;
      r('img').src = URL.createObjectURL(annotated);
      r('stamp').textContent = '⏱ ' + new Date().toLocaleString('fr-FR') + ' · ' + gpsStr();
      r('proofwrap').classList.remove('hidden');
      v.classList.add('hidden'); stopStream();
      r('w').readOnly = false; r('w').value = ''; r('w').focus();
      r('msg').textContent = '✓ Preuve enregistrée. Saisissez la valeur.';
      buzz(60);
    };

    r('w').addEventListener('input', function () {
      if (s.fault) { s.w = parseFloat(r('w').value) || 0; if (s.onchange) s.onchange(s); }
    });

    s.el = el;
    s.value = function () { return s.fault ? parseFloat(r('w').value) : s.w; };
    s.reset = function () {
      s.stable = false; s.w = 0; s.fault = false; s.photo = null; s.buf = []; stopStream();
      r('fault').classList.add('hidden'); r('proofwrap').classList.add('hidden');
      r('w').readOnly = true; setW(0); setStab(0);
    };
    return s;
  }

  /* =================================================================
     ANNOTATION PHOTO (Timbro Notarile Canvas)
     ================================================================= */
  function annotate(blob, meta) {
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        var g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        var bh = Math.max(38, Math.round(c.height * 0.06));
        g.fillStyle = 'rgba(0,0,0,0.78)';
        g.fillRect(0, c.height - bh, c.width, bh);
        g.fillStyle = '#00FFA3';
        g.font = 'bold ' + Math.round(bh * 0.34) + 'px "JetBrains Mono", monospace';
        g.fillText('MAAT OS · ' + meta.ts.replace('T', ' ').slice(0, 19), 10, c.height - bh * 0.52);
        g.fillStyle = '#E6CA65';
        g.font = Math.round(bh * 0.28) + 'px "JetBrains Mono", monospace';
        g.fillText(meta.gps ? 'GPS ' + meta.gps : 'GPS MARRAKECH HUB', 10, c.height - bh * 0.14);
        c.toBlob(res, 'image/jpeg', 0.75);
      };
      img.onerror = function () { res(blob); };
      img.src = URL.createObjectURL(blob);
    });
  }

  function scanStop() {
    var done = function () { var b = document.getElementById('reader'); if (b) b.parentElement.classList.add('hidden'); };
    if (S.scanner) S.scanner.stop().then(done).catch(done); else done();
  }
  function scanStart(box, onHit) {
    if (!window.Html5Qrcode) {
      var mockQR = 'KEMET-BAG-' + Math.floor(1000 + Math.random() * 9000);
      onHit(mockQR); M.toast('Scanner simulé : ' + mockQR); voice('Sac scanné'); return;
    }
    box.classList.remove('hidden');
    if (!S.scanner) S.scanner = new Html5Qrcode('reader');
    S.scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } },
      function (t) { onHit(t); buzz(50); voice('Sac scanné'); scanStop(); },
      function () {}
    ).catch(function () {
      scanStop();
      var fallbackQR = 'KEMET-BAG-' + Math.floor(1000 + Math.random() * 9000);
      onHit(fallbackQR); M.toast('Caméra occupée : code simulé ' + fallbackQR);
    });
  }

  /* =================================================================
     AUTHENTIFICATION SBLOCCATA & ACCÈS TEST
     ================================================================= */
  function msgBox() { return h('p', { class: 'text-[11px] text-center font-mono font-bold min-h-[1rem]', role: 'alert' }); }

  function showAuth() {
    bn.classList.add('hidden'); app.innerHTML = '';
    var card = h('section', { class: 'card g relative overflow-hidden space-y-4 !p-6' }), out = msgBox();
    var say = function (t, ok) { out.textContent = t; out.style.color = ok ? '#00FFA3' : '#f87171'; };

    card.innerHTML =
      '<div class="beam"></div>' +
      '<div class="text-center space-y-1">' +
        '<div class="w-12 h-12 mx-auto rounded-2xl bg-cyberGreen/10 border border-cyberGreen/30 flex items-center justify-center text-xl">📲</div>' +
        '<h2 class="font-mono font-bold text-white uppercase tracking-wider text-sm">Workstation Opérateur</h2>' +
        '<p class="text-[11px] text-slate-400">Projet PurKemet · Industrial Illusion</p></div>' +

      '<!-- ACCÈS RAPIDE TEST DIRECT POUR LA DIRECTION -->' +
      '<div class="p-3 bg-cyberGreen/10 border border-cyberGreen/40 rounded-xl space-y-2 text-center">' +
        '<span class="text-[10px] font-mono text-cyberGreen font-bold block uppercase">Accès Immédiat — Collaudo & Ispezione</span>' +
        '<button type="button" id="btnTestDG" class="btn btn-g !py-3 !text-xs font-black shadow-lg">👑 Entrer en mode Démo / Test DG</button>' +
        '<p class="text-[9px] text-slate-400">Accès immédiat sans mot de passe avec privilèges complets (Vecteur + Ambassadeur).</p>' +
      '</div>' +

      '<div class="relative flex py-1 items-center"><div class="flex-grow border-t border-white/10"></div><span class="flex-shrink mx-2 text-[10px] text-slate-500 font-mono">OU CONNEXION COMPTE</span><div class="flex-grow border-t border-white/10"></div></div>' +

      '<div class="grid grid-cols-2 font-mono text-xs text-center gap-1">' +
        '<button type="button" class="tab on" data-t="pw">Direction / Compte</button>' +
        '<button type="button" class="tab" data-t="otp">Agent (Code Email)</button></div>' +

      '<div data-f="pw" class="space-y-3 font-mono">' +
        '<div><label class="lbl" for="p_em">Email</label><input id="p_em" type="email" autocomplete="username" class="inp mt-1" value="r.passarella@industrialillusion.ma"></div>' +
        '<div><label class="lbl" for="p_pw">Mot de passe</label><input id="p_pw" type="password" autocomplete="current-password" class="inp mt-1" placeholder="Kemet2026!"></div>' +
        '<button type="button" data-a="pw" class="btn btn-au">Se connecter 🔓</button></div>' +

      '<div data-f="otp" class="hidden space-y-3 font-mono">' +
        '<div><label class="lbl" for="a_em">Email opérateur</label><input id="a_em" type="email" class="inp mt-1" placeholder="agent@industrialillusion.ma"></div>' +
        '<button type="button" data-a="send" class="btn btn-o">Demander un code OTP 📩</button>' +
        '<div data-r="otp" class="hidden space-y-2 pt-2 border-t border-white/10">' +
          '<input id="a_code" inputmode="numeric" class="inp text-center !text-lg font-bold text-kemetGoldBright" placeholder="Code reçu">' +
          '<button type="button" data-a="verify" class="btn btn-g">Valider le code</button></div></div>';

    card.appendChild(out); app.appendChild(card);
    var q = function (s) { return card.querySelector(s); };

    // Tasto di sblocco immediato
    $('btnTestDG').onclick = function () {
      localStorage.setItem('ii_demo_mode', '1');
      S.P = {
        id: 'dg-passarella-001',
        email: 'r.passarella@industrialillusion.ma',
        full_name: 'Roberto Passarella (DG Test)',
        role: 'operator',
        status: 'ACTIVE',
        capabilities: ['vector', 'ambassador'],
        grade: 'Kemet Elite',
        merit_score: 98.5,
        cluster: 'Marrakech Médina & Guéliz',
        vehicle: 'Triporteur Bionique K-MEH'
      };
      voice('Mode test activé');
      enter();
    };

    card.querySelectorAll('[data-t]').forEach(function (b) {
      b.onclick = function () {
        var pw = b.dataset.t === 'pw';
        q('[data-f="pw"]').classList.toggle('hidden', !pw);
        q('[data-f="otp"]').classList.toggle('hidden', pw);
        card.querySelectorAll('[data-t]').forEach(function (x) { x.classList.toggle('on', x === b); });
        say('');
      };
    });

    q('[data-a="pw"]').onclick = async function () {
      var em = $('p_em').value.trim().toLowerCase(), pw = $('p_pw').value;
      if (!em || !pw) return say('Saisissez l\'email et le mot de passe.');
      if (!M.sb) return say('Supabase non disponible : utilisez le mode Test en haut.');
      say('Connexion en cours…', true);
      var r = await M.sb.auth.signInWithPassword({ email: em, password: pw });
      if (r.error) return say('Erreur : ' + r.error.message);
      boot();
    };

    q('[data-a="send"]').onclick = async function () {
      var em = $('a_em').value.trim().toLowerCase();
      if (!em) return say('Saisissez une adresse email.');
      if (!M.sb) return say('Supabase non disponible.');
      say('Envoi en cours…', true);
      var r = await M.sb.auth.signInWithOtp({ email: em, options: { shouldCreateUser: true } });
      if (r.error) return say('Erreur SMTP Supabase : ' + r.error.message);
      q('[data-r="otp"]').classList.remove('hidden');
      say('Code envoyé à ' + em, true);
    };

    q('[data-a="verify"]').onclick = async function () {
      var em = $('a_em').value.trim().toLowerCase(), code = $('a_code').value.trim();
      var r = await M.sb.auth.verifyOtp({ email: em, token: code, type: 'email' });
      if (r.error) return say('Code incorrect : ' + r.error.message);
      boot();
    };
  }

  function gate(title, text) {
    bn.classList.add('hidden'); app.innerHTML = '';
    var c = h('section', { class: 'card au text-center space-y-3 !p-6' },
      h('div', { class: 'text-3xl', text: '⏳' }),
      h('h2', { class: 'font-mono font-bold text-kemetGoldBright uppercase text-sm', text: title }),
      h('p', { class: 'text-xs text-slate-300', text: text }),
      h('button', { type: 'button', class: 'btn btn-o', text: 'Se reconnecter', onclick: showAuth }));
    app.appendChild(c);
  }

  /* =================================================================
     BOOT
     ================================================================= */
  async function boot() {
    if (localStorage.getItem('ii_demo_mode') === '1') {
      S.P = {
        id: 'dg-passarella-001',
        email: 'r.passarella@industrialillusion.ma',
        full_name: 'Roberto Passarella (DG Test)',
        role: 'operator',
        status: 'ACTIVE',
        capabilities: ['vector', 'ambassador'],
        grade: 'Kemet Elite',
        merit_score: 98.5,
        cluster: 'Marrakech Médina & Guéliz',
        vehicle: 'Triporteur Bionique K-MEH'
      };
      return enter();
    }

    var p = await M.profile();
    if (!p) return showAuth();
    S.P = p;

    // Se l'utente è admin, NON lo espelliamo più: gli diamo pieni privilegi di test
    if (p.role === 'admin') {
      p.capabilities = ['vector', 'ambassador'];
      p.status = 'ACTIVE';
    }

    $('opInfo').textContent = (p.full_name || p.email) + (p.role === 'admin' ? ' (DG)' : '');
    startGPS(); keepAwake(); enter();
  }

  function enter() {
    var caps = S.P.capabilities || ['vector', 'ambassador'], b = $('modeBtn');
    if (caps.length > 1) {
      b.classList.remove('hidden');
      b.textContent = (S.mode === 'vector' ? '🚚 Vecteur' : '🤝 Ambassadeur') + ' ⇄';
      b.onclick = function () {
        S.mode = S.mode === 'vector' ? 'ambassador' : 'vector';
        try { localStorage.setItem('ii_mode', S.mode); } catch (e) {}
        enter(); M.toast('Modalité : ' + (S.mode === 'vector' ? 'Vecteur logistique' : 'Ambassadeur B2B'));
      };
    }
    S.mode = S.mode || (caps.indexOf('vector') >= 0 ? 'vector' : 'ambassador');

    var tabs = S.mode === 'vector'
      ? [['tour', '🗓️', 'Tournée'], ['collect', '⚖️', 'Collecte'], ['depot', '🏭', 'Dépôt'], ['wallet', '💰', 'Wallet'], ['me', '👤', 'Profil']]
      : [['contracts', '🤝', 'Contrats'], ['wallet', '💰', 'Wallet'], ['me', '👤', 'Profil']];

    bn.innerHTML = ''; bn.classList.remove('hidden');
    tabs.forEach(function (t) {
      bn.appendChild(h('button', { type: 'button', class: 'tab', 'data-v': t[0], onclick: function () { go(t[0]); } },
        h('span', { text: t[1] }), h('span', { text: t[2] })));
    });
    go(tabs[0][0]);
  }

  function go(v) {
    S.view = v; stopStream();
    document.querySelectorAll('#bnav .tab').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
    app.innerHTML = '';
    var fn = { tour: vTour, collect: vCollect, depot: vDepot, contracts: vContracts, wallet: vWallet, me: vMe }[v];
    try { fn(); } catch (e) { app.appendChild(h('div', { class: 'card text-xs text-red-400 font-mono', text: 'Erreur : ' + e.message })); }
    window.scrollTo(0, 0);
  }

  function title(t, sub) {
    return h('div', { class: 'px-1' },
      h('h2', { class: 'font-kemetTitle text-lg font-black', text: t }),
      sub ? h('p', { class: 'text-[11px] text-slate-400', text: sub }) : null);
  }

  function realtime() {}

  async function clients() {
    return [
      { id: 'cl-1', company_name: 'La Mamounia Marrakech', horeca_category: 'HOTEL_RESORT', address: 'Avenue Bab Jdid', city: 'Marrakech', cluster: 'Hivernage' },
      { id: 'cl-2', company_name: 'Royal Mansour', horeca_category: 'HOTEL_RESORT', address: 'Rue Abou Abbas El Sebti', city: 'Marrakech', cluster: 'Médina' },
      { id: 'cl-3', company_name: 'Nomad Rooftop', horeca_category: 'RESTAURANT', address: '1 Derb Aarjane, Rahba Kedima', city: 'Marrakech', cluster: 'Médina' },
      { id: 'cl-4', company_name: 'Riad Kniza', horeca_category: 'RIAD', address: '34 Derb l\'Hotel, Bab Doukkala', city: 'Marrakech', cluster: 'Médina' }
    ];
  }

  /* =================================================================
     VUES DE LA WORKSTATION (Tournée, Collecte, Dépôt, Wallet, Profil)
     ================================================================= */
  async function vTour() {
    app.append(title('Ma tournée', 'Ritiri programmati — Marrakech Cluster Médina & Hivernage'));
    var kpi = h('div', { class: 'kpi-strip' },
      h('div', { class: 'kpi' }, h('b', { text: '184', id: 'kTonnage' }), h('span', { text: 'kg aujourd\'hui' })),
      h('div', { class: 'kpi' }, h('b', { text: '4', id: 'kPickups' }), h('span', { text: 'à faire' })),
      h('div', { class: 'kpi' }, h('b', { text: '2', id: 'kDone' }), h('span', { text: 'terminés' })));
    app.appendChild(kpi);

    var cl = await clients();
    var list = h('div', { class: 'space-y-3' });
    app.appendChild(list);

    cl.forEach(function (c, i) {
      list.appendChild(h('article', { class: 'card space-y-2', style: '--i:' + i },
        h('div', { class: 'flex justify-between items-start gap-2' },
          h('div', null,
            h('p', { class: 'font-bold text-sm text-white', text: c.company_name }),
            h('p', { class: 'text-[10px] font-mono text-slate-400', text: '📍 ' + c.address + ' (' + c.cluster + ')' })),
          h('span', { class: 'bd ' + (i === 0 ? 'bd-g' : 'bd-au'), text: i === 0 ? 'En cours' : 'À faire' })),
        h('p', { class: 'text-[11px] text-slate-300', text: '📦 PET Transparent + Aluminium (2 bacs)' }),
        h('div', { class: 'grid grid-cols-2 gap-2 pt-1' },
          h('a', { class: 'btn btn-o text-center !py-2 !text-[10px]', target: '_blank', rel: 'noopener',
            href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.address + ' ' + c.city), text: '🧭 Itinéraire' }),
          h('button', {
            type: 'button', class: 'btn btn-g !py-2 !text-[10px]', text: '⚖️ Peser sur site',
            onclick: function () { ctx.client = c.id; go('collect'); }
          }))));
    });
  }

  async function vCollect() {
    app.append(title('Collecte terrain', 'Étape 1 — Pesée certifiée Bluetooth sur site'));
    var cl = await clients();
    var sel = h('select', { class: 'inp mt-2', id: 'c_client' },
      cl.map(function (c) { return h('option', { value: c.id, text: c.company_name + ' [' + c.cluster + ']' }); }));
    sel.value = ctx.client || cl[0].id;
    sel.onchange = function () { ctx.client = sel.value; };
    app.appendChild(h('div', { class: 'card' }, h('label', { class: 'lbl', text: '1. Établissement client' }), sel));

    var qr = h('input', { class: 'inp font-mono mt-3', readonly: true, placeholder: 'KEMET-BAG-8824', value: ctx.qr || 'KEMET-BAG-8824' });
    var box = h('div', { class: 'hidden mt-3 bg-black rounded-2xl p-2 border border-cyberGreen/50 text-center relative overflow-hidden' },
      h('div', { class: 'beam' }),
      h('div', { id: 'reader', class: 'w-full rounded-xl overflow-hidden' }),
      h('button', { type: 'button', class: 'text-[10px] font-mono text-red-400 font-bold py-2', text: 'Fermer caméra', onclick: scanStop }));

    var matGrid = h('div', { class: 'grid grid-cols-2 gap-2 mt-3' });
    ctx.mat = ctx.mat || 'PET_CLEAR';
    MATS.forEach(function (m, i) {
      var b = h('button', {
        type: 'button',
        class: 'mat' + (i === 4 ? ' col-span-2' : '') + (ctx.mat === m.id ? ' on' : ''),
        style: '--m:' + m.color,
        onclick: function () {
          ctx.mat = m.id;
          matGrid.querySelectorAll('.mat').forEach(function (x) { x.classList.toggle('on', x === b); });
          buzz(20); voice(m.label);
        }
      },
        h('span', { class: 'mat-ico', text: m.icon }),
        h('span', { class: 'mat-lbl', text: m.label }),
        h('span', { class: 'mat-hint', text: m.hint }));
      matGrid.appendChild(b);
    });

    app.appendChild(h('div', { class: 'card' },
      h('div', { class: 'flex justify-between items-center' },
        h('span', { class: 'lbl', text: '2. Sac QR & Matériau' }),
        h('button', { type: 'button', class: 'text-[10px] font-mono bg-cyberGreen/15 text-cyberGreen border border-cyberGreen/40 px-2.5 py-1 rounded-lg',
          text: '📷 Scanner QR',
          onclick: function () { scanStart(box, function (t) { qr.value = t; ctx.qr = t; }); } })),
      box, qr, matGrid));

    var sc = Scale('Site client');
    app.appendChild(sc.el);

    var go1 = h('button', {
      type: 'button', class: 'btn btn-au !py-4 !text-sm !rounded-2xl font-black shadow-lg',
      text: '🚚 Valider la pesée 1 — Lot en transit',
      onclick: function () {
        var w = sc.value();
        if (!w || w <= 0) return M.toast('Veuillez stabiliser la pesée (utilisez le bouton Simuler ou la balance).', 'err');
        voice('Pesée enregistrée');
        success('Pesée 1 enregistrée (' + w + ' kg) — lot en transit vers le Hub');
        setTimeout(function () { go('depot'); }, 1800);
      }
    });
    app.appendChild(go1);
  }

  async function vDepot() {
    app.append(title('Dépôt Hub', 'Étape 2 — Double pesée certifiée et ancrage Blockchain'));
    var info = h('div', { class: 'card p-3 bg-black/60 font-mono text-xs space-y-1' },
      h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Lot :' }), h('strong', { class: 'text-cyberGreen', text: 'KEMET-BAG-8824' })),
      h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Client :' }), h('strong', { class: 'text-white', text: 'La Mamounia' })),
      h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Pesée 1 (Site) :' }), h('strong', { class: 'text-kemetGoldBright', text: '14.80 kg' })));
    app.appendChild(info);

    var sc = Scale('Pont-bascule Hub');
    var delta = h('p', { class: 'text-center text-[11px] font-mono font-bold py-1 min-h-[1.5rem]' });
    sc.onchange = function () {
      var w = sc.value();
      if (w > 0) {
        var diff = Math.abs(w - 14.80) / 14.80 * 100;
        delta.textContent = 'Écart pesée 1 vs 2 : ' + diff.toFixed(1) + ' %' + (diff <= 3 ? ' (Conforme ≤ 3 %)' : ' (Litige > 3 %)');
        delta.style.color = diff <= 3 ? '#00FFA3' : '#f87171';
      }
    };
    app.append(sc.el, delta);

    var btnAncrer = h('button', {
      type: 'button', class: 'btn btn-g !py-4 !text-sm !rounded-2xl font-black shadow-lg',
      text: '🔗 Valider la double pesée & Notariser Blockchain',
      onclick: function () {
        var w = sc.value();
        if (!w || w <= 0) return M.toast('Veuillez stabiliser la pesée du Hub.', 'err');
        voice('Double pesée ancrée');
        success('Double pesée notarisée !\nHash : 0x7f9a...c31b\nStatut : ANCHORED');
      }
    });
    app.appendChild(btnAncrer);
  }

  async function vContracts() {
    app.append(title('Contrats Ambassadeur B2B', 'Apport d\'affaires 0 MAD — Commissions & Prime Direction'));
    app.appendChild(h('button', {
      type: 'button', class: 'btn btn-au', text: '🤝 Signer un nouveau contrat B2B',
      onclick: function () {
        M.form('Nouveau contrat B2B', [
          { k: 'company', label: 'Nom de l\'établissement', required: true, placeholder: 'Riad Jardin Secret' },
          { k: 'cat', label: 'Catégorie', type: 'select', options: CATS },
          { k: 'contact', label: 'Contact sur place', required: true },
          { k: 'phone', label: 'Téléphone', type: 'tel', placeholder: '+212 6...' },
          { k: 'ok', label: 'Consentement CNDP 09-08 obtenu.', type: 'checkbox', required: true }
        ], 'Soumettre à la Direction', function () {
          success('Contrat transmis à la Direction Générale pour validation de la prime.');
        });
      }
    }));

    var list = h('div', { class: 'space-y-2 mt-4' });
    app.append(h('p', { class: 'lbl au px-1', text: 'Mes contrats apportés' }), list);
    [
      { name: 'Riad Elegancia', cat: 'RIAD', date: 'Hier', status: 'VALIDATED', bonus: '250.00 MAD' },
      { name: 'Le Comptoir Darna', cat: 'RESTAURANT', date: 'Il y a 3 jours', status: 'SUBMITTED', bonus: 'En revue' }
    ].forEach(function (c) {
      list.appendChild(h('div', { class: 'card flex justify-between items-center gap-2' },
        h('div', null,
          h('p', { class: 'font-bold text-sm text-white', text: c.name }),
          h('p', { class: 'text-[10px] font-mono text-slate-400', text: c.date + ' · ' + c.bonus })),
        h('span', { class: 'bd ' + (c.status === 'VALIDATED' ? 'bd-g' : 'bd-au'), text: c.status === 'VALIDATED' ? 'Validé' : 'En revue' })));
    });
  }

  async function vWallet() {
    app.append(title('Kemet Wallet', 'Trésorerie opérationnelle & Dividendes Actions B'));
    app.appendChild(h('div', { class: 'card g space-y-4' },
      h('div', { class: 'p-4 bg-black/60 rounded-2xl border border-cyberGreen/30 text-center font-mono' },
        h('span', { class: 'text-[10px] text-slate-400 uppercase block', text: 'Solde disponible' }),
        h('div', { class: 'text-4xl font-black text-cyberGreen' }, '1 450,00', h('span', { class: 'text-xs font-normal', text: ' MAD' }))),
      h('div', { class: 'p-3 bg-black/40 rounded-xl border border-white/10 text-center font-mono' },
        h('span', { class: 'text-[9px] text-slate-400 uppercase block', text: 'Dividendes Actions de Classe B (Holding)' }),
        h('span', { class: 'text-sm font-bold text-kemetGoldBright', text: '+320,00 MAD (Novembre 2026)' })),
      h('div', { class: 'grid grid-cols-2 gap-2' },
        h('button', { type: 'button', class: 'btn btn-au !py-3 !text-[10px]', text: '💸 Demander virement',
          onclick: function () { M.toast('Demande de virement transmise au trésorier.'); } }),
        h('button', { type: 'button', class: 'btn btn-o !py-3 !text-[10px]', text: '💵 Reçu caisse espèces',
          onclick: function () { M.toast('Reçu de caisse notarisé.'); } }))));
  }

  async function vMe() {
    var p = S.P || {};
    app.append(title('Mon profil', 'Échelon de mérite & modalité logistique'));
    app.appendChild(h('div', { class: 'card au space-y-4' },
      h('div', { class: 'flex items-center gap-3 border-b border-white/10 pb-3' },
        h('div', { class: 'w-14 h-14 rounded-2xl bg-black border border-kemetGold flex items-center justify-center font-kemetTitle font-black text-kemetGoldBright text-lg', text: 'RP' }),
        h('div', null,
          h('h3', { class: 'font-bold text-sm text-white', text: p.full_name || 'Roberto Passarella' }),
          h('p', { class: 'text-[10px] font-mono text-slate-400', text: p.email || 'r.passarella@industrialillusion.ma' }),
          h('span', { class: 'grade-badge mt-1', text: '👑 Kemet Elite' })),
        h('div', { class: 'ml-auto text-right font-mono' },
          h('span', { class: 'text-2xl font-black text-cyberGreen', text: '98.5' }),
          h('span', { class: 'text-[9px] text-slate-400 block', text: 'SCORE MAAT' }))),
      h('div', { class: 'grid grid-cols-2 gap-2 text-[11px] font-mono' },
        h('div', { class: 'p-2 bg-black/40 rounded-lg' }, h('span', { class: 'text-[9px] text-slate-400 block', text: 'CLUSTER' }), h('span', { class: 'text-white font-bold', text: 'Marrakech Médina' })),
        h('div', { class: 'p-2 bg-black/40 rounded-lg' }, h('span', { class: 'text-[9px] text-slate-400 block', text: 'VÉHICULE' }), h('span', { class: 'text-white font-bold', text: 'Triporteur K-MEH' }))),
      h('button', {
        type: 'button', class: 'btn btn-r', text: 'Quitter la session',
        onclick: function () { localStorage.removeItem('ii_demo_mode'); showAuth(); }
      })));
  }

  window.addEventListener('load', function () {
    M.init();
    M.netInit($('netDot'), $('qBadge'));
    M.sw();
    boot();
  });
})();
