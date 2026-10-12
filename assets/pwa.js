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
  var DEMO = /[?&]demo=1/.test(location.search);
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
     CONSTANTES MÉTIER (alignées BP Phase 1 §3.1.6)
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
     UTILITAIRES
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

  /* =================================================================
     GPS / WakeLock / Caméra
     ================================================================= */
  function startGPS() {
    var c = $('gpsChip'); if (!c) return;
    c.classList.remove('hidden');
    if (!navigator.geolocation) { c.textContent = 'GPS ✕'; return; }
    navigator.geolocation.watchPosition(function (p) {
      S.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      c.textContent = 'GPS ±' + Math.round(S.pos.acc) + ' m';
      c.style.color = S.pos.acc <= 30 ? '#00FFA3' : '#E6CA65';
    }, function () { S.pos = null; c.textContent = 'GPS ✕'; c.style.color = '#f87171'; },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }
  function gpsStr() { return S.pos ? S.pos.lat.toFixed(6) + ', ' + S.pos.lng.toFixed(6) : null; }

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
     BALANCE BLUETOOTH — profil Weight Scale (0x181D / 0x2A9D)
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
      '<p data-r="msg" class="text-[9px] font-mono text-slate-400 uppercase">⚠️ Saisie manuelle bloquée — pesée Bluetooth requise</p>' +
      '<p data-r="st" class="text-[10px] font-mono text-slate-500">Balance non connectée</p>' +
      '<div data-r="fault" class="hidden p-3 bg-red-950/40 border border-red-500/40 rounded-xl space-y-3 text-left">' +
        '<span class="text-[10px] font-mono font-bold text-red-400 uppercase block">Procédure défaillance balance</span>' +
        '<p class="text-[10px] text-slate-300">Photographiez le cadran : la saisie d\'urgence se débloque et la photo est jointe au Data Lake.</p>' +
        '<video data-r="v" class="hidden w-full rounded-xl border border-red-500/40" playsinline muted></video>' +
        '<div class="photo-proof hidden" data-r="proofwrap"><img data-r="img" alt="Photo du cadran"><div class="meta-stamp" data-r="stamp"></div></div>' +
        '<button type="button" data-r="proof" class="btn !bg-red-600 !text-white">📸 Photographier le cadran</button></div>' +
      '<div class="space-y-2"><button type="button" data-r="bt" class="btn btn-o">📶 Connecter la balance Bluetooth</button>' +
        '<button type="button" data-r="fb" class="btn btn-r !py-2 !text-[10px]">⚠️ Déclarer un malfonctionnement</button>' +
        (DEMO ? '<button type="button" data-r="demo" class="btn btn-au !py-2 !text-[10px]">🧪 Simuler (DÉMO — non transmis)</button>' : '') +
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
          r('msg').textContent = '✓ Pesée stabilisée via Bluetooth';
          buzz(60); voice('Pesée stable, ' + w.toFixed(2) + ' kilos');
        } else setW(w);
        s.w = w;
      } else {
        s.stable = false; setW(w, 'settling');
        r('msg').textContent = 'Stabilisation en cours…';
      }
      if (s.onchange) s.onchange(s);
    }

    r('bt').onclick = async function () {
      if (!navigator.bluetooth) return M.toast('Web Bluetooth indisponible : utilisez Chrome sur Android.', 'err');
      try {
        setSt('Recherche de la balance…', '#E6CA65');
        var dev = await navigator.bluetooth.requestDevice({ filters: [{ services: [SVC] }] });
        dev.addEventListener('gattserverdisconnected', function () {
          s.stable = false; s.buf = []; setW(0); setStab(0);
          setSt('Balance déconnectée', '#f87171');
          r('msg').textContent = '⚠️ Reconnectez la balance';
          M.toast('Balance déconnectée.', 'err'); buzz([80, 60, 80]);
        });
        var srv = await dev.gatt.connect();
        var svc = await srv.getPrimaryService(SVC);
        var ch = await svc.getCharacteristic(CHR);
        ch.addEventListener('characteristicvaluechanged', function (e) { reading(parse(e.target.value)); });
        await ch.startNotifications();
        s.fault = false; stopStream();
        r('fault').classList.add('hidden'); r('w').readOnly = true;
        r('mode').textContent = 'Balance Bluetooth'; r('mode').style.color = '#00FFA3';
        setSt('Connectée : ' + (dev.name || 'balance'), '#00FFA3');
        r('msg').textContent = 'Posez le sac sur la balance…';
        setW(0); voice('Balance connectée');
      } catch (e) {
        setSt('Connexion impossible', '#f87171');
        if (e && e.name !== 'NotFoundError') M.toast('Connexion à la balance échouée.', 'err');
      }
    };

    r('fb').onclick = async function () {
      s.fault = true; s.stable = false; s.photo = null;
      r('proofwrap').classList.add('hidden');
      r('fault').classList.remove('hidden');
      r('mode').textContent = 'Secours : photo du cadran'; r('mode').style.color = '#f87171';
      r('msg').textContent = '⚠️ Photographiez le cadran pour débloquer la saisie';
      r('w').readOnly = true; setW(0); setStab(0);
      r('proof').textContent = '📸 Photographier le cadran';
      r('proof').className = 'btn !bg-red-600 !text-white';
      try {
        S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        var v = r('v'); v.srcObject = S.stream; v.classList.remove('hidden'); await v.play();
      } catch (e) { M.toast('Caméra inaccessible : la preuve photo est obligatoire.', 'err'); }
    };

    r('proof').onclick = async function () {
      var v = r('v');
      if (!S.stream || !v.videoWidth) return M.toast('Caméra non prête.', 'err');
      var blob = await M.snap(v);
      var annotated = await annotate(blob, {
        ts: new Date().toISOString(), gps: gpsStr(), mode: 'MANUAL_PHOTO_PROOF'
      });
      s.photo = annotated;
      var u = URL.createObjectURL(annotated);
      r('img').src = u; r('img').alt = 'Preuve cadran';
      r('stamp').textContent = '⏱ ' + new Date().toLocaleString('fr-FR') + (S.pos ? ' · ' + S.pos.lat.toFixed(4) + ', ' + S.pos.lng.toFixed(4) : '');
      r('proofwrap').classList.remove('hidden');
      v.classList.add('hidden'); stopStream();
      r('w').readOnly = false; r('w').value = ''; r('w').focus();
      r('w').className = 'wnum settling';
      r('msg').textContent = '✓ Photo capturée. Saisissez la valeur du cadran.';
      r('proof').textContent = '✓ Photo preuve validée';
      r('proof').className = 'btn btn-g';
      buzz(60);
    };
    r('w').addEventListener('input', function () {
      if (s.fault) { s.w = parseFloat(r('w').value) || 0; if (s.onchange) s.onchange(s); }
    });

    if (DEMO && r('demo')) r('demo').onclick = function () {
      var target = 8 + Math.random() * 37, n = 0;
      var i = setInterval(function () { reading(target + (n++ < 7 ? (Math.random() - .5) * 2 : 0)); if (n > 16) clearInterval(i); }, 200);
      setSt('DÉMO : balance simulée', '#E6CA65');
    };

    s.el = el;
    s.value = function () { return s.fault ? parseFloat(r('w').value) : s.w; };
    s.reset = function () {
      s.stable = false; s.w = 0; s.fault = false; s.photo = null; s.buf = []; stopStream();
      r('fault').classList.add('hidden'); r('proofwrap').classList.add('hidden');
      r('w').readOnly = true; setW(0); setStab(0);
      r('msg').textContent = '⚠️ Saisie manuelle bloquée — pesée Bluetooth requise';
      r('mode').textContent = 'Balance Bluetooth'; r('mode').style.color = '#00FFA3';
    };
    return s;
  }

  /* =================================================================
     ANNOTATION PHOTO (timestamp + GPS brûlés dans l'image)
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
        g.fillStyle = 'rgba(0,0,0,0.72)';
        g.fillRect(0, c.height - bh, c.width, bh);
        g.fillStyle = '#00FFA3';
        g.font = 'bold ' + Math.round(bh * 0.34) + 'px "JetBrains Mono", monospace';
        g.fillText('MAAT OS · ' + meta.ts.replace('T', ' ').slice(0, 19), 10, c.height - bh * 0.52);
        g.fillStyle = '#E6CA65';
        g.font = Math.round(bh * 0.28) + 'px "JetBrains Mono", monospace';
        g.fillText(meta.gps ? 'GPS ' + meta.gps : 'GPS indisponible', 10, c.height - bh * 0.14);
        c.toBlob(res, 'image/jpeg', 0.72);
      };
      img.onerror = function () { res(blob); };
      img.src = URL.createObjectURL(blob);
    });
  }

  /* =================================================================
     SCANNER QR
     ================================================================= */
  function scanStop() {
    var done = function () { var b = document.getElementById('reader'); if (b) b.parentElement.classList.add('hidden'); };
    if (S.scanner) S.scanner.stop().then(done).catch(done); else done();
  }
  function scanStart(box, onHit) {
    if (!window.Html5Qrcode) return M.toast('Scanner indisponible hors-ligne : rechargez une page en ligne une fois.', 'err');
    box.classList.remove('hidden');
    if (!S.scanner) S.scanner = new Html5Qrcode('reader');
    S.scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } },
      function (t) {
        if (bags[t]) { M.toast('Ce sac a déjà été pesé pendant cette session.', 'warn'); buzz([60, 40, 60]); return; }
        onHit(t); buzz(50); voice('Sac scanné'); scanStop();
      }, function () {}).catch(function () { scanStop(); M.toast('Caméra inaccessible.', 'err'); });
  }

  /* =================================================================
     AUTHENTIFICATION
     ================================================================= */
  function msgBox() { return h('p', { class: 'text-[11px] text-center font-mono font-bold min-h-[1rem]', role: 'alert' }); }

  function showAuth() {
    bn.classList.add('hidden'); app.innerHTML = '';
    var card = h('section', { class: 'card g relative overflow-hidden space-y-4 !p-6' }), out = msgBox();
    var say = function (t, ok) { out.textContent = t; out.style.color = ok ? '#00FFA3' : '#f87171'; };
    card.innerHTML =
      '<div class="beam"></div>' +
      '<div class="text-center space-y-1">' +
        '<div class="w-12 h-12 mx-auto rounded-2xl bg-cyberGreen/10 border border-cyberGreen/30 flex items-center justify-center text-xl">📱</div>' +
        '<h2 class="font-mono font-bold text-white uppercase tracking-wider text-sm">Accès workstation</h2>' +
        '<p class="text-[11px] text-slate-400">Authentification sécurisée Maat OS.</p></div>' +
      '<div class="grid grid-cols-2 font-mono text-xs text-center gap-1">' +
        '<button type="button" class="tab on" data-t="otp">Agent (code email)</button>' +
        '<button type="button" class="tab" data-t="pw">Direction (DG)</button></div>' +
      '<div data-f="otp" class="space-y-3 font-mono">' +
        '<div><label class="lbl" for="a_em">Email opérateur *</label>' +
        '<input id="a_em" type="email" autocomplete="username" class="inp mt-1" placeholder="agent@industrialillusion.ma"></div>' +
        '<label class="flex items-start gap-2 text-[10px] text-slate-300"><input type="checkbox" id="a_ok" class="mt-0.5">' +
        '<span>J\'accepte la charte de confidentialité conforme à la <strong class="text-cyberGreen">Loi CNDP n° 09-08</strong>.</span></label>' +
        '<button type="button" data-a="send" class="btn btn-o">Recevoir un code par email 📩</button>' +
        '<div data-r="otp" class="hidden space-y-2 pt-2 border-t border-white/10">' +
          '<input id="a_code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" class="inp text-center !text-lg font-bold !border-kemetGold/60 text-kemetGoldBright" placeholder="Code reçu">' +
          '<button type="button" data-a="verify" class="btn btn-au">Valider &amp; entrer 🔓</button></div></div>' +
      '<div data-f="pw" class="hidden space-y-3 font-mono">' +
        '<div><label class="lbl" for="p_em">Email *</label><input id="p_em" type="email" autocomplete="username" class="inp mt-1"></div>' +
        '<div><label class="lbl" for="p_pw">Mot de passe *</label><input id="p_pw" type="password" autocomplete="current-password" class="inp mt-1"></div>' +
        '<button type="button" data-a="pw" class="btn btn-g">👑 Connexion Direction</button></div>';
    card.appendChild(out); app.appendChild(card);
    var q = function (s) { return card.querySelector(s); };
    card.querySelectorAll('[data-t]').forEach(function (b) {
      b.onclick = function () {
        var otp = b.dataset.t === 'otp';
        q('[data-f="otp"]').classList.toggle('hidden', !otp);
        q('[data-f="pw"]').classList.toggle('hidden', otp);
        card.querySelectorAll('[data-t]').forEach(function (x) { x.classList.toggle('on', x === b); });
        say('');
      };
    });
    q('[data-a="send"]').onclick = async function () {
      var em = $('a_em').value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return say('Saisissez une adresse email valide.');
      if (!$('a_ok').checked) return say('Acceptez la charte de confidentialité CNDP.');
      if (!M.sb) return say('Service indisponible : connexion réseau requise.');
      var r = await M.sb.auth.signInWithOtp({ email: em, options: { shouldCreateUser: false } });
      if (r.error) return say('Envoi impossible : compte inconnu ou non habilité.');
      q('[data-r="otp"]').classList.remove('hidden'); $('a_code').focus();
      say('Code envoyé. Vérifiez votre boîte mail.', true);
      voice('Code envoyé par email');
    };
    q('[data-a="verify"]').onclick = async function () {
      var r = await M.sb.auth.verifyOtp({ email: $('a_em').value.trim().toLowerCase(), token: $('a_code').value.trim(), type: 'email' });
      if (r.error) return say('Code invalide ou expiré.');
      boot();
    };
    q('[data-a="pw"]').onclick = async function () {
      if (!M.sb) return say('Service indisponible.');
      var r = await M.sb.auth.signInWithPassword({ email: $('p_em').value.trim().toLowerCase(), password: $('p_pw').value });
      if (r.error) return say('Identifiants incorrects.');
      boot();
    };
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

  async function boot() {
    var p = await M.profile(); if (!p) return showAuth();
    S.P = p;
    if (p.role === 'admin' && p.status === 'ACTIVE') return location.replace('admin.html');
    if (p.role === 'client') return gate('Espace client',
      'Votre espace ESG se trouve sur le portail client.', ['dashboard.html', 'Ouvrir l\'Espace ESG']);
    if (p.role !== 'operator') return gate('Accès non autorisé', 'Ce compte n\'est pas un compte opérateur.');
    if (p.status !== 'ACTIVE') return gate('En attente d\'habilitation',
      'Votre email est vérifié. La Direction doit encore valider votre compte et vous attribuer une modalité.');
    var caps = p.capabilities || [];
    if (!caps.length) return gate('Aucune modalité attribuée',
      'Votre compte est actif, mais la Direction ne vous a pas encore attribué de rôle.');
    var saved = null; try { saved = localStorage.getItem('ii_mode'); } catch (e) {}
    S.mode = caps.indexOf(saved) >= 0 ? saved : (caps.indexOf('vector') >= 0 ? 'vector' : 'ambassador');
    $('opInfo').textContent = (p.full_name || p.email);
    startGPS(); keepAwake(); M.flush(); realtime(); enter();
  }

  /* =================================================================
     NAVIGATION
     ================================================================= */
  function enter() {
    var caps = S.P.capabilities || [], b = $('modeBtn');
    if (caps.length > 1) {
      b.classList.remove('hidden');
      b.textContent = (S.mode === 'vector' ? '🚚 Vecteur' : '🤝 Ambassadeur') + ' ⇄';
      b.onclick = function () {
        S.mode = S.mode === 'vector' ? 'ambassador' : 'vector';
        try { localStorage.setItem('ii_mode', S.mode); } catch (e) {}
        enter(); M.toast('Modalité : ' + (S.mode === 'vector' ? 'Vecteur logistique' : 'Ambassadeur B2B'));
      };
    }
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
     REALTIME
     ================================================================= */
  function realtime() {
    if (!M.sb) return;
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
     CLIENTS — cache local
     ================================================================= */
  async function clients() {
    try {
      if (M.sb && navigator.onLine) {
        var r = await M.sb.from('clients').select('id,company_name,horeca_category,address,city,cluster')
          .eq('status', 'ACTIVE').order('company_name');
        if (!r.error) { try { localStorage.setItem('ii_clients', JSON.stringify(r.data)); } catch (e) {} return r.data; }
      }
    } catch (e) {}
    try { return JSON.parse(localStorage.getItem('ii_clients')) || []; } catch (e) { return []; }
  }

  /* =================================================================
     VUE : TOURNÉE
     ================================================================= */
  async function vTour() {
    app.append(title('Ma tournée', 'Vos ritiri programmés par la Direction.'));
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
      var r = await M.sb.from('pickups').select('*').eq('vector_id', S.P.id)
        .in('status', ['PLANNED', 'ASSIGNED', 'IN_PROGRESS'])
        .gte('scheduled_at', from.toISOString()).order('scheduled_at').limit(50);
      rows = r.data || [];
      try { localStorage.setItem('ii_tour', JSON.stringify(rows)); } catch (e) {}
    } catch (e) { try { rows = JSON.parse(localStorage.getItem('ii_tour')) || []; } catch (x) {} }

    $('kPickups').textContent = String(rows.length);
    try {
      var r2 = await M.sb.from('collections').select('weight_collect_kg, status')
        .eq('operator_id', S.P.id).gte('created_at', new Date().toISOString().slice(0, 10));
      var kg = 0, dn = 0;
      (r2.data || []).forEach(function (c) { kg += Number(c.weight_collect_kg || 0); if (c.status !== 'IN_TRANSIT') dn++; });
      $('kTonnage').textContent = kg.toFixed(0);
      $('kDone').textContent = String(dn);
    } catch (e) {}

    list.innerHTML = '';
    if (!rows.length) {
      list.appendChild(h('div', { class: 'empty-state' },
        h('div', { class: 'ico', text: '🗓️' }),
        h('p', { text: 'Aucun ritiro assigné pour le moment.' })));
    }

    var groups = {};
    rows.forEach(function (p) {
      var c = by[p.client_id] || {}, z = c.cluster || c.city || 'Zone non définie';
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
          var r = await M.update('pickups', { status: 'IN_PROGRESS' }, { id: p.id });
          if (r.status === 'error') return M.toast(r.message, 'err');
          voice('Ritiro démarré'); go('collect');
        }
      });
    }
    return h('article', { class: 'card space-y-2', style: '--i:' + i },
      h('div', { class: 'flex justify-between items-start gap-2' },
        h('div', null,
          h('p', { class: 'font-bold text-sm', text: c.company_name || 'Client' }),
          h('p', { class: 'text-[10px] font-mono text-slate-400', text: M.fmt.dt(p.scheduled_at) + ' · fenêtre ' + (p.window_minutes || 60) + ' min' })),
        h('span', { class: 'bd ' + badge, text: badgeTxt })),
      p.materials ? h('p', { class: 'text-[11px] text-slate-300', text: '📦 ' + p.materials }) : null,
      p.notes ? h('p', { class: 'text-[11px] text-kemetGoldBright', text: '📝 ' + p.notes }) : null,
      h('div', { class: 'grid grid-cols-2 gap-2 pt-1' },
        addr ? h('a', { class: 'btn btn-o text-center !py-2 !text-[10px]', target: '_blank', rel: 'noopener',
          href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr), text: '🧭 Itinéraire' }) : null,
        actionBtn));
  }

  /* =================================================================
     VUE : COLLECTE
     ================================================================= */
  async function vCollect() {
    app.append(title('Collecte', 'Étape 1 — première pesée sur site.'));

    var cl = await clients();
    var sel = h('select', { class: 'inp mt-2', id: 'c_client', 'aria-label': 'Client' },
      h('option', { value: '', text: cl.length ? 'Sélectionnez un établissement' : 'Aucun client disponible' }),
      cl.map(function (c) { return h('option', { value: c.id, text: c.company_name + ' [' + (c.horeca_category || 'B2B') + ']' }); }));
    sel.value = ctx.client || '';
    sel.onchange = function () { ctx.client = sel.value; };
    app.appendChild(h('div', { class: 'card' },
      h('label', { class: 'lbl', for: 'c_client', text: '1. Établissement client' }), sel));

    var qr = h('input', { class: 'inp font-mono mt-3', readonly: true,
      placeholder: 'Scannez le QR du sac (saisie bloquée)',
      'aria-label': 'Identifiant du sac', value: ctx.qr });
    var box = h('div', { class: 'hidden mt-3 bg-black rounded-2xl p-2 border border-cyberGreen/50 text-center relative overflow-hidden' },
      h('div', { class: 'beam' }),
      h('div', { id: 'reader', class: 'w-full rounded-xl overflow-hidden' }),
      h('button', { type: 'button', class: 'text-[10px] font-mono text-red-400 font-bold py-2', text: 'Fermer la caméra', onclick: scanStop }));

    var matGrid = h('div', { class: 'grid grid-cols-2 gap-2 mt-3' });
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
        h('span', { class: 'lbl', text: '2. Sac & matériau' }),
        h('button', { type: 'button', class: 'text-[10px] font-mono bg-cyberGreen/15 text-cyberGreen border border-cyberGreen/40 px-2.5 py-1 rounded-lg',
          text: '📷 Scanner le QR',
          onclick: function () { scanStart(box, function (t) { qr.value = t; ctx.qr = t; }); } })),
      box, qr, matGrid));

    var sc = Scale('Site client');
    app.appendChild(sc.el);

    var go1 = h('button', { type: 'button', class: 'btn btn-au !py-4 !text-sm !rounded-2xl',
      text: '🚚 Enregistrer la pesée 1 — mettre en transit' });
    go1.onclick = async function () {
      var w = sc.value();
      if (!ctx.client) return M.toast('Sélectionnez un client.', 'err');
      if (!qr.value) return M.toast('Scannez le QR du sac.', 'err');
      if (!ctx.mat) return M.toast('Sélectionnez le matériau.', 'err');
      if (sc.fault && !sc.photo) return M.toast('La photo du cadran est obligatoire.', 'err');
      if (!sc.fault && !sc.stable) return M.toast('Attendez la stabilisation de la pesée.', 'err');
      if (!(w > 0 && w <= 1000)) return M.toast('Poids invalide (0,01 à 1 000 kg).', 'err');
      if (!S.pos && !DEMO) return M.toast('Position GPS requise pour ancrer la pesée.', 'err');
      if (bags[qr.value]) return M.toast('Ce sac a déjà été pesé pendant cette session.', 'warn');

      go1.disabled = true;
      var id = M.uuid();
      var row = {
        client_uuid: id, pickup_id: ctx.pickup, client_id: ctx.client,
        bag_qr_id: qr.value, material_type: ctx.mat,
        weight_collect_kg: w, status: 'IN_TRANSIT',
        weighing_method: sc.fault ? 'PHOTO_PROOF' : 'BLUETOOTH_IOT',
        gps_location: gpsStr(), gps_accuracy_m: S.pos ? Math.round(S.pos.acc) : null,
        device_time: new Date().toISOString(), operator_email: S.P.email
      };
      row.payload_hash = await hashRow(row);

      if (DEMO) { success('DÉMO — non transmis'); go1.disabled = false; return; }
      var files = sc.photo ? [{ bucket: 'proofs', path: S.P.id + '/' + id + '.jpg', blob: sc.photo, field: 'scale_fault_photo' }] : null;
      var r = await M.insert('collections', row, files);
      go1.disabled = false;
      if (r.status === 'error') return M.toast('Refusé : ' + r.message, 'err');
      bags[qr.value] = 1;
      ctx.qr = ''; ctx.mat = '';
      voice('Pesée enregistrée, lot en transit');
      success(r.status === 'sent' ? 'Pesée 1 enregistrée — lot en transit' : 'Enregistrée — synchro auto au retour du réseau');
      go('collect');
    };
    app.appendChild(go1);
  }

  /* =================================================================
     VUE : DÉPÔT
     ================================================================= */
  async function vDepot() {
    app.append(title('Dépôt Hub', 'Étape 2 — pesée de contrôle et ancrage cryptographique.'));

    var lots = [];
    try {
      var r = await M.sb.from('collections')
        .select('id,bag_qr_id,material_type,weight_collect_kg,client_id,created_at')
        .eq('status', 'IN_TRANSIT').order('created_at');
      lots = r.data || [];
      try { localStorage.setItem('ii_lots', JSON.stringify(lots)); } catch (e) {}
    } catch (e) { try { lots = JSON.parse(localStorage.getItem('ii_lots')) || []; } catch (x) {} }

    var cl = await clients(), by = {}; cl.forEach(function (c) { by[c.id] = c; });
    var cur = null;

    var sel = h('select', { class: 'inp mt-2', id: 'd_lot', 'aria-label': 'Lot en transit' },
      h('option', { value: '', text: lots.length ? 'Sélectionnez un lot en transit…' : 'Aucun lot en transit' }),
      lots.map(function (l) { return h('option', { value: l.id, text: l.bag_qr_id + ' — ' + ((by[l.client_id] || {}).company_name || 'Client') + ' (' + l.weight_collect_kg + ' kg)' }); }));

    var info = h('div', { class: 'hidden mt-3 p-3 bg-black/60 rounded-xl border border-white/10 text-xs font-mono space-y-1' });
    var delta = h('p', { class: 'text-center text-[11px] font-mono min-h-[1rem]' });

    sel.onchange = function () {
      cur = lots.filter(function (l) { return l.id === sel.value; })[0];
      info.classList.toggle('hidden', !cur);
      if (!cur) return;
      info.innerHTML = '';
      [['Client', (by[cur.client_id] || {}).company_name || '—'],
       ['Matériau', cur.material_type],
       ['Pesée 1', cur.weight_collect_kg + ' Kg'],
       ['Enregistré', M.fmt.dt(cur.created_at)]].forEach(function (x) {
        info.appendChild(h('div', { class: 'flex justify-between text-slate-400' },
          h('span', { text: x[0] }), h('span', { class: 'text-white font-bold', text: x[1] })));
      });
      upd();
    };

    app.appendChild(h('div', { class: 'card' },
      h('label', { class: 'lbl', for: 'd_lot', text: 'Lots en transit' }), sel, info));

    var sc = Scale('Pont-bascule dépôt');
    function upd() {
      var w = sc.value();
      if (cur && w > 0) {
        var d = Math.abs(w - cur.weight_collect_kg) / cur.weight_collect_kg * 100;
        delta.textContent = 'Écart vs pesée 1 : ' + d.toFixed(1) + ' %' + (d > 3 ? ' — litige (> 3 %)' : ' — conforme');
        delta.style.color = d > 3 ? '#E6CA65' : '#00FFA3';
      }
    }
    sc.onchange = upd;
    app.append(sc.el, delta);

    var btn = h('button', { type: 'button', class: 'btn btn-g !py-4 !text-sm !rounded-2xl',
      text: '🔗 Valider la double pesée & ancrer' });
    btn.onclick = async function () {
      var w = sc.value();
      if (!cur) return M.toast('Sélectionnez un lot.', 'err');
      if (sc.fault && !sc.photo) return M.toast('Photo du cadran obligatoire.', 'err');
      if (!sc.fault && !sc.stable) return M.toast('Attendez la stabilisation.', 'err');
      if (!(w > 0)) return M.toast('Poids invalide.', 'err');
      if (DEMO) return success('DÉMO — non transmis');
      btn.disabled = true;
      var files = sc.photo ? [{ bucket: 'proofs', path: S.P.id + '/' + cur.id + '-depot.jpg', blob: sc.photo, field: 'depot_fault_photo' }] : null;
      var r = await M.update('collections', { weight_depot_kg: w }, { id: cur.id }, files);
      btn.disabled = false;
      if (r.status === 'error') return M.toast('Refusé : ' + r.message, 'err');
      var txt = r.status === 'sent' ? 'Double pesée ancrée' : 'Enregistrée — ancrage au retour du réseau';
      if (r.status === 'sent') {
        var c = await M.sb.from('collections').select('status,blockchain_hash').eq('id', cur.id).single();
        if (c.data) txt += ' · ' + c.data.status + (c.data.blockchain_hash ? '\n' + c.data.blockchain_hash.slice(0, 14) + '…' : '');
      }
      voice('Lot ancré au dépôt');
      success(txt);
      go('depot');
    };
    app.appendChild(btn);
  }

  /* =================================================================
     VUE : CONTRATS
     ================================================================= */
  async function vContracts() {
    app.append(title('Contrats B2B', 'Apportez de nouveaux établissements. La Direction valide et fixe la prime.'));

    app.appendChild(h('button', { type: 'button', class: 'btn btn-au', text: '🤝 Nouveau contrat signé',
      onclick: function () {
        M.form('Nouveau contrat B2B', [
          { k: 'company', label: 'Établissement', required: true },
          { k: 'cat', label: 'Catégorie', type: 'select', options: CATS },
          { k: 'contact', label: 'Contact sur place', required: true },
          { k: 'phone', label: 'Téléphone', type: 'tel' },
          { k: 'photo', label: 'Photo du contrat signé', type: 'file', accept: 'image/*', capture: 'environment', required: true },
          { k: 'ok', label: 'Le client a consenti au traitement de ses données (Loi CNDP 09-08).', type: 'checkbox', required: true }
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
          M.toast(r.status === 'sent' ? 'Contrat transmis à la Direction.' : 'Contrat enregistré — envoi au retour du réseau.');
          voice('Contrat transmis');
          go('contracts');
        });
      } }));

    var list = h('div', { class: 'space-y-2' });
    app.append(h('p', { class: 'lbl au px-1', text: 'Mes contrats' }), list);

    var rows = [];
    try {
      var r = await M.sb.from('ambassador_contracts').select('*')
        .eq('ambassador_id', S.P.id).order('created_at', { ascending: false }).limit(30);
      rows = r.data || [];
    } catch (e) {}
    if (!rows.length) list.appendChild(h('div', { class: 'empty-state' },
      h('div', { class: 'ico', text: '🤝' }),
      h('p', { text: 'Aucun contrat soumis.' })));

    rows.forEach(function (c, i) {
      var bd = c.status === 'VALIDATED' ? 'bd-g' : c.status === 'REJECTED' ? 'bd-r' : 'bd-au';
      var bdt = c.status === 'VALIDATED' ? 'Validé' : c.status === 'REJECTED' ? 'Refusé' : 'En revue';
      list.appendChild(h('div', { class: 'card flex justify-between items-center gap-2', style: '--i:' + i },
        h('div', null,
          h('p', { class: 'font-bold text-sm', text: c.company_name }),
          h('p', { class: 'text-[10px] font-mono text-slate-400',
            text: M.fmt.d(c.created_at) + (c.status === 'VALIDATED' && c.bonus_mad ? ' · prime ' + M.fmt.n(c.bonus_mad, 2) + ' MAD' : '') })),
        h('span', { class: 'bd ' + bd, text: bdt })));
    });
  }

  /* =================================================================
     VUE : WALLET
     ================================================================= */
  async function vWallet() {
    app.append(title('Kemet Wallet', 'Trésorerie logistique et Actions de Classe B.'));

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
    balance = Number(s.balance_mad || 0);
    M.countUp(bal, balance, 2);
    div.textContent = s.class_b_dividends_mad != null ? '+' + M.fmt.n(s.class_b_dividends_mad, 2) + ' MAD' : '—';

    if (!rows.length) led.appendChild(h('li', { class: 'text-slate-500 text-xs font-mono', text: 'Aucun mouvement à afficher.' }));
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
      { k: 'slot', label: 'Créneau de retrait (espèces)', type: 'select', options: [['', '— non applicable —'], ['08:30', 'Demain 08:30'], ['12:30', 'Demain 12:30'], ['17:00', 'Demain 17:00']] },
      { k: 'details', label: 'RIB ou téléphone du bénéficiaire (inutile pour les espèces)', placeholder: 'Données strictement nécessaires au paiement' }
    ], 'Transmettre au siège', async function (v) {
      if (balance <= 0) return 'Solde insuffisant.';
      if (v.method !== 'ESPECES_CAISSE' && !v.details) return 'Indiquez le RIB ou le téléphone du bénéficiaire.';
      var r = await M.insert('payout_requests', { operator: S.P.email, amount_mad: v.amount, method: v.method, details: v.details || null, cash_slot: v.slot || null });
      if (r.status === 'error') return 'Refusé : ' + r.message;
      M.toast(r.status === 'sent' ? 'Demande transmise à la Direction Financière.' : 'Demande enregistrée — envoi au retour du réseau.');
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
      M.toast(r.status === 'sent' ? 'Reçu ancré au registre de caisse.' : 'Reçu enregistré — envoi au retour du réseau.');
    });
  }

  /* =================================================================
     VUE : PROFIL
     ================================================================= */
  async function vMe() {
    var initials = (S.P.full_name || S.P.email).split(/[\s@.]+/).slice(0, 2)
      .map(function (x) { return x[0]; }).join('').toUpperCase();
    var grade = GRADES[S.P.grade] || { icon: '·', color: '#94a3b8' };

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
          h('h3', { class: 'font-bold text-sm', text: S.P.full_name || S.P.email }),
          h('div', { class: 'flex gap-1 mt-1 items-center' },
            h('span', { class: 'grade-badge', style: '--gc:' + grade.color },
              h('span', { text: grade.icon }), h('span', { text: S.P.grade || 'Sans échelon' })),
            (S.P.capabilities || []).map(function (c) { return h('span', { class: 'bd bd-g', text: c === 'vector' ? 'Vecteur' : 'Ambassadeur' }); }))),
        h('div', { class: 'ml-auto ring-wrap', id: 'meritRing' })),
      grid,
      h('div', { class: 'grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300' },
        h('div', { class: 'p-2 bg-black/40 rounded-lg' },
          h('span', { class: 'text-[9px] text-slate-400 block', text: 'CLUSTER' }),
          h('span', { class: 'font-bold', text: S.P.cluster || '—' })),
        h('div', { class: 'p-2 bg-black/40 rounded-lg' },
          h('span', { class: 'text-[9px] text-slate-400 block', text: 'VÉHICULE' }),
          h('span', { class: 'font-bold', text: S.P.vehicle || '—' })))));

    (function () {
      var wrap = $('meritRing'), r = 28, c = 2 * Math.PI * r;
      wrap.innerHTML = '<svg width="68" height="68" viewBox="0 0 68 68"><circle class="ring-bg" cx="34" cy="34" r="' + r + '"/>' +
        '<circle class="ring-fg" cx="34" cy="34" r="' + r + '" stroke-dasharray="' + c + '" stroke-dashoffset="' + c + '"/></svg>' +
        '<div class="ring-val">--</div>';
      setTimeout(function () {
        var sc = Number(S.P.merit_score || 0);
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
      M.countUp(cells[i], st[v[1]] != null ? Number(st[v[1]]) : null, v[2], v[3]);
    });

    app.appendChild(h('div', { class: 'card space-y-3' },
      h('p', { class: 'lbl au', text: 'Journal de bord terrain' }),
      h('button', { type: 'button', class: 'btn btn-au', text: '📝 Nouvelle observation',
        onclick: function () {
          M.form('Observation terrain', [
            { k: 'type', label: 'Type', type: 'select', options: [['INCIDENT', 'Anomalie / sac endommagé'], ['QUALITE', 'Problème de tri / contamination'], ['LOGISTIQUE', 'Horaires / accès établissement'], ['GENERAL', 'Note générale']] },
            { k: 'text', label: 'Rapport', type: 'textarea', required: true }
          ], 'Enregistrer au siège', async function (v) {
            var r = await M.insert('field_notes', {
              operator_email: S.P.email, note_type: v.type,
              content: v.text, gps_location: gpsStr()
            });
            if (r.status === 'error') return 'Refusé : ' + r.message;
            M.toast(r.status === 'sent' ? 'Note transmise au siège.' : 'Note enregistrée — envoi au retour du réseau.');
          });
        } })));

    var inst = h('button', {
      type: 'button',
      class: 'btn btn-o ' + (S.deferred ? '' : 'hidden'),
      text: '📲 Installer Maat OS',
      onclick: function () { if (S.deferred) { S.deferred.prompt(); S.deferred = null; inst.classList.add('hidden'); } }
    });
    app.append(inst);
    app.appendChild(h('button', { type: 'button', class: 'btn btn-r', text: 'Se déconnecter 🔒', onclick: M.signOut }));
  }

  /* =================================================================
     INSTALL PROMPT & PULL-TO-REFRESH
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
     DÉMARRAGE
     ================================================================= */
  window.addEventListener('load', function () {
    M.init();
    M.netInit($('netDot'), $('qBadge'));
    M.sw();
    boot();
  });
})();
