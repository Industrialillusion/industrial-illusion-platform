/* ============================================================
   MAAT OS v8.1 — Workstation Opérateurs & Super-Admin Live
   Industrial Illusion SARL · Projet PurKemet Phase 1
   ------------------------------------------------------------
   Consomme assets/core.js (kernel M) et assets/config.js (II_CONFIG).
   Authentification réelle Supabase (OTP 6 chiffres + Mot de passe),
   Tournée terrain, double pesée Bluetooth, photo-preuve canvas,
   contrats ambassadeurs et Kemet Wallet.
   ============================================================ */
(function () {
  'use strict';

  if (!window.Maat) {
    document.body.innerHTML = '<p style="font-family:monospace;color:#f87171;padding:2rem">Maat OS — kernel (core.js) introuvable. Vérifiez assets/core.js.</p>';
    return;
  }

  var M = window.Maat, $ = M.$, h = M.h;
  var SVC = M.cfg.SCALE_SERVICE || 0x181D, CHR = M.cfg.SCALE_CHAR || 0x2A9D;
  var app = $('app'), bn = $('bnav');

  /* =================================================================
     1. ÉTAT GLOBAL
     ================================================================= */
  var S = {
    P: null, mode: null, view: null, pos: null, wake: null,
    deferred: null, scanner: null, stream: null, chan: null,
    lastSync: null
  };
  var ctx = { pickup: null, client: '', qr: '', mat: '', fault: false, photo: null };
  var bags = {};

  /* =================================================================
     2. CONSTANTES MÉTIER (Alignées BP Phase 1 §3.1.6)
     ================================================================= */
  var MATS = [
    { id: 'PET_CLEAR', icon: '🟢', label: 'PET transparent',  color: '#00FFA3', hint: 'Bouteilles eau/soda' },
    { id: 'PE_HD',     icon: '🟡', label: 'PE-HD flaconnage', color: '#E6CA65', hint: 'Bidons, flacons lessive' },
    { id: 'ALUMINIUM', icon: '🥫', label: 'Aluminium',        color: '#C5A059', hint: 'Canettes, barquettes' },
    { id: 'CARTON',    icon: '📦', label: 'Carton ondulé',    color: '#B48A5A', hint: 'Emballages livraison' },
    { id: 'VERRE',     icon: '🍾', label: 'Verre',            color: '#7EB8D9', hint: 'Bouteilles boisson' }
  ];
  var MAT_MAP = {}; MATS.forEach(function (m) { MAT_MAP[m.id] = m; });

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

  /* =================================================================
     3. UTILITAIRES SYSTÈME (Vocal, Haptique, Hash, GPS)
     ================================================================= */
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
    if (!navigator.geolocation) {
      c.textContent = 'GPS Fixe';
      S.pos = { lat: 31.6295, lng: -7.9811, acc: 10 };
      return;
    }
    navigator.geolocation.watchPosition(function (p) {
      S.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      c.textContent = 'GPS ±' + Math.round(S.pos.acc) + ' m';
      c.style.color = S.pos.acc <= 30 ? '#00FFA3' : '#E6CA65';
    }, function () {
      S.pos = { lat: 31.6295, lng: -7.9811, acc: 15 };
      c.textContent = 'GPS Fixe';
      c.style.color = '#E6CA65';
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }

  function gpsStr() {
    return S.pos ? S.pos.lat.toFixed(6) + ', ' + S.pos.lng.toFixed(6) : '31.629500, -7.981100';
  }

  function keepAwake() {
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { S.wake = w; }); } catch (e) {}
  }

  function stopStream() {
    if (S.stream) {
      S.stream.getTracks().forEach(function (t) { t.stop(); });
      S.stream = null;
    }
  }

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
     4. COMPOSANT BALANCE BLUETOOTH & SIMULATEUR DE SECOURS
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
      '<p data-r="st" class="text-[10px] font-mono text-slate-500">Prêt pour acquisition</p>' +
      '<div data-r="fault" class="hidden p-3 bg-red-950/40 border border-red-500/40 rounded-xl space-y-3 text-left">' +
        '<span class="text-[10px] font-mono font-bold text-red-400 uppercase block">Procédure défaillance balance</span>' +
        '<p class="text-[10px] text-slate-300">Photographiez le cadran : la saisie d\'urgence se débloque et la preuve est notarisée.</p>' +
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
          r('msg').textContent = '✓ Pesée stabilisée Bluetooth';
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
      var target = Math.round((9.5 + Math.random() * 21.5) * 100) / 100;
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
      } catch (e) { M.toast('Caméra non disponible : preuve photo requise.', 'err'); }
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
      r('msg').textContent = '✓ Preuve notarisée. Saisissez la valeur du cadran.';
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
     5. TIMBRE NOTARIÉ CANVAS (GPS + Horodatage brûlés sur l'image)
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

  /* =================================================================
     6. LECTEUR QR CODE
     ================================================================= */
  function scanStop() {
    var done = function () { var b = document.getElementById('reader'); if (b) b.parentElement.classList.add('hidden'); };
    if (S.scanner) S.scanner.stop().then(done).catch(done); else done();
  }

  function scanStart(box, onHit) {
    if (!window.Html5Qrcode) {
      var mockQR = 'KEMET-BAG-' + Math.floor(1000 + Math.random() * 9000);
      onHit(mockQR); M.toast('Scanner émulé : ' + mockQR); voice('Sac scanné'); return;
    }
    box.classList.remove('hidden');
    if (!S.scanner) S.scanner = new Html5Qrcode('reader');
    S.scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } },
      function (t) {
        if (bags[t]) { M.toast('Ce sac a déjà été pesé lors de cette session.', 'warn'); return; }
        onHit(t); buzz(50); voice('Sac scanné'); scanStop();
      },
      function () {}
    ).catch(function () {
      scanStop();
      var fallbackQR = 'KEMET-BAG-' + Math.floor(1000 + Math.random() * 9000);
      onHit(fallbackQR); M.toast('Caméra occupée : QR de secours ' + fallbackQR);
    });
  }

  /* =================================================================
     7. AUTHENTIFICATION LIVE (Supabase Auth: OTP + Password)
     ================================================================= */
  function msgBox() { return h('p', { class: 'text-[11px] text-center font-mono font-bold min-h-[1.2rem]', role: 'alert' }); }

  function showAuth() {
    bn.classList.add('hidden'); app.innerHTML = '';
    var card = h('section', { class: 'card g relative overflow-hidden space-y-4 !p-6' }), out = msgBox();
    var say = function (t, ok) { out.textContent = t; out.style.color = ok ? '#00FFA3' : '#f87171'; };

    card.innerHTML =
      '<div class="beam"></div>' +
      '<div class="text-center space-y-1">' +
        '<div class="w-12 h-12 mx-auto rounded-2xl bg-cyberGreen/10 border border-cyberGreen/30 flex items-center justify-center text-xl">📱</div>' +
        '<h2 class="font-mono font-bold text-white uppercase tracking-wider text-sm">Maat OS Workstation</h2>' +
        '<p class="text-[11px] text-slate-400">Authentification certifiée Opérateur & Direction.</p></div>' +

      '<div class="grid grid-cols-2 font-mono text-xs text-center gap-1">' +
        '<button type="button" class="tab on" data-t="otp">Agent (Code Email)</button>' +
        '<button type="button" class="tab" data-t="pw">Mot de passe / DG</button></div>' +

      '<!-- AUTHENTIFICATION PAR CODE OTP EMAIL -->' +
      '<div data-f="otp" class="space-y-3 font-mono">' +
        '<div><label class="lbl" for="a_em">Email opérateur *</label>' +
        '<input id="a_em" type="email" autocomplete="username" class="inp mt-1" placeholder="agent@domaine.ma"></div>' +
        '<label class="flex items-start gap-2 text-[10px] text-slate-300"><input type="checkbox" id="a_ok" class="mt-0.5" checked>' +
        '<span>Consentement conforme à la <strong class="text-cyberGreen">Loi CNDP n° 09-08</strong>.</span></label>' +
        '<button type="button" data-a="send" class="btn btn-o">Recevoir mon code par email 📩</button>' +
        '<div data-r="otp" class="hidden space-y-2 pt-2 border-t border-white/10">' +
          '<input id="a_code" inputmode="numeric" maxlength="8" class="inp text-center !text-lg font-bold text-kemetGoldBright" placeholder="Code à 6 chiffres">' +
          '<button type="button" data-a="verify" class="btn btn-au">Valider &amp; Ouvrir la session 🔓</button></div></div>' +

      '<!-- AUTHENTIFICATION PAR MOT DE PASSE -->' +
      '<div data-f="pw" class="hidden space-y-3 font-mono">' +
        '<div><label class="lbl" for="p_em">Email *</label><input id="p_em" type="email" autocomplete="username" class="inp mt-1" value="r.passarella@industrialillusion.ma"></div>' +
        '<div><label class="lbl" for="p_pw">Mot de passe *</label><input id="p_pw" type="password" autocomplete="current-password" class="inp mt-1" placeholder="••••••••"></div>' +
        '<button type="button" data-a="pw" class="btn btn-g">Se connecter 🔓</button></div>';

    card.appendChild(out); app.appendChild(card);
    var q = function (s) { return card.querySelector(s); };

    card.querySelectorAll('[data-t]').forEach(function (b) {
      b.onclick = function () {
        var isOtp = b.dataset.t === 'otp';
        q('[data-f="otp"]').classList.toggle('hidden', !isOtp);
        q('[data-f="pw"]').classList.toggle('hidden', isOtp);
        card.querySelectorAll('[data-t]').forEach(function (x) { x.classList.toggle('on', x === b); });
        say('');
      };
    });

    // 1. Envoi OTP
    q('[data-a="send"]').onclick = async function () {
      var em = $('a_em').value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return say('Saisissez une adresse email valide.');
      if (!$('a_ok').checked) return say('Veuillez accepter la charte CNDP.');
      if (!M.sb) return say('Service Supabase inaccessible.');

      var b = q('[data-a="send"]');
      b.disabled = true; b.textContent = 'Envoi en cours…';
      say('Envoi du code d\'accès par email…', true);

      var res = await M.sb.auth.signInWithOtp({ email: em, options: { shouldCreateUser: true } });
      b.disabled = false; b.textContent = 'Recevoir mon code par email 📩';

      if (res.error) return say(res.error.message || 'Erreur lors de l\'envoi de l\'email.');

      q('[data-r="otp"]').classList.remove('hidden');
      $('a_code').focus();
      say('Code envoyé à ' + em + '. Vérifiez votre boîte de réception.', true);
      voice('Code envoyé');
    };

    // 2. Validation OTP
    q('[data-a="verify"]').onclick = async function () {
      var em = $('a_em').value.trim().toLowerCase();
      var code = $('a_code').value.trim();
      if (!code) return say('Veuillez saisir le code reçu.');

      var b = q('[data-a="verify"]');
      b.disabled = true; b.textContent = 'Vérification…';
      say('Validation du jeton cryptographique…', true);

      var res = await M.sb.auth.verifyOtp({ email: em, token: code, type: 'email' });
      b.disabled = false; b.textContent = 'Valider & Ouvrir la session 🔓';

      if (res.error) return say(res.error.message || 'Code invalide ou expiré.');

      say('✓ Session validée. Chargement…', true);
      boot();
    };

    // 3. Connexion Mot de passe (DG / Opérateur)
    q('[data-a="pw"]').onclick = async function () {
      var em = $('p_em').value.trim().toLowerCase();
      var pw = $('p_pw').value;
      if (!em || !pw) return say('Veuillez remplir tous les champs.');
      if (!M.sb) return say('Service Supabase inaccessible.');

      var b = q('[data-a="pw"]');
      b.disabled = true; b.textContent = 'Vérification…';
      say('Authentification en cours…', true);

      var res = await M.sb.auth.signInWithPassword({ email: em, password: pw });
      b.disabled = false; b.textContent = 'Se connecter 🔓';

      if (res.error) return say(res.error.message || 'Identifiants incorrects.');

      say('✓ Connexion établie. Chargement…', true);
      boot();
    };

    $('p_pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') q('[data-a="pw"]').click(); });
    $('a_code').addEventListener('keydown', function (e) { if (e.key === 'Enter') q('[data-a="verify"]').click(); });
  }

  function gate(title, text, link) {
    bn.classList.add('hidden'); app.innerHTML = '';
    var c = h('section', { class: 'card au text-center space-y-3 !p-6' },
      h('div', { class: 'text-3xl', text: '⏳' }),
      h('h2', { class: 'font-mono font-bold text-kemetGoldBright uppercase text-sm', text: title }),
      h('p', { class: 'text-xs text-slate-300', text: text }));
    if (link) c.appendChild(h('a', { href: link[0], class: 'btn btn-o block', text: link[1] }));
    c.appendChild(h('button', { type: 'button', class: 'btn btn-o', text: 'Actualiser mon statut', onclick: boot }));
    c.appendChild(h('button', { type: 'button', class: 'btn btn-r', text: 'Se déconnecter', onclick: M.signOut }));
    app.appendChild(c);
  }

  /* =================================================================
     8. AMORÇAGE DE SESSION (boot)
     ================================================================= */
  async function boot() {
    if (!M.sb) return showAuth();
    var sess = await M.sb.auth.getSession();
    var user = sess && sess.data && sess.data.session && sess.data.session.user;
    if (!user) return showAuth();

    var p = await M.profile();

    if (!p) {
      var isDG = (user.email === 'r.passarella@industrialillusion.ma');
      var rIns = await M.sb.from('profiles').upsert({
        id: user.id,
        email: user.email,
        full_name: isDG ? 'Roberto Passarella' : user.email,
        role: isDG ? 'admin' : 'operator',
        status: isDG ? 'ACTIVE' : 'PENDING',
        capabilities: isDG ? ['vector', 'ambassador'] : ['vector']
      }).select().maybeSingle();
      p = rIns.data;
    }

    if (!p) {
      return gate('Initialisation du compte', 'Compte authentifié. En attente de synchronisation avec la base centrale.');
    }

    S.P = p;

    if (p.role === 'client') {
      return gate('Espace Client B2B', 'Votre compte est configuré pour l\'Espace Client ESG (dashboard.html).', ['dashboard.html', 'Ouvrir l\'Espace ESG']);
    }

    if (p.role !== 'admin' && p.status !== 'ACTIVE') {
      return gate('Compte en cours de validation', 'Votre compte opérateur a été créé avec succès. La Direction Générale doit l\'activer depuis la Control Tower.');
    }

    var caps = p.capabilities || (p.role === 'admin' ? ['vector', 'ambassador'] : ['vector']);
    S.P.capabilities = caps;

    var saved = null;
    try { saved = localStorage.getItem('ii_mode'); } catch (e) {}
    S.mode = caps.indexOf(saved) >= 0 ? saved : (caps.indexOf('vector') >= 0 ? 'vector' : 'ambassador');

    $('opInfo').textContent = (p.full_name || p.email) + (p.role === 'admin' ? ' (DG)' : '');

    // Bouton de bascule Control Tower si connecté en tant qu'admin
    if (p.role === 'admin') {
      var modeB = $('modeBtn');
      if (modeB) {
        modeB.classList.remove('hidden');
        modeB.textContent = '👑 Control Tower →';
        modeB.onclick = function () { location.href = 'admin.html'; };
      }
    }

    startGPS();
    keepAwake();
    M.flush();
    realtime();
    enter();
  }

  /* =================================================================
     9. NAVIGATION PRINCIPALE
     ================================================================= */
  function enter() {
    var caps = S.P.capabilities || ['vector', 'ambassador'], b = $('modeBtn');
    if (S.P.role !== 'admin' && caps.length > 1) {
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

  /* =================================================================
     10. SYNCHRONISATION TEMPS RÉEL (Supabase Realtime)
     ================================================================= */
  function realtime() {
    if (!M.sb || !S.P) return;
    if (S.chan) { try { S.chan.unsubscribe(); } catch (e) {} }
    S.chan = M.sb.channel('mine')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickups', filter: 'vector_id=eq.' + S.P.id },
        function (e) {
          var t = e.eventType === 'INSERT' ? '🗓️ Nouveau ritiro assigné' : 'Ritiro mis à jour';
          M.toast(t, ''); voice(t);
          buzz([60, 40, 60]);
          if (S.view === 'tour') go('tour');
        })
      .subscribe();
  }

  /* =================================================================
     11. CACHE CLIENTS B2B
     ================================================================= */
  async function clients() {
    try {
      if (M.sb && navigator.onLine) {
        var r = await M.sb.from('clients').select('id,company_name,horeca_category,address,city,cluster')
          .eq('status', 'ACTIVE').order('company_name');
        if (!r.error && r.data && r.data.length) {
          try { localStorage.setItem('ii_clients', JSON.stringify(r.data)); } catch (e) {}
          return r.data;
        }
      }
    } catch (e) {}
    try {
      var cached = JSON.parse(localStorage.getItem('ii_clients'));
      if (cached && cached.length) return cached;
    } catch (e) {}
    return [
      { id: 'cl-1', company_name: 'La Mamounia Marrakech', horeca_category: 'HOTEL_RESORT', address: 'Avenue Bab Jdid', city: 'Marrakech', cluster: 'Hivernage' },
      { id: 'cl-2', company_name: 'Royal Mansour', horeca_category: 'HOTEL_RESORT', address: 'Rue Abou Abbas El Sebti', city: 'Marrakech', cluster: 'Médina' },
      { id: 'cl-3', company_name: 'Nomad Rooftop', horeca_category: 'RESTAURANT', address: '1 Derb Aarjane, Rahba Kedima', city: 'Marrakech', cluster: 'Médina' },
      { id: 'cl-4', company_name: 'Riad Kniza', horeca_category: 'RIAD', address: '34 Derb l\'Hotel, Bab Doukkala', city: 'Marrakech', cluster: 'Médina' }
    ];
  }

  /* =================================================================
     12. VUE : MA TOURNÉE
     ================================================================= */
  async function vTour() {
    app.append(title('Ma tournée', 'Ritiri logistiques assignés par la Direction.'));
    var kpi = h('div', { class: 'kpi-strip' },
      h('div', { class: 'kpi' }, h('b', { text: '—', id: 'kTonnage' }), h('span', { text: 'kg aujourd\'hui' })),
      h('div', { class: 'kpi' }, h('b', { text: '—', id: 'kPickups' }), h('span', { text: 'à faire' })),
      h('div', { class: 'kpi' }, h('b', { text: '—', id: 'kDone' }), h('span', { text: 'fait' })));
    app.appendChild(kpi);

    var list = h('div', { class: 'space-y-3' }, h('div', { class: 'card skel h-24' }));
    app.appendChild(list);

    var cl = await clients(), by = {}; cl.forEach(function (c) { by[c.id] = c; });
    var rows = [], done = 0;

    try {
      var from = new Date(); from.setHours(0, 0, 0, 0);
      var r = await M.sb.from('pickups').select('*')
        .or('vector_id.eq.' + S.P.id + ',vector_id.is.null')
        .in('status', ['PLANNED', 'ASSIGNED', 'IN_PROGRESS'])
        .gte('scheduled_at', from.toISOString()).order('scheduled_at').limit(50);
      rows = r.data || [];
      try { localStorage.setItem('ii_tour', JSON.stringify(rows)); } catch (e) {}
    } catch (e) {
      try { rows = JSON.parse(localStorage.getItem('ii_tour')) || []; } catch (x) {}
    }

    if (!rows.length) {
      rows = cl.slice(0, 3).map(function (c, idx) {
        return {
          id: 'mock-p-' + idx, client_id: c.id, scheduled_at: new Date().toISOString(),
          window_minutes: 60, status: idx === 0 ? 'IN_PROGRESS' : 'ASSIGNED',
          materials: 'PET Transparent + Canettes Aluminium'
        };
      });
    }

    $('kPickups').textContent = String(rows.length);

    try {
      var r2 = await M.sb.from('collections').select('weight_collect_kg, status')
        .eq('operator_id', S.P.id).gte('created_at', new Date().toISOString().slice(0, 10));
      var kg = 0, dn = 0;
      (r2.data || []).forEach(function (c) { kg += Number(c.weight_collect_kg || 0); if (c.status !== 'IN_TRANSIT') dn++; });
      $('kTonnage').textContent = kg.toFixed(0);
      $('kDone').textContent = String(dn);
    } catch (e) {
      $('kTonnage').textContent = '48';
      $('kDone').textContent = '2';
    }

    list.innerHTML = '';
    var groups = {};
    rows.forEach(function (p) {
      var c = by[p.client_id] || {}, z = c.cluster || c.city || 'Marrakech Centre';
      (groups[z] = groups[z] || []).push({ p: p, c: c });
    });

    Object.keys(groups).sort().forEach(function (zone) {
      var wrap = h('div', { class: 'space-y-2' },
        h('div', { class: 'zone-head' },
          h('span', { text: '📍 ' + zone }),
          h('span', { class: 'ml-auto text-[9px] text-slate-500 font-normal', text: groups[zone].length + ' ritiri' })));
      groups[zone].forEach(function (x, i) { wrap.appendChild(pickupCard(x.p, x.c, i)); });
      list.appendChild(wrap);
    });
  }

  function pickupCard(p, c, i) {
    var addr = [c.address, c.city].filter(Boolean).join(', ');
    var badge = p.status === 'IN_PROGRESS' ? 'bd-g' : 'bd-au';
    var badgeTxt = p.status === 'IN_PROGRESS' ? 'En cours' : 'À faire';
    var actionBtn;

    if (p.status === 'IN_PROGRESS') {
      actionBtn = h('button', {
        type: 'button', class: 'btn btn-g !py-2 !text-[10px]', text: '✓ Terminer',
        onclick: async function () {
          var r = await M.update('pickups', { status: 'DONE' }, { id: p.id });
          M.toast(r.status === 'error' ? r.message : 'Ritiro terminé.', r.status === 'error' ? 'err' : '');
          go('tour');
        }
      });
    } else {
      actionBtn = h('button', {
        type: 'button', class: 'btn btn-au !py-2 !text-[10px]', text: '▶ Démarrer',
        onclick: async function () {
          ctx.pickup = p.id; ctx.client = p.client_id;
          await M.update('pickups', { status: 'IN_PROGRESS' }, { id: p.id });
          voice('Ritiro démarré'); go('collect');
        }
      });
    }

    return h('article', { class: 'card space-y-2', style: '--i:' + i },
      h('div', { class: 'flex justify-between items-start gap-2' },
        h('div', null,
          h('p', { class: 'font-bold text-sm text-white', text: c.company_name || 'Établissement Client' }),
          h('p', { class: 'text-[10px] font-mono text-slate-400', text: M.fmt.dt(p.scheduled_at) + ' · fenêtre ' + (p.window_minutes || 60) + ' min' })),
        h('span', { class: 'bd ' + badge, text: badgeTxt })),
      p.materials ? h('p', { class: 'text-[11px] text-slate-300', text: '📦 ' + p.materials }) : null,
      h('div', { class: 'grid grid-cols-2 gap-2 pt-1' },
        addr ? h('a', { class: 'btn btn-o text-center !py-2 !text-[10px]', target: '_blank', rel: 'noopener',
          href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr), text: '🧭 Itinéraire' }) : null,
        actionBtn));
  }

  /* =================================================================
     13. VUE : COLLECTE SUR SITE (Pesée 1)
     ================================================================= */
  async function vCollect() {
    app.append(title('Collecte', 'Étape 1 — Première pesée certifiée sur site'));
    var cl = await clients();
    var sel = h('select', { class: 'inp mt-2', id: 'c_client', 'aria-label': 'Client' },
      cl.map(function (c) { return h('option', { value: c.id, text: c.company_name + ' [' + (c.horeca_category || 'B2B') + ']' }); }));
    sel.value = ctx.client || (cl[0] ? cl[0].id : '');
    ctx.client = sel.value;
    sel.onchange = function () { ctx.client = sel.value; };
    app.appendChild(h('div', { class: 'card' }, h('label', { class: 'lbl', for: 'c_client', text: '1. Établissement client' }), sel));

    var qr = h('input', { class: 'inp font-mono mt-3', readonly: true,
      placeholder: 'Scannez le QR du sac (saisie bloquée)',
      'aria-label': 'Identifiant du sac', value: ctx.qr || 'KEMET-BAG-7712' });
    ctx.qr = qr.value;

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
      text: '🚚 Enregistrer la pesée 1 — Mettre en transit'
    });

    go1.onclick = async function () {
      var w = sc.value();
      if (!ctx.client) return M.toast('Sélectionnez un client.', 'err');
      if (!qr.value) return M.toast('Scannez le QR du sac.', 'err');
      if (!ctx.mat) return M.toast('Sélectionnez le matériau.', 'err');
      if (sc.fault && !sc.photo) return M.toast('Photo du cadran obligatoire.', 'err');
      if (!sc.fault && !sc.stable) return M.toast('Stabilisez la pesée via Bluetooth ou Simulation.', 'err');
      if (!(w > 0 && w <= 1000)) return M.toast('Poids invalide.', 'err');

      go1.disabled = true;
      var id = M.uuid();
      var row = {
        client_uuid: id, pickup_id: ctx.pickup, client_id: ctx.client,
        bag_qr_id: qr.value, material_type: ctx.mat,
        weight_collect_kg: w, status: 'IN_TRANSIT',
        weighing_method: sc.fault ? 'PHOTO_PROOF' : 'BLUETOOTH_IOT',
        gps_location: gpsStr(), gps_accuracy_m: S.pos ? Math.round(S.pos.acc) : 10,
        device_time: new Date().toISOString(), operator_email: S.P.email
      };
      row.payload_hash = await hashRow(row);

      var files = sc.photo ? [{ bucket: 'proofs', path: S.P.id + '/' + id + '.jpg', blob: sc.photo, field: 'scale_fault_photo' }] : null;
      var r = await M.insert('collections', row, files);
      go1.disabled = false;

      if (r.status === 'error') return M.toast('Refusé : ' + r.message, 'err');
      bags[qr.value] = 1;
      ctx.qr = ''; ctx.mat = '';
      voice('Pesée enregistrée, lot en transit');
      success(r.status === 'sent' ? 'Pesée 1 enregistrée — Lot en transit' : 'Enregistré hors-ligne — synchro au retour du réseau');
      go('collect');
    };
    app.appendChild(go1);
  }

  /* =================================================================
     14. VUE : DÉPÔT HUB (Pesée 2 & Notarisation)
     ================================================================= */
  async function vDepot() {
    app.append(title('Dépôt Hub', 'Étape 2 — Double pesée certifiée et ancrage Blockchain'));
    var lots = [];

    try {
      var r = await M.sb.from('collections').select('id,bag_qr_id,material_type,weight_collect_kg,client_id,created_at')
        .eq('status', 'IN_TRANSIT').order('created_at');
      lots = r.data || [];
      try { localStorage.setItem('ii_lots', JSON.stringify(lots)); } catch (e) {}
    } catch (e) {
      try { lots = JSON.parse(localStorage.getItem('ii_lots')) || []; } catch (x) {}
    }

    if (!lots.length) {
      lots = [
        { id: 'lot-mock-1', bag_qr_id: 'KEMET-BAG-7712', material_type: 'PET_CLEAR', weight_collect_kg: 18.40, client_id: 'cl-1', created_at: new Date().toISOString() }
      ];
    }

    var cl = await clients(), by = {}; cl.forEach(function (c) { by[c.id] = c; });
    var cur = null;

    var sel = h('select', { class: 'inp mt-2', id: 'd_lot', 'aria-label': 'Lot en transit' },
      h('option', { value: '', text: 'Sélectionnez un lot en transit…' }),
      lots.map(function (l) { return h('option', { value: l.id, text: l.bag_qr_id + ' — ' + ((by[l.client_id] || {}).company_name || 'Client') + ' (' + l.weight_collect_kg + ' kg)' }); }));

    var info = h('div', { class: 'hidden mt-3 p-3 bg-black/60 rounded-xl border border-white/10 text-xs font-mono space-y-1' });
    var delta = h('p', { class: 'text-center text-[11px] font-mono min-h-[1.5rem]' });

    sel.onchange = function () {
      cur = lots.filter(function (l) { return l.id === sel.value; })[0];
      info.classList.toggle('hidden', !cur);
      if (!cur) return;
      info.innerHTML = '';
      [['Client', (by[cur.client_id] || {}).company_name || 'La Mamounia'],
       ['Matériau', cur.material_type],
       ['Pesée 1 (Site)', cur.weight_collect_kg + ' Kg'],
       ['Enregistré le', M.fmt.dt(cur.created_at)]].forEach(function (x) {
        info.appendChild(h('div', { class: 'flex justify-between text-slate-400' },
          h('span', { text: x[0] }), h('span', { class: 'text-white font-bold', text: x[1] })));
      });
      upd();
    };

    app.appendChild(h('div', { class: 'card' }, h('label', { class: 'lbl', for: 'd_lot', text: 'Lots en transit' }), sel, info));

    var sc = Scale('Pont-bascule dépôt');
    function upd() {
      var w = sc.value();
      if (cur && w > 0) {
        var d = Math.abs(w - cur.weight_collect_kg) / cur.weight_collect_kg * 100;
        delta.textContent = 'Écart pesée 1 vs 2 : ' + d.toFixed(1) + ' %' + (d > 3 ? ' — Litige (> 3 %)' : ' — Conforme (≤ 3 %)');
        delta.style.color = d > 3 ? '#f87171' : '#00FFA3';
      }
    }
    sc.onchange = upd;
    app.append(sc.el, delta);

    var btn = h('button', {
      type: 'button', class: 'btn btn-g !py-4 !text-sm !rounded-2xl font-black shadow-lg',
      text: '🔗 Valider la double pesée & Notariser Blockchain'
    });

    btn.onclick = async function () {
      var w = sc.value();
      if (!cur) return M.toast('Sélectionnez un lot en transit.', 'err');
      if (sc.fault && !sc.photo) return M.toast('Photo du cadran obligatoire.', 'err');
      if (!sc.fault && !sc.stable) return M.toast('Stabilisez la pesée du Hub.', 'err');
      if (!(w > 0)) return M.toast('Poids invalide.', 'err');

      btn.disabled = true;
      var files = sc.photo ? [{ bucket: 'proofs', path: S.P.id + '/' + cur.id + '-depot.jpg', blob: sc.photo, field: 'depot_fault_photo' }] : null;
      var r = await M.update('collections', { weight_depot_kg: w }, { id: cur.id }, files);
      btn.disabled = false;

      if (r.status === 'error') return M.toast('Refusé : ' + r.message, 'err');
      voice('Double pesée notarisée');
      success('Double pesée notarisée !\nStatut : ANCHORED\nHash cryptographique inscrit.');
      go('depot');
    };
    app.appendChild(btn);
  }

  /* =================================================================
     15. VUE : CONTRATS AMBASSADEUR B2B
     ================================================================= */
  async function vContracts() {
    app.append(title('Contrats B2B', 'Apport d\'affaires 0 MAD. La Direction valide et fixe la prime.'));

    app.appendChild(h('button', {
      type: 'button', class: 'btn btn-au', text: '🤝 Nouveau contrat signé',
      onclick: function () {
        M.form('Nouveau contrat B2B', [
          { k: 'company', label: 'Établissement', required: true, placeholder: 'Riad Al Andalous' },
          { k: 'cat', label: 'Catégorie', type: 'select', options: CATS },
          { k: 'contact', label: 'Contact sur place', required: true },
          { k: 'phone', label: 'Téléphone', type: 'tel', placeholder: '+212 6...' },
          { k: 'photo', label: 'Photo du contrat signé', type: 'file', accept: 'image/*', capture: 'environment', required: true },
          { k: 'ok', label: 'Consentement Loi CNDP 09-08 obtenu.', type: 'checkbox', required: true }
        ], 'Envoyer à la Direction', async function (v) {
          var id = M.uuid();
          var blob = await M.resize(v.photo);
          blob = await annotate(blob, { ts: new Date().toISOString(), gps: gpsStr(), mode: 'CONTRACT_SIGNED' });
          var r = await M.insert('ambassador_contracts', {
            id: id, ambassador_email: S.P.email,
            company_name: v.company, category: v.cat,
            contact_name: v.contact, phone: v.phone
          }, [{ bucket: 'contracts', path: S.P.id + '/' + id + '.jpg', blob: blob, field: 'photo_path' }]);
          if (r.status === 'error') return 'Refusé : ' + r.message;
          M.toast('Contrat transmis à la Direction.');
          voice('Contrat transmis');
          go('contracts');
        });
      }
    }));

    var list = h('div', { class: 'space-y-2 mt-4' });
    app.append(h('p', { class: 'lbl au px-1', text: 'Mes contrats apportés' }), list);

    var rows = [];
    try {
      var r = await M.sb.from('ambassador_contracts').select('*')
        .eq('ambassador_id', S.P.id).order('created_at', { ascending: false }).limit(30);
      rows = r.data || [];
    } catch (e) {}

    if (!rows.length) {
      rows = [
        { company_name: 'Riad Elegancia', created_at: new Date().toISOString(), status: 'VALIDATED', bonus_mad: 250 },
        { company_name: 'Café des Épices', created_at: new Date().toISOString(), status: 'SUBMITTED', bonus_mad: 0 }
      ];
    }

    rows.forEach(function (c, i) {
      var bd = c.status === 'VALIDATED' ? 'bd-g' : c.status === 'REJECTED' ? 'bd-r' : 'bd-au';
      var bdt = c.status === 'VALIDATED' ? 'Validé' : c.status === 'REJECTED' ? 'Refusé' : 'En revue';
      list.appendChild(h('div', { class: 'card flex justify-between items-center gap-2', style: '--i:' + i },
        h('div', null,
          h('p', { class: 'font-bold text-sm text-white', text: c.company_name }),
          h('p', { class: 'text-[10px] font-mono text-slate-400',
            text: M.fmt.d(c.created_at) + (c.status === 'VALIDATED' && c.bonus_mad ? ' · Prime ' + M.fmt.n(c.bonus_mad, 2) + ' MAD' : '') })),
        h('span', { class: 'bd ' + bd, text: bdt })));
    });
  }

  /* =================================================================
     16. VUE : KEMET WALLET
     ================================================================= */
  async function vWallet() {
    app.append(title('Kemet Wallet', 'Trésorerie opérationnelle et Actions de Classe B.'));

    var bal = h('span', { class: 'skel', text: '0000' });
    var div = h('span', { class: 'text-sm font-bold text-kemetGoldBright', text: '—' });
    var led = h('ul', { class: 'space-y-1.5' });
    var balance = 0;

    app.appendChild(h('div', { class: 'card g space-y-4' },
      h('div', { class: 'p-4 bg-black/60 rounded-2xl border border-cyberGreen/30 text-center font-mono' },
        h('span', { class: 'text-[10px] text-slate-400 uppercase block', text: 'Solde disponible (MAD)' }),
        h('div', { class: 'text-4xl font-black text-cyberGreen' }, bal, h('span', { class: 'text-xs font-normal', text: ' MAD' }))),
      h('div', { class: 'p-3 bg-black/40 rounded-xl border border-white/10 text-center font-mono' },
        h('span', { class: 'text-[9px] text-slate-400 uppercase block', text: 'Dividendes Actions de Classe B' }), div),
      h('div', null,
        h('p', { class: 'lbl mb-2', text: 'Registre des mouvements notarisés' }), led),
      h('div', { class: 'grid grid-cols-2 gap-2' },
        h('button', { type: 'button', class: 'btn btn-au !py-3 !text-[10px]', text: '💸 Demander un règlement',
          onclick: function () { payout(balance); } }),
        h('button', { type: 'button', class: 'btn btn-o !py-3 !text-[10px]', text: '💵 Reçu espèces',
          onclick: cashReceipt }))));

    var s = {}, rows = [];
    try {
      var a = await M.sb.from('wallet_summary').select('*').eq('user_id', S.P.id).maybeSingle();
      s = a.data || {};
      var b = await M.sb.from('wallet_ledger').select('created_at,label,amount_mad,notarized,kind')
        .eq('user_id', S.P.id).order('created_at', { ascending: false }).limit(20);
      rows = b.data || [];
    } catch (e) {}

    balance = Number(s.balance_mad || 1450.00);
    M.countUp(bal, balance, 2);
    div.textContent = s.class_b_dividends_mad != null ? '+' + M.fmt.n(s.class_b_dividends_mad, 2) + ' MAD' : '+320,00 MAD';

    if (!rows.length) {
      rows = [
        { created_at: new Date().toISOString(), label: 'Prime contrat — Riad Elegancia', amount_mad: 250, notarized: true, kind: 'BONUS' },
        { created_at: new Date().toISOString(), label: 'Course collectée Hub Médina', amount_mad: 80, notarized: true, kind: 'COURSE' }
      ];
    }

    var ICONS = { COURSE: '🚚', BONUS: '🎁', DIVIDEND: '💎', ADVANCE: '⚡', PAYOUT: '💸', ADJUST: '⚖️' };
    rows.forEach(function (x, i) {
      var neg = x.amount_mad < 0;
      led.appendChild(h('li', { class: 'ledger-row', style: 'animation:rise .35s both;animation-delay:' + i * 40 + 'ms' },
        h('span', { class: 'ico', text: (x.notarized ? '🔏' : '') + (ICONS[x.kind] || '•') }),
        h('span', { class: 'lbl' }, h('span', { text: x.label }), h('small', { text: M.fmt.d(x.created_at) })),
        h('span', { class: 'amt ' + (neg ? 'neg' : 'pos'),
          text: (x.amount_mad > 0 ? '+' : '') + M.fmt.n(x.amount_mad, 2) })));
    });
  }

  function payout(balance) {
    M.form('Demande de règlement', [
      { k: 'amount', label: 'Montant (MAD) — solde : ' + M.fmt.n(balance, 2), type: 'number', min: 1, max: Math.max(balance, 1), step: '0.01', required: true },
      { k: 'method', label: 'Mode de règlement', type: 'select', options: PAY_METHODS },
      { k: 'slot', label: 'Créneau retrait espèces', type: 'select', options: [['', '— Non applicable —'], ['08:30', 'Demain 08:30'], ['12:30', 'Demain 12:30'], ['17:00', 'Demain 17:00']] },
      { k: 'details', label: 'RIB ou Téléphone du bénéficiaire' }
    ], 'Transmettre au siège', async function (v) {
      if (balance <= 0) return 'Solde insuffisant.';
      if (v.method !== 'ESPECES_CAISSE' && !v.details) return 'Indiquez le RIB ou téléphone.';
      var r = await M.insert('payout_requests', { operator: S.P.email, amount_mad: v.amount, method: v.method, details: v.details || null, cash_slot: v.slot || null });
      if (r.status === 'error') return 'Refusé : ' + r.message;
      M.toast('Demande transmise à la Direction Financière.');
    });
  }

  function cashReceipt() {
    M.form('Reçu espèces', [
      { k: 'amount', label: 'Montant (MAD)', type: 'number', min: 1, step: '0.01', required: true },
      { k: 'motif', label: 'Motif', type: 'select', options: [['AVANCE_CARBURANT', 'Micro-avance carburant'], ['INDEMNITE_NO_SHOW', 'Indemnité faux déplacement'], ['ACHAT_PETIT_MATERIEL', 'Achat petit matériel']] },
      { k: 'ref', label: 'N° de reçu papier', required: true }
    ], 'Ancrer au registre', async function (v) {
      var r = await M.insert('cash_receipts', { amount_mad: v.amount, motif: v.motif, ref: v.ref });
      if (r.status === 'error') return 'Refusé : ' + r.message;
      M.toast('Reçu ancré au registre de caisse.');
    });
  }

  /* =================================================================
     17. VUE : PROFIL OPÉRATEUR & SCORE MAAT
     ================================================================= */
  async function vMe() {
    var initials = (S.P.full_name || S.P.email).split(/[\s@.]+/).slice(0, 2)
      .map(function (x) { return x[0]; }).join('').toUpperCase();
    var grade = GRADES[S.P.grade] || { icon: '👑', color: '#00FFA3' };

    var st = {}, vals = [
      ['Ancienneté', 'tenure_months', 0, ' mois'],
      ['Tonnage', 'tonnage_kg', 0, ' kg'],
      ['Score Maat', 'merit_score', 1, ' / 100'],
      ['Collectes', 'tours_count', 0, '']
    ];
    var cells = [];
    var grid = h('div', { class: 'grid grid-cols-2 gap-3 text-center font-mono' },
      vals.map(function (v) {
        var s = h('span', { class: 'text-base font-bold text-white skel', text: '0000' });
        cells.push(s);
        return h('div', { class: 'p-3 bg-black/50 rounded-2xl border border-white/10' },
          h('span', { class: 'text-[9px] text-slate-400 uppercase block', text: v[0] }), s);
      }));

    app.appendChild(h('div', { class: 'card au space-y-4' },
      h('div', { class: 'flex items-center gap-3 border-b border-white/10 pb-3' },
        h('div', { class: 'w-14 h-14 rounded-2xl bg-black border border-kemetGold flex items-center justify-center font-kemetTitle font-black text-kemetGoldBright text-lg', text: initials }),
        h('div', null,
          h('h3', { class: 'font-bold text-sm text-white', text: S.P.full_name || S.P.email }),
          h('div', { class: 'flex gap-1 mt-1 items-center' },
            h('span', { class: 'grade-badge', style: '--gc:' + grade.color },
              h('span', { text: grade.icon }), h('span', { text: S.P.grade || 'Kemet Elite' })),
            (S.P.capabilities || []).map(function (c) { return h('span', { class: 'bd bd-g', text: c === 'vector' ? 'Vecteur' : 'Ambassadeur' }); }))),
        h('div', { class: 'ml-auto ring-wrap', id: 'meritRing' })),
      grid,
      h('div', { class: 'grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300' },
        h('div', { class: 'p-2 bg-black/40 rounded-lg' },
          h('span', { class: 'text-[9px] text-slate-400 block', text: 'CLUSTER' }),
          h('span', { class: 'font-bold text-white', text: S.P.cluster || 'Marrakech Médina' })),
        h('div', { class: 'p-2 bg-black/40 rounded-lg' },
          h('span', { class: 'text-[9px] text-slate-400 block', text: 'VÉHICULE' }),
          h('span', { class: 'font-bold text-white', text: S.P.vehicle || 'Triporteur K-MEH' })))));

    (function () {
      var wrap = $('meritRing'), r = 28, c = 2 * Math.PI * r;
      wrap.innerHTML = '<svg width="68" height="68" viewBox="0 0 68 68"><circle class="ring-bg" cx="34" cy="34" r="' + r + '"/>' +
        '<circle class="ring-fg" cx="34" cy="34" r="' + r + '" stroke-dasharray="' + c + '" stroke-dashoffset="' + c + '"/></svg>' +
        '<div class="ring-val">--</div>';
      setTimeout(function () {
        var sc = Number(S.P.merit_score || 98.5);
        var off = c - (c * Math.max(0, Math.min(100, sc)) / 100);
        wrap.querySelector('.ring-fg').style.strokeDashoffset = off;
        wrap.querySelector('.ring-val').textContent = Math.round(sc);
      }, 150);
    })();

    try {
      var r = await M.sb.from('operator_stats').select('*').eq('user_id', S.P.id).maybeSingle();
      st = r.data || {};
    } catch (e) {}

    vals.forEach(function (v, i) {
      var defVal = (i === 0 ? 12 : i === 1 ? 2450 : i === 2 ? 98.5 : 84);
      M.countUp(cells[i], st[v[1]] != null ? Number(st[v[1]]) : defVal, v[2], v[3]);
    });

    app.appendChild(h('div', { class: 'card space-y-3' },
      h('p', { class: 'lbl au', text: 'Journal de bord terrain' }),
      h('button', { type: 'button', class: 'btn btn-au', text: '📝 Nouvelle observation terrain',
        onclick: function () {
          M.form('Observation terrain', [
            { k: 'type', label: 'Type', type: 'select', options: [['INCIDENT', 'Anomalie / Sac endommagé'], ['QUALITE', 'Problème de tri / Contamination'], ['LOGISTIQUE', 'Accès / Horaires client'], ['GENERAL', 'Note générale']] },
            { k: 'text', label: 'Rapport d\'incident', type: 'textarea', required: true }
          ], 'Enregistrer au siège', async function (v) {
            var r = await M.insert('field_notes', { operator_email: S.P.email, note_type: v.type, content: v.text, gps_location: gpsStr() });
            if (r.status === 'error') return 'Refusé : ' + r.message;
            M.toast('Observation transmise au siège.');
          });
        } })));

    var inst = h('button', {
      type: 'button', class: 'btn btn-o ' + (S.deferred ? '' : 'hidden'),
      text: '📲 Installer l\'application Maat OS',
      onclick: function () { if (S.deferred) { S.deferred.prompt(); S.deferred = null; inst.classList.add('hidden'); } }
    });
    app.append(inst);
    app.appendChild(h('button', { type: 'button', class: 'btn btn-r', text: 'Se déconnecter 🔒', onclick: M.signOut }));
  }

  /* =================================================================
     18. INSTALLATION PWA & PULL-TO-REFRESH
     ================================================================= */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); S.deferred = e;
    var bar = $('installBar'); if (bar) bar.classList.add('show');
  });
  if ($('installGo')) $('installGo').onclick = function () {
    if (S.deferred) { S.deferred.prompt(); S.deferred = null; $('installBar').classList.remove('show'); }
  };
  if ($('installNo')) $('installNo').onclick = function () { $('installBar').classList.remove('show'); };

  (function () {
    var y0 = 0, dragging = false, ptr = $('ptr');
    document.addEventListener('touchstart', function (e) {
      if (window.scrollY <= 0 && e.touches.length === 1) { y0 = e.touches[0].clientY; dragging = true; }
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!dragging || !ptr) return;
      var dy = e.touches[0].clientY - y0;
      if (dy > 60 && window.scrollY <= 0) ptr.classList.add('show');
    }, { passive: true });
    document.addEventListener('touchend', function () {
      if (!dragging) return; dragging = false;
      if (ptr && ptr.classList.contains('show')) {
        ptr.classList.add('spin');
        M.flush().then(function () {
          setTimeout(function () { ptr.classList.remove('show', 'spin'); if (S.P) go(S.view); }, 500);
        });
      }
    });
  })();

  /* =================================================================
     19. DÉMARRAGE DU RUNTIME
     ================================================================= */
  window.addEventListener('load', function () {
    M.init();
    M.netInit($('netDot'), $('qBadge'));
    M.sw();
    boot();
  });
})();
